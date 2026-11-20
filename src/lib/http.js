import { config } from '../config.js';
import { getRedisClient } from './redis.js';

export class HttpError extends Error {
	constructor(status, message) {
		super(message);
		this.status = status;
	}
}

/** Respons sukses dengan format `{ success, data, ...extra }`. */
export function ok(res, data, { status = 200, ...extra } = {}) {
	res.status(status).json({ success: true, ...extra, data });
}

/** Angka dari query/body dalam rentang tertentu; selain itu `null`. */
export function toNumber(value, min = -Infinity, max = Infinity) {
	if (value === undefined || value === null || value === '') return null;
	const number = Number(value);
	return Number.isFinite(number) && number >= min && number <= max
		? number
		: null;
}

const MAX_CACHE_ENTRIES = 500;

export function createCache({
	getClient = getRedisClient,
	logger = console,
} = {}) {
	const memoryCache = new Map();

	const remember = (key, value, ttlMs) => {
		if (memoryCache.size >= MAX_CACHE_ENTRIES) {
			memoryCache.delete(memoryCache.keys().next().value);
		}
		memoryCache.set(key, { value, expiresAt: Date.now() + ttlMs });
	};

	const cached = async (key, ttlMs, loader) => {
		const hit = memoryCache.get(key);
		if (hit && hit.expiresAt > Date.now()) return hit.value;
		if (hit) memoryCache.delete(key);

		const redis = getClient();
		const redisKey = `${config.redisCachePrefix}${key}`;
		if (redis?.isReady) {
			try {
				const serialized = await redis.get(redisKey);
				if (serialized !== null) {
					return JSON.parse(serialized);
				}
			} catch (error) {
				logger.error(`Redis cache read gagal (${redisKey}):`, error.message);
			}
		}

		const value = await loader();
		remember(key, value, ttlMs);
		if (redis?.isReady) {
			try {
				await redis.set(redisKey, JSON.stringify(value), { PX: ttlMs });
			} catch (error) {
				logger.error(`Redis cache write gagal (${redisKey}):`, error.message);
			}
		}
		return value;
	};

	return { cached, clear: () => memoryCache.clear() };
}

const cache = createCache();
export const cached = cache.cached;
export const clearCache = cache.clear;

async function request(url, timeoutMs) {
	const res = await fetch(url, {
		signal: AbortSignal.timeout(timeoutMs),
		headers: { 'User-Agent': 'SIGAP-Bencana/1.0' },
	});
	if (!res.ok) throw new Error(`HTTP ${res.status} dari ${new URL(url).host}`);
	return res;
}

export async function fetchJson(url, timeoutMs = 10_000) {
	return (await request(url, timeoutMs)).json();
}

export async function fetchText(url, timeoutMs = 10_000) {
	return (await request(url, timeoutMs)).text();
}
