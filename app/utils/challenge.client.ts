/**
 * Cloudflare's site-wide Managed Challenge (`docs/bot-mitigation.md`, Rule 0)
 * answers with a plain `403` and an HTML interstitial rather than a status of
 * its own. A document navigation renders that interstitial, the browser solves
 * it invisibly and a `cf_clearance` cookie is issued. A `fetch()` cannot: it
 * receives five kilobytes of Cloudflare HTML where turbo-stream data was
 * expected, React Router throws, and the reader is shown a bare 403.
 *
 * That is what happens to a tab left open longer than the zone's challenge TTL
 * — thirty minutes — when the reader comes back and clicks a link. The
 * re-verification is working correctly; it simply has no way to show itself
 * from inside an XHR. So catch the challenge on its way through and re-issue
 * the same navigation as a document load, which does.
 *
 * The tell is unambiguous and there is no need to sniff the body for it:
 * `403` together with `cf-mitigated: challenge`.
 */

const CHALLENGE_HEADER = 'cf-mitigated'
const CHALLENGE_VALUE = 'challenge'

/**
 * A reload is only ever a reasonable answer a couple of times. If clearance
 * cannot be obtained — third-party cookies refused, a challenge that will not
 * settle — the honest outcome is the error boundary, not a tab that reloads
 * itself forever.
 */
const GUARD_KEY = 'cf-challenge-reload'
const MAX_RELOADS = 2
const GUARD_WINDOW_MS = 60_000

type Guard = { at: number; count: number }

function readGuard(): Guard | null {
	try {
		const raw = sessionStorage.getItem(GUARD_KEY)
		if (!raw) return null
		const parsed: unknown = JSON.parse(raw)
		if (
			typeof parsed === 'object' &&
			parsed !== null &&
			typeof (parsed as Guard).at === 'number' &&
			typeof (parsed as Guard).count === 'number'
		) {
			return parsed as Guard
		}
		return null
	} catch {
		// Safari in private mode throws on sessionStorage rather than returning
		// null. Losing the guard is survivable; throwing here is not.
		return null
	}
}

function writeGuard(guard: Guard) {
	try {
		sessionStorage.setItem(GUARD_KEY, JSON.stringify(guard))
	} catch {
		// see readGuard
	}
}

/** Records this attempt and reports whether it is still within its budget. */
function claimReload(): boolean {
	const now = Date.now()
	const previous = readGuard()
	const withinWindow = previous && now - previous.at < GUARD_WINDOW_MS
	const count = withinWindow ? previous.count + 1 : 1

	if (count > MAX_RELOADS) return false

	writeGuard({ at: now, count })
	return true
}

/**
 * The document address a data request stands for, so the challenge can be
 * solved on the page the reader was actually going to rather than the one they
 * were leaving. React Router's single fetch appends `.data` to the path and
 * names the root route `_root`; `_routes` is its own bookkeeping for
 * fine-grained revalidation and means nothing to a document load.
 */
function documentUrlFor(url: URL): string {
	if (!url.pathname.endsWith('.data')) return window.location.href

	const path =
		url.pathname === '/_root.data'
			? '/'
			: url.pathname.slice(0, -'.data'.length)

	const params = new URLSearchParams(url.search)
	params.delete('_routes')
	const search = params.toString()

	return `${path}${search ? `?${search}` : ''}`
}

function resolveUrl(input: RequestInfo | URL): URL | null {
	try {
		const href =
			typeof input === 'string'
				? input
				: input instanceof URL
					? input.href
					: input.url
		return new URL(href, window.location.href)
	} catch {
		return null
	}
}

function isChallenge(response: Response) {
	return (
		response.status === 403 &&
		response.headers.get(CHALLENGE_HEADER) === CHALLENGE_VALUE
	)
}

/**
 * Wraps `window.fetch` so a challenged request is re-issued as a navigation.
 * Every response is returned untouched, so nothing downstream behaves
 * differently — React Router still throws, and the error boundary still
 * renders for the moment it takes the navigation to commit.
 */
export function init() {
	const originalFetch = window.fetch

	window.fetch = async function fetchThroughChallenge(input, init) {
		const response = await originalFetch(input, init)
		if (!isChallenge(response)) return response

		// A third party's 403 is not ours to answer.
		const url = resolveUrl(input)
		if (!url || url.origin !== window.location.origin) return response

		if (claimReload()) {
			window.location.assign(documentUrlFor(url))
		} else {
			console.warn(
				'[challenge] verification did not settle after %d attempts; showing the error instead',
				MAX_RELOADS,
			)
		}

		return response
	}
}
