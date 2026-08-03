/**
 * Archival conventions shared by every surface that shows a record.
 *
 * §5 of the brand document: "Every entry is timestamped." These helpers are the
 * single place the house formats are defined, so a date stamped on an index row
 * is byte-identical to the same date stamped on a dossier.
 */

/** Dataset the archive is drawn from. */
export const DATASET = 'ARTigo'

/**
 * Anthology stamps every work MM/DD/YY. So do we — in UTC, because a record's
 * provenance should not shift with the reader's timezone.
 */
export function archivalDate(date: Date | string | number): string {
	const d = new Date(date)
	if (Number.isNaN(d.getTime())) return '--/--/--'
	const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
	const dd = String(d.getUTCDate()).padStart(2, '0')
	const yy = String(d.getUTCFullYear()).slice(-2)
	return `${mm}/${dd}/${yy}`
}

/**
 * A work's date range, as the ARTigo data records it: `not_before`/`not_after`.
 * Renders "c. 1512", "1512–1519", "after 1512", "before 1519", or "UNDATED" —
 * never a guess dressed up as a fact.
 */
export function displayPeriod(
	notBefore?: number | null,
	notAfter?: number | null,
): string {
	if (notBefore != null && notAfter != null) {
		return notBefore === notAfter
			? String(notBefore)
			: `${notBefore}–${notAfter}`
	}
	if (notBefore != null) return `AFTER ${notBefore}`
	if (notAfter != null) return `BEFORE ${notAfter}`
	return 'UNDATED'
}

/** The century a work falls in, used to group the index by period. */
export function century(notBefore?: number | null, notAfter?: number | null) {
	const year = notBefore ?? notAfter
	if (year == null) return null
	return Math.floor((year - 1) / 100) + 1
}

export type ConfidenceBand = 'high' | 'medium' | 'low' | 'none'

/**
 * A tagging's confidence, derived from the two counts the schema actually
 * carries: how many humans applied a tag to a work versus how strongly the
 * model did. This is an *observed agreement rate*, not a model logprob, and the
 * interface says so wherever it is shown.
 */
export function confidenceOf({
	frequency,
	maxFrequency,
}: {
	frequency: number
	maxFrequency: number
}): number {
	if (maxFrequency <= 0) return 0
	return Math.min(1, frequency / maxFrequency)
}

export function confidenceBand(score: number): ConfidenceBand {
	if (score <= 0) return 'none'
	if (score >= 0.66) return 'high'
	if (score >= 0.33) return 'medium'
	return 'low'
}

/** `0.87` — always two decimals, so chips align in a column. */
export function formatConfidence(score: number): string {
	return score.toFixed(2)
}

/**
 * `.741` — the cosine similarity between a reader's phrase and a machine-written
 * reading, as shown beside a search result.
 *
 * Deliberately formatted unlike `formatConfidence`: three decimals because
 * nearness values cluster tightly and two would show a dozen results as the
 * same number, and no leading zero so the two figures cannot be mistaken for
 * each other on a page that carries both. It measures distance in an embedding
 * space, not relevance and not agreement, and §6's candour requires the
 * interface to keep saying so wherever it appears.
 */
export function formatNearness(similarity: number): string {
	return similarity.toFixed(3).replace(/^0/, '')
}

export type VerificationStatus =
	| 'VERIFIED'
	| 'PENDING'
	| 'REJECTED'
	| 'UNREVIEWED'

export function verificationLabel(status?: string | null): VerificationStatus {
	switch (status?.toUpperCase()) {
		case 'VERIFIED':
		case 'APPROVED':
			return 'VERIFIED'
		case 'REJECTED':
			return 'REJECTED'
		case 'PENDING':
			return 'PENDING'
		default:
			return 'UNREVIEWED'
	}
}

/**
 * §6, "Uncertainty as content". Given what we know about a record, produce the
 * sentence the interface should say about its own reliability — or `null` when
 * there is genuinely nothing to disclose.
 */
export function uncertaintyNotice({
	tagCount,
	humanTagCount,
	topConfidence,
	verification,
}: {
	tagCount: number
	humanTagCount: number
	topConfidence: number
	verification: VerificationStatus
}): string | null {
	const notes: Array<string> = []
	if (tagCount === 0)
		return 'NO MOTIFS ON RECORD · NOTHING READ FROM THIS IMAGE'
	if (confidenceBand(topConfidence) === 'low')
		notes.push('MODEL CONFIDENCE LOW')
	if (humanTagCount === 0) notes.push('NO HUMAN ANNOTATIONS')
	if (verification === 'REJECTED') notes.push('ATTRIBUTION DISPUTED')
	if (verification === 'PENDING') notes.push('ATTRIBUTION UNCONFIRMED')
	return notes.length ? notes.join(' · ') : null
}
