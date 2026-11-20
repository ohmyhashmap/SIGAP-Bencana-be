import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HttpError, toNumber, createCache } from '../src/lib/http.js';

describe('HttpError', () => {
	it('mewarisi Error dan menyimpan status', () => {
		const err = new HttpError(404, 'Tidak ditemukan');
		assert.ok(err instanceof Error);
		assert.equal(err.status, 404);
		assert.equal(err.message, 'Tidak ditemukan');
	});

	it('HttpError dengan status 500', () => {
		const err = new HttpError(500, 'Server Error');
		assert.equal(err.status, 500);
	});
});

describe('toNumber', () => {
	it('mengonversi string angka menjadi number', () => {
		assert.equal(toNumber('42'), 42);
		assert.equal(toNumber('3.14'), 3.14);
		assert.equal(toNumber('-10'), -10);
	});

	it('mengembalikan null untuk nilai kosong/null/undefined', () => {
		assert.equal(toNumber(undefined), null);
		assert.equal(toNumber(null), null);
		assert.equal(toNumber(''), null);
	});

	it('mengembalikan null untuk string non-angka', () => {
		assert.equal(toNumber('abc'), null);
		assert.equal(toNumber('NaN'), null);
	});

	it('mengembalikan null untuk Infinity', () => {
		assert.equal(toNumber(Infinity), null);
		assert.equal(toNumber(-Infinity), null);
	});

	it('menghormati batas min', () => {
		assert.equal(toNumber('5', 10), null);
		assert.equal(toNumber('10', 10), 10);
		assert.equal(toNumber('15', 10), 15);
	});

	it('menghormati batas max', () => {
		assert.equal(toNumber('100', 0, 50), null);
		assert.equal(toNumber('50', 0, 50), 50);
		assert.equal(toNumber('25', 0, 50), 25);
	});

	it('menghormati batas min dan max sekaligus', () => {
		assert.equal(toNumber('5', 1, 10), 5);
		assert.equal(toNumber('0', 1, 10), null);
		assert.equal(toNumber('11', 1, 10), null);
	});

	it('mengonversi angka numerik langsung', () => {
		assert.equal(toNumber(42), 42);
		assert.equal(toNumber(0), 0);
	});
});

describe('createCache', () => {
	it('mengembalikan nilai yang dimuat loader pada cache miss', async () => {
		const { cached } = createCache({ getClient: () => null, logger: console });
		let callCount = 0;
		const loader = async () => {
			callCount++;
			return { data: 'hello' };
		};
		const result = await cached('test-miss', 5000, loader);
		assert.deepEqual(result, { data: 'hello' });
		assert.equal(callCount, 1);
	});

	it('mengembalikan nilai yang di-cache tanpa memanggil loader lagi', async () => {
		const { cached } = createCache({ getClient: () => null, logger: console });
		let callCount = 0;
		const loader = async () => {
			callCount++;
			return 'cached-value';
		};
		await cached('test-hit', 5000, loader);
		const result = await cached('test-hit', 5000, loader);
		assert.equal(result, 'cached-value');
		assert.equal(callCount, 1, 'loader seharusnya hanya dipanggil sekali');
	});

	it('memanggil loader ulang setelah cache expired (TTL 0)', async () => {
		const { cached } = createCache({ getClient: () => null, logger: console });
		let callCount = 0;
		const loader = async () => {
			callCount++;
			return callCount;
		};
		await cached('test-ttl', 0, loader);
		// TTL 0 → langsung expired → loader dipanggil lagi
		await new Promise((r) => setTimeout(r, 5));
		await cached('test-ttl', 0, loader);
		assert.ok(callCount >= 2, `loader seharusnya dipanggil >1 kali, actual: ${callCount}`);
	});

	it('method clear() mengosongkan in-memory cache', async () => {
		const { cached, clear } = createCache({ getClient: () => null, logger: console });
		let callCount = 0;
		const loader = async () => { callCount++; return 'value'; };
		await cached('test-clear', 60_000, loader);
		clear();
		await cached('test-clear', 60_000, loader);
		assert.equal(callCount, 2, 'loader harus dipanggil ulang setelah clear');
	});

	it('menggunakan key berbeda untuk nilai berbeda', async () => {
		const { cached } = createCache({ getClient: () => null, logger: console });
		const a = await cached('key-a', 5000, async () => 'alpha');
		const b = await cached('key-b', 5000, async () => 'beta');
		assert.equal(a, 'alpha');
		assert.equal(b, 'beta');
	});

	it('menangani error Redis dengan tetap mengembalikan nilai dari loader', async () => {
		const fakeRedis = {
			isReady: true,
			get: async () => { throw new Error('Redis down'); },
			set: async () => { throw new Error('Redis down'); }
		};
		const fakeLogger = { error: () => {} };
		const { cached } = createCache({ getClient: () => fakeRedis, logger: fakeLogger });
		const result = await cached('redis-fail', 5000, async () => 'fallback');
		assert.equal(result, 'fallback');
	});
});
