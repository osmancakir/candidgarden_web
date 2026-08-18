/**
 * Decides which of the famous painters' records in this archive are paintings,
 * and writes the pool the drift deck is later dealt from.
 *
 * `scripts/lib/drift-painters.mjs` names 235 painters. Their records come to
 * about 10,700 works with a picture and an embedded reading, and only some of
 * those are paintings: Dürer's 371 records are overwhelmingly engravings and
 * woodcuts, Daumier's are lithographs, Michelangelo's are photographs of a
 * ceiling and of marble, and half of Caravaggio's are views of the chapels his
 * canvases hang in. A deck built without that distinction is the old deck with
 * better names on it.
 *
 * The archive has no medium column, so the medium has to be inferred. The
 * obvious inference is from the tags, and it was tried first: weight `gemälde`
 * and `leinwand` up, `radierung` and `skulptur` down, and threshold. It is not
 * good enough in either direction. The tags are crowd terms in three languages
 * describing a *photograph of* the work, so `foto` lands on paintings and
 * `marmor` lands on anything in a church, while Manet's *Portrait d'Émile
 * Zola* scores as a non-painting and four in five Caravaggios are thrown away.
 *
 * So the judgement is made by a model reading the record — title, painter,
 * dates, holder, tags, and both Panofsky readings, which usually say outright
 * what the thing is ("in this etching", "the fresco cycle", "the photograph
 * shows"). It is a cheap call: this is not a question of taste, it is a
 * question a competent reader answers from the description in a second, and
 * the model is used because there are ten thousand of them, not because it is
 * hard. Every verdict is written down with the medium the model named, so the
 * file can be read, argued with and corrected by hand.
 *
 * What counts as a painting here: paint deliberately laid on a support and
 * meant as the finished work — oil, tempera, fresco, distemper, gouache,
 * watercolour, pastel, on panel, canvas, wall or paper. What does not: prints
 * of every kind, drawings and studies in pencil, chalk or ink, photographs,
 * sculpture and relief, architecture, plans, tapestry, stained glass, book
 * pages, and any record whose real subject is a room rather than a picture in
 * it. Watercolour and pastel are inside the line because Turner's watercolours
 * and La Tour's pastels are exactly the sort of thing this deck is for; a
 * pencil study is outside it because it is a means to a painting rather than
 * one.
 *
 *   npm run drift:paintings                 # classifies whatever is unjudged
 *   npm run drift:paintings -- --limit 200  # a sample, to read before trusting
 *   npm run drift:paintings -- --recheck    # re-decide everything from scratch
 *
 * Resumable: verdicts already in the file are kept and never re-asked, so an
 * interrupted run costs only what it had not yet reached. Needs
 * ANTHROPIC_API_KEY and reads the LOCAL database, for the reason
 * `scripts/build-drift-deck.mjs` gives.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import pg from 'pg'
import { configFromUrl } from './lib/credentials.mjs'
import { DRIFT_PAINTER_NAMES } from './lib/drift-painters.mjs'

const { Client } = pg

/**
 * Haiku, where `write-drift-notes.mjs` uses Opus.
 *
 * The two passes fail differently. A note is a claim about a picture and a
 * plausible-but-invented one is indistinguishable from a true one, which is
 * worth the largest model available. This pass asks what kind of object a
 * paragraph is describing, and a paragraph that says "in this etching" has
 * already answered it. The remaining errors are on records that genuinely do
 * not say, and a larger model does not know either.
 */
const MODEL = 'claude-haiku-4-5-20251001'

/** Records per call. Large enough to amortise the instructions, small enough
 *  that one malformed reply costs a batch rather than an hour. */
const BATCH = 25

/** Concurrent calls; the whole pass is ~430 batches and nothing waits on it. */
const CONCURRENCY = 6

/** Tags shown to the model, most-agreed first. */
const TAGS_PER_WORK = 12

/** Characters of each reading shown. The medium, when a reading names it, is
 *  named in the first sentence or two; the rest is iconography. */
const READING_CHARS = 700

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

const outputPath = resolve(
	String(args.get('out') ?? 'app/data/drift/pool.json'),
)
const limit = args.get('limit') ? Number(args.get('limit')) : Infinity
const recheck = Boolean(args.get('recheck'))
const connectionString = args.get('url')
	? String(args.get('url'))
	: process.env.DATABASE_URL

if (!connectionString) {
	console.error(
		'DATABASE_URL is not set. Run this as `npm run drift:paintings`,\n' +
			'or pass --url to target a different database.',
	)
	process.exit(1)
}

const anthropic = new Anthropic()

const client = new Client(
	await configFromUrl(connectionString, 'candidgarden-drift-paintings'),
)
await client.connect()

/**
 * Every record by a named painter that could be dealt as a card: it has a
 * picture to show, and a reading the drift vector can see.
 */
const { rows: works } = await client.query(
	`SELECT r.id,
	        a.name AS painter,
	        COALESCE(r.title_en, r.title) AS title,
	        r.title AS original_title,
	        r.not_before,
	        r.not_after,
	        COALESCE(i.name, r.institution) AS institution,
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
	        ) AS tags,
	        (SELECT string_agg(left(body, $3), E'\\n' ORDER BY level)
	           FROM "Interpretation" WHERE resource_id = r.id) AS readings
	   FROM "Resource" r
	   JOIN "Artist" a ON a.id = r.artist_id
	   LEFT JOIN "Institution" i ON i.id = r.institution_id
	  WHERE a.name = ANY($1::text[])
	    AND r."objectKey" IS NOT NULL
	    AND EXISTS (
	        SELECT 1 FROM "InterpretationEmbedding" e WHERE e.resource_id = r.id
	    )
	  ORDER BY r.id`,
	[DRIFT_PAINTER_NAMES, TAGS_PER_WORK, READING_CHARS],
)
await client.end()

const existing = recheck
	? {}
	: await readFile(outputPath, 'utf8')
			.then((text) => JSON.parse(text).verdicts ?? {})
			.catch(() => ({}))

const pending = works
	.filter((work) => !existing[String(work.id)])
	.slice(0, limit === Infinity ? undefined : limit)

console.log(
	`${works.length.toLocaleString()} records by ${DRIFT_PAINTER_NAMES.length} painters; ` +
		`${Object.keys(existing).length.toLocaleString()} already judged, ` +
		`${pending.length.toLocaleString()} to go`,
)

const SYSTEM = `You are cataloguing records in an art-historical photo archive. For each record you decide one thing: is the work it describes a PAINTING, or is it something else?

PAINTING means paint deliberately laid on a support as the finished work: oil, tempera, fresco, distemper, gouache, watercolour or pastel, on panel, canvas, wall, or paper. Painted altarpieces and painted panels of an altarpiece count. A detail or a single panel of a painting counts, as long as the record's subject is the painted surface.

NOT a painting, whatever its quality or fame:
- prints of any kind: engraving, etching, drypoint, woodcut, wood engraving, lithograph, mezzotint, aquatint, book illustration, printed sheet
- drawings and studies: pencil, chalk, charcoal, pen and ink, silverpoint, sanguine — including a drawn study for a painting. An oil or tempera study, sketch or modello on canvas, panel or paper is a PAINTING; only studies in a dry or ink medium are excluded.
- photographs, including a photograph whose subject is a building, a room, an interior or a monument
- sculpture, relief, carving, bronze, marble, plasterwork, medals, ivories
- architecture, ground plans, elevations, architectural drawings, design proposals
- tapestry, stained glass, mosaic, enamel, ceramics, furniture, metalwork, textiles
- manuscript illumination, book pages, title pages, calligraphy, printed text
- posters and printed graphic design
- any record whose real subject is a room, a church, a façade or an installation rather than one painted picture

The readings quoted with each record are machine-written prose about the work and often name the medium outright ("in this etching", "the fresco cycle", "the marble group"). Trust an explicit statement of medium over your own recollection of the artist. Where nothing states the medium, judge from what the description implies — a monochrome sheet of dense line work described as a "print" or "impression" is a print; a described colour surface with brushwork is a painting. If a record genuinely does not say enough to tell, answer "unclear" rather than guessing.

Reply with a JSON array and nothing else. One object per record, in the order given:
{"id": <the record's id>, "verdict": "painting" | "other" | "unclear", "medium": "<two or three words: oil on canvas, engraving, marble sculpture, photograph of interior, …>"}`

function describe(work) {
	const dates =
		work.not_before || work.not_after
			? `${work.not_before ?? '?'}–${work.not_after ?? '?'}`
			: 'undated'
	const lines = [
		`id: ${work.id}`,
		`painter: ${work.painter}`,
		`title: ${work.title ?? '(untitled)'}`,
	]
	if (work.original_title && work.original_title !== work.title) {
		lines.push(`title as catalogued: ${work.original_title}`)
	}
	lines.push(`dated: ${dates}`)
	if (work.institution) lines.push(`holder: ${work.institution}`)
	if (work.tags?.length) lines.push(`tags: ${work.tags.join(', ')}`)
	if (work.readings) {
		lines.push(`readings: ${work.readings.replace(/\s+/g, ' ').trim()}`)
	}
	return lines.join('\n')
}

/**
 * One batch, returning a verdict per record.
 *
 * A reply that comes back unparseable or short is retried once and then given
 * up on: the records it covered stay unjudged, the run continues, and the next
 * run picks them up. Losing 25 records is not worth losing the other 10,000.
 */
async function judge(batch) {
	const prompt = batch.map(describe).join('\n\n---\n\n')
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const response = await anthropic.messages.create({
				model: MODEL,
				max_tokens: 4000,
				system: SYSTEM,
				messages: [
					{ role: 'user', content: prompt },
					// Prefilled so the reply starts inside the array rather than with a
					// sentence about the array.
					{ role: 'assistant', content: '[' },
				],
			})
			const text = '[' + (response.content[0]?.text ?? '')
			const parsed = JSON.parse(text.slice(0, text.lastIndexOf(']') + 1))
			if (!Array.isArray(parsed)) throw new Error('not an array')
			return parsed
		} catch (caught) {
			if (attempt === 1) {
				console.error(`\n  batch of ${batch.length} failed: ${caught.message}`)
				return []
			}
		}
	}
	return []
}

const batches = []
for (let index = 0; index < pending.length; index += BATCH) {
	batches.push(pending.slice(index, index + BATCH))
}

const verdicts = { ...existing }
const byId = new Map(works.map((work) => [work.id, work]))
let done = 0
const startedAt = Date.now()

async function worker() {
	for (;;) {
		const batch = batches.shift()
		if (!batch) return
		const answers = await judge(batch)
		const asked = new Set(batch.map((work) => work.id))
		for (const answer of answers) {
			const id = Number(answer?.id)
			if (!asked.has(id)) continue
			const verdict = String(answer.verdict ?? '').toLowerCase()
			if (!['painting', 'other', 'unclear'].includes(verdict)) continue
			verdicts[String(id)] = {
				verdict,
				medium: String(answer.medium ?? '').slice(0, 60),
				painter: byId.get(id).painter,
				title: byId.get(id).title,
			}
		}
		done += batch.length
		const elapsed = (Date.now() - startedAt) / 1000
		process.stdout.write(
			`\r  ${done.toLocaleString()} / ${pending.length.toLocaleString()} (${elapsed.toFixed(0)}s)`,
		)
	}
}

await Promise.all(
	Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker),
)
if (pending.length) process.stdout.write('\n')

const kept = works.filter(
	(work) => verdicts[String(work.id)]?.verdict === 'painting',
)

const pool = {
	formatVersion: 1,
	model: MODEL,
	builtAt: new Date().toISOString(),
	painters: DRIFT_PAINTER_NAMES.length,
	considered: works.length,
	/** Eligible ids, sorted, which is what the deck and the drift both read. */
	works: kept.map((work) => work.id).sort((a, b) => a - b),
	/**
	 * Every judgement, including the rejections, keyed by id. Kept in the file
	 * rather than thrown away because a rejection is the interesting half: it is
	 * how anyone checks that Rembrandt lost his etchings and not his portraits,
	 * and it is what makes the pass resumable and hand-correctable.
	 */
	verdicts,
}

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, JSON.stringify(pool, null, '\t') + '\n')

const counts = { painting: 0, other: 0, unclear: 0 }
for (const work of works) {
	const verdict = verdicts[String(work.id)]?.verdict
	if (verdict) counts[verdict]++
}
console.log(
	`Wrote ${pool.works.length.toLocaleString()} paintings to ${outputPath}\n` +
		`  painting ${counts.painting.toLocaleString()} · other ${counts.other.toLocaleString()} · ` +
		`unclear ${counts.unclear.toLocaleString()} · unjudged ${(works.length - counts.painting - counts.other - counts.unclear).toLocaleString()}`,
)
