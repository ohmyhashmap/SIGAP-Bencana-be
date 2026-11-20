import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createCache } from '../src/lib/http.js';

describe('shared Redis response cache', () => {
	it('shares cached values between cache instances and applies the TTL', async () => {
		const values = new Map();
		const writes = [];
		const redis = {
			isReady: true,
			async get(key) {
				return values.get(key) ?? null;
			},
			async set(key, value, options) {
				values.set(key, value);
				writes.push({ key, options });
			},
		};
		const first = createCache({ getClient: () => redis });
		const second = createCache({ getClient: () => redis });
		let loads = 0;

		assert.deepEqual(
			await first.cached('weather:medan', 15_000, async () => {
				loads++;
				return { temperature: 30 };
			}),
			{ temperature: 30 },
		);
		assert.deepEqual(
			await second.cached('weather:medan', 15_000, async () => {
				loads++;
				return { temperature: 31 };
			}),
			{ temperature: 30 },
		);

		assert.equal(loads, 1);
		assert.equal(writes.length, 1);
		assert.equal(writes[0].options.PX, 15_000);
		assert.match(writes[0].key, /weather:medan$/);
	});

	it('uses the process cache when Redis is not configured', async () => {
		const cache = createCache({ getClient: () => null });
		let loads = 0;
		const loader = async () => {
			loads++;
			return ['news'];
		};

		assert.deepEqual(await cache.cached('external-news', 60_000, loader), [
			'news',
		]);
		assert.deepEqual(await cache.cached('external-news', 60_000, loader), [
			'news',
		]);
		assert.equal(loads, 1);
	});

	it('logs Redis errors and still returns freshly loaded data', async () => {
		const messages = [];
		const logger = { error: (...args) => messages.push(args) };
		const redis = {
			isReady: true,
			async get() {
				throw new Error('redis unavailable');
			},
			async set() {
				throw new Error('redis unavailable');
			},
		};
		const cache = createCache({ getClient: () => redis, logger });

		assert.deepEqual(
			await cache.cached('external-news', 60_000, async () => ['fresh']),
			['fresh'],
		);
		assert.equal(messages.length, 2);
		assert.match(messages[0][0], /Redis cache read gagal/);
		assert.match(messages[1][0], /Redis cache write gagal/);
	});
});
