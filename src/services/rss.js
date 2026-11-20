import { config } from '../config.js';
import { cached, fetchText } from '../lib/http.js';

const DISASTER_KEYWORDS =
	/bencana|banjir|gempa|longsor|tsunami|erupsi|gunung api|vulkan|karhutla|kebakaran hutan|kebakaran lahan|kabut asap|titik panas|cuaca ekstrem|puting beliung|angin kencang|kekeringan|abrasi|\brob\b|bmkg|bnpb|bpbd|basarnas/i;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(text) {
	return text
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&(\w+);/g, (match, name) => ENTITIES[name] ?? match);
}

function tag(xml, name) {
	const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
	if (!match) return '';
	return match[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1').trim();
}

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max).trimEnd()}...` : text);

/** Parser RSS 2.0 sederhana; menghasilkan item berformat berita eksternal frontend. */
export function parseRss(xml) {
	const channelTitle = decode(tag(xml.split('<item')[0], 'title'));
	// "News - Berita ... - CNBC Indonesia" -> "CNBC Indonesia"
	const source = channelTitle.split(' - ').at(-1) || 'Kabar Nasional';

	return xml
		.split(/<item[\s>]/)
		.slice(1)
		.map((chunk) => chunk.split('</item>')[0])
		.map((item, index) => {
			const link = decode(tag(item, 'link') || tag(item, 'guid'));
			const description = tag(item, 'description');
			const image =
				item.match(/<enclosure[^>]*url="([^"]+)"/)?.[1] ??
				item.match(/<media:content[^>]*url="([^"]+)"/)?.[1] ??
				description.match(/<img[^>]*src="([^"]+)"/)?.[1] ??
				'';
			const excerpt = decode(description.replace(/<[^>]*>/g, ' '))
				.replace(/\s+/g, ' ')
				.trim();
			return {
				id: `ext-${index}`,
				slug: link,
				title: decode(tag(item, 'title')),
				category: 'Kabar Nasional',
				date: tag(item, 'pubDate'),
				author: source,
				image: decode(image),
				excerpt: truncate(excerpt, 150),
				isExternal: true,
				link
			};
		})
		.filter((item) => item.title && item.link);
}

/** Berita nasional terkait kebencanaan; bila tidak ada yang cocok, tampilkan berita terbaru. */
export function getExternalNews() {
	return cached('external-news', 15 * 60 * 1000, async () => {
		const items = parseRss(await fetchText(config.newsRssUrl));
		const related = items.filter((item) => DISASTER_KEYWORDS.test(`${item.title} ${item.excerpt}`));
		return (related.length > 0 ? related : items).slice(0, 10);
	});
}
