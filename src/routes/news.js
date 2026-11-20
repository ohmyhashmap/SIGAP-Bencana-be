import { Router } from 'express';
import { query } from '../db/pool.js';
import { HttpError, ok } from '../lib/http.js';
import { getExternalNews } from '../services/rss.js';

export const newsRouter = Router();

const COLUMNS = `id, slug, title, category, author, published_at AS date, image, excerpt, content,
	false AS "isExternal"`;

newsRouter.get('/', async (_req, res) => {
	const { rows } = await query(`SELECT ${COLUMNS} FROM news ORDER BY published_at DESC LIMIT 50`);
	ok(res, rows);
});

newsRouter.get('/external', async (_req, res) => {
	try {
		ok(res, await getExternalNews());
	} catch (error) {
		console.error('Gagal memuat RSS berita:', error.message);
		throw new HttpError(502, 'Server penyedia berita sedang tidak dapat dihubungi.');
	}
});

newsRouter.get('/:slug', async (req, res) => {
	const { rows } = await query(`SELECT ${COLUMNS} FROM news WHERE slug = $1`, [req.params.slug]);
	if (!rows[0]) throw new HttpError(404, 'Artikel tidak ditemukan.');
	ok(res, rows[0]);
});
