import { createCookie } from 'react-router'
import deckData from '#app/data/drift/deck.json'
import notesData from '#app/data/drift/notes.json'
import { prisma } from '#app/utils/db.server.ts'
import {
	EXPLOIT_AFTER,
	NEAREST_PER_BATCH,
	isVerdictValue,
	scoreMotifs,
	type MotifLift,
	type PeriodSplit,
	type DriftCard,
	type DriftCardOrigin,
	type DriftDeckFacts,
	type DriftNote,
	type DriftReadout,
	type DriftTally,
	type DriftVerdictValue,
} from './drift.ts'

/**
 * Server side of the drift.
 *
 * Two things are worth knowing before reading the rest. The first is that this
 * feature never calls Workers AI: the drift vector is an average of vectors
 * already in the database, so unlike `sense` search it has no query to embed,
 * costs no neurons, and cannot be taken down by a daily quota. The second is
 * that everything it measures is measured *relative to what the reader was
 * shown*. There is no claim here about the archive, or about art, or about the
 * reader — only about a few dozen cards and which way they went.
 */

const DECK = deckData as unknown as {
	formatVersion: number
	model: string
	seed: number
	builtAt: string
	corpus: { spreadOver: number; unread: number }
	coverage: {
		cards: number
		spreadCards: number
		unreadCards: number
		largestCluster: number
		medianCluster: number
		meanDistanceToNearestCard: number
	}
	cards: Array<{
		id: number
		title: string | null
		artist: string | null
		notBefore: number | null
		notAfter: number | null
		institution: string | null
		objectKey: string | null
		motifs: Array<string>
		cluster: number | null
		represents: number
		readings: number
	}>
}

/**
 * The notes on the backs of the cards, keyed by resource id.
 *
 * A second file rather than a column on the deck, for the reason the deck is a
 * file at all: the two are built by different passes with different costs and
 * different failure modes, and rebuilding the spread must not mean rewriting
 * six hundred hand-edited paragraphs. `scripts/write-drift-notes.mjs` fills it
 * in; a person prunes it afterwards.
 *
 * Entries with a null `body` are recorded skips — works the pass decided had
 * nothing honest on the back — and are read here as no note at all. They are
 * kept in the file only so a rerun does not pay to re-decide them.
 */
const NOTES = notesData as unknown as {
	formatVersion: number
	notes: Record<
		string,
		{
			body: string | null
			context?: string | null
			source?: string | null
			sourceUrl?: string | null
			origin?: string
		}
	>
}

/**
 * A context claim survives only with a source beside it. The writer already
 * enforces this, so reaching the `null` branch means the file was hand-edited
 * into a state the writer would not produce — in which case dropping the claim
 * is the right failure, because the alternative is showing the reader an
 * unfalsifiable sentence in the same voice as a sourced one.
 */
function noteFor(id: number): DriftNote | null {
	const raw = NOTES.notes[String(id)]
	if (!raw?.body) return null
	const grounded = Boolean(raw.context && raw.source)
	return {
		body: raw.body,
		context: grounded ? (raw.context ?? null) : null,
		source: grounded ? (raw.source ?? null) : null,
		sourceUrl: grounded ? (raw.sourceUrl ?? null) : null,
		origin: raw.origin === 'EDITORIAL' ? 'EDITORIAL' : 'MODEL',
	}
}

const DECK_CARDS: Array<DriftCard> = DECK.cards.map((card) => ({
	id: card.id,
	title: card.title,
	artist: card.artist,
	notBefore: card.notBefore,
	notAfter: card.notAfter,
	institution: card.institution,
	objectKey: card.objectKey,
	motifs: card.motifs,
	represents: card.represents,
	origin: 'SPREAD' as const,
	embedded: card.readings > 0,
	note: noteFor(card.id),
}))

const DECK_BY_ID = new Map(DECK_CARDS.map((card) => [card.id, card]))

export const deckFacts: DriftDeckFacts = {
	spreadOver: DECK.corpus.spreadOver,
	cards: DECK.coverage.cards,
	meanDistanceToNearestCard: DECK.coverage.meanDistanceToNearestCard,
	medianCluster: DECK.coverage.medianCluster,
	builtAt: DECK.builtAt,
}

/** See `app/utils/semantic-search.server.ts` — same index, same reason. */
const PROBES = 10

/**
 * How far past the wanted count the nearest-neighbour scan reaches.
 *
 * Wider than the index's overfetch because three filters run after the scan
 * rather than inside it — both readings of a work collapse to one row, works
 * the reader has already seen drop out, and works with no image are unusable as
 * cards — and a scan sized for the answer would come back short of it.
 */
const NEAREST_OVERFETCH = 12

/**
 * Rocchio's β: how far a push moves the drift vector away.
 *
 * Below one on purpose. A pull locates a point; a push only says a direction is
 * wrong, and the wrongness is usually about one feature of the picture rather
 * than the whole of it. Weighting the two equally makes the vector lurch on a
 * single grimace at a single painting.
 */
const PUSH_WEIGHT = 0.35

/**
 * Verdicts one drift may record.
 *
 * This is an unauthenticated write endpoint, and the cap is the difference
 * between a cookie that can add forty rows and one that can add as many as it
 * has patience for.
 */
const MAX_VERDICTS_PER_DRIFT = 500

/** Pulled works averaged into the vector: the most recent ones. */
const MAX_VECTOR_INPUTS = 60

// ---------------------------------------------------------------------------
// The drift cookie
// ---------------------------------------------------------------------------

/**
 * A drift is identified by a random token in a signed cookie, not by an
 * account.
 *
 * Asking someone to make an account before the first card would cost this
 * feature exactly the people it is for. The token carries no identity and is
 * signed only so that one reader cannot read or overwrite another's drift by
 * editing a cookie. `userId` on the row is filled in when a signed-in reader
 * passes through, which is what lets a drift be claimed later without the
 * anonymous ones becoming orphans.
 */
export const driftCookie = createCookie('cg_drift', {
	path: '/',
	sameSite: 'lax',
	httpOnly: true,
	secure: process.env.NODE_ENV === 'production',
	secrets: process.env.SESSION_SECRET.split(','),
	maxAge: 60 * 60 * 24 * 365,
})

export async function readDriftId(request: Request): Promise<string | null> {
	const value = await driftCookie.parse(request.headers.get('cookie'))
	return typeof value === 'string' && value.length > 0 ? value : null
}

export function newDriftId(): string {
	return crypto.randomUUID()
}

export function driftCookieHeader(id: string): Promise<string> {
	return driftCookie.serialize(id)
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type DriftState = {
	id: string
	seen: Set<number>
	pulled: Array<number>
	pushed: Array<number>
	tally: DriftTally
}

export async function loadDrift(id: string): Promise<DriftState> {
	const rows = await prisma.driftVerdict.findMany({
		where: { driftId: id },
		select: { resourceId: true, verdict: true },
		orderBy: { createdAt: 'desc' },
	})

	const seen = new Set<number>()
	const pulled: Array<number> = []
	const pushed: Array<number> = []
	let atRest = 0
	let pulledRepresents = 0

	for (const row of rows) {
		seen.add(row.resourceId)
		if (row.verdict === 'PULL') {
			pulled.push(row.resourceId)
			pulledRepresents += DECK_BY_ID.get(row.resourceId)?.represents ?? 1
		} else if (row.verdict === 'PUSH') {
			pushed.push(row.resourceId)
		} else {
			atRest++
		}
	}

	return {
		id,
		seen,
		pulled,
		pushed,
		tally: {
			pulled: pulled.length,
			pushed: pushed.length,
			atRest,
			seen: seen.size,
			pulledRepresents,
		},
	}
}

export function emptyState(id: string): DriftState {
	return {
		id,
		seen: new Set(),
		pulled: [],
		pushed: [],
		tally: { pulled: 0, pushed: 0, atRest: 0, seen: 0, pulledRepresents: 0 },
	}
}

export type IncomingVerdict = {
	resourceId: number
	verdict: DriftVerdictValue
	origin: DriftCardOrigin
}

/** Parses the JSON the card stack flushes, rejecting anything malformed. */
export function parseVerdicts(raw: unknown): Array<IncomingVerdict> {
	if (typeof raw !== 'string') return []
	let parsed: unknown
	try {
		parsed = JSON.parse(raw)
	} catch {
		return []
	}
	if (!Array.isArray(parsed)) return []

	const verdicts: Array<IncomingVerdict> = []
	for (const entry of parsed.slice(0, 50)) {
		if (typeof entry !== 'object' || entry === null) continue
		const { resourceId, verdict, origin } = entry as Record<string, unknown>
		if (!Number.isInteger(resourceId)) continue
		if (!isVerdictValue(verdict)) continue
		verdicts.push({
			resourceId: resourceId as number,
			verdict,
			origin: origin === 'NEAREST' ? 'NEAREST' : 'SPREAD',
		})
	}
	return verdicts
}

/**
 * Records verdicts, revising rather than accumulating.
 *
 * The upsert is on `(driftId, resourceId)`: a reader who somehow lands on the
 * same card twice changes their mind about it, they do not vote twice. Written
 * one at a time because the unique constraint makes a `createMany` fail whole
 * rather than skip the collision, and a lost batch is worse than four round
 * trips over Hyperdrive.
 */
export async function recordVerdicts({
	driftId,
	userId,
	verdicts,
	alreadySeen,
}: {
	driftId: string
	userId: string | null
	verdicts: Array<IncomingVerdict>
	alreadySeen: number
}) {
	const budget = Math.max(0, MAX_VERDICTS_PER_DRIFT - alreadySeen)
	for (const { resourceId, verdict, origin } of verdicts.slice(0, budget)) {
		await prisma.driftVerdict.upsert({
			where: { driftId_resourceId: { driftId, resourceId } },
			create: { driftId, userId, resourceId, verdict, origin },
			update: { verdict, userId },
		})
	}
}

// ---------------------------------------------------------------------------
// Dealing the next cards
// ---------------------------------------------------------------------------

/** FNV-1a, so a drift id becomes a stable seed without a hash import. */
function seedFrom(text: string): number {
	let hash = 0x811c9dc5
	for (let index = 0; index < text.length; index++) {
		hash ^= text.charCodeAt(index)
		hash = Math.imul(hash, 0x01000193)
	}
	return hash >>> 0
}

function makeRandom(seed: number) {
	let a = seed >>> 0
	return function random() {
		a = (a + 0x6d2b79f5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

/**
 * The deck in this drift's own order.
 *
 * Shuffled from the drift id rather than from `Math.random()` so that a
 * reload deals the same cards in the same order — the reader who refreshes has
 * not started a different drift, and a deck that reshuffled under them would
 * make the readout describe a sample nobody actually saw.
 */
function deckOrderFor(driftId: string): Array<DriftCard> {
	const random = makeRandom(seedFrom(driftId))
	const order = [...DECK_CARDS]
	for (let index = order.length - 1; index > 0; index--) {
		const swap = Math.floor(random() * (index + 1))
		const held = order[index]!
		order[index] = order[swap]!
		order[swap] = held
	}
	return order
}

/**
 * The next cards for the stack: a spread of the archive, and — once there is
 * anything to go on — a minority drawn towards the reader.
 *
 * A failure to compute the drift vector deals a batch entirely from the deck
 * rather than dealing nothing. The drift is still a drift without the
 * confirmation half; it is not one without the spread.
 */
export async function nextCards({
	state,
	count,
}: {
	state: DriftState
	count: number
}): Promise<{ cards: Array<DriftCard>; error: string | null }> {
	const wantNearest =
		state.pulled.length >= EXPLOIT_AFTER
			? Math.min(NEAREST_PER_BATCH, Math.floor(count / 2))
			: 0

	const spread = deckOrderFor(state.id)
		.filter((card) => !state.seen.has(card.id))
		.slice(0, count - wantNearest)

	if (wantNearest === 0) return { cards: spread, error: null }

	let nearest: Array<DriftCard> = []
	let error: string | null = null
	try {
		nearest = await nearestUnseen({
			state,
			// Cards queued in this same batch are not in `seen` yet — nothing has
			// been swiped — so they are excluded explicitly. Otherwise a work could
			// arrive twice in one stack, once from each half.
			exclude: spread.map((card) => card.id),
			limit: wantNearest,
		})
	} catch (caught) {
		console.error('drift: nearest-neighbour draw failed', caught)
		error =
			'The reading index could not be consulted, so this batch is all spread.'
	}

	if (nearest.length === 0) {
		const fill = deckOrderFor(state.id)
			.filter(
				(card) =>
					!state.seen.has(card.id) && !spread.some((s) => s.id === card.id),
			)
			.slice(0, count - spread.length)
		return { cards: [...spread, ...fill], error }
	}

	// Interleaved rather than appended: a run of four works chosen because they
	// will pull the reader reads as the deck flattering them, and the point of
	// keeping the spread in the majority is lost if it all arrives first.
	const cards: Array<DriftCard> = []
	let spreadIndex = 0
	let nearestIndex = 0
	while (spreadIndex < spread.length || nearestIndex < nearest.length) {
		if (cards.length % 3 === 2 && nearestIndex < nearest.length) {
			cards.push(nearest[nearestIndex++]!)
		} else if (spreadIndex < spread.length) {
			cards.push(spread[spreadIndex++]!)
		} else {
			cards.push(nearest[nearestIndex++]!)
		}
	}

	return { cards, error }
}

// ---------------------------------------------------------------------------
// The drift vector
// ---------------------------------------------------------------------------

/**
 * The reader's pulls as one direction in the reading space, with their pushes
 * subtracted off — the Rocchio construction, and no more than that.
 *
 * The averaging happens in Postgres rather than here: pgvector's `avg()` returns
 * one 1024-float row where fetching the inputs would pull one per reading per
 * work across Hyperdrive to compute the same thing.
 *
 * Returns null when nothing the index can see has pulled the reader — which is a
 * real state, not an error, for someone whose pulls have all landed on the
 * unread tail.
 */
async function driftVector(state: DriftState): Promise<number[] | null> {
	const pulled = state.pulled.slice(0, MAX_VECTOR_INPUTS)
	const pushed = state.pushed.slice(0, MAX_VECTOR_INPUTS)
	if (pulled.length === 0) return null

	const rows = await prisma.$queryRawUnsafe<
		Array<{ pulled: string | null; pushed: string | null }>
	>(
		`SELECT (avg(embedding) FILTER (WHERE resource_id = ANY($1::int[])))::text AS pulled,
		        (avg(embedding) FILTER (WHERE resource_id = ANY($2::int[])))::text AS pushed
		   FROM "InterpretationEmbedding"
		  WHERE resource_id = ANY($1::int[]) OR resource_id = ANY($2::int[])`,
		pulled,
		pushed,
	)

	const pulledVector = parseVector(rows[0]?.pulled)
	if (!pulledVector) return null
	const pushedVector = parseVector(rows[0]?.pushed)

	const vector = pulledVector
	if (pushedVector) {
		for (let index = 0; index < vector.length; index++) {
			vector[index]! -= PUSH_WEIGHT * pushedVector[index]!
		}
	}

	// Renormalised because cosine distance ignores magnitude but pgvector's
	// `<=>` still has to divide by it, and a unit vector keeps the comparison
	// with stored vectors exact rather than merely proportional.
	let norm = 0
	for (const value of vector) norm += value * value
	norm = Math.sqrt(norm)
	if (!norm) return null
	for (let index = 0; index < vector.length; index++) vector[index]! /= norm

	return vector
}

function parseVector(text: string | null | undefined): Array<number> | null {
	if (!text) return null
	const inner = text.slice(1, -1)
	if (!inner) return null
	return inner.split(',').map(Number)
}

/**
 * Works nearest the drift vector that this drift has not been shown.
 *
 * The same index, operator and probes as `searchInterpretations`, for the same
 * reasons documented there — in particular `<=>` rather than `<->`, which would
 * silently fall back to a sequential scan over 89,800 rows instead of failing.
 */
async function nearestUnseen({
	state,
	exclude = [],
	limit,
}: {
	state: DriftState
	exclude?: Array<number>
	limit: number
}): Promise<Array<DriftCard>> {
	const vector = await driftVector(state)
	if (!vector) return []

	const excluded = [...state.seen, ...exclude]
	const literal = `[${vector.join(',')}]`

	const rows = await prisma.$transaction(async (tx) => {
		await tx.$executeRawUnsafe(`SET LOCAL ivfflat.probes = ${PROBES}`)
		return tx.$queryRawUnsafe<
			Array<{
				resource_id: number
				distance: number
				title: string | null
				title_en: string | null
				not_before: number | null
				not_after: number | null
				institution: string | null
				objectKey: string | null
				artist: string | null
				motifs: Array<string> | null
			}>
		>(
			`WITH candidates AS (
			     SELECT e.resource_id, e.embedding <=> $1::vector AS distance
			       FROM "InterpretationEmbedding" e
			      ORDER BY e.embedding <=> $1::vector
			      LIMIT $2
			 ),
			 best AS (
			     SELECT DISTINCT ON (resource_id) resource_id, distance
			       FROM candidates
			      WHERE resource_id <> ALL($3::int[])
			      ORDER BY resource_id, distance
			 )
			 SELECT b.resource_id,
			        b.distance,
			        r.title,
			        r.title_en,
			        r.not_before,
			        r.not_after,
			        r.institution,
			        r."objectKey",
			        a.name AS artist,
			        COALESCE(
			            (SELECT array_agg(t.name ORDER BY tg.frequency DESC)
			               FROM (
			                   SELECT tag_id, frequency
			                     FROM "Tagging"
			                    WHERE resource_id = r.id
			                    ORDER BY frequency DESC
			                    LIMIT 8
			               ) tg
			               JOIN "Tag" t ON t.id = tg.tag_id),
			            ARRAY[]::text[]
			        ) AS motifs
			   FROM best b
			   JOIN "Resource" r ON r.id = b.resource_id
			   LEFT JOIN "Artist" a ON a.id = r.artist_id
			  WHERE r."objectKey" IS NOT NULL
			  ORDER BY b.distance
			  LIMIT $4`,
			literal,
			limit * NEAREST_OVERFETCH,
			excluded,
			limit,
		)
	})

	return rows.map((row) => ({
		id: row.resource_id,
		title: row.title_en ?? row.title ?? null,
		artist: row.artist,
		notBefore: row.not_before,
		notAfter: row.not_after,
		institution: row.institution,
		objectKey: row.objectKey,
		motifs: row.motifs ?? [],
		represents: 1,
		origin: 'NEAREST' as const,
		embedded: true,
		// Nearest cards are drawn from the whole archive rather than the deck, so
		// this is null in all but a freak case. Their backs are blank, which is
		// the honest state: the notes pass only ever looked at the 640.
		note: noteFor(row.resource_id),
	}))
}

// ---------------------------------------------------------------------------
// The readout
// ---------------------------------------------------------------------------

/**
 * Motifs a pull is disproportionately likely to land on.
 *
 * The baseline is the reader's own sample, not the archive: the question is
 * "given that you were shown a card carrying this motif, how much more often
 * than usual did it pull you", which is answerable from a few dozen verdicts.
 * "How much do gardens pull you compared to other people" is not, and no amount
 * of arithmetic on this table would make it so.
 *
 * `frequency >= 2` drops motifs a single annotator applied once, which are
 * numerous enough to fill the whole readout with noise on their own; the rest of
 * the damping is `scoreMotifs`, which is pure and lives beside the types.
 */
async function motifLift(driftId: string): Promise<{
	toward: Array<MotifLift>
	against: Array<MotifLift>
}> {
	const rows = await prisma.$queryRaw<
		Array<{ name: string; pulled: number; shown: number }>
	>`
		SELECT t.name,
		       count(*) FILTER (WHERE v.verdict = 'PULL')::int AS pulled,
		       count(*)::int AS shown
		  FROM "DriftVerdict" v
		  JOIN "Tagging" tg ON tg.resource_id = v.resource_id
		  JOIN "Tag" t ON t.id = tg.tag_id
		 WHERE v.drift_id = ${driftId}
		   AND tg.frequency >= 2
		 GROUP BY t.name
		HAVING count(*) >= 3
	`

	return scoreMotifs(rows)
}

async function periodSplit(driftId: string): Promise<Array<PeriodSplit>> {
	const rows = await prisma.$queryRaw<
		Array<{ century: number; pulled: number; shown: number }>
	>`
		SELECT (floor((COALESCE(r.not_before, r.not_after) - 1) / 100) + 1)::int AS century,
		       count(*) FILTER (WHERE v.verdict = 'PULL')::int AS pulled,
		       count(*)::int AS shown
		  FROM "DriftVerdict" v
		  JOIN "Resource" r ON r.id = v.resource_id
		 WHERE v.drift_id = ${driftId}
		   AND COALESCE(r.not_before, r.not_after) IS NOT NULL
		 GROUP BY 1
		 ORDER BY 1
	`
	return rows.map((row) => ({
		century: Number(row.century),
		pulled: Number(row.pulled),
		shown: Number(row.shown),
	}))
}

export async function buildReadout(state: DriftState): Promise<DriftReadout> {
	const [motifs, periods] = await Promise.all([
		motifLift(state.id),
		periodSplit(state.id),
	])

	let nearest: Array<DriftCard> = []
	let error: string | null = null
	if (state.pulled.length === 0) {
		error =
			'Nothing pulled, so there is no direction to point. The counts below still stand.'
	} else {
		try {
			nearest = await nearestUnseen({ state, limit: 12 })
			if (nearest.length === 0) {
				error =
					'None of your pulls landed on a work with an embedded reading, so no vector could be formed.'
			}
		} catch (caught) {
			console.error('drift: readout vector failed', caught)
			error =
				'The reading index could not be consulted, so the nearest works are missing. Everything else on this page is counted from your verdicts alone.'
		}
	}

	const unreadVerdicts = [...state.seen].filter(
		(id) => DECK_BY_ID.get(id)?.embedded === false,
	).length

	return {
		tally: state.tally,
		motifs: motifs.toward,
		againstMotifs: motifs.against,
		periods,
		nearest,
		unreadVerdicts,
		error,
	}
}
