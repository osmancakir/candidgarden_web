import { Link, data } from 'react-router'
import {
	LiftRow,
	NearestCard,
	PeriodBars,
} from '#app/components/institute/drift.tsx'
import {
	Data,
	Display,
	NoRecords,
	SectionHead,
} from '#app/components/institute/primitives.tsx'
import { pipeHeaders } from '#app/utils/headers.server.ts'
import { makeTimings } from '#app/utils/timing.server.ts'
import {
	buildReadout,
	deckFacts,
	emptyState,
	loadDrift,
	readDriftId,
} from './+shared/drift.server.ts'
import { READOUT_MINIMUM, DRIFT_LENGTH } from './+shared/drift.ts'
import { type Route } from './+types/drift_.readout.ts'

/**
 * Where the drift left the reader.
 *
 * A document again, deliberately: the session is a screen you hold and this is
 * a page you read, and the difference is the point at which the interface stops
 * asking for reactions and starts making claims. Everything here is stated as a
 * rate observed over a few dozen cards, relative to what the reader was shown —
 * per §6, the qualifications travel with the figures rather than living in a
 * help page nobody opens.
 */

export const meta: Route.MetaFunction = () => [
	{ title: 'Where the drift left you · Candid Garden' },
	{ name: 'robots', content: 'noindex' },
]

export async function loader({ request }: Route.LoaderArgs) {
	const timings = makeTimings('drift-readout')
	const driftId = await readDriftId(request)
	const state = driftId ? await loadDrift(driftId) : emptyState('anonymous')

	return data(
		{ deck: deckFacts, readout: await buildReadout(state) },
		{ headers: { 'Server-Timing': timings.toString() } },
	)
}

export const headers: Route.HeadersFunction = pipeHeaders

export default function DriftReadout({ loaderData }: Route.ComponentProps) {
	const { deck, readout } = loaderData
	const {
		tally,
		motifs,
		againstMotifs,
		periods,
		nearest,
		unreadVerdicts,
		error,
	} = readout

	const maxLift = Math.max(...motifs.map((m) => m.lift), 1.5)
	// The atlas takes a phrase, not a vector, so the link carries the motifs the
	// pulls over-represent and says so. It is a translation of the finding into
	// the atlas's own vocabulary, not the drift vector itself.
	const atlasPhrase = motifs
		.slice(0, 4)
		.map((m) => m.name)
		.join(', ')

	return (
		<div>
			<section className="border-rule container border-b py-10 md:py-14">
				<div className="grid gap-8 lg:grid-cols-12">
					<div className="lg:col-span-7">
						<Display as="h1" size="chapter" className="mb-5">
							Where the drift left you
						</Display>
						<p className="font-body text-prose-lg measure">
							{tally.seen} verdicts: {tally.pulled} pulled, {tally.pushed}{' '}
							pushed, {tally.atRest} at rest. The cards that pulled you stand
							for{' '}
							<span className="font-data text-data-lg tabular-nums">
								{tally.pulledRepresents.toLocaleString('en-US')}
							</span>{' '}
							works of the{' '}
							<span className="font-data text-data-lg tabular-nums">
								{deck.spreadOver.toLocaleString('en-US')}
							</span>{' '}
							the spread was taken over.
						</p>
					</div>
					<div className="flex flex-col justify-end gap-3 lg:col-span-5">
						<Data className="text-ground-muted">How to read this</Data>
						<p className="font-body text-prose-sm text-ground-muted measure">
							Every figure below is a rate observed over the cards you were
							shown, divided by your own rate across all of them. It says which
							way {tally.seen} pictures went in one sitting. It is not a
							personality, it is not a judgement about your eye, and it would
							come out differently tomorrow.
						</p>
						<div className="flex flex-wrap gap-x-6 gap-y-2">
							<Link
								to="/archive/drift/session"
								className="font-data text-data-sm text-link tracking-[0.12em] uppercase underline underline-offset-4"
							>
								{tally.seen >= DRIFT_LENGTH
									? 'Keep going →'
									: 'Back to the stack →'}
							</Link>
							<Link
								to="/archive/drift"
								className="font-data text-data-sm text-ground-muted tracking-[0.12em] uppercase underline underline-offset-4"
							>
								What this measures
							</Link>
						</div>
					</div>
				</div>
			</section>

			{tally.seen < READOUT_MINIMUM ? (
				<section className="container py-10">
					<NoRecords>
						Too few verdicts to say anything — {READOUT_MINIMUM} is the minimum
					</NoRecords>
				</section>
			) : (
				<>
					<section className="container grid gap-10 py-10 lg:grid-cols-2">
						<div>
							<SectionHead eyebrow="Motifs your pulls over-represent" />
							{motifs.length ? (
								<>
									<p className="font-body text-prose-sm text-ground-muted measure mt-4">
										How much likelier than usual a pull became once a card
										carried this motif, with the counts it was read from beside
										it. The figure is damped towards no-effect, so a motif seen
										three times cannot outrank one seen ten on the strength of a
										single card.
									</p>
									<ul className="mt-4">
										{motifs.map((motif) => (
											<LiftRow key={motif.name} motif={motif} max={maxLift} />
										))}
									</ul>
								</>
							) : (
								<p className="font-body text-prose-sm text-ground-muted measure mt-4">
									No motif came up on enough cards to be worth reporting. Motifs
									are counted only where at least three of your cards carried
									them, which forty verdicts do not always reach.
								</p>
							)}
						</div>
						<div>
							<SectionHead eyebrow="Motifs your pulls avoided" />
							{againstMotifs.length ? (
								<ul className="mt-4">
									{againstMotifs.map((motif) => (
										<LiftRow key={motif.name} motif={motif} max={maxLift} />
									))}
								</ul>
							) : (
								<p className="font-body text-prose-sm text-ground-muted measure mt-4">
									Nothing was avoided often enough to report.
								</p>
							)}
							{periods.length ? (
								<div className="mt-10">
									<SectionHead eyebrow="By period · pulled against shown" />
									<div className="mt-4">
										<PeriodBars periods={periods} />
									</div>
								</div>
							) : null}
						</div>
					</section>

					<section className="container pb-16">
						<SectionHead
							eyebrow="Nearest your pulls · not yet shown to you"
							aside={
								atlasPhrase ? (
									<Link
										to={`/archive/atlas?sense=${encodeURIComponent(atlasPhrase)}`}
										className="font-data text-data-sm text-link tracking-[0.12em] uppercase underline underline-offset-4"
									>
										See these motifs on the atlas →
									</Link>
								) : null
							}
						/>
						{error ? (
							<p
								role="note"
								className="border-stamp-fg text-stamp-fg font-data text-data mt-4 border-l-2 py-1 pl-3 tracking-[0.12em] uppercase"
							>
								{error}
							</p>
						) : null}
						{nearest.length ? (
							<>
								<p className="font-body text-prose-sm text-ground-muted measure mt-4">
									The average of your pulled works' readings, with your pushes
									subtracted off, and the works whose own readings sit nearest
									that point. Nearness is distance in an embedding space between
									machine-written descriptions — it is proximity, not agreement,
									and it is not a prediction that these will pull you.
								</p>
								<div className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
									{nearest.map((card) => (
										<NearestCard key={card.id} card={card} />
									))}
								</div>
							</>
						) : null}
						{unreadVerdicts > 0 ? (
							<p className="font-body text-prose-sm text-ground-muted measure mt-8">
								{unreadVerdicts} of your verdicts landed on works with no
								embedded reading. They are counted above and cannot enter the
								vector at all — the archive has an image and a catalogue record
								for them and nothing the model has read.
							</p>
						) : null}
					</section>
				</>
			)}
		</div>
	)
}
