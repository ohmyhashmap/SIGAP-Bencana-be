import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { connectRedis, disconnectRedis } from './lib/redis.js';

await connectRedis();

const server = createApp().listen(config.port, () => {
	console.log(
		`SIGAP Bencana API berjalan di http://localhost:${config.port}/api/v1`,
	);
});

const shutdown = () => {
	server.close(async () => {
		try {
			await Promise.all([pool.end(), disconnectRedis()]);
			process.exit(0);
		} catch (error) {
			console.error('Gagal menutup koneksi backend dengan bersih:', error);
			process.exit(1);
		}
	});
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
