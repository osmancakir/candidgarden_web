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

export type BrowseLevel = 1 | 2 | 3

export type ArchiveFilters = {
	q: string
	motif: string
	category: string
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

export type ArchiveWork = {
	id: number
	title: string | null
	artist: string | null
	notBefore: number | null
	notAfter: number | null
	institution: string | null
	objectKey: string | null
	verification: VerificationStatus
	verifiedAt: Date | string | null
	maxFrequency: number
	taggings: Array<ArchiveTagging>
}

export type ArchiveFacets = {
	categories: Array<string>
	institutions: Array<string>
	centuries: Array<{ century: number; count: number }>
}

export type ArchiveIndexData = {
	filters: ArchiveFilters
	total: number
	works: Array<ArchiveWork>
	facets: ArchiveFacets
	pageCount: number
}

export function parseFilters(url: URL): ArchiveFilters {
	const p = url.searchParams
	const levelRaw = Number(p.get('level') ?? 1)
	const level = (levelRaw === 2 || levelRaw === 3 ? levelRaw : 1) as BrowseLevel
	const centuryRaw = Number(p.get('century'))
	const sortRaw = p.get('sort')
	return {
		q: (p.get('q') ?? '').trim(),
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

/** How many filters are actually narrowing the index (view state doesn't count). */
export function activeFilterCount(f: ArchiveFilters): number {
	return [
		f.q,
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
