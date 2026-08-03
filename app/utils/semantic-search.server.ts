import { getCloudflareContext } from './cloudflare.server.ts'
import { prisma } from './db.server.ts'

/**
 * Semantic search over the Panofsky readings in `InterpretationEmbedding`.
 *
 * The vectors were written by `scripts/embed-interpretations.mjs` using
 * @cf/baai/bge-m3, and queries are embedded with the same model — a query
 * vector from any other model is not merely worse here, it is meaningless,
 * because the two spaces have no relation to each other.
 *
 * bge-m3 needs no instruction prefix on either side, unlike the E5 family where
 * omitting `query:` degrades results without any error, so the query is
 * embedded bare while stored rows carry a title/artist heading.
 */
const MODEL = '@cf/baai/bge-m3'
const DIMENSIONS = 1024

/**
 * How far past `limit` the ANN scan reaches before rows are collapsed to one
 * per work. Both levels of a single work usually rank together — they are two
 * halves of one description — so without headroom a top-10 could resolve to
 * five artworks.
 */
const OVERFETCH = 4

/**
 * Lists probed per query by the IVFFlat index.
 *
 * pgvector defaults this to 1, which is not a mild default but a broken one: a
 * single list is ~1% of the corpus, so the "nearest" rows are whichever happen
 * to share one centroid with the query and recall collapses without any error.
 * pgvector's guidance is sqrt(lists), and the index is built with lists = 100
 * in `20260803190000_replace_hnsw_with_ivfflat`.
 *
 * Raising this trades latency for recall roughly linearly — it is the one knob
 * to reach for if results feel thin. It must stay an integer: it is interpolated
 * into SQL because `SET` does not take bind parameters.
 */
const PROBES = 10

export type SemanticHit = {
	resourceId: number
	/** Panofsky level of the passage that matched: 2 or 3. */
	level: number
	/** Cosine distance in [0, 2]; lower is closer. */
	distance: number
	/** Cosine similarity in [-1, 1], for display and thresholding. */
	similarity: number
}

/**
 * Embeds one string with bge-m3.
 *
 * Prefers the Worker's AI binding, which stays inside Cloudflare's network.
 * `getCloudflareContext()` returns undefined in the Node harness and in tests,
 * so the REST API is the documented fallback there; it needs
 * CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in the environment.
 */
export async function embedQuery(text: string): Promise<number[]> {
	const trimmed = text.trim()
	if (!trimmed) throw new Error('cannot embed an empty query')

	const cloudflare = getCloudflareContext()
	let vectors: number[][] | undefined

	if (cloudflare?.env.AI) {
		const result = await cloudflare.env.AI.run(MODEL, { text: [trimmed] })
		vectors = (result as { data: number[][] }).data
	} else {
		const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
		const apiToken = process.env.CLOUDFLARE_API_TOKEN
		if (!accountId || !apiToken) {
			throw new Error(
				'No AI binding, and CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN are unset. ' +
					'Semantic search needs one or the other outside the Workers runtime.',
			)
		}
		const response = await fetch(
			`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${apiToken}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ text: [trimmed] }),
			},
		)
		if (!response.ok) {
			throw new Error(`Workers AI ${response.status}: ${await response.text()}`)
		}
		const payload = (await response.json()) as {
			result?: { data?: number[][] }
		}
		vectors = payload.result?.data
	}

	const vector = vectors?.[0]
	if (!vector || vector.length !== DIMENSIONS) {
		throw new Error(
			`${MODEL} returned ${vector?.length ?? 0} dimensions, expected ${DIMENSIONS}`,
		)
	}
	return vector
}

/** pgvector's text input format. The driver has no native codec for `vector`. */
function toVectorLiteral(vector: number[]) {
	return `[${vector.join(',')}]`
}

/**
 * Returns the works whose readings are closest to `query`, nearest first, one
 * row per work.
 *
 * Prisma cannot express `<=>` or read a `vector` column, so this is raw SQL.
 * The operator must stay `<=>`: the IVFFlat index is built for
 * `vector_cosine_ops`, and switching to `<#>` or `<->` silently drops to a
 * sequential scan over 108k rows rather than failing.
 *
 * Wrapped in a transaction solely so `SET LOCAL ivfflat.probes` applies to the
 * query that follows. A plain `SET` would be wrong here: Prisma hands out
 * pooled connections, so it would leak the setting to whatever ran next on that
 * connection and, worse, would not reliably be set for this one.
 */
export async function searchInterpretations({
	query,
	limit = 20,
	level,
}: {
	query: string
	limit?: number
	/** Restrict to iconographic (2) or iconological (3) readings. */
	level?: 2 | 3
}): Promise<SemanticHit[]> {
	const vector = toVectorLiteral(await embedQuery(query))
	const candidates = limit * OVERFETCH

	const rows = await prisma.$transaction(async (tx) => {
		await tx.$executeRawUnsafe(`SET LOCAL ivfflat.probes = ${PROBES}`)
		return tx.$queryRawUnsafe<
			Array<{ resource_id: number; level: number; distance: number }>
		>(
			`WITH candidates AS (
		     SELECT e.resource_id, e.level, e.embedding <=> $1::vector AS distance
		       FROM "InterpretationEmbedding" e
		      ${level ? 'WHERE e.level = $4' : ''}
		      ORDER BY e.embedding <=> $1::vector
		      LIMIT $2
		 ),
		 best AS (
		     SELECT DISTINCT ON (resource_id) resource_id, level, distance
		       FROM candidates
		      ORDER BY resource_id, distance
		 )
		 SELECT resource_id, level, distance FROM best ORDER BY distance LIMIT $3`,
			...[vector, candidates, limit, ...(level ? [level] : [])],
		)
	})

	return rows.map((row) => ({
		resourceId: row.resource_id,
		level: row.level,
		distance: Number(row.distance),
		// bge-m3 emits unit-norm vectors, so this inversion is exact rather than
		// an approximation.
		similarity: 1 - Number(row.distance),
	}))
}
