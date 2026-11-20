/** Batas wilayah Indonesia: barat, selatan, timur, utara. */
export const INDONESIA_BBOX = [95, -11, 141, 6];

/** Ibu kota provinsi sebagai titik acuan wilayah dan sampel kualitas udara. */
export const PROVINCES = [
	{ name: 'Aceh', lat: 5.548, lon: 95.323 },
	{ name: 'Sumatera Utara', lat: 3.595, lon: 98.672 },
	{ name: 'Sumatera Barat', lat: -0.947, lon: 100.417 },
	{ name: 'Riau', lat: 0.507, lon: 101.448 },
	{ name: 'Jambi', lat: -1.61, lon: 103.613 },
	{ name: 'Sumatera Selatan', lat: -2.976, lon: 104.775 },
	{ name: 'Bengkulu', lat: -3.8, lon: 102.266 },
	{ name: 'Lampung', lat: -5.397, lon: 105.266 },
	{ name: 'Bangka Belitung', lat: -2.129, lon: 106.113 },
	{ name: 'Kepulauan Riau', lat: 0.918, lon: 104.466 },
	{ name: 'DKI Jakarta', lat: -6.208, lon: 106.846 },
	{ name: 'Jawa Barat', lat: -6.917, lon: 107.619 },
	{ name: 'Jawa Tengah', lat: -6.967, lon: 110.417 },
	{ name: 'DI Yogyakarta', lat: -7.797, lon: 110.371 },
	{ name: 'Jawa Timur', lat: -7.257, lon: 112.752 },
	{ name: 'Banten', lat: -6.12, lon: 106.15 },
	{ name: 'Bali', lat: -8.65, lon: 115.217 },
	{ name: 'Nusa Tenggara Barat', lat: -8.583, lon: 116.117 },
	{ name: 'Nusa Tenggara Timur', lat: -10.178, lon: 123.607 },
	{ name: 'Kalimantan Barat', lat: -0.026, lon: 109.342 },
	{ name: 'Kalimantan Tengah', lat: -2.208, lon: 113.917 },
	{ name: 'Kalimantan Selatan', lat: -3.442, lon: 114.833 },
	{ name: 'Kalimantan Timur', lat: -0.502, lon: 117.154 },
	{ name: 'Kalimantan Utara', lat: 2.837, lon: 117.373 },
	{ name: 'Sulawesi Utara', lat: 1.474, lon: 124.842 },
	{ name: 'Sulawesi Tengah', lat: -0.899, lon: 119.87 },
	{ name: 'Sulawesi Selatan', lat: -5.147, lon: 119.432 },
	{ name: 'Sulawesi Tenggara', lat: -3.972, lon: 122.515 },
	{ name: 'Gorontalo', lat: 0.543, lon: 123.057 },
	{ name: 'Sulawesi Barat', lat: -2.68, lon: 118.886 },
	{ name: 'Maluku', lat: -3.695, lon: 128.181 },
	{ name: 'Maluku Utara', lat: 0.737, lon: 127.557 },
	{ name: 'Papua', lat: -2.533, lon: 140.717 },
	{ name: 'Papua Barat', lat: -0.861, lon: 134.062 },
	{ name: 'Papua Barat Daya', lat: -0.876, lon: 131.255 },
	{ name: 'Papua Tengah', lat: -3.366, lon: 135.496 },
	{ name: 'Papua Pegunungan', lat: -4.096, lon: 138.951 },
	{ name: 'Papua Selatan', lat: -8.499, lon: 140.405 }
];

const EARTH_RADIUS_KM = 6371;
const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

export function distanceKm(lat1, lon1, lat2, lon2) {
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a =
		Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
	return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/** Perkiraan provinsi: ibu kota provinsi terdekat (cukup untuk agregasi statistik). */
export function nearestProvince(lat, lon) {
	let best = PROVINCES[0];
	let bestDistance = Infinity;
	for (const province of PROVINCES) {
		const distance = distanceKm(lat, lon, province.lat, province.lon);
		if (distance < bestDistance) {
			best = province;
			bestDistance = distance;
		}
	}
	return best;
}

/** Titik tujuan setelah bergerak `distance` km ke arah `bearing` derajat dari utara. */
export function destination(lat, lon, bearing, distance) {
	const delta = distance / EARTH_RADIUS_KM;
	const theta = toRad(bearing);
	const phi1 = toRad(lat);
	const lambda1 = toRad(lon);
	const phi2 = Math.asin(
		Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta)
	);
	const lambda2 =
		lambda1 +
		Math.atan2(
			Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
			Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2)
		);
	return { lat: toDeg(phi2), lon: toDeg(lambda2) };
}
