/**
 * Builds the deck the drift deals from: a few hundred works chosen to
 * span the archive rather than to represent it proportionally.
 *
 * Nobody is going to look at 54,497 pictures, so the drift looks at ~600 and
 * the only question that matters is which 600. A random draw answers it badly:
 * the corpus is what it is, and a random 600 is mostly the thing the corpus has
 * most of, so a reader would swipe through forty near-identical devotional
 * panels and learn nothing about their own eye. Stratifying by century and
 * collection is better but requires guessing the axes in advance, and the
 * interesting variation in this archive — what the pictures are *about* — is not
 * one of the columns.
 *
 * So the spread is taken in the space that already encodes aboutness: the bge-m3
 * readings behind `/archive/atlas`. Each work is reduced to the mean of its
 * reading vectors and the deck is chosen by k-means++ D² sampling — pick a work
 * at random, then repeatedly pick another with probability proportional to the
 * square of its distance from everything picked so far. Every chosen card is a
 * real work rather than a centroid nothing sits on, the choice is density-aware
 * (so it does not simply collect the corpus's weirdest outliers, which pure
 * farthest-point sampling would), and each card carries the size of the
 * neighbourhood it stands for.
 *
 * What the spread cannot see is worth saying plainly: these are vectors of
 * *text about pictures*. Two works land near each other when their readings say
 * similar things, not when they look alike. The deck spans subject and mood; it
 * does not span palette or handling, and no amount of sampling here would make
 * it. That is a job for image embeddings, which this archive does not have.
 *
 * Reads the LOCAL database by default, for the reason
 * `scripts/export-embedding-atlas.mjs` gives: the same 89,800 vectors are here,
 * and pulling 216MB of them through a ~1GB production instance to rebuild a file
 * that could have been built from a laptop would be a self-inflicted incident.
 *
 *   node --env-file=.env scripts/build-drift-deck.mjs
 *   node --env-file=.env scripts/build-drift-deck.mjs --cards 400 --seed 7
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import pg from 'pg'
import { configFromUrl } from './lib/credentials.mjs'

const { Client } = pg

const DIMENSIONS = 1024
const BATCH_SIZE = 2000

/**
 * How many cluster representatives the deck holds.
 *
 * The ceiling is attention, not compute: a drift is thirty or forty cards,
 * and the deck only has to be large enough that two readers — or the same reader
 * twice — do not walk the same path through it. Six hundred gives every drift
 * a fresh draw while keeping each card the representative of a neighbourhood
 * around 90 works wide, which is small enough for the phrase "stands for" to
 * mean something.
 */
const DEFAULT_CARDS = 600

/**
 * How many works with no readings are mixed in.
 *
 * 1,708 works carry an image but no embedded reading, so the spread cannot see
 * them at all. Left out entirely, the deck would quietly become "the part of the
 * archive the model has opinions about" while presenting itself as the archive.
 * They are drawn at random — there is no space to spread them in — and marked,
 * so the readout can say how many of the reader's verdicts landed on works the
 * drift vector will never be able to account for.
 */
const DEFAULT_UNREAD = 40

/** Motifs kept per card: enough for honest alt text, not the whole tail. */
const MOTIFS_PER_CARD = 8

const args = new Map()
for (let index = 2; index < process.argv.length; index++) {
	const argument = process.argv[index]
	if (!argument.startsWith('--')) continue
	const [name, inlineValue] = argument.slice(2).split('=', 2)
	if (inlineValue !== undefined) {
		args.set(name, inlineValue)
	} else if (
		process.argv[index + 1] &&
		!process.argv[index + 1].startsWith('--')
	) {
		args.set(name, process.argv[++index])
	} else {
		args.set(name, true)
	}
}

const cardCount = Number(args.get('cards') ?? DEFAULT_CARDS)
const unreadCount = Number(args.get('unread') ?? DEFAULT_UNREAD)
const seed = Number(args.get('seed') ?? 42)
const outputPath = resolve(
	String(args.get('out') ?? 'app/data/drift/deck.json'),
)
const connectionString = args.get('url')
	? String(args.get('url'))
	: process.env.DATABASE_URL

if (!connectionString) {
	console.error(
		'DATABASE_URL is not set. Run this as `node --env-file=.env scripts/build-drift-deck.mjs`,\n' +
			'or pass --url to target a different database.',
	)
	process.exit(1)
}

/**
 * mulberry32 — a seeded PRNG, so the same seed rebuilds the same deck.
 *
 * Reproducibility is not a nicety here. The deck is a published sample, and a
 * sample nobody can regenerate is a sample nobody can check.
 */
function makeRandom(state) {
	let a = state >>> 0
	return function random() {
		a = (a + 0x6d2b79f5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

/** See `scripts/export-embedding-atlas.mjs` — same format, same reason. */
function parseVectorInto(text, target, offset) {
	let cursor = 1
	for (let index = 0; index < DIMENSIONS; index++) {
		const comma = text.indexOf(',', cursor)
		const end = comma === -1 ? text.length - 1 : comma
		target[offset + index] += Number(text.slice(cursor, end))
		cursor = end + 1
	}
}

const client = new Client(
	await configFromUrl(connectionString, 'candidgarden-drift-deck'),
)
await client.connect()

/**
 * One model per deck, for the reason the atlas export gives: vectors from two
 * models occupy unrelated spaces, and a spread taken across the union of them
 * would be a spread across the seam between the models rather than across the
 * archive.
 */
const { rows: models } = await client.query(
	`SELECT model, count(*)::int AS n FROM "InterpretationEmbedding" GROUP BY model ORDER BY n DESC`,
)
if (models.length === 0) {
	console.error('No rows in InterpretationEmbedding.')
	await client.end()
	process.exit(1)
}
if (models.length > 1) {
	console.error(
		'InterpretationEmbedding holds vectors from more than one model:\n' +
			models.map(({ model, n }) => `  ${model}  ${n}`).join('\n'),
	)
	await client.end()
	process.exit(1)
}

/**
 * Only works with an image are eligible.
 *
 * A card in this deck is a picture the reader looks at and reacts to. A work
 * with no image on file is a perfectly good archive record and a completely
 * useless card, and it would spend one of the reader's forty glances on a grey
 * box.
 */
const { rows: totals } = await client.query(
	`SELECT count(DISTINCT e.resource_id)::int AS works
	   FROM "InterpretationEmbedding" e
	   JOIN "Resource" r ON r.id = e.resource_id
	  WHERE r."objectKey" IS NOT NULL`,
)
const workCount = totals[0].works

if (cardCount >= workCount) {
	console.error(
		`--cards ${cardCount} exceeds the ${workCount} works available.`,
	)
	await client.end()
	process.exit(1)
}

console.log(
	`Reducing ${workCount.toLocaleString()} works to mean reading vectors (${models[0].model})`,
)

// ---------------------------------------------------------------------------
// 1. One vector per work: the mean of its readings, renormalised.
//
// A work has a Level II reading and usually a Level III one, and they can sit
// far apart — the atlas exists partly to show that. For choosing a spread of
// *works* the two have to collapse to one point, and the mean direction is the
// honest collapse: it is where the work sits on average, and the disagreement
// between its own readings is a different question than the one this deck asks.
// ---------------------------------------------------------------------------

const sums = new Float32Array(workCount * DIMENSIONS)
const readingCounts = new Int32Array(workCount)
const resourceIds = new Int32Array(workCount)
const slotOf = new Map()

let after = ''
let seen = 0
for (;;) {
	const { rows } = await client.query(
		`SELECT e.interpretation_id, e.resource_id, e.embedding::text AS embedding
		   FROM "InterpretationEmbedding" e
		   JOIN "Resource" r ON r.id = e.resource_id
		  WHERE r."objectKey" IS NOT NULL
		    AND e.interpretation_id > $1
		  ORDER BY e.interpretation_id
		  LIMIT $2`,
		[after, BATCH_SIZE],
	)
	if (rows.length === 0) break

	for (const row of rows) {
		let slot = slotOf.get(row.resource_id)
		if (slot === undefined) {
			slot = slotOf.size
			slotOf.set(row.resource_id, slot)
			resourceIds[slot] = row.resource_id
		}
		parseVectorInto(row.embedding, sums, slot * DIMENSIONS)
		readingCounts[slot]++
	}

	seen += rows.length
	after = rows[rows.length - 1].interpretation_id
	process.stdout.write(`\r  ${seen.toLocaleString()} readings`)
}
process.stdout.write('\n')

// The means are renormalised to unit length so that cosine distance is
// 1 - dot(a, b), which turns every distance in the sampling loop below into a
// single fused multiply-add pass with no square roots in it.
for (let slot = 0; slot < workCount; slot++) {
	const offset = slot * DIMENSIONS
	let norm = 0
	for (let d = 0; d < DIMENSIONS; d++) {
		const value = sums[offset + d]
		norm += value * value
	}
	norm = Math.sqrt(norm) || 1
	for (let d = 0; d < DIMENSIONS; d++) sums[offset + d] /= norm
}

// ---------------------------------------------------------------------------
// 2. k-means++ D² sampling.
//
// `nearest` and `nearestDistance` are maintained as centres are added, which is
// what makes this affordable: adding a centre costs one pass over the corpus
// rather than a re-scan against every centre chosen so far, and the cluster
// assignment the deck needs falls out of the same bookkeeping for free.
// ---------------------------------------------------------------------------

const random = makeRandom(seed)
const nearestDistance = new Float32Array(workCount).fill(2)
const nearest = new Int32Array(workCount).fill(-1)
const chosen = []
const isChosen = new Uint8Array(workCount)

function absorbCentre(centre) {
	const centreOffset = centre * DIMENSIONS
	const index = chosen.length
	chosen.push(centre)
	isChosen[centre] = 1

	for (let slot = 0; slot < workCount; slot++) {
		const offset = slot * DIMENSIONS
		let dot = 0
		for (let d = 0; d < DIMENSIONS; d++) {
			dot += sums[offset + d] * sums[centreOffset + d]
		}
		const distance = 1 - dot
		if (distance < nearestDistance[slot]) {
			nearestDistance[slot] = distance
			nearest[slot] = index
		}
	}
}

console.log(`Choosing ${cardCount} representatives (seed ${seed})`)
const startedAt = Date.now()
absorbCentre(Math.floor(random() * workCount))

while (chosen.length < cardCount) {
	// D² sampling: weight by the square of the distance to the nearest centre,
	// so the draw is pulled towards under-covered regions without being handed
	// to whichever single work is strangest.
	let total = 0
	for (let slot = 0; slot < workCount; slot++) {
		if (isChosen[slot]) continue
		const d = nearestDistance[slot]
		total += d * d
	}

	let target = random() * total
	let pick = -1
	for (let slot = 0; slot < workCount; slot++) {
		if (isChosen[slot]) continue
		const d = nearestDistance[slot]
		target -= d * d
		if (target <= 0) {
			pick = slot
			break
		}
	}
	// Floating-point drift in the running subtraction can walk past the end of
	// the weights; falling back to the farthest work keeps the draw sensible
	// rather than aborting a twenty-minute run.
	if (pick === -1) {
		let worst = -1
		let worstDistance = -1
		for (let slot = 0; slot < workCount; slot++) {
			if (isChosen[slot]) continue
			if (nearestDistance[slot] > worstDistance) {
				worstDistance = nearestDistance[slot]
				worst = slot
			}
		}
		pick = worst
	}

	absorbCentre(pick)
	if (chosen.length % 25 === 0) {
		const elapsed = (Date.now() - startedAt) / 1000
		process.stdout.write(
			`\r  ${chosen.length} / ${cardCount}  (${elapsed.toFixed(0)}s)`,
		)
	}
}
process.stdout.write('\n')

const clusterSizes = new Int32Array(cardCount)
let spreadTotal = 0
for (let slot = 0; slot < workCount; slot++) {
	clusterSizes[nearest[slot]]++
	spreadTotal += nearestDistance[slot]
}

// ---------------------------------------------------------------------------
// 3. The unread tail, and the metadata every card needs.
// ---------------------------------------------------------------------------

const { rows: unreadRows } = await client.query(
	`SELECT r.id
	   FROM "Resource" r
	  WHERE r."objectKey" IS NOT NULL
	    AND NOT EXISTS (
	        SELECT 1 FROM "InterpretationEmbedding" e WHERE e.resource_id = r.id
	    )
	  ORDER BY r.id`,
)
const unreadPool = unreadRows.map((row) => row.id)
const unreadPicks = []
for (
	let i = unreadPool.length - 1;
	i > 0 && unreadPicks.length < unreadCount;
) {
	const j = Math.floor(random() * (i + 1))
	unreadPicks.push(unreadPool[j])
	unreadPool[j] = unreadPool[i]
	i--
}

const spreadIds = chosen.map((slot) => resourceIds[slot])
const allIds = [...spreadIds, ...unreadPicks]

const { rows: metadata } = await client.query(
	`SELECT r.id,
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
	                    LIMIT $2
	               ) tg
	               JOIN "Tag" t ON t.id = tg.tag_id),
	            ARRAY[]::text[]
	        ) AS motifs
	   FROM "Resource" r
	   LEFT JOIN "Artist" a ON a.id = r.artist_id
	  WHERE r.id = ANY($1::int[])`,
	[allIds, MOTIFS_PER_CARD],
)

const byId = new Map(metadata.map((row) => [row.id, row]))

function toCard(id, extra) {
	const row = byId.get(id)
	if (!row) return null
	return {
		id: row.id,
		title: row.title_en ?? row.title ?? null,
		artist: row.artist ?? null,
		notBefore: row.not_before,
		notAfter: row.not_after,
		institution: row.institution ?? null,
		objectKey: row.objectKey,
		motifs: row.motifs ?? [],
		...extra,
	}
}

const cards = [
	...chosen.map((slot, index) =>
		toCard(resourceIds[slot], {
			cluster: index,
			// What this card stands for: the number of works whose readings are
			// nearer to it than to any other card in the deck. The readout quotes
			// this, because "14 of 40 pulled you" means something quite different
			// when one of those cards spoke for 900 works and another for six.
			represents: clusterSizes[index],
			readings: readingCounts[slot],
		}),
	),
	...unreadPicks.map((id) =>
		toCard(id, { cluster: null, represents: 1, readings: 0 }),
	),
].filter(Boolean)

const deck = {
	formatVersion: 1,
	model: models[0].model,
	seed,
	builtAt: new Date().toISOString(),
	corpus: {
		/** Works the spread could see: embedded, with an image. */
		spreadOver: workCount,
		/** Works with an image but no embedded reading, of which some are mixed in. */
		unread: unreadRows.length,
	},
	coverage: {
		cards: cards.length,
		spreadCards: chosen.length,
		unreadCards: unreadPicks.length,
		largestCluster: Math.max(...clusterSizes),
		medianCluster: [...clusterSizes].sort((a, b) => a - b)[
			Math.floor(cardCount / 2)
		],
		/**
		 * Mean cosine distance from a work to its nearest card. The one number
		 * that says how good the spread is: how far the archive sits, on average,
		 * from the nearest thing the reader will actually be shown.
		 */
		meanDistanceToNearestCard: Number((spreadTotal / workCount).toFixed(4)),
	},
	cards,
}

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, JSON.stringify(deck, null, '\t') + '\n')
await client.end()

console.log(
	`Wrote ${cards.length} cards (${chosen.length} spread + ${unreadPicks.length} unread) to ${outputPath}\n` +
		`  cluster size: median ${deck.coverage.medianCluster}, largest ${deck.coverage.largestCluster}\n` +
		`  mean distance to nearest card: ${deck.coverage.meanDistanceToNearestCard}`,
)
