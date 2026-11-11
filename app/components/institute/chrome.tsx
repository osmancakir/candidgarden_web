import { Link, NavLink } from 'react-router'
import { cn } from '#app/utils/misc.tsx'
import { Data } from './primitives.tsx'

/* ==========================================================================
   Front-of-house chrome. The Institute register: paper-coloured, tabular,
   deadpan, bureaucratic — a masthead rather than a marketing header (§1, §5).
   ========================================================================== */

/**
 * The wordmark. Display caps, with the accent carried by a single ultramarine
 * mark — §3 warns that using ultramarine everywhere turns it into a tech brand,
 * so the logo spends it once and nothing else on the page does.
 */
export function Wordmark({
	className,
	withSubtitle = true,
}: {
	className?: string
	withSubtitle?: boolean
}) {
	return (
		<Link to="/" className={cn('group block no-underline', className)}>
			<span className="font-display text-ground-fg block text-[1.375rem] leading-none tracking-tight uppercase">
				Candid
				<span className="text-link">·</span>
				Garden
			</span>
			{withSubtitle ? (
				<Data className="text-ground-muted mt-1 block">
					Research &amp; Software · Munich
				</Data>
			) : null}
		</Link>
	)
}

type NavItem = { to: string; label: string }

/**
 * The company's sections. Two of them are places on the homepage rather than
 * pages, so they are plain hash links: a `NavLink` matches on the pathname
 * alone and would mark every one of them active at once on `/`.
 */
const NAV: ReadonlyArray<NavItem> = [
	{ to: '/#services', label: 'Services' },
	{ to: '/archive', label: 'Archive' },
	{ to: '/#contact', label: 'Contact' },
]

/** The footer carries the archive's written matter as well. */
const FOOTER_NAV: ReadonlyArray<NavItem> = [
	...NAV,
	{ to: '/essays', label: 'Essays' },
	{ to: '/glossary', label: 'Glossary' },
	{ to: '/about', label: 'Charter' },
]

const navItemClass =
	'font-data text-data-sm tracking-[0.12em] uppercase no-underline transition-colors'

/**
 * §5's wireframe: a mono nav rail, not a hamburger. It wraps rather than
 * collapsing, because a short institutional menu has no business hiding.
 */
export function InstituteNav({
	className,
	items = NAV,
}: {
	className?: string
	items?: ReadonlyArray<NavItem>
}) {
	return (
		<nav
			aria-label="Sections"
			className={cn('flex flex-wrap gap-x-6 gap-y-2', className)}
		>
			{items.map(({ to, label }) =>
				to.includes('#') ? (
					<Link
						key={to}
						to={to}
						className={cn(
							navItemClass,
							'text-ground-fg hover:text-link hover:underline hover:underline-offset-4',
						)}
					>
						{label}
					</Link>
				) : (
					<NavLink
						key={to}
						to={to}
						prefetch="intent"
						className={({ isActive }) =>
							cn(
								navItemClass,
								isActive
									? 'text-link underline underline-offset-4'
									: 'text-ground-fg hover:text-link hover:underline hover:underline-offset-4',
							)
						}
					>
						{label}
					</NavLink>
				),
			)}
		</nav>
	)
}

/**
 * The footer of every page: wordmark, navigation, legal links. It used to carry
 * the archive's colophon (dataset, method, tag counts) as §8 asks; that went
 * when the site became the company's, since the footer now speaks for the
 * studio rather than the archive.
 */
export function Colophon({ className }: { className?: string }) {
	return (
		<footer className={cn('register-void px-5 py-12 md:px-8', className)}>
			<div className="container">
				<div className="border-rule flex flex-wrap items-start justify-between gap-8 border-b pb-8">
					<Wordmark />
					<InstituteNav className="gap-x-8" items={FOOTER_NAV} />
				</div>

				<div className="mt-6 flex flex-wrap items-center justify-between gap-4">
					<Data className="text-ground-muted normal-case">
						© {new Date().getUTCFullYear()} Candid Garden
					</Data>
					<div className="flex flex-wrap gap-x-6 gap-y-2">
						<Link
							to="/privacy"
							className="font-data text-data-sm text-ground-muted hover:text-link tracking-[0.12em] uppercase no-underline hover:underline"
						>
							Privacy
						</Link>
						<Link
							to="/tos"
							className="font-data text-data-sm text-ground-muted hover:text-link tracking-[0.12em] uppercase no-underline hover:underline"
						>
							Terms
						</Link>
						<Link
							to="/support"
							className="font-data text-data-sm text-ground-muted hover:text-link tracking-[0.12em] uppercase no-underline hover:underline"
						>
							Contact
						</Link>
					</div>
				</div>
			</div>
		</footer>
	)
}

/**
 * §8, the print easter egg. Printing any page yields the wordmark in ASCII and
 * a refusal — a direct homage to Net Art Anthology's `NO CARRIER` print sheet.
 * Hidden on screen; `@media print` in tailwind.css hides everything *but* this.
 *
 * The art lives in markup rather than a CSS `content` string so it stays
 * readable — and editable — in source.
 */
export function PrintColophon() {
	return (
		<div className="print-colophon hidden" aria-hidden="true">
			<pre
				style={{ fontFamily: 'monospace', fontSize: '10px', lineHeight: 1.2 }}
			>
				{String.raw`
  ___   _   _  _ ___ ___ ___     ___   _   ___ ___  ___ _  _
 / __| /_\ | \| |   \_ _|   \   / __| /_\ | _ \   \| __| \| |
| (__ / _ \| .' | |) | || |) | | (_ / / _ \|   / |) | _|| .' |
 \___/_/ \_\_|\_|___/___|___/   \___/_/ \_\_|_\___/|___|_|\_|

                RESEARCH & SOFTWARE · MUNICH
`}
			</pre>
			<p style={{ fontFamily: 'monospace', fontSize: '12px' }}>
				Iconology is for reading, not printing.
			</p>
		</div>
	)
}
