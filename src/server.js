import { createApp } from './app.js';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { seedNews, seedUser } from './db/seed.js';
import { pool } from './db/pool.js';
import { connectRedis, disconnectRedis } from './lib/redis.js';
import { syncHotspots } from './services/firms.js';

try {
	await migrate();
	console.log('Migrasi skema database selesai.');
	await seedNews();
	await seedUser();
	console.log('Seed berita dan akun awal berhasil.');
} catch (error) {
	console.error('Migrasi/seed database gagal atau dilewati:', error.message);
}

try {
	await connectRedis();
} catch (error) {
	console.error('Koneksi Redis gagal, beralih ke cache memori lokal:', error.message);
}

try {
	await syncHotspots();
} catch (err) {
	console.warn('Sinkronisasi awal FIRMS dilewati:', err.message);
}

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
