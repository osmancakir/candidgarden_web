import { useEffect, useRef } from 'react'
import { useNavigation } from 'react-router'
import { useSpinDelay } from 'spin-delay'
import { Data, Display } from './primitives.tsx'

/* ==========================================================================
   The retrieval interlock.

   A navigation is the archive being consulted, so it is stated at the scale of
   the whole screen rather than as a hairline at the top of it: the ground
   travels to `register-level-3` — the far end of the descent, relative to
   wherever the reader is resting (§2) — and the rest of the app goes inert
   until the record arrives. The reader is not asked to keep working against a
   page that is already leaving.

   Two things it is deliberately not: a shimmer skeleton and a spinner glyph.
   §10 refuses both. What moves is a row of mono cells advancing one cell at a
   time — the machine speaking in the mono/ASCII layer of §4, and the only
   moving element on the screen. Under `prefers-reduced-motion` the cells hold
   a static position and the text carries the whole message (§8).
   ========================================================================== */

const TICKER_CELLS = 24
const TICKER = '█'.repeat(TICKER_CELLS)

export type Retrieval = {
	pending: boolean
	filing: boolean
	destination: string | undefined
}

/**
 * The single source of pending state for the app shell. Root calls it once and
 * spends the result twice — on `inert` for the shell and on the overlay — so
 * the two can never disagree about whether a retrieval is in progress.
 *
 * The 600ms delay is what keeps a full-screen interlock from firing on
 * navigations that were never slow enough to need one; the 400ms minimum keeps
 * it from flashing once it has.
 */
export function useRetrieval(): Retrieval {
	const navigation = useNavigation()
	const busy = navigation.state !== 'idle'
	const pending = useSpinDelay(busy, { delay: 600, minDuration: 400 })

	// Making the shell inert moves focus out of it, so the element that had
	// focus has to be remembered *before* that happens — by the time an effect
	// runs, `document.activeElement` is already the body.
	const pendingRef = useRef(pending)
	pendingRef.current = pending
	const lastFocused = useRef<HTMLElement | null>(null)

	useEffect(() => {
		function record(event: FocusEvent) {
			if (pendingRef.current) return
			if (event.target instanceof HTMLElement)
				lastFocused.current = event.target
		}
		document.addEventListener('focusin', record)
		return () => document.removeEventListener('focusin', record)
	}, [])

	useEffect(() => {
		if (!pending) return
		const restore = lastFocused.current
		return () => {
			// Only when the element survived the navigation — a filter console
			// input that submitted in place does; a link on the page you just
			// left does not, and there React Router's own focus handling wins.
			if (restore?.isConnected) restore.focus()
		}
	}, [pending])

	return {
		pending,
		filing: navigation.state === 'submitting',
		destination: navigation.location?.pathname,
	}
}

export function RetrievalOverlay({ pending, filing, destination }: Retrieval) {
	return pending ? (
		<RetrievalPlate filing={filing} destination={destination} />
	) : null
}

function RetrievalPlate({ filing, destination }: Omit<Retrieval, 'pending'>) {
	const ref = useRef<HTMLDivElement>(null)

	// The shell is inert, so focus has to land somewhere reachable; without
	// this it sits on the body and the screen reader's virtual cursor is
	// stranded in a subtree it can no longer enter.
	useEffect(() => {
		ref.current?.focus()
	}, [])

	return (
		<div
			ref={ref}
			tabIndex={-1}
			role="status"
			aria-live="assertive"
			aria-busy="true"
			// Above sonner, which ships a z-index of 999999 — a toast with a
			// close button floating over an interlock would be a hole in it.
			className="register-level-3 retrieval-ground text-ground-fg fixed inset-0 z-1000000 flex items-center justify-center p-5 outline-none"
		>
			{/*
			 * The wash is thinned; the plate is not. The page being left stays
			 * faintly visible around a document that is fully legible.
			 */}
			<div className="border-rule bg-ground w-full max-w-136 border">
				<Data as="p" className="rule-b text-ground-muted px-5 py-3">
					Candid·Garden · {filing ? 'Filing' : 'Retrieval'} in progress
				</Data>

				<div className="px-5 py-8 md:px-8 md:py-10">
					<Display as="p" size="chapter">
						{filing ? 'Filing' : 'Retrieving'}
					</Display>

					{/* §7: first-person plural, deadpan, no apology for the wait. */}
					<p className="font-body text-prose mt-3">
						{filing
							? 'We are filing your request.'
							: 'We are consulting the archive.'}
					</p>

					<div
						aria-hidden
						className="font-data relative mt-8 w-fit text-[1.125rem] leading-none"
					>
						<span className="block whitespace-pre opacity-20">{TICKER}</span>
						<span className="retrieval-fill absolute inset-y-0 left-0 block overflow-hidden whitespace-pre">
							{TICKER}
						</span>
					</div>

					{destination ? (
						<Data as="p" className="text-ground-muted mt-4 block truncate">
							Destination {destination}
						</Data>
					) : null}
				</div>
			</div>
		</div>
	)
}
