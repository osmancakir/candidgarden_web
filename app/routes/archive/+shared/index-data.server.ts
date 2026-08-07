import { verificationLabel } from '#app/utils/archive.ts'
import { cache, cachified } from '#app/utils/cache.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	searchInterpretations,
	type SemanticHit,
} from '#app/utils/semantic-search.server.ts'
import { type Timings } from '#app/utils/timing.server.ts'
import { type Prisma } from '#prisma-client'
import {
	dealOffset,
	isInstitutionId,
	isSenseMode,
	PAGE_SIZE,
	parseFilters,
	type ArchiveFacets,
	type ArchiveFilters,
	type ArchiveIndexData,
	type ArchiveWork,
	type ReadingMatch,
	type SenseCoverage,
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

/**
 * How many works the vector index is asked for before the facets narrow them.
 *
 * This is the whole cost of post-filtering: the facets cannot be pushed into
 * the ANN scan, so the scan has to be wide enough that a narrow facet still has
 * something to keep. 400 is roughly six pages of survivors in the common case
 * and stays well inside what an IVFFlat scan on the 1 GB instance will do
 * without complaint. It is also a ceiling the interface has to admit to — a
 * `sense` result is never "every work in the archive that matches", and
 * `SenseReport.capped` says so when the ceiling is reached.
 */
const SENSE_CANDIDATES = 400

/** How much of a matched passage is shown beside a result. */
const EXCERPT_LENGTH = 180

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
		// A QID collects every spelling the archive used for one holder — the
		// Rijksmuseum is filed under four of them and the Hamburger Kunsthalle
		// under ten. A legacy literal can only ever match its own spelling, which
		// is precisely the limitation the register exists to remove.
		and.push(
			isInstitutionId(f.institution)
				? { institutionRef: { is: { wikiDataId: f.institution } } }
				: { institution: f.institution },
		)
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

/**
 * The order of the deal: the stored permutation, tie-broken by id.
 *
 * `shuffle` is a double and collisions across 54,497 draws are vanishingly
 * unlikely, but an order that is only *almost* total is one Postgres may return
 * differently on two runs of the same query — which for a paginated ring means
 * a work shown twice and another never.
 */
const DEAL_ORDER: Prisma.ResourceOrderByWithRelationInput[] = [
	{ shuffle: 'asc' },
	{ id: 'asc' },
]

function orderBy(
	sort: ArchiveFilters['sort'],
): Prisma.ResourceOrderByWithRelationInput[] {
	switch (sort) {
		case 'chance':
			return DEAL_ORDER
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

/** Everything an index row needs, in both modes. */
const WORK_SELECT = {
	id: true,
	title: true,
	titleEn: true,
	notBefore: true,
	notAfter: true,
	institution: true,
	institutionRef: { select: { name: true, wikiDataId: true } },
	objectKey: true,
	artist: { select: { name: true } },
	wikiDataVerification: { select: { status: true, verifiedAt: true } },
	taggings: {
		orderBy: { frequency: 'desc' },
		take: MOTIFS_PER_WORK,
		select: {
			frequency: true,
			tag: { select: { id: true, name: true, category: true, human: true } },
		},
	},
} satisfies Prisma.ResourceSelect

type WorkRow = Prisma.ResourceGetPayload<{ select: typeof WORK_SELECT }>

function toWork(r: WorkRow, match: ReadingMatch | null = null): ArchiveWork {
	// Agreement is normalised per work: the strongest tagging on a work is 1.00
	// and everything else is read against it. This is an observed agreement
	// rate, not a model probability, and the dossier says so.
	const maxFrequency = r.taggings[0]?.frequency ?? 0
	return {
		id: r.id,
		title: r.title ?? r.titleEn,
		artist: r.artist?.name ?? null,
		notBefore: r.notBefore,
		notAfter: r.notAfter,
		institution: r.institution,
		collection: r.institutionRef,
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
		match,
	}
}

export async function loadIndex(
	url: URL,
	timings?: Timings,
): Promise<ArchiveIndexData> {
	const filters = parseFilters(url)
	return isSenseMode(filters)
		? loadRankedIndex(filters, timings)
		: loadFilteredIndex(filters, timings)
}

/**
 * The ordinary index: filtered in SQL, sorted by a column, paginated by the
 * database.
 */
async function loadFilteredIndex(
	filters: ArchiveFilters,
	timings?: Timings,
	sense: ArchiveIndexData['sense'] = null,
): Promise<ArchiveIndexData> {
	const where = buildWhere(filters)
	const skip = (filters.page - 1) * PAGE_SIZE

	const [total, rows] =
		filters.sort === 'chance'
			? // A deal has to be counted before it can be cut, so this one pays a
				// round trip the column orders do not — see `dealPage`.
				await dealPage(filters, where)
			: await Promise.all([
					prisma.resource.count({ where }),
					prisma.resource.findMany({
						where,
						orderBy: orderBy(filters.sort),
						skip,
						take: PAGE_SIZE,
						select: WORK_SELECT,
					}),
				])

	const facets = await loadFacets(timings)

	return {
		filters,
		total,
		works: rows.map((r) => toWork(r)),
		facets,
		pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
		sense,
	}
}

/**
 * One page of a deal, and the size of the pack it was dealt from.
 *
 * The permutation is stored, so a deal is a *cut* rather than a shuffle: the
 * seed picks a place in `Resource.shuffle` and the page is the sixty works from
 * there. Cutting rather than reshuffling is what lets the same rows be paged
 * through — `ORDER BY random()` would deal a new deck on every page turn and
 * show the reader works they had already passed.
 *
 * The deal is a ring. A page that runs off the end of the permutation is
 * completed from the front of it, so whichever cut a reader is dealt, turning
 * every page still shows them every work exactly once.
 *
 * Two round trips at worst, and the count is the first of them because the cut
 * cannot be placed without knowing what it is cutting into.
 */
async function dealPage(
	filters: ArchiveFilters,
	where: Prisma.ResourceWhereInput,
): Promise<[number, Array<WorkRow>]> {
	const total = await prisma.resource.count({ where })
	const skip = (filters.page - 1) * PAGE_SIZE
	// `?page=9999` is reachable by hand and by a stale link. It is empty, as it
	// is under every other order — the ring closes over the result set, not over
	// the reader's arithmetic.
	if (skip >= total) return [total, []]

	const take = Math.min(PAGE_SIZE, total - skip)
	const from = (skip + dealOffset(filters.seed, total)) % total
	const head = await prisma.resource.findMany({
		where,
		orderBy: DEAL_ORDER,
		skip: from,
		take,
		select: WORK_SELECT,
	})
	if (head.length >= take) return [total, head]

	const tail = await prisma.resource.findMany({
		where,
		orderBy: DEAL_ORDER,
		take: take - head.length,
		select: WORK_SELECT,
	})
	return [total, [...head, ...tail]]
}

/**
 * The index ranked by meaning: the vector index proposes, the facets dispose.
 *
 * The two halves cannot be one query. pgvector's IVFFlat index is consulted
 * before any `WHERE` on `Resource` can be applied, so a filter pushed into the
 * ANN scan either defeats the index or silently changes what "nearest" means.
 * The honest arrangement is therefore post-filtering: take a wide band of
 * nearest works, narrow it in SQL, and disclose both numbers to the reader so a
 * thin page reads as the fact it is rather than as an absence of matching art.
 *
 * Ordering and pagination move into memory here for the same reason — the rank
 * exists only in the vector result, and asking Postgres to re-sort by it would
 * mean shipping 400 distances into the query.
 */
async function loadRankedIndex(
	filters: ArchiveFilters,
	timings?: Timings,
): Promise<ArchiveIndexData> {
	let hits: Array<SemanticHit>
	try {
		hits = await senseCandidates(filters.sense, timings)
	} catch (error) {
		// The index is the homepage (§5). A Workers AI outage or a missing grant
		// on the embedding table must cost the reader the ranking, not the
		// archive, so this degrades to the filtered index carrying a notice.
		console.error('sense search failed', error)
		return loadFilteredIndex(filters, timings, {
			query: filters.sense,
			candidates: 0,
			matched: 0,
			capped: false,
			coverage: null,
			error: 'The reading index could not be consulted.',
		})
	}

	const byId = new Map(hits.map((hit) => [hit.resourceId, hit]))

	// `buildWhere` may return `{}`; nesting it in an AND keeps this valid either
	// way and keeps the two conditions from overwriting one another.
	const rows = byId.size
		? await prisma.resource.findMany({
				where: { AND: [buildWhere(filters), { id: { in: [...byId.keys()] } }] },
				take: byId.size,
				select: WORK_SELECT,
			})
		: []

	const ranked = rows
		.map((row) => ({ row, hit: byId.get(row.id)! }))
		.sort((a, b) => a.hit.distance - b.hit.distance)

	const skip = (filters.page - 1) * PAGE_SIZE
	const page = ranked.slice(skip, skip + PAGE_SIZE)

	const [excerpts, facets, coverage] = await Promise.all([
		loadExcerpts(
			page.map((entry) => ({ id: entry.row.id, level: entry.hit.level })),
		),
		loadFacets(timings),
		loadSenseCoverage(timings),
	])

	const works = page.map(({ row, hit }) =>
		toWork(row, {
			level: hit.level === 3 ? 3 : 2,
			similarity: hit.similarity,
			excerpt: excerpts.get(`${row.id}:${hit.level}`) ?? '',
		}),
	)

	return {
		filters,
		total: ranked.length,
		works,
		facets,
		pageCount: Math.max(1, Math.ceil(ranked.length / PAGE_SIZE)),
		sense: {
			query: filters.sense,
			candidates: hits.length,
			matched: ranked.length,
			capped: hits.length >= SENSE_CANDIDATES,
			coverage,
			error: null,
		},
	}
}

/**
 * The nearest works to a phrase, cached by that phrase.
 *
 * Worth caching twice over: every miss is a Workers AI call *and* an ANN scan
 * over 108k rows, and paging through one result set would otherwise repeat both
 * for every page. Keyed by digest because the phrase is reader-supplied — a raw
 * query string is not a safe cache key at any length.
 */
async function senseCandidates(query: string, timings?: Timings) {
	return cachified({
		key: `archive:sense:v1:${await queryDigest(query)}`,
		cache,
		timings,
		ttl: 1000 * 60 * 60,
		staleWhileRevalidate: 1000 * 60 * 60 * 6,
		getFreshValue: () =>
			searchInterpretations({ query, limit: SENSE_CANDIDATES }),
	})
}

async function queryDigest(query: string): Promise<string> {
	const bytes = new TextEncoder().encode(query)
	const hash = await crypto.subtle.digest('SHA-256', bytes)
	return [...new Uint8Array(hash)]
		.slice(0, 12)
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('')
}

/**
 * The opening of each matched passage, for the page being shown only.
 *
 * A reader owed an explanation of why a work ranked where it did is owed the
 * text that ranked it — a similarity figure alone is not evidence. Fetched per
 * page rather than per candidate: 60 bodies, not 400.
 */
async function loadExcerpts(
	wanted: Array<{ id: number; level: number }>,
): Promise<Map<string, string>> {
	if (!wanted.length) return new Map()

	const rows = await prisma.interpretation.findMany({
		where: {
			OR: wanted.map(({ id, level }) => ({ resourceId: id, level })),
			publishedAt: { not: null },
		},
		select: { resourceId: true, level: true, body: true },
	})

	return new Map(
		rows.map((row) => [`${row.resourceId}:${row.level}`, excerpt(row.body)]),
	)
}

/** Cut at a word boundary, so a passage never breaks mid-word into an ellipsis. */
function excerpt(body: string): string {
	const text = body.trim().replace(/\s+/g, ' ')
	if (text.length <= EXCERPT_LENGTH) return text
	const cut = text.slice(0, EXCERPT_LENGTH)
	const lastSpace = cut.lastIndexOf(' ')
	return `${(lastSpace > EXCERPT_LENGTH * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/**
 * How much of the archive the reading search can actually reach.
 *
 * Embedding the corpus is a job that runs to completion over hours, so this is
 * a moving number and the interface states it rather than implying the search
 * sees everything. Cached long: it changes only when that job runs. Returns
 * null on failure — a missing coverage line is a far better outcome than a
 * ranked result that refuses to render.
 */
async function loadSenseCoverage(
	timings?: Timings,
): Promise<SenseCoverage | null> {
	try {
		return await cachified({
			key: 'archive:sense-coverage:v1',
			cache,
			timings,
			ttl: 1000 * 60 * 60 * 6,
			staleWhileRevalidate: 1000 * 60 * 60 * 24,
			async getFreshValue() {
				const [embedded, publishedReadings] = await Promise.all([
					prisma.$queryRaw<Array<{ readings: number; works: number }>>`
						SELECT count(*)::int AS readings,
						       count(DISTINCT resource_id)::int AS works
						FROM "InterpretationEmbedding"
					`,
					prisma.interpretation.count({
						where: { publishedAt: { not: null } },
					}),
				])
				return {
					works: embedded[0]?.works ?? 0,
					readings: embedded[0]?.readings ?? 0,
					publishedReadings,
				}
			},
		})
	} catch (error) {
		console.error('sense coverage unavailable', error)
		return null
	}
}

/**
 * The console's option lists. These change only when the corpus is reingested,
 * so they are cached rather than recomputed on every keystroke of the filter
 * form — a `DISTINCT` across 54,497 rows is not a per-request cost worth
 * paying.
 */
async function loadFacets(timings?: Timings): Promise<ArchiveFacets> {
	return cachified({
		// v2: `institutions` changed from a list of spellings to the register.
		key: 'archive:facets:v2',
		cache,
		timings,
		ttl: 1000 * 60 * 60 * 6,
		staleWhileRevalidate: 1000 * 60 * 60 * 24,
		async getFreshValue() {
			const [categories, institutions, unreconciled, centuries] =
				await Promise.all([
					prisma.tag.findMany({
						where: { category: { not: null } },
						distinct: ['category'],
						select: { category: true },
						orderBy: { category: 'asc' },
						take: 60,
					}),
					// The register, not the spellings. `DISTINCT institution` gave 4,190
					// options for 956 holders and had to be capped at 200 to be a usable
					// control at all — a cap that alphabetically cut the list off inside
					// the Bs and put 96% of the archive's works out of reach. There is no
					// cap here because there is no longer anything to cap: one row per
					// institution is a list a reader can hold.
					prisma.institution.findMany({
						where: { deletedAt: null, wikiDataId: { not: null } },
						select: {
							name: true,
							wikiDataId: true,
							_count: { select: { resources: true } },
						},
						orderBy: { name: 'asc' },
					}),
					prisma.resource.count({
						where: { institution: { not: null }, institutionId: null },
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

			// An institution holding nothing is a register entry, not a filter: it
			// would offer the reader a collection and then show them an empty index.
			const held = institutions
				.filter((i) => i._count.resources > 0 && i.wikiDataId)
				.map((i) => ({
					name: i.name,
					wikiDataId: i.wikiDataId!,
					works: i._count.resources,
				}))

			return {
				categories: categories
					.map((c) => c.category)
					.filter((c): c is string => Boolean(c)),
				institutions: held,
				institutionCoverage: {
					institutions: held.length,
					works: held.reduce((sum, i) => sum + i.works, 0),
					unreconciled,
				},
				centuries: centuries.map((c) => ({
					century: Number(c.century),
					count: Number(c.count),
				})),
			}
		},
	})
}
