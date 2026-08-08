import { collectionHref } from '#app/routes/archive/+shared/filters.ts'
import { cache, cachified } from '#app/utils/cache.server.ts'
import { prisma } from '#app/utils/db.server.ts'

/**
 * The sitemap, written out rather than derived from the route manifest.
 *
 * `generateSitemap` walks the compiled routes, so it can only ever emit the
 * static ones. It published sixteen URLs — among them the literal splat `/*`
 * and `/settings/profile/passkeys` — and none of the 54,497 dossiers that are
 * the reason the archive exists.
 *
 * A crawler handed that file has to reach the works by walking the paginated
 * index instead, which is both the expensive road and, since the index opens on
 * a deal that is recut daily, one that answers differently on every visit:
 * `/?page=5` is not a stable address for a set of works, so incremental
 * crawling can never settle. Listing the dossiers here is what makes the
 * pagination a convenience rather than the only way in.
 */

/**
 * How many works one sitemap file carries.
 *
 * The protocol's ceiling is 50,000 URLs per file and the corpus is already
 * 54,497, so one file was never going to be enough and an index is required
 * regardless. 25,000 leaves room for the corpus to grow by half again before
 * the chunk count changes, and keeps each file near 1 MB — well inside both the
 * 50 MB limit and what the cache tier will hold.
 */
export const WORKS_PER_SITEMAP = 25_000

/**
 * Long, because this changes only when the corpus is reingested, and a sitemap
 * is the one document on the site whose freshness nobody is waiting on.
 */
const TTL = 1000 * 60 * 60 * 6
const SWR = 1000 * 60 * 60 * 24

/**
 * The public pages that exist whatever the archive holds.
 *
 * `/archive` is deliberately absent: §5 renders it and `/` from one
 * implementation, and a sitemap that lists both is asking two addresses to
 * compete for the same content. `/` is the one the site calls its homepage, so
 * it is the one advertised. The drift's readout and session are absent for a
 * different reason — they are the state of one reader's passage, not pages.
 */
export const STATIC_PATHS = [
	'/',
	'/about',
	'/essays',
	'/glossary',
	'/support',
	'/privacy',
	'/tos',
	'/archive/atlas',
	'/archive/drift',
]

export async function workCount(): Promise<number> {
	return cachified({
		key: 'sitemap:work-count:v1',
		cache,
		ttl: TTL,
		staleWhileRevalidate: SWR,
		getFreshValue: () => prisma.resource.count(),
	})
}

/** How many work sitemaps the index should point at. At least one, even empty. */
export async function chunkCount(): Promise<number> {
	return Math.max(1, Math.ceil((await workCount()) / WORKS_PER_SITEMAP))
}

/**
 * One chunk of dossier ids, ordered by id.
 *
 * Ordered by the primary key rather than anything meaningful, because the only
 * requirement is that the chunks partition the corpus the same way twice — a
 * work that moves between files on every crawl is a work that gets recrawled
 * forever. `shuffle` would be stable too, but id is stable *and* legible when
 * someone is looking at why a URL is in one file rather than another.
 */
export async function workIds(chunk: number): Promise<Array<number>> {
	return cachified({
		key: `sitemap:works:v1:${chunk}`,
		cache,
		ttl: TTL,
		staleWhileRevalidate: SWR,
		async getFreshValue() {
			const rows = await prisma.resource.findMany({
				orderBy: { id: 'asc' },
				skip: (chunk - 1) * WORKS_PER_SITEMAP,
				take: WORKS_PER_SITEMAP,
				select: { id: true },
			})
			return rows.map((row) => row.id)
		},
	})
}

/**
 * The reconciled holders, as collection pages.
 *
 * Filtered to those actually holding something, for the reason the facet list
 * is: a register entry with no works is a page that promises a collection and
 * then shows an empty one, and there is no sense inviting a crawler to it.
 */
export async function collectionPaths(): Promise<Array<string>> {
	return cachified({
		key: 'sitemap:collections:v1',
		cache,
		ttl: TTL,
		staleWhileRevalidate: SWR,
		async getFreshValue() {
			const rows = await prisma.institution.findMany({
				where: { deletedAt: null, wikiDataId: { not: null } },
				select: {
					wikiDataId: true,
					_count: { select: { resources: true } },
				},
				orderBy: { name: 'asc' },
			})
			return rows
				.filter((row) => row.wikiDataId && row._count.resources > 0)
				.map((row) => collectionHref(row.wikiDataId!))
		},
	})
}

/**
 * Neither ids nor QIDs can carry a character that matters here, but the escape
 * is unconditional anyway: the day one of them can, the sitemap should bend
 * rather than break.
 */
function escapeXml(value: string): string {
	return value.replace(
		/[&<>"']/g,
		(char) =>
			({
				'&': '&amp;',
				'<': '&lt;',
				'>': '&gt;',
				'"': '&quot;',
				"'": '&apos;',
			})[char]!,
	)
}

function xml(body: string): Response {
	return new Response(body, {
		headers: {
			'Content-Type': 'application/xml; charset=utf-8',
			'Cache-Control': `public, max-age=${60 * 60}`,
		},
	})
}

/** A sitemap: paths, made absolute against the origin they were requested on. */
export function urlSet(origin: string, paths: Array<string>): Response {
	const urls = paths
		.map((path) => `  <url><loc>${escapeXml(origin + path)}</loc></url>`)
		.join('\n')
	return xml(
		`<?xml version="1.0" encoding="UTF-8"?>\n` +
			`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
	)
}

/** A sitemap index, which may hold sitemaps and nothing else. */
export function sitemapIndex(origin: string, paths: Array<string>): Response {
	const maps = paths
		.map((path) => `  <sitemap><loc>${escapeXml(origin + path)}</loc></sitemap>`)
		.join('\n')
	return xml(
		`<?xml version="1.0" encoding="UTF-8"?>\n` +
			`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${maps}\n</sitemapindex>\n`,
	)
}
