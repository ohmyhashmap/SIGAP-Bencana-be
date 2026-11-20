import { Router } from 'express';
import { query } from '../db/pool.js';
import { hashPassword, requireAuth, signToken, verifyPassword } from '../lib/auth.js';
import { HttpError, ok } from '../lib/http.js';

export const authRouter = Router();

const USERNAME_PATTERN = /^[A-Za-z0-9_.]{3,32}$/;
const PG_UNIQUE_VIOLATION = '23505';

const text = (value) => (typeof value === 'string' ? value.trim() : '');

function validName(value) {
	const name = text(value);
	if (!name || name.length > 100) throw new HttpError(400, 'Nama wajib diisi (maks. 100 karakter).');
	return name;
}

function validPassword(value, label = 'Password') {
	if (typeof value !== 'string' || value.length < 6 || value.length > 128) {
		throw new HttpError(400, `${label} minimal 6 karakter.`);
	}
	return value;
}

async function findUser(id) {
	const { rows } = await query('SELECT id, username, name, role FROM users WHERE id = $1', [id]);
	if (!rows[0]) throw new HttpError(401, 'Sesi tidak valid. Silakan masuk kembali.');
	return rows[0];
}

authRouter.post('/register', async (req, res) => {
	const name = validName(req.body?.name);
	const username = text(req.body?.username);
	if (!USERNAME_PATTERN.test(username)) {
		throw new HttpError(400, 'Username 3-32 karakter: huruf, angka, titik, atau garis bawah.');
	}
	const passwordHash = await hashPassword(validPassword(req.body?.password));

	try {
		const { rows } = await query(
			`INSERT INTO users (username, name, password_hash) VALUES ($1, $2, $3)
			 RETURNING id, username, name, role`,
			[username, name, passwordHash]
		);
		ok(res, { token: signToken(rows[0].id), user: rows[0] }, { status: 201 });
	} catch (error) {
		if (error.code === PG_UNIQUE_VIOLATION) throw new HttpError(409, 'Username sudah dipakai.');
		throw error;
	}
});

authRouter.post('/login', async (req, res) => {
	const username = text(req.body?.username);
	const password = typeof req.body?.password === 'string' ? req.body.password : '';
	const { rows } = await query(
		'SELECT id, username, name, role, password_hash FROM users WHERE lower(username) = lower($1)',
		[username]
	);
	const user = rows[0];
	if (!user || !(await verifyPassword(password, user.password_hash))) {
		throw new HttpError(401, 'Username atau password salah.');
	}
	ok(res, {
		token: signToken(user.id),
		user: { id: user.id, username: user.username, name: user.name, role: user.role }
	});
});

authRouter.get('/me', requireAuth, async (req, res) => {
	ok(res, await findUser(req.userId));
});

authRouter.put('/profile', requireAuth, async (req, res) => {
	const name = validName(req.body?.name);
	const { rows } = await query(
		`UPDATE users SET name = $1, updated_at = now() WHERE id = $2
		 RETURNING id, username, name, role`,
		[name, req.userId]
	);
	if (!rows[0]) throw new HttpError(401, 'Sesi tidak valid. Silakan masuk kembali.');
	ok(res, rows[0]);
});

authRouter.put('/password', requireAuth, async (req, res) => {
	const newPassword = validPassword(req.body?.newPassword, 'Password baru');
	const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);
	if (!rows[0]) throw new HttpError(401, 'Sesi tidak valid. Silakan masuk kembali.');
	const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
	if (!(await verifyPassword(currentPassword, rows[0].password_hash))) {
		throw new HttpError(400, 'Password saat ini salah.');
	}
	await query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [
		await hashPassword(newPassword),
		req.userId
	]);
	ok(res, {});
});
