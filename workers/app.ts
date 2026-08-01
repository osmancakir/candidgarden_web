import { createRequestHandler, type ServerBuild } from 'react-router'
import { createPrismaClient, runWithPrisma } from '#app/utils/db.server.ts'

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

function applySecurityHeaders(response: Response) {
	const headers = new Headers(response.headers)
	headers.set('Cross-Origin-Opener-Policy', 'same-origin')
	headers.set('X-Content-Type-Options', 'nosniff')
	headers.set('X-Frame-Options', 'SAMEORIGIN')
	headers.set('X-DNS-Prefetch-Control', 'off')
	headers.set('X-Permitted-Cross-Domain-Policies', 'none')
	if (process.env.ALLOW_INDEXING === 'false') {
		headers.set('X-Robots-Tag', 'noindex, nofollow')
	}

	return new Response(response.body, {
		headers,
		status: response.status,
		statusText: response.statusText,
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

		const client = createPrismaClient(env.HYPERDRIVE.connectionString)
		return runWithPrisma(client, async () => {
			const serverBuild = await loadBuild()
			const response = await requestHandler(request, {
				serverBuild,
				cloudflare: { env, ctx },
			})
			return closePrismaAfterResponse(
				applySecurityHeaders(response),
				client,
				ctx,
			)
		})
	},
} satisfies ExportedHandler<Env>
