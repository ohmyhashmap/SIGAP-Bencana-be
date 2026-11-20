import { config } from '../config.js';
import { query } from '../db/pool.js';
import { INDONESIA_BBOX } from '../lib/geo.js';
import { fetchText } from '../lib/http.js';

const SYNC_DAYS = 5;
const RETENTION_DAYS = 14;
const RETRY_AFTER_FAILURE_MINUTES = 5;
// Confidence VIIRS berupa huruf (low/nominal/high); MODIS sudah berupa angka 0-100.
const VIIRS_CONFIDENCE = { l: 30, n: 60, h: 90 };

/** Ubah CSV NASA FIRMS menjadi baris hotspot. */
export function parseFirmsCsv(csv) {
	const [headerLine, ...lines] = csv.trim().split(/\r?\n/);
	const header = headerLine.split(',');
	const col = (name) => header.indexOf(name);
	const [iLat, iLon, iDate, iTime, iConf, iFrp, iSat] = [
		'latitude',
		'longitude',
		'acq_date',
		'acq_time',
		'confidence',
		'frp',
		'satellite'
	].map(col);
	if (iLat < 0 || iLon < 0 || iDate < 0 || iTime < 0) {
		throw new Error(`Respons FIRMS tidak dikenali: ${headerLine.slice(0, 80)}`);
	}

	return lines
		.map((line) => line.split(','))
		.map((cells) => {
			const time = cells[iTime].padStart(4, '0');
			const rawConfidence = cells[iConf] ?? '';
			return {
				lat: Number(cells[iLat]),
				lon: Number(cells[iLon]),
				confidence: VIIRS_CONFIDENCE[rawConfidence] ?? (Math.round(Number(rawConfidence)) || 0),
				frp: iFrp >= 0 ? Number(cells[iFrp]) || null : null,
				satellite: iSat >= 0 ? cells[iSat] : null,
				detectedAt: new Date(`${cells[iDate]}T${time.slice(0, 2)}:${time.slice(2)}:00Z`)
			};
		})
		.filter((h) => Number.isFinite(h.lat) && Number.isFinite(h.lon) && !isNaN(h.detectedAt));
}

export async function saveHotspots(hotspots) {
	if (hotspots.length === 0) return 0;
	const { rowCount } = await query(
		`INSERT INTO hotspots (lat, lon, confidence, frp, satellite, detected_at)
		 SELECT * FROM unnest($1::float8[], $2::float8[], $3::int2[], $4::real[], $5::text[], $6::timestamptz[])
		 ON CONFLICT DO NOTHING`,
		[
			hotspots.map((h) => h.lat),
			hotspots.map((h) => h.lon),
			hotspots.map((h) => h.confidence),
			hotspots.map((h) => h.frp),
			hotspots.map((h) => h.satellite),
			hotspots.map((h) => h.detectedAt)
		]
	);
	return rowCount;
}

/**
 * Sinkronkan titik panas wilayah Indonesia dari NASA FIRMS ke PostgreSQL,
 * paling sering sekali per `HOTSPOT_SYNC_MINUTES`. Tanpa FIRMS_MAP_KEY, data
 * yang sudah ada di database tetap dipakai.
 */
export async function syncHotspots() {
	if (!config.firmsMapKey) return;

	// Klaim jadwal sinkronisasi secara atomik agar request paralel tidak ikut mengunduh.
	const { rowCount } = await query(
		`INSERT INTO sync_state (key, synced_at) VALUES ('firms', now())
		 ON CONFLICT (key) DO UPDATE SET synced_at = now()
		 WHERE sync_state.synced_at < now() - make_interval(mins => $1)`,
		[config.hotspotSyncMinutes]
	);
	if (rowCount === 0) return;

	try {
		const sources = Array.from(new Set([config.firmsSource, 'VIIRS_NOAA20_NRT', 'MODIS_NRT'])).filter(Boolean);
		let totalInserted = 0;
		for (const source of sources) {
			try {
				const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${config.firmsMapKey}/${source}/${INDONESIA_BBOX.join(',')}/${SYNC_DAYS}`;
				const text = await fetchText(url, 30_000);
				const hotspots = parseFirmsCsv(text);
				if (hotspots.length > 0) {
					totalInserted += await saveHotspots(hotspots);
					break;
				}
			} catch (e) {
				console.warn(`Sinkronisasi FIRMS sumber ${source} gagal:`, e.message);
			}
		}
		await query(
			`DELETE FROM hotspots WHERE detected_at < now() - make_interval(days => $1)`,
			[RETENTION_DAYS]
		);
		console.log(`Sinkronisasi FIRMS: ${totalInserted} titik panas baru.`);
	} catch (error) {
		// Coba lagi lebih cepat dari jadwal normal bila sinkronisasi gagal.
		await query(
			`UPDATE sync_state SET synced_at = now() - make_interval(mins => $1) WHERE key = 'firms'`,
			[Math.max(config.hotspotSyncMinutes - RETRY_AFTER_FAILURE_MINUTES, 0)]
		);
		throw error;
	}
}
