/**
 * Looks at every card in the built deck and asks whether it should be there.
 *
 * `scripts/pick-drift-paintings.mjs` decides what is a painting by reading the
 * record, which is the only affordable way to judge ten thousand of them and is
 * wrong in two ways that reading cannot catch. A record whose readings never
 * name a medium gets classified on vocabulary, and "engraved with extraordinary
 * delicacy" reads like brushwork to anyone not looking at the sheet. And the
 * archive's own attribution is sometimes wrong in a way no medium test would
 * find: every one of Michelangelo Buonarroti's works in this collection is
 * filed under the artist record for *Michelangelo Merisi da Caravaggio*, so the
 * pool cheerfully offered the Doni Tondo as a Caravaggio.
 *
 * The deck is 320 cards, which is few enough to look at. This pass fetches each
 * plate and asks two questions of the picture itself:
 *
 *   1. Is this a painting?
 *   2. Could this be by the painter on the card?
 *
 * The second question is deliberately weak — "could this be" rather than "is
 * this" — because a model asked to authenticate will start rejecting perfectly
 * ordinary attributions on stylistic hunches, and the archive's cataloguing is
 * the authority here, not the model's eye. It is looking for the Sistine
 * ceiling under Caravaggio's name, not for a disputed workshop hand.
 *
 * A rejection is written back into `pool.json` as a verdict of its own, so the
 * work leaves the pool for good and the next `npm run drift:deck` deals
 * something else in its place. That is the loop this is meant to be run in:
 *
 *   npm run drift:deck && npm run drift:verify && npm run drift:deck
 *
 * until a verify pass comes back clean. Verdicts already recorded by a previous
 * verify are not re-asked, so the loop converges rather than paying for the
 * whole deck each time.
 *
 * Needs ANTHROPIC_API_KEY and AWS_S3_BUCKET; the plates live in S3.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'

/**
 * Sonnet, between the two models the other drift passes use.
 *
 * Telling an engraving from an oil painting on sight is not a hard visual
 * judgement — hatching against brushwork, plate mark against canvas weave — but
 * it is a visual one, and the plates are photographs of works in rooms, at
 * angles, behind glass, in black and white. Haiku is asked to read; this is
 * asked to look.
 */
const MODEL = 'claude-sonnet-5'

/** See `write-drift-notes.mjs`: the API caps one image at 5MB base64, and a
 *  truncated plate would be judged as though it were the work. */
const MAX_IMAGE_BYTES = 4_500_000

/** Concurrent calls; each one fetches a plate from S3 before it can ask. */
const DEFAULT_CONCURRENCY = 6

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
const poolPath = resolve(String(args.get('pool') ?? 'app/data/drift/pool.json'))
const concurrency = Number(args.get('concurrency') ?? DEFAULT_CONCURRENCY)
const limit = args.get('limit') ? Number(args.get('limit')) : Infinity
const dryRun = Boolean(args.get('dry-run'))

if (!process.env.ANTHROPIC_API_KEY) {
	console.error(
		'ANTHROPIC_API_KEY is not set. Run this as `npm run drift:verify`.',
	)
	process.exit(1)
}
if (!process.env.AWS_S3_BUCKET) {
	console.error('AWS_S3_BUCKET is not set — the plates live in S3.')
	process.exit(1)
}

const anthropic = new Anthropic()
const s3 = new S3Client({ region: process.env.AWS_REGION })

const deck = JSON.parse(await readFile(deckPath, 'utf8'))
const poolFile = JSON.parse(await readFile(poolPath, 'utf8'))

const SYSTEM = `You are checking cards for a deck of paintings. Each card shows one photograph from an art-historical archive, together with what the archive records about it. Answer two questions about the picture in front of you.

1. IS IT A PAINTING? Paint laid on a support as the finished work — oil, tempera, fresco, distemper, gouache, watercolour or pastel, on panel, canvas, wall or paper. Look at the surface, not at the subject. Brushwork, glazes, craquelure, a canvas weave, the flat matte of fresco: painting. Parallel hatching, burin lines, a plate mark, the grain of a woodblock, the tonal grain of a photographic print: not a painting. Pencil, chalk and pen lines on bare paper: not a painting. Carved or modelled form, whatever it is made of: not a painting. A photograph of a building, a room, an interior or an altar assemblage rather than of one painted picture: not a painting.

A photograph OF a painting is a painting for this purpose — every plate here is a photograph of something, and the question is what it is a photograph of. Black-and-white plates are common and are not evidence either way.

2. COULD IT BE BY THIS PAINTER? You are not authenticating. The archive's attribution stands unless the picture makes it impossible — a Renaissance fresco cycle filed under an Impressionist, a marble tomb filed under a painter, a work centuries away from anything that painter could have made. Answer "no" only when a specialist would call the pairing an obvious cataloguing error, and say why in one clause. If the picture is merely unlike what you would expect of them, answer "yes".

Reply with one JSON object and nothing else:
{"painting": true|false, "medium": "<two or three words for what you actually see>", "attribution": "yes"|"no", "why": "<one short clause, only when something is wrong; otherwise empty>"}`

function mediaTypeFor(objectKey) {
	const extension = objectKey.split('.').pop()?.toLowerCase()
	if (extension === 'png') return 'image/png'
	if (extension === 'webp') return 'image/webp'
	if (extension === 'gif') return 'image/gif'
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

function describe(card) {
	const period =
		card.notBefore && card.notAfter && card.notBefore !== card.notAfter
			? `${card.notBefore}–${card.notAfter}`
			: (card.notBefore ?? card.notAfter ?? 'date not recorded')
	return [
		`Title: ${card.title ?? 'untitled'}`,
		`Painter as catalogued: ${card.artist ?? 'not attributed'}`,
		`Date: ${period}`,
		`Collection: ${card.institution ?? 'not recorded'}`,
	].join('\n')
}

async function check(card) {
	const plate = await fetchPlate(card.objectKey)
	const response = await anthropic.messages.create({
		model: MODEL,
		max_tokens: 300,
		system: SYSTEM,
		messages: [
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
					{ type: 'text', text: describe(card) },
				],
			},
			{ role: 'assistant', content: '{' },
		],
	})
	const text = '{' + (response.content[0]?.text ?? '')
	return JSON.parse(text.slice(0, text.lastIndexOf('}') + 1))
}

/** Cards a previous verify has already passed are not looked at again. */
const queue = deck.cards
	.filter((card) => {
		const verdict = poolFile.verdicts[String(card.id)]
		return card.objectKey && verdict?.verdict !== 'painting-seen'
	})
	.slice(0, limit === Infinity ? undefined : limit)

console.log(
	`${deck.cards.length} cards, ${queue.length} not yet looked at (${MODEL})`,
)

const rejected = []
let done = 0
let failed = 0

async function worker() {
	for (;;) {
		const card = queue.shift()
		if (!card) return
		let answer
		try {
			answer = await check(card)
		} catch (caught) {
			failed++
			console.warn(`\n  ! ${card.id} could not be checked: ${caught.message}`)
			continue
		}
		done++

		const keep = answer.painting === true && answer.attribution !== 'no'
		if (keep) {
			poolFile.verdicts[String(card.id)] = {
				...poolFile.verdicts[String(card.id)],
				verdict: 'painting-seen',
				seen: String(answer.medium ?? '').slice(0, 60),
			}
		} else {
			rejected.push({ card, answer })
			poolFile.verdicts[String(card.id)] = {
				...poolFile.verdicts[String(card.id)],
				verdict: answer.painting === true ? 'misattributed' : 'other',
				seen: String(answer.medium ?? '').slice(0, 60),
				why: String(answer.why ?? '').slice(0, 200),
			}
		}
		process.stdout.write(
			`\r  ${done} checked, ${rejected.length} rejected, ${failed} failed`,
		)
	}
}

await Promise.all(
	Array.from({ length: Math.min(concurrency, queue.length) }, worker),
)
if (done || failed) process.stdout.write('\n')

for (const { card, answer } of rejected) {
	console.log(
		`  ✗ ${card.id}  ${card.artist ?? '—'} · ${card.title ?? 'untitled'}\n` +
			`      seen as ${answer.medium}${answer.why ? ` — ${answer.why}` : ''}`,
	)
}

/**
 * `painting-seen` and the rejections both go back into the pool file, so the
 * next build deals around them. The pool's own `works` list is rebuilt from the
 * verdicts here rather than filtered, so a work that a person later edits back
 * to `painting` by hand returns to the pool on the next run of either script.
 */
if (!dryRun) {
	poolFile.works = Object.entries(poolFile.verdicts)
		.filter(([, verdict]) =>
			['painting', 'painting-seen'].includes(verdict.verdict),
		)
		.map(([id]) => Number(id))
		.sort((a, b) => a - b)
	poolFile.verifiedAt = new Date().toISOString()
	await writeFile(poolPath, JSON.stringify(poolFile, null, '\t') + '\n')
}

console.log(
	`\n${done} cards looked at, ${rejected.length} rejected, ${failed} could not be fetched.\n` +
		(rejected.length
			? `${dryRun ? 'Dry run: nothing written.' : `Written back to ${poolPath}. Rebuild with \`npm run drift:deck\`, then verify again.`}`
			: 'Nothing to remove — the deck is clean.'),
)
