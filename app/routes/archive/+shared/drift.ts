/**
 * The drift's vocabulary — isomorphic, for the reason `filters.ts` is.
 *
 * The atlas holds every work as a point in one space. The drift is a passage
 * across that space: works pull the reader towards them or push them off, and
 * where those forces leave them is the finding. So the archive's other surfaces
 * ask what a work is, and this one asks where a reader ends up — a different
 * kind of claim, kept in a different kind of record. A verdict is about the
 * person, not the picture, and nothing here is written back onto the work.
 */

/**
 * Cards handed to the client at once.
 *
 * The stack is swiped locally and the verdicts are flushed behind it, so this is
 * a buffer depth rather than a page size: large enough that a fast reader never
 * waits on the network, small enough that abandoning a drift does not mean
 * having pointlessly loaded forty images.
 */
export const BATCH_SIZE = 12

/** Cards remaining in the local stack when the next batch is fetched. */
export const REFILL_AT = 5

/**
 * Verdicts held client-side before a flush.
 *
 * Not zero — a POST per swipe would put a round trip inside an interaction that
 * has to feel like moving a card — and not large, because an unflushed verdict
 * is a verdict lost if the tab closes.
 */
export const FLUSH_EVERY = 3

/**
 * Pulls required before the deck starts drawing towards the reader.
 *
 * Under a handful of pulls the drift vector is the reader's most recent
 * accident, and a deck that chased it would spend the whole drift confirming
 * a coin flip. The spread is the better guess until there is something to chase.
 */
export const EXPLOIT_AFTER = 5

/**
 * How much of a batch is drawn towards the drift vector once it exists.
 *
 * A third, not a half or all of it: the drift is trying to find the edges of
 * someone's eye, and a deck that only serves what it already believes will
 * confirm itself no matter which way the reader actually pulls. Two thirds of
 * every batch stays on the spread, which is what keeps a wrong guess
 * recoverable.
 */
export const NEAREST_PER_BATCH = 4

/** Verdicts before the readout has enough to say anything. */
export const READOUT_MINIMUM = 8

/** A full drift — the point where the interface suggests stopping. */
export const DRIFT_LENGTH = 40

/**
 * Which way a work moved the reader.
 *
 * A force, not a rating. `PULL` is a work that drew them towards it, `PUSH` one
 * that pushed them off, `REST` one that exerted nothing either way. The
 * vocabulary is deliberate: "like" invites a reader to report the opinion they
 * think they ought to hold, where a pull is something that either happened in
 * front of a picture or did not.
 */
export type DriftVerdictValue = 'PULL' | 'PUSH' | 'REST'

/**
 * Where a card came from. `SPREAD` is a cluster representative from the built
 * deck; `NEAREST` was drawn towards the drift vector at request time. The
 * readout distinguishes them because "you were pulled by what the machine chose
 * because it would pull you" is not the same finding as "this pulled you out of
 * a sample chosen before it knew anything about you".
 */
export type DriftCardOrigin = 'SPREAD' | 'NEAREST'

/**
 * The note on the back of a card — what a guide says in front of a picture.
 *
 * Deliberately split into two fields, because the two carry different kinds of
 * risk and the reader is owed the difference. `body` is what can be checked by
 * looking at the plate: a detail in the frame, and the convention that put it
 * there. `context` is everything the picture cannot tell you — a name, an age,
 * a commission, a motive — and it is only ever present alongside a `source`,
 * because a claim of that kind with nothing behind it reads exactly like one
 * with a citation and there is no way for a reader to tell them apart.
 *
 * `scripts/write-drift-notes.mjs` enforces the pairing at write time and drops
 * any context that came back unsourced, so a `context` without a `source`
 * should be unreachable — the UI still guards, because a hand-edited file is a
 * file someone can get wrong.
 */
export type DriftNote = {
	body: string
	context: string | null
	source: string | null
	sourceUrl: string | null
	/** MODEL until a person has been over it, matching `Interpretation.source`. */
	origin: 'MODEL' | 'EDITORIAL'
}

export type DriftCard = {
	id: number
	title: string | null
	artist: string | null
	notBefore: number | null
	notAfter: number | null
	institution: string | null
	objectKey: string | null
	motifs: Array<string>
	/**
	 * Works whose readings are nearer this card than any other card in the deck.
	 * 1 for a `NEAREST` card and for the unread tail, which stand only for
	 * themselves.
	 */
	represents: number
	origin: DriftCardOrigin
	/** False for the works with no embedded reading; the drift vector cannot see them. */
	embedded: boolean
	/**
	 * Null for most cards, and that is the resting state rather than a gap to be
	 * filled: the deck is 429 artists deep and mostly anonymous, so a great many
	 * works have nothing honest to say on the back. A blank back is the correct
	 * output for those, and padding them would cost the notes their credibility
	 * on the works that do have one.
	 */
	note: DriftNote | null
}

export type DriftTally = {
	pulled: number
	pushed: number
	atRest: number
	seen: number
	/** Works in the archive standing behind the cards this reader has pulled. */
	pulledRepresents: number
}

/** A motif the reader's pulls over-represent, relative to what they were shown. */
export type MotifLift = {
	name: string
	/** Cards carrying this motif that the reader pulled. */
	pulled: number
	/** Cards carrying this motif the reader was shown. */
	shown: number
	/**
	 * Pull-rate for this motif divided by the reader's pull-rate overall, damped
	 * by `LIFT_PRIOR`. 2.0 reads as "twice as likely to pull a card once it
	 * carries this motif", with the qualification that the damping deliberately
	 * understates a rate observed over very few cards.
	 */
	lift: number
}

export type PeriodSplit = {
	century: number
	pulled: number
	shown: number
}

export type DriftReadout = {
	tally: DriftTally
	motifs: Array<MotifLift>
	againstMotifs: Array<MotifLift>
	periods: Array<PeriodSplit>
	/** Works nearest the drift vector that the reader has not been shown. */
	nearest: Array<DriftCard>
	/**
	 * Verdicts landing on works with no embedded reading, which contribute to
	 * the counts and the motif lift but cannot enter the drift vector at all.
	 */
	unreadVerdicts: number
	/** Set when the vector could not be computed; the rest of the readout stands. */
	error: string | null
}

export type DriftDeckFacts = {
	/** Works the spread was taken over: embedded, with an image on file. */
	spreadOver: number
	/** Cards in the deck. */
	cards: number
	/** Mean cosine distance from a work in the archive to its nearest card. */
	meanDistanceToNearestCard: number
	medianCluster: number
	builtAt: string
}

export function isVerdictValue(value: unknown): value is DriftVerdictValue {
	return value === 'PULL' || value === 'PUSH' || value === 'REST'
}

/**
 * Pseudo-cards added to every motif's count before the rate is taken.
 *
 * Without this the readout is a list of accidents. A motif that appeared on
 * three cards and pulled twice scores a raw ×2.2, which beats a motif that
 * pulled three times out of five, even though the second is the better-
 * evidenced finding by every measure that matters. Two pseudo-cards at the
 * reader's own base rate damp the small denominators towards "no effect" and
 * leave the large ones nearly untouched — which is the same thing as saying the
 * readout should not claim more than the sample can support.
 */
const LIFT_PRIOR = 2

/**
 * Motifs ranked by how much more often than usual a pull landed on them.
 *
 * Pure, and here rather than in the server module, so the arithmetic that
 * produces every figure on the readout can be tested without a database.
 */
export function scoreMotifs(
	rows: Array<{ name: string; pulled: number; shown: number }>,
): { toward: Array<MotifLift>; against: Array<MotifLift> } {
	const totals = rows.reduce(
		(sum, row) => ({
			pulled: sum.pulled + row.pulled,
			shown: sum.shown + row.shown,
		}),
		{ pulled: 0, shown: 0 },
	)
	if (totals.shown === 0 || totals.pulled === 0)
		return { toward: [], against: [] }

	const baseRate = totals.pulled / totals.shown
	const scored: Array<MotifLift> = rows.map((row) => ({
		name: row.name,
		pulled: row.pulled,
		shown: row.shown,
		lift:
			(row.pulled + LIFT_PRIOR * baseRate) /
			(row.shown + LIFT_PRIOR) /
			baseRate,
	}))

	return {
		toward: scored
			.filter((row) => row.lift > 1 && row.pulled >= 2)
			.sort((a, b) => b.lift - a.lift || b.shown - a.shown)
			.slice(0, 12),
		against: scored
			.filter((row) => row.lift < 1 && row.shown - row.pulled >= 2)
			.sort((a, b) => a.lift - b.lift || b.shown - a.shown)
			.slice(0, 8),
	}
}

/**
 * Nearness rendered as a lift figure: "×2.4".
 *
 * Deliberately not a percentage. A percentage invites reading this as a
 * probability that the motif will pull the reader, which it is not — it is a
 * ratio between two rates observed over a few dozen cards.
 */
export function formatLift(lift: number): string {
	return `×${lift.toFixed(1)}`
}
