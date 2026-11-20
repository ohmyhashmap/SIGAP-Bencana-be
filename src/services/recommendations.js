// Sistem pakar berbasis aturan: 4 tingkat AQI x 3 profil = 12 aturan.
const RULES = {
	umum: [
		'Kualitas udara baik. Aman beraktivitas di luar ruangan seperti biasa.',
		'Kualitas udara sedang. Kurangi aktivitas fisik berat yang lama di luar ruangan.',
		'Udara tidak sehat. Batasi aktivitas di luar dan gunakan masker N95 bila harus keluar.',
		'Udara sangat buruk. Tetap di dalam ruangan, tutup jendela, dan nyalakan penjernih udara bila ada.'
	],
	anak: [
		'Anak aman bermain dan berolahraga di luar ruangan.',
		'Anak boleh bermain di luar, tetapi batasi olahraga berat dan pastikan cukup minum.',
		'Tunda kegiatan sekolah di luar ruangan. Anak sebaiknya bermain di dalam dan memakai masker anak saat bepergian.',
		'Anak tetap di dalam ruangan. Pertimbangkan belajar dari rumah dan segera ke fasilitas kesehatan bila batuk atau sesak.'
	],
	asma: [
		'Kondisi aman. Tetap bawa inhaler sebagai antisipasi.',
		'Kurangi aktivitas di luar ruangan dan selalu bawa inhaler.',
		'Hindari keluar rumah. Siapkan inhaler atau obat pereda sesak dan gunakan masker N95 bila terpaksa keluar.',
		'Bahaya! Tetap di ruangan tertutup dengan udara bersih dan segera cari pertolongan medis bila sesak memburuk.'
	]
};

export const PROFILES = Object.keys(RULES);

/** Tingkat AQI mengikuti pembagian di frontend: <=50, <=100, <=200, >200. */
export function aqiLevel(aqi) {
	if (aqi <= 50) return 0;
	if (aqi <= 100) return 1;
	if (aqi <= 200) return 2;
	return 3;
}

export function recommend(aqi, profile) {
	return RULES[profile][aqiLevel(aqi)];
}
