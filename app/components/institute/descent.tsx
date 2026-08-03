import { cn } from '#app/utils/misc.tsx'
import { Data, Display } from './primitives.tsx'

/* ==========================================================================
   §2 The Panofsky Descent — the one element the site should be remembered by.

   Three stacked sections whose ground darkens as interpretive depth increases.
   The transition is CSS-only (see `.register-level-*` in app/styles/tailwind.css);
   there is no scroll-jacking and no JS, per §2, and `prefers-reduced-motion`
   collapses the transition to a hard cut.

   Because the app keeps a light/dark toggle, the descent is defined *relative to
   the resting ground*: it always travels the full distance away from wherever
   the reader started. Light rests on paper and descends to void; dark rests on
   void and descends to paper. Level II is slate either way — the hinge.
   ========================================================================== */

export const PANOFSKY = {
	1: {
		numeral: 'I',
		name: 'Pre-iconographic',
		gloss: 'Description',
		/** What this level is, in the interface's own deadpan voice. */
		blurb:
			'Factual description: formal elements and machine-detected motifs. This is inventory.',
	},
	2: {
		numeral: 'II',
		name: 'Iconographic',
		gloss: 'Identification',
		blurb:
			'Subjects, allegories and conventional meanings. This is a catalogue entry.',
	},
	3: {
		numeral: 'III',
		name: 'Iconological',
		gloss: 'Interpretation',
		blurb:
			'Intrinsic meaning, cultural context, and the limits of the reading. This is interpretation.',
	},
} as const

export type PanofskyLevel = keyof typeof PANOFSKY

/**
 * One stage of the descent. Renders a full-bleed section carrying its own
 * register, headed by the level marker and the record's archival stamp — the
 * wireframe in §5, exactly.
 */
export function Level({
	level,
	stamp,
	children,
	className,
	id,
}: {
	level: PanofskyLevel
	/** The archival date/model stamp shown opposite the level marker. */
	stamp?: React.ReactNode
	children: React.ReactNode
	className?: string
	id?: string
}) {
	const meta = PANOFSKY[level]
	return (
		<section
			id={id ?? `level-${level}`}
			aria-labelledby={`level-${level}-heading`}
			className={cn(
				`register-level-${level}`,
				'scroll-mt-16 px-5 py-16 md:px-8 md:py-24',
				// Level III is the exhibition: it gets the most air (§2).
				level === 3 && 'py-24 md:py-40',
				className,
			)}
		>
			<div className="container">
				<div className="border-rule mb-10 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 border-b pb-3">
					<h2
						id={`level-${level}-heading`}
						className="flex items-baseline gap-3"
					>
						<Data className="text-ground-muted">Level {meta.numeral}</Data>
						<Data className="tracking-[0.2em]">{meta.name}</Data>
					</h2>
					{stamp ? <div className="ml-auto">{stamp}</div> : null}
				</div>
				{children}
			</div>
		</section>
	)
}

/**
 * The Level III title treatment: monumental caps on the deep ground. §4 permits
 * — invites — titles to break mid-word, as Anthology's headlines do, so this
 * sets `hyphens: auto` and lets long titles fracture rather than shrink.
 */
export function MonumentalTitle({
	children,
	className,
}: {
	children: React.ReactNode
	className?: string
}) {
	return (
		<Display
			as="h3"
			size="display"
			className={cn('break-words hyphens-auto', className)}
		>
			{children}
		</Display>
	)
}

/**
 * The legend that lets a reader browse the index "at" a level (§2). Rendered as
 * three links that set `?level=`, so the mode survives in the URL and works
 * without JS.
 *
 * `atlasHref` appends a fourth chip, and it carries no numeral. Panofsky wrote
 * three levels and the latent space is not a fourth one — it is where the three
 * readings are held, not a step below them — so the chip names itself and lets
 * the sequence stop at III. On small screens the three collapse to their
 * numerals and this one collapses to `LS`, which is the same collapse (a mark
 * standing for a name) rather than a number continuing a count.
 *
 * It is also a link out of the index rather than another view of it: no
 * register, no records, no `?level=`. Admitting it to `PANOFSKY` would oblige
 * every consumer of `PanofskyLevel` to handle a level that renders nothing.
 */
export function LevelLegend({
	current,
	hrefFor,
	atlasHref,
	className,
}: {
	current: PanofskyLevel
	hrefFor: (level: PanofskyLevel) => string
	atlasHref?: string
	className?: string
}) {
	const chip =
		'font-data text-data-sm flex items-baseline gap-2 border px-3 py-2 tracking-[0.12em] uppercase no-underline transition-colors'
	const resting =
		'border-rule text-ground-muted hover:border-link hover:text-link'

	return (
		<nav aria-label="Browse level" className={cn('flex flex-wrap', className)}>
			{([1, 2, 3] as const).map((level) => {
				const meta = PANOFSKY[level]
				const isCurrent = level === current
				return (
					<a
						key={level}
						href={hrefFor(level)}
						aria-current={isCurrent ? 'true' : undefined}
						className={cn(
							chip,
							'-ml-px',
							isCurrent ? 'border-ground-fg bg-ground-fg text-ground' : resting,
						)}
					>
						<span>{meta.numeral}</span>
						<span className="hidden sm:inline">{meta.gloss}</span>
					</a>
				)
			})}
			{atlasHref ? (
				<a
					href={atlasHref}
					className={cn(chip, resting, 'ml-3')}
					title="The atlas — every Level II and III reading as the space the model holds them in"
				>
					<span className="sm:hidden">LS</span>
					<span className="hidden sm:inline">Latent space</span>
				</a>
			) : null}
		</nav>
	)
}
