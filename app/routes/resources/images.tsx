import { invariantResponse } from '@epic-web/invariant'
import { getSignedGetUrl } from '#app/utils/storage.server.ts'
import { type Route } from './+types/images'

// Cloudflare bills image transformations per *unique* combination of parameters,
// not per request, and repeats within a month are free. An endpoint that accepts
// any dimension therefore lets a crawler mint unlimited billable transformations
// just by walking `w`, which is how the free monthly allowance gets burned in a
// day. Only the sizes this app actually asks for are served; anything else is a
// 400 that never reaches the transformation.
//
// `Img` from openimg builds each srcset from the default breakpoints filtered to
// `bp <= width`, plus the intrinsic width itself — there are no 2x densities. So
// this set is the union of those breakpoints and the `width`/`height` props used
// across the app. Adding an <Img> at a new size means adding that size here.
const ALLOWED_DIMENSIONS = new Set([112, 192, 256, 640, 768, 1024, 1200])

function getDimension(searchParams: URLSearchParams, name: 'w' | 'h') {
	const value = searchParams.get(name)
	if (value === null) return undefined

	const dimension = Number(value)
	invariantResponse(
		ALLOWED_DIMENSIONS.has(dimension),
		`${name} must be one of ${[...ALLOWED_DIMENSIONS].join(', ')}`,
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

	// Validated up front so a request for a disallowed size costs nothing: no
	// cache probe, no URL signing, no upstream fetch.
	const image: RequestInitCfPropertiesImage = {
		width: getDimension(searchParams, 'w'),
		height: getDimension(searchParams, 'h'),
		fit: getFit(searchParams),
		format: getFormat(searchParams),
		metadata: 'none',
	}

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
