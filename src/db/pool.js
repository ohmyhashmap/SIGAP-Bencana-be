import pg from 'pg';
import { config } from '../config.js';

export const pool = new pg.Pool({
	connectionString: config.databaseUrl,
	ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
	max: 10
});

pool.on('error', (err) => {
	console.error('Koneksi PostgreSQL idle bermasalah:', err.message);
});

export const query = (text, params) => pool.query(text, params);
