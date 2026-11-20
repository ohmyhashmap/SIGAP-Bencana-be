import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseRss } from '../src/services/rss.js';

/** Helper: bungkus items dalam RSS envelope yang valid */
function rssDoc(items, channelTitle = 'CNBC Indonesia') {
	return `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>${channelTitle}</title>
    ${items}
  </channel>
</rss>`;
}

function rssItem({ title = '', link = '', pubDate = '', description = '', guid = '', image = '' } = {}) {
	const enclosure = image ? `<enclosure url="${image}" type="image/jpeg" length="0"/>` : '';
	return `<item>
    <title>${title}</title>
    <link>${link}</link>
    <guid>${guid || link}</guid>
    <pubDate>${pubDate}</pubDate>
    <description>${description}</description>
    ${enclosure}
  </item>`;
}

describe('parseRss', () => {
	it('mengembalikan array kosong untuk RSS tanpa item', () => {
		const xml = rssDoc('');
		const result = parseRss(xml);
		assert.deepEqual(result, []);
	});

	it('mem-parse satu item berita dengan benar', () => {
		const xml = rssDoc(rssItem({
			title: 'Gempa Bumi Guncang Jakarta',
			link: 'https://example.com/gempa-jakarta',
			pubDate: 'Thu, 20 Nov 2025 10:00:00 +0700',
			description: 'Gempa berkekuatan 5,2 SR mengguncang Jakarta.'
		}));
		const [item] = parseRss(xml);
		assert.ok(item, 'item tidak ditemukan');
		assert.equal(item.title, 'Gempa Bumi Guncang Jakarta');
		assert.equal(item.slug, 'https://example.com/gempa-jakarta');
		assert.equal(item.link, 'https://example.com/gempa-jakarta');
		assert.equal(item.category, 'Kabar Nasional');
		assert.equal(item.isExternal, true);
	});

	it('mengekstrak nama sumber dari judul channel (bagian terakhir setelah " - ")', () => {
		const xml = rssDoc(
			rssItem({ title: 'Banjir', link: 'https://x.com/1' }),
			'News - Berita Terkini - CNBC Indonesia'
		);
		const [item] = parseRss(xml);
		assert.equal(item.author, 'CNBC Indonesia');
	});

	it('menggunakan "Kabar Nasional" sebagai fallback author jika channel title tidak ada " - "', () => {
		const xml = rssDoc(
			rssItem({ title: 'Berita', link: 'https://x.com/1' }),
			'Portal Berita'
		);
		const [item] = parseRss(xml);
		assert.equal(item.author, 'Portal Berita');
	});

	it('mem-filter item tanpa title atau tanpa link', () => {
		const xml = rssDoc(
			rssItem({ title: '', link: 'https://x.com/tanpa-judul' }) +
			rssItem({ title: 'Ada Judul Tapi Tanpa Link', link: '' }) +
			rssItem({ title: 'Valid', link: 'https://x.com/valid' })
		);
		const result = parseRss(xml);
		assert.equal(result.length, 1);
		assert.equal(result[0].title, 'Valid');
	});

	it('memberi id berupa "ext-N" berdasarkan index', () => {
		const xml = rssDoc(
			rssItem({ title: 'A', link: 'https://x.com/a' }) +
			rssItem({ title: 'B', link: 'https://x.com/b' }) +
			rssItem({ title: 'C', link: 'https://x.com/c' })
		);
		const result = parseRss(xml);
		assert.equal(result[0].id, 'ext-0');
		assert.equal(result[1].id, 'ext-1');
		assert.equal(result[2].id, 'ext-2');
	});

	it('mengekstrak URL gambar dari tag enclosure', () => {
		const xml = rssDoc(rssItem({
			title: 'Foto Bencana',
			link: 'https://x.com/foto',
			image: 'https://cdn.example.com/foto.jpg'
		}));
		const [item] = parseRss(xml);
		assert.equal(item.image, 'https://cdn.example.com/foto.jpg');
	});

	it('mengekstrak URL gambar dari tag img di description jika enclosure tidak ada', () => {
		const xml = rssDoc(rssItem({
			title: 'Berita dengan Gambar',
			link: 'https://x.com/gambar',
			description: '<img src="https://cdn.example.com/img.jpg" alt="foto"/> Teks berita.'
		}));
		const [item] = parseRss(xml);
		assert.equal(item.image, 'https://cdn.example.com/img.jpg');
	});

	it('membersihkan tag HTML dari excerpt', () => {
		const xml = rssDoc(rssItem({
			title: 'Berita',
			link: 'https://x.com/1',
			description: '<p>Ini <strong>teks</strong> berita.</p>'
		}));
		const [item] = parseRss(xml);
		assert.ok(!item.excerpt.includes('<'), 'excerpt masih mengandung tag HTML');
		assert.ok(item.excerpt.includes('Ini'), 'teks tidak diekstrak dengan benar');
	});

	it('memotong excerpt lebih dari 150 karakter dengan "..."', () => {
		const longText = 'A'.repeat(200);
		const xml = rssDoc(rssItem({
			title: 'Panjang',
			link: 'https://x.com/panjang',
			description: longText
		}));
		const [item] = parseRss(xml);
		assert.ok(item.excerpt.endsWith('...'), 'excerpt panjang harus diakhiri ...');
		assert.ok(item.excerpt.length <= 153, `excerpt terlalu panjang: ${item.excerpt.length}`);
	});

	it('tidak memotong excerpt yang pendek', () => {
		const shortText = 'Teks singkat.';
		const xml = rssDoc(rssItem({
			title: 'Singkat',
			link: 'https://x.com/singkat',
			description: shortText
		}));
		const [item] = parseRss(xml);
		assert.equal(item.excerpt, shortText);
	});

	it('mendekode HTML entities di title dan excerpt', () => {
		const xml = rssDoc(rssItem({
			title: 'Banjir &amp; Longsor di Palu',
			link: 'https://x.com/1',
			description: 'Kerugian &gt; Rp 1 miliar'
		}));
		const [item] = parseRss(xml);
		assert.ok(item.title.includes('&'), `expected '&' in title, got: ${item.title}`);
		assert.ok(item.excerpt.includes('>'), `expected '>' in excerpt, got: ${item.excerpt}`);
	});

	it('menggunakan guid sebagai fallback link jika tag link kosong', () => {
		const xml = rssDoc(`<item>
			<title>Berita</title>
			<link></link>
			<guid>https://x.com/guid-fallback</guid>
			<description>Deskripsi</description>
		</item>`);
		const [item] = parseRss(xml);
		assert.equal(item.link, 'https://x.com/guid-fallback');
	});

	it('mem-parse CDATA di tag title dan description', () => {
		const xml = rssDoc(`<item>
			<title><![CDATA[Bencana Alam Melanda]]></title>
			<link>https://x.com/cdata</link>
			<description><![CDATA[Banjir bandang terjadi di Sulawesi.]]></description>
		</item>`);
		const [item] = parseRss(xml);
		assert.equal(item.title, 'Bencana Alam Melanda');
		assert.ok(item.excerpt.includes('Banjir bandang'), `excerpt tidak sesuai: ${item.excerpt}`);
	});

	it('mem-parse banyak item sekaligus', () => {
		const items = Array.from({ length: 5 }, (_, i) =>
			rssItem({ title: `Berita ${i + 1}`, link: `https://x.com/${i + 1}` })
		).join('\n');
		const xml = rssDoc(items);
		const result = parseRss(xml);
		assert.equal(result.length, 5);
	});
});
