import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { Link } from 'react-router'
import {
	Data,
	Display,
	ProvenanceStamp,
	UncertaintyNotice,
} from '#app/components/institute/primitives.tsx'
import { PilotHeader } from './+shared/components.tsx'
import {
	manifest,
	scoreboardFor,
	usageForMedium,
} from './+shared/pilot.server.ts'
import { MEDIA, SCORE_CATEGORIES, type MediumId } from './+shared/schema.ts'
import { type Route } from './+types/index.ts'

// Gated by the layout's role check, so it must not be advertised in
// sitemap.xml. remix-seo includes every static route unless told otherwise.
export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

/**
 * The pilot report. Everything the status note of 01 August 2026 says, laid out
 * so a reader can check each claim against the run behind it — every figure on
 * this page links through to the sheets it was computed from.
 *
 * The order is the order of the argument, not of the pipeline: what was run,
 * what it showed, why the catalogue comparison was set aside, what would
 * strengthen the results, what happens next.
 */

export const meta: Route.MetaFunction = () => [
	{ title: 'Städel pilot · Candid Garden' },
	{ name: 'robots', content: 'noindex, nofollow' },
	{
		name: 'description',
		content:
			'Model comparison on the Städel graphic collection: five vision models, two tasks, 40 annotated sheets.',
	},
]

export async function loader() {
	return {
		manifest,
		scoreboards: Object.fromEntries(
			MEDIA.map((m) => [m.id, scoreboardFor(m.id)]),
		) as Record<MediumId, ReturnType<typeof scoreboardFor>>,
		usage: Object.fromEntries(
			MEDIA.map((m) => [m.id, usageForMedium(m.id)]),
		) as Record<MediumId, ReturnType<typeof usageForMedium>>,
	}
}

/** A numbered section, mirroring the document layout used across the site. */
function Section({
	n,
	heading,
	children,
}: {
	n: number
	heading: string
	children: React.ReactNode
}) {
	const id = heading.toLowerCase().replace(/[^a-z0-9]+/g, '-')
	return (
		<section
			id={id}
			className="grid scroll-mt-24 gap-x-8 gap-y-5 md:grid-cols-12"
		>
			<div className="md:col-span-3">
				<h2 className="flex items-baseline gap-3">
					<Data className="text-ground-muted tabular-nums">
						{String(n).padStart(2, '0')}
					</Data>
					<span className="font-display text-title uppercase">{heading}</span>
				</h2>
			</div>
			<div className="flex flex-col gap-6 md:col-span-9">{children}</div>
		</section>
	)
}

function ScoreTable({
	medium,
	rows,
	models,
}: {
	medium: MediumId
	rows: ReturnType<typeof scoreboardFor>
	models: typeof manifest.models
}) {
	const label = MEDIA.find((m) => m.id === medium)!
	return (
		<div className="overflow-x-auto">
			<table className="min-w-full">
				<caption className="mb-3 text-left">
					<Data className="tracking-[0.2em]">
						{label.label} · {label.german}
					</Data>
					<Data className="text-ground-muted ml-3 normal-case">
						mean of 20 sheets, out of 10
					</Data>
				</caption>
				<thead>
					<tr className="border-rule-strong border-b">
						<th
							scope="col"
							className="font-data text-data-sm text-ground-muted py-2 pr-4 text-left tracking-[0.12em] uppercase"
						>
							Model
						</th>
						{SCORE_CATEGORIES.map((c) => (
							<th
								key={c.id}
								scope="col"
								className="font-data text-data-sm text-ground-muted py-2 pr-4 text-right tracking-[0.12em] uppercase"
							>
								{c.label}
							</th>
						))}
						<th
							scope="col"
							className="font-data text-data-sm text-ground-fg py-2 text-right tracking-[0.12em] uppercase"
						>
							Overall
						</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => {
						const model = models.find((m) => m.id === row.model)
						return (
							<tr key={row.model} className="border-rule border-b">
								<th scope="row" className="py-2 pr-4 text-left font-normal">
									<Link
										to={`/stadel-research/evaluation?medium=${medium}&model=${row.model}`}
										className="hover:text-link font-body text-prose no-underline hover:underline"
									>
										{model?.label ?? row.model}
									</Link>
									<Data className="text-ground-muted ml-2">
										{model?.provider}
									</Data>
								</th>
								{SCORE_CATEGORIES.map((c) => (
									<td
										key={c.id}
										className="font-data text-data py-2 pr-4 text-right tabular-nums"
									>
										{row[c.id]?.toFixed(2) ?? '—'}
									</td>
								))}
								<td className="font-data text-data py-2 text-right font-bold tabular-nums">
									{row.overall?.toFixed(2) ?? '—'}
								</td>
							</tr>
						)
					})}
				</tbody>
			</table>
		</div>
	)
}

export default function StadelPilotOverview({
	loaderData,
}: Route.ComponentProps) {
	const { manifest: run, scoreboards, usage } = loaderData
	const printsTop = scoreboards.prints[0]
	const printsRunnerUp = scoreboards.prints[1]

	return (
		<>
			<PilotHeader
				kind={`Pilot report · ${run.experiment}`}
				title="Five models on the graphic collection"
				lead={
					<>
						I froze an evaluation sample of {run.sample.works} sheets —{' '}
						{run.sample.perMedium} prints and {run.sample.perMedium} drawings,
						capped at {run.sample.maxPerArtist} works per artist so that no
						single artist dominates it — and ran five current vision models
						across both tasks and both media. {run.calls} model calls in total.
					</>
				}
				aside={
					<ProvenanceStamp
						dataset="Städel · Graphische Sammlung"
						run={run.experiment}
						verification="PENDING"
					/>
				}
			/>

			<div className="container flex flex-col gap-14 py-12 md:py-16">
				<Section n={1} heading="The roster">
					<p className="font-body text-prose measure">
						The roster was taken from each provider's live model list. The
						models named in the briefing are more than a year old, and the field
						has moved since it was written. One model per provider, each the
						provider's current flagship for vision.
					</p>
					<div className="overflow-x-auto">
						<table className="min-w-full">
							<thead>
								<tr className="border-rule-strong border-b">
									{[
										'Provider',
										'Model',
										'Calls',
										'Tokens in',
										'Tokens out',
									].map((h) => (
										<th
											key={h}
											scope="col"
											className={
												'font-data text-data-sm text-ground-muted py-2 pr-4 tracking-[0.12em] uppercase ' +
												(h === 'Provider' || h === 'Model'
													? 'text-left'
													: 'text-right')
											}
										>
											{h}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{run.models.map((model) => {
									const prints = usage.prints.find(
										(u) => u.model.id === model.id,
									)
									const drawings = usage.drawings.find(
										(u) => u.model.id === model.id,
									)
									const calls = (prints?.calls ?? 0) + (drawings?.calls ?? 0)
									const input = (prints?.input ?? 0) + (drawings?.input ?? 0)
									const output = (prints?.output ?? 0) + (drawings?.output ?? 0)
									return (
										<tr key={model.id} className="border-rule border-b">
											<td className="font-body text-prose py-2 pr-4">
												{model.provider}
											</td>
											<td className="font-data text-data py-2 pr-4 tracking-normal">
												{model.id.replace(/^[a-z]+-/, '')}
											</td>
											<td className="font-data text-data py-2 pr-4 text-right tabular-nums">
												{calls}
											</td>
											<td className="font-data text-data py-2 pr-4 text-right tabular-nums">
												{input.toLocaleString('en-US')}
											</td>
											<td className="font-data text-data py-2 text-right tabular-nums">
												{output.toLocaleString('en-US')}
											</td>
										</tr>
									)
								})}
							</tbody>
						</table>
					</div>
					<p className="font-body text-prose-sm text-ground-muted measure">
						Token counts are the sample only — {run.sample.works} sheets across
						both tasks. The full export is{' '}
						{run.corpus.works.toLocaleString('en-US')} works (
						{run.corpus.prints.toLocaleString('en-US')} prints,{' '}
						{run.corpus.drawings.toLocaleString('en-US')} drawings), so a
						complete run is roughly{' '}
						{Math.round(run.corpus.works / run.sample.works)}× these figures per
						model.
					</p>
				</Section>

				<Section n={2} heading="What the comparison shows">
					<p className="font-body text-prose measure">
						Each model's keyword output was scored against the image itself by
						an independent judge model, with the model names hidden so the judge
						could not recognise whose output it was reading.
					</p>
					<ScoreTable
						medium="prints"
						rows={scoreboards.prints}
						models={run.models}
					/>
					<ScoreTable
						medium="drawings"
						rows={scoreboards.drawings}
						models={run.models}
					/>
					<div className="prose-editorial measure">
						<p>
							Mistral scores lowest on both media — well over a point behind the
							next model, and two and a half points behind the leader on print
							iconography. The margin is wide enough that the sample size is
							unlikely to account for it.
						</p>
						<p>
							Google and xAI score level with each other. They swap places
							between the two media, and this sample does not separate them.
						</p>
						<p>
							OpenAI and Anthropic lead, in that order, though that order should
							be read as provisional. The judge in this run was itself one of
							the contestants, and its margin over the runner-up (
							{printsTop && printsRunnerUp
								? (printsTop.overall! - printsRunnerUp.overall!).toFixed(2)
								: '—'}{' '}
							on prints) is smaller than the self-preference that could
							plausibly explain it. Re-scoring those two with a judge that is
							neither of them would settle the question.
						</p>
						<p>
							Iconography is the category that separates the models: it spans
							5.2 to 9.2 across the roster. Atmosphere and emotion sit between
							8.0 and 9.0 for every model and, at this sample size, say very
							little.
						</p>
					</div>
					<UncertaintyNotice notice="Ranking provisional · judge was a contestant · re-score pending" />
				</Section>

				<Section n={3} heading="Why the catalogue comparison was set aside">
					<p className="font-body text-prose measure">
						The briefing asked for the models to be scored against the
						annotations already in your records. I built that, ran it on the
						pilot output, and then took it out of the evaluation. The reason is
						a finding about the data, so it is worth setting out.
					</p>
					<div className="prose-editorial measure">
						<p>
							The catalogue is unevenly filled: only{' '}
							<strong>66 of 2,041</strong> prints and <strong>18 of 706</strong>{' '}
							drawings carry five or more thematic keywords. On a record where
							you hold four keywords and the model finds all four and then adds
							sixty-five more, an overlap score reads as 6% precision. The model
							has not performed worse there — there is simply less catalogue to
							match against. Averaged across the sample, precision on the thinly
							catalogued records comes out twelve times lower than on the deeply
							catalogued ones, while recall comes out twice as high. Neither
							figure describes the model.
						</p>
						<p>
							Run across the whole roster, that metric ranks the models almost
							exactly inversely to how much they write: the tersest model comes
							first.
						</p>
						<p>
							There is also a structural limit. Four of the nine fields the
							briefing asks for — <code>Assoziation.Person</code>,{' '}
							<code>Assoziation.Thema</code>, <code>Atmosphäre</code> and{' '}
							<code>Emotion</code> — are empty across all {run.sample.works}{' '}
							sample records. That is by design: they are the categories the
							project exists to add. A comparison against the catalogue is
							therefore blind to nearly half the output.
						</p>
						<p>
							The evaluation therefore scores the models against the artwork
							itself, which needs no catalogue and covers all four categories.
							Your records remain the backbone of every run — they supply the
							work list, the metadata in each prompt, and the images. They are
							simply not being used as a scoreboard.
						</p>
						<p>
							The underlying question — what would this actually add to the
							catalogue? — is still answerable, and directly. The{' '}
							<Link to="/stadel-research/tags">keyword comparison</Link> puts
							your record beside all five models on every sheet in the sample,
							so the answer can be read off the roughly 85 deeply annotated
							records rather than taken on trust as a percentage.
						</p>
					</div>
				</Section>

				<Section n={4} heading="What would strengthen the results">
					<ol className="prose-editorial measure list-decimal pl-5">
						<li>
							<strong>A technique column, if one exists.</strong> The export has
							nothing distinguishing Radierung from Kupferstich from
							Holzschnitt. At present the model infers technique from the image;
							if the field exists somewhere, it could be stated instead.
						</li>
						<li>
							<strong>
								Published texts on works in the graphic collection.
							</strong>{' '}
							The briefing asks for example texts to guide description style.
							The three published Städel texts available to me describe a
							Tischbein painting, a Vidal photograph and a Piazzetta drawing —
							none of those artists appears in this export, and two are a
							different medium. Examples built on a painting and a photograph
							would teach the model to write about colour and surface, which
							does not transfer to pre-1800 works on paper. A handful of prints
							and a handful of drawings would be enough.
						</li>
						<li>
							<strong>Confirmation of one vocabulary deviation.</strong> The
							briefing's list for <code>Ikon.Hauptmotiv.allgemein</code> does
							not match what your database contains.{' '}
							<code>Religiöse Darstellung</code> and <code>Mythologie</code>{' '}
							appear zero times in the export; you use{' '}
							<code>Biblische Darstellung</code> (340),{' '}
							<code>Heiligendarstellung</code> (206) and{' '}
							<code>Mythologische Darstellung</code> (139). And{' '}
							<code>Personendarstellung</code> — the most common value in the
							collection, 560 records — is absent from the briefing list
							altogether. Six briefing terms are never used at all. The prompt
							is therefore built around the vocabulary in your export, with the
							briefing's unused terms kept as fallbacks. Since this departs from
							the agreed text, I would like it confirmed before the full run.
						</li>
					</ol>
				</Section>

				<Section n={5} heading="What happens next">
					<p className="font-body text-prose measure">
						I am working on a more robust evaluation — the two leading models
						re-scored with a judge that took no part in the run. It is unlikely
						to change the headline result: the OpenAI and Anthropic models lead
						on both media, and their margin over the rest is wide enough that a
						different judge should not disturb it. What the re-score settles is
						the order between those two.
					</p>
					<p className="font-body text-prose measure">
						In the meantime, everything is readable. The{' '}
						<Link to="/stadel-research/tags">keywords</Link> and the{' '}
						<Link to="/stadel-research/descriptions">descriptions</Link> are
						there sheet by sheet, and the full prompt behind each task is
						printed on its own page. If you can look through them and mark
						anything that reads wrong to you — a keyword that would not pass
						review, a description in the wrong voice — that is the most useful
						thing at this stage.
					</p>
					<p className="font-body text-prose measure">
						I would then like to schedule our next meeting to go through your
						notes together. After that, all{' '}
						{run.corpus.works.toLocaleString('en-US')} works go through the
						chosen model — the briefing's “best performer plus one comparison
						model” — and I deliver the UTF-8 CSV with semicolon delimiter plus
						the separate keyword-and-type list, as specified.
					</p>
				</Section>

				<section className="border-rule border-t pt-10">
					<Display as="h2" size="title" className="mb-6">
						The run, sheet by sheet
					</Display>
					<div className="grid gap-6 md:grid-cols-3">
						{[
							{
								to: '/stadel-research/tags',
								title: 'Keywords',
								blurb:
									'All nine schema fields, five models against your own record, on any sheet in the sample.',
							},
							{
								to: '/stadel-research/descriptions',
								title: 'Descriptions',
								blurb:
									'The bilingual texts — long and short, German and English — as each model wrote them.',
							},
							{
								to: '/stadel-research/evaluation',
								title: 'Evaluation',
								blurb:
									"The judge's score and its written justification for every model on every sheet.",
							},
						].map((card) => (
							<Link
								key={card.to}
								to={card.to}
								className="border-rule hover:border-link group flex flex-col gap-3 border p-5 no-underline transition-colors"
							>
								<Display
									as="h3"
									size="title"
									className="group-hover:text-link text-[1.0625rem]"
								>
									{card.title}
								</Display>
								<p className="font-body text-prose-sm">{card.blurb}</p>
							</Link>
						))}
					</div>
				</section>
			</div>
		</>
	)
}
