import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, data, useFetcher } from 'react-router'
import {
	DriftShell,
	DriftStack,
	DriftStat,
} from '#app/components/institute/drift.tsx'
import { Data } from '#app/components/institute/primitives.tsx'
import { getUserId } from '#app/utils/auth.server.ts'
import { pipeHeaders } from '#app/utils/headers.server.ts'
import { makeTimings } from '#app/utils/timing.server.ts'
import {
	emptyState,
	loadDrift,
	newDriftId,
	nextCards,
	parseVerdicts,
	readDriftId,
	recordVerdicts,
	driftCookieHeader,
} from './+shared/drift.server.ts'
import {
	BATCH_SIZE,
	FLUSH_EVERY,
	READOUT_MINIMUM,
	REFILL_AT,
	DRIFT_LENGTH,
	type DriftCard,
	type DriftTally,
	type DriftVerdictValue,
} from './+shared/drift.ts'
import { type Route } from './+types/drift_.session.ts'

/**
 * The drift itself, as a screen rather than as a page.
 *
 * Split out from `/archive/drift` because the two are different objects. The
 * explanation is a document: it scrolls, it has a masthead, it can be read at
 * any width. This is an instrument held in one hand — the plate keeps one
 * height for every work, the three verdicts stay under the thumb, and nothing
 * moves between cards. Root hides the site chrome and locks the viewport for
 * this path alone; see `isFullscreenRoute` in `app/root.tsx`.
 */

export const meta: Route.MetaFunction = () => [
	{ title: 'Drift · Candid Garden' },
	{ name: 'robots', content: 'noindex' },
]

export async function loader({ request }: Route.LoaderArgs) {
	const timings = makeTimings('drift-session')
	const existingId = await readDriftId(request)
	const driftId = existingId ?? newDriftId()
	const state = existingId ? await loadDrift(existingId) : emptyState(driftId)

	const headers = new Headers({ 'Server-Timing': timings.toString() })
	// The cookie is set on the way in rather than on the first verdict, so the
	// POST that follows already has a drift to write against.
	if (!existingId) {
		headers.append('Set-Cookie', await driftCookieHeader(driftId))
	}

	const { cards, error } = await nextCards({ state, count: BATCH_SIZE })
	return data({ cards, tally: state.tally, error }, { headers })
}

/**
 * Records a flush of verdicts and deals whatever the stack needs next.
 *
 * One endpoint for both because they are one exchange: which cards to deal
 * depends on the verdicts just given, and a client that had to write and then
 * separately read would either race itself or wait twice.
 */
export async function action({ request }: Route.ActionArgs) {
	const formData = await request.formData()
	const existingId = await readDriftId(request)
	const driftId = existingId ?? newDriftId()

	const headers = new Headers()
	if (!existingId) {
		headers.append('Set-Cookie', await driftCookieHeader(driftId))
	}

	const verdicts = parseVerdicts(formData.get('verdicts'))
	const before = existingId ? await loadDrift(existingId) : emptyState(driftId)

	if (verdicts.length) {
		await recordVerdicts({
			driftId,
			userId: await getUserId(request),
			verdicts,
			alreadySeen: before.tally.seen,
		})
	}

	const state = await loadDrift(driftId)

	// A beacon flush on page-hide wants nothing back; dealing it a batch would
	// mark cards as offered to a stack that no longer exists.
	if (formData.get('want') !== '1') {
		return data(
			{ cards: [] as Array<DriftCard>, tally: state.tally, error: null },
			{ headers },
		)
	}

	const { cards, error } = await nextCards({ state, count: BATCH_SIZE })
	return data({ cards, tally: state.tally, error }, { headers })
}

export const headers: Route.HeadersFunction = pipeHeaders

type FetcherData = {
	cards: Array<DriftCard>
	tally: DriftTally
	error: string | null
}

export default function DriftSession({ loaderData }: Route.ComponentProps) {
	const { cards: firstCards, tally: firstTally } = loaderData
	const fetcher = useFetcher<FetcherData>()

	const [queue, setQueue] = useState<Array<DriftCard>>(firstCards)
	const [tally, setTally] = useState(firstTally)
	const [exhausted, setExhausted] = useState(false)
	const [keptGoing, setKeptGoing] = useState(false)
	const pending = useRef<
		Array<{ resourceId: number; verdict: DriftVerdictValue; origin: string }>
	>([])
	const inFlight = useRef(false)
	// Whether the submission now in flight asked for cards, so that a reply with
	// none can be read as "the deck is spent" rather than as "you did not ask".
	const wantedCards = useRef(false)
	const dealt = useRef(new Set(firstCards.map((card) => card.id)))

	const flush = useCallback(
		(want: boolean) => {
			if (inFlight.current) return
			const verdicts = pending.current
			if (verdicts.length === 0 && !want) return
			pending.current = []
			inFlight.current = true
			wantedCards.current = want
			void fetcher.submit(
				{ verdicts: JSON.stringify(verdicts), want: want ? '1' : '' },
				{ method: 'POST' },
			)
		},
		[fetcher],
	)

	// The single place new cards and revised counts enter the screen. Cards are
	// appended rather than replacing the queue: the reader is mid-stack, and a
	// batch that arrived while they were looking at card three must not move it.
	useEffect(() => {
		if (fetcher.state !== 'idle' || !fetcher.data) return
		inFlight.current = false
		setTally(fetcher.data.tally)
		const fresh = fetcher.data.cards.filter(
			(card) => !dealt.current.has(card.id),
		)
		if (fresh.length) {
			for (const card of fresh) dealt.current.add(card.id)
			setQueue((current) => [...current, ...fresh])
		} else if (fetcher.data.cards.length === 0 && wantedCards.current) {
			setExhausted(true)
		}
	}, [fetcher.state, fetcher.data])

	// Flush when enough verdicts have piled up, and top the stack up before it
	// runs dry rather than when it has.
	useEffect(() => {
		if (inFlight.current || fetcher.state !== 'idle') return
		const needCards = !exhausted && queue.length <= REFILL_AT
		if (pending.current.length >= FLUSH_EVERY || needCards) {
			flush(needCards)
		}
	}, [queue.length, fetcher.state, exhausted, flush])

	// A closed tab must not cost the verdicts already given. `sendBeacon`
	// survives the unload that a fetcher submission would not.
	useEffect(() => {
		function onHide() {
			if (document.visibilityState !== 'hidden') return
			const verdicts = pending.current
			if (verdicts.length === 0) return
			pending.current = []
			const body = new FormData()
			body.set('verdicts', JSON.stringify(verdicts))
			body.set('want', '')
			navigator.sendBeacon?.(window.location.pathname, body)
		}
		document.addEventListener('visibilitychange', onHide)
		return () => document.removeEventListener('visibilitychange', onHide)
	}, [])

	const onVerdict = useCallback(
		(card: DriftCard, verdict: DriftVerdictValue) => {
			pending.current.push({
				resourceId: card.id,
				verdict,
				origin: card.origin,
			})
			// Counted locally so the figures move with the card rather than with
			// the network.
			setTally((current) => ({
				...current,
				seen: current.seen + 1,
				pulled: current.pulled + (verdict === 'PULL' ? 1 : 0),
				pushed: current.pushed + (verdict === 'PUSH' ? 1 : 0),
				atRest: current.atRest + (verdict === 'REST' ? 1 : 0),
				pulledRepresents:
					current.pulledRepresents + (verdict === 'PULL' ? card.represents : 0),
			}))
			setQueue((current) => current.slice(1))
		},
		[],
	)

	const enough = tally.seen >= READOUT_MINIMUM
	const complete = tally.seen >= DRIFT_LENGTH && !keptGoing

	return (
		<DriftShell
			backTo="/archive/drift"
			backLabel="The drift"
			title={`${String(Math.min(tally.seen, DRIFT_LENGTH)).padStart(2, '0')} of ${DRIFT_LENGTH}`}
			statsLabel="Verdicts so far"
			action={
				enough ? (
					<Link
						to="/archive/drift/readout"
						onClick={() => flush(false)}
						className="font-data text-data-sm text-link tracking-[0.12em] uppercase underline underline-offset-4"
					>
						Read it →
					</Link>
				) : null
			}
			stats={
				// The glyph is the gesture that produced the count and the three sit in
				// the same order as the buttons below, so the figures read as a record
				// of which way cards went rather than as a score.
				<>
					<DriftStat
						label={`${tally.pushed} pushed`}
						value={`← ${tally.pushed}`}
						tone="push"
					/>
					<DriftStat
						label={`${tally.atRest} at rest`}
						value={`· ${tally.atRest}`}
					/>
					<DriftStat
						label={`${tally.pulled} pulled`}
						value={`→ ${tally.pulled}`}
						tone="pull"
					/>
				</>
			}
		>
			{complete ? (
				<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 text-center">
					<div>
						<Data className="text-ground-muted block">
							{DRIFT_LENGTH} verdicts — that is a drift
						</Data>
						<p className="font-body text-prose measure mx-auto mt-3">
							Enough cards have pulled or pushed for the readout to have
							something to say. Nothing stops you going further; the figures
							only get steadier.
						</p>
					</div>
					<div className="flex w-full max-w-xl flex-col gap-2 sm:flex-row">
						<Link
							to="/archive/drift/readout"
							onClick={() => flush(false)}
							className="border-link text-link hover:bg-link/10 font-data text-data-sm flex h-12 flex-1 items-center justify-center border-2 tracking-[0.12em] uppercase no-underline transition-colors"
						>
							Read the drift
						</Link>
						<button
							type="button"
							onClick={() => setKeptGoing(true)}
							className="border-rule-strong text-ground-muted hover:bg-tint font-data text-data-sm flex h-12 flex-1 items-center justify-center border-2 tracking-[0.12em] uppercase transition-colors"
						>
							Keep going
						</button>
					</div>
				</div>
			) : (
				<DriftStack cards={queue} onVerdict={onVerdict} exhausted={exhausted} />
			)}
		</DriftShell>
	)
}
