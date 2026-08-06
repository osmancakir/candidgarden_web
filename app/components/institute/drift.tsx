import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import {
	formatLift,
	type MotifLift,
	type PeriodSplit,
	type DriftCard,
	type DriftNote,
	type DriftVerdictValue,
} from '#app/routes/archive/+shared/drift.ts'
import { displayPeriod } from '#app/utils/archive.ts'
import { cn, getWorkImgSrc } from '#app/utils/misc.tsx'
import { Data, Display } from './primitives.tsx'
import { Plate, plateAlt, workHref } from './record.tsx'

/* ==========================================================================
   The drift — the one surface in this archive that records the reader.

   Everything else here is built to show a work and get out of the way. This
   asks for a reaction, which means it has to be quick enough to answer without
   deliberating: the verdict wanted is the one from the first two seconds, and
   an interface that makes someone think about the mechanism gets a considered
   opinion about the interface instead.

   So: one plate at a time, three ways out, and no correct answer anywhere.
   ========================================================================== */

/**
 * The frame the session owns: a fixed screen rather than a document.
 *
 * Root hides the masthead and the colophon for this route and locks the page to
 * `100svh`, so the three bands below divide the viewport and nothing scrolls.
 * The header and the footer are `shrink-0`; the middle is `flex-1 min-h-0`, and
 * every child down the chain repeats `min-h-0` because a flex item's default
 * `min-height: auto` would let a tall plate push the buttons off the bottom of
 * the screen — the failure this layout exists to prevent.
 *
 * `sm:max-h-192` caps the band on tall screens. Without it a desktop viewport
 * stretches one card into a three-foot tower; with it the screen stays
 * top-anchored and the leftover height falls away below. Phones never reach the
 * cap, so the fill-the-screen behaviour there is untouched.
 */
export function DriftShell({
	backTo,
	backLabel,
	title,
	action,
	stats,
	statsLabel,
	children,
}: {
	backTo: string
	backLabel: string
	title: string
	/** Optional link at the top right — the way out of the session. */
	action?: React.ReactNode
	stats: React.ReactNode
	statsLabel: string
	children: React.ReactNode
}) {
	return (
		<div className="flex h-full min-h-0 flex-col overflow-x-clip">
			{/* Header, stats, card and buttons all sit on one measure, so the four
			    bands share a left and a right edge and the screen reads as a single
			    object rather than as a page with a card on it. */}
			<div className="mx-auto w-full max-w-xl shrink-0 px-4 pt-3 sm:px-6 xl:px-8 xl:pt-6">
				<header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 xl:block">
					<Link
						to={backTo}
						className="text-ground-muted hover:text-link font-data text-data-sm inline-flex min-w-0 items-center gap-2 tracking-[0.12em] uppercase no-underline"
					>
						<span aria-hidden>←</span>
						<span className="truncate">{backLabel}</span>
					</Link>
					{action ? <div className="ml-auto shrink-0">{action}</div> : null}
					<Display
						as="h1"
						size="title"
						className="min-w-0 basis-full truncate text-[1.0625rem] leading-tight xl:mt-3 xl:basis-auto xl:text-[1.5rem]"
					>
						{title}
					</Display>
				</header>
				<div
					className="mt-3 grid auto-cols-fr grid-flow-col gap-2 xl:mt-4"
					role="group"
					aria-label={statsLabel}
				>
					{stats}
				</div>
			</div>

			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain sm:max-h-192">
				<div className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col px-4 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] sm:px-6 xl:px-8 xl:pt-5 xl:pb-8">
					{children}
				</div>
			</div>
		</div>
	)
}

/** One figure in the session header — a count, in the machine's voice. */
export function DriftStat({
	label,
	value,
	tone = 'default',
}: {
	label: string
	value: number | string
	tone?: 'default' | 'pull' | 'push'
}) {
	return (
		<span
			title={label}
			className={cn(
				'border-rule font-data text-data-sm inline-flex h-9 w-full min-w-0 items-center justify-center gap-1.5 border px-1.5 tabular-nums',
				tone === 'default' && 'text-ground-muted',
				tone === 'pull' && 'border-link/40 text-link',
				tone === 'push' && 'border-stamp-fg/40 text-stamp-fg',
			)}
		>
			<span className="sr-only">{label}</span>
			<span aria-hidden className="truncate leading-none">
				{value}
			</span>
		</span>
	)
}

/** Pixels a card must travel before release counts as a verdict rather than a fidget. */
const COMMIT_DISTANCE = 96

/** How long the card takes to leave. Kept under the reaction time it replaces. */
const EXIT_MS = 240

const VERDICT_LABEL: Record<DriftVerdictValue, string> = {
	PULL: 'Pull',
	REST: 'Rest',
	PUSH: 'Push',
}

type Exit = { verdict: DriftVerdictValue } | null

export function DriftStack({
	cards,
	onVerdict,
	exhausted = false,
}: {
	/** The stack, top first. Only the first three are rendered. */
	cards: Array<DriftCard>
	onVerdict: (card: DriftCard, verdict: DriftVerdictValue) => void
	exhausted?: boolean
}) {
	const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)
	const [exit, setExit] = useState<Exit>(null)
	const origin = useRef<{ x: number; y: number } | null>(null)
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
	const top = cards[0]

	/**
	 * Which card is showing its back, held as an id rather than a boolean.
	 *
	 * The boolean version has a bug that only appears in use: the reader turns a
	 * card over, gives a verdict, and the next card arrives already reversed —
	 * showing them a paragraph about a picture they have not seen yet. Keying the
	 * state to the card means advancing the stack resets it without an effect.
	 */
	const [flippedId, setFlippedId] = useState<number | null>(null)
	const flipped = Boolean(top && flippedId === top.id)

	useEffect(
		() => () => {
			if (timer.current) clearTimeout(timer.current)
		},
		[],
	)

	const commit = useCallback(
		(verdict: DriftVerdictValue) => {
			// The guard is on `exit`, not on the pointer: a card already on its way
			// out must not take a second verdict from an impatient keyboard.
			if (!top || exit) return
			origin.current = null
			setDrag(null)
			setExit({ verdict })
			timer.current = setTimeout(() => {
				setExit(null)
				onVerdict(top, verdict)
			}, EXIT_MS)
		},
		[top, exit, onVerdict],
	)

	/**
	 * Turning the card over is always deliberate — a button and a key, never a
	 * tap on the plate.
	 *
	 * The stack is built for the verdict of the first two seconds, and a card
	 * that flips when the reader's thumb brushes it turns that reaction into a
	 * reading exercise. It is also guarded on `exit` for the same reason `commit`
	 * is: a card mid-flight has already been decided.
	 */
	const toggleFlip = useCallback(() => {
		if (!top || exit || !top.note) return
		setFlippedId((current) => (current === top.id ? null : top.id))
	}, [top, exit])

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.metaKey || event.ctrlKey || event.altKey) return
			const target = event.target as HTMLElement | null
			if (
				target?.tagName === 'INPUT' ||
				target?.tagName === 'TEXTAREA' ||
				target?.isContentEditable
			) {
				return
			}
			// `f`, because the three arrows are the three verdicts and space belongs
			// to whichever button has focus.
			if (event.key === 'f' || event.key === 'F') {
				event.preventDefault()
				toggleFlip()
				return
			}
			const verdict =
				event.key === 'ArrowRight'
					? 'PULL'
					: event.key === 'ArrowLeft'
						? 'PUSH'
						: event.key === 'ArrowDown'
							? 'REST'
							: null
			if (!verdict) return
			event.preventDefault()
			commit(verdict)
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [commit, toggleFlip])

	function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
		if (exit || event.button !== 0) return
		origin.current = { x: event.clientX, y: event.clientY }
		event.currentTarget.setPointerCapture(event.pointerId)
	}

	function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
		if (!origin.current) return
		setDrag({
			x: event.clientX - origin.current.x,
			y: event.clientY - origin.current.y,
		})
	}

	function onPointerUp() {
		if (!origin.current) return
		origin.current = null
		const current = drag
		setDrag(null)
		if (!current) return
		if (Math.abs(current.x) >= COMMIT_DISTANCE) {
			commit(current.x > 0 ? 'PULL' : 'PUSH')
		} else if (current.y >= COMMIT_DISTANCE) {
			commit('REST')
		}
	}

	// What the drag is currently promising, so the stamp can appear before the
	// reader has committed to anything and they can back out by moving back.
	const promising: DriftVerdictValue | null = drag
		? Math.abs(drag.x) >= COMMIT_DISTANCE
			? drag.x > 0
				? 'PULL'
				: 'PUSH'
			: drag.y >= COMMIT_DISTANCE
				? 'REST'
				: null
		: null

	if (!top) {
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				<div className="border-rule flex min-h-0 flex-1 items-center justify-center border p-8 text-center">
					<Data className="text-ground-muted">
						{exhausted
							? 'The deck is spent — every card has had a verdict'
							: 'Dealing…'}
					</Data>
				</div>
			</div>
		)
	}

	const transform = exit
		? exit.verdict === 'PULL'
			? 'translate3d(140%, -8%, 0) rotate(14deg)'
			: exit.verdict === 'PUSH'
				? 'translate3d(-140%, -8%, 0) rotate(-14deg)'
				: 'translate3d(0, 60%, 0) scale(0.94)'
		: drag
			? `translate3d(${drag.x}px, ${drag.y}px, 0) rotate(${drag.x / 24}deg)`
			: undefined

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{/*
			 * The card is absolutely positioned inside a `flex-1` box, which is the
			 * whole trick: every card is exactly the height the viewport has left
			 * over, so the plate does not resize between a tall altarpiece and a
			 * wide landscape and the buttons never move under the thumb.
			 */}
			<div
				className="relative mx-auto min-h-0 w-full max-w-xl flex-1"
				role="group"
				aria-roledescription="card stack"
				aria-label="Works awaiting a verdict"
			>
				{/* The cards beneath, rendered so their plates are already fetched by
				    the time they surface — and so the stack reads as a stack. */}
				{cards.slice(1, 3).map((card, index) => (
					<div
						key={card.id}
						aria-hidden
						className="border-rule bg-ground pointer-events-none absolute inset-0 overflow-hidden border"
						style={{
							transform: `translate3d(0, ${(index + 1) * 10}px, 0) scale(${1 - (index + 1) * 0.03})`,
							zIndex: 10 - index,
						}}
					>
						<CardFace card={card} />
					</div>
				))}

				<div
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerUp}
					onPointerCancel={onPointerUp}
					className={cn(
						'border-rule-strong bg-ground absolute inset-0 z-20 overflow-hidden border select-none',
						exit
							? 'motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out'
							: drag
								? 'cursor-grabbing'
								: 'cursor-grab motion-safe:transition-transform motion-safe:duration-200',
						exit && 'opacity-0 transition-opacity duration-200',
					)}
					// `pan-y` so a vertical scroll gesture still belongs to the page on
					// a phone, while a horizontal drag belongs to the card. `perspective`
					// is what makes the flip below read as a card turning over rather
					// than a picture squashing flat.
					style={{ transform, touchAction: 'pan-y', perspective: '1400px' }}
				>
					{/*
					 * The turn-over control sits outside the rotating box, so there is
					 * one button rather than a pair — the back's copy would otherwise
					 * stay focusable while facing away, and a reader tabbing through
					 * would land on a control they cannot see. It only exists when the
					 * card has a back worth turning to.
					 */}
					{top.note ? (
						<button
							type="button"
							onClick={toggleFlip}
							// Without this the press that opens the note also starts a drag,
							// and letting go registers as the beginning of a verdict.
							onPointerDown={(event) => event.stopPropagation()}
							disabled={Boolean(exit)}
							aria-pressed={flipped}
							className="border-rule-strong bg-ground/90 text-ground-muted hover:text-link font-data text-data-sm absolute top-2 right-2 z-30 border px-2 py-1 tracking-[0.12em] uppercase backdrop-blur-sm"
						>
							{flipped ? 'Plate' : 'Note'}
						</button>
					) : null}

					<div
						className="absolute inset-0 transform-3d motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out"
						style={{ transform: flipped ? 'rotateY(180deg)' : undefined }}
					>
						<div
							className="absolute inset-0 backface-hidden"
							aria-hidden={flipped}
						>
							<CardFace card={top} promising={promising} />
						</div>
						<div
							className="absolute inset-0 rotate-y-180 backface-hidden"
							aria-hidden={!flipped}
						>
							{top.note ? (
								<CardBack card={top} note={top.note} />
							) : null}
						</div>
					</div>
				</div>
			</div>

			<div className="mt-3 shrink-0 xl:mt-5">
				<VerdictButtons onVerdict={commit} disabled={Boolean(exit)} />
			</div>
		</div>
	)
}

/**
 * The plate and the facts, in the order the archive states them everywhere
 * else — image, title, attribution, period — so that a card is recognisably the
 * same object as a row in the index rather than a new kind of thing.
 *
 * What the card does *not* show is the point: no motifs, no readings, no
 * agreement figures. Those are the archive's opinion of the work, and a reader
 * shown them is being asked whether they agree with the archive.
 */
function CardFace({
	card,
	promising = null,
}: {
	card: DriftCard
	promising?: DriftVerdictValue | null
}) {
	const src = getWorkImgSrc(card.objectKey)
	return (
		<article className="flex h-full min-h-0 flex-col">
			{/*
			 * The plate is contained, never cropped (§5): the box is fixed because
			 * the card is, and the work is letterboxed inside it at its true
			 * proportions. Cropping to fill would make every card the same shape at
			 * the cost of deciding for the reader which part of a painting they are
			 * reacting to.
			 */}
			<div className="bg-tint relative flex min-h-0 flex-1 items-center justify-center p-3">
				{src ? (
					<img
						src={src}
						alt={plateAlt(card)}
						className="h-full w-full object-contain"
					/>
				) : (
					<Data className="text-ground-muted">No image on file</Data>
				)}
				{promising ? (
					<span
						className={cn(
							'font-data text-data absolute top-4 border-2 px-3 py-1 tracking-[0.2em] uppercase',
							promising === 'PULL'
								? 'border-link text-link right-4 rotate-6'
								: promising === 'PUSH'
									? 'border-stamp-fg text-stamp-fg left-4 -rotate-6'
									: 'border-rule-strong text-ground-muted left-1/2 -translate-x-1/2',
						)}
					>
						{VERDICT_LABEL[promising]}
					</span>
				) : null}
			</div>
			{/*
			 * The caption is `shrink-0` and clamped to two lines: a work with a
			 * fifteen-word Dutch title must not be given more of the card than a
			 * work called "Pietà", or the plate above it changes size per artwork
			 * and the whole point of the fixed card is lost.
			 */}
			<div className="border-rule shrink-0 border-t p-3 sm:p-4">
				{/*
				 * Two lines are reserved whether or not the title needs them. `Eine
				 * Kanne` and `Entwurf für den Hochaltar von …` otherwise give the
				 * caption two different heights, and since the plate takes whatever
				 * the caption leaves, the picture would resize between those two
				 * cards even though the card around it did not. `lh` is the line
				 * height the title actually resolves to, so this survives the
				 * responsive type step without a second magic number.
				 */}
				<Display
					as="h2"
					size="title"
					className="line-clamp-2 min-h-[2lh] text-[0.9375rem] leading-tight sm:text-[1.0625rem]"
				>
					{card.title ?? 'Untitled'}
				</Display>
				<p className="font-body text-prose-sm mt-1 line-clamp-1 italic">
					{card.artist ?? 'Unattributed'}
					{', '}
					<span className="not-italic">
						{displayPeriod(card.notBefore, card.notAfter)}
					</span>
				</p>
				<Data className="text-ground-muted mt-1 block truncate">
					{card.institution ?? 'Collection not recorded'}
					{card.origin === 'NEAREST' ? ' · drawn towards you' : null}
				</Data>
			</div>
		</article>
	)
}

/**
 * The back of the card: one thing to notice, and where it came from.
 *
 * The archive's other prose about a work — the two Panofsky readings behind
 * `/archive/atlas` — is deliberately not here. Those readings are what a model
 * thinks a picture *means*, and putting an interpretation on the back of a card
 * whose whole question is "what did this do to you" would answer the question
 * before it was asked. A note earns its place only by pointing at something in
 * the frame that the reader can go back and check.
 *
 * The two blocks are separated because their evidence is: `body` is checkable
 * against the plate the reader just turned away from, `context` is not
 * checkable at all except through the citation printed under it. Merging them
 * into one paragraph would put both in the same voice, which is exactly the
 * failure — a fabricated anecdote and a sourced one read identically, and the
 * rule is the only thing telling the reader which is which.
 */
function CardBack({ card, note }: { card: DriftCard; note: DriftNote }) {
	return (
		<article className="bg-ground flex h-full min-h-0 flex-col">
			<div className="border-rule shrink-0 border-b px-3 pt-3 pb-2 sm:px-4">
				<Data className="text-ground-muted block tracking-[0.12em] uppercase">
					On the back
				</Data>
				<Display
					as="h2"
					size="title"
					className="mt-1 line-clamp-1 text-[0.9375rem] leading-tight sm:text-[1.0625rem]"
				>
					{card.title ?? 'Untitled'}
				</Display>
			</div>

			{/* The only scrolling surface in the session, and it scrolls inside the
			    card rather than moving it: the four bands outside are still fixed. */}
			<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-4">
				<p className="font-body text-prose whitespace-pre-line">{note.body}</p>

				{note.context && note.source ? (
					<div className="border-rule mt-4 border-l-2 pl-3">
						<p className="font-body text-prose-sm">{note.context}</p>
					</div>
				) : null}
			</div>

			{/*
			 * The footer is pinned, and the citation lives in it rather than under
			 * the claim it supports — which is not where it reads most naturally,
			 * and is where it has to be anyway.
			 *
			 * Measured on a 1440×900 viewport: with the citation inside the
			 * scrolling body, a note of ordinary length pushed it 39px past the fold
			 * (`scrollHeight` 500 against `clientHeight` 461), so the last thing
			 * visible was an unattributed biographical assertion and the only thing
			 * qualifying it was the one element a reader had to scroll to find. A
			 * claim of that kind and the reason to believe it have to appear or
			 * vanish together, so both now sit outside the scroll.
			 *
			 * Provenance sits beside it for the same reason (§7): a reader who
			 * cannot tell whether a paragraph was written by a person or drafted by
			 * a model has no way to calibrate it, and for most of this deck the
			 * honest answer is "a model wrote this and nobody has been over it yet".
			 */}
			<div className="border-rule shrink-0 space-y-0.5 border-t px-3 py-2 sm:px-4">
				{/* Wraps rather than truncating: "Royal Collection …" names no source a
				    reader could go and check, which is the one job this line has. */}
				{note.context && note.source ? (
					<Data className="text-ground-muted line-clamp-2 block">
						{'Context: '}
						{note.sourceUrl ? (
							<a
								href={note.sourceUrl}
								target="_blank"
								rel="noreferrer"
								className="hover:text-link"
							>
								{note.source}
							</a>
						) : (
							note.source
						)}
					</Data>
				) : null}
				<Data className="text-ground-muted block">
					{note.origin === 'EDITORIAL'
						? 'Written and checked by a person'
						: 'Machine-drafted · not yet checked by a person'}
				</Data>
			</div>
		</article>
	)
}

/**
 * The three ways out.
 *
 * Rest is a button of the same size as the other two, not a small "skip" beside
 * them. It is a verdict — "this exerted nothing on me" — and the whole drift
 * depends on it being as easy to give as the other two, because a reader who can
 * only record a force will record a force they did not feel.
 */
function VerdictButtons({
	onVerdict,
	disabled,
}: {
	onVerdict: (verdict: DriftVerdictValue) => void
	disabled: boolean
}) {
	const buttons: Array<{
		verdict: DriftVerdictValue
		key: string
		className: string
	}> = [
		{
			verdict: 'PUSH',
			key: '←',
			className: 'border-stamp-fg text-stamp-fg hover:bg-stamp-fg/10',
		},
		{
			verdict: 'REST',
			key: '↓',
			className: 'border-rule-strong text-ground-muted hover:bg-tint',
		},
		{
			verdict: 'PULL',
			key: '→',
			className: 'border-link text-link hover:bg-link/10',
		},
	]

	return (
		<div className="mx-auto grid w-full max-w-xl grid-cols-3 gap-2 sm:gap-3">
			{buttons.map(({ verdict, key, className }) => (
				<button
					key={verdict}
					type="button"
					disabled={disabled}
					onClick={() => onVerdict(verdict)}
					// A fixed 3rem row, the same on every card and every breakpoint.
					// The buttons are the one part of this screen a thumb aims at
					// without looking, so they are the last thing allowed to move.
					className={cn(
						'font-data text-data-sm flex h-12 items-center justify-center gap-2 border-2 px-1.5 tracking-[0.06em] uppercase transition-colors disabled:opacity-40 sm:px-2 sm:tracking-[0.12em]',
						className,
					)}
				>
					<span>{VERDICT_LABEL[verdict]}</span>
					{/* The key hint is worth a fifth of the button's width and means
					    nothing to a thumb, so a phone gets the word instead. */}
					<span
						aria-hidden
						className="hidden shrink-0 text-[0.7rem] opacity-60 sm:inline"
					>
						{key}
					</span>
				</button>
			))}
		</div>
	)
}

/**
 * A motif and how much more often than usual a pull landed on it.
 *
 * The bar is drawn against the reader's own base rate rather than against the
 * largest lift in the list, so two readouts are comparable and a drift with
 * one strong preference does not look identical to one with none.
 */
export function LiftRow({ motif, max }: { motif: MotifLift; max: number }) {
	const width = Math.min(100, (motif.lift / max) * 100)
	return (
		<li className="border-rule grid grid-cols-[1fr_auto] items-baseline gap-x-4 border-b py-2">
			<div className="min-w-0">
				<Data className="text-ground-fg block truncate normal-case">
					{motif.name}
				</Data>
				<div className="bg-tint mt-1 h-1 w-full">
					<div
						className="bg-link h-full"
						style={{ width: `${width}%` }}
						aria-hidden
					/>
				</div>
			</div>
			<Data className="text-ground-muted tabular-nums">
				{formatLift(motif.lift)}
				<span className="ml-2 opacity-60">
					{motif.pulled}/{motif.shown}
				</span>
			</Data>
		</li>
	)
}

/** Pulled share by century, against the share shown. */
export function PeriodBars({ periods }: { periods: Array<PeriodSplit> }) {
	const widest = Math.max(...periods.map((p) => p.shown), 1)
	return (
		<ul className="flex flex-col gap-2">
			{periods.map((period) => (
				<li
					key={period.century}
					className="grid grid-cols-[4rem_1fr_3rem] items-center gap-3"
				>
					<Data className="text-ground-muted tabular-nums">
						{period.century}c
					</Data>
					<div className="bg-tint relative h-3">
						<div
							className="bg-rule-strong absolute inset-y-0 left-0"
							style={{ width: `${(period.shown / widest) * 100}%` }}
							aria-hidden
						/>
						<div
							className="bg-link absolute inset-y-0 left-0"
							style={{ width: `${(period.pulled / widest) * 100}%` }}
							aria-hidden
						/>
					</div>
					<Data className="text-ground-muted tabular-nums">
						{period.pulled}/{period.shown}
					</Data>
				</li>
			))}
		</ul>
	)
}

/** A recommendation: a work near the drift vector, with a way into its dossier. */
export function NearestCard({ card }: { card: DriftCard }) {
	const src = getWorkImgSrc(card.objectKey)
	return (
		<article className="flex flex-col gap-2">
			<Link to={workHref(card.id)} className="block no-underline">
				{src ? (
					<Plate
						work={card}
						src={src}
						maxHeight="max-h-56"
						sizes="(min-width: 1024px) 16rem, 45vw"
					/>
				) : (
					<div className="border-rule text-ground-muted font-data text-data-sm flex h-32 items-center justify-center border uppercase">
						No image
					</div>
				)}
			</Link>
			<Display as="h3" size="title" className="text-[0.9375rem] leading-tight">
				<Link to={workHref(card.id)} className="hover:text-link no-underline">
					{card.title ?? 'Untitled'}
				</Link>
			</Display>
			<p className="font-body text-prose-sm italic">
				{card.artist ?? 'Unattributed'}
				{', '}
				<span className="not-italic">
					{displayPeriod(card.notBefore, card.notAfter)}
				</span>
			</p>
		</article>
	)
}
