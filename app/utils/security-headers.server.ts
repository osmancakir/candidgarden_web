/**
 * The response headers applied by every runtime.
 *
 * The Content-Security-Policy is not here: it is nonce-based, so it is built
 * per-render in `app/entry.server.tsx` and is already identical in both
 * runtimes. What used to differ was this set — the Node harness got them from
 * `@nichtsam/helmet`, while the Worker hand-rolled a shorter list that was
 * missing HSTS. Both now read from here so they cannot drift again.
 *
 * `Referrer-Policy` is deliberately absent: it breaks the `redirectTo` flow.
 */
export const securityHeaders: Record<string, string> = {
	'Cross-Origin-Opener-Policy': 'same-origin',
	// Browsers ignore HSTS over plain http, so this is inert on localhost.
	'Strict-Transport-Security': `max-age=${365 * 24 * 60 * 60};includeSubDomains`,
	'X-Content-Type-Options': 'nosniff',
	'X-DNS-Prefetch-Control': 'off',
	'X-Frame-Options': 'SAMEORIGIN',
	'X-Permitted-Cross-Domain-Policies': 'none',
}

/**
 * `ALLOW_INDEXING` is read per call rather than at module scope because the
 * Worker populates `process.env` from its bindings after the module graph is
 * evaluated.
 */
export function getSecurityHeaders(): Record<string, string> {
	const headers = { ...securityHeaders }
	if (process.env.ALLOW_INDEXING === 'false') {
		headers['X-Robots-Tag'] = 'noindex, nofollow'
	}
	return headers
}

/** Returns a copy of `response` carrying the shared security headers. */
export function withSecurityHeaders(response: Response) {
	const headers = new Headers(response.headers)
	for (const [name, value] of Object.entries(getSecurityHeaders())) {
		headers.set(name, value)
	}

	return new Response(response.body, {
		headers,
		status: response.status,
		statusText: response.statusText,
	})
}
