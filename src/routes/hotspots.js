import { Router } from 'express';
import { query } from '../db/pool.js';
import { distanceKm, INDONESIA_BBOX, nearestProvince, PROVINCES } from '../lib/geo.js';
import { HttpError, ok, toNumber } from '../lib/http.js';
import { aqiLevel } from '../services/recommendations.js';
import { syncHotspots } from '../services/firms.js';
import { getAqiForPoints } from '../services/weather.js';

export const hotspotsRouter = Router();

const LOCAL_RADIUS_KM = 330;

async function syncQuietly() {
	try {
		await syncHotspots();
	} catch (error) {
		console.error('Sinkronisasi FIRMS gagal, memakai data database:', error.message);
	}
}

function parseBbox(value) {
	if (value === undefined) return INDONESIA_BBOX;
	const parts = String(value).split(',').map((part) => toNumber(part, -180, 180));
	const [west, south, east, north] = parts;
	if (parts.length !== 4 || parts.includes(null) || west >= east || south >= north) {
		throw new HttpError(400, 'Parameter bbox harus berformat barat,selatan,timur,utara.');
	}
	return parts;
}

hotspotsRouter.get('/hotspots', async (req, res) => {
	const [west, south, east, north] = parseBbox(req.query.bbox);
	const days = Math.round(toNumber(req.query.days ?? 5, 1, 10) ?? 5);
	await syncQuietly();

	// Frontend menyusun timelapse dengan asumsi data urut dari yang terlama.
	const { rows } = await query(
		`SELECT lat, lon, confidence, frp, satellite, detected_at FROM hotspots
		 WHERE lon BETWEEN $1 AND $3 AND lat BETWEEN $2 AND $4
		   AND detected_at >= now() - make_interval(days => $5)
		 ORDER BY detected_at ASC`,
		[west, south, east, north, days]
	);
	ok(res, rows, { meta: { count: rows.length, days, source: 'DATABASE' } });
});

/** Distribusi AQI [baik, sedang, tidak sehat, sangat buruk] dari sampel ibu kota provinsi. */
async function aqiDistribution(points) {
	const distribution = [0, 0, 0, 0];
	try {
		for (const aqi of await getAqiForPoints(points)) distribution[aqiLevel(aqi)]++;
	} catch (error) {
		console.error('Gagal memuat distribusi AQI:', error.message);
	}
	return distribution;
}

hotspotsRouter.get('/stats', async (req, res) => {
	const lat = toNumber(req.query.lat, -90, 90);
	const lon = toNumber(req.query.lon, -180, 180);
	const isLocal = lat !== null && lon !== null;
	await syncQuietly();

	const { rows } = await query(
		`SELECT lat, lon FROM hotspots WHERE detected_at >= now() - interval '7 days'`
	);
	const hotspots = isLocal
		? rows.filter((h) => distanceKm(lat, lon, h.lat, h.lon) <= LOCAL_RADIUS_KM)
		: rows;

	const counts = new Map(PROVINCES.map((p) => [p.name, 0]));
	for (const h of hotspots) {
		const { name } = nearestProvince(h.lat, h.lon);
		counts.set(name, counts.get(name) + 1);
	}

	const provinces = PROVINCES.map((p) => ({
		...p,
		count: counts.get(p.name),
		distance: isLocal ? Math.round(distanceKm(lat, lon, p.lat, p.lon)) : 0
	}));
	// Lokal: 10 provinsi terdekat. Nasional: 10 provinsi dengan titik panas terbanyak.
	const top = provinces
		.sort((a, b) => (isLocal ? a.distance - b.distance : b.count - a.count))
		.slice(0, 10);

	ok(res, {
		isLocal,
		totalHotspots: hotspots.length,
		topProvinces: top.map(({ name, count, distance }) => ({ name, count, distance })),
		aqiDistribution: await aqiDistribution(isLocal ? top : PROVINCES)
	});
});
