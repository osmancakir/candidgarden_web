/**
 * Writes the body of every reading on the atlas, for `scripts/cluster-atlas.py`
 * to find each cluster's telling words in.
 *
 * Kept apart from `export-embedding-atlas.mjs` so that naming the map does not
 * mean pulling 368MB of vectors again. It reads `points.json` from that export
 * and fetches the text for exactly those readings, so the two stay row-aligned
 * by `interpretationId` whatever has been edited since.
 *
 * Reads the LOCAL database by default, for the same reason the vector export
 * does: it holds the same readings, and production is a ~1GB instance.
 *
 *   node --env-file=.env scripts/export-atlas-texts.mjs
 *   node --env-file=.env scripts/export-atlas-texts.mjs --in .atlas --url postgres://…
 */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import pg from 'pg'
import { configFromUrl } from './lib/credentials.mjs'

const args = new Map()
for (let index = 2; index < process.argv.length; index++) {
	const argument = process.argv[index]
	if (!argument.startsWith('--')) continue
	const [name, inline] = argument.slice(2).split('=', 2)
	args.set(name, inline ?? process.argv[++index])
}

const directory = resolve(String(args.get('in') ?? '.atlas'))
const connectionString = args.get('url') ?? process.env.DATABASE_URL
if (!connectionString) {
	console.error(
		'DATABASE_URL is not set. Run this as `node --env-file=.env scripts/export-atlas-texts.mjs`.',
	)
	process.exit(1)
}

const { points } = JSON.parse(
	await readFile(resolve(directory, 'points.json'), 'utf8'),
)
const ids = points.map((point) => point.interpretationId)

const client = new pg.Client(
	await configFromUrl(connectionString, 'candidgarden-atlas-texts'),
)
await client.connect()

const bodies = {}
const BATCH = 5000
for (let start = 0; start < ids.length; start += BATCH) {
	const { rows } = await client.query(
		`SELECT id, body FROM "Interpretation" WHERE id = ANY($1::text[])`,
		[ids.slice(start, start + BATCH)],
	)
	for (const row of rows) bodies[row.id] = row.body
}
await client.end()

const missing = ids.filter((id) => !(id in bodies)).length
await writeFile(resolve(directory, 'texts.json'), JSON.stringify(bodies))
console.log(
	`Wrote ${Object.keys(bodies).length.toLocaleString()} reading bodies to ${resolve(directory, 'texts.json')}` +
		(missing ? ` (${missing} readings on the map no longer exist)` : ''),
)
