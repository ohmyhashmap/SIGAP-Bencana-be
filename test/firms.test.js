import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseFirmsCsv } from '../src/services/firms.js';

describe('parseFirmsCsv', () => {
	it('mengubah CSV VIIRS dan MODIS menjadi hotspot', () => {
		const csv = [
			'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight',
			'0.51,101.45,330.1,0.4,0.4,2026-11-10,612,N,VIIRS,h,2.0NRT,290.2,12.5,D',
			'-2.2,113.9,320.4,0.4,0.4,2026-11-10,1845,N,VIIRS,l,2.0NRT,288.1,,N',
			'1.1,100.2,320.4,0.4,0.4,2026-11-10,0030,T,MODIS,74,6.1NRT,288.1,3.1,N',
			'bukan,angka,0,0,0,2026-11-10,0000,N,VIIRS,n,2.0NRT,0,0,D'
		].join('\n');

		assert.deepEqual(parseFirmsCsv(csv), [
			{
				lat: 0.51,
				lon: 101.45,
				confidence: 90,
				frp: 12.5,
				satellite: 'N',
				detectedAt: new Date('2026-11-10T06:12:00Z')
			},
			{
				lat: -2.2,
				lon: 113.9,
				confidence: 30,
				frp: null,
				satellite: 'N',
				detectedAt: new Date('2026-11-10T18:45:00Z')
			},
			{
				lat: 1.1,
				lon: 100.2,
				confidence: 74,
				frp: 3.1,
				satellite: 'T',
				detectedAt: new Date('2026-11-10T00:30:00Z')
			}
		]);
	});

	it('menolak respons yang bukan CSV FIRMS', () => {
		assert.throws(() => parseFirmsCsv('Invalid MAP_KEY.'), /tidak dikenali/);
	});
});
