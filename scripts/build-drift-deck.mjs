/**
 * Builds the deck the drift deals from: a few hundred paintings, by painters a
 * reader has a chance of having met, spread as widely across subject and
 * century as the archive allows.
 *
 * The first version of this script spread the deck over the *whole* archive —
 * 54,497 records, sampled in the reading space so that no two cards said the
 * same thing. As a sample it was correct and as a deck it was a mistake. The
 * archive is a teaching collection: most of it is ground plans, engraved title
 * pages, plates from pattern books, photographs of façades and sheets from
 * albums, and a spread over all of it deals exactly that. A reader cannot be
 * pulled towards or pushed off a nineteenth-century survey drawing of a portal
 * they have no way to read. They can only be patient with it, and forty cards
 * of patience is not a measurement of anyone's eye.
 *
 * So the deck is now dealt from a pool with two conditions on it, and both are
 * curatorial rather than technical:
 *
 *   1. It is paintings. `scripts/pick-drift-paintings.mjs` decides which
 *      records are paintings and which are prints, drawings, photographs,
 *      sculpture or architecture, and writes the surviving ids to `pool.json`.
 *   2. It is painters someone might know. `scripts/lib/drift-painters.mjs`
 *      names them — 235, from Giotto to Malevich, and the list is a claim about
 *      fame that anyone is free to disagree with.
 *
 * Everything after that is the old machinery, and it still matters. Within the
 * pool the cards are chosen by k-means++ D² sampling over the bge-m3 readings
 * behind `/archive/atlas` — pick a painting, then repeatedly pick another with
 * probability proportional to the square of its distance from everything picked
 * so far. Without it a deck of famous paintings is forty Madonnas, because that
 * is what the pool has most of. With it, every card is a real work rather than
 * a centroid, the draw is density-aware, and each card carries the size of the
 * neighbourhood it stands for.
 *
 * Two things the spread cannot do on its own, both handled below. It cannot
 * balance periods, because two thirds of the pool is the nineteenth century and
 * D² sampling faithfully reproduces that; `PERIOD_FLATTENING` is the correction.
 * And it cannot stop a painter with 345 works in the pool from taking a tenth
 * of the deck; `MAX_PER_PAINTER` is that one.
 *
 * What none of it can see is worth saying plainly: these are vectors of *text
 * about pictures*. Two paintings land near each other when their readings say
 * similar things, not when they look alike. The deck spans subject and mood; it
 * does not span palette or handling, and no amount of sampling here would make
 * it. That is a job for image embeddings, which this archive does not have.
 *
 * Reads the LOCAL database by default, for the reason
 * `scripts/export-embedding-atlas.mjs` gives: the same 89,800 vectors are here,
 * and pulling 216MB of them through a ~1GB production instance to rebuild a file
 * that could have been built from a laptop would be a self-inflicted incident.
 *
 *   npm run drift:deck
 *   npm run drift:deck -- --cards 400 --seed 7
 *   npm run drift:deck -- --refresh-metadata
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import pg from 'pg'
import { configFromUrl } from './lib/credentials.mjs'

const { Client } = pg

const DIMENSIONS = 1024
const BATCH_SIZE = 2000

/**
 * How many cards the deck holds.
 *
 * The ceiling is attention, not compute: a drift is thirty or forty cards, and
 * the deck only has to be large enough that two readers — or the same reader
 * twice — do not walk the same path through it. Three hundred and twenty gives
 * every drift a fresh draw out of a pool of eight thousand paintings, which is
 * about as many as one can also stand behind: the notes pass reads every card,
 * and a person is supposed to read every note.
 */
const DEFAULT_CARDS = 320

/**
 * How hard the period balance pushes against what the archive has.
 *
 * The pool is two thirds nineteenth century — that is a fact about what German
 * institutions photographed, not about painting — and a deck that reproduced it
 * would put Corot next to Courbet next to Constable for thirty cards running.
 * Cards per century go as the century's share of the pool raised to this power:
 * 1 deals the archive's own proportions, 0 deals every century equally
 * regardless of whether the archive can support it. A half sits between, and
 * leaves the nineteenth century the largest period in the deck without letting
 * it be most of it.
 */
const PERIOD_FLATTENING = 0.5

/** No century may take more than this share of the deck, whatever the maths
 *  above says; the surplus goes back to the others in proportion. */
const PERIOD_CEILING = 0.25

/**
 * Cards one painter may hold.
 *
 * Turner alone has 345 paintings in the pool and Cézanne 227, so without a cap
 * the two of them would take a tenth of the deck between them and a reader
 * would meet the same hand over and over. Four is enough for a painter to be
 * recognisable across a drift and few enough that the deck stays a room of
 * many painters rather than a retrospective of three.
 */
const MAX_PER_PAINTER = 4

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
const seed = Number(args.get('seed') ?? 42)
const outputPath = resolve(
	String(args.get('out') ?? 'app/data/drift/deck.json'),
)
const poolPath = resolve(String(args.get('pool') ?? 'app/data/drift/pool.json'))
const connectionString = args.get('url')
	? String(args.get('url'))
	: process.env.DATABASE_URL

if (!connectionString) {
	console.error(
		'DATABASE_URL is not set. Run this as `npm run drift:deck`,\n' +
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
 * What a card says about a work, for every card in the deck.
 *
 * `institution` is resolved through the register: the reconciled holder's name
 * where there is one, the cataloguer's wording where there is not. A card is a
 * caption under a picture, and "Amsterdam, Rijksmuseum/ Inv. Nr.:
 * RP-T-1954-.182" is an inventory line rather than the name of a museum.
 * `app/routes/archive/+shared/drift.server.ts` resolves the nearest cards the
 * same way, so both decks caption a collection identically.
 */
async function cardMetadata(ids) {
	const { rows } = await client.query(
		`SELECT r.id,
		        r.title,
		        r.title_en,
		        r.not_before,
		        r.not_after,
		        COALESCE(i.name, r.institution) AS institution,
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
		   LEFT JOIN "Institution" i ON i.id = r.institution_id
		  WHERE r.id = ANY($1::int[])`,
		[ids, MOTIFS_PER_CARD],
	)
	return rows
}

/** One metadata row as the deck writes it. */
function describe(row) {
	return {
		id: row.id,
		title: row.title_en ?? row.title ?? null,
		artist: row.artist ?? null,
		notBefore: row.not_before,
		notAfter: row.not_after,
		institution: row.institution ?? null,
		objectKey: row.objectKey,
		motifs: row.motifs ?? [],
	}
}

/**
 * `--refresh-metadata`: re-read what the existing deck's cards say, and change
 * nothing else.
 *
 * The spread is a published sample and rebuilding it is not a free action — the
 * draw depends on which works were embedded on the day, so a rebuild run to fix
 * a caption would silently deal a different deck and invalidate every drift
 * anyone has taken. This path keeps the card ids, the clusters and the
 * `represents` counts exactly as they are and refreshes only what the database
 * now says about those works, which is the right tool when a name has been
 * corrected upstream rather than when the sample is wrong.
 */
if (args.get('refresh-metadata')) {
	const existing = JSON.parse(await readFile(outputPath, 'utf8'))
	const rows = await cardMetadata(existing.cards.map((card) => card.id))
	const fresh = new Map(rows.map((row) => [row.id, describe(row)]))

	let changed = 0
	for (const card of existing.cards) {
		const next = fresh.get(card.id)
		// A card whose work has since been deleted keeps what it had. Dropping it
		// would change the sample, which is the one thing this path must not do.
		if (!next) continue
		for (const [key, value] of Object.entries(next)) {
			if (JSON.stringify(card[key]) === JSON.stringify(value)) continue
			card[key] = value
			changed++
		}
	}

	await writeFile(outputPath, JSON.stringify(existing, null, '\t') + '\n')
	await client.end()
	console.log(
		`Refreshed ${existing.cards.length} cards in ${outputPath}: ${changed} field(s) changed.\n` +
			`  The spread, its clusters and its counts are untouched.`,
	)
	process.exit(0)
}

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

const poolFile = JSON.parse(await readFile(poolPath, 'utf8'))
const pool = poolFile.works
if (!Array.isArray(pool) || pool.length === 0) {
	console.error(
		`${poolPath} holds no paintings. Run \`npm run drift:paintings\` first.`,
	)
	await client.end()
	process.exit(1)
}

/**
 * The earliest year a painting in this pool could plausibly carry.
 *
 * The dates in this archive are a cataloguer's fields rather than a scholar's
 * claim, and a few of them are neither: Klee's *Gartenhaus* is dated `3–1929`,
 * a Domenichino altarpiece `575–575`, a Moreau `1000–1000`. Left alone they
 * file a 1929 Klee under the third century and hand the earliest period of the
 * deck to three keying errors. So a year outside this window is not read as a
 * date at all, and a work with no plausible year left is not dealt.
 */
const EARLIEST_YEAR = 1200
const LATEST_YEAR = 1960

/**
 * The pool as the spread will see it: a painting, with a picture to show, a
 * reading to place it by, and a date to file it under.
 *
 * The date requirement costs about eighty works and buys a deck in which every
 * card counts towards the readout's period split. An undated painting is a
 * perfectly good painting and a card that quietly drops out of one of the two
 * things the readout can say.
 */
const { rows: dated } = await client.query(
	`SELECT r.id,
	        r.artist_id,
	        r.not_before,
	        r.not_after,
	        COALESCE(r.title_en, r.title) AS title
	   FROM "Resource" r
	  WHERE r.id = ANY($1::int[])
	    AND r."objectKey" IS NOT NULL
	    AND EXISTS (
	        SELECT 1 FROM "InterpretationEmbedding" e WHERE e.resource_id = r.id
	    )
	  ORDER BY r.id`,
	[pool],
)

const withYears = []
for (const row of dated) {
	const plausible = [row.not_before, row.not_after].filter(
		(year) => year !== null && year >= EARLIEST_YEAR && year <= LATEST_YEAR,
	)
	if (plausible.length === 0) continue
	withYears.push({ ...row, year: Math.min(...plausible) })
}

/**
 * A second date rule, and the one that quietly does the most good: a work dated
 * more than a working life away from the middle of its own painter's record is
 * not dealt.
 *
 * It was written to catch dates and it catches attributions. Six works in the
 * pool fail it and all six are wrong in the archive: a Velázquez dated 1800, a
 * copy after Ingres dated 1897, a Rembrandt-school portrait dated 1730, the
 * *Burial of St Lucy* keyed 1908 for 1608 — and the Doni Tondo, which is filed
 * under the artist record for Caravaggio because this archive keeps both
 * Michelangelos in one place. That last one is why the rule earns its keep: a
 * card captioned "Michelangelo Merisi da Caravaggio · Tondo Doni" is not a
 * near-miss, it is the deck telling a reader something false about the one
 * thing a card is for.
 *
 * Seventy years, and only for painters with enough dated works for a middle to
 * mean anything. It is a filter on the deck rather than on the archive: the
 * work keeps its record, it is simply not dealt as a card.
 */
const LIFETIME_YEARS = 70
const MIN_WORKS_FOR_MEDIAN = 5

const byPainter = new Map()
for (const row of withYears) {
	const painter = row.artist_id ?? 0
	if (!byPainter.has(painter)) byPainter.set(painter, [])
	byPainter.get(painter).push(row.year)
}
const medianYear = new Map()
for (const [painter, painterYears] of byPainter) {
	if (painterYears.length < MIN_WORKS_FOR_MEDIAN) continue
	const sorted = [...painterYears].sort((a, b) => a - b)
	medianYear.set(painter, sorted[Math.floor(sorted.length / 2)])
}

const eligible = []
for (const row of withYears) {
	const middle = medianYear.get(row.artist_id ?? 0)
	if (middle !== undefined && Math.abs(row.year - middle) > LIFETIME_YEARS) {
		console.log(
			`  not dealt: ${row.id} dated ${row.year}, ${Math.abs(row.year - middle)} years from the middle of this painter's record — ${row.title ?? 'untitled'}`,
		)
		continue
	}
	eligible.push(row)
}

const workCount = eligible.length
if (cardCount >= workCount) {
	console.error(
		`--cards ${cardCount} exceeds the ${workCount} paintings available.`,
	)
	await client.end()
	process.exit(1)
}

console.log(
	`Reducing ${workCount.toLocaleString()} paintings to mean reading vectors (${models[0].model})`,
)

// ---------------------------------------------------------------------------
// 1. One vector per painting: the mean of its readings, renormalised.
//
// A work has a Level II reading and usually a Level III one, and they can sit
// far apart — the atlas exists partly to show that. For choosing a spread of
// *works* the two have to collapse to one point, and the mean direction is the
// honest collapse: it is where the work sits on average, and the disagreement
// between its own readings is a different question than the one this deck asks.
// ---------------------------------------------------------------------------

const slotOf = new Map(eligible.map((row, slot) => [row.id, slot]))
const resourceIds = Int32Array.from(eligible.map((row) => row.id))
const artistIds = Int32Array.from(eligible.map((row) => row.artist_id ?? 0))
const years = Int32Array.from(eligible.map((row) => row.year))
/**
 * What makes two records the same picture, for the purpose of not dealing both.
 *
 * The archive holds several photographs of one work as several records —
 * three plates of the Arena Chapel, two of a Domenichino altarpiece — and their
 * readings differ enough that the spread happily picks two of them. A reader
 * who meets the same picture twice in forty cards is entitled to conclude the
 * deck is broken. Matching on painter and title catches the repeated plates and
 * nothing else: two different Titian *Raub der Europa* records are the same
 * painting, while *Arenakapelle, Detail* is left alone as a different card.
 */
const titleKeys = eligible.map(
	(row) =>
		`${row.artist_id ?? 0}|${(row.title ?? '')
			.toLowerCase()
			.replace(/[^\p{L}\p{N}]+/gu, ' ')
			.trim()}`,
)

const sums = new Float32Array(workCount * DIMENSIONS)
const readingCounts = new Int32Array(workCount)

let after = ''
let seen = 0
for (;;) {
	const { rows } = await client.query(
		`SELECT e.interpretation_id, e.resource_id, e.embedding::text AS embedding
		   FROM "InterpretationEmbedding" e
		  WHERE e.resource_id = ANY($1::int[])
		    AND e.interpretation_id > $2
		  ORDER BY e.interpretation_id
		  LIMIT $3`,
		[pool, after, BATCH_SIZE],
	)
	if (rows.length === 0) break

	for (const row of rows) {
		const slot = slotOf.get(row.resource_id)
		if (slot === undefined) continue
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
// 2. How many cards each century gets.
//
// Flattened, then capped, then rounded, and the rounding remainder goes to the
// periods the archive can actually support — which is why this is a loop and
// not one line of arithmetic.
// ---------------------------------------------------------------------------

const centuryOf = (year) => Math.floor((year - 1) / 100) + 1

const strata = new Map()
for (let slot = 0; slot < workCount; slot++) {
	const century = centuryOf(years[slot])
	if (!strata.has(century)) strata.set(century, [])
	strata.get(century).push(slot)
}

/**
 * Centuries thin enough that a stratum of their own would be one card standing
 * for a hundred years are merged upwards into the next.
 *
 * The archive holds ten Giottos and one work dated to the sixth century. The
 * latter is a cataloguing accident and the former is a real period with a real
 * painter in it, but neither supports a quota, and a stratum of one is a
 * guaranteed card rather than a spread.
 */
const MIN_STRATUM = 25
const ordered = [...strata.keys()].sort((a, b) => a - b)
for (let index = 0; index < ordered.length - 1; index++) {
	const century = ordered[index]
	const slots = strata.get(century)
	if (slots.length >= MIN_STRATUM) continue
	strata.get(ordered[index + 1]).push(...slots)
	strata.delete(century)
}

const periods = [...strata.entries()]
	.map(([century, slots]) => ({ century, slots, quota: 0 }))
	.sort((a, b) => a.century - b.century)

{
	const weights = periods.map((period) =>
		Math.pow(period.slots.length, PERIOD_FLATTENING),
	)
	const ceiling = Math.floor(cardCount * PERIOD_CEILING)
	const capped = new Set()
	for (;;) {
		const free = periods.reduce(
			(total, period, index) =>
				capped.has(index) ? total : total + weights[index],
			0,
		)
		const budget =
			cardCount -
			[...capped].reduce((total, index) => total + periods[index].quota, 0)
		let clipped = false
		for (let index = 0; index < periods.length; index++) {
			if (capped.has(index)) continue
			const want = Math.min(
				(budget * weights[index]) / free,
				periods[index].slots.length,
				ceiling,
			)
			periods[index].quota = want
			if (want < (budget * weights[index]) / free - 1e-9) {
				capped.add(index)
				clipped = true
			}
		}
		if (!clipped) break
	}
	// Largest-remainder rounding, so the quotas sum to exactly `cardCount`.
	for (const period of periods) period.rounded = Math.floor(period.quota)
	let short = cardCount - periods.reduce((total, p) => total + p.rounded, 0)
	const byRemainder = [...periods].sort(
		(a, b) => b.quota - b.rounded - (a.quota - a.rounded),
	)
	for (const period of byRemainder) {
		if (short <= 0) break
		if (period.rounded >= period.slots.length) continue
		period.rounded++
		short--
	}
}

// ---------------------------------------------------------------------------
// 3. k-means++ D² sampling, once per century.
//
// `nearest` and `nearestDistance` are maintained across the whole pool as
// centres are added, which is what makes this affordable: adding a centre costs
// one pass over the pool rather than a re-scan against every centre chosen so
// far, and the cluster assignment the deck needs falls out of the same
// bookkeeping for free. The clusters are global on purpose — a card stands for
// every painting nearest it, not only for those of its own century.
// ---------------------------------------------------------------------------

const random = makeRandom(seed)
const nearestDistance = new Float32Array(workCount).fill(2)
const nearest = new Int32Array(workCount).fill(-1)
const chosen = []
const isChosen = new Uint8Array(workCount)
const perPainter = new Map()
const takenTitles = new Set()

function absorbCentre(centre) {
	const centreOffset = centre * DIMENSIONS
	const index = chosen.length
	chosen.push(centre)
	isChosen[centre] = 1
	const painter = artistIds[centre]
	perPainter.set(painter, (perPainter.get(painter) ?? 0) + 1)
	takenTitles.add(titleKeys[centre])

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

/**
 * Whether this painting may still be picked.
 *
 * The painter cap is a filter on the draw rather than a rejection after it,
 * because a rejection loop stalls once a stratum is mostly Turner. When a
 * stratum runs out of eligible paintings the cap is lifted one card at a time
 * rather than the quota being abandoned — a deck one card short of a period is
 * worse than a fifth Turner.
 */
function eligibleFor(slot, capacity) {
	if (isChosen[slot]) return false
	if (takenTitles.has(titleKeys[slot])) return false
	return (perPainter.get(artistIds[slot]) ?? 0) < capacity
}

console.log(
	`Choosing ${cardCount} cards over ${periods.length} periods (seed ${seed})`,
)
const startedAt = Date.now()

for (const period of periods) {
	let capacity = MAX_PER_PAINTER
	for (let taken = 0; taken < period.rounded; taken++) {
		let candidates = period.slots.filter((slot) => eligibleFor(slot, capacity))
		while (candidates.length === 0 && capacity <= period.slots.length) {
			capacity++
			console.log(
				`\n  ${period.century}c: painter cap lifted to ${capacity} — ` +
					`${period.rounded} cards wanted from ${new Set(period.slots.map((slot) => artistIds[slot])).size} painters`,
			)
			candidates = period.slots.filter((slot) => eligibleFor(slot, capacity))
		}
		// A period with nothing left to give is left short rather than padded from
		// another century, which is the whole point of having periods.
		if (candidates.length === 0) {
			console.warn(
				`\n  ${period.century}c ran out after ${taken} of ${period.rounded} cards`,
			)
			break
		}

		let pick
		if (chosen.length === 0) {
			pick = candidates[Math.floor(random() * candidates.length)]
		} else {
			// D² sampling: weight by the square of the distance to the nearest card
			// already chosen, so the draw is pulled towards under-covered regions
			// without being handed to whichever single painting is strangest.
			let total = 0
			for (const slot of candidates) {
				const d = nearestDistance[slot]
				total += d * d
			}
			let target = random() * total
			pick = -1
			for (const slot of candidates) {
				const d = nearestDistance[slot]
				target -= d * d
				if (target <= 0) {
					pick = slot
					break
				}
			}
			// Floating-point drift in the running subtraction can walk past the end
			// of the weights; falling back to the farthest candidate keeps the draw
			// sensible rather than aborting the run.
			if (pick === -1) {
				let worstDistance = -1
				for (const slot of candidates) {
					if (nearestDistance[slot] > worstDistance) {
						worstDistance = nearestDistance[slot]
						pick = slot
					}
				}
			}
		}

		absorbCentre(pick)
	}
	process.stdout.write(
		`\r  ${chosen.length} / ${cardCount}  (${((Date.now() - startedAt) / 1000).toFixed(0)}s)`,
	)
}
process.stdout.write('\n')

/** What the cap actually came to, once thin periods had lifted it. */
const effectiveCap = Math.max(...perPainter.values())

const clusterSizes = new Int32Array(chosen.length)
let spreadTotal = 0
for (let slot = 0; slot < workCount; slot++) {
	clusterSizes[nearest[slot]]++
	spreadTotal += nearestDistance[slot]
}

// ---------------------------------------------------------------------------
// 4. The metadata every card needs.
// ---------------------------------------------------------------------------

const metadata = await cardMetadata(chosen.map((slot) => resourceIds[slot]))
const byId = new Map(metadata.map((row) => [row.id, row]))

/**
 * An endpoint that fails the same lifetime test the work passed is not shown.
 *
 * Two cards were captioned "1341–1841" — a Lorenzetti panel whose closing date
 * is a slip for 1441. The work itself is fine and its opening date is right, so
 * dropping the work would be the wrong repair; dropping the endpoint leaves the
 * card saying the part the archive got right and nothing it did not.
 */
function plausibleEndpoint(year, painter) {
	if (year === null) return null
	const middle = medianYear.get(painter ?? 0)
	if (middle === undefined) return year
	return Math.abs(year - middle) > LIFETIME_YEARS ? null : year
}

const cards = chosen
	.map((slot, index) => {
		const row = byId.get(resourceIds[slot])
		if (!row) return null
		return {
			...describe(row),
			notBefore: plausibleEndpoint(row.not_before, artistIds[slot]),
			notAfter: plausibleEndpoint(row.not_after, artistIds[slot]),
			cluster: index,
			// What this card stands for: the number of paintings in the pool whose
			// readings are nearer to it than to any other card. The readout quotes
			// this, because "14 of 40 pulled you" means something quite different
			// when one of those cards spoke for 200 paintings and another for six.
			represents: clusterSizes[index],
			readings: readingCounts[slot],
		}
	})
	.filter(Boolean)

const sortedClusters = [...clusterSizes].sort((a, b) => a - b)

const deck = {
	formatVersion: 2,
	model: models[0].model,
	seed,
	builtAt: new Date().toISOString(),
	pool: {
		/** Painters the pool was drawn from. */
		painters: new Set(eligible.map((row) => row.artist_id)).size,
		/** Paintings the spread could see: dated, embedded, with a picture. */
		paintings: workCount,
		/** Records by those painters that the painting pass looked at. */
		considered: poolFile.considered ?? null,
	},
	coverage: {
		cards: cards.length,
		/**
		 * Cards held by the painter who holds the most.
		 *
		 * `MAX_PER_PAINTER` where the archive can meet the quota, higher where it
		 * cannot: the fourteenth century is four painters deep in this collection,
		 * so its fifteen cards cannot be four apiece. Recorded rather than left to
		 * be discovered, because it is the number that says how much of the deck
		 * one hand painted.
		 */
		maxPerPainter: effectiveCap,
		largestCluster: Math.max(...clusterSizes),
		medianCluster: sortedClusters[Math.floor(sortedClusters.length / 2)],
		/**
		 * Mean cosine distance from a painting in the pool to its nearest card. The
		 * one number that says how good the spread is: how far the pool sits, on
		 * average, from the nearest thing the reader will actually be shown.
		 */
		meanDistanceToNearestCard: Number((spreadTotal / workCount).toFixed(4)),
		periods: periods.map((period) => ({
			century: period.century,
			cards: period.rounded,
			paintings: period.slots.length,
		})),
	},
	/**
	 * Every painting the deck could have dealt, not only the ones it did.
	 *
	 * `nearestUnseen` in `drift.server.ts` draws the cards that chase a reader's
	 * drift vector, and it draws them from the whole index rather than from this
	 * deck. Without a list to filter against it would answer a run of pulled
	 * Vermeers with an engraved copy of one — perfectly near in the reading
	 * space, and exactly the kind of card this deck exists to stop dealing.
	 *
	 * It is the eligible list rather than the raw pool, so that every rule the
	 * deck is held to — a painting, by a named painter, dated, and dated
	 * plausibly for that painter — holds for a card dealt mid-drift too. A
	 * reader cannot tell the two kinds of card apart, and nothing about them
	 * should need telling apart.
	 */
	poolWorks: eligible.map((row) => row.id),
	cards,
}

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, JSON.stringify(deck, null, '\t') + '\n')
await client.end()

console.log(
	`Wrote ${cards.length} cards to ${outputPath}\n` +
		`  periods: ${periods.map((p) => `${p.century}c ${p.rounded}`).join(', ')}\n` +
		`  cluster size: median ${deck.coverage.medianCluster}, largest ${deck.coverage.largestCluster}\n` +
		`  mean distance to nearest card: ${deck.coverage.meanDistanceToNearestCard}`,
)
