import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireAdmin, requireAuth } from '../lib/auth.js';
import { HttpError, ok, toNumber } from '../lib/http.js';

export const reportsRouter = Router();

// Harus sama dengan CHECK constraint di schema.sql dan daftar di frontend (src/lib/disaster.ts).
export const REPORT_CATEGORIES = ['banjir', 'longsor', 'gempa', 'karhutla', 'erupsi', 'cuaca', 'lainnya'];
export const SEVERITIES = ['rendah', 'sedang', 'tinggi'];

const COLUMNS = 'id, category, severity, description, image_data, lat, lon, status, created_at';

reportsRouter.get('/', async (_req, res) => {
	const { rows } = await query(
		`SELECT ${COLUMNS} FROM reports
		 WHERE status = 'verified' ORDER BY created_at DESC LIMIT 50`
	);
	ok(res, rows, { source: 'db' });
});

reportsRouter.get('/mine', requireAuth, async (req, res) => {
	const { rows } = await query(
		`SELECT ${COLUMNS} FROM reports WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
		[req.userId]
	);
	ok(res, rows);
});

reportsRouter.get('/pending', requireAuth, requireAdmin, async (_req, res) => {
	const { rows } = await query(
		`SELECT ${COLUMNS} FROM reports WHERE status = 'pending'
		 ORDER BY created_at ASC LIMIT 200`
	);
	ok(res, rows);
});

reportsRouter.put('/:id/status', requireAuth, requireAdmin, async (req, res) => {
	const id = toNumber(req.params.id, 1, Number.MAX_SAFE_INTEGER);
	const status = req.body?.status;
	if (id === null) throw new HttpError(400, 'ID laporan tidak valid.');
	if (!['verified', 'rejected'].includes(status)) {
		throw new HttpError(400, 'Status laporan harus verified atau rejected.');
	}
	const { rows } = await query(
		`UPDATE reports SET status = $1 WHERE id = $2 AND status = 'pending'
		 RETURNING ${COLUMNS}`,
		[status, id]
	);
	if (!rows[0]) throw new HttpError(404, 'Laporan tidak ditemukan atau sudah ditinjau.');
	ok(res, rows[0]);
});

reportsRouter.post('/', requireAuth, async (req, res) => {
	const body = req.body ?? {};
	const description = typeof body.description === 'string' ? body.description.trim() : '';
	const lat = toNumber(body.lat, -90, 90);
	const lon = toNumber(body.lon, -180, 180);
	const category = body.category ?? 'lainnya';
	const severity = body.severity ?? 'sedang';
	const imageData = typeof body.imageData === 'string' ? body.imageData : '';

	if (!description || description.length > 1000) {
		throw new HttpError(400, 'Deskripsi laporan wajib diisi (maks. 1000 karakter).');
	}
	if (lat === null || lon === null) throw new HttpError(400, 'Koordinat lokasi tidak valid.');
	if (!REPORT_CATEGORIES.includes(category)) throw new HttpError(400, 'Jenis bencana tidak valid.');
	if (!SEVERITIES.includes(severity)) throw new HttpError(400, 'Tingkat keparahan tidak valid.');
	if (imageData && (!/^data:image\/(jpeg|png|webp);base64,/.test(imageData) || imageData.length > 8_000_000)) {
		throw new HttpError(400, 'Gambar harus berupa JPEG, PNG, atau WebP dengan ukuran yang wajar.');
	}

	const { rows } = await query(
		`INSERT INTO reports (user_id, category, severity, description, image_data, lat, lon)
		 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${COLUMNS}`,
		[req.userId, category, severity, description, imageData, lat, lon]
	);
	ok(res, rows[0], { status: 201 });
});
