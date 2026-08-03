/**
 * Fills Panofsky levels II and III from the RAG corpus of machine-written work
 * descriptions (candidgarden_rag/art/data/art-descriptions.jsonl, 54,497 rows,
 * one per Resource).
 *
 * Those descriptions follow a consistent arc: what is depicted, what it
 * signifies, how it is handled formally, and then — in a trailing paragraph —
 * what it means to a viewer now. The first part is an iconographic reading
 * (level II); the closer is the nearest thing the corpus holds to an
 * iconological one (level III), so the split is made on that boundary.
 *
 * Every row lands with source=MODEL. The dossier labels it as machine-written,
 * because a site whose subject is the distance between naming motifs and
 * interpreting a painting cannot quietly present GPT-4o prose as scholarship.
 *
 *   node --env-file=.env scripts/import-interpretations.mjs            # dry run
 *   node --env-file=.env scripts/import-interpretations.mjs --apply
 */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline'
import pg from 'pg'

const { Client } = pg

const DEFAULT_SOURCE = resolve(
	'../candidgarden_rag/art/data/art-descriptions.jsonl',
)
const CITATION = 'GPT-4o, Candid Garden description corpus, March 2025'
const BATCH_SIZE = 500

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

const apply = args.get('apply') === true
const sourcePath = resolve(String(args.get('source') ?? DEFAULT_SOURCE))
const limit = args.get('limit') ? Number(args.get('limit')) : Infinity

/**
 * A third of the corpus opens with a restatement of title/artist/date/location,
 * or a bare `**Artwork Description: X**` heading. The dossier already renders
 * all of that from the database in its own register, so it is dropped.
 */
const FIELD_LINE =
	/^\s*[*_]{0,2}(Title|Artist|Date|Date\s*Range|Years?|Location|Institution|Medium|Dimensions|Artwork Description|Description(\s+of)?|Analysis)[*_]{0,2}\s*[:—-]/i
const HEADING_LINE = /^\s*(#{1,6}\s+.+|[*_]{1,2}[^*_].*[*_]{1,2})\s*$/

/**
 * Markers of the "what this means now" register that closes these texts. Matched
 * against whole trailing paragraphs, walking backwards from the end.
 */
const PRESENT_TENSE =
	/\b(today|contemporary|modern\w*\s+(viewer|audience|context|era)\w*|nowadays|in our time|present[- ]day|21st[- ]century|resonat\w+|remains? relevant|continues? to|invites? (us|the viewer|viewers|contemporary|reflection)|serves as a reminder|reminder)\b/i

function isHeaderish(paragraph) {
	if (paragraph.length >= 200) return false
	const lines = paragraph.split('\n').filter((line) => line.trim())
	return lines.every((line) => FIELD_LINE.test(line) || HEADING_LINE.test(line))
}

/**
 * Splits one description into its level II and level III halves. Returns a null
 * level III when the text never turns to present relevance (152 rows of the
 * corpus); the dossier falls back to its "no reading on record" state there,
 * which is the honest result rather than a gap to paper over.
 */
export function splitDescription(text) {
	const paragraphs = text
		.split('\n\n')
		.map((paragraph) => paragraph.trim())
		.filter((paragraph) => paragraph && !isHeaderish(paragraph))

	if (!paragraphs.length) return { levelII: null, levelIII: null }

	// Walk back from the end while paragraphs stay in the present-relevance
	// register. Stopping at index 1 guarantees level II keeps at least one
	// paragraph even when the opening one happens to say "resonates".
	let boundary = null
	for (let index = paragraphs.length - 1; index > 0; index--) {
		if (PRESENT_TENSE.test(paragraphs[index])) boundary = index
		else break
	}

	if (boundary === null) {
		return { levelII: paragraphs.join('\n\n'), levelIII: null }
	}
	return {
		levelII: paragraphs.slice(0, boundary).join('\n\n'),
		levelIII: paragraphs.slice(boundary).join('\n\n'),
	}
}

/**
 * Stable ids, so a re-run updates the row it wrote last time instead of
 * orphaning it. cuid() is Prisma's default but nothing here needs it.
 */
function idFor(resourceId, level) {
	return createHash('sha256')
		.update(`interpretation:${resourceId}:${level}`)
		.digest('hex')
		.slice(0, 25)
}

async function flush(client, rows) {
	if (!rows.length) return
	const values = []
	const placeholders = rows.map((row, rowIndex) => {
		const offset = rowIndex * 7
		values.push(
			row.id,
			row.resourceId,
			row.level,
			row.body,
			'MODEL',
			CITATION,
			row.publishedAt,
		)
		return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
	})

	// An editorial pass may have superseded a row since the last import; those
	// are left alone. Only MODEL rows are overwritten.
	await client.query(
		`INSERT INTO "Interpretation"
		   ("id", "resource_id", "level", "body", "source", "citation", "publishedAt", "createdAt", "updatedAt")
		 VALUES ${placeholders.join(', ')}
		 ON CONFLICT ("resource_id", "level") DO UPDATE SET
		   "body" = EXCLUDED."body",
		   "citation" = EXCLUDED."citation",
		   "publishedAt" = EXCLUDED."publishedAt",
		   "updatedAt" = CURRENT_TIMESTAMP
		 WHERE "Interpretation"."source" = 'MODEL'`,
		values,
	)
}

async function main() {
	const connectionString = process.env.DATABASE_URL
	if (!connectionString) {
		throw new Error('DATABASE_URL is not set. Run with --env-file=.env')
	}

	console.log(`source   ${sourcePath}`)
	console.log(`database ${connectionString.replace(/:[^:@]*@/, ':***@')}`)
	console.log(apply ? 'mode     APPLY\n' : 'mode     DRY RUN (pass --apply)\n')

	const client = new Client({ connectionString })
	await client.connect()

	const known = new Set()
	const { rows: resourceRows } = await client.query('SELECT id FROM "Resource"')
	for (const row of resourceRows) known.add(row.id)

	const publishedAt = new Date()
	const stats = {
		read: 0,
		unknownResource: 0,
		levelII: 0,
		levelIII: 0,
		noLevelIII: 0,
		empty: 0,
	}
	let batch = []

	const lines = createInterface({
		input: createReadStream(sourcePath),
		crlfDelay: Infinity,
	})

	for await (const line of lines) {
		if (!line.trim()) continue
		if (stats.read >= limit) break
		stats.read++

		const record = JSON.parse(line)
		const resourceId = record?.metadata?.id
		if (!known.has(resourceId)) {
			stats.unknownResource++
			continue
		}

		const { levelII, levelIII } = splitDescription(record.text ?? '')
		if (!levelII) {
			stats.empty++
			continue
		}

		stats.levelII++
		batch.push({
			id: idFor(resourceId, 2),
			resourceId,
			level: 2,
			body: levelII,
			publishedAt,
		})

		if (levelIII) {
			stats.levelIII++
			batch.push({
				id: idFor(resourceId, 3),
				resourceId,
				level: 3,
				body: levelIII,
				publishedAt,
			})
		} else {
			stats.noLevelIII++
		}

		if (batch.length >= BATCH_SIZE) {
			if (apply) await flush(client, batch)
			batch = []
			if (process.stdout.isTTY) {
				process.stdout.write(`\r  ${stats.read} descriptions read`)
			}
		}
	}

	if (apply) await flush(client, batch)
	process.stdout.write('\r')

	console.log(`descriptions read      ${stats.read}`)
	console.log(`level II rows          ${stats.levelII}`)
	console.log(`level III rows         ${stats.levelIII}`)
	console.log(`no level III in text   ${stats.noLevelIII}`)
	console.log(`empty after stripping  ${stats.empty}`)
	console.log(`unknown resource id    ${stats.unknownResource}`)

	if (apply) {
		const { rows } = await client.query(
			`SELECT "level", COUNT(*)::int AS n FROM "Interpretation"
			 WHERE "publishedAt" IS NOT NULL GROUP BY "level" ORDER BY "level"`,
		)
		console.log('\npublished in database:')
		for (const row of rows) console.log(`  level ${row.level}  ${row.n}`)
	} else {
		console.log('\nNothing written. Re-run with --apply.')
	}

	await client.end()
}

// Keep the splitter importable by the unit test without opening a connection.
if (process.argv[1] && process.argv[1].endsWith('import-interpretations.mjs')) {
	await main()
}
