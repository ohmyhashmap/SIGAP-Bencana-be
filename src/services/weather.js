import { config } from '../config.js';
import { cached, fetchJson } from '../lib/http.js';

const AIR_QUALITY_API = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const FORECAST_API = 'https://api.open-meteo.com/v1/forecast';
const TIMEZONE = 'Asia/Jakarta';
const FIFTEEN_MINUTES = 15 * 60 * 1000;

const round = (value, digits = 1) =>
	typeof value === 'number' ? Number(value.toFixed(digits)) : null;
// Kunci cache per ~1 km agar request dari lokasi berdekatan berbagi data.
const coordKey = (lat, lon) => `${lat.toFixed(2)},${lon.toFixed(2)}`;

/** Jam sekarang di WIB dalam format `YYYY-MM-DDTHH`, sama dengan format waktu Open-Meteo. */
function currentJakartaHour() {
	return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 13);
}

export function getWeather(lat, lon) {
	return cached(`weather:${coordKey(lat, lon)}`, FIFTEEN_MINUTES, async () => {
		const params = new URLSearchParams({
			latitude: String(lat),
			longitude: String(lon),
			current:
				'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,surface_pressure',
			timezone: TIMEZONE
		});
		const { current } = await fetchJson(`${FORECAST_API}?${params}`);
		return {
			wind_speed: round(current.wind_speed_10m),
			wind_direction: round(current.wind_direction_10m, 0),
			temperature: round(current.temperature_2m),
			humidity: round(current.relative_humidity_2m),
			pressure: round(current.surface_pressure)
		};
	});
}

async function waqiAirQuality(lat, lon) {
	const json = await fetchJson(
		`https://api.waqi.info/feed/geo:${lat};${lon}/?token=${config.waqiToken}`
	);
	if (json.status !== 'ok' || typeof json.data?.aqi !== 'number') {
		throw new Error('Data WAQI tidak tersedia');
	}
	return {
		aqi: json.data.aqi,
		pm25: json.data.iaqi?.pm25?.v ?? null,
		station: json.data.city?.name ?? null,
		dominant_pollutant: json.data.dominentpol ?? null,
		source: 'WAQI'
	};
}

async function openMeteoAirQuality(lat, lon) {
	const params = new URLSearchParams({
		latitude: String(lat),
		longitude: String(lon),
		current: 'us_aqi,pm2_5',
		timezone: TIMEZONE
	});
	const { current } = await fetchJson(`${AIR_QUALITY_API}?${params}`);
	return {
		aqi: Math.round(current.us_aqi),
		pm25: round(current.pm2_5),
		station: null,
		dominant_pollutant: 'pm25',
		source: 'Open-Meteo'
	};
}

/** Kualitas udara: stasiun WAQI terdekat bila WAQI_TOKEN ada, selain itu model Open-Meteo. */
export function getAirQuality(lat, lon) {
	return cached(`aqi:${coordKey(lat, lon)}`, FIFTEEN_MINUTES, async () => {
		if (config.waqiToken) {
			try {
				return await waqiAirQuality(lat, lon);
			} catch (error) {
				console.warn('WAQI gagal, beralih ke Open-Meteo:', error.message);
			}
		}
		return openMeteoAirQuality(lat, lon);
	});
}

/** US AQI saat ini untuk banyak titik sekaligus (satu request Open-Meteo). */
export function getAqiForPoints(points) {
	const key = `aqi-points:${points.map((p) => coordKey(p.lat, p.lon)).join('|')}`;
	return cached(key, 30 * 60 * 1000, async () => {
		const params = new URLSearchParams({
			latitude: points.map((p) => p.lat).join(','),
			longitude: points.map((p) => p.lon).join(','),
			current: 'us_aqi'
		});
		const json = await fetchJson(`${AIR_QUALITY_API}?${params}`);
		const results = Array.isArray(json) ? json : [json];
		return results.map((r) => r.current?.us_aqi).filter((aqi) => typeof aqi === 'number');
	});
}

/** Jendela 2 jam dengan PM2.5 terendah antara pukul 06.00-18.00 WIB dalam 24 jam ke depan. */
export function getSafeWindow(lat, lon) {
	return cached(`safe-window:${coordKey(lat, lon)}`, FIFTEEN_MINUTES, async () => {
		const params = new URLSearchParams({
			latitude: String(lat),
			longitude: String(lon),
			hourly: 'pm2_5',
			forecast_days: '2',
			timezone: TIMEZONE
		});
		const { hourly } = await fetchJson(`${AIR_QUALITY_API}?${params}`);
		const nowKey = currentJakartaHour();
		const start = hourly.time.findIndex((time) => time.slice(0, 13) >= nowKey);
		if (start < 0) return null;

		let best = null;
		for (let i = start; i < Math.min(start + 24, hourly.time.length - 1); i++) {
			const hour = Number(hourly.time[i].slice(11, 13));
			const [a, b] = [hourly.pm2_5[i], hourly.pm2_5[i + 1]];
			if (hour < 6 || hour > 16 || typeof a !== 'number' || typeof b !== 'number') continue;
			const average = (a + b) / 2;
			if (!best || average < best.average) best = { hour, average };
		}
		if (!best) return null;

		const label = (hour) => `${String(hour).padStart(2, '0')}.00`;
		return {
			start: label(best.hour),
			end: label(best.hour + 2),
			avg_pm25: best.average.toFixed(1)
		};
	});
}

/** Prakiraan angin per jam (24 jam ke depan) untuk pemodelan lintasan asap. */
export function getWindForecast(lat, lon) {
	return cached(`wind:${coordKey(lat, lon)}`, FIFTEEN_MINUTES, async () => {
		const params = new URLSearchParams({
			latitude: String(lat),
			longitude: String(lon),
			hourly: 'wind_speed_10m,wind_direction_10m',
			forecast_days: '2',
			timezone: TIMEZONE
		});
		const { hourly } = await fetchJson(`${FORECAST_API}?${params}`);
		const nowKey = currentJakartaHour();
		const start = Math.max(
			hourly.time.findIndex((time) => time.slice(0, 13) >= nowKey),
			0
		);
		return hourly.time.slice(start, start + 24).map((time, i) => ({
			time,
			speed: hourly.wind_speed_10m[start + i] ?? 0,
			direction: hourly.wind_direction_10m[start + i] ?? 0
		}));
	});
}
