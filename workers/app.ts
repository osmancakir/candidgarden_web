import { createRequestHandler, type ServerBuild } from 'react-router'
import { runWithCloudflare } from '#app/utils/cloudflare.server.ts'
import { createPrismaClient, runWithPrisma } from '#app/utils/db.server.ts'
import {
	getRateLimitTier,
	type RateLimitTier,
} from '#app/utils/rate-limit.server.ts'
import { withSecurityHeaders } from '#app/utils/security-headers.server.ts'

declare module 'react-router' {
	interface AppLoadContext {
		serverBuild: ServerBuild
		cloudflare?: {
			env: Env
			ctx: ExecutionContext
		}
	}
}

const loadBuild = () => import('virtual:react-router/server-build')
const requestHandler = createRequestHandler(loadBuild, import.meta.env.MODE)

/**
 * Cloudflare rate-limiting bindings, one per tier. Keeping the limits in the
 * Worker rather than in dashboard WAF rules means they are versioned with the
 * code and apply to preview deployments too.
 */
function getRateLimiter(env: Env, tier: RateLimitTier) {
	switch (tier) {
		case 'strongest':
			return env.STRONGEST_RATE_LIMIT
		case 'strong':
			return env.STRONG_RATE_LIMIT
		case 'general':
			return env.GENERAL_RATE_LIMIT
	}
}

async function checkRateLimit(request: Request, env: Env) {
	const url = new URL(request.url)
	const tier = getRateLimitTier(request.method, url.pathname)
	const limiter = getRateLimiter(env, tier)
	if (!limiter) return null

	// Cloudflare sets `CF-Connecting-IP` itself and strips any client-supplied
	// value, so unlike `X-Forwarded-For` it cannot be spoofed.
	const key = `${tier}:${request.headers.get('cf-connecting-ip') ?? 'unknown'}`
	const { success } = await limiter.limit({ key })
	if (success) return null

	return new Response('Too many requests', {
		status: 429,
		headers: { 'Retry-After': '60' },
	})
}

function closePrismaAfterResponse(
	response: Response,
	client: ReturnType<typeof createPrismaClient>,
	ctx: ExecutionContext,
) {
	const disconnect = () =>
		client.$disconnect().catch((error: unknown) => {
			console.error('Failed to disconnect Prisma from Hyperdrive', error)
		})

	if (!response.body) {
		ctx.waitUntil(disconnect())
		return response
	}

	const stream = new TransformStream<Uint8Array, Uint8Array>()
	ctx.waitUntil(
		response.body
			.pipeTo(stream.writable)
			.catch((error: unknown) => {
				console.error('Failed to stream the Worker response', error)
			})
			.finally(disconnect),
	)

	return new Response(stream.readable, {
		headers: response.headers,
		status: response.status,
		statusText: response.statusText,
	})
}

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url)
		if (
			(request.method === 'GET' || request.method === 'HEAD') &&
			url.pathname.length > 1 &&
			url.pathname.endsWith('/')
		) {
			url.pathname = url.pathname.replace(/\/+$/, '')
			return Response.redirect(url, 302)
		}

		// Rate limit before opening a Hyperdrive client so a flood cannot exhaust
		// the connection pool.
		const rateLimited = await checkRateLimit(request, env)
		if (rateLimited) return withSecurityHeaders(rateLimited)

		const client = createPrismaClient(env.HYPERDRIVE.connectionString)
		return runWithCloudflare({ env, ctx }, () =>
			runWithPrisma(client, async () => {
				const serverBuild = await loadBuild()
				const response = await requestHandler(request, {
					serverBuild,
					cloudflare: { env, ctx },
				})
				return closePrismaAfterResponse(
					withSecurityHeaders(response),
					client,
					ctx,
				)
			}),
		)
	},
} satisfies ExportedHandler<Env>
