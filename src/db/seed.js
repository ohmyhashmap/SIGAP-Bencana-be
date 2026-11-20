import { hashPassword } from '../lib/auth.js';
import { query } from './pool.js';

const unsplash = (id, width = 1200) =>
	`https://images.unsplash.com/photo-${id}?auto=format&fit=crop&q=80&w=${width}`;

export const SEED_NEWS = [
	{
		slug: 'siaga-banjir-musim-hujan',
		title: 'Siaga Banjir Musim Hujan: Langkah Persiapan untuk Setiap Keluarga',
		category: 'Banjir',
		author: 'Tim SIGAP Bencana',
		image: unsplash('1547683905-f686c993aae5'),
		excerpt:
			'Puncak musim hujan diprediksi berlangsung Desember hingga Februari. Warga di bantaran sungai dan dataran rendah diminta meningkatkan kesiapsiagaan.',
		content:
			'Curah hujan tinggi berpotensi memicu banjir dan genangan di banyak wilayah. Pastikan saluran air di sekitar rumah bebas sampah, simpan dokumen penting dalam wadah kedap air, dan kenali jalur evakuasi menuju tempat yang lebih tinggi. Saat air mulai naik, matikan aliran listrik dari panel utama dan jangan menyeberangi arus deras, baik berjalan kaki maupun berkendara.'
	},
	{
		slug: 'waspada-puting-beliung-cuaca-ekstrem',
		title: 'Waspada Angin Puting Beliung dan Cuaca Ekstrem pada Masa Pancaroba',
		category: 'Cuaca Ekstrem',
		author: 'Redaksi Kebencanaan',
		image: unsplash('1527482797697-8795b05a13fe', 800),
		excerpt:
			'Peralihan musim membawa awan cumulonimbus yang dapat memicu hujan lebat disertai petir dan angin kencang dalam waktu singkat.',
		content:
			'Tanda awal cuaca ekstrem antara lain udara terasa sangat panas pada pagi hari lalu muncul awan gelap menjulang pada siang hari. Saat angin kencang datang, jauhi pohon besar, baliho, dan bangunan rapuh. Pantau peringatan dini cuaca dari BMKG dan amankan benda-benda di luar rumah yang mudah terbawa angin.'
	},
	{
		slug: 'erupsi-gunung-api-patuhi-zona-bahaya',
		title: 'Erupsi Gunung Api: Patuhi Radius Zona Bahaya dan Siapkan Masker',
		category: 'Gunung Api',
		author: 'Tim SIGAP Bencana',
		image: unsplash('1554232682-b9ef9c92f8de', 800),
		excerpt:
			'Peningkatan status aktivitas gunung api selalu disertai rekomendasi radius aman. Warga dan wisatawan diminta tidak memasuki zona bahaya.',
		content:
			'Abu vulkanik dapat mengganggu pernapasan dan penglihatan serta membuat jalan licin. Gunakan masker dan kacamata pelindung, tutup sumber air terbuka, dan ikuti arahan petugas saat evakuasi. Informasi status gunung api terbaru dapat dipantau melalui kanal resmi PVMBG dan BPBD setempat.'
	},
	{
		slug: 'lintasan-asap-karhutla-sumatera-utara',
		title: 'Peringatan Dini: Lintasan Asap Karhutla Berpotensi Menuju Sumatera Utara',
		category: 'Karhutla',
		author: 'Tim Riset',
		image: unsplash('1611273426858-450d8e3c9fce'),
		excerpt:
			'Pemodelan arah angin menunjukkan asap dari titik panas di wilayah tetangga dapat terbawa ke Sumatera Utara dalam 24 jam ke depan.',
		content:
			'Kabut asap lintas wilayah dapat menurunkan kualitas udara meskipun tidak ada titik api lokal. Pantau peta titik panas dan prediksi lintasan asap di SIGAP Bencana, kurangi aktivitas luar ruangan saat kualitas udara memburuk, dan gunakan masker N95 bila harus bepergian.'
	},
	{
		slug: 'tas-siaga-bencana-dan-nomor-darurat',
		title: 'Siapkan Tas Siaga Bencana dan Simpan Nomor Darurat Sekarang',
		category: 'Kesiapsiagaan',
		author: 'Redaksi Kebencanaan',
		image: unsplash('1525598912003-663126343e1f', 800),
		excerpt:
			'Gempa bumi dan bencana lain sering terjadi tanpa peringatan. Tas siaga dan daftar kontak darurat membantu keluarga bertindak cepat.',
		content:
			'Isi tas siaga dengan air minum, makanan tahan lama, obat-obatan pribadi, senter, peluit, salinan dokumen penting, dan pengisi daya cadangan. Simpan nomor darurat 112, BPBD setempat, dan Basarnas di ponsel setiap anggota keluarga. Saat gempa, lakukan langkah merunduk, berlindung, dan berpegangan hingga guncangan berhenti.'
	},
	{
		slug: 'panduan-kesehatan-kelompok-rentan',
		title: 'Panduan Kesehatan Kelompok Rentan Saat Kualitas Udara Memburuk',
		category: 'Kesehatan',
		author: 'Redaksi Medis',
		image: unsplash('1612531386530-97286d97c2d2', 800),
		excerpt:
			'Anak-anak, lansia, dan penderita asma paling berisiko saat terpapar asap dan abu. Kenali gejala yang perlu segera ditangani.',
		content:
			'Paparan partikel halus PM2.5 dapat memicu ISPA dan memperburuk penyakit pernapasan. Batasi aktivitas luar ruangan, cukupi kebutuhan cairan, dan siapkan obat rutin. Segera ke fasilitas kesehatan bila muncul sesak napas, nyeri dada, atau batuk yang tidak kunjung reda.'
	},
	{
		slug: 'integrasi-data-satelit-peringatan-dini',
		title: 'Integrasi Data Satelit dan Laporan Warga untuk Peringatan Dini Bencana',
		category: 'Teknologi',
		author: 'Tim Riset',
		image: unsplash('1451187580459-43490279c0fa', 800),
		excerpt:
			'Penggabungan data satelit, prakiraan cuaca, dan laporan lapangan membuat informasi kebencanaan lebih cepat dan tepat sasaran.',
		content:
			'SIGAP Bencana memadukan titik panas NASA FIRMS, prakiraan cuaca dan kualitas udara Open-Meteo, serta laporan warga yang tersimpan di basis data PostgreSQL. Data ini diolah menjadi peta interaktif, statistik, dan rekomendasi tindakan yang mudah dipahami masyarakat.'
	}
];

export async function seedNews() {
	// Tanggal terbit dibuat berurutan agar artikel pertama tampil paling atas.
	for (const [index, article] of SEED_NEWS.entries()) {
		await query(
			`INSERT INTO news (slug, title, category, author, excerpt, content, image, published_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, now() - make_interval(hours => $8))
			 ON CONFLICT (slug) DO UPDATE SET
				title = EXCLUDED.title, category = EXCLUDED.category, author = EXCLUDED.author,
				excerpt = EXCLUDED.excerpt, content = EXCLUDED.content, image = EXCLUDED.image`,
			[
				article.slug,
				article.title,
				article.category,
				article.author,
				article.excerpt,
				article.content,
				article.image,
				index * 12
			]
		);
	}
	return SEED_NEWS.length;
}

export async function seedUser({
	username = process.env.SEED_USERNAME || 'auditor',
	password = process.env.SEED_PASSWORD || 'Auditor123!',
	name = 'Auditor SIGAP Bencana'
} = {}) {
	const passwordHash = await hashPassword(password);
	await query(
		`INSERT INTO users (username, name, password_hash) VALUES ($1, $2, $3)
		 ON CONFLICT ((lower(username))) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = now()`,
		[username, name, passwordHash]
	);
	return username;
}
