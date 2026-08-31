#!/usr/bin/env node

/**
 * Candid Garden Instagram carousel generator.
 *
 * Live mode reads catalogue data from the project's PostgreSQL database,
 * embeds Sense queries with the archive's bge-m3 model, and downloads original
 * artwork objects from S3. Rendering is network-free: fonts and images are
 * converted to data URLs before Playwright receives each card.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const DEFAULT_DOMAIN = 'https://candidgarden.com'
const DEFAULT_WIDTH = 1080
const DEFAULT_HEIGHT = 1350
const DEFAULT_LIMIT = 6
const MAX_WORKS = 19
const EMBEDDING_MODEL = '@cf/baai/bge-m3'
const EMBEDDING_DIMENSIONS = 1024
const IVFFLAT_PROBES = 10
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const SKILL_DIR = path.resolve(SCRIPT_DIR, '..')

const COLORS = {
	paper: '#F2F0EB',
	ink: '#1A1A1A',
	bone: '#E8E5DE',
	void: '#0D0D0D',
	ultra: '#1F00E0',
	ultraLift: '#8B87FF',
	stamp: '#9E2B25',
	stampLift: '#D97A73',
	muted: '#5F5C57',
}

function usage() {
	console.log(`
Generate a Candid Garden Instagram carousel (1080x1350 PNG deck).

Usage:
  node --env-file=.env scripts/generate_instagram_carousel_assets.mjs --query <phrase> [options]
  node --env-file=.env scripts/generate_instagram_carousel_assets.mjs --url <archive-url> [--url <archive-url> ...] [options]
  node scripts/generate_instagram_carousel_assets.mjs --artwork-file <json> [options]

Inputs (choose one):
  --query <phrase>          Search Candid Garden's Sense index and select works
  --url <url>               Archive URL; repeat to preserve a hand-picked order
  --urls <list>             Comma, whitespace, or newline separated archive URLs
  --artwork-file <path>     Offline JSON array or { "artworks": [...] }

Options:
  --title <text>            Cover title (default: query or "From the archive")
  --hook <text>             Short, theme-specific cover question
  --limit <number>          Works selected for a query (default: ${DEFAULT_LIMIT}, max: ${MAX_WORKS})
  --out-dir <path>          Output directory
  --domain <url>            Printed archive origin (default: ${DEFAULT_DOMAIN})
  --width <px>              Render width (default: ${DEFAULT_WIDTH})
  --height <px>             Render height (default: ${DEFAULT_HEIGHT})
  --no-cover                Render artwork cards only
  --no-render               Write inspectable HTML instead of PNGs
  --help                    Show this message

Live mode requires DATABASE_URL plus AWS S3 credentials. --query also needs
CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.
`)
}

function fail(message) {
	throw new Error(message)
}

export function parseArgs(argv) {
	const result = { urls: [] }
	const flags = new Set(['--help', '--no-cover', '--no-render'])

	for (let index = 0; index < argv.length; index += 1) {
		const raw = argv[index]
		if (!raw.startsWith('--')) fail(`Unexpected argument: ${raw}`)

		const equalAt = raw.indexOf('=')
		const name = equalAt === -1 ? raw : raw.slice(0, equalAt)
		if (flags.has(name)) {
			result[name.slice(2)] = true
			continue
		}

		const value = equalAt === -1 ? argv[index + 1] : raw.slice(equalAt + 1)
		if (!value || (equalAt === -1 && value.startsWith('--'))) {
			fail(`Missing value for ${name}`)
		}
		if (equalAt === -1) index += 1

		if (name === '--url') result.urls.push(value)
		else if (name === '--urls') result.urls.push(...splitUrlList(value))
		else result[name.slice(2)] = value
	}

	return result
}

function splitUrlList(value) {
	return String(value)
		.split(/[\s,]+/)
		.map((part) => part.trim())
		.filter(Boolean)
}

export function parseArchiveUrl(value) {
	let parsed
	try {
		parsed = new URL(value, DEFAULT_DOMAIN)
	} catch {
		fail(`Invalid archive URL: ${value}`)
	}

	if (!['candidgarden.com', 'www.candidgarden.com'].includes(parsed.hostname)) {
		fail(`Archive URL must be on candidgarden.com: ${value}`)
	}
	const match = parsed.pathname.match(/^\/archive\/(\d+)\/?$/)
	if (!match) fail(`Archive URL must contain /archive/<id>: ${value}`)
	const id = Number(match[1])
	if (!Number.isSafeInteger(id) || id <= 0)
		fail(`Invalid archive record: ${value}`)
	return id
}

function positiveInteger(
	value,
	fallback,
	label,
	maximum = Number.MAX_SAFE_INTEGER,
) {
	if (value == null || value === '') return fallback
	const parsed = Number(value)
	if (!Number.isInteger(parsed) || parsed <= 0 || parsed > maximum) {
		fail(`${label} must be an integer from 1 to ${maximum}`)
	}
	return parsed
}

export function slugify(value) {
	const slug = String(value ?? '')
		.toLowerCase()
		.replace(/ä/g, 'ae')
		.replace(/ö/g, 'oe')
		.replace(/ü/g, 'ue')
		.replace(/ß/g, 'ss')
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
	return slug || 'from-the-archive'
}

export function displayPeriod(notBefore, notAfter) {
	if (notBefore != null && notAfter != null) {
		return Number(notBefore) === Number(notAfter)
			? String(notBefore)
			: `${notBefore}–${notAfter}`
	}
	if (notBefore != null) return `AFTER ${notBefore}`
	if (notAfter != null) return `BEFORE ${notAfter}`
	return 'UNDATED'
}

function escapeHtml(value) {
	return String(value ?? '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;')
}

function truncate(value, maximum) {
	const text = String(value ?? '')
		.replace(/\s+/g, ' ')
		.trim()
	if (text.length <= maximum) return text
	return `${text.slice(0, maximum - 1).trimEnd()}…`
}

export function fitTitleSize(
	value,
	{ base = 52, minimum = 30, comfortable = 42 } = {},
) {
	const length = String(value ?? '').trim().length
	if (length <= comfortable) return base
	return Math.max(minimum, Math.round(base * Math.sqrt(comfortable / length)))
}

export function selectCoverArtworks(artworks, maximum = 8) {
	if (artworks.length <= maximum) return artworks
	return Array.from({ length: maximum }, (_, index) => {
		const sourceIndex = Math.round(
			(index * (artworks.length - 1)) / (maximum - 1),
		)
		return artworks[sourceIndex]
	})
}

function cleanDomain(value) {
	let parsed
	try {
		parsed = new URL(value || DEFAULT_DOMAIN)
	} catch {
		fail(`Invalid --domain value: ${value}`)
	}
	return parsed.origin
}

function normalizeArtwork(
	input,
	{ domain = DEFAULT_DOMAIN, baseDir = process.cwd() } = {},
) {
	const id = Number(input.id ?? input.resourceId)
	if (!Number.isSafeInteger(id) || id <= 0)
		fail('Every artwork needs a positive numeric id')

	let imageUrl = input.imageUrl ?? input.image_url ?? null
	if (imageUrl && !/^https?:|^data:|^file:/i.test(imageUrl)) {
		imageUrl = path.resolve(baseDir, imageUrl)
	}

	const rawMotifs = Array.isArray(input.motifs) ? input.motifs : []
	return {
		id,
		title: String(input.title ?? input.titleEn ?? '').trim() || 'Untitled',
		titleEn: input.titleEn ? String(input.titleEn).trim() : null,
		artist:
			String(input.artist?.name ?? input.artist ?? '').trim() || 'Unattributed',
		notBefore: input.notBefore == null ? null : Number(input.notBefore),
		notAfter: input.notAfter == null ? null : Number(input.notAfter),
		period:
			String(input.period ?? '').trim() ||
			displayPeriod(input.notBefore, input.notAfter),
		collection:
			String(
				input.collection?.name ?? input.collection ?? input.institution ?? '',
			).trim() || 'Collection not recorded',
		institution: input.institution ? String(input.institution).trim() : null,
		location: input.location ? String(input.location).trim() : null,
		wikiDataId: input.wikiDataId ? String(input.wikiDataId) : null,
		objectKey: input.objectKey ? String(input.objectKey) : null,
		highlight: Boolean(input.highlight),
		motifs: rawMotifs
			.map((motif) => String(motif))
			.filter(Boolean)
			.slice(0, 12),
		match:
			input.match && Number.isFinite(Number(input.match.similarity))
				? {
						level: Number(input.match.level) === 3 ? 3 : 2,
						similarity: Number(input.match.similarity),
					}
				: null,
		imageUrl,
		imageDataUrl: input.imageDataUrl ?? null,
		sourceUrl: input.sourceUrl || `${domain}/archive/${id}`,
	}
}

function databaseSchema(connectionString) {
	try {
		const schema =
			new URL(connectionString).searchParams.get('schema') || 'public'
		if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema))
			fail('DATABASE_URL has an invalid schema')
		return schema
	} catch (error) {
		if (error instanceof Error && error.message.includes('invalid schema'))
			throw error
		return 'public'
	}
}

async function openDatabase() {
	const connectionString = process.env.DATABASE_URL
	if (!connectionString) fail('DATABASE_URL is required for live archive data')
	const { Client } = await import('pg')
	const client = new Client({ connectionString })
	await client.connect()
	const schema = databaseSchema(connectionString)
	await client.query(`SET search_path TO "${schema}", public`)
	return client
}

async function fetchMotifs(client, ids) {
	if (!ids.length) return new Map()
	const result = await client.query(
		`SELECT resource_id, name
       FROM (
         SELECT g.resource_id,
                t.name,
                row_number() OVER (
                  PARTITION BY g.resource_id
                  ORDER BY g.frequency DESC, t.name
                ) AS motif_rank
           FROM "Tagging" g
           JOIN "Tag" t ON t.id = g.tag_id
          WHERE g.resource_id = ANY($1::int[])
       ) ranked
      WHERE motif_rank <= 12
      ORDER BY resource_id, motif_rank`,
		[ids],
	)
	const motifs = new Map(ids.map((id) => [id, []]))
	for (const row of result.rows) {
		const values = motifs.get(Number(row.resource_id)) ?? []
		if (values.length < 12) values.push(row.name)
		motifs.set(Number(row.resource_id), values)
	}
	return motifs
}

async function fetchArtworksByIds(client, ids, { domain, hits = new Map() }) {
	if (!ids.length) return []
	const result = await client.query(
		`SELECT r.id,
            r.title,
            r.title_en AS "titleEn",
            r.not_before AS "notBefore",
            r.not_after AS "notAfter",
            r.location,
            r.institution,
            r."objectKey",
            r."wikiDataId",
            r.highlight,
            a.name AS artist,
            i.name AS collection
       FROM "Resource" r
       LEFT JOIN "Artist" a ON a.id = r.artist_id
       LEFT JOIN "Institution" i ON i.id = r.institution_id
      WHERE r.id = ANY($1::int[])`,
		[ids],
	)
	const motifs = await fetchMotifs(client, ids)
	const byId = new Map(
		result.rows.map((row) => {
			const id = Number(row.id)
			return [
				id,
				normalizeArtwork(
					{
						...row,
						motifs: motifs.get(id) ?? [],
						match: hits.get(id) ?? null,
						sourceUrl: `${domain}/archive/${id}`,
					},
					{ domain },
				),
			]
		}),
	)
	return ids.map((id) => byId.get(id)).filter(Boolean)
}

async function embedQuery(query) {
	const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
	const apiToken = process.env.CLOUDFLARE_API_TOKEN
	if (!accountId || !apiToken) {
		fail(
			'A Sense query requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN',
		)
	}

	const response = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${EMBEDDING_MODEL}`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiToken}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ text: [query.trim()] }),
			signal: AbortSignal.timeout(30_000),
		},
	)
	if (!response.ok) {
		fail(
			`Workers AI returned ${response.status}: ${truncate(await response.text(), 240)}`,
		)
	}
	const payload = await response.json()
	const vector = payload?.result?.data?.[0]
	if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS) {
		fail(
			`${EMBEDDING_MODEL} returned ${vector?.length ?? 0} dimensions; expected ${EMBEDDING_DIMENSIONS}`,
		)
	}
	return vector
}

async function semanticHits(client, query, candidateCount) {
	const vector = `[${(await embedQuery(query)).join(',')}]`
	await client.query('BEGIN')
	try {
		await client.query(`SET LOCAL ivfflat.probes = ${IVFFLAT_PROBES}`)
		await client.query('SET LOCAL enable_seqscan = off')
		const result = await client.query(
			`WITH candidates AS (
         SELECT e.resource_id, e.level, e.embedding <=> $1::vector AS distance
           FROM "InterpretationEmbedding" e
          ORDER BY e.embedding <=> $1::vector
          LIMIT $2
       ), best AS (
         SELECT DISTINCT ON (resource_id) resource_id, level, distance
           FROM candidates
          ORDER BY resource_id, distance
       )
       SELECT resource_id, level, distance
         FROM best
        ORDER BY distance
        LIMIT $3`,
			[vector, candidateCount * 4, candidateCount],
		)
		await client.query('COMMIT')
		return result.rows.map((row, rank) => ({
			resourceId: Number(row.resource_id),
			level: Number(row.level) === 3 ? 3 : 2,
			similarity: 1 - Number(row.distance),
			rank,
		}))
	} catch (error) {
		await client.query('ROLLBACK')
		throw error
	}
}

function candidateScore(artwork, rank) {
	const similarity = artwork.match?.similarity ?? 0
	const highlight = artwork.highlight ? 0.012 : 0
	const attribution = artwork.artist !== 'Unattributed' ? 0.003 : 0
	const collection =
		artwork.collection !== 'Collection not recorded' ? 0.002 : 0
	const rankTieBreak = Math.max(0, 0.0001 - rank * 0.000001)
	return similarity + highlight + attribution + collection + rankTieBreak
}

export function selectCandidates(candidates, limit) {
	const eligible = candidates
		.map((artwork, rank) => ({
			artwork,
			rank,
			score: candidateScore(artwork, rank),
		}))
		.filter(({ artwork }) =>
			Boolean(artwork.objectKey || artwork.imageUrl || artwork.imageDataUrl),
		)
		.sort((left, right) => right.score - left.score || left.rank - right.rank)

	const chosen = []
	const chosenIds = new Set()
	const artists = new Set()

	for (const entry of eligible) {
		const artistKey = entry.artwork.artist.toLocaleLowerCase('en')
		if (artistKey !== 'unattributed' && artists.has(artistKey)) continue
		chosen.push(entry.artwork)
		chosenIds.add(entry.artwork.id)
		if (artistKey !== 'unattributed') artists.add(artistKey)
		if (chosen.length === limit) return chosen
	}
	for (const entry of eligible) {
		if (chosenIds.has(entry.artwork.id)) continue
		chosen.push(entry.artwork)
		if (chosen.length === limit) break
	}
	return chosen
}

async function loadExplicitArtworks(urls, options) {
	const ids = urls.map(parseArchiveUrl)
	if (new Set(ids).size !== ids.length)
		fail('Archive URL list contains duplicate records')
	const client = await openDatabase()
	try {
		const artworks = await fetchArtworksByIds(client, ids, options)
		const found = new Set(artworks.map((artwork) => artwork.id))
		const missing = ids.filter((id) => !found.has(id))
		if (missing.length) fail(`Archive records not found: ${missing.join(', ')}`)
		return artworks
	} finally {
		await client.end()
	}
}

async function loadQueryArtworks(query, limit, options) {
	const client = await openDatabase()
	try {
		const candidateCount = Math.max(60, limit * 12)
		const hits = await semanticHits(client, query, candidateCount)
		const hitMap = new Map(hits.map((hit) => [hit.resourceId, hit]))
		const records = await fetchArtworksByIds(
			client,
			hits.map((hit) => hit.resourceId),
			{ ...options, hits: hitMap },
		)
		const selected = selectCandidates(records, limit)
		if (selected.length < limit) {
			fail(
				`Sense search found only ${selected.length} image-bearing records; requested ${limit}`,
			)
		}
		return selected
	} finally {
		await client.end()
	}
}

async function loadArtworkFile(filename, options) {
	const absolute = path.resolve(filename)
	const payload = JSON.parse(await fs.readFile(absolute, 'utf8'))
	const values = Array.isArray(payload) ? payload : payload?.artworks
	if (!Array.isArray(values) || values.length === 0) {
		fail(
			'--artwork-file must contain a non-empty array or { "artworks": [...] }',
		)
	}
	return values.map((value) =>
		normalizeArtwork(value, { ...options, baseDir: path.dirname(absolute) }),
	)
}

function mimeFromPath(filename) {
	switch (path.extname(filename).toLowerCase()) {
		case '.png':
			return 'image/png'
		case '.webp':
			return 'image/webp'
		case '.avif':
			return 'image/avif'
		case '.gif':
			return 'image/gif'
		case '.svg':
			return 'image/svg+xml'
		case '.jpeg':
		case '.jpg':
		default:
			return 'image/jpeg'
	}
}

function toDataUrl(buffer, mime) {
	return `data:${mime};base64,${buffer.toString('base64')}`
}

async function fetchImageDataUrl(url) {
	if (url.startsWith('data:')) return url
	let localPath = null
	if (url.startsWith('file:')) localPath = fileURLToPath(url)
	else if (!/^https?:/i.test(url)) localPath = url
	if (localPath)
		return toDataUrl(await fs.readFile(localPath), mimeFromPath(localPath))

	const response = await fetch(url, { signal: AbortSignal.timeout(45_000) })
	if (!response.ok) fail(`Image request returned ${response.status}`)
	const mime = (response.headers.get('content-type') || 'image/jpeg').split(
		';',
	)[0]
	return toDataUrl(Buffer.from(await response.arrayBuffer()), mime)
}

async function signedArtworkUrl(objectKey) {
	const bucket = process.env.AWS_S3_BUCKET
	const region = process.env.AWS_REGION
	if (!bucket || !region)
		fail('AWS_S3_BUCKET and AWS_REGION are required to fetch artwork images')
	const [{ S3Client, GetObjectCommand }, { getSignedUrl }] = await Promise.all([
		import('@aws-sdk/client-s3'),
		import('@aws-sdk/s3-request-presigner'),
	])
	const client = new S3Client({ region })
	return getSignedUrl(
		client,
		new GetObjectCommand({ Bucket: bucket, Key: objectKey }),
		{
			expiresIn: 120,
		},
	)
}

async function hydrateImages(artworks) {
	const hydrated = []
	for (const artwork of artworks) {
		if (artwork.imageDataUrl) {
			hydrated.push(artwork)
			continue
		}
		if (!artwork.imageUrl && !artwork.objectKey) {
			hydrated.push({ ...artwork, imageDataUrl: null })
			continue
		}
		try {
			const source =
				artwork.imageUrl || (await signedArtworkUrl(artwork.objectKey))
			hydrated.push({
				...artwork,
				imageDataUrl: await fetchImageDataUrl(source),
			})
		} catch (error) {
			fail(`Could not fetch image for record ${artwork.id}: ${error.message}`)
		}
	}
	return hydrated
}

async function locateProjectRoot() {
	const starts = [process.cwd(), SKILL_DIR]
	for (const start of starts) {
		let current = path.resolve(start)
		while (true) {
			try {
				await fs.access(path.join(current, 'public', 'fonts', 'archivo-black'))
				return current
			} catch {
				const parent = path.dirname(current)
				if (parent === current) break
				current = parent
			}
		}
	}
	return process.cwd()
}

async function embeddedFontCss(projectRoot) {
	const fonts = [
		{
			family: 'Archivo Black',
			filename:
				'public/fonts/archivo-black/archivo-black-latin-400-normal.woff2',
			weight: 400,
		},
		{
			family: 'IBM Plex Mono',
			filename:
				'public/fonts/ibm-plex-mono/ibm-plex-mono-latin-400-normal.woff2',
			weight: 400,
		},
		{
			family: 'IBM Plex Mono',
			filename:
				'public/fonts/ibm-plex-mono/ibm-plex-mono-latin-600-normal.woff2',
			weight: 600,
		},
	]
	const rules = []
	for (const font of fonts) {
		try {
			const data = await fs.readFile(path.join(projectRoot, font.filename))
			rules.push(
				`@font-face{font-family:'${font.family}';font-style:normal;font-weight:${font.weight};font-display:block;src:url('${toDataUrl(data, 'font/woff2')}') format('woff2');}`,
			)
		} catch {
			// System fallbacks keep offline rendering functional outside this repo.
		}
	}
	return rules.join('\n')
}

function baseCss(fontCss) {
	return `
${fontCss}
:root{color-scheme:light;--paper:${COLORS.paper};--ink:${COLORS.ink};--bone:${COLORS.bone};--void:${COLORS.void};--ultra:${COLORS.ultra};--ultra-lift:${COLORS.ultraLift};--stamp:${COLORS.stamp};--stamp-lift:${COLORS.stampLift};--muted:${COLORS.muted};}
*{box-sizing:border-box;border-radius:0!important;}
html,body{width:100%;height:100%;margin:0;overflow:hidden;}
body{-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision;}
figure{margin:0;}
.display{font-family:'Archivo Black',Impact,'Arial Black',sans-serif;text-transform:uppercase;font-weight:400;}
.body{font-family:'Times New Roman',Times,serif;}
.data{font-family:'IBM Plex Mono','Courier New',monospace;text-transform:uppercase;letter-spacing:.12em;}
.card{position:relative;width:100vw;height:100vh;overflow:hidden;}
.rule{height:2px;background:currentColor;opacity:.22;}
`
}

function wordmark({ inverse = false } = {}) {
	return `<div class="wordmark"><span class="display">Candid<span class="wordmark-dot">·</span>Garden</span><span class="data">Institute for Art Re-Search</span></div>
  <style>
    .wordmark{display:flex;align-items:baseline;justify-content:space-between;gap:24px;border-bottom:1px solid ${inverse ? 'rgba(232,229,222,.26)' : 'rgba(26,26,26,.24)'};padding-bottom:18px;}
    .wordmark .display{font-size:27px;letter-spacing:-.015em;white-space:nowrap;}
    .wordmark-dot{color:${inverse ? COLORS.ultraLift : COLORS.ultra};}
    .wordmark .data{font-size:12px;line-height:1.4;text-align:right;color:${inverse ? COLORS.bone : COLORS.muted};}
  </style>`
}

function coverThumbnail(artwork, index) {
	const image = artwork.imageDataUrl
		? `<img src="${artwork.imageDataUrl}" alt="${escapeHtml(artwork.title)} by ${escapeHtml(artwork.artist)}">`
		: `<span class="data miniature-missing">Image not on file</span>`
	return `<figure class="miniature miniature-${(index % 4) + 1}">${image}</figure>`
}

export function renderCoverHtml({
	title,
	hook = 'What connects these works?',
	method,
	domain,
	fontCss,
	artworks = [],
}) {
	const titleSize = fitTitleSize(title, {
		base: 82,
		minimum: 48,
		comfortable: 28,
	})
	const archiveHost = new URL(domain).host.replace(/^www\./, '')
	const splitAt = Math.ceil(artworks.length / 2)
	const topArtworks = artworks.slice(0, splitAt)
	const bottomArtworks = artworks.slice(splitAt)
	const density = artworks.length <= 4 ? 'low' : 'standard'
	const galleryRow = (items, offset, position) =>
		`<div class="gallery-row gallery-${position}" style="--works:${Math.max(items.length, 1)}">${items
			.map((artwork, index) => coverThumbnail(artwork, offset + index))
			.join('')}</div>`
	return `<!doctype html><html><head><meta charset="utf-8"><style>
${baseCss(fontCss)}
body{background:#fff;color:var(--ink);}
.cover{padding:54px 64px 46px;display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:20px;}
.cover-main{min-height:0;display:grid;grid-template-rows:minmax(0,1fr) auto minmax(0,1fr);gap:18px;}
.gallery-row{min-height:0;display:grid;grid-template-columns:repeat(var(--works),minmax(0,1fr));gap:18px;align-items:center;justify-items:center;padding:0 12px;}
.cover-density-low .gallery-row{padding-inline:clamp(72px,12vw,160px);gap:34px;}
.gallery-row:empty{visibility:hidden;}
.miniature{display:flex;align-items:center;justify-content:center;width:100%;height:78%;padding:7px;background:#fff;border:1px solid rgba(26,26,26,.72);overflow:hidden;}
.miniature img{display:block;width:100%;height:100%;object-fit:contain;object-position:center;}
.miniature-missing{display:flex;align-items:center;justify-content:center;width:100%;height:100%;border:1px dashed rgba(26,26,26,.32);padding:10px;color:var(--muted);font-size:9px;line-height:1.4;text-align:center;}
.gallery-top .miniature:nth-child(4n+1),.gallery-bottom .miniature:nth-child(4n+3){width:88%;height:91%;align-self:start;}
.gallery-top .miniature:nth-child(4n+2),.gallery-bottom .miniature:nth-child(4n+4){width:100%;height:72%;align-self:end;}
.gallery-top .miniature:nth-child(4n+3),.gallery-bottom .miniature:nth-child(4n+1){width:82%;height:82%;}
.gallery-top .miniature:nth-child(4n+4),.gallery-bottom .miniature:nth-child(4n+2){width:92%;height:96%;}
.title-panel{position:relative;text-align:center;padding:30px 24px 32px;border-top:1px solid rgba(26,26,26,.24);border-bottom:1px solid rgba(26,26,26,.24);background:#fff;}
h1{font-size:${titleSize}px;line-height:.92;letter-spacing:-.025em;margin:0 auto;overflow-wrap:anywhere;max-width:900px;}
.hook{font-family:'Times New Roman',Times,serif;font-size:29px;font-style:italic;margin:20px 0 0;color:var(--ink);}
.cover-footer{display:grid;grid-template-columns:1fr auto;gap:36px;align-items:end;border-top:1px solid rgba(26,26,26,.24);padding-top:16px;}
.method{font-size:11px;line-height:1.5;color:var(--muted);max-width:650px;}
.stamp{border:1px solid var(--stamp);color:var(--stamp);padding:9px 12px;font-size:10px;line-height:1.4;text-align:right;}
</style></head><body><main class="card cover">
${wordmark()}
<section class="cover-main cover-density-${density}">
	${galleryRow(topArtworks, 0, 'top')}
	<div class="title-panel">
	  <h1 class="display">${escapeHtml(title)}</h1>
	  <p class="hook">${escapeHtml(hook)}</p>
	</div>
	${galleryRow(bottomArtworks, splitAt, 'bottom')}
</section>
<footer class="cover-footer">
  <div class="data method">${escapeHtml(method)}<br>${escapeHtml(archiveHost)}</div>
  <div class="data stamp">Provenance<br>ARTigo · Candid Garden</div>
</footer>
</main></body></html>`
}

export function renderArtworkHtml({ artwork, index, total, fontCss }) {
	const titleSize = fitTitleSize(artwork.title)
	const location =
		artwork.location && artwork.location !== artwork.collection
			? artwork.location
			: null
	const image = artwork.imageDataUrl
		? `<img src="${artwork.imageDataUrl}" alt="${escapeHtml(artwork.title)} by ${escapeHtml(artwork.artist)}">`
		: `<div class="data missing">Image not on file</div>`
	return `<!doctype html><html><head><meta charset="utf-8"><style>
${baseCss(fontCss)}
body{background:var(--paper);color:var(--ink);}
.art-card{padding:50px 64px 48px;display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:20px;}
.plate{position:relative;min-height:0;border-bottom:1px solid rgba(26,26,26,.22);display:flex;align-items:center;justify-content:center;overflow:hidden;background:var(--paper);}
.plate img{position:absolute;inset:0 0 18px;display:block;width:100%;height:calc(100% - 18px);object-fit:contain;object-position:center;}
.missing{display:flex;align-items:center;justify-content:center;width:100%;height:100%;border:1px dashed rgba(26,26,26,.38);color:var(--muted);font-size:15px;}
.details{display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:34px;align-items:end;}
h1{font-size:${titleSize}px;line-height:.98;letter-spacing:-.015em;margin:0 0 12px;overflow-wrap:anywhere;max-height:3em;overflow:hidden;}
.artist{font-size:28px;line-height:1.15;font-style:italic;margin:0;}
.period{font-style:normal;white-space:nowrap;}
.facts{border-left:1px solid rgba(26,26,26,.24);padding-left:22px;display:flex;flex-direction:column;gap:10px;min-width:0;}
.fact-label{font-size:10px;color:var(--muted);margin-bottom:4px;}
.fact-value{font-size:13px;line-height:1.35;letter-spacing:.06em;overflow-wrap:anywhere;}
.record{color:var(--stamp);border:2px solid var(--stamp);padding:8px 10px;align-self:flex-start;font-size:10px;line-height:1.45;}
.plate-index{color:var(--ultra);font-size:11px;}
</style></head><body><main class="card art-card">
${wordmark()}
<figure class="plate">${image}</figure>
<section class="details">
  <div>
    <div class="data plate-index">Plate ${String(index).padStart(2, '0')} / ${String(total).padStart(2, '0')}</div>
    <h1 class="display">${escapeHtml(artwork.title)}</h1>
    <p class="body artist">${escapeHtml(artwork.artist)}, <span class="period">${escapeHtml(artwork.period)}</span></p>
  </div>
  <aside class="facts">
    <div><div class="data fact-label">Collection</div><div class="data fact-value">${escapeHtml(truncate(artwork.collection, 82))}</div></div>
    ${location ? `<div><div class="data fact-label">Location / record</div><div class="data fact-value">${escapeHtml(truncate(location, 72))}</div></div>` : ''}
    <div class="data record">Provenance<br>ARTigo · Record #${artwork.id}</div>
  </aside>
</section>
</main></body></html>`
}

export async function renderFiles(
	slides,
	{ outDir, width, height, noRender = false },
) {
	await fs.mkdir(outDir, { recursive: true })
	if (noRender) {
		for (const slide of slides) {
			await fs.writeFile(
				path.join(outDir, slide.filename.replace(/\.png$/, '.html')),
				slide.html,
			)
		}
		return slides.map((slide) => slide.filename.replace(/\.png$/, '.html'))
	}

	const { chromium } = await import('playwright')
	const browser = await chromium.launch({ headless: true })
	try {
		const page = await browser.newPage({
			viewport: { width, height },
			deviceScaleFactor: 1,
		})
		for (const slide of slides) {
			await page.setContent(slide.html, { waitUntil: 'load' })
			await page.evaluate(async () => document.fonts?.ready)
			await page.screenshot({
				path: path.join(outDir, slide.filename),
				type: 'png',
				clip: { x: 0, y: 0, width, height },
			})
		}
	} finally {
		await browser.close()
	}
	return slides.map((slide) => slide.filename)
}

function publicArtwork(artwork) {
	return {
		id: artwork.id,
		title: artwork.title,
		titleEn: artwork.titleEn,
		artist: artwork.artist,
		notBefore: artwork.notBefore,
		notAfter: artwork.notAfter,
		period: artwork.period,
		collection: artwork.collection,
		institution: artwork.institution,
		location: artwork.location,
		wikiDataId: artwork.wikiDataId,
		motifs: artwork.motifs,
		match: artwork.match,
		imageAvailable: Boolean(artwork.imageDataUrl),
		sourceUrl: artwork.sourceUrl,
	}
}

async function main() {
	const args = parseArgs(process.argv.slice(2))
	if (args.help) {
		usage()
		return
	}

	const modes = [
		Boolean(args.query),
		args.urls.length > 0,
		Boolean(args['artwork-file']),
	].filter(Boolean)
	if (modes.length !== 1) {
		fail('Choose exactly one input: --query, --url/--urls, or --artwork-file')
	}

	const domain = cleanDomain(args.domain || DEFAULT_DOMAIN)
	const limit = positiveInteger(args.limit, DEFAULT_LIMIT, '--limit', MAX_WORKS)
	const width = positiveInteger(args.width, DEFAULT_WIDTH, '--width', 4096)
	const height = positiveInteger(args.height, DEFAULT_HEIGHT, '--height', 4096)
	const title = String(args.title || args.query || 'From the archive').trim()
	if (!title) fail('--title cannot be empty')
	const hook = String(args.hook || 'What connects these works?').trim()
	if (!hook) fail('--hook cannot be empty')

	let artworks
	let mode
	if (args.query) {
		mode = 'sense'
		artworks = await loadQueryArtworks(String(args.query).trim(), limit, {
			domain,
		})
	} else if (args.urls.length) {
		mode = 'links'
		if (args.urls.length > MAX_WORKS)
			fail(`A deck may contain at most ${MAX_WORKS} artwork cards`)
		artworks = await loadExplicitArtworks(args.urls, { domain })
	} else {
		mode = 'file'
		artworks = await loadArtworkFile(args['artwork-file'], { domain })
		if (artworks.length > MAX_WORKS)
			fail(`A deck may contain at most ${MAX_WORKS} artwork cards`)
	}

	artworks = await hydrateImages(artworks)
	const projectRoot = await locateProjectRoot()
	const fontCss = await embeddedFontCss(projectRoot)
	const deckSlug = slugify(title)
	const outDir = path.resolve(
		args['out-dir'] || path.join('output', 'candidgarden-instagram', deckSlug),
	)
	const method =
		mode === 'sense'
			? 'Selected by proximity to machine-written readings · not image recognition or proof of subject matter'
			: mode === 'links'
				? 'Records selected in the supplied order'
				: 'Records supplied from an offline catalogue file'

	const slides = []
	let fileNumber = 1
	if (!args['no-cover']) {
		const coverArtworks = selectCoverArtworks(artworks)
		slides.push({
			filename: `${String(fileNumber).padStart(2, '0')}-cover.png`,
			kind: 'cover',
			html: renderCoverHtml({
				title,
				hook,
				method,
				domain,
				artworks: coverArtworks,
				width,
				height,
				fontCss,
			}),
		})
		fileNumber += 1
	}
	artworks.forEach((artwork, index) => {
		slides.push({
			filename: `${String(fileNumber + index).padStart(2, '0')}-artwork-${String(index + 1).padStart(2, '0')}-${artwork.id}.png`,
			kind: 'artwork',
			artworkId: artwork.id,
			html: renderArtworkHtml({
				artwork,
				index: index + 1,
				total: artworks.length,
				width,
				height,
				fontCss,
			}),
		})
	})

	const files = await renderFiles(slides, {
		outDir,
		width,
		height,
		noRender: Boolean(args['no-render']),
	})
	const manifest = {
		schemaVersion: 1,
		generatedAt: new Date().toISOString(),
		title,
		mode,
		query: mode === 'sense' ? String(args.query).trim() : null,
		selectionNote: method,
		dimensions: { width, height },
		coverIncluded: !args['no-cover'],
		files,
		artworks: artworks.map(publicArtwork),
	}
	await fs.writeFile(
		path.join(outDir, 'manifest.json'),
		`${JSON.stringify(manifest, null, 2)}\n`,
	)

	console.log(`Generated ${files.length} carousel cards in ${outDir}`)
	for (const filename of files) console.log(`- ${filename}`)
	console.log('- manifest.json')
}

const invokedDirectly =
	process.argv[1] &&
	pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
if (invokedDirectly) {
	main().catch((error) => {
		const message =
			error instanceof AggregateError
				? error.errors
						.map((entry) => entry?.message || String(entry))
						.join('; ')
				: error?.message || String(error)
		console.error(`Error: ${message}`)
		process.exitCode = 1
	})
}
