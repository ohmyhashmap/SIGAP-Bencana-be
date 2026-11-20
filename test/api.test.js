// Tes integrasi API terhadap database PostgreSQL khusus tes.
// Jalankan: TEST_DATABASE_URL=postgres://user:pass@localhost:5432/sigap_bencana_test npm test
// PERINGATAN: semua tabel di database tes dikosongkan sebelum setiap tes.
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

try {
	process.loadEnvFile?.();
} catch {
	// .env bersifat opsional.
}
const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;
process.env.FIRMS_MAP_KEY = '';
process.env.WAQI_TOKEN = '';

describe('SIGAP Bencana API', { skip: !TEST_DB && 'TEST_DATABASE_URL belum di-set' }, () => {
	const realFetch = globalThis.fetch;
	let server;
	let baseUrl;
	let db;
	let clearCache;
	let seed;
	// Handler untuk request ke layanan eksternal (Open-Meteo, RSS, FIRMS).
	let upstream;

	before(async () => {
		const [{ createApp }, pool, migrate, http, seedModule] = await Promise.all([
			import('../src/app.js'),
			import('../src/db/pool.js'),
			import('../src/db/migrate.js'),
			import('../src/lib/http.js'),
			import('../src/db/seed.js')
		]);
		db = pool;
		clearCache = http.clearCache;
		seed = seedModule;
		await migrate.migrate();
		server = createApp().listen(0);
		await new Promise((resolve) => server.once('listening', resolve));
		baseUrl = `http://127.0.0.1:${server.address().port}`;
		globalThis.fetch = (url, init) =>
			String(url).startsWith(baseUrl) ? realFetch(url, init) : upstream(String(url));
	});

	beforeEach(async () => {
		upstream = (url) => Promise.reject(new Error(`Request eksternal tak terduga: ${url}`));
		clearCache();
		await db.query(
			'TRUNCATE users, reports, news, hotspots, sync_state RESTART IDENTITY CASCADE'
		);
	});

	after(async () => {
		globalThis.fetch = realFetch;
		await new Promise((resolve) => server?.close(resolve));
		await db?.pool.end();
	});

	async function api(method, path, { body, token } = {}) {
		const headers = {};
		if (body !== undefined) headers['Content-Type'] = 'application/json';
		if (token) headers.Authorization = `Bearer ${token}`;
		const res = await realFetch(`${baseUrl}${path}`, {
			method,
			headers,
			body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
		});
		return { status: res.status, body: await res.json() };
	}

	const json = (data) => Promise.resolve(new Response(JSON.stringify(data)));

	async function register(username = 'budi', password = 'rahasia1') {
		const res = await api('POST', '/api/v1/auth/register', {
			body: { name: 'Budi Santoso', username, password }
		});
		assert.equal(res.status, 201);
		return res.body.data.token;
	}

	describe('auth', () => {
		it('mendaftar, masuk, membaca, dan memperbarui akun', async () => {
			const token = await register();

			const duplicate = await api('POST', '/api/v1/auth/register', {
				body: { name: 'Budi Lain', username: 'BUDI', password: 'rahasia1' }
			});
			assert.equal(duplicate.status, 409);
			assert.equal(duplicate.body.success, false);

			const me = await api('GET', '/api/v1/auth/me', { token });
			assert.deepEqual(me.body.data, {
				id: 1,
				username: 'budi',
				name: 'Budi Santoso',
				role: 'user'
			});

			const profile = await api('PUT', '/api/v1/auth/profile', {
				token,
				body: { name: '  Budi S.  ' }
			});
			assert.equal(profile.body.data.name, 'Budi S.');

			const wrong = await api('PUT', '/api/v1/auth/password', {
				token,
				body: { currentPassword: 'salah', newPassword: 'baru12345' }
			});
			assert.equal(wrong.status, 400);

			const changed = await api('PUT', '/api/v1/auth/password', {
				token,
				body: { currentPassword: 'rahasia1', newPassword: 'baru12345' }
			});
			assert.deepEqual(changed.body, { success: true, data: {} });

			const oldLogin = await api('POST', '/api/v1/auth/login', {
				body: { username: 'budi', password: 'rahasia1' }
			});
			assert.equal(oldLogin.status, 401);

			const login = await api('POST', '/api/v1/auth/login', {
				body: { username: 'Budi', password: 'baru12345' }
			});
			assert.equal(login.status, 200);
			assert.equal(login.body.data.user.username, 'budi');
			assert.match(login.body.data.token, /^[\w-]+\.[\w-]+\.[\w-]+$/);
		});

		it('menolak token tidak valid dan input pendaftaran tidak valid', async () => {
			assert.equal((await api('GET', '/api/v1/auth/me')).status, 401);
			assert.equal((await api('GET', '/api/v1/auth/me', { token: 'a.b.c' })).status, 401);

			const token = await register();
			const [header, payload] = token.split('.');
			const forged = `${header}.${payload}.${'x'.repeat(43)}`;
			assert.equal((await api('GET', '/api/v1/auth/me', { token: forged })).status, 401);

			const shortPassword = await api('POST', '/api/v1/auth/register', {
				body: { name: 'A', username: 'andi', password: '123' }
			});
			assert.equal(shortPassword.status, 400);
			const badUsername = await api('POST', '/api/v1/auth/register', {
				body: { name: 'A', username: 'a b', password: 'rahasia1' }
			});
			assert.equal(badUsername.status, 400);
		});

		it('mengembalikan 401 bila akun pemilik token sudah dihapus', async () => {
			const token = await register();
			await db.query('DELETE FROM users');
			assert.equal((await api('GET', '/api/v1/auth/me', { token })).status, 401);
		});

		it('membuat akun uji dari seed yang bisa dipakai login', async () => {
			await seed.seedUser({ username: 'auditor', password: 'Auditor123!' });
			await seed.seedUser({ username: 'auditor', password: 'Auditor123!' });
			const login = await api('POST', '/api/v1/auth/login', {
				body: { username: 'auditor', password: 'Auditor123!' }
			});
			assert.equal(login.status, 200);
		});
	});

	describe('reports', () => {
		it('mewajibkan login, memoderasi laporan sebelum publik, dan menampilkan laporan terverifikasi', async () => {
			const token = await register();
			const anonymous = await api('POST', '/api/v1/reports', {
				body: { lat: 3.59, lon: 98.67, description: 'Pohon tumbang' }
			});
			assert.equal(anonymous.status, 401);

			const mine = await api('POST', '/api/v1/reports', {
				token,
				body: {
					lat: -6.2,
					lon: 106.8,
					description: '  Banjir setinggi lutut  ',
					category: 'banjir',
					severity: 'tinggi',
					imageData: 'data:image/png;base64,AAAA'
				}
			});
			assert.equal(mine.body.data.description, 'Banjir setinggi lutut');
			assert.equal(mine.body.data.image_data, 'data:image/png;base64,AAAA');
			assert.equal(mine.body.data.status, 'pending');

			const feed = await api('GET', '/api/v1/reports');
			assert.equal(feed.body.data.length, 0);

			const own = await api('GET', '/api/v1/reports/mine', { token });
			assert.deepEqual(
				own.body.data.map((r) => r.description),
				['Banjir setinggi lutut']
			);
			assert.equal(own.body.data[0].status, 'pending');
			assert.equal((await api('GET', '/api/v1/reports/mine')).status, 401);

			assert.equal((await api('GET', '/api/v1/reports/pending', { token })).status, 403);
			await db.query("UPDATE users SET role = 'admin' WHERE username = 'budi'");
			const pending = await api('GET', '/api/v1/reports/pending', { token });
			assert.equal(pending.body.data.length, 1);
			assert.equal(pending.body.data[0].description, 'Banjir setinggi lutut');
			const verified = await api('PUT', `/api/v1/reports/${pending.body.data[0].id}/status`, {
				token,
				body: { status: 'verified' }
			});
			assert.equal(verified.body.data.status, 'verified');
			const publicFeed = await api('GET', '/api/v1/reports');
			assert.equal(publicFeed.body.data.length, 1);
			assert.equal(publicFeed.body.data[0].category, 'banjir');
		});

		it('menolak token tidak valid saat mengirim laporan', async () => {
			const res = await api('POST', '/api/v1/reports', {
				token: 'token-rusak',
				body: { lat: 1, lon: 100, description: 'Longsor kecil', category: 'longsor' }
			});
			assert.equal(res.status, 401);
		});

		it('memvalidasi isi laporan', async () => {
			const cases = [
				{ lat: 1, lon: 100, description: '' },
				{ lat: 91, lon: 100, description: 'x' },
				{ lat: 1, description: 'x' },
				{ lat: 1, lon: 100, description: 'x', category: 'meteor' },
				{ lat: 1, lon: 100, description: 'x', severity: 'parah' }
			];
			for (const body of cases) {
				const token = await register('pelapor');
				const res = await api('POST', '/api/v1/reports', { body, token });
				assert.equal(res.status, 400, JSON.stringify(body));
				await db.query('DELETE FROM users WHERE username = $1', ['pelapor']);
			}
			const token = await register();
			assert.equal(
				(await api('POST', '/api/v1/reports', { body: '{rusak', token })).status,
				400
			);
		});
	});

	describe('news', () => {
		it('menampilkan berita seed, detail, dan 404', async () => {
			await seed.seedNews();
			await seed.seedNews();
			const list = await api('GET', '/api/v1/news');
			assert.equal(list.body.data.length, seed.SEED_NEWS.length);
			assert.equal(list.body.data[0].slug, seed.SEED_NEWS[0].slug);
			assert.equal(list.body.data[0].isExternal, false);
			assert.ok(list.body.data[0].date);

			const detail = await api('GET', `/api/v1/news/${seed.SEED_NEWS[1].slug}`);
			assert.equal(detail.body.data.title, seed.SEED_NEWS[1].title);

			const missing = await api('GET', '/api/v1/news/tidak-ada');
			assert.deepEqual(missing, {
				status: 404,
				body: { success: false, error: 'Artikel tidak ditemukan.' }
			});
		});

		it('memfilter berita eksternal kebencanaan dari RSS', async () => {
			const item = (title, description) => `<item>
				<guid>https://contoh.id/${encodeURIComponent(title)}</guid>
				<pubDate>Wed, 11 Nov 2026 20:49:04 +0700</pubDate>
				<title><![CDATA[${title}]]></title>
				<description><![CDATA[ <img src="https://img.contoh.id/a.jpg?w=1&amp;q=9"/> ${description}]]></description>
			</item>`;
			const rss = `<rss><channel><title>News - Berita Terkini - Media Contoh</title>
				${item('Harga Cabai Naik', 'Pasar ramai.')}
				${item('Banjir Rendam Aceh', 'Ribuan warga mengungsi &amp; butuh bantuan.')}
			</channel></rss>`;
			upstream = () => Promise.resolve(new Response(rss));

			const res = await api('GET', '/api/v1/news/external');
			assert.equal(res.body.data.length, 1);
			assert.deepEqual(res.body.data[0], {
				id: 'ext-1',
				slug: 'https://contoh.id/Banjir%20Rendam%20Aceh',
				title: 'Banjir Rendam Aceh',
				category: 'Kabar Nasional',
				date: 'Wed, 11 Nov 2026 20:49:04 +0700',
				author: 'Media Contoh',
				image: 'https://img.contoh.id/a.jpg?w=1&q=9',
				excerpt: 'Ribuan warga mengungsi & butuh bantuan.',
				isExternal: true,
				link: 'https://contoh.id/Banjir%20Rendam%20Aceh'
			});
		});

		it('mengembalikan 502 bila RSS gagal dimuat', async () => {
			const res = await api('GET', '/api/v1/news/external');
			assert.equal(res.status, 502);
		});
	});

	describe('hotspots & stats', () => {
		async function insertHotspot(lat, lon, confidence, hoursAgo) {
			await db.query(
				`INSERT INTO hotspots (lat, lon, confidence, detected_at)
				 VALUES ($1, $2, $3, now() - make_interval(hours => $4))`,
				[lat, lon, confidence, hoursAgo]
			);
		}

		it('mengembalikan hotspot dalam bbox, urut dari yang terlama', async () => {
			await insertHotspot(0.6, 101.5, 90, 2);
			await insertHotspot(0.5, 101.4, 60, 30);
			await insertHotspot(-2.2, 113.9, 30, 1);
			await insertHotspot(0.5, 101.4, 60, 24 * 8);

			const res = await api('GET', '/api/v1/hotspots?bbox=95,-1,105,6&days=5');
			assert.equal(res.body.meta.count, 2);
			assert.deepEqual(
				res.body.data.map((h) => h.confidence),
				[60, 90]
			);
			assert.equal((await api('GET', '/api/v1/hotspots?bbox=1,2,3')).status, 400);
		});

		it('menghitung statistik nasional dan lokal per provinsi', async () => {
			await insertHotspot(0.6, 101.5, 90, 2);
			await insertHotspot(0.4, 101.3, 60, 5);
			await insertHotspot(-2.2, 113.9, 30, 1);
			upstream = (url) => {
				const count = new URL(url).searchParams.get('latitude').split(',').length;
				return json(
					Array.from({ length: count }, (_, i) => ({ current: { us_aqi: [20, 80, 150, 250][i % 4] } }))
				);
			};

			const national = await api('GET', '/api/v1/stats');
			assert.equal(national.body.data.isLocal, false);
			assert.equal(national.body.data.totalHotspots, 3);
			assert.deepEqual(national.body.data.topProvinces.slice(0, 2), [
				{ name: 'Riau', count: 2, distance: 0 },
				{ name: 'Kalimantan Tengah', count: 1, distance: 0 }
			]);
			assert.equal(national.body.data.aqiDistribution.reduce((a, b) => a + b), 38);

			const local = await api('GET', '/api/v1/stats?lat=0.5&lon=101.4');
			assert.equal(local.body.data.isLocal, true);
			assert.equal(local.body.data.totalHotspots, 2);
			assert.equal(local.body.data.topProvinces[0].name, 'Riau');
			assert.deepEqual(local.body.data.aqiDistribution, [3, 3, 2, 2]);
		});

		it('tetap mengembalikan statistik saat layanan AQI gagal', async () => {
			const res = await api('GET', '/api/v1/stats');
			assert.equal(res.status, 200);
			assert.deepEqual(res.body.data.aqiDistribution, [0, 0, 0, 0]);
		});
	});

	describe('environment', () => {
		it('menggabungkan cuaca dan kualitas udara', async () => {
			upstream = (url) =>
				url.includes('air-quality')
					? json({ current: { us_aqi: 87.4, pm2_5: 30.26 } })
					: json({
							current: {
								wind_speed_10m: 7.25,
								wind_direction_10m: 175,
								temperature_2m: 27.7,
								relative_humidity_2m: 83,
								surface_pressure: 1009.5
							}
						});
			const res = await api('GET', '/api/v1/environment?lat=3.59&lon=98.67');
			assert.equal(res.body.data.aqi.aqi, 87);
			assert.equal(res.body.data.aqi.pm25, 30.3);
			assert.equal(res.body.data.weather.wind_speed, 7.3);
			assert.equal((await api('GET', '/api/v1/environment?lat=abc&lon=1')).status, 400);
		});

		it('mengembalikan 502 bila layanan cuaca gagal', async () => {
			const res = await api('GET', '/api/v1/environment?lat=3.59&lon=98.67');
			assert.equal(res.status, 502);
		});

		it('memilih jendela 2 jam dengan PM2.5 terendah pada siang hari', async () => {
			const start = new Date(Date.now() + 7 * 3600_000);
			start.setUTCHours(0, 0, 0, 0);
			const time = Array.from({ length: 48 }, (_, i) =>
				new Date(start.getTime() + i * 3600_000).toISOString().slice(0, 16)
			);
			const nowKey = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 13);
			const firstAt = (hour) =>
				time.findIndex((t) => t.slice(0, 13) >= nowKey && t.slice(11, 13) === hour);
			// Paling rendah pukul 02.00 (malam, diabaikan), lalu 13.00-14.00 berikutnya.
			const night = firstAt('02');
			const noon = firstAt('13');
			const pm2_5 = time.map((_, i) => (i === night ? 1 : i === noon || i === noon + 1 ? 5 : 40));
			upstream = () => json({ hourly: { time, pm2_5 } });

			const res = await api('GET', '/api/v1/safe-window?lat=3.59&lon=98.67');
			assert.deepEqual(res.body.data, { start: '13.00', end: '15.00', avg_pm25: '5.0' });
		});

		it('memberi rekomendasi sesuai AQI dan profil', async () => {
			const asma = await api('GET', '/api/v1/recommendations?aqi=120&profile=asma');
			assert.match(asma.body.data.message, /inhaler/);
			const unknown = await api('GET', '/api/v1/recommendations?aqi=20&profile=lansia');
			assert.equal(unknown.body.data.profile, 'umum');
			assert.equal((await api('GET', '/api/v1/recommendations')).status, 400);
		});

		it('memodelkan lintasan asap dari hotspot terkuat', async () => {
			assert.equal((await api('GET', '/api/v1/trajectory')).status, 404);

			await db.query(
				`INSERT INTO hotspots (lat, lon, confidence, detected_at) VALUES
				 (1, 100, 60, now()), (2, 101, 90, now() - interval '1 hour'), (3, 102, 99, now() - interval '3 days')`
			);
			const hours = Array.from({ length: 30 }, (_, i) => `2026-01-01T${String(i % 24).padStart(2, '0')}:00`);
			// Angin dari selatan (180°) 10 km/jam -> asap bergerak ke utara.
			upstream = () =>
				json({
					hourly: {
						time: hours,
						wind_speed_10m: hours.map(() => 10),
						wind_direction_10m: hours.map(() => 180)
					}
				});

			const res = await api('GET', '/api/v1/trajectory');
			assert.deepEqual(res.body.data.origin, { lat: 2, lon: 101 });
			const line = res.body.data.geojson.features[0].geometry.coordinates;
			assert.equal(line.length, 25);
			assert.ok(line.at(-1)[1] > 4, 'lintasan bergerak ke utara ~240 km');
			assert.ok(Math.abs(line.at(-1)[0] - 101) < 0.01);
		});
	});

	it('mengembalikan 404 untuk endpoint tak dikenal dan indeks API', async () => {
		assert.deepEqual(await api('GET', '/api/v1/tidak-ada'), {
			status: 404,
			body: { success: false, error: 'Endpoint tidak ditemukan' }
		});
		const index = await api('GET', '/api/v1');
		assert.equal(index.body.data.name, 'SIGAP Bencana API');
		assert.equal((await api('GET', '/health')).body.data.status, 'ok');
	});
});
