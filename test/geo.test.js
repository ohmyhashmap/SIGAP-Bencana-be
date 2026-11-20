import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { distanceKm, nearestProvince, destination, INDONESIA_BBOX, PROVINCES } from '../src/lib/geo.js';

describe('geo utilities', () => {
	describe('INDONESIA_BBOX', () => {
		it('memiliki 4 elemen koordinat [barat, selatan, timur, utara]', () => {
			assert.equal(INDONESIA_BBOX.length, 4);
			const [west, south, east, north] = INDONESIA_BBOX;
			assert.ok(west < east, 'barat harus lebih kecil dari timur');
			assert.ok(south < north, 'selatan harus lebih kecil dari utara');
		});
	});

	describe('PROVINCES', () => {
		it('berisi setidaknya 34 provinsi', () => {
			assert.ok(PROVINCES.length >= 34);
		});

		it('setiap provinsi memiliki name, lat, lon yang valid', () => {
			for (const prov of PROVINCES) {
				assert.ok(typeof prov.name === 'string' && prov.name.length > 0, `name tidak valid: ${prov.name}`);
				assert.ok(Number.isFinite(prov.lat), `lat tidak valid untuk ${prov.name}`);
				assert.ok(Number.isFinite(prov.lon), `lon tidak valid untuk ${prov.name}`);
			}
		});
	});

	describe('distanceKm', () => {
		it('mengembalikan 0 untuk koordinat yang sama', () => {
			assert.equal(distanceKm(0, 0, 0, 0), 0);
		});

		it('menghitung jarak Jakarta ke Surabaya (sekitar 650–700 km)', () => {
			// Jakarta: -6.208, 106.846 | Surabaya: -7.257, 112.752
			const dist = distanceKm(-6.208, 106.846, -7.257, 112.752);
			assert.ok(dist > 600 && dist < 750, `jarak tidak wajar: ${dist}`);
		});

		it('menghitung jarak simetris (A→B sama dengan B→A)', () => {
			const d1 = distanceKm(-6.2, 106.8, -7.8, 110.4);
			const d2 = distanceKm(-7.8, 110.4, -6.2, 106.8);
			assert.ok(Math.abs(d1 - d2) < 0.001, 'jarak tidak simetris');
		});

		it('jarak dua titik berbeda > 0', () => {
			const d = distanceKm(0, 0, 1, 1);
			assert.ok(d > 0);
		});

		it('jarak kutub ke kutub sekitar 20015 km', () => {
			const d = distanceKm(-90, 0, 90, 0);
			assert.ok(Math.abs(d - 20015) < 10, `jarak kutub tidak wajar: ${d}`);
		});
	});

	describe('nearestProvince', () => {
		it('mengembalikan DKI Jakarta untuk koordinat pusat kota Jakarta', () => {
			const prov = nearestProvince(-6.208, 106.846);
			assert.equal(prov.name, 'DKI Jakarta');
		});

		it('mengembalikan Bali untuk koordinat Denpasar', () => {
			const prov = nearestProvince(-8.65, 115.217);
			assert.equal(prov.name, 'Bali');
		});

		it('mengembalikan objek dengan properti name, lat, lon', () => {
			const prov = nearestProvince(-2.5, 118.0);
			assert.ok(typeof prov.name === 'string');
			assert.ok(Number.isFinite(prov.lat));
			assert.ok(Number.isFinite(prov.lon));
		});

		it('selalu mengembalikan provinsi (bukan null/undefined)', () => {
			// Titik di luar Indonesia pun harus mengembalikan provinsi terdekat
			const prov = nearestProvince(0, 0);
			assert.ok(prov !== null && prov !== undefined);
		});
	});

	describe('destination', () => {
		it('bergerak 0 km mengembalikan titik asal (kira-kira)', () => {
			const result = destination(-6.2, 106.8, 0, 0);
			assert.ok(Math.abs(result.lat - (-6.2)) < 0.001);
			assert.ok(Math.abs(result.lon - 106.8) < 0.001);
		});

		it('bergerak ke utara (bearing 0) menaikkan latitude', () => {
			const result = destination(0, 100, 0, 100);
			assert.ok(result.lat > 0, `lat seharusnya naik, dapat: ${result.lat}`);
			assert.ok(Math.abs(result.lon - 100) < 0.01, 'lon seharusnya tidak berubah signifikan');
		});

		it('bergerak ke timur (bearing 90) menaikkan longitude', () => {
			const result = destination(0, 100, 90, 100);
			assert.ok(result.lon > 100, `lon seharusnya naik, dapat: ${result.lon}`);
		});

		it('bergerak ke selatan (bearing 180) menurunkan latitude', () => {
			const result = destination(0, 100, 180, 100);
			assert.ok(result.lat < 0, `lat seharusnya turun, dapat: ${result.lat}`);
		});

		it('mengembalikan koordinat dengan lat dan lon berupa angka finite', () => {
			const result = destination(-6.2, 106.8, 45, 50);
			assert.ok(Number.isFinite(result.lat));
			assert.ok(Number.isFinite(result.lon));
		});
	});
});
