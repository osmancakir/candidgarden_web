import { type VerificationStatus } from '#app/utils/archive.ts'

/**
 * The console's vocabulary — isomorphic on purpose.
 *
 * Filter parsing and the record shapes live here rather than in
 * `index-data.server.ts` so the view can import them without dragging Prisma
 * into the client bundle. The server module owns the queries; this one owns the
 * contract between the URL and the page.
 */

export const PAGE_SIZE = 60

/**
 * The longest phrase the reading search will embed.
 *
 * `sense` is a description of a picture, not a document, and the cap is a
 * budget rather than a nicety: every distinct string is one Workers AI call and
 * one cache entry, so an unbounded parameter is an unbounded bill payable by
 * anyone who can edit a query string.
 */
export const SENSE_MAX_LENGTH = 200

export type BrowseLevel = 1 | 2 | 3

export type ArchiveFilters = {
	q: string
	/** Free text searched against the readings by meaning rather than by string. */
	sense: string
	motif: string
	category: string
	/**
	 * A collection, as a Wikidata QID — `Q190804`, not "Amsterdam, Rijksmuseum".
	 *
	 * The QID rather than `Institution.id` because the register is re-runnable
	 * and keyed on `wikiDataId`, so the integer is free to move under a re-import
	 * while a cited URL is not. Legacy literal spellings are still honoured; see
	 * `isInstitutionId`.
	 */
	institution: string
	century: number | null
	verification: string
	minAgreement: number
	level: BrowseLevel
	page: number
	sort: 'title' | 'period' | 'motifs'
}

export type ArchiveTagging = {
	id: string
	name: string
	category: string | null
	frequency: number
	human: number
}

/**
 * Why a work is in a `sense` result: which of its readings the phrase landed
 * nearest to, how near, and enough of that passage to judge the match by.
 */
export type ReadingMatch = {
	/** Panofsky level of the passage that matched: 2 or 3. */
	level: 2 | 3
	/** Cosine similarity in [-1, 1]. Nearness in an embedding space, nothing more. */
	similarity: number
	/** The opening of the matched passage, cut at a word boundary. */
	excerpt: string
}

export type ArchiveWork = {
	id: number
	title: string | null
	artist: string | null
	notBefore: number | null
	notAfter: number | null
	/** What the cataloguer wrote. Null means no holder was recorded at all. */
	institution: string | null
	/** The reconciled holder, where one was identified. Null means unreconciled. */
	collection: ArchiveCollection | null
	objectKey: string | null
	verification: VerificationStatus
	verifiedAt: Date | string | null
	maxFrequency: number
	taggings: Array<ArchiveTagging>
	/** Present only in `sense` mode, where every row is a match by construction. */
	match: ReadingMatch | null
}

/**
 * What the interface has to disclose about a `sense` result, per §6.
 *
 * A ranked search can mislead in ways a filtered index cannot — it always
 * returns something, and it reaches only the works it has vectors for — so the
 * numbers that qualify the ranking travel with it rather than being left for
 * the reader to assume.
 */
export type SenseReport = {
	query: string
	/** Works the vector index returned, before the filters were applied. */
	candidates: number
	/** How many of those survived the filters. */
	matched: number
	/** True when the scan hit its ceiling, so `candidates` is a cap, not a count. */
	capped: boolean
	/** How much of the archive the reading search can reach at all. */
	coverage: SenseCoverage | null
	/** Set when the reading index could not be consulted; the index still renders. */
	error: string | null
}

export type SenseCoverage = {
	/** Works with at least one embedded reading. */
	works: number
	/** Readings embedded. */
	readings: number
	/** Readings published, embedded or not. */
	publishedReadings: number
}

/** A holder of works, as the console and the record components need it. */
export type ArchiveCollection = {
	name: string
	/** Null only for a legacy literal standing in for an unreconciled holder. */
	wikiDataId: string | null
}

export type ArchiveInstitutionFacet = ArchiveCollection & {
	wikiDataId: string
	works: number
}

/**
 * What the Collection filter can and cannot reach.
 *
 * The register covers 27,186 of the 37,934 works that name a holder; the rest
 * name one in wording that could not be reconciled to an entity. A select built
 * from the register is therefore a partial view of the archive by construction,
 * and — as with `SenseReport` — the number travels with it rather than being
 * left for the reader to discover by not finding something.
 */
export type InstitutionCoverage = {
	/** Institutions in the register that hold at least one work. */
	institutions: number
	/** Works reachable through the register. */
	works: number
	/** Works naming a holder that could not be reconciled. */
	unreconciled: number
}

export type ArchiveFacets = {
	categories: Array<string>
	institutions: Array<ArchiveInstitutionFacet>
	institutionCoverage: InstitutionCoverage
	centuries: Array<{ century: number; count: number }>
}

export type ArchiveIndexData = {
	filters: ArchiveFilters
	total: number
	works: Array<ArchiveWork>
	facets: ArchiveFacets
	pageCount: number
	/** Null unless `sense` was asked for; see `SenseReport`. */
	sense: SenseReport | null
}

export function parseFilters(url: URL): ArchiveFilters {
	const p = url.searchParams
	const levelRaw = Number(p.get('level') ?? 1)
	const level = (levelRaw === 2 || levelRaw === 3 ? levelRaw : 1) as BrowseLevel
	const centuryRaw = Number(p.get('century'))
	const sortRaw = p.get('sort')
	return {
		q: (p.get('q') ?? '').trim(),
		sense: (p.get('sense') ?? '').trim().slice(0, SENSE_MAX_LENGTH),
		motif: (p.get('motif') ?? '').trim(),
		category: (p.get('category') ?? '').trim(),
		institution: (p.get('institution') ?? '').trim(),
		century: Number.isInteger(centuryRaw) && centuryRaw > 0 ? centuryRaw : null,
		verification: (p.get('verification') ?? '').trim().toUpperCase(),
		minAgreement: Math.max(0, Number(p.get('agreement') ?? 0) || 0),
		level,
		page: Math.max(1, Number(p.get('page') ?? 1) || 1),
		sort:
			sortRaw === 'period' || sortRaw === 'motifs' || sortRaw === 'title'
				? sortRaw
				: 'title',
	}
}

/**
 * True when the Collection filter names an entity rather than a spelling.
 *
 * `?institution=` carried a literal string for as long as the archive had only
 * strings to carry, and those URLs are cited in the wild. Rather than break
 * them, the parameter is read as a QID when it looks like one and as the old
 * exact-match spelling when it does not.
 */
export function isInstitutionId(value: string): boolean {
	return /^Q\d+$/.test(value)
}

/** The register entry for one holder. Addressed by QID; see the route's note. */
export function collectionHref(wikiDataId: string): string {
	return `/archive/collection/${encodeURIComponent(wikiDataId)}`
}

/** The index, narrowed to one holder. */
export function collectionIndexHref(wikiDataId: string): string {
	return `/?institution=${encodeURIComponent(wikiDataId)}`
}

/**
 * True when the index is ranked by meaning rather than ordered by a column.
 *
 * `sense` is the one filter that changes the *shape* of the page — it caps the
 * result set, forces the ordering and gives every row a match — so the views
 * ask this rather than testing the string in a dozen places.
 */
export function isSenseMode(f: ArchiveFilters): boolean {
	return f.sense.length > 0
}

/** How many filters are actually narrowing the index (view state doesn't count). */
export function activeFilterCount(f: ArchiveFilters): number {
	return [
		f.q,
		f.sense,
		f.motif,
		f.category,
		f.institution,
		f.century != null ? '1' : '',
		f.verification,
		f.minAgreement > 0 ? '1' : '',
	].filter(Boolean).length
}

/** "16th century" — written the way a catalogue writes it. */
export function centuryLabel(c: number): string {
	const suffix =
		c % 10 === 1 && c % 100 !== 11
			? 'st'
			: c % 10 === 2 && c % 100 !== 12
				? 'nd'
				: c % 10 === 3 && c % 100 !== 13
					? 'rd'
					: 'th'
	return `${c}${suffix} century`
}
