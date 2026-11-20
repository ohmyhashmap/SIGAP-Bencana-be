# SIGAP Bencana — Backend

REST API untuk SIGAP Bencana, dibangun dengan Express.js 5 dan PostgreSQL.

## Deploy backend secara terpisah

Repository ini berisi source dari folder `backend/` pada repository gabungan; setelah
dipisahkan, `package.json` dan `src/server.js` berada langsung di root repo BE.
Deploy repo ini ke host yang mendukung Node.js server persisten (misalnya Render,
Railway, atau VPS), bukan sebagai static site.

- **Root Directory:** `.` (root repo BE)
- **Runtime:** Node.js 22 LTS
- **Install/Build Command:** `npm ci`
- **Start Command:** `npm start`
- **Database:** PostgreSQL managed atau PostgreSQL pada server BE

Set environment variables dari `.env.example` pada dashboard host BE. Minimal
produksi: `NODE_ENV=production`, `PORT` yang diberikan host, `DATABASE_URL`,
`JWT_SECRET` acak yang kuat, dan `CORS_ORIGIN` sama dengan origin publik frontend
FE (tanpa slash akhir). Isi `DATABASE_SSL=true` bila provider PostgreSQL mewajibkan
TLS.

Setelah mengisi environment dan membuat database, jalankan migrasi satu kali:

```sh
npm run migrate
```

Opsional, jalankan `npm run seed` untuk mengisi berita awal dan akun seed. Atur
`SEED_USERNAME` serta `SEED_PASSWORD` yang kuat terlebih dahulu; jangan gunakan
kredensial contoh/default untuk produksi. Health check: `/health`.

## Persiapan

Kebutuhan: Node.js ≥ 20.12 dan PostgreSQL ≥ 13.

```sh
cp .env.example .env          # lalu sesuaikan DATABASE_URL dan JWT_SECRET
createdb sigap_bencana        # atau: psql -U postgres -c "CREATE DATABASE sigap_bencana"
npm install
npm run setup                 # migrate (buat tabel) + seed (berita & akun uji)
npm run dev                   # http://localhost:8787/api/v1
```

| Script            | Fungsi                                                                        |
| ----------------- | ----------------------------------------------------------------------------- |
| `npm start`       | Menjalankan server                                                            |
| `npm run dev`     | Menjalankan server dengan auto-reload                                         |
| `npm run migrate` | Membuat/memperbarui tabel dari `src/db/schema.sql` (idempoten)                |
| `npm run seed`    | Mengisi berita awal dan akun uji (`SEED_USERNAME` / `SEED_PASSWORD`)          |
| `npm run setup`   | `migrate` lalu `seed`                                                         |
| `npm test`        | Tes integrasi; butuh `TEST_DATABASE_URL` ke database khusus tes (dikosongkan) |

## Variabel lingkungan

Lihat `.env.example`. Yang terpenting:

- `DATABASE_URL`: connection string PostgreSQL. Isi `DATABASE_SSL=true` untuk layanan terkelola yang mewajibkan SSL.
- `JWT_SECRET`: wajib di produksi (`NODE_ENV=production`); server menolak start tanpa nilai ini.
- `CORS_ORIGIN`: origin frontend FE, misalnya `https://<DOMAIN_FE>` tanpa slash akhir.
- `FIRMS_MAP_KEY` (opsional): tanpa key ini tabel `hotspots` tidak disinkronkan, sehingga peta titik panas kosong.
- `WAQI_TOKEN` (opsional): stasiun AQI WAQI. Tanpa token, kualitas udara memakai model Open-Meteo.
- `AI_BASE_URL`, `AI_API_KEY`, `AI_CHAT_MODEL`, `AI_EMBEDDING_MODEL` (opsional): endpoint API yang kompatibel dengan format OpenAI untuk fitur RAG.
- `PAYMENT_INSTRUCTIONS` (opsional): instruksi pembayaran top-up AI yang ditampilkan pada halaman Asisten AI.

Setelah akun admin dibuat dan migrasi dijalankan, beri role admin langsung dari PostgreSQL:

```sql
UPDATE users SET role = 'admin' WHERE lower(username) = lower('username-admin');
```

Jangan menyediakan endpoint publik untuk mengangkat role admin.

## Struktur database

| Tabel          | Isi                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------- |
| `users`        | Akun, role user/admin, kredit AI; password di-hash dengan scrypt                                   |
| `reports`      | Laporan warga: jenis bencana, tingkat keparahan, koordinat, gambar Base64, dan status moderasi     |
| `news`         | Artikel internal                                                                                   |
| `hotspots`     | Titik panas NASA FIRMS (disinkronkan maksimal sekali per `HOTSPOT_SYNC_MINUTES`, disimpan 14 hari) |
| `sync_state`   | Waktu sinkronisasi terakhir layanan eksternal                                                      |
| `ai_knowledge` | Embedding terindeks dari laporan terverifikasi, statistik, dan berita                              |
| `ai_payments`  | Permintaan top-up kredit AI yang ditinjau admin                                                    |

Jenis bencana (`reports.category`): `banjir`, `longsor`, `gempa`, `karhutla`, `erupsi`, `cuaca`, `lainnya`.
Daftar ini harus sama dengan `src/routes/reports.js` dan frontend `src/lib/disaster.ts`
pada repository FE.

## Kontrak API

Semua respons berformat `{ "success": boolean, "data": ..., "error": string }`. Endpoint terproteksi
memakai header `Authorization: Bearer <token>` (JWT HS256, berlaku 7 hari).

| Method & path                     | Keterangan                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------- |
| `POST /api/v1/auth/register`      | `{ name, username, password }` → `{ token, user }` (409 jika username dipakai)                    |
| `POST /api/v1/auth/login`         | `{ username, password }` → `{ token, user }` (401 jika salah)                                     |
| `GET /api/v1/auth/me`             | User yang sedang login                                                                            |
| `PUT /api/v1/auth/profile`        | `{ name }` → user terbaru                                                                         |
| `PUT /api/v1/auth/password`       | `{ currentPassword, newPassword }` (400 jika password lama salah)                                 |
| `GET /api/v1/reports`             | 50 laporan terverifikasi, publik (tanpa identitas pelapor)                                        |
| `POST /api/v1/reports`            | `{ lat, lon, description, category?, severity?, imageData? }`; wajib login, status awal `pending` |
| `GET /api/v1/reports/mine`        | Laporan milik user beserta status moderasi                                                        |
| `GET /api/v1/reports/pending`     | Antrean laporan menunggu verifikasi admin                                                         |
| `PUT /api/v1/reports/:id/status`  | `{ status: "verified" \| "rejected" }`; admin saja                                                |
| `GET /api/v1/ai/credits`          | Saldo kredit, paket top-up, instruksi pembayaran dan riwayat                                      |
| `POST /api/v1/ai/topups`          | `{ packageId, paymentReference }`; meminta top-up kredit                                          |
| `POST /api/v1/ai/ask`             | `{ question, profile? }`; RAG personal, menghabiskan 1 kredit                                     |
| `GET /api/v1/ai/admin/topups`     | Daftar pembayaran yang menunggu konfirmasi admin                                                  |
| `PUT /api/v1/ai/admin/topups/:id` | `{ status: "approved" \| "rejected" }`; admin saja, approval memberi kredit                       |
| `GET /api/v1/news`                | Artikel internal                                                                                  |
| `GET /api/v1/news/external`       | Berita kebencanaan dari RSS (`NEWS_RSS_URL`)                                                      |
| `GET /api/v1/news/:slug`          | Detail artikel                                                                                    |
| `GET /api/v1/hotspots`            | `?bbox=barat,selatan,timur,utara&days=1-10`                                                       |
| `GET /api/v1/stats`               | `?lat&lon` opsional: titik panas 7 hari per provinsi + distribusi AQI                             |
| `GET /api/v1/environment`         | `?lat&lon`: cuaca dan kualitas udara                                                              |
| `GET /api/v1/safe-window`         | `?lat&lon`: jendela 2 jam PM2.5 terendah (06.00–18.00 WIB)                                        |
| `GET /api/v1/recommendations`     | `?aqi&profile=umum\|anak\|asma`: saran kesehatan berbasis aturan                                  |
| `GET /api/v1/trajectory`          | `?lat&lon` opsional: prediksi lintasan asap 24 jam dari data angin                                |
| `GET /health`                     | Cek koneksi database                                                                              |

Forum dan statistik dapat dibaca tanpa login. Pengiriman laporan membutuhkan akun;
laporan baru hanya tampil publik dan masuk ke peta setelah admin mengubah statusnya menjadi
`verified`. Pembayaran kredit saat ini berupa konfirmasi manual oleh admin, bukan payment gateway.
Asisten melakukan retrieval dari embedding PostgreSQL atas laporan terverifikasi, statistik, dan
berita database; penyedia API kompatibel OpenAI harus dikonfigurasi untuk menjalankan embeddings
dan inferensi.
