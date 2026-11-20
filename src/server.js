import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db/pool.js';

const server = createApp().listen(config.port, () => {
	console.log(`SIGAP Bencana API berjalan di http://localhost:${config.port}/api/v1`);
});

const shutdown = () => {
	server.close(() => pool.end().then(() => process.exit(0)));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
