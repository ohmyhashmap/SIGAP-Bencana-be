import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { HttpError } from './http.js';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

/** Hash password dengan scrypt; format: `scrypt$<salt hex>$<hash hex>`. */
export async function hashPassword(password) {
	const salt = randomBytes(16);
	const key = await scrypt(password, salt, KEY_LENGTH);
	return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
	const [algorithm, saltHex, keyHex] = String(stored).split('$');
	if (algorithm !== 'scrypt' || !saltHex || !keyHex) return false;
	const expected = Buffer.from(keyHex, 'hex');
	const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
	return timingSafeEqual(expected, actual);
}

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const sign = (data) => createHmac('sha256', config.jwtSecret).update(data).digest('base64url');

/** JWT HS256 minimal; `sub` berisi id user. */
export function signToken(userId) {
	const now = Math.floor(Date.now() / 1000);
	const header = encode({ alg: 'HS256', typ: 'JWT' });
	const payload = encode({ sub: userId, iat: now, exp: now + config.jwtTtlSeconds });
	return `${header}.${payload}.${sign(`${header}.${payload}`)}`;
}

/** Mengembalikan id user bila token valid dan belum kedaluwarsa, selain itu null. */
export function verifyToken(token) {
	const parts = String(token).split('.');
	if (parts.length !== 3) return null;
	const [header, payload, signature] = parts;
	const expected = Buffer.from(sign(`${header}.${payload}`));
	const actual = Buffer.from(signature);
	if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
	try {
		const { alg } = JSON.parse(Buffer.from(header, 'base64url').toString());
		const { sub, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
		if (alg !== 'HS256' || !Number.isInteger(sub) || exp * 1000 < Date.now()) return null;
		return sub;
	} catch {
		return null;
	}
}

function bearerToken(req) {
	const header = req.get('authorization') ?? '';
	return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

/** Wajib login: token tidak ada/tidak valid -> 401. */
export function requireAuth(req, _res, next) {
	const userId = verifyToken(bearerToken(req));
	if (!userId) throw new HttpError(401, 'Sesi tidak valid. Silakan masuk kembali.');
	req.userId = userId;
	next();
}

/** Wajib memiliki role admin yang tercatat di database. */
export async function requireAdmin(req, _res, next) {
	const { rows } = await query('SELECT role FROM users WHERE id = $1', [req.userId]);
	if (rows[0]?.role !== 'admin') throw new HttpError(403, 'Akses khusus admin.');
	req.userRole = rows[0].role;
	next();
}

/** Login opsional: token valid mengisi `req.userId`, token tidak valid diabaikan. */
export function optionalAuth(req, _res, next) {
	const token = bearerToken(req);
	req.userId = token ? verifyToken(token) : null;
	next();
}
