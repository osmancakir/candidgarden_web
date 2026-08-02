import { verificationLabel } from '#app/utils/archive.ts'
import { cache, cachified } from '#app/utils/cache.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { type Timings } from '#app/utils/timing.server.ts'
import { type Prisma } from '#prisma-client'
import {
	PAGE_SIZE,
	parseFilters,
	type ArchiveFacets,
	type ArchiveFilters,
	type ArchiveIndexData,
} from './filters.ts'

/**
 * The filter console's queries (§5, §6).
 *
 * Every filter is a URL parameter and every parameter is optional, so the
 * console degrades to a plain GET form and any view of the archive can be cited
 * by its address. The URL contract itself lives in `./filters.ts`.
 */

/** How many motif chips a single index row or card carries. */
const MOTIFS_PER_WORK = 12

function buildWhere(f: ArchiveFilters): Prisma.ResourceWhereInput {
	// Conditions are collected into AND so that two filters touching the same
	// relation (motif and agreement both hit `taggings`) compose instead of
	// overwriting each other.
	const and: Array<Prisma.ResourceWhereInput> = []

	if (f.q) {
		and.push({
			OR: [
				{ title: { contains: f.q, mode: 'insensitive' } },
				{ titleEn: { contains: f.q, mode: 'insensitive' } },
				{ artist: { name: { contains: f.q, mode: 'insensitive' } } },
			],
		})
	}

	if (f.motif) {
		and.push({
			taggings: {
				some: { tag: { name: { equals: f.motif, mode: 'insensitive' } } },
			},
		})
	}

	if (f.category) {
		and.push({ taggings: { some: { tag: { category: f.category } } } })
	}

	if (f.institution) {
		and.push({ institution: f.institution })
	}

	if (f.century != null) {
		// A work belongs to a century if either bound falls inside it. Works with
		// no dates at all are excluded rather than guessed into a bucket.
		const start = (f.century - 1) * 100 + 1
		const end = f.century * 100
		and.push({
			OR: [
				{ notBefore: { gte: start, lte: end } },
				{ notAfter: { gte: start, lte: end } },
			],
		})
	}

	if (f.minAgreement > 0) {
		and.push({ taggings: { some: { frequency: { gte: f.minAgreement } } } })
	}

	if (f.verification) {
		if (f.verification === 'UNREVIEWED') {
			and.push({ wikiDataVerification: { is: null } })
		} else {
			and.push({ wikiDataVerification: { is: { status: f.verification } } })
		}
	}

	return and.length ? { AND: and } : {}
}

function orderBy(
	sort: ArchiveFilters['sort'],
): Prisma.ResourceOrderByWithRelationInput[] {
	switch (sort) {
		case 'period':
			// `nulls: 'last'` keeps undated works from crowding the head of a
			// chronological view — they are shown, but they are shown last.
			return [{ notBefore: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }]
		case 'motifs':
			return [{ taggings: { _count: 'desc' } }, { id: 'asc' }]
		default:
			return [{ title: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }]
	}
}

export async function loadIndex(
	url: URL,
	timings?: Timings,
): Promise<ArchiveIndexData> {
	const filters = parseFilters(url)
	const where = buildWhere(filters)
	const skip = (filters.page - 1) * PAGE_SIZE

	const [total, rows] = await Promise.all([
		prisma.resource.count({ where }),
		prisma.resource.findMany({
			where,
			orderBy: orderBy(filters.sort),
			skip,
			take: PAGE_SIZE,
			select: {
				id: true,
				title: true,
				titleEn: true,
				notBefore: true,
				notAfter: true,
				institution: true,
				objectKey: true,
				artist: { select: { name: true } },
				wikiDataVerification: { select: { status: true, verifiedAt: true } },
				taggings: {
					orderBy: { frequency: 'desc' },
					take: MOTIFS_PER_WORK,
					select: {
						frequency: true,
						tag: {
							select: { id: true, name: true, category: true, human: true },
						},
					},
				},
			},
		}),
	])

	// Agreement is normalised per work: the strongest tagging on a work is 1.00
	// and everything else is read against it. This is an observed agreement
	// rate, not a model probability, and the dossier says so.
	const works = rows.map((r) => {
		const maxFrequency = r.taggings[0]?.frequency ?? 0
		return {
			id: r.id,
			title: r.title ?? r.titleEn,
			artist: r.artist?.name ?? null,
			notBefore: r.notBefore,
			notAfter: r.notAfter,
			institution: r.institution,
			objectKey: r.objectKey,
			verification: verificationLabel(r.wikiDataVerification?.status),
			verifiedAt: r.wikiDataVerification?.verifiedAt ?? null,
			maxFrequency,
			taggings: r.taggings.map((t) => ({
				id: t.tag.id,
				name: t.tag.name,
				category: t.tag.category,
				frequency: t.frequency,
				human: t.tag.human,
			})),
		}
	})

	const facets = await loadFacets(timings)

	return {
		filters,
		total,
		works,
		facets,
		pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
	}
}

/**
 * The console's option lists. These change only when the corpus is reingested,
 * so they are cached rather than recomputed on every keystroke of the filter
 * form — a `DISTINCT` across 66,000 rows is not a per-request cost worth
 * paying.
 */
async function loadFacets(timings?: Timings): Promise<ArchiveFacets> {
	return cachified({
		key: 'archive:facets:v1',
		cache,
		timings,
		ttl: 1000 * 60 * 60 * 6,
		staleWhileRevalidate: 1000 * 60 * 60 * 24,
		async getFreshValue() {
			const [categories, institutions, centuries] = await Promise.all([
				prisma.tag.findMany({
					where: { category: { not: null } },
					distinct: ['category'],
					select: { category: true },
					orderBy: { category: 'asc' },
					take: 60,
				}),
				prisma.resource.findMany({
					where: { institution: { not: null } },
					distinct: ['institution'],
					select: { institution: true },
					orderBy: { institution: 'asc' },
					take: 200,
				}),
				prisma.$queryRaw<Array<{ century: number; count: bigint }>>`
					SELECT FLOOR((COALESCE("not_before", "not_after") - 1) / 100) + 1 AS century,
					       COUNT(*)::bigint AS count
					FROM "Resource"
					WHERE COALESCE("not_before", "not_after") IS NOT NULL
					GROUP BY century
					ORDER BY century ASC
				`,
			])

			return {
				categories: categories
					.map((c) => c.category)
					.filter((c): c is string => Boolean(c)),
				institutions: institutions
					.map((i) => i.institution)
					.filter((i): i is string => Boolean(i)),
				centuries: centuries.map((c) => ({
					century: Number(c.century),
					count: Number(c.count),
				})),
			}
		},
	})
}
