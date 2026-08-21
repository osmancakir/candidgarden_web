import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Data } from '#app/components/institute/primitives.tsx'
import { cn } from '#app/utils/misc.tsx'
import { LANGS, parseLang, say, type L, type Lang, type Slide } from './deck.ts'
import { type Scoreboards } from './figures.server.ts'
import { SlideView } from './slides.tsx'

/* ==========================================================================
   The player: the machinery a deck is shown with, and nothing about any
   particular deck.

   Two arguments run through it — the direct pitch at /prospectus and the
   funding pitch at /prospectus/funding — and they share every mechanism a
   presenter has learnt: the same arrow keys, the same contents sheet on `o`,
   the same two toggles in the same corner. Rebuilding that per route would
   have meant a presenter discovering, in front of a room, that this deck's
   spacebar does something the other one's did not.
   ========================================================================== */

type Ground = 'void' | 'paper'

function parseGround(value: string | null): Ground {
	return value === 'paper' ? 'paper' : 'void'
}

/** Reading position: an id rather than a number, so reordering cannot break a link. */
function slideIndex(slides: Array<Slide>, id: string | null) {
	const found = slides.findIndex((s) => s.id === id)
	return found === -1 ? 0 : found
}

export function DeckPlayer({
	slides,
	scoreboards,
	kind,
}: {
	/** The argument to show. The player knows nothing about which one it is. */
	slides: Array<Slide>
	scoreboards: Scoreboards
	/** What this deck calls itself in the masthead — the only copy the player owns. */
	kind: L
}) {
	const [searchParams, setSearchParams] = useSearchParams()
	const [contentsOpen, setContentsOpen] = useState(false)

	const lang = parseLang(searchParams.get('lang'))
	const ground = parseGround(searchParams.get('ground'))
	const index = slideIndex(slides, searchParams.get('slide'))
	const slide = slides[index]!

	/**
	 * `replace` throughout. Twelve arrow presses should not become twelve history
	 * entries a presenter has to walk back out of — the browser's back button
	 * belongs to the page they arrived from, not to the deck.
	 */
	const setParam = useCallback(
		(key: string, value: string) => {
			setSearchParams(
				(prev) => {
					const next = new URLSearchParams(prev)
					next.set(key, value)
					return next
				},
				{ replace: true, preventScrollReset: true },
			)
		},
		[setSearchParams],
	)

	const goTo = useCallback(
		(next: number) => {
			const clamped = Math.min(Math.max(next, 0), slides.length - 1)
			setParam('slide', slides[clamped]!.id)
			setContentsOpen(false)
		},
		[setParam, slides],
	)

	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if (event.metaKey || event.ctrlKey || event.altKey) return
			const target = event.target as HTMLElement | null
			if (target?.closest('input, textarea, select, [contenteditable]')) return

			switch (event.key) {
				case 'ArrowRight':
				case 'PageDown':
				case ' ':
					event.preventDefault()
					goTo(index + 1)
					break
				case 'ArrowLeft':
				case 'PageUp':
					event.preventDefault()
					goTo(index - 1)
					break
				case 'Home':
					event.preventDefault()
					goTo(0)
					break
				case 'End':
					event.preventDefault()
					goTo(slides.length - 1)
					break
				case 'o':
					event.preventDefault()
					setContentsOpen((open) => !open)
					break
				case 'Escape':
					setContentsOpen(false)
					break
			}
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [goTo, index, slides.length])

	const atStart = index === 0
	const atEnd = index === slides.length - 1
	const position = `${String(index + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`

	return (
		<div
			className={cn(
				'bg-ground text-ground-fg relative flex h-full min-h-0 flex-col',
				ground === 'void' ? 'register-void' : 'register-paper',
			)}
		>
			<header className="border-rule flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b px-5 py-3 md:px-8">
				<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
					<Data className="tracking-[0.2em]">Candid Garden</Data>
					<Data className="text-ground-muted">{say(kind, lang)}</Data>
				</div>
				<div className="flex items-center gap-2">
					<GroundToggle
						ground={ground}
						onChange={(g) => setParam('ground', g)}
					/>
					<LangToggle lang={lang} onChange={(l) => setParam('lang', l)} />
				</div>
			</header>

			{/* The slide itself. Scrolls only when a viewport is too short for it —
			    on a projector nothing ever does, and on a phone the alternative is a
			    clipped sentence. */}
			<main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
				<section
					key={slide.id}
					aria-label={`${say(slide.eyebrow, lang)} — ${say(slide.title, lang)}`}
					className="mx-auto flex w-full max-w-[88rem] flex-1 flex-col justify-center px-5 py-8 md:px-8 md:py-12"
				>
					<SlideView slide={slide} lang={lang} scoreboards={scoreboards} />
				</section>
			</main>

			{/* Announced rather than merely rendered: a screen-reader user moving
			    through the deck gets told where they landed, since the visual
			    counter says it and nothing else would. */}
			<p aria-live="polite" className="sr-only">
				{lang === 'de'
					? `Folie ${index + 1} von ${slides.length}: ${say(slide.title, lang)}`
					: `Slide ${index + 1} of ${slides.length}: ${say(slide.title, lang)}`}
			</p>

			<footer className="border-rule flex shrink-0 items-center justify-between gap-4 border-t px-5 py-3 md:px-8">
				<button
					type="button"
					onClick={() => setContentsOpen((open) => !open)}
					aria-expanded={contentsOpen}
					className="text-ground-muted hover:text-link font-data text-data-sm tracking-[0.12em] uppercase"
				>
					{lang === 'de' ? 'Übersicht' : 'Contents'}
					<span className="ml-3 tabular-nums">{position}</span>
				</button>

				<div className="flex items-center gap-2">
					<DeckButton
						onClick={() => goTo(index - 1)}
						disabled={atStart}
						label={lang === 'de' ? 'Zurück' : 'Back'}
					>
						←
					</DeckButton>
					<DeckButton
						onClick={() => goTo(index + 1)}
						disabled={atEnd}
						label={lang === 'de' ? 'Weiter' : 'Next'}
					>
						→
					</DeckButton>
				</div>
			</footer>

			{/* Progress, as a hairline rather than as a widget. */}
			<div
				aria-hidden
				className="bg-link absolute inset-x-0 bottom-0 h-px origin-left transition-transform duration-200"
				style={{ transform: `scaleX(${(index + 1) / slides.length})` }}
			/>

			{contentsOpen ? (
				<Contents
					slides={slides}
					lang={lang}
					current={index}
					onPick={goTo}
					onClose={() => setContentsOpen(false)}
				/>
			) : null}
		</div>
	)
}

function DeckButton({
	onClick,
	disabled,
	label,
	children,
}: {
	onClick: () => void
	disabled: boolean
	label: string
	children: React.ReactNode
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			aria-label={label}
			className="border-rule text-ground-fg hover:border-link hover:text-link font-data text-data flex h-9 w-11 items-center justify-center border transition-colors disabled:pointer-events-none disabled:opacity-30"
		>
			<span aria-hidden>{children}</span>
		</button>
	)
}

function LangToggle({
	lang,
	onChange,
}: {
	lang: Lang
	onChange: (lang: Lang) => void
}) {
	return (
		<div className="flex" role="group" aria-label="Language">
			{LANGS.map((entry) => (
				<button
					key={entry.id}
					type="button"
					onClick={() => onChange(entry.id)}
					aria-pressed={entry.id === lang}
					className={cn(
						'font-data text-data-sm -ml-px border px-3 py-1.5 tracking-[0.12em] uppercase transition-colors',
						entry.id === lang
							? 'border-ground-fg bg-ground-fg text-ground'
							: 'border-rule text-ground-muted hover:border-link hover:text-link',
					)}
				>
					{entry.short}
				</button>
			))}
		</div>
	)
}

/**
 * The one control the masthead would normally carry, restored.
 *
 * Root hides the site chrome on a fullscreen route, and with it the ground
 * toggle — which matters more here than anywhere else on the site, because a
 * paper-white deck on a projector in a darkened room is unreadable and a void
 * deck printed to hand round is a wasted cartridge. It names the ground, in the
 * site's own vocabulary, rather than showing a sun and a moon.
 */
function GroundToggle({
	ground,
	onChange,
}: {
	ground: Ground
	onChange: (ground: Ground) => void
}) {
	const next = ground === 'void' ? 'paper' : 'void'
	return (
		<button
			type="button"
			onClick={() => onChange(next)}
			className="border-rule text-ground-muted hover:border-link hover:text-link font-data text-data-sm border px-3 py-1.5 tracking-[0.12em] uppercase transition-colors"
		>
			Ground {ground}
		</button>
	)
}

/**
 * The contents sheet. In a meeting the question is never "next slide" — it is
 * "go back to the scores", and a presenter arrowing backwards through six
 * slides to find them has lost the room.
 */
function Contents({
	slides,
	lang,
	current,
	onPick,
	onClose,
}: {
	slides: Array<Slide>
	lang: Lang
	current: number
	onPick: (index: number) => void
	onClose: () => void
}) {
	return (
		<div className="bg-ground absolute inset-0 z-10 flex flex-col">
			<div className="border-rule flex shrink-0 items-center justify-between border-b px-5 py-3 md:px-8">
				<Data className="tracking-[0.2em]">
					{lang === 'de' ? 'Übersicht' : 'Contents'}
				</Data>
				<button
					type="button"
					onClick={onClose}
					className="text-ground-muted hover:text-link font-data text-data-sm tracking-[0.12em] uppercase"
				>
					{lang === 'de' ? 'Schließen' : 'Close'}
				</button>
			</div>
			<ol className="mx-auto grid w-full max-w-[88rem] flex-1 auto-rows-min gap-x-8 gap-y-px overflow-y-auto px-5 py-6 md:grid-cols-2 md:px-8 lg:grid-cols-3">
				{slides.map((entry, i) => (
					<li key={entry.id}>
						<button
							type="button"
							onClick={() => onPick(i)}
							aria-current={i === current ? 'true' : undefined}
							className={cn(
								'border-rule flex w-full items-baseline gap-4 border-b py-3 text-left transition-colors',
								i === current ? 'text-link' : 'text-ground-fg hover:text-link',
							)}
						>
							<span className="font-data text-data-sm text-ground-muted tabular-nums">
								{String(i + 1).padStart(2, '0')}
							</span>
							<span className="flex min-w-0 flex-col gap-0.5">
								<span className="font-data text-data-sm text-ground-muted tracking-[0.12em] uppercase">
									{say(entry.eyebrow, lang)}
								</span>
								<span className="font-body text-prose-sm">
									{say(entry.title, lang)}
								</span>
							</span>
						</button>
					</li>
				))}
			</ol>
		</div>
	)
}
