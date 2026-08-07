import { OpenImgContextProvider } from 'openimg/react'
import {
	data,
	Link,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
	useLoaderData,
	useLocation,
} from 'react-router'
import { HoneypotProvider } from 'remix-utils/honeypot/react'
import { type Route } from './+types/root.ts'
import appleTouchIconAssetUrl from './assets/favicons/apple-touch-icon.png'
import faviconAssetUrl from './assets/favicons/favicon.svg'
import { GeneralErrorBoundary } from './components/error-boundary.tsx'
import {
	Colophon,
	InstituteNav,
	PrintColophon,
	Wordmark,
} from './components/institute/chrome.tsx'
import {
	RetrievalOverlay,
	useRetrieval,
} from './components/institute/retrieval.tsx'
import { useToast } from './components/toaster.tsx'
import { Button } from './components/ui/button.tsx'
import { href as iconsHref } from './components/ui/icon.tsx'
import { AppToaster } from './components/ui/sonner.tsx'
import { UserDropdown } from './components/user-dropdown.tsx'
import {
	ThemeSwitch,
	useOptionalTheme,
	useTheme,
} from './routes/resources/theme-switch.tsx'
import tailwindStyleSheetUrl from './styles/tailwind.css?url'
import { getUserId, logout } from './utils/auth.server.ts'
import { ClientHintCheck, getHints } from './utils/client-hints.tsx'
import { prisma } from './utils/db.server.ts'
import { getEnv } from './utils/env.server.ts'
import { pipeHeaders } from './utils/headers.server.ts'
import { getHoneypot } from './utils/honeypot.server.ts'
import { cn, combineHeaders, getDomainUrl, getImgSrc } from './utils/misc.tsx'
import { useNonce } from './utils/nonce-provider.ts'
import { type Theme, getTheme } from './utils/theme.server.ts'
import { makeTimings, time } from './utils/timing.server.ts'
import { getToast } from './utils/toast.server.ts'
import { useOptionalUser } from './utils/user.ts'

export const links: Route.LinksFunction = () => {
	return [
		// Preload svg sprite as a resource to avoid render blocking
		{ rel: 'preload', href: iconsHref, as: 'image' },
		{
			rel: 'icon',
			href: '/favicon.ico',
			sizes: '48x48',
		},
		{ rel: 'icon', type: 'image/svg+xml', href: faviconAssetUrl },
		{ rel: 'apple-touch-icon', href: appleTouchIconAssetUrl },
		{
			rel: 'manifest',
			href: '/site.webmanifest',
			crossOrigin: 'use-credentials',
		} as const, // necessary to make typescript happy
		{ rel: 'stylesheet', href: tailwindStyleSheetUrl },
	].filter(Boolean)
}

export const meta: Route.MetaFunction = ({ data }) => {
	return [
		{
			title: data
				? 'Candid Garden · Institute for Art Re-Search'
				: 'Error | Candid Garden',
		},
		{
			name: 'description',
			content:
				'Machine-generated iconographic metadata for the ARTigo corpus, structured by Panofsky’s three levels of meaning and presented for scholarly correction.',
		},
	]
}

export async function loader({ request }: Route.LoaderArgs) {
	const timings = makeTimings('root loader')
	const userId = await time(() => getUserId(request), {
		timings,
		type: 'getUserId',
		desc: 'getUserId in root',
	})

	const user = userId
		? await time(
				() =>
					prisma.user.findUnique({
						select: {
							id: true,
							name: true,
							username: true,
							image: { select: { objectKey: true } },
							roles: {
								select: {
									name: true,
									permissions: {
										select: { entity: true, action: true, access: true },
									},
								},
							},
						},
						where: { id: userId },
					}),
				{ timings, type: 'find user', desc: 'find user in root' },
			)
		: null
	if (userId && !user) {
		console.info('something weird happened')
		// something weird happened... The user is authenticated but we can't find
		// them in the database. Maybe they were deleted? Let's log them out.
		await logout({ request, redirectTo: '/' })
	}
	const { toast, headers: toastHeaders } = await getToast(request)
	const honeyProps = await getHoneypot().getInputProps()

	return data(
		{
			user,
			requestInfo: {
				hints: getHints(request),
				origin: getDomainUrl(request),
				path: new URL(request.url).pathname,
				userPrefs: {
					theme: getTheme(request),
				},
			},
			ENV: getEnv(),
			toast,
			honeyProps,
		},
		{
			headers: combineHeaders(
				{ 'Server-Timing': timings.toString() },
				toastHeaders,
			),
		},
	)
}

export const headers: Route.HeadersFunction = pipeHeaders

function Document({
	children,
	nonce,
	theme = 'light',
	env = {},
}: {
	children: React.ReactNode
	nonce: string
	theme?: Theme
	env?: Record<string, string | undefined>
}) {
	const allowIndexing = ENV.ALLOW_INDEXING !== 'false'
	return (
		<html lang="en" className={`${theme} h-full overflow-x-hidden`}>
			<head>
				<ClientHintCheck nonce={nonce} />
				<Meta />
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width,initial-scale=1" />
				{allowIndexing ? null : (
					<meta name="robots" content="noindex, nofollow" />
				)}
				<Links />
			</head>
			<body className="bg-background text-foreground">
				{children}
				<script
					nonce={nonce}
					dangerouslySetInnerHTML={{
						__html: `window.ENV = ${JSON.stringify(env)}`,
					}}
				/>
				<ScrollRestoration nonce={nonce} />
				<Scripts nonce={nonce} />
				{/*
				 * Cloudflare Web Analytics. Injected here rather than by Cloudflare's
				 * automatic setup because the CSP in `entry.server.tsx` uses
				 * `strict-dynamic`, which only trusts scripts carrying the request
				 * nonce. The site token is public by design. Only the production
				 * Worker sets `WEB_ANALYTICS_TOKEN`, so staging and local runs send
				 * nothing.
				 */}
				{env?.WEB_ANALYTICS_TOKEN ? (
					<script
						nonce={nonce}
						type="module"
						src="https://static.cloudflareinsights.com/beacon.min.js"
						data-cf-beacon={JSON.stringify({
							token: env.WEB_ANALYTICS_TOKEN,
						})}
					/>
				) : null}
			</body>
		</html>
	)
}

export function Layout({ children }: { children: React.ReactNode }) {
	// if there was an error running the loader, data could be missing
	const data = useLoaderData<typeof loader | null>()
	const nonce = useNonce()
	const theme = useOptionalTheme()
	return (
		<Document nonce={nonce} theme={theme} env={data?.ENV}>
			{children}
		</Document>
	)
}

/**
 * Routes that take the whole viewport, masthead and colophon included.
 *
 * Only the drift qualifies, and it qualifies for a reason rather than for
 * effect: it is the one surface here that is *held* rather than read — a stack
 * of cards under a thumb — and a card whose height depends on the page it sits
 * in is a card that jumps between works. Locking the viewport is what lets the
 * plate keep one height and the verdict buttons stay under the thumb where they
 * were on the last card.
 */
function isFullscreenRoute(pathname: string) {
	return pathname === '/archive/drift/session'
}

function App() {
	const data = useLoaderData<typeof loader>()
	const user = useOptionalUser()
	const theme = useTheme()
	useToast(data.toast)
	const retrieval = useRetrieval()
	const location = useLocation()
	const fullscreen = isFullscreenRoute(location.pathname)

	return (
		<OpenImgContextProvider
			optimizerEndpoint="/resources/images"
			getSrc={getImgSrc}
		>
			{/*
			 * The masthead is the Institute register: hairline-ruled, mono, and the
			 * same on every page (§5). It never becomes a hero.
			 */}
			{/*
			 * While the archive is being consulted the shell is inert: the
			 * interlock covering it is not a scrim you can click through, and a
			 * page that is already leaving should not take another instruction.
			 */}
			<div
				inert={retrieval.pending}
				className={
					fullscreen
						? // 100svh, not 100vh: on a phone the large viewport unit is a
							// promise the browser breaks the moment its own chrome slides in,
							// and the buttons would sit under it.
							'bg-ground text-ground-fg flex h-svh flex-col overflow-hidden overscroll-none'
						: 'bg-ground text-ground-fg flex min-h-screen flex-col'
				}
			>
				<header className={cn('border-rule border-b', fullscreen && 'hidden')}>
					<div className="container flex flex-wrap items-center justify-between gap-x-8 gap-y-4 py-4">
						<Wordmark />
						<InstituteNav className="order-3 w-full md:order-0 md:w-auto" />
						<div className="ml-auto flex items-center gap-4">
							{user ? (
								<UserDropdown />
							) : (
								<Button asChild variant="outline" size="sm">
									<Link to="/login">Log in</Link>
								</Button>
							)}
							<ThemeSwitch userPreference={data.requestInfo.userPrefs.theme} />
						</div>
					</div>
					{/*
					 * No global search strip. §5 gives the archive one search surface —
					 * the filter console on the index — and a second, differently-shaped
					 * box in the masthead would compete with it. The contributor register
					 * carries its own search on /users, where it is about people.
					 */}
				</header>

				<main
					className={
						fullscreen ? 'flex min-h-0 flex-1 flex-col' : 'flex flex-1 flex-col'
					}
				>
					<Outlet />
				</main>

				{fullscreen ? null : <Colophon />}
			</div>
			<AppToaster closeButton position="top-center" theme={theme} />
			<RetrievalOverlay {...retrieval} />
			<PrintColophon />
		</OpenImgContextProvider>
	)
}

function AppWithProviders() {
	const data = useLoaderData<typeof loader>()
	return (
		<HoneypotProvider {...data.honeyProps}>
			<App />
		</HoneypotProvider>
	)
}

export default AppWithProviders

// this is a last resort error boundary. There's not much useful information we
// can offer at this level.
export const ErrorBoundary = GeneralErrorBoundary
