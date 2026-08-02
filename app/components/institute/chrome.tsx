import { Link, NavLink } from 'react-router'
import { DATASET } from '#app/utils/archive.ts'
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
					Institute for Art Re-Search
				</Data>
			) : null}
		</Link>
	)
}

const NAV = [
	{ to: '/archive', label: 'Index' },
	{ to: '/essays', label: 'Essays' },
	{ to: '/glossary', label: 'Glossary' },
	{ to: '/about', label: 'About' },
] as const

/**
 * §5's wireframe: a mono nav rail, not a hamburger. It wraps rather than
 * collapsing, because a four-item institutional menu has no business hiding.
 */
export function InstituteNav({ className }: { className?: string }) {
	return (
		<nav
			aria-label="Sections"
			className={cn('flex flex-wrap gap-x-6 gap-y-2', className)}
		>
			{NAV.map(({ to, label }) => (
				<NavLink
					key={to}
					to={to}
					prefetch="intent"
					className={({ isActive }) =>
						cn(
							'font-data text-data-sm tracking-[0.12em] uppercase no-underline transition-colors',
							isActive
								? 'text-link underline underline-offset-4'
								: 'text-ground-fg hover:text-link hover:underline hover:underline-offset-4',
						)
					}
				>
					{label}
				</NavLink>
			))}
		</nav>
	)
}

/**
 * §8: "A visible humans.txt-style colophon credits dataset, models, typefaces,
 * and advisors." It sits in the footer of every page, on the void ground, in
 * the machine voice — the archive accounting for itself.
 */
export function Colophon({ className }: { className?: string }) {
	const entries: Array<[string, React.ReactNode]> = [
		['Dataset', `${DATASET} · 54,497 artworks`],
		['Method', 'Panofsky I–III'],
		['Tags', '513,159'],
		['Human Tags', '295,343'],
		['AI Tags', '226,947'],
		['Taggings', '5,805,481'],
	]
	return (
		<footer className={cn('register-void px-5 py-12 md:px-8', className)}>
			<div className="container">
				<div className="border-rule flex flex-wrap items-start justify-between gap-8 border-b pb-8">
					<Wordmark />
					<InstituteNav className="gap-x-8" />
				</div>

				<dl className="mt-8 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
					{entries.map(([term, value]) => (
						<div key={term} className="flex flex-wrap items-baseline gap-2">
							<Data className="text-ground-muted w-24 shrink-0">{term}</Data>
							<Data className="normal-case">{value}</Data>
						</div>
					))}
				</dl>

				<p className="font-body text-prose-sm measure text-ground-muted mt-8">
					Candid Garden publishes machine-generated iconographic metadata,
					presented for scholarly correction. Readings are provisional. We
					invite dispute.
				</p>

				<div className="border-rule mt-8 flex flex-wrap items-center justify-between gap-4 border-t pt-6">
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

              INSTITUTE FOR ART RE-SEARCH
`}
			</pre>
			<p style={{ fontFamily: 'monospace', fontSize: '12px' }}>
				Iconology is for reading, not printing.
			</p>
		</div>
	)
}
