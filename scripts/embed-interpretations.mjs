/**
 * Embeds every published Interpretation with @cf/baai/bge-m3 and stores the
 * vector in InterpretationEmbedding, for the semantic search in
 * `app/utils/semantic-search.server.ts`.
 *
 * The model is reached over the Workers AI REST API rather than a binding,
 * because this is an ordinary Node script with no Worker around it. It is the
 * same model the search path calls through the AI binding, so the query vector
 * and the stored vectors share a space — that has to stay true, and is the one
 * thing that silently breaks search if either side is changed alone.
 *
 * The corpus is bimodal by level: level II bodies average 901 characters, level
 * III 580, and the shortest of either is 200 — two sentences that name neither
 * the work nor its maker. Every body is therefore prefixed with title, artist
 * and dates before embedding, so a short row still carries the identity of what
 * it describes. The prefix is part of the hashed input, so changing the format
 * below correctly invalidates every stored vector.
 *
 * Resumable and incremental: rows whose input hash already matches are skipped,
 * so a re-run after an interrupted pass costs nothing, and a run after editing
 * some bodies re-embeds exactly those.
 *
 *   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
 *     node --env-file=.env scripts/embed-interpretations.mjs           # dry run
 *   … scripts/embed-interpretations.mjs --apply
 *   … scripts/embed-interpretations.mjs --apply --limit 500
 */
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import pg from 'pg'

const { Pool } = pg

/** Amazon's RDS root bundle, as used by `lib/credentials.mjs`. */
const RDS_CA_PATH = resolve('.wrangler/rds-global-bundle.pem')

const MODEL = '@cf/baai/bge-m3'
const DIMENSIONS = 1024
/**
 * bge-m3's 60,000-token context on Workers AI applies to the *sum* of a batch,
 * not to each input — 200 interpretations arrive as 74,400 tokens and the call
 * fails with code 3030. Batches are therefore built to a token budget, with
 * this as an upper bound on count alone.
 */
const MAX_BATCH_ROWS = 200
/** Measured at 3.49 chars/token across this corpus; rounded down for headroom. */
const CHARS_PER_TOKEN = 3.2
/** Leaves ~17% against the 60k ceiling to absorb the estimate being wrong. */
const TOKEN_BUDGET = 50_000
/** Requests in flight. Four sustains ~145 rows/s without drawing 429s. */
const CONCURRENCY = 4
/** Rows pulled from Postgres per round trip, then split into token batches. */
const READ_BATCH_SIZE = 2000

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
const limit = args.get('limit') ? Number(args.get('limit')) : Infinity

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
const apiToken = process.env.CLOUDFLARE_API_TOKEN
const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) throw new Error('DATABASE_URL is required')
if (apply && !(accountId && apiToken)) {
	throw new Error(
		'CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required with --apply.\n' +
			'Create a token with the "Workers AI: Read" permission at\n' +
			'https://dash.cloudflare.com/profile/api-tokens',
	)
}

/**
 * TLS settings for the target database.
 *
 * pg 8.16 and later read `sslmode=require` as `verify-full`, and Amazon's RDS
 * chain is not in Node's trust store, so a production URL otherwise fails with
 * SELF_SIGNED_CERT_IN_CHAIN. The repo already ships the RDS global CA bundle
 * for this; pinning it keeps verification on, where the usual
 * `rejectUnauthorized: false` fix would switch off the check that produced the
 * error rather than satisfying it.
 */
async function buildSslOptions(hostname) {
	if (hostname === 'localhost' || hostname === '127.0.0.1') return false
	try {
		return { ca: await readFile(RDS_CA_PATH, 'utf8'), rejectUnauthorized: true }
	} catch {
		throw new Error(
			`${hostname} is not local, so its certificate must be verified against\n` +
				`${RDS_CA_PATH}, which is missing. Download it with:\n` +
				'  curl -o .wrangler/rds-global-bundle.pem \\\n' +
				'    https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem',
		)
	}
}

/**
 * The URL is decomposed into discrete fields rather than handed to pg as a
 * `connectionString`, because pg does
 * `Object.assign({}, config, parse(config.connectionString))` — parsed values
 * win — so a `sslmode=` in the URL silently discards the `ssl` built above and
 * the connection fails with SELF_SIGNED_CERT_IN_CHAIN as though nothing were
 * configured.
 */
async function buildPoolConfig(connectionString) {
	const url = new URL(connectionString)
	return {
		host: url.hostname,
		port: url.port ? Number(url.port) : 5432,
		database: decodeURIComponent(url.pathname.replace(/^\//, '')),
		user: decodeURIComponent(url.username),
		password: decodeURIComponent(url.password),
		ssl: await buildSslOptions(url.hostname),
	}
}

/**
 * `notBefore`/`notAfter` are the same year on most rows, so a range is only
 * written when the work actually spans one.
 */
function formatYears(notBefore, notAfter) {
	if (notBefore && notAfter && notBefore !== notAfter) {
		return `${notBefore}–${notAfter}`
	}
	return String(notBefore ?? notAfter ?? '')
}

/**
 * 872 bodies still open with the corpus's `**Title: X**` / `**Artist: Y**`
 * block, which `import-interpretations.mjs` was meant to drop but whose
 * FIELD_LINE pattern misses a variant. Left in, those lines would be embedded
 * twice — once as themselves, once as the heading below — pulling every
 * affected vector toward a cluster of works that share nothing but a formatting
 * accident. Stripped here rather than by rewriting Interpretation.body, because
 * what the dossier stores is a separate question from what gets embedded.
 */
const FIELD_LINE =
	/^\s*[*_]{0,2}(Title|Artist|Date\s*Range|Date|Years?|Location|Institution|Medium|Dimensions)[*_]{0,2}\s*:.*$/gim

/**
 * The string actually handed to the model. Kept in one function because the
 * search path does not reproduce it — queries are embedded bare — and because
 * its exact bytes are what `input_hash` commits to.
 */
function buildInput(row) {
	const years = formatYears(row.not_before, row.not_after)
	const attribution = [row.artist_name, years].filter(Boolean).join(', ')
	const heading = [row.title, attribution].filter(Boolean).join(' — ')
	const body = row.body
		.replace(FIELD_LINE, '')
		.replace(/\n{3,}/g, '\n\n')
		.trim()
	return heading ? `${heading}.\n\n${body}` : body
}

function hashInput(input) {
	return createHash('sha256').update(`${MODEL}\n${input}`).digest('hex')
}

/** Groups rows so no single request exceeds the model's batch-wide context. */
function planBatches(rows) {
	const batches = []
	let current = []
	let currentChars = 0
	for (const row of rows) {
		const chars = row.input.length
		const wouldExceed =
			current.length > 0 &&
			(current.length >= MAX_BATCH_ROWS ||
				(currentChars + chars) / CHARS_PER_TOKEN > TOKEN_BUDGET)
		if (wouldExceed) {
			batches.push(current)
			current = []
			currentChars = 0
		}
		current.push(row)
		currentChars += chars
	}
	if (current.length > 0) batches.push(current)
	return batches
}

class ContextTooLargeError extends Error {}

async function embedOnce(texts) {
	const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`
	let lastError
	// Workers AI answers a burst with 429 or a 5xx often enough that a plain
	// throw here would strand a long pass on a transient failure.
	for (let attempt = 0; attempt < 5; attempt++) {
		if (attempt > 0) {
			await new Promise((r) => setTimeout(r, 2 ** attempt * 500))
		}
		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${apiToken}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ text: texts }),
			})
			if (!response.ok) {
				const detail = await response.text()
				// Retrying an oversized batch unchanged just burns the budget;
				// the caller splits it instead.
				if (detail.includes('Max context reached')) {
					throw new ContextTooLargeError(detail)
				}
				lastError = new Error(`Workers AI ${response.status}: ${detail}`)
				continue
			}
			const payload = await response.json()
			const vectors = payload?.result?.data
			if (!Array.isArray(vectors) || vectors.length !== texts.length) {
				lastError = new Error(
					`expected ${texts.length} vectors, got ${vectors?.length}`,
				)
				continue
			}
			if (vectors[0].length !== DIMENSIONS) {
				// A dimension change means the column type is now wrong, and no
				// amount of retrying fixes it.
				throw new Error(
					`${MODEL} returned ${vectors[0].length} dimensions, expected ${DIMENSIONS}`,
				)
			}
			return vectors
		} catch (error) {
			if (error instanceof ContextTooLargeError) throw error
			if (String(error.message).includes('dimensions, expected')) throw error
			lastError = error
		}
	}
	throw lastError
}

/**
 * Embeds a batch, halving and recursing if the token estimate undershot. The
 * estimate is a character ratio rather than a tokeniser, so it will be wrong
 * occasionally; this makes being wrong cost a retry rather than the run.
 */
async function embedBatch(texts) {
	try {
		return await embedOnce(texts)
	} catch (error) {
		if (!(error instanceof ContextTooLargeError) || texts.length === 1)
			throw error
		const middle = Math.ceil(texts.length / 2)
		const [head, tail] = await Promise.all([
			embedBatch(texts.slice(0, middle)),
			embedBatch(texts.slice(middle)),
		])
		return [...head, ...tail]
	}
}

/** pgvector's text input format; `pg` has no native codec for it. */
function toVectorLiteral(vector) {
	return `[${vector.join(',')}]`
}

async function writeBatch(client, rows, vectors) {
	const values = []
	const parameters = []
	rows.forEach((row, index) => {
		const base = index * 6
		values.push(
			`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::vector, $${base + 5}, $${base + 6}, CURRENT_TIMESTAMP)`,
		)
		parameters.push(
			row.id,
			row.resource_id,
			row.level,
			toVectorLiteral(vectors[index]),
			MODEL,
			row.input_hash,
		)
	})
	await client.query(
		`INSERT INTO "InterpretationEmbedding"
		    ("interpretation_id", "resource_id", "level", "embedding", "model", "input_hash", "updatedAt")
		 VALUES ${values.join(', ')}
		 ON CONFLICT ("interpretation_id") DO UPDATE SET
		    "embedding" = EXCLUDED."embedding",
		    "model" = EXCLUDED."model",
		    "input_hash" = EXCLUDED."input_hash",
		    "updatedAt" = CURRENT_TIMESTAMP`,
		parameters,
	)
}

/** Runs `worker` over `items` with at most `CONCURRENCY` in flight. */
async function pooled(items, worker) {
	let cursor = 0
	const runners = Array.from(
		{ length: Math.min(CONCURRENCY, items.length) },
		async () => {
			while (cursor < items.length) {
				await worker(items[cursor++])
			}
		},
	)
	await Promise.all(runners)
}

async function main() {
	// A Pool rather than a Client: `pooled` below runs CONCURRENCY writes at
	// once, and a single Client serialises them with a deprecation warning.
	const client = new Pool({
		...(await buildPoolConfig(databaseUrl)),
		max: CONCURRENCY + 1,
		application_name: 'candidgarden-interpretation-embeddings',
	})

	const { rows: totals } = await client.query(
		`SELECT count(*)::int AS total FROM "Interpretation" WHERE "publishedAt" IS NOT NULL`,
	)
	console.log(
		`${totals[0].total.toLocaleString()} published interpretations; model ${MODEL} (${DIMENSIONS}d)`,
	)
	if (!apply) console.log('dry run — pass --apply to write vectors\n')

	let scanned = 0
	let skipped = 0
	let embedded = 0
	let lastId = ''
	const startedAt = Date.now()

	while (scanned < limit) {
		// Keyset pagination on the cuid primary key. An OFFSET walk would drift
		// as rows are written, and the write target is the table being read.
		const { rows } = await client.query(
			`SELECT i.id, i.resource_id, i.level, i.body,
			        r.title, r.not_before, r.not_after,
			        a.name AS artist_name,
			        e.input_hash AS existing_hash
			   FROM "Interpretation" i
			   JOIN "Resource" r ON r.id = i.resource_id
			   LEFT JOIN "Artist" a ON a.id = r.artist_id
			   LEFT JOIN "InterpretationEmbedding" e ON e.interpretation_id = i.id
			  WHERE i."publishedAt" IS NOT NULL AND i.id > $1
			  ORDER BY i.id
			  LIMIT $2`,
			[lastId, Math.min(READ_BATCH_SIZE, limit - scanned)],
		)
		if (rows.length === 0) break
		lastId = rows[rows.length - 1].id
		scanned += rows.length

		const pending = []
		for (const row of rows) {
			const input = buildInput(row)
			const inputHash = hashInput(input)
			if (row.existing_hash === inputHash) {
				skipped++
				continue
			}
			pending.push({ ...row, input, input_hash: inputHash })
		}
		if (pending.length === 0) continue

		if (!apply) {
			embedded += pending.length
			continue
		}

		await pooled(planBatches(pending), async (batch) => {
			const vectors = await embedBatch(batch.map((row) => row.input))
			await writeBatch(client, batch, vectors)
			embedded += batch.length
		})

		const elapsed = (Date.now() - startedAt) / 1000
		console.log(
			`${embedded.toLocaleString()} embedded, ${skipped.toLocaleString()} unchanged` +
				` — ${(embedded / elapsed).toFixed(0)}/s`,
		)
	}

	if (!apply) {
		const sample = await client.query(
			`SELECT i.id, i.level, i.body, r.title, r.not_before, r.not_after, a.name AS artist_name
			   FROM "Interpretation" i
			   JOIN "Resource" r ON r.id = i.resource_id
			   LEFT JOIN "Artist" a ON a.id = r.artist_id
			  WHERE i."publishedAt" IS NOT NULL
			  ORDER BY length(i.body) ASC
			  LIMIT 1`,
		)
		console.log('\nshortest row, as it would be embedded:\n')
		console.log(buildInput(sample.rows[0]))
	}

	console.log(
		`\n${apply ? 'wrote' : 'would write'} ${embedded.toLocaleString()} vectors;` +
			` ${skipped.toLocaleString()} already current`,
	)
	await client.end()
}

await main()
