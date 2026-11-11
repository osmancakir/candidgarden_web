/**
 * Names the regions and neighborhoods `scripts/cluster-atlas.py` found, and
 * writes the two files the atlas serves: `public/atlas/atlas.bin` and
 * `public/atlas/atlas.json`.
 *
 *   node --env-file=.env scripts/name-atlas-clusters.mjs
 *   node --env-file=.env scripts/name-atlas-clusters.mjs --terms-only
 *
 * A cluster is a list of points until it has a name. The model is given each
 * cluster's most telling terms and the works at its middle, twelve clusters per
 * request, and asked for a short name in the words of the subject.
 *
 * Names are cached in `.atlas/names.json` by a hash of what the model was
 * shown, so a rerun that finds the same clusters costs nothing, and one that
 * finds a few new ones pays only for those. `--terms-only` skips the model and
 * names each cluster after its two leading terms, so the map can ship without
 * an API key; the cached names are still used where they exist.
 */
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema'

const MODEL = 'claude-opus-5-5'
const BATCH = 12

const args = new Set(process.argv.slice(2))
const termsOnly = args.has('--terms-only')
const atlasDirectory = resolve('.atlas')
const publicDirectory = resolve('public/atlas')

const levels = JSON.parse(
	await readFile(resolve(atlasDirectory, 'clusters.json'), 'utf8'),
)
const cachePath = resolve(atlasDirectory, 'names.json')
/** @type {Record<string, string>} */
const cache = await readFile(cachePath, 'utf8')
	.then((text) => JSON.parse(text))
	.catch(() => ({}))

const signature = (cluster) =>
	createHash('sha256')
		.update(
			cluster.terms.join('|') +
				'#' +
				cluster.examples.map((example) => example.title).join('|'),
		)
		.digest('hex')
		.slice(0, 16)

const INSTRUCTIONS = `You name the regions of a map of an art archive: paintings, prints, drawings, buildings, sculpture and manuscripts, placed by what scholars have written about them (their subjects and meanings), not by medium or maker. For each cluster you get its most telling terms and the works at its middle, with a line from a reading of each.

Give each cluster a name of one to four words that a curious visitor would enjoy reading on the map: specific, concrete and plain, like "Passion of Christ", "Dutch winter scenes", "Roman palace façades", "Edo kabuki actors" or "Vanitas still lifes". Name what the works share, in the words of their subject. Never name a single artist or a museum. No puns, no colons, no quotation marks. Use English. Every name must differ from the others in the same request.`

const schema = /** @type {const} */ ({
	type: 'object',
	additionalProperties: false,
	required: ['clusters'],
	properties: {
		clusters: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['ref', 'name'],
				properties: { ref: { type: 'string' }, name: { type: 'string' } },
			},
		},
	},
})

function describe(ref, cluster) {
	return [
		`${ref} (${cluster.size} readings)`,
		`Telling terms: ${cluster.terms.join(', ')}`,
		...cluster.examples
			.slice(0, 6)
			.map(
				(example) =>
					`- ${example.title}${example.year ? ` (${example.year})` : ''}: ${example.excerpt.slice(0, 200)}`,
			),
	].join('\n')
}

async function nameBatch(anthropic, batch, level) {
	const refs = new Map(
		batch.map((cluster, index) => [`C${index + 1}`, cluster]),
	)
	const response = await anthropic.beta.messages.parse({
		model: MODEL,
		max_tokens: 4000,
		betas: ['server-side-fallback-2026-07-01'],
		fallbacks: 'default',
		output_config: { effort: 'low', format: jsonSchemaOutputFormat(schema) },
		system: INSTRUCTIONS,
		messages: [
			{
				role: 'user',
				content:
					`These are ${level === 'regions' ? 'regions, the largest areas of the map' : 'neighborhoods, small areas seen up close'}.\n\n` +
					[...refs]
						.map(([ref, cluster]) => describe(ref, cluster))
						.join('\n\n'),
			},
		],
	})
	if (response.stop_reason === 'refusal') {
		throw new Error(
			`declined (${response.stop_details?.category ?? 'no category'})`,
		)
	}
	const parsed = response.parsed_output
	if (!parsed) throw new Error(`no parsable output (${response.stop_reason})`)
	for (const { ref, name } of parsed.clusters) {
		const cluster = refs.get(ref)
		if (cluster && name.trim()) cache[signature(cluster)] = name.trim()
	}
}

const capitalise = (text) => text.charAt(0).toUpperCase() + text.slice(1)
const fromTerms = (cluster) =>
	capitalise(cluster.terms.slice(0, 2).join(' & ') || 'Unnamed')

if (!termsOnly) {
	if (!process.env.ANTHROPIC_API_KEY) {
		console.error(
			'ANTHROPIC_API_KEY is not set. Run with `node --env-file=.env`, or pass --terms-only.',
		)
		process.exit(1)
	}
	const anthropic = new Anthropic()
	for (const [level, clusters] of Object.entries(levels)) {
		const unnamed = clusters.filter((cluster) => !cache[signature(cluster)])
		console.log(`Naming ${unnamed.length} of ${clusters.length} ${level}`)
		const batches = []
		for (let start = 0; start < unnamed.length; start += BATCH) {
			batches.push(unnamed.slice(start, start + BATCH))
		}
		// A few at a time: enough to finish in a minute, few enough not to meet
		// a rate limit on a key other scripts share.
		for (let start = 0; start < batches.length; start += 4) {
			await Promise.all(
				batches.slice(start, start + 4).map((batch) =>
					nameBatch(anthropic, batch, level).catch((error) => {
						console.error(
							`  a batch of ${batch.length} failed: ${error.message}`,
						)
					}),
				),
			)
			// Saved as it goes, so an interrupted run keeps what it paid for.
			await writeFile(cachePath, JSON.stringify(cache, null, 1))
		}
	}
}

let fallbacks = 0
const slim = (clusters) =>
	clusters.map((cluster) => {
		const cached = cache[signature(cluster)]
		if (!cached) fallbacks++
		return {
			id: cluster.id,
			name: cached ?? fromTerms(cluster),
			size: cluster.size,
			center: cluster.center,
			terms: cluster.terms.slice(0, 5),
		}
	})

const manifest = JSON.parse(
	await readFile(resolve(atlasDirectory, 'atlas-v2.json'), 'utf8'),
)
await mkdir(publicDirectory, { recursive: true })
await copyFile(
	resolve(atlasDirectory, 'atlas-v2.bin'),
	resolve(publicDirectory, 'atlas.bin'),
)
await writeFile(
	resolve(publicDirectory, 'atlas.json'),
	JSON.stringify(
		{
			...manifest,
			naming: termsOnly && fallbacks ? 'terms' : MODEL,
			regions: slim(levels.regions),
			neighborhoods: slim(levels.neighborhoods),
		},
		null,
		'\t',
	),
)
console.log(
	`Wrote ${publicDirectory}/atlas.bin and atlas.json` +
		(fallbacks ? `; ${fallbacks} clusters named from their terms` : ''),
)
