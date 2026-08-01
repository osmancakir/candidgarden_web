import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { invariantResponse } from '@epic-web/invariant'
import { lookup as getMimeType } from 'mime-types'
import { http, HttpResponse } from 'msw'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures')
const MOCK_STORAGE_DIR = path.join(FIXTURES_DIR, 'uploaded')
const FIXTURES_IMAGES_DIR = path.join(FIXTURES_DIR, 'images')
const STORAGE_BUCKET = process.env.AWS_S3_BUCKET
const STORAGE_REGION = process.env.AWS_REGION
const STORAGE_ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID
const STORAGE_ORIGIN = `https://${STORAGE_BUCKET}.s3.${STORAGE_REGION}.amazonaws.com`

function validateAuth(request: {
	headers: { get(name: string): string | null }
	url: string
}) {
	const authHeader = request.headers.get('Authorization')
	const credential = new URL(request.url).searchParams.get('X-Amz-Credential')

	return (
		(authHeader?.startsWith('AWS4-HMAC-SHA256') &&
			authHeader.includes(`Credential=${STORAGE_ACCESS_KEY}/`)) ||
		credential?.startsWith(`${STORAGE_ACCESS_KEY}/`)
	)
}

function assertKey(key: unknown): asserts key is Array<string> {
	invariantResponse(
		Array.isArray(key) && key.length && key.every((k) => typeof k === 'string'),
		'Key must contain a directory',
	)
}

export const handlers = [
	http.put(`${STORAGE_ORIGIN}/:key*`, async ({ request, params }) => {
		if (!validateAuth(request)) {
			return new HttpResponse('Unauthorized', { status: 401 })
		}

		const { key } = params
		assertKey(key)

		const filePath = path.join(MOCK_STORAGE_DIR, ...key)
		await fs.mkdir(path.dirname(filePath), { recursive: true })
		await fs.writeFile(filePath, Buffer.from(await request.arrayBuffer()))

		return new HttpResponse(null, {
			status: 200,
			headers: { ETag: '"mock-etag"' },
		})
	}),

	http.get(`${STORAGE_ORIGIN}/:key*`, async ({ request, params }) => {
		if (!validateAuth(request)) {
			return new HttpResponse('Unauthorized', { status: 401 })
		}

		const { key } = params
		assertKey(key)

		const filePath = path.join(MOCK_STORAGE_DIR, ...key)
		try {
			const testFixturesPath = path.join(FIXTURES_IMAGES_DIR, ...key)
			let file: Buffer
			try {
				file = await fs.readFile(testFixturesPath)
			} catch {
				file = await fs.readFile(filePath)
			}

			const contentType =
				getMimeType(key.at(-1) || '') || 'application/octet-stream'
			return new HttpResponse(file, {
				headers: {
					'Content-Type': contentType,
					'Content-Length': file.length.toString(),
					'Cache-Control': 'public, max-age=31536000, immutable',
				},
			})
		} catch {
			return new HttpResponse('Not found', { status: 404 })
		}
	}),
]
