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
	return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

const cache = new Map();
const MAX_CACHE_ENTRIES = 500;

/** Cache in-memory sederhana untuk respons layanan eksternal. */
export async function cached(key, ttlMs, loader) {
	const hit = cache.get(key);
	if (hit && hit.expiresAt > Date.now()) return hit.value;
	const value = await loader();
	if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
	cache.set(key, { value, expiresAt: Date.now() + ttlMs });
	return value;
}

export function clearCache() {
	cache.clear();
}

async function request(url, timeoutMs) {
	const res = await fetch(url, {
		signal: AbortSignal.timeout(timeoutMs),
		headers: { 'User-Agent': 'SIGAP-Bencana/1.0' }
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
