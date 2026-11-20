import { Router } from 'express';
import { query } from '../db/pool.js';
import { destination } from '../lib/geo.js';
import { HttpError, ok, toNumber } from '../lib/http.js';
import { PROFILES, recommend } from '../services/recommendations.js';
import { getAirQuality, getSafeWindow, getWeather, getWindForecast } from '../services/weather.js';

export const environmentRouter = Router();

function coordinates(req) {
	const lat = toNumber(req.query.lat, -90, 90);
	const lon = toNumber(req.query.lon, -180, 180);
	if (lat === null || lon === null) throw new HttpError(400, 'Parameter lat dan lon wajib valid.');
	return { lat, lon };
}

function upstreamError(label) {
	return (error) => {
		console.error(`Gagal memuat ${label}:`, error.message);
		throw new HttpError(502, `Layanan ${label} sedang tidak tersedia.`);
	};
}

environmentRouter.get('/environment', async (req, res) => {
	const { lat, lon } = coordinates(req);
	const [weather, aqi] = await Promise.all([
		getWeather(lat, lon).catch(upstreamError('cuaca')),
		getAirQuality(lat, lon).catch(upstreamError('kualitas udara'))
	]);
	ok(res, { weather, aqi, observation_time: new Date().toISOString() }, { source: 'api' });
});

environmentRouter.get('/safe-window', async (req, res) => {
	const { lat, lon } = coordinates(req);
	const window = await getSafeWindow(lat, lon).catch(upstreamError('prakiraan kualitas udara'));
	if (!window) throw new HttpError(404, 'Waktu aman belum dapat dihitung.');
	ok(res, window, { source: 'api' });
});

environmentRouter.get('/recommendations', (req, res) => {
	const aqi = toNumber(req.query.aqi, 0, 1000);
	if (aqi === null) throw new HttpError(400, 'Parameter aqi wajib berupa angka 0-1000.');
	const profile = PROFILES.includes(req.query.profile) ? req.query.profile : 'umum';
	ok(res, { aqi, profile, message: recommend(aqi, profile) });
});

/** Titik panas paling meyakinkan dalam 24 jam terakhir (atau 5 hari bila kosong). */
async function strongestRecentHotspot() {
	const { rows } = await query(
		`SELECT lat, lon FROM hotspots
		 WHERE detected_at >= now() - interval '5 days'
		 ORDER BY (detected_at >= now() - interval '24 hours') DESC, confidence DESC, frp DESC NULLS LAST
		 LIMIT 1`
	);
	return rows[0] ?? null;
}

const TRAJECTORY_HOURS = 24;

environmentRouter.get('/trajectory', async (req, res) => {
	const hasCoords = req.query.lat !== undefined || req.query.lon !== undefined;
	const origin = hasCoords ? coordinates(req) : await strongestRecentHotspot();
	if (!origin) throw new HttpError(404, 'Tidak ada hotspot');

	const forecast = await getWindForecast(origin.lat, origin.lon).catch(
		upstreamError('prakiraan angin')
	);

	// Arah angin meteorologis = arah datangnya angin, sehingga asap bergerak ke arah sebaliknya.
	let point = origin;
	const coordinatesLine = [[origin.lon, origin.lat]];
	for (const hour of forecast.slice(0, TRAJECTORY_HOURS)) {
		point = destination(point.lat, point.lon, (hour.direction + 180) % 360, hour.speed);
		coordinatesLine.push([Number(point.lon.toFixed(4)), Number(point.lat.toFixed(4))]);
	}

	ok(res, {
		origin,
		hours: coordinatesLine.length - 1,
		geojson: {
			type: 'FeatureCollection',
			features: [
				{
					type: 'Feature',
					properties: { name: 'Prediksi lintasan asap', source: 'Open-Meteo' },
					geometry: { type: 'LineString', coordinates: coordinatesLine }
				}
			]
		}
	});
});
