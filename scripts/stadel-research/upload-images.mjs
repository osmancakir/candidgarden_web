/**
 * Put the 40 plates of the Städel pilot sample into the app's S3 bucket, under
 * their own prefix, so /stadel-research can serve them through the existing
 * /resources/images optimiser (signed GET + Cloudflare resizing) exactly as the
 * archive serves its own works.
 *
 * The research repo's masters average 1.7 MB apiece — 70 MB for the sample —
 * which is right for a model to look at and wrong for a browser. Each plate is
 * therefore re-encoded to WebP at 1600 px on the long edge before upload; the
 * optimiser takes it down further per breakpoint. The masters stay in the
 * research repo, which is where the archival copy belongs.
 *
 * Usage:
 *   node scripts/stadel-research/upload-images.mjs [path-to-research-repo]
 *     --dry-run   re-encode and report sizes without uploading
 *     --force     re-upload plates already present in the bucket
 *
 * Requires AWS_* in .env (the same credentials the app uses) and ImageMagick's
 * `magick` on PATH. Run prepare-data.mjs first — the object keys come from
 * app/data/stadel-research/works.json, so the two can never drift.
 */
import 'dotenv/config'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
	HeadObjectCommand,
	PutObjectCommand,
	S3Client,
} from '@aws-sdk/client-s3'

const HERE = dirname(fileURLToPath(import.meta.url))
const APP_ROOT = resolve(HERE, '../..')

const args = process.argv.slice(2)
const flags = new Set(args.filter((a) => a.startsWith('--')))
const positional = args.filter((a) => !a.startsWith('--'))
const DRY_RUN = flags.has('--dry-run')
const FORCE = flags.has('--force')

const RESEARCH_ROOT = resolve(
	positional[0] ?? join(APP_ROOT, '../candidgarden_stadelResearch'),
)
const SOURCE_DIR = join(RESEARCH_ROOT, 'data/images/staedel_resized')
const CACHE_DIR = join(APP_ROOT, 'node_modules/.cache/stadel-research-plates')

const MAX_EDGE = 1600
const QUALITY = 82

const BUCKET = process.env.AWS_S3_BUCKET
const REGION = process.env.AWS_REGION

function fail(message) {
	console.error(`✗ ${message}`)
	process.exit(1)
}

if (!existsSync(SOURCE_DIR)) {
	fail(
		`No plate masters at ${SOURCE_DIR}. Pass the research repo path as the first argument.`,
	)
}
if (!DRY_RUN && (!BUCKET || !REGION)) {
	fail('AWS_S3_BUCKET and AWS_REGION must be set (see .env).')
}
try {
	execFileSync('magick', ['-version'], { stdio: 'ignore' })
} catch {
	fail('ImageMagick is required: brew install imagemagick')
}

const works = JSON.parse(
	readFileSync(join(APP_ROOT, 'app/data/stadel-research/works.json'), 'utf8'),
)

/**
 * The prep script derives an object key per work but not the source filename —
 * that lives in the research repo's export as `ObjektPath`. Re-deriving it here
 * from the object number keeps the two scripts independent of each other's
 * intermediate state.
 */
const goldStandard = JSON.parse(
	readFileSync(
		join(
			RESEARCH_ROOT,
			'experiments/03-staedel-full-export/input/gold-standard.json',
		),
		'utf8',
	),
)
const sourceByObjectNumber = new Map(
	goldStandard.map((r) => [r.Objektnummer, r.ObjektPath]),
)

const s3 =
	DRY_RUN || !BUCKET
		? null
		: new S3Client({
				region: REGION,
				credentials: {
					accessKeyId: process.env.AWS_ACCESS_KEY_ID,
					secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
					sessionToken: process.env.AWS_SESSION_TOKEN,
				},
			})

/**
 * The app's IAM key is scoped to writes and presigned reads — it can PUT but
 * cannot HEAD or LIST. So the "already uploaded?" check is best-effort: when
 * the bucket refuses to answer we re-upload, which is harmless because PUT of
 * the same key with the same bytes is idempotent.
 */
let headDenied = false
async function alreadyInBucket(key) {
	if (!s3 || headDenied) return false
	try {
		await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
		return true
	} catch (error) {
		const status = error?.$metadata?.httpStatusCode
		if (status === 404 || error?.name === 'NotFound') return false
		if (status === 403) {
			headDenied = true
			console.log(
				'· This key cannot HEAD objects; uploading every plate (PUT is idempotent).',
			)
			return false
		}
		throw error
	}
}

mkdirSync(CACHE_DIR, { recursive: true })

let uploaded = 0
let skipped = 0
let sourceBytes = 0
let outputBytes = 0

for (const work of works) {
	const sourceName = sourceByObjectNumber.get(work.objectNumber)
	if (!sourceName) fail(`No ObjektPath recorded for ${work.objectNumber}`)
	const sourcePath = join(SOURCE_DIR, sourceName)
	if (!existsSync(sourcePath)) fail(`Missing plate master: ${sourcePath}`)

	if (!FORCE && (await alreadyInBucket(work.objectKey))) {
		skipped += 1
		console.log(`· ${work.objectKey} already in bucket`)
		continue
	}

	const encodedPath = join(CACHE_DIR, `${work.id}.webp`)
	execFileSync('magick', [
		sourcePath,
		'-auto-orient',
		'-resize',
		`${MAX_EDGE}x${MAX_EDGE}>`,
		'-strip',
		'-quality',
		String(QUALITY),
		`webp:${encodedPath}`,
	])

	sourceBytes += statSync(sourcePath).size
	outputBytes += statSync(encodedPath).size

	if (DRY_RUN) {
		console.log(
			`  ${work.objectKey} ${(statSync(sourcePath).size / 1048576).toFixed(1)} MB → ${(statSync(encodedPath).size / 1024).toFixed(0)} KB (dry run)`,
		)
		continue
	}

	await s3.send(
		new PutObjectCommand({
			Bucket: BUCKET,
			Key: work.objectKey,
			Body: await readFile(encodedPath),
			ContentType: 'image/webp',
			CacheControl: 'public, max-age=31536000, immutable',
			Metadata: {
				'source-experiment': '03-staedel-full-export',
				'object-number': work.objectNumber,
			},
		}),
	)
	uploaded += 1
	console.log(`✓ ${work.objectKey}`)
}

console.log(
	`\n${DRY_RUN ? 'Would upload' : 'Uploaded'} ${DRY_RUN ? works.length - skipped : uploaded} plate(s), skipped ${skipped}.`,
)
if (sourceBytes) {
	console.log(
		`Re-encoded ${(sourceBytes / 1048576).toFixed(1)} MB of masters into ${(outputBytes / 1048576).toFixed(1)} MB of WebP.`,
	)
}
