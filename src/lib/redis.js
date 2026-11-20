import { createClient } from 'redis';
import { config } from '../config.js';

let client = null;

export function getRedisClient() {
	return client;
}

export async function connectRedis() {
	if (!config.redisUrl) {
		if (process.env.NODE_ENV === 'production') {
			throw new Error('REDIS_URL wajib di-set saat NODE_ENV=production.');
		}
		console.warn('REDIS_URL belum di-set; cache memakai memori proses lokal.');
		return;
	}

	const nextClient = createClient({
		url: config.redisUrl,
		socket: {
			connectTimeout: 5000,
			reconnectStrategy: (retries) =>
				retries < 3
					? Math.min(retries * 250, 1000)
					: new Error('Redis reconnect limit reached'),
		},
	});
	nextClient.on('error', (error) => {
		console.error('Koneksi Redis bermasalah:', error.message);
	});

	try {
		await nextClient.connect();
		client = nextClient;
		console.log('Cache Redis terhubung.');
	} catch (error) {
		nextClient.destroy();
		throw new Error('Gagal terhubung ke Redis.', { cause: error });
	}
}

export async function disconnectRedis() {
	if (client?.isOpen) await client.quit();
	client = null;
}
