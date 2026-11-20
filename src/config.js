// Muat .env bila ada (Node >= 20.12). Variabel yang sudah di-set di environment tidak ditimpa.
try {
	process.loadEnvFile?.();
} catch {
	// .env bersifat opsional.
}

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !process.env.JWT_SECRET) {
	throw new Error('JWT_SECRET wajib di-set saat NODE_ENV=production.');
}

function resolveDatabaseUrl() {
	if (process.env.DATABASE_URL) {
		return process.env.DATABASE_URL;
	}
	if (process.env.DB_HOST && process.env.DB_DATABASE) {
		const user = encodeURIComponent(process.env.DB_USERNAME || '');
		const rawPassword = process.env.DB_PASSWORD || '';
		const cleanPassword = rawPassword.replace(/^["']|["']$/g, '');
		const pass = cleanPassword ? `:${encodeURIComponent(cleanPassword)}` : '';
		const auth = user ? `${user}${pass}@` : '';
		const port = process.env.DB_PORT ? `:${process.env.DB_PORT}` : '';
		return `postgres://${auth}${process.env.DB_HOST}${port}/${process.env.DB_DATABASE}`;
	}
	return 'postgres://localhost:5432/sigap_bencana';
}

function resolveRedisUrl() {
	if (process.env.REDIS_URL) {
		return process.env.REDIS_URL;
	}
	if (process.env.REDIS_HOST) {
		const port = process.env.REDIS_PORT || '6379';
		return `redis://${process.env.REDIS_HOST}:${port}`;
	}
	return '';
}

export const config = {
	port: Number(process.env.PORT) || Number(process.env.APP_PORT) || 8787,
	databaseUrl: resolveDatabaseUrl(),
	databaseSsl: process.env.DATABASE_SSL === 'true',
	redisUrl: resolveRedisUrl(),
	redisCachePrefix: process.env.REDIS_CACHE_PREFIX || 'sigap:cache:',
	jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-ganti-di-produksi',
	jwtTtlSeconds: 7 * 24 * 60 * 60,
	corsOrigin: process.env.CORS_ORIGIN || '*',
	firmsMapKey: process.env.FIRMS_MAP_KEY || '',
	firmsSource: process.env.FIRMS_SOURCE || 'VIIRS_NOAA20_NRT',
	hotspotSyncMinutes: Number(process.env.HOTSPOT_SYNC_MINUTES) || 60,
	waqiToken: process.env.WAQI_TOKEN || '',
	newsRssUrl:
		process.env.NEWS_RSS_URL || 'https://www.cnbcindonesia.com/news/rss',
	aiBaseUrl: process.env.AI_BASE_URL || '',
	aiApiKey: process.env.AI_API_KEY || '',
	aiChatModel: process.env.AI_CHAT_MODEL || 'gpt-4o-mini',
	aiEmbeddingModel: process.env.AI_EMBEDDING_MODEL || 'text-embedding-3-small',
	paymentInstructions: process.env.PAYMENT_INSTRUCTIONS || '',
};
