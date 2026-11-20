import { migrate } from './db/migrate.js';
import { pool } from './db/pool.js';
import { seedNews, seedUser } from './db/seed.js';

const commands = {
	async migrate() {
		await migrate();
		console.log('Migrasi skema PostgreSQL selesai.');
	},
	async seed() {
		const newsCount = await seedNews();
		const username = await seedUser();
		console.log(`Seed selesai: ${newsCount} berita, akun uji "${username}".`);
	}
};

const command = commands[process.argv[2]];
if (!command) {
	console.error(`Perintah tidak dikenal. Gunakan: ${Object.keys(commands).join(' | ')}`);
	process.exit(1);
}

try {
	await command();
} catch (error) {
	console.error(error.message);
	process.exitCode = 1;
} finally {
	await pool.end();
}
