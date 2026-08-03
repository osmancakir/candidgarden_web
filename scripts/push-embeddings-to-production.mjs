/**
 * Copies InterpretationEmbedding vectors from the local database to production.
 *
 * The interpretation *texts* already reached production through
 * `import-interpretations.mjs`; what production lacks is the vectors, because
 * `embed-interpretations.mjs` was pointed at the local database and the Workers
 * AI budget is what limits the backfill. Re-running the embedder against
 * production would spend that budget a second time for bit-identical results,
 * so the vectors are copied rather than recomputed.
 *
 * That is only sound because both databases hold the same rows: the copied
 * `input_hash` commits to the interpretation body *and* the title/artist/date
 * heading built from Resource and Artist, so a copied hash over text that
 * differs would mark a stale vector as current forever. The `--verify` phase
 * checks exactly that before any write, and the copy refuses to run if it
 * fails.
 *
 * Resumable and incremental: a row whose production hash already matches the
 * local one is skipped, so a re-run after the local backfill advances pushes
 * only what is new.
 *
 *   node scripts/push-embeddings-to-production.mjs            # dry run
 *   node scripts/push-embeddings-to-production.mjs --apply
 *   node scripts/push-embeddings-to-production.mjs --verify   # compare only
 */
import pg from 'pg'
import { configFromUrl, describeTarget, rdsConfig } from './lib/credentials.mjs'

const { Client, Pool } = pg

/**
 * Rows per INSERT. A bge-m3 vector is ~12 KB as pgvector text, so 250 rows is a
 * ~3 MB statement — large enough to amortise the round trip to eu-central-1,
 * small enough that a retry is cheap.
 */
const WRITE_BATCH_ROWS = 250
/** Rows pulled from the local database per round trip. */
const READ_BATCH_ROWS = 1000
/** Concurrent writers. The bottleneck is the transatlantic round trip, not RDS. */
const CONCURRENCY = 4

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
const verifyOnly = args.get('verify') === true
const limit = args.get('limit') ? Number(args.get('limit')) : Infinity
/**
 * Whether to drop the HNSW index for the duration of the load.
 *
 * Measured on this table: inserts hold ~165 rows/s until roughly 11k rows, then
 * fall off a cliff — 46/s, 25/s, 14/s and still dropping — as the graph outgrows
 * the instance's cache and every insert becomes random I/O. Building the index
 * once at the end is pgvector's own advice for bulk loads and turns hours into
 * minutes, so it is the default for a full pass and skipped only for small
 * incremental top-ups, where a rebuild would cost more than it saves.
 */
const REBUILD_THRESHOLD = 5_000
const rebuildIndex =
	args.get('rebuild-index') === true
		? true
		: args.get('no-rebuild-index') === true
			? false
			: null // decided once the push size is known

/**
 * A single digest over the ordered (id, resource_id, body) tuples per level,
 * plus one over the heading fields. Equality means an `input_hash` computed
 * against one database is valid against the other.
 */
const BODY_DIGEST = `
	SELECT level,
	       count(*)::int AS n,
	       md5(string_agg(id || ':' || resource_id || ':' || body, '' ORDER BY id)) AS digest
	  FROM "Interpretation"
	 WHERE "publishedAt" IS NOT NULL
	 GROUP BY level ORDER BY level`

const HEADING_DIGEST = `
	SELECT count(*)::int AS n,
	       md5(string_agg(r.id || ':' || coalesce(r.title, '') || ':' ||
	                      coalesce(a.name, '') || ':' ||
	                      coalesce(r.not_before::text, '') || ':' ||
	                      coalesce(r.not_after::text, ''), '' ORDER BY r.id)) AS digest
	  FROM "Resource" r LEFT JOIN "Artist" a ON a.id = r.artist_id`

/**
 * Per-row md5 folded into one value. Aggregating `embedding::text` directly
 * would build a gigabyte-wide string server-side; hashing each row first keeps
 * it to 32 bytes apiece.
 */
const VECTOR_DIGEST = `
	SELECT count(*)::int AS n,
	       md5(string_agg(md5(interpretation_id || ':' || embedding::text), '' ORDER BY interpretation_id)) AS digest
	  FROM "InterpretationEmbedding"`

function fail(message) {
	console.error(`\n${message}`)
	process.exit(1)
}

/**
 * Confirms the two databases describe the same works, which is the precondition
 * for copying hashes rather than recomputing them.
 */
async function verifyAlignment(local, production) {
	const [localBodies, prodBodies, localHeadings, prodHeadings] =
		await Promise.all([
			local.query(BODY_DIGEST),
			production.query(BODY_DIGEST),
			local.query(HEADING_DIGEST),
			production.query(HEADING_DIGEST),
		])

	let aligned = true
	console.log('Interpretation bodies:')
	for (const row of localBodies.rows) {
		const match = prodBodies.rows.find((r) => r.level === row.level)
		const ok =
			Boolean(match) && match.n === row.n && match.digest === row.digest
		if (!ok) aligned = false
		console.log(
			`  level ${row.level}: local ${row.n}, production ${match?.n ?? 0} — ${ok ? 'identical' : 'DIFFERENT'}`,
		)
	}
	for (const row of prodBodies.rows) {
		if (!localBodies.rows.some((r) => r.level === row.level)) {
			aligned = false
			console.log(
				`  level ${row.level}: local 0, production ${row.n} — DIFFERENT`,
			)
		}
	}

	const headingsOk =
		localHeadings.rows[0].n === prodHeadings.rows[0].n &&
		localHeadings.rows[0].digest === prodHeadings.rows[0].digest
	if (!headingsOk) aligned = false
	console.log(
		`Resource/Artist heading fields: local ${localHeadings.rows[0].n}, ` +
			`production ${prodHeadings.rows[0].n} — ${headingsOk ? 'identical' : 'DIFFERENT'}`,
	)

	return aligned
}

/** pgvector text arrives and leaves as-is; no float parsing round trip. */
async function writeBatch(pool, rows) {
	const values = []
	const parameters = []
	rows.forEach((row, index) => {
		const base = index * 6
		values.push(
			`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::vector, $${base + 5}, $${base + 6}, CURRENT_TIMESTAMP)`,
		)
		parameters.push(
			row.interpretation_id,
			row.resource_id,
			row.level,
			row.embedding,
			row.model,
			row.input_hash,
		)
	})
	await pool.query(
		`INSERT INTO "InterpretationEmbedding"
		    ("interpretation_id", "resource_id", "level", "embedding", "model", "input_hash", "updatedAt")
		 VALUES ${values.join(', ')}
		 ON CONFLICT ("interpretation_id") DO UPDATE SET
		    "embedding" = EXCLUDED."embedding",
		    "resource_id" = EXCLUDED."resource_id",
		    "level" = EXCLUDED."level",
		    "model" = EXCLUDED."model",
		    "input_hash" = EXCLUDED."input_hash",
		    "updatedAt" = CURRENT_TIMESTAMP`,
		parameters,
	)
}

const VECTOR_INDEX = 'InterpretationEmbedding_embedding_idx'

/**
 * The live `CREATE INDEX` statement, read back rather than hardcoded, so the
 * index is rebuilt exactly as it was even if its definition has since been
 * changed in a migration. Returns null when the index does not exist.
 */
async function vectorIndexDefinition(client) {
	const { rows } = await client.query(
		`SELECT indexdef FROM pg_indexes
		  WHERE schemaname = 'public' AND tablename = 'InterpretationEmbedding'
		    AND indexname = $1`,
		[VECTOR_INDEX],
	)
	return rows[0]?.indexdef ?? null
}

/**
 * Memory budgets to attempt for the index build, largest first.
 *
 * The production instance is small — 88MB shared_buffers, 360MB
 * effective_cache_size — so it cannot honour the 512MB the migration asks for:
 * parallel workers allocate `maintenance_work_mem` as one shared segment and
 * the build dies with "could not resize shared memory segment … Cannot allocate
 * memory" (SQLSTATE 53200). Workers are therefore off, which keeps the
 * allocation in ordinary backend memory, and the budget steps down until one
 * fits. A smaller budget only makes pgvector build the graph on disk instead of
 * in memory; it is slower, not worse, and the resulting index is identical.
 */
const BUILD_MEMORY_BUDGETS = ['256MB', '128MB', '64MB']

/** Postgres raises this when a shared segment or allocation cannot be made. */
const INSUFFICIENT_RESOURCES = '53200'
const OUT_OF_MEMORY = '53100'

/**
 * Rebuilds the HNSW index, stepping the memory budget down until the instance
 * accepts one. `statement_timeout` is cleared because the build takes minutes.
 */
async function createVectorIndex(client, definition) {
	let lastError
	for (const budget of BUILD_MEMORY_BUDGETS) {
		try {
			await client.query(`SET statement_timeout = 0`)
			// Serial build: no shared segment, so nothing to fail to resize.
			await client.query(`SET max_parallel_maintenance_workers = 0`)
			await client.query(`SET maintenance_work_mem = '${budget}'`)
			const startedAt = Date.now()
			await client.query(definition)
			return { seconds: (Date.now() - startedAt) / 1000, budget }
		} catch (error) {
			lastError = error
			if (![INSUFFICIENT_RESOURCES, OUT_OF_MEMORY].includes(error.code))
				throw error
			console.log(
				`  ${budget} was more than the instance would allocate; retrying smaller.`,
			)
			// A failed CREATE INDEX can leave an invalid relation behind.
			await client
				.query(`DROP INDEX IF EXISTS public."${VECTOR_INDEX}"`)
				.catch(() => {})
		}
	}
	throw lastError
}

/** Runs `worker` over `items` with at most `CONCURRENCY` in flight. */
async function pooled(items, worker) {
	let cursor = 0
	await Promise.all(
		Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
			while (cursor < items.length) await worker(items[cursor++])
		}),
	)
}

function formatBytes(bytes) {
	const units = ['B', 'KB', 'MB', 'GB']
	let value = bytes
	let unit = 0
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024
		unit++
	}
	return `${value.toFixed(1)} ${units[unit]}`
}

async function main() {
	const sourceUrl = process.env.DATABASE_URL
	if (!sourceUrl) fail('DATABASE_URL is not set; it is the source of the copy.')

	const localConfig = await configFromUrl(
		sourceUrl,
		'candidgarden-embedding-push-source',
	)
	const local = new Client(localConfig)
	// PRODUCTION_DATABASE_URL carries the cg_admin credentials; falling back to
	// the role name keeps this working if only CG_ADMIN_PASSWORD is set.
	const productionConfig = process.env.PRODUCTION_DATABASE_URL
		? await configFromUrl(
				process.env.PRODUCTION_DATABASE_URL,
				'candidgarden-embedding-push',
			)
		: await rdsConfig('cg_admin', 'candidgarden-embedding-push')

	const production = new Client(productionConfig)
	await Promise.all([local.connect(), production.connect()])

	console.log(`source      ${describeTarget(localConfig)}`)
	console.log(`target      ${describeTarget(productionConfig)}`)
	console.log(
		`mode        ${verifyOnly ? 'VERIFY ONLY' : apply ? 'APPLY' : 'DRY RUN (pass --apply)'}\n`,
	)

	const aligned = await verifyAlignment(local, production)
	if (!aligned) {
		await Promise.all([local.end(), production.end()])
		fail(
			'The two databases do not hold the same interpretations, so a copied\n' +
				'input_hash would be wrong. Re-run import-interpretations.mjs against\n' +
				'production first, then retry.',
		)
	}

	const [localCount, prodCount] = await Promise.all([
		local.query(`SELECT count(*)::int AS n FROM "InterpretationEmbedding"`),
		production.query(
			`SELECT count(*)::int AS n FROM "InterpretationEmbedding"`,
		),
	])
	const { rows: publishable } = await local.query(
		`SELECT count(*)::int AS n FROM "Interpretation" WHERE "publishedAt" IS NOT NULL`,
	)
	console.log(
		`\nVectors: local ${localCount.rows[0].n.toLocaleString()} of ` +
			`${publishable[0].n.toLocaleString()} published ` +
			`(${((localCount.rows[0].n / publishable[0].n) * 100).toFixed(1)}%), ` +
			`production ${prodCount.rows[0].n.toLocaleString()}`,
	)

	if (verifyOnly) {
		const [localDigest, prodDigest] = await Promise.all([
			local.query(VECTOR_DIGEST),
			production.query(VECTOR_DIGEST),
		])
		const identical =
			localDigest.rows[0].n === prodDigest.rows[0].n &&
			localDigest.rows[0].digest === prodDigest.rows[0].digest
		console.log(
			`Vector digests: ${identical ? 'IDENTICAL — production is a faithful copy' : 'differ (expected while the copy is partial)'}`,
		)
		await Promise.all([local.end(), production.end()])
		return
	}

	// The production hashes, so a re-run pushes only what changed. 108k rows of
	// (25-char id, 64-char hash) is a few megabytes.
	const existing = new Map()
	const { rows: existingRows } = await production.query(
		`SELECT interpretation_id, input_hash FROM "InterpretationEmbedding"`,
	)
	for (const row of existingRows) {
		existing.set(row.interpretation_id, row.input_hash)
	}

	// Every vector's interpretation must exist in production or the foreign key
	// aborts the batch. Checked up front so a gap is a reported number rather
	// than a failed run halfway through.
	const targetIds = new Set()
	const { rows: idRows } = await production.query(
		`SELECT id FROM "Interpretation"`,
	)
	for (const row of idRows) targetIds.add(row.id)

	// Hashes only — the vectors themselves are streamed later. This is what makes
	// the size of the pass knowable before it starts.
	const localHashes = new Map()
	const { rows: localHashRows } = await local.query(
		`SELECT interpretation_id, input_hash FROM "InterpretationEmbedding"`,
	)
	for (const row of localHashRows) {
		localHashes.set(row.interpretation_id, row.input_hash)
	}

	// How many rows this pass will actually write, known before any of them are
	// written, so the index decision is made once rather than discovered halfway.
	let outstanding = 0
	for (const [id, hash] of localHashes) {
		if (targetIds.has(id) && existing.get(id) !== hash) outstanding++
	}
	const willRebuild =
		apply && (rebuildIndex ?? outstanding >= REBUILD_THRESHOLD)

	let indexDefinition = null
	if (willRebuild) {
		indexDefinition = await vectorIndexDefinition(production)
		if (!indexDefinition) {
			console.log(
				`\nNo ${VECTOR_INDEX} to drop; it will be created after the load.`,
			)
			// Reproduces the migration, which is the only other place this index is
			// defined. vector_cosine_ops must match the `<=>` operator in
			// `app/utils/semantic-search.server.ts`.
			indexDefinition =
				`CREATE INDEX "${VECTOR_INDEX}" ON public."InterpretationEmbedding" ` +
				'USING hnsw (embedding vector_cosine_ops)'
		} else {
			console.log(
				`\nDropping ${VECTOR_INDEX} for the load (${outstanding.toLocaleString()} rows to write).`,
			)
			await production.query(`SET statement_timeout = 0`)
			await production.query(`DROP INDEX IF EXISTS public."${VECTOR_INDEX}"`)
		}
		console.log(
			'Semantic search falls back to a sequential scan until it is rebuilt —\n' +
				'correct results, slower queries.',
		)
		// A `finally` does not run when the process is signalled, and that is
		// exactly when the index would be left dropped without anyone knowing.
		for (const signal of ['SIGINT', 'SIGTERM']) {
			process.once(signal, () => {
				console.error(
					`\n\nInterrupted with ${VECTOR_INDEX} dropped. Recreate it with:\n\n` +
						'  SET max_parallel_maintenance_workers = 0;\n' +
						"  SET maintenance_work_mem = '128MB';\n" +
						`  ${indexDefinition};\n`,
				)
				process.exit(130)
			})
		}
	}

	// A Pool, because `pooled` runs CONCURRENCY writes at once and a single
	// Client would serialise them.
	const writers = apply
		? new Pool({ ...productionConfig, max: CONCURRENCY + 1 })
		: null

	let scanned = 0
	let skipped = 0
	let orphaned = 0
	let pushed = 0
	let bytes = 0
	let lastId = ''
	const startedAt = Date.now()

	async function loadVectors() {
		while (scanned < limit) {
			// Keyset pagination on the primary key; an OFFSET walk would drift as the
			// local backfill continues writing to the table being read.
			const { rows } = await local.query(
				`SELECT interpretation_id, resource_id, level, embedding::text AS embedding,
			        model, input_hash
			   FROM "InterpretationEmbedding"
			  WHERE interpretation_id > $1
			  ORDER BY interpretation_id
			  LIMIT $2`,
				[lastId, Math.min(READ_BATCH_ROWS, limit - scanned)],
			)
			if (rows.length === 0) break
			lastId = rows[rows.length - 1].interpretation_id
			scanned += rows.length

			const pending = []
			for (const row of rows) {
				if (!targetIds.has(row.interpretation_id)) {
					orphaned++
					continue
				}
				if (existing.get(row.interpretation_id) === row.input_hash) {
					skipped++
					continue
				}
				pending.push(row)
			}
			if (pending.length === 0) continue

			if (!apply) {
				pushed += pending.length
				for (const row of pending) bytes += row.embedding.length
				continue
			}

			const batches = []
			for (let index = 0; index < pending.length; index += WRITE_BATCH_ROWS) {
				batches.push(pending.slice(index, index + WRITE_BATCH_ROWS))
			}
			await pooled(batches, async (batch) => {
				await writeBatch(writers, batch)
				pushed += batch.length
				for (const row of batch) bytes += row.embedding.length
			})

			const elapsed = (Date.now() - startedAt) / 1000
			console.log(
				`  ${pushed.toLocaleString()} pushed, ${skipped.toLocaleString()} already current` +
					` — ${(pushed / elapsed).toFixed(0)}/s, ${formatBytes(bytes)} sent`,
			)
		}
	}

	try {
		await loadVectors()
	} finally {
		// Recreated even if the load threw, so an interrupted run never leaves
		// production without its index.
		if (willRebuild) {
			console.log(`\nRebuilding ${VECTOR_INDEX}…`)
			try {
				const { seconds, budget } = await createVectorIndex(
					production,
					indexDefinition,
				)
				console.log(
					`Rebuilt in ${seconds.toFixed(0)}s with maintenance_work_mem=${budget}.`,
				)
			} catch (error) {
				console.error(
					`\nFAILED to rebuild ${VECTOR_INDEX}: ${error.message}\n` +
						'Production answers semantic search by sequential scan until this is\n' +
						'run by hand:\n\n' +
						'  SET max_parallel_maintenance_workers = 0;\n' +
						"  SET maintenance_work_mem = '128MB';\n" +
						`  ${indexDefinition};\n`,
				)
				throw error
			}
		}
	}

	console.log(
		`\nlocal vectors scanned   ${scanned.toLocaleString()}\n` +
			`${apply ? 'pushed' : 'would push'}                  ${pushed.toLocaleString()}\n` +
			`already current         ${skipped.toLocaleString()}\n` +
			`no interpretation there ${orphaned.toLocaleString()}\n` +
			`vector payload          ${formatBytes(bytes)}`,
	)

	if (apply) {
		await writers.end()
		const after = await production.query(
			`SELECT count(*)::int AS n FROM "InterpretationEmbedding"`,
		)
		console.log(`production now holds    ${after.rows[0].n.toLocaleString()}`)

		// End-to-end check that the vectors survived the text round trip. Scoped
		// to rows present on both sides, since the local backfill may be partial.
		const [localDigest, prodDigest] = await Promise.all([
			local.query(VECTOR_DIGEST),
			production.query(VECTOR_DIGEST),
		])
		if (
			localDigest.rows[0].n === prodDigest.rows[0].n &&
			localDigest.rows[0].digest === prodDigest.rows[0].digest
		) {
			console.log(
				'\nVector digests match: production is a bit-identical copy of local.',
			)
		} else {
			console.log(
				`\nVector digests differ (local ${localDigest.rows[0].n.toLocaleString()}, ` +
					`production ${prodDigest.rows[0].n.toLocaleString()}). Expected only if ` +
					'the local backfill advanced during this run; re-run to catch up.',
			)
		}
	} else {
		console.log('\nNothing written. Re-run with --apply.')
	}

	await Promise.all([local.end(), production.end()])
}

await main()
