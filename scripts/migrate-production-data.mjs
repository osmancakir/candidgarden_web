import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
	HeadObjectCommand,
	PutObjectCommand,
	S3Client,
} from '@aws-sdk/client-s3'
import pg from 'pg'
import prompts from 'prompts'

const { Client } = pg

const RDS_HOST =
	'candidgarden-production.cvo2yi4eaqib.eu-central-1.rds.amazonaws.com'
const RDS_PORT = 5432
const RDS_DATABASE = 'candidgarden'
const RDS_USER = 'cg_app'
const RDS_CA_PATH = resolve('.wrangler/rds-global-bundle.pem')
const AWS_REGION = 'eu-central-1'
const AWS_BUCKET = 'candidgarden-images-production'
const ARTWORK_SOURCE =
	'https://fly.storage.tigris.dev/artaigo-bucket-v1/images/'
const DEFAULT_SNAPSHOT = resolve(
	'.wrangler/migration/candidgarden-production-rehearsal-readable.sqlite',
)

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

const phase = String(args.get('phase') ?? 'inventory')
const apply = args.get('apply') === true
const snapshotPath = resolve(String(args.get('snapshot') ?? DEFAULT_SNAPSHOT))
const concurrency = Number(args.get('concurrency') ?? 12)
// Missing legacy Tigris objects are expected in this migration and are recorded
// explicitly. Use --fail-on-missing-images only when auditing in strict mode.
const skipMissingImages = args.get('fail-on-missing-images') !== true
const skipImagesPath = resolve(
	String(
		args.get('skip-images-file') ?? 'scripts/migration-skipped-images.txt',
	),
)
const missingImagesPath = resolve(
	String(
		args.get('missing-images-file') ?? '.wrangler/migration/missing-images.txt',
	),
)

if (!['inventory', 'images', 'database', 'verify', 'all'].includes(phase)) {
	throw new Error(`Unsupported phase: ${phase}`)
}
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) {
	throw new Error('--concurrency must be an integer between 1 and 32')
}

const sqlite = new DatabaseSync(snapshotPath, { readOnly: true })

async function loadSkippedImagePaths(path) {
	try {
		const contents = await readFile(path, 'utf8')
		return new Set(
			contents
				.split(/\r?\n/)
				.map((line) => line.trim())
				.filter((line) => line && !line.startsWith('#')),
		)
	} catch (error) {
		if (error?.code === 'ENOENT') return new Set()
		throw error
	}
}

const skippedImagePaths = new Set([
	...(await loadSkippedImagePaths(skipImagesPath)),
	...(await loadSkippedImagePaths(missingImagesPath)),
])
let missingImageWriteQueue = Promise.resolve()

async function recordMissingImage(path) {
	if (skippedImagePaths.has(path)) return
	skippedImagePaths.add(path)
	missingImageWriteQueue = missingImageWriteQueue.then(() =>
		appendFile(missingImagesPath, `${path}\n`, {
			encoding: 'utf8',
			mode: 0o600,
		}),
	)
	await missingImageWriteQueue
	console.warn(`Intentionally omitted missing Tigris object: ${path}`)
}

for (const path of skippedImagePaths) {
	const exists = sqlite
		.prepare(`SELECT 1 FROM "Resource" WHERE path = ? LIMIT 1`)
		.get(path)
	if (!exists) {
		throw new Error(
			`Skipped image path does not exist in the snapshot: ${path}`,
		)
	}
}

function fail(message) {
	console.error(message)
	process.exit(1)
}

function quoteIdentifier(identifier) {
	return `"${identifier.replaceAll('"', '""')}"`
}

function sourceCount(table, where = '') {
	return Number(
		sqlite
			.prepare(
				`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)} ${where}`,
			)
			.get().count,
	)
}

function asTimestamp(value) {
	if (value === null || value === undefined) return null
	if (typeof value === 'number' || /^\d+$/.test(String(value))) {
		return new Date(Number(value)).toISOString()
	}
	const parsed = new Date(String(value))
	if (Number.isNaN(parsed.valueOf())) {
		throw new Error(`Invalid SQLite timestamp: ${value}`)
	}
	return parsed.toISOString()
}

let replacedNullCharacters = 0
function asText(value) {
	if (value === null || value === undefined) return null
	const text = String(value)
	if (!text.includes('\0')) return text
	replacedNullCharacters++
	return text.replaceAll('\0', '\uFFFD')
}

function asBoolean(value) {
	if (value === null || value === undefined) return null
	return Boolean(value)
}

function imageExtension(contentType) {
	const extensions = {
		'image/avif': 'avif',
		'image/gif': 'gif',
		'image/jpeg': 'jpg',
		'image/png': 'png',
		'image/svg+xml': 'svg',
		'image/webp': 'webp',
	}
	return extensions[contentType] ?? 'bin'
}

function encodedSourcePath(path) {
	return String(path)
		.split('/')
		.map((part) => encodeURIComponent(part))
		.join('/')
}

function sha256(buffer) {
	return createHash('sha256').update(buffer).digest()
}

async function retry(operation, description, attempts = 4) {
	let lastError
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			return await operation()
		} catch (error) {
			lastError = error
			if (attempt === attempts) break
			await new Promise((resolvePromise) =>
				setTimeout(resolvePromise, 500 * 2 ** (attempt - 1)),
			)
		}
	}
	throw new Error(`${description} failed after ${attempts} attempts`, {
		cause: lastError,
	})
}

async function promptForAws() {
	const answers = await prompts(
		[
			{
				type: 'password',
				name: 'accessKeyId',
				message: 'AWS access key ID for candidgarden-images-production',
				validate: (value) => Boolean(value) || 'Access key ID is required',
			},
			{
				type: 'password',
				name: 'secretAccessKey',
				message: 'AWS secret access key',
				validate: (value) => Boolean(value) || 'Secret access key is required',
			},
		],
		{ onCancel: () => fail('Cancelled without making changes.') },
	)
	if (!answers.accessKeyId || !answers.secretAccessKey)
		fail('AWS credentials are required.')
	return new S3Client({
		region: AWS_REGION,
		credentials: answers,
	})
}

async function objectAlreadyMigrated(s3, key, expectedMigration) {
	try {
		const result = await s3.send(
			new HeadObjectCommand({ Bucket: AWS_BUCKET, Key: key }),
		)
		return (
			Number(result.ContentLength) > 0 &&
			result.Metadata?.migration === expectedMigration &&
			Boolean(result.Metadata?.sha256)
		)
	} catch (error) {
		// S3 returns 403 for a missing object when this least-privilege caller has
		// GetObject but not ListBucket. A real credential or policy problem is
		// still caught by the following PutObject request.
		if (
			[403, 404].includes(error?.$metadata?.httpStatusCode) ||
			error?.name === 'NotFound'
		) {
			return false
		}
		throw error
	}
}

async function uploadCheckedObject({ s3, key, body, contentType, migration }) {
	const digest = sha256(body)
	await s3.send(
		new PutObjectCommand({
			Bucket: AWS_BUCKET,
			Key: key,
			Body: body,
			ContentLength: body.byteLength,
			ContentType: contentType,
			ChecksumSHA256: digest.toString('base64'),
			Metadata: {
				migration,
				sha256: digest.toString('hex'),
			},
		}),
	)
	const head = await s3.send(
		new HeadObjectCommand({ Bucket: AWS_BUCKET, Key: key }),
	)
	if (
		Number(head.ContentLength) !== body.byteLength ||
		head.Metadata?.sha256 !== digest.toString('hex')
	) {
		throw new Error(`S3 verification failed for ${key}`)
	}
}

async function migrateImages() {
	if (!apply) {
		console.log('Image migration is read-only without --apply.')
		return
	}
	const s3 = await promptForAws()
	const artworkRows = sqlite
		.prepare(
			`SELECT id, path FROM "Resource"
			 WHERE path IS NOT NULL AND trim(path) != '' ORDER BY id`,
		)
		.all()
	const userImages = sqlite
		.prepare(
			`SELECT id, userId, contentType, blob FROM "UserImage" ORDER BY id`,
		)
		.all()
	const jobs = [
		...artworkRows.map((row) => ({ type: 'artwork', row })),
		...userImages.map((row) => ({ type: 'user-image', row })),
	]
	let cursor = 0
	let migrated = 0
	let skipped = 0
	let intentionallyOmitted = 0

	async function processJob(job) {
		if (job.type === 'artwork') {
			const path = String(job.row.path)
			if (skippedImagePaths.has(path)) {
				intentionallyOmitted++
				return
			}
			const key = `artworks/${path}`
			const migration = 'fly-tigris-artwork-v1'
			if (await objectAlreadyMigrated(s3, key, migration)) {
				skipped++
				return
			}
			const sourceUrl = ARTWORK_SOURCE + encodedSourcePath(path)
			const response = await retry(async () => {
				const result = await fetch(sourceUrl, {
					signal: AbortSignal.timeout(60_000),
				})
				if (result.status === 404 && skipMissingImages) return result
				if (!result.ok) throw new Error(`HTTP ${result.status}`)
				return result
			}, `Download ${sourceUrl}`)
			if (response.status === 404) {
				await recordMissingImage(path)
				intentionallyOmitted++
				return
			}
			const body = Buffer.from(await response.arrayBuffer())
			if (!body.byteLength)
				throw new Error(`Source image is empty: ${sourceUrl}`)
			await retry(
				() =>
					uploadCheckedObject({
						s3,
						key,
						body,
						contentType:
							response.headers.get('content-type') ??
							'application/octet-stream',
						migration,
					}),
				`Upload ${key}`,
			)
			migrated++
			return
		}

		const row = job.row
		const extension = imageExtension(String(row.contentType))
		const key = `users/${row.userId}/profile-images/legacy-${row.id}.${extension}`
		const migration = 'fly-sqlite-user-image-v1'
		if (await objectAlreadyMigrated(s3, key, migration)) {
			skipped++
			return
		}
		const body = Buffer.from(row.blob)
		await retry(
			() =>
				uploadCheckedObject({
					s3,
					key,
					body,
					contentType: String(row.contentType),
					migration,
				}),
			`Upload ${key}`,
		)
		migrated++
	}

	async function worker() {
		while (true) {
			const index = cursor++
			if (index >= jobs.length) return
			await processJob(jobs[index])
			const complete = migrated + skipped + intentionallyOmitted
			if (complete % 100 === 0 || complete === jobs.length) {
				console.log(
					`Images ${complete}/${jobs.length} (${migrated} uploaded, ${skipped} already verified, ${intentionallyOmitted} intentionally omitted)`,
				)
			}
		}
	}

	await Promise.all(Array.from({ length: concurrency }, () => worker()))
	await missingImageWriteQueue
	console.log(
		`Image migration complete: ${migrated} uploaded, ${skipped} already verified, and ${intentionallyOmitted} intentionally omitted.`,
	)
}

const text = (source, target = source) => ({ source, target, type: 'text' })
const integer = (source, target = source) => ({
	source,
	target,
	type: 'int4',
})
const timestamp = (source, target = source) => ({
	source,
	target,
	type: 'timestamp',
	transform: asTimestamp,
})
const boolean = (source, target = source) => ({
	source,
	target,
	type: 'bool',
	transform: asBoolean,
})

const tableConfigurations = [
	{
		table: 'User',
		columns: [
			text('id'),
			text('email'),
			text('username'),
			text('name'),
			timestamp('createdAt'),
			timestamp('updatedAt'),
		],
	},
	{
		table: 'Permission',
		where: `WHERE "entity" <> 'note'`,
		columns: [
			text('id'),
			text('action'),
			text('entity'),
			text('access'),
			text('description'),
			timestamp('createdAt'),
			timestamp('updatedAt'),
		],
	},
	{
		table: 'Role',
		columns: [
			text('id'),
			text('name'),
			text('description'),
			timestamp('createdAt'),
			timestamp('updatedAt'),
		],
	},
	{
		table: 'Artist',
		columns: [integer('id'), text('name'), text('wikiDataId')],
		serial: true,
	},
	{
		table: 'Institution',
		columns: [
			integer('id'),
			text('name'),
			text('wikiDataId'),
			text('imageUrl'),
			{
				source: null,
				target: 'objectKey',
				type: 'text',
				transform: () => null,
			},
			timestamp('createdAt'),
			timestamp('updatedAt'),
			timestamp('deletedAt'),
		],
		serial: true,
	},
	{
		table: 'Tag',
		columns: [
			text('id'),
			text('name'),
			text('language'),
			text('category'),
			text('safety'),
			integer('human'),
			integer('ai_gpt_4o'),
		],
	},
	{
		table: 'Music',
		columns: [
			integer('id'),
			text('source'),
			text('track_name'),
			text('artist_name'),
			text('album'),
			text('isrc'),
			text('spotify_id'),
			text('country'),
			text('genre'),
			integer('release_year'),
			text('youtube_url'),
			boolean('highlight'),
		],
		serial: true,
	},
	{
		table: 'Resource',
		columns: [
			integer('id'),
			integer('artist_id'),
			text('title'),
			text('title_en'),
			integer('not_before'),
			integer('not_after'),
			text('location'),
			text('institution'),
			text('path'),
			{
				source: 'path',
				target: 'objectKey',
				type: 'text',
				transform: (value) =>
					value && !skippedImagePaths.has(String(value))
						? `artworks/${value}`
						: null,
			},
			text('wikiDataId'),
			boolean('highlight'),
		],
		serial: true,
	},
	{ table: 'Password', columns: [text('hash'), text('userId')] },
	{
		table: 'Session',
		columns: [
			text('id'),
			timestamp('expirationDate'),
			timestamp('createdAt'),
			timestamp('updatedAt'),
			text('userId'),
		],
	},
	{
		table: 'Verification',
		columns: [
			text('id'),
			timestamp('createdAt'),
			text('type'),
			text('target'),
			text('secret'),
			text('algorithm'),
			integer('digits'),
			integer('period'),
			text('charSet'),
			timestamp('expiresAt'),
		],
	},
	{
		table: 'Connection',
		columns: [
			text('id'),
			text('providerName'),
			text('providerId'),
			timestamp('createdAt'),
			timestamp('updatedAt'),
			text('userId'),
		],
	},
	{
		table: '_PermissionToRole',
		where: `WHERE "A" IN (SELECT "id" FROM "Permission" WHERE "entity" <> 'note')`,
		columns: [text('A'), text('B')],
	},
	{ table: '_RoleToUser', columns: [text('A'), text('B')] },
	{
		table: 'UserImage',
		columns: [
			text('id'),
			text('altText'),
			{
				source: 'id',
				target: 'objectKey',
				type: 'text',
				transform: (_value, row) =>
					`users/${row.userId}/profile-images/legacy-${row.id}.${imageExtension(String(row.contentType))}`,
			},
			timestamp('createdAt'),
			timestamp('updatedAt'),
			text('userId'),
		],
	},
	{
		table: 'Relation',
		columns: [
			integer('id'),
			integer('resource_id_1'),
			integer('resource_id_2'),
			text('type'),
		],
		serial: true,
	},
	{
		table: 'Tagging',
		columns: [
			integer('id'),
			integer('resource_id'),
			text('tag_id'),
			integer('frequency'),
		],
		serial: true,
		batchSize: 10_000,
	},
	{
		table: 'Favorite',
		columns: [
			text('id'),
			timestamp('createdAt'),
			text('userId'),
			integer('resourceId'),
		],
	},
	{
		table: 'WikiDataVerification',
		columns: [
			integer('id'),
			text('status'),
			text('notes'),
			timestamp('verifiedAt'),
			text('verifiedById'),
			integer('artistId'),
			integer('resourceId'),
			integer('institutionId'),
		],
		serial: true,
	},
	{
		table: 'Confession',
		columns: [
			integer('id'),
			text('confession'),
			integer('likeCount'),
			text('musicExp'),
			text('artExp'),
			text('mood'),
			timestamp('createdAt'),
			timestamp('updatedAt'),
			timestamp('deletedAt'),
			integer('score'),
		],
		serial: true,
	},
	{
		table: 'ConfessionMusic',
		columns: [integer('id'), integer('confessionId'), integer('musicId')],
		serial: true,
	},
	{
		table: 'ConfessionArt',
		columns: [integer('id'), integer('confessionId'), integer('artId')],
		serial: true,
	},
	{
		table: 'Comment',
		columns: [
			integer('id'),
			integer('confessionId'),
			text('text'),
			timestamp('createdAt'),
			timestamp('updatedAt'),
			timestamp('deletedAt'),
		],
		serial: true,
	},
	{
		table: 'PdfDownload',
		columns: [
			integer('id'),
			text('fileName'),
			text('ipAddress'),
			text('userAgent'),
			text('country'),
			timestamp('createdAt'),
			timestamp('updatedAt'),
		],
		serial: true,
	},
	{
		table: 'SearchSubmission',
		columns: [text('id'), timestamp('createdAt'), text('query')],
	},
]

function transformedValue(column, row) {
	const value = column.source === null ? null : row[column.source]
	if (column.transform) return column.transform(value, row)
	if (column.type === 'text') return asText(value)
	return value
}

async function insertBatch(client, configuration, rows) {
	const columns = configuration.columns
	const parameters = columns.map((column) =>
		rows.map((row) => transformedValue(column, row)),
	)
	const casts = columns
		.map((column, index) => `$${index + 1}::${column.type}[]`)
		.join(', ')
	await client.query(
		`INSERT INTO ${quoteIdentifier(configuration.table)}
		 (${columns.map((column) => quoteIdentifier(column.target)).join(', ')})
		 SELECT * FROM unnest(${casts})`,
		parameters,
	)
}

async function insertTable(client, configuration) {
	const total = sourceCount(configuration.table, configuration.where)
	const batchSize = configuration.batchSize ?? 2_000
	const source = sqlite
		.prepare(
			`SELECT * FROM ${quoteIdentifier(configuration.table)} ${configuration.where ?? ''}`,
		)
		.iterate()
	let batch = []
	let inserted = 0
	for (const row of source) {
		batch.push(row)
		if (batch.length < batchSize) continue
		await insertBatch(client, configuration, batch)
		inserted += batch.length
		batch = []
		if (total >= 100_000)
			console.log(`${configuration.table}: ${inserted}/${total}`)
	}
	if (batch.length) {
		await insertBatch(client, configuration, batch)
		inserted += batch.length
	}
	console.log(`${configuration.table}: imported ${inserted}`)
}

async function runPrismaMigration(password) {
	const databaseUrl = new URL(
		`postgresql://${RDS_HOST}:${RDS_PORT}/${RDS_DATABASE}`,
	)
	databaseUrl.username = RDS_USER
	databaseUrl.password = password
	databaseUrl.searchParams.set('schema', 'public')
	databaseUrl.searchParams.set('sslmode', 'verify-full')
	databaseUrl.searchParams.set('sslrootcert', RDS_CA_PATH)
	await new Promise((resolvePromise, rejectPromise) => {
		const child = spawn('npx', ['prisma', 'migrate', 'deploy'], {
			cwd: process.cwd(),
			env: { ...process.env, DATABASE_URL: databaseUrl.toString() },
			stdio: 'inherit',
		})
		child.once('error', rejectPromise)
		child.once('exit', (code, signal) => {
			if (code === 0) return resolvePromise()
			rejectPromise(
				new Error(
					`Prisma migration failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}`,
				),
			)
		})
	})
}

async function promptForDatabase() {
	const answers = await prompts(
		[
			{
				type: 'password',
				name: 'password',
				message: `Saved RDS password for ${RDS_USER}`,
				validate: (value) => Boolean(value) || 'Password is required',
			},
			{
				type: 'text',
				name: 'confirmation',
				message:
					'Type MIGRATE PRODUCTION to replace target RDS application rows',
				validate: (value) =>
					value === 'MIGRATE PRODUCTION' || 'Exact confirmation is required',
			},
		],
		{ onCancel: () => fail('Cancelled without making database changes.') },
	)
	if (!answers.password || answers.confirmation !== 'MIGRATE PRODUCTION') {
		fail('Database credentials and exact confirmation are required.')
	}
	return answers.password
}

async function connectToRds(password, applicationName) {
	const ca = await readFile(RDS_CA_PATH, 'utf8')
	const client = new Client({
		host: RDS_HOST,
		port: RDS_PORT,
		database: RDS_DATABASE,
		user: RDS_USER,
		password,
		ssl: { ca, rejectUnauthorized: true },
		connectionTimeoutMillis: 15_000,
		application_name: applicationName,
	})
	await client.connect()
	await client.query("SET TIME ZONE 'UTC'")
	return client
}

async function migrateDatabase() {
	if (!apply) {
		console.log('Database migration is read-only without --apply.')
		return
	}
	const password = await promptForDatabase()
	await runPrismaMigration(password)
	const client = await connectToRds(password, 'candidgarden-data-migration')
	const tables = [...tableConfigurations.map(({ table }) => table), 'Passkey']
	try {
		await client.query('BEGIN')
		await client.query(
			`TRUNCATE ${[...new Set(tables)]
				.map(quoteIdentifier)
				.join(', ')} RESTART IDENTITY CASCADE`,
		)
		for (const configuration of tableConfigurations) {
			await insertTable(client, configuration)
		}
		for (const { table, serial } of tableConfigurations.filter(
			(configuration) => configuration.serial,
		)) {
			await client.query(
				`SELECT setval(
					pg_get_serial_sequence($1, 'id'),
					COALESCE((SELECT MAX("id") FROM ${quoteIdentifier(table)}), 1),
					EXISTS (SELECT 1 FROM ${quoteIdentifier(table)})
				)`,
				[`"${table}"`],
			)
		}
		await client.query('COMMIT')
		console.log('Database migration committed successfully.')
		if (replacedNullCharacters) {
			console.warn(
				`Replaced NUL characters in ${replacedNullCharacters} PostgreSQL text value(s).`,
			)
		}
	} catch (error) {
		await client.query('ROLLBACK').catch(() => {})
		throw error
	} finally {
		await client.end().catch(() => {})
	}
	await verifyDatabase(password)
}

async function verifyDatabase(existingPassword) {
	let password = existingPassword
	if (!password) {
		const answer = await prompts(
			{
				type: 'password',
				name: 'password',
				message: `Saved RDS password for ${RDS_USER}`,
				validate: (value) => Boolean(value) || 'Password is required',
			},
			{ onCancel: () => fail('Verification cancelled.') },
		)
		password = answer.password
	}
	const client = await connectToRds(password, 'candidgarden-data-verification')
	try {
		for (const configuration of tableConfigurations) {
			const source = sourceCount(configuration.table, configuration.where)
			const target = Number(
				(
					await client.query(
						`SELECT COUNT(*)::bigint AS count FROM ${quoteIdentifier(configuration.table)}`,
					)
				).rows[0].count,
			)
			if (source !== target) {
				throw new Error(
					`${configuration.table} count mismatch: SQLite ${source}, PostgreSQL ${target}`,
				)
			}
		}
		const imageBlobColumns = await client.query(
			`SELECT table_name, column_name
			 FROM information_schema.columns
			 WHERE table_schema = 'public'
			   AND table_name = 'UserImage'
			   AND (column_name = 'blob' OR data_type = 'bytea')`,
		)
		if (imageBlobColumns.rowCount) {
			throw new Error('An image BLOB/bytea column exists in PostgreSQL')
		}
		const missingArtworkKeys = await client.query(
			`SELECT "path" FROM "Resource"
			 WHERE "path" IS NOT NULL AND btrim("path") <> '' AND "objectKey" IS NULL`,
		)
		const actualMissingPaths = new Set(
			missingArtworkKeys.rows.map(({ path }) => path),
		)
		const unexpectedMissing = [...actualMissingPaths].filter(
			(path) => !skippedImagePaths.has(path),
		)
		const expectedButPresent = [...skippedImagePaths].filter(
			(path) => !actualMissingPaths.has(path),
		)
		if (unexpectedMissing.length || expectedButPresent.length) {
			throw new Error(
				`Artwork skip mismatch: ${unexpectedMissing.length} unexpected missing and ${expectedButPresent.length} approved skips with object keys`,
			)
		}
		console.log(
			`Verified ${tableConfigurations.length} table counts, artwork object keys (${actualMissingPaths.size} approved omission(s)), and zero PostgreSQL image BLOB columns.`,
		)
	} finally {
		await client.end().catch(() => {})
	}
}

function printInventory() {
	const inventoryTables = tableConfigurations.map(({ table }) => table)
	for (const table of inventoryTables) {
		const configuration = tableConfigurations.find(
			(candidate) => candidate.table === table,
		)
		console.log(`${table}: ${sourceCount(table, configuration?.where)}`)
	}
	const resources = sqlite
		.prepare(
			`SELECT COUNT(*) AS count FROM "Resource"
			 WHERE path IS NOT NULL AND trim(path) != ''`,
		)
		.get().count
	const blobBytes = sqlite
		.prepare(`SELECT COALESCE(SUM(length(blob)), 0) AS bytes FROM "UserImage"`)
		.get().bytes
	console.log(`Artwork objects to migrate: ${resources}`)
	console.log(
		`Artwork objects intentionally omitted: ${skippedImagePaths.size}`,
	)
	console.log(`Legacy image BLOB bytes to extract: ${blobBytes}`)
}

try {
	if (phase === 'inventory') printInventory()
	if (phase === 'images' || phase === 'all') await migrateImages()
	if (phase === 'database' || phase === 'all') await migrateDatabase()
	if (phase === 'verify') await verifyDatabase()
} finally {
	sqlite.close()
}
