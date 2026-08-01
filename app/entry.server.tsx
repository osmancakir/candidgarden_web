import { contentSecurity } from '@nichtsam/helmet/content'
import { captureException } from '@sentry/core'
import { isbot } from 'isbot'
import { renderToReadableStream } from 'react-dom/server'
import {
	ServerRouter,
	type LoaderFunctionArgs,
	type ActionFunctionArgs,
	type HandleDocumentRequestFunction,
} from 'react-router'
import { getEnv, init } from './utils/env.server.ts'
import { NonceProvider } from './utils/nonce-provider.ts'
import { isExpectedReactRouterErrorMessage } from './utils/sentry-event-filters.ts'
import { makeTimings } from './utils/timing.server.ts'

export const streamTimeout = 5000

init()
global.ENV = getEnv()

const MODE = process.env.NODE_ENV ?? 'development'

type DocRequestArgs = Parameters<HandleDocumentRequestFunction>

export default async function handleRequest(...args: DocRequestArgs) {
	const [request, responseStatusCode, responseHeaders, reactRouterContext] =
		args
	let didError = false
	const nonce = crypto.randomUUID()
	const timings = makeTimings('render', 'renderToReadableStream')
	const body = await renderToReadableStream(
		<NonceProvider value={nonce}>
			<ServerRouter
				nonce={nonce}
				context={reactRouterContext}
				url={request.url}
			/>
		</NonceProvider>,
		{
			nonce,
			signal: AbortSignal.timeout(streamTimeout + 5000),
			onError(error: unknown) {
				didError = true
				console.error(error)
				captureException(error)
			},
		},
	)

	if (isbot(request.headers.get('user-agent'))) {
		await body.allReady
	}

	responseHeaders.set('Content-Type', 'text/html')
	responseHeaders.append('Server-Timing', timings.toString())
	contentSecurity(responseHeaders, {
		crossOriginEmbedderPolicy: false,
		contentSecurityPolicy: {
			// NOTE: Remove reportOnly when you're ready to enforce this CSP
			reportOnly: true,
			directives: {
				fetch: {
					'connect-src': [
						MODE === 'development' ? 'ws:' : undefined,
						process.env.SENTRY_DSN ? '*.sentry.io' : undefined,
						"'self'",
					],
					'font-src': ["'self'"],
					'frame-src': ["'self'"],
					'img-src': ["'self'", 'data:'],
					'script-src': ["'strict-dynamic'", "'self'", `'nonce-${nonce}'`],
					'script-src-attr': [`'nonce-${nonce}'`],
				},
			},
		},
	})

	return new Response(body, {
		headers: responseHeaders,
		status: didError ? 500 : responseStatusCode,
	})
}

export async function handleDataRequest(response: Response) {
	return response
}

export function handleError(
	error: unknown,
	{ request }: LoaderFunctionArgs | ActionFunctionArgs,
): void {
	// Skip capturing if the request is aborted as Remix docs suggest
	// Ref: https://remix.run/docs/en/main/file-conventions/entry.server#handleerror
	if (request.signal.aborted) {
		return
	}

	// Expected React Router responses to unsupported methods / missing handlers
	// (common from bots and scanners on the public demo). Don't alert.
	if (
		error instanceof Error &&
		isExpectedReactRouterErrorMessage(error.message)
	) {
		return
	}

	if (error instanceof Error) {
		console.error(error.stack)
	} else {
		console.error(error)
	}

	captureException(error)
}
