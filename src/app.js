import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { query } from './db/pool.js';
import { HttpError, ok } from './lib/http.js';
import { authRouter } from './routes/auth.js';
import { aiRouter } from './routes/ai.js';
import { environmentRouter } from './routes/environment.js';
import { hotspotsRouter } from './routes/hotspots.js';
import { newsRouter } from './routes/news.js';
import { reportsRouter } from './routes/reports.js';

const ENDPOINTS = [
	'POST /api/v1/auth/register',
	'POST /api/v1/auth/login',
	'GET  /api/v1/auth/me',
	'PUT  /api/v1/auth/profile',
	'PUT  /api/v1/auth/password',
	'GET  /api/v1/reports',
	'POST /api/v1/reports',
	'GET  /api/v1/reports/mine',
	'GET  /api/v1/reports/pending (admin)',
	'PUT  /api/v1/reports/:id/status (admin)',
	'GET  /api/v1/ai/credits',
	'POST /api/v1/ai/topups',
	'POST /api/v1/ai/ask',
	'GET  /api/v1/ai/admin/topups (admin)',
	'PUT  /api/v1/ai/admin/topups/:id (admin)',
	'GET  /api/v1/news',
	'GET  /api/v1/news/external',
	'GET  /api/v1/news/:slug',
	'GET  /api/v1/hotspots?bbox=barat,selatan,timur,utara&days=5',
	'GET  /api/v1/stats?lat=&lon=',
	'GET  /api/v1/environment?lat=&lon=',
	'GET  /api/v1/safe-window?lat=&lon=',
	'GET  /api/v1/recommendations?aqi=&profile=umum|anak|asma',
	'GET  /api/v1/trajectory?lat=&lon='
];

export function createApp() {
	const app = express();
	app.disable('x-powered-by');
	app.use(
		cors({
			origin:
				config.corsOrigin === '*' ? '*' : config.corsOrigin.split(',').map((o) => o.trim())
		})
	);
	app.use(express.json({ limit: '10mb' }));

	const api = express.Router();
	api.get('/', (_req, res) => ok(res, { name: 'SIGAP Bencana API', version: 'v1', endpoints: ENDPOINTS }));
	api.use('/auth', authRouter);
	api.use('/reports', reportsRouter);
	api.use('/ai', aiRouter);
	api.use('/news', newsRouter);
	api.use(environmentRouter);
	api.use(hotspotsRouter);
	app.use('/api/v1', api);

	app.get('/health', async (_req, res) => {
		await query('SELECT 1');
		ok(res, { status: 'ok', database: 'postgresql' });
	});

	app.use((_req, res) => {
		res.status(404).json({ success: false, error: 'Endpoint tidak ditemukan' });
	});

	// Express mengenali error handler dari jumlah parameternya (4).
	app.use((err, _req, res, _next) => {
		if (err instanceof HttpError) {
			return res.status(err.status).json({ success: false, error: err.message });
		}
		if (err.type === 'entity.parse.failed') {
			return res.status(400).json({ success: false, error: 'Body JSON tidak valid.' });
		}
		if (err.type === 'entity.too.large') {
			return res.status(413).json({ success: false, error: 'Body request terlalu besar.' });
		}
		console.error(err);
		res.status(500).json({ success: false, error: 'Terjadi kesalahan pada server.' });
	});

	return app;
}
