/**
 * Exports every InterpretationEmbedding vector, with the metadata needed to
 * colour and label a point, for the UMAP projection in `scripts/umap-atlas.py`.
 *
 * Reads the LOCAL database by default, not RDS. The local copy is the source
 * `scripts/push-embeddings-to-production.mjs` pushes from, so it holds the same
 * 89,800 vectors — and pulling 368MB of them through a ~1GB production instance
 * to reproduce a file that already exists here would be a self-inflicted
 * incident. `--url` exists for the case where local has been reset.
 *
 * Two files land in the output directory, and their row order is the contract
 * between them:
 *
 *   vectors.f32   N × 1024 little-endian float32, no header. Read with
 *                 `np.fromfile(..., dtype="<f4").reshape(-1, 1024)`.
 *   points.json   { dimensions, count, points: [...] }, one entry per row in
 *                 the same order, so index i in either file is the same reading.
 *
 * The vectors are split out as raw float32 rather than embedded in the JSON
 * because 92M numbers as text is ~1.1GB and minutes of JSON.parse, against
 * 368MB and a single mmap-able read.
 *
 *   node --env-file=.env scripts/export-embedding-atlas.mjs
 *   node --env-file=.env scripts/export-embedding-atlas.mjs --out .atlas --limit 5000
 */
import { createWriteStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import pg from 'pg'
import { configFromUrl } from './lib/credentials.mjs'

const { Client } = pg

const DIMENSIONS = 1024
/**
 * Rows per round trip. Each carries a 1024-float vector, so 2000 rows is ~8MB
 * of text on the wire and ~8MB of parsed floats — large enough that the round
 * trip is amortised, small enough that the driver's per-result buffering stays
 * well clear of the heap limit.
 */
const BATCH_SIZE = 2000

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

const outputDirectory = resolve(String(args.get('out') ?? '.atlas'))
const limit = args.get('limit') ? Number(args.get('limit')) : Infinity
const connectionString = args.get('url')
	? String(args.get('url'))
	: process.env.DATABASE_URL

if (!connectionString) {
	console.error(
		'DATABASE_URL is not set. Run this as `node --env-file=.env scripts/export-embedding-atlas.mjs`,\n' +
			'or pass --url to target a different database.',
	)
	process.exit(1)
}

/**
 * Parses pgvector's text output, `[0.0123,-0.0456,…]`.
 *
 * Hand-rolled rather than `JSON.parse`, which would accept the same string:
 * this is called 89,800 times and allocates a JS array of 1024 boxed numbers
 * each time under JSON.parse, where writing straight into a Float32Array keeps
 * the result at 4KB flat and skips the intermediate entirely.
 *
 * pgvector can also emit `::real[]` — `{0.0123,…}` — but node-postgres parses
 * that into the same boxed array, so there is nothing to gain by switching.
 */
function parseVector(text, into) {
	let cursor = 1 // past '['
	for (let index = 0; index < DIMENSIONS; index++) {
		const comma = text.indexOf(',', cursor)
		const end = comma === -1 ? text.length - 1 : comma // last one stops at ']'
		into[index] = Number(text.slice(cursor, end))
		cursor = end + 1
	}
	return into
}

const client = new Client(
	await configFromUrl(connectionString, 'candidgarden-atlas-export'),
)
await client.connect()

const { rows: totals } = await client.query(
	`SELECT count(*)::int AS total FROM "InterpretationEmbedding"`,
)
const total = Math.min(totals[0].total, limit)

if (total === 0) {
	console.error(
		'No rows in InterpretationEmbedding. Run scripts/embed-interpretations.mjs --apply first.',
	)
	await client.end()
	process.exit(1)
}

/**
 * One model per export, enforced rather than assumed.
 *
 * Vectors from two models occupy unrelated spaces, and UMAP would happily fit
 * the union of them into a picture with a clean seam down the middle that looks
 * like a finding about the corpus. It would be an artefact of the mixture.
 */
const { rows: models } = await client.query(
	`SELECT model, count(*)::int AS n FROM "InterpretationEmbedding" GROUP BY model ORDER BY n DESC`,
)
if (models.length > 1) {
	console.error(
		'InterpretationEmbedding holds vectors from more than one model:\n' +
			models.map(({ model, n }) => `  ${model}  ${n}`).join('\n') +
			'\nProject one model at a time; a mixed fit is meaningless.',
	)
	await client.end()
	process.exit(1)
}

await mkdir(outputDirectory, { recursive: true })

const vectorPath = resolve(outputDirectory, 'vectors.f32')
const vectorStream = createWriteStream(vectorPath)
const points = []
const scratch = new Float32Array(DIMENSIONS)

console.log(
	`Exporting ${total.toLocaleString()} vectors (${models[0].model}) to ${outputDirectory}`,
)

/**
 * Keyset pagination on the primary key, not OFFSET.
 *
 * OFFSET makes the server walk and discard every earlier row, so the last batch
 * of a 45-batch export costs 45 times the first. `interpretation_id > $1` on
 * the PK index is flat, and the ordering is total, so no row is visited twice
 * or skipped.
 */
async function* readRows() {
	let after = ''
	let seen = 0

	while (seen < total) {
		const { rows } = await client.query(
			`SELECT e.interpretation_id,
			        e.resource_id,
			        e.level,
			        e.embedding::text AS embedding,
			        r.title,
			        r.title_en,
			        r.not_before,
			        r.not_after,
			        r.institution,
			        a.name AS artist,
			        length(i.body) AS body_length,
			        i.source
			   FROM "InterpretationEmbedding" e
			   JOIN "Interpretation" i ON i.id = e.interpretation_id
			   JOIN "Resource" r ON r.id = e.resource_id
			   LEFT JOIN "Artist" a ON a.id = r.artist_id
			  WHERE e.interpretation_id > $1
			  ORDER BY e.interpretation_id
			  LIMIT $2`,
			[after, Math.min(BATCH_SIZE, total - seen)],
		)
		if (rows.length === 0) return

		for (const row of rows) {
			parseVector(row.embedding, scratch)
			// Copied, because the stream keeps the buffer until it is flushed and
			// `scratch` is about to be overwritten by the next row.
			yield Buffer.from(
				scratch.buffer.slice(0, DIMENSIONS * Float32Array.BYTES_PER_ELEMENT),
			)

			points.push({
				interpretationId: row.interpretation_id,
				resourceId: row.resource_id,
				level: row.level,
				title: row.title_en ?? row.title ?? null,
				artist: row.artist,
				notBefore: row.not_before,
				notAfter: row.not_after,
				institution: row.institution,
				bodyLength: row.body_length,
				source: row.source,
			})
		}

		seen += rows.length
		after = rows[rows.length - 1].interpretation_id
		process.stdout.write(
			`\r  ${seen.toLocaleString()} / ${total.toLocaleString()}`,
		)
	}
}

await pipeline(Readable.from(readRows()), vectorStream)
process.stdout.write('\n')

await writeFile(
	resolve(outputDirectory, 'points.json'),
	JSON.stringify(
		{
			model: models[0].model,
			dimensions: DIMENSIONS,
			count: points.length,
			exportedAt: new Date().toISOString(),
			points,
		},
		null,
		'\t',
	),
)

await client.end()

const megabytes = ((points.length * DIMENSIONS * 4) / 1024 / 1024).toFixed(1)
console.log(
	`Wrote ${points.length.toLocaleString()} × ${DIMENSIONS} floats (${megabytes} MB) to ${vectorPath}\n` +
		`Next: python3 scripts/umap-atlas.py --in ${outputDirectory}`,
)
