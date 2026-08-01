import { invariantResponse } from '@epic-web/invariant'
import { getSignedGetUrl } from '#app/utils/storage.server.ts'
import { type Route } from './+types/images'

const MAX_IMAGE_DIMENSION = 4096

function getDimension(searchParams: URLSearchParams, name: 'w' | 'h') {
	const value = searchParams.get(name)
	if (value === null) return undefined

	const dimension = Number(value)
	invariantResponse(
		Number.isInteger(dimension) &&
			dimension > 0 &&
			dimension <= MAX_IMAGE_DIMENSION,
		`${name} must be an integer between 1 and ${MAX_IMAGE_DIMENSION}`,
		{ status: 400 },
	)
	return dimension
}

function getFit(searchParams: URLSearchParams) {
	const fit = searchParams.get('fit')
	if (fit === null) return undefined
	invariantResponse(fit === 'cover' || fit === 'contain', 'Invalid image fit', {
		status: 400,
	})
	return fit
}

function getFormat(searchParams: URLSearchParams) {
	const format = searchParams.get('format')
	if (format === null) return undefined
	invariantResponse(
		format === 'avif' || format === 'webp',
		'Invalid image format',
		{ status: 400 },
	)
	return format
}

export async function loader({ request, context }: Route.LoaderArgs) {
	const requestUrl = new URL(request.url)
	const { searchParams } = requestUrl
	const cache =
		typeof caches === 'undefined'
			? undefined
			: await caches.open('candidgarden-images')
	const cachedResponse = await cache?.match(request)
	if (cachedResponse) return cachedResponse

	const objectKey = searchParams.get('objectKey')
	const source = objectKey
		? await getSignedGetUrl(objectKey)
		: searchParams.get('src')
	invariantResponse(source, 'objectKey or src query parameter is required', {
		status: 400,
	})

	const sourceUrl = new URL(source, requestUrl)
	if (!objectKey) {
		invariantResponse(
			sourceUrl.origin === requestUrl.origin,
			'External image sources are not allowed',
			{ status: 400 },
		)
		invariantResponse(
			sourceUrl.pathname !== requestUrl.pathname,
			'Nested image optimization is not allowed',
			{ status: 400 },
		)
	}

	const image: RequestInitCfPropertiesImage = {
		width: getDimension(searchParams, 'w'),
		height: getDimension(searchParams, 'h'),
		fit: getFit(searchParams),
		format: getFormat(searchParams),
		metadata: 'none',
	}
	const upstreamResponse = await fetch(sourceUrl, {
		cf: { image },
	})

	if (!upstreamResponse.ok) {
		return new Response(upstreamResponse.body, {
			headers: upstreamResponse.headers,
			status: upstreamResponse.status,
			statusText: upstreamResponse.statusText,
		})
	}

	const headers = new Headers()
	for (const name of ['Content-Length', 'Content-Type', 'ETag']) {
		const value = upstreamResponse.headers.get(name)
		if (value) headers.set(name, value)
	}
	headers.set('Cache-Control', 'public, max-age=31536000, immutable')
	const response = new Response(upstreamResponse.body, { headers })

	if (cache && context.cloudflare) {
		context.cloudflare.ctx.waitUntil(cache.put(request, response.clone()))
	}

	return response
}
