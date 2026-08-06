/**
 * Writes the note on the back of each drift card — the thing a good museum
 * guide says that turns looking at a picture into seeing it.
 *
 * The archive already has prose about every work: two GPT-4o readings per
 * resource, at Panofsky levels 2 and 3, and they are the exact failure this
 * script exists to avoid. They say a Pietà "evokes a deep sense of sorrow" and
 * "transcends its historical and religious roots", which could be pasted under
 * any other Pietà without anyone noticing. Prose that never asks you to look at
 * anything is not a docent note; it is the sound of a model that was given a
 * title and a date and no picture.
 *
 * So this pass is built the other way round. It looks at the actual plate, and
 * the note it wants is one specific *noticing* — a detail already in the frame
 * that the reader's eye slid past, named, with whatever it takes to understand
 * why it is there. Three kinds of claim go into that, and they carry very
 * different risk:
 *
 *   A. Observation — "the child is on a leash". Verifiable by looking. Free.
 *   B. Convention  — "children were put on leading strings then". Well attested
 *      for documented traditions, invented for obscure ones.
 *   C. Biography   — "he was 37 years older and showing off". This is where a
 *      model confabulates fluently, and a fabricated C reads exactly like a
 *      true one.
 *
 * A and B the model writes from the picture and its own knowledge. **C is only
 * allowed with a source it actually went and found**, which is why web search
 * is on: a `source` the model recalls rather than retrieves is not a citation,
 * it is a second hallucination laundering the first. Any C that comes back
 * without a title *and* a URL is dropped here, not shown marked — see
 * `keepGrounded` below.
 *
 * The deck being 640 fixed cards is the whole reason this is tractable. Nobody
 * hand-checks 54,497 notes; 640 is a long afternoon. Treat what this writes as
 * a **draft**: the output is a plain JSON file keyed by resource id, meant to
 * be edited and pruned by a person, and `source: 'EDITORIAL'` on a note means
 * someone did.
 *
 *   npm run drift:notes                      # fills in whatever is missing
 *   npm run drift:notes -- --limit 20        # a sample, to read before committing
 *   npm run drift:notes -- --only 19998      # one card, to iterate on the prompt
 *   npm run drift:notes -- --only 19998 --force
 *
 * Needs ANTHROPIC_API_KEY, plus the S3 credentials every other script reads
 * from `.env`. Resumable: existing notes are never rewritten without --force,
 * so an interrupted run picks up where it stopped.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'

/**
 * Opus 5, and not a cheaper model, for a reason that is specific to this task:
 * the failure mode here is not a wrong answer but a *plausible* one, and the
 * whole value of the note rests on the model being able to tell the difference
 * between a detail it can see and a detail it is reconstructing from what
 * paintings of this kind usually contain.
 */
const MODEL = 'claude-opus-5'

/** Plates above this are rejected rather than silently mangled — the API caps a
 *  single image at 5MB base64, and a truncated plate would be read as the work. */
const MAX_IMAGE_BYTES = 4_500_000

/**
 * Concurrent calls. Low on purpose: this is a one-time offline pass over a few
 * hundred works, each doing its own web searches, and there is nothing to be
 * gained by racing a rate limit to finish an afternoon job in a morning.
 */
const DEFAULT_CONCURRENCY = 4

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

const deckPath = resolve(String(args.get('deck') ?? 'app/data/drift/deck.json'))
const outputPath = resolve(String(args.get('out') ?? 'app/data/drift/notes.json'))
const concurrency = Number(args.get('concurrency') ?? DEFAULT_CONCURRENCY)
const limit = args.get('limit') ? Number(args.get('limit')) : Infinity
const only = args.get('only') ? Number(args.get('only')) : null
const force = Boolean(args.get('force'))
const search = args.get('no-search') !== true

if (!process.env.ANTHROPIC_API_KEY) {
	console.error(
		'ANTHROPIC_API_KEY is not set. Run this as `node --env-file=.env scripts/write-drift-notes.mjs`.',
	)
	process.exit(1)
}
if (!process.env.AWS_S3_BUCKET) {
	console.error('AWS_S3_BUCKET is not set — the plates live in S3.')
	process.exit(1)
}

const anthropic = new Anthropic()
const s3 = new S3Client({ region: process.env.AWS_REGION })

/**
 * What the model is asked for, and — at greater length — what it is asked not
 * to do.
 *
 * The prohibitions carry most of the weight. A model asked for "an engaging
 * note about this artwork" reliably produces the appreciation register the
 * archive's existing readings are already full of, because that register is
 * what the phrase means in almost all of its training data. Naming the failure
 * is what moves it: the banned vocabulary below is quoted from this archive's
 * own level-3 readings.
 */
const SYSTEM = `You write the note on the back of a card in an art archive — the one thing a good museum guide says in front of a picture that changes what the visitor sees.

You are looking at the actual work. Everything you write must be anchored to it.

WHAT A GOOD NOTE DOES
Its job is to redirect the eye to something already in the frame that a viewer scanned past, name it, and explain why it is there. The test: after reading it, the reader looks back at the picture and checks. If your note gives them nothing to check, it has failed.

LENGTH IS A HARD CONSTRAINT: two or three sentences, and under 80 words. This is printed on the back of a card held in a hand, not a wall label — past about 80 words it no longer fits on a phone and the reader has to scroll a paragraph instead of glancing at it. Prose, no headings, no lists.

Choose ONE noticing and give it the whole note. The failure to avoid is the inventory: four true observations chained together with semicolons, each crowding out the others, so the reader finishes with a list instead of a discovery. If you have found three good details, the note is the best one. Open on that detail, not on the work's importance.

THREE KINDS OF CLAIM, IN DESCENDING ORDER OF SAFETY
A — Observation. What is physically in the picture: a gesture, an object, a repair, a proportion, a material, a way the paint or stone is handled. You can see it, so you may state it.
B — Convention. What that detail meant, or why it is done that way: a workshop practice, a devotional type, a costume rule, a technical constraint of the medium. Allowed when the tradition is well documented and you are confident. If you are reaching, leave it out.
C — Biography, motive, patron, circumstance. Names, ages, relationships, intentions, commissions. ONLY if you searched and found it. Never from memory. See below.

The best notes are mostly A with one sentence of B. That is the shape to aim for.

NEVER WRITE
- Appreciation. This archive is already full of it and it is what you are replacing. Banned: "evokes", "poignant", "profound", "masterful", "captures the essence", "invites the viewer to reflect", "timeless", "universal themes", "transcends", "resonates", "speaks to", "serves as a reminder", "testament to".
- Anything that would read the same under a different picture of the same subject. If your sentence would fit any Pietà, delete it.
- Emotional instruction. Do not tell the reader what to feel or what the work is "about" at the level of theme.
- Restating the caption. The reader already has the title, the artist, the date and the collection. Do not open with them.
- Hedging that admits you cannot see. No "appears to be", "likely represents", "may suggest". If you cannot see it, write about something you can.

ON C CLAIMS AND SOURCES
Most works in this archive are anonymous panels, prints and photographs with no scholarship attached. For those, there is no C to find and you should not go looking. Search only when the work is plausibly documented — a named artist of some standing, a famous object, a known commission — and only when a specific fact would genuinely change what the reader sees.

If you search and find something: put it in "context" as ONE sentence — it is printed under the note, not in it, and it does not count against the 80 words. Fill "source" with the publication or institution and "sourceUrl" with the page you actually used. Prefer a museum, a collection catalogue or a scholarly source over a tourism or aggregator site; if the only thing you can find is the latter, that is still better than nothing, but cite it honestly as what it is.
If you did not search, or searched and found nothing specific: "context", "source" and "sourceUrl" must all be null.
Never write a "source" you did not retrieve. An invented citation is worse than no note at all, because it cannot be told apart from a real one.

WHEN TO SKIP
Return kind "SKIP" if the plate is unreadable, or if the only thing you could honestly write is generic appreciation. A blank back is fine. Padding is not.`

/**
 * `strict` is off and the schema is loose about nulls because the interesting
 * validation is not structural: it is whether a C claim arrived with something
 * to check it against, which no schema can express. That check is `keepGrounded`.
 */
const NOTE_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['kind', 'note', 'context', 'source', 'sourceUrl'],
	properties: {
		kind: {
			enum: ['NOTE', 'SKIP'],
			description: 'SKIP when there is nothing honest to say.',
		},
		note: {
			type: 'string',
			description:
				'The note itself: two or three sentences, under 80 words. Empty string when kind is SKIP.',
		},
		context: {
			anyOf: [{ type: 'string' }, { type: 'null' }],
			description:
				'One sentence of biography, motive or circumstance. Null unless retrieved by search.',
		},
		source: {
			anyOf: [{ type: 'string' }, { type: 'null' }],
			description:
				'Publication or institution the context came from. Null when context is null.',
		},
		sourceUrl: {
			anyOf: [{ type: 'string' }, { type: 'null' }],
			description: 'The page actually used. Null when context is null.',
		},
	},
}

function mediaTypeFor(objectKey) {
	const extension = objectKey.split('.').pop()?.toLowerCase()
	if (extension === 'png') return 'image/png'
	if (extension === 'gif') return 'image/gif'
	if (extension === 'webp') return 'image/webp'
	return 'image/jpeg'
}

async function fetchPlate(objectKey) {
	const response = await s3.send(
		new GetObjectCommand({
			Bucket: process.env.AWS_S3_BUCKET,
			Key: objectKey,
		}),
	)
	const bytes = Buffer.from(await response.Body.transformToByteArray())
	if (bytes.byteLength > MAX_IMAGE_BYTES) {
		throw new Error(
			`plate is ${(bytes.byteLength / 1e6).toFixed(1)}MB, over the ${MAX_IMAGE_BYTES / 1e6}MB per-image limit`,
		)
	}
	return { data: bytes.toString('base64'), mediaType: mediaTypeFor(objectKey) }
}

/** The caption the reader already has, so the model does not spend the note
 *  restating it — and the motifs, which are the corpus's own crowd-sourced
 *  record of what people saw in the picture. */
function describe(card) {
	const period =
		card.notBefore && card.notAfter && card.notBefore !== card.notAfter
			? `${card.notBefore}–${card.notAfter}`
			: (card.notBefore ?? card.notAfter ?? 'date not recorded')
	return [
		`Title: ${card.title ?? 'untitled'}`,
		`Artist: ${card.artist ?? 'not attributed'}`,
		`Date: ${period}`,
		`Collection: ${card.institution ?? 'not recorded'}`,
		`Motifs recorded by annotators: ${card.motifs.join(', ') || 'none'}`,
	].join('\n')
}

/**
 * A C claim without both a source and a URL is dropped rather than shown with
 * a hedge. The reader was promised that anything beyond the picture is marked
 * with where it came from; a claim marked "source: unknown" is not a weaker
 * version of that promise, it is the opposite of it.
 */
function keepGrounded(parsed, card) {
	if (!parsed.context) return { ...parsed, context: null, source: null, sourceUrl: null }
	if (parsed.source && parsed.sourceUrl) return parsed
	console.warn(
		`  ! ${card.id} returned context with no retrievable source — dropped`,
	)
	return { ...parsed, context: null, source: null, sourceUrl: null }
}

/**
 * One card, one note.
 *
 * The loop exists for `pause_turn`: with web search enabled the model runs a
 * server-side search loop, and a work that takes more than ten rounds to pin
 * down comes back paused rather than finished. Re-sending the assistant turn
 * resumes it where it stopped; the cap is there so a pathological case cannot
 * spin.
 */
async function writeNote(card) {
	const plate = await fetchPlate(card.objectKey)

	const messages = [
		{
			role: 'user',
			content: [
				{
					type: 'image',
					source: {
						type: 'base64',
						media_type: plate.mediaType,
						data: plate.data,
					},
				},
				{
					type: 'text',
					text: `${describe(card)}\n\nWrite the note for the back of this card.`,
				},
			],
		},
	]

	for (let attempt = 0; attempt < 6; attempt++) {
		const response = await anthropic.messages.create({
			model: MODEL,
			max_tokens: 16000,
			system: SYSTEM,
			messages,
			output_config: {
				effort: 'high',
				format: { type: 'json_schema', schema: NOTE_SCHEMA },
			},
			...(search
				? { tools: [{ type: 'web_search_20260209', name: 'web_search' }] }
				: {}),
		})

		if (response.stop_reason === 'pause_turn') {
			messages.push({ role: 'assistant', content: response.content })
			continue
		}
		if (response.stop_reason === 'refusal') {
			throw new Error('declined by safety classifiers')
		}

		const text = response.content
			.filter((block) => block.type === 'text')
			.map((block) => block.text)
			.join('')
		if (!text) throw new Error(`no text in response (${response.stop_reason})`)

		const parsed = keepGrounded(JSON.parse(text), card)
		if (parsed.kind === 'SKIP') return null

		return {
			body: parsed.note.trim(),
			context: parsed.context?.trim() ?? null,
			source: parsed.source?.trim() ?? null,
			sourceUrl: parsed.sourceUrl?.trim() ?? null,
			/** MODEL until a person edits it, matching `Interpretation.source`. */
			origin: 'MODEL',
			model: MODEL,
			writtenAt: new Date().toISOString(),
		}
	}
	throw new Error('still paused after six continuations')
}

const deck = JSON.parse(await readFile(deckPath, 'utf8'))

let notes = {}
try {
	notes = JSON.parse(await readFile(outputPath, 'utf8')).notes ?? {}
} catch {
	// First run.
}

const queue = deck.cards
	.filter((card) => card.objectKey)
	.filter((card) => (only === null ? true : card.id === only))
	.filter((card) => force || !(card.id in notes))
	.slice(0, limit)

console.log(
	`${queue.length} card${queue.length === 1 ? '' : 's'} to write` +
		`, ${Object.keys(notes).length} already on file` +
		`, search ${search ? 'on' : 'off'}, model ${MODEL}\n`,
)

let written = 0
let skipped = 0
const failures = []

/** Writes after every card, because a run that dies at 500 of 640 should not
 *  cost the 500. */
async function persist() {
	await writeFile(
		outputPath,
		JSON.stringify(
			{ formatVersion: 1, model: MODEL, updatedAt: new Date().toISOString(), notes },
			null,
			'\t',
		) + '\n',
	)
}

let cursor = 0
async function worker() {
	while (cursor < queue.length) {
		const card = queue[cursor++]
		const position = cursor
		try {
			const note = await writeNote(card)
			if (note) {
				notes[card.id] = note
				written++
				console.log(
					`[${position}/${queue.length}] ${card.id} ${card.title ?? 'untitled'}\n    ${note.body}` +
						(note.context ? `\n    context: ${note.context} — ${note.source}` : ''),
				)
			} else {
				// A skip is recorded so a rerun does not keep paying to re-decide it.
				notes[card.id] = { body: null, skippedAt: new Date().toISOString() }
				skipped++
				console.log(`[${position}/${queue.length}] ${card.id} — skipped`)
			}
			await persist()
		} catch (error) {
			failures.push({ id: card.id, reason: error.message })
			console.error(`[${position}/${queue.length}] ${card.id} FAILED — ${error.message}`)
		}
	}
}

await Promise.all(
	Array.from({ length: Math.min(concurrency, queue.length) }, worker),
)
await persist()

console.log(
	`\nwrote ${written}, skipped ${skipped}, failed ${failures.length}` +
		`\n→ ${outputPath}`,
)
if (failures.length) {
	console.log('\nfailures (rerun to retry — they were not recorded):')
	for (const failure of failures) console.log(`  ${failure.id}: ${failure.reason}`)
}
