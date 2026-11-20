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

export const config = {
	port: Number(process.env.PORT) || 8787,
	databaseUrl:
		process.env.DATABASE_URL ||
		'postgres://postgres:postgres@localhost:5432/sigap_bencana',
	databaseSsl: process.env.DATABASE_SSL === 'true',
	redisUrl: process.env.REDIS_URL || '',
	redisCachePrefix: process.env.REDIS_CACHE_PREFIX || 'sigap:cache:',
	jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-ganti-di-produksi',
	jwtTtlSeconds: 7 * 24 * 60 * 60,
	corsOrigin: process.env.CORS_ORIGIN || '*',
	firmsMapKey: process.env.FIRMS_MAP_KEY || '',
	firmsSource: process.env.FIRMS_SOURCE || 'VIIRS_SNPP_NRT',
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
