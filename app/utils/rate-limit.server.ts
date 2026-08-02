/**
 * Which rate-limit tier a request falls into.
 *
 * Both runtimes classify requests here so the Node harness (express-rate-limit)
 * and the Worker (Cloudflare rate-limiting bindings) can never disagree about
 * which paths are sensitive. Only the enforcement differs.
 */
export type RateLimitTier = 'strongest' | 'strong' | 'general'

/**
 * Paths that accept credentials, tokens, or admin actions. They get the
 * tightest budget.
 */
const STRONG_PATHS = [
	'/login',
	'/signup',
	'/verify',
	'/admin',
	'/onboarding',
	'/reset-password',
	'/settings/profile',
	'/resources/login',
	'/resources/verify',
]

export function getRateLimitTier(
	method: string,
	pathname: string,
): RateLimitTier {
	if (method !== 'GET' && method !== 'HEAD') {
		return STRONG_PATHS.some((path) => pathname.includes(path))
			? 'strongest'
			: 'strong'
	}

	// `/verify` is the exception: it is a GET route that carries a token in the
	// query string, so it needs the strongest tier despite being a read.
	if (pathname.includes('/verify')) return 'strongest'

	return 'general'
}
