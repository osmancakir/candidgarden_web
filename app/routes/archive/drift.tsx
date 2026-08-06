import { Link, data } from 'react-router'
import {
	Data,
	Display,
	SectionHead,
} from '#app/components/institute/primitives.tsx'
import { pipeHeaders } from '#app/utils/headers.server.ts'
import { makeTimings } from '#app/utils/timing.server.ts'
import {
	deckFacts,
	emptyState,
	loadDrift,
	readDriftId,
} from './+shared/drift.server.ts'
import { READOUT_MINIMUM, DRIFT_LENGTH } from './+shared/drift.ts'
import { type Route } from './+types/drift.ts'

/**
 * What the drift is, before anyone starts one.
 *
 * The session lives at `/archive/drift/session` and takes the whole viewport;
 * this page is its front matter. Splitting them is not tidiness — a screen you
 * swipe and a page you read want opposite things from a layout, and trying to
 * be both is what makes a card stack feel unstable on a phone. It also means
 * the explanation can be linked, quoted and read by someone who never swipes a
 * card, which for an archive that publishes its own uncertainty is the point.
 */

export const meta: Route.MetaFunction = () => [
	{ title: 'The drift · Candid Garden' },
	{
		name: 'description',
		content:
			'A few dozen works chosen to span the archive rather than to represent it. Each one pulls you, pushes you or leaves you at rest; the readout says which motifs your pulls over-represent and which works sit nearest them.',
	},
]

export async function loader({ request }: Route.LoaderArgs) {
	const timings = makeTimings('drift')
	const driftId = await readDriftId(request)
	const state = driftId ? await loadDrift(driftId) : emptyState('anonymous')

	return data(
		{ deck: deckFacts, tally: state.tally },
		{ headers: { 'Server-Timing': timings.toString() } },
	)
}

export const headers: Route.HeadersFunction = pipeHeaders

export default function Drift({ loaderData }: Route.ComponentProps) {
	const { deck, tally } = loaderData
	const started = tally.seen > 0
	const enough = tally.seen >= READOUT_MINIMUM

	return (
		<div>
			<section className="border-rule container border-b py-10 md:py-14">
				<div className="grid gap-8 lg:grid-cols-12">
					<div className="lg:col-span-7">
						<Display as="h1" size="chapter" className="mb-5">
							The drift
						</Display>
						<p className="font-body text-prose-lg measure">
							The{' '}
							<Link
								to="/archive/atlas"
								className="underline underline-offset-4"
							>
								atlas
							</Link>{' '}
							holds every work in this archive as a point in one space, six
							centuries of them at once, near each other when their readings say
							similar things. This is a passage across it.{' '}
							<span className="font-data text-data-lg tabular-nums">
								{deck.cards}
							</span>{' '}
							works, no two alike, each standing for a neighbourhood of that
							space. Pull the ones that draw you towards them, push the ones
							that push you off, leave the rest at rest — and the forces decide
							where you end up. It takes about three minutes.
						</p>

						<div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
							<Link
								to="/archive/drift/session"
								className="border-link text-link hover:bg-link/10 font-data text-data flex h-12 items-center justify-center border-2 px-8 tracking-[0.12em] uppercase no-underline transition-colors"
							>
								{started ? 'Resume the drift' : 'Begin the drift'}
							</Link>
							{enough ? (
								<Link
									to="/archive/drift/readout"
									className="font-data text-data-sm text-link tracking-[0.12em] uppercase underline underline-offset-4"
								>
									Read what you have so far →
								</Link>
							) : null}
						</div>

						{started ? (
							<Data className="text-ground-muted mt-4 block tabular-nums">
								{tally.seen} verdict{tally.seen === 1 ? '' : 's'} on record ·{' '}
								{tally.pulled} pulled · {tally.pushed} pushed · {tally.atRest}{' '}
								at rest
								{enough
									? null
									: ` · ${READOUT_MINIMUM - tally.seen} more before a readout`}
							</Data>
						) : null}
					</div>

					<div className="flex flex-col justify-end gap-3 lg:col-span-5">
						<Data className="text-ground-muted">What this measures</Data>
						<p className="font-body text-prose-sm text-ground-muted measure">
							Your verdicts against the sample you were shown — nothing more.
							The space you are crossing is built from machine-written readings,
							so it spans what the works are <em>about</em>. It does not span
							how they look: this archive holds no colour or composition data,
							and a drift cannot measure what was never recorded.
						</p>
					</div>
				</div>
			</section>

			<section className="container grid gap-10 py-10 md:grid-cols-3">
				<div>
					<SectionHead eyebrow="How the cards are chosen" />
					<p className="font-body text-prose-sm measure mt-4">
						Not at random. A random draw of forty from this corpus is mostly
						whatever the corpus has most of, and you would pass through forty
						near-identical panels having learned nothing. The deck is picked so
						that every card sits as far as possible from the ones already picked
						— each stands for a neighbourhood of about{' '}
						<span className="font-data tabular-nums">{deck.medianCluster}</span>{' '}
						works, and the readout counts those works when it counts your pulls.
					</p>
				</div>
				<div>
					<SectionHead eyebrow="What it will not tell you" />
					<p className="font-body text-prose-sm measure mt-4">
						Anything about how a picture looks. The whole apparatus rests on
						prose a model wrote <em>about</em> the pictures, so two works are
						near each other when their readings say similar things, never when
						they share a palette or a way of handling paint. A reader whose eye
						is for colour will get a readout about subject matter.
					</p>
				</div>
				<div>
					<SectionHead eyebrow="What is recorded" />
					<p className="font-body text-prose-sm measure mt-4">
						One row per work per drift, against a random token in this browser
						rather than against you. No account is needed and none is asked for.
						Nothing is written back onto the works — a verdict is a fact about a
						reader, and the archive does not let those become facts about art.
					</p>
				</div>
			</section>

			<section className="container pb-16">
				<Data className="text-ground-muted">
					A full drift is {DRIFT_LENGTH} cards · the readout opens after{' '}
					{READOUT_MINIMUM}
				</Data>
			</section>
		</div>
	)
}
