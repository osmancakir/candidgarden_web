import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { Link } from 'react-router'
import {
	Data,
	Display,
	ProvenanceStamp,
	UncertaintyNotice,
} from '#app/components/institute/primitives.tsx'
import {
	PilotHeader,
	RevisionMark,
	RevisionNotice,
} from './+shared/components.tsx'
import {
	manifest,
	pilotScoreboardFor,
	revision,
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
		revision,
		scoreboards: Object.fromEntries(
			MEDIA.map((m) => [m.id, scoreboardFor(m.id)]),
		) as Record<MediumId, ReturnType<typeof scoreboardFor>>,
		pilotScoreboards: Object.fromEntries(
			MEDIA.map((m) => [m.id, pilotScoreboardFor(m.id)]),
		) as Record<MediumId, ReturnType<typeof pilotScoreboardFor>>,
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
										to={`/staedel-research/evaluation?medium=${medium}&model=${row.model}`}
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
	const {
		manifest: run,
		revision: rev,
		scoreboards,
		pilotScoreboards,
		usage,
	} = loaderData

	return (
		<>
			<PilotHeader
				kind={`Pilot report · updated ${rev.date}`}
				title="Five models on the graphic collection"
				lead={
					<>
						I froze an evaluation sample of {run.sample.works} sheets:{' '}
						{run.sample.perMedium} prints and {run.sample.perMedium} drawings,
						capped at {run.sample.maxPerArtist} works per artist so that no
						single artist dominates it, and ran five current vision models
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
				<RevisionNotice>
					<p>
						<strong>What is new on these pages, and where to look.</strong> After
						your reply of 13 August we rewrote both prompts and re-ran the whole
						sample for the two leading models: the{' '}
						<Link to="/staedel-research/descriptions">descriptions</Link>, the{' '}
						<Link to="/staedel-research/tags">keywords</Link>, and the{' '}
						<Link to="/staedel-research/evaluation">scores</Link>, the last of
						these with a judge that takes no part in the run. Every sheet can be
						opened against the version it replaced, and anything still showing
						pilot output is marked <em>Pilot 1 Aug</em>.
					</p>
					<p>
						The descriptions no longer name a material, a printmaking or drawing
						process, or a period style: the removal you asked for. Measured
						over {rev.descriptions[0]!.before.texts} texts per model: technique
						appeared in every text before the change and in none after. The
						average German long text fell from{' '}
						{rev.descriptions.map((m) => m.before.avgLong).join(' and ')} characters to{' '}
						{rev.descriptions.map((m) => m.after.avgLong).join(' and ')}, against the{' '}
						{rev.houseReference.avgLong} your own published texts average. Every
						revised text can be opened against the version it replaced.
					</p>
					<p>
						The keywords changed under a narrower rule: no process, no material,
						no period, but keeping the mark vocabulary your own records use. That
						took banned values to zero on both models while the vocabulary you do
						catalogue nearly doubled, and the total keyword count held steady.
					</p>
					<p>
						The {rev.houseReference.texts} texts you sent are the source of that
						voice. {rev.houseReference.withImageInExport} of them are works in
						this export, so we hold their images;{' '}
						{rev.houseReference.usedAsExamples} of those are shown to the model
						as examples, three per medium. All{' '}
						{rev.houseReference.withImageInExport} are held out of the full run.
						You have already written those texts, so there is nothing for us to
						add there.
					</p>
				</RevisionNotice>

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
										'Status',
										'Calls',
										'Tokens in',
										'Tokens out',
									].map((h) => (
										<th
											key={h}
											scope="col"
											className={
												'font-data text-data-sm text-ground-muted py-2 pr-4 tracking-[0.12em] uppercase ' +
												(h === 'Provider' || h === 'Model' || h === 'Status'
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
											<td className="py-2 pr-4">
												<RevisionMark kind={model.status} />
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
						Token counts are the sample only: {run.sample.works} sheets across
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
						Each model's keyword output was scored against the image itself by an
						independent judge, with the model names hidden. There are two
						scoreboards below because there were two judges, and their numbers do
						not sit on one scale.
					</p>

					<div className="flex flex-col gap-3">
						<div className="flex flex-wrap items-baseline gap-3">
							<RevisionMark kind="pilot" />
							<Data className="text-ground-muted normal-case">
								five models, judged by one of the contestants
							</Data>
						</div>
						<ScoreTable
							medium="prints"
							rows={pilotScoreboards.prints}
							models={run.models}
						/>
						<ScoreTable
							medium="drawings"
							rows={pilotScoreboards.drawings}
							models={run.models}
						/>
					</div>

					<div className="prose-editorial measure">
						<p>
							This is the run that decided the roster, and for that it is
							sufficient. Mistral scores lowest on both media, well over a point
							behind the next model. Google and xAI score level with each other
							and behind both leaders. Iconography is the category that
							separates them, spanning 5.2 to 9.2; atmosphere and emotion sit
							between 8.0 and 9.0 for everyone and say very little.
						</p>
						<p>
							What it could <em>not</em> decide is the order at the top, because
							the judge was itself the model it placed first.
						</p>
					</div>

					<div className="flex flex-col gap-3">
						<div className="flex flex-wrap items-baseline gap-3">
							<RevisionMark kind="revised" />
							<Data className="text-ground-muted normal-case">
								two models, judged by a model outside the run
							</Data>
						</div>
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
					</div>

					<div className="prose-editorial measure">
						<p>
							The suspicion was right. On identical keywords, swapping the judge
							reverses the order: the pilot's leader falls behind by 0.25 on
							prints and 0.23 on drawings, and on a paired test across the
							twenty sheets that reversal is statistically significant. The lead
							we reported on 1 August was the judge preferring its own output.
						</p>
						<p>
							<strong>
								That does not make the other model the winner, and we are not
								presenting an order.
							</strong>{' '}
							The keyword revision improved both, and improved the pilot's
							leader more, which closed the gap again. On the current keywords
							the two are 0.05 and 0.13 apart on a 20-sheet sample, well inside
							the noise. The honest statement is that a neutral judge does not
							separate them on keywords.
						</p>
						<p>
							Where they do separate is the descriptions. Against the length
							your own published texts occupy, one model lands inside the range
							on {rev.descriptions[0]!.after.inBand} of{' '}
							{rev.descriptions[0]!.after.texts} sheets and the other on{' '}
							{rev.descriptions[1]!.after.inBand}. That is a clearer difference
							than anything in the tables above, and it is on the task you gave
							us the most direct instruction about.
						</p>
						<p>
							The two scoreboards are roughly two points apart throughout. That
							gap is the judge's calibration, not a change in quality; the{' '}
							<Link to="/staedel-research/evaluation">evaluation page</Link>{' '}
							separates the two with a third scoring pass and shows the working.
						</p>
					</div>
					<UncertaintyNotice notice="No order presented between the two finalists · difference within noise at n=20" />
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
							has not performed worse there; there is simply less catalogue to
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
							briefing asks for (<code>Assoziation.Person</code>,{' '}
							<code>Assoziation.Thema</code>, <code>Atmosphäre</code> and{' '}
							<code>Emotion</code>) are empty across all {run.sample.works}{' '}
							sample records. That is by design: they are the categories the
							project exists to add. A comparison against the catalogue is
							therefore blind to nearly half the output.
						</p>
						<p>
							The evaluation therefore scores the models against the artwork
							itself, which needs no catalogue and covers all four categories.
							Your records remain the backbone of every run: they supply the
							work list, the metadata in each prompt, and the images. They are
							simply not being used as a scoreboard.
						</p>
						<p>
							The underlying question (what would this actually add to the
							catalogue?) is still answerable, and directly. The{' '}
							<Link to="/staedel-research/tags">keyword comparison</Link> puts
							your record beside all five models on every sheet in the sample,
							so the answer can be read off the roughly 85 deeply annotated
							records rather than taken on trust as a percentage.
						</p>
					</div>
				</Section>

				<Section n={4} heading="What was asked for, and what came back">
					<p className="font-body text-prose measure">
						The pilot report closed with three requests. All three have been
						answered, and the answers changed the work rather than merely
						confirming it.
					</p>
					<ol className="prose-editorial measure list-decimal pl-5">
						<li>
							<strong>The technique column: withdrawn, and inverted.</strong>{' '}
							We asked whether a field existed distinguishing Radierung from
							Kupferstich from Holzschnitt. Rather than supply one you asked
							that the descriptions stop making claims of this kind at all,
							since each has to be checked by hand. That is now the firmest rule
							in the prompt, and it removes the need for the column: a text that
							never names a technique cannot get one wrong.
						</li>
						<li>
							<strong>
								The example texts: {rev.houseReference.texts} received, and
								they set the voice.
							</strong>{' '}
							{rev.houseReference.withImageInExport} of them are works in this
							export, so we hold their images and can pair each text with what
							the curator was looking at.{' '}
							{rev.houseReference.usedAsExamples} of those go into the prompt as
							examples, three per medium, chosen to span distinct kinds of text
							rather than to repeat one. They also settled the length: your
							texts run {rev.houseReference.minLong}–{rev.houseReference.maxLong}{' '}
							characters and average {rev.houseReference.avgLong}, where the
							pilot's averaged {rev.descriptions[0]!.before.avgLong} and{' '}
							{rev.descriptions[1]!.before.avgLong}. The briefing's 800 was a cap the
							models were treating as a target.
						</li>
						<li>
							<strong>The vocabulary deviation: confirmed.</strong> The prompt
							keeps the vocabulary your export actually uses, with the
							briefing's unused terms as fallbacks.
						</li>
					</ol>
					<p className="font-body text-prose measure">
						Checking the instruction about technique against the keyword fields
						turned up something worth putting back to you. Across the 4,583{' '}
						<code>Ikon.Thema</code> values in the export, your records name a
						process (<code>Radierung</code>, <code>Kupferstich</code>,{' '}
						<code>Holzschnitt</code>) zero times and a period style zero times,
						but they do record <code>Schraffur</code> 43 times, alongside{' '}
						<code>Licht</code>, <code>Schatten</code> and{' '}
						<code>Hell-Dunkel-Kontrast</code>, on the two formal axes the
						briefing asks for.
					</p>
					<p className="font-body text-prose measure">
						So the keyword prompt now bans the process and the period (the
						error-prone half, and the half you never catalogue) while keeping
						the visible mark vocabulary, which you do. A blanket ban would have
						put the output at odds with your own records.{' '}
						<strong>
							If you intended the instruction to reach the keywords as
							completely as it reaches the texts, and we will drop that
							vocabulary too.
						</strong>
					</p>
					<UncertaintyNotice notice="Keywords re-run under the narrowed rule · zero process or period terms across both finalists at n=40" />
				</Section>

				<Section n={5} heading="What happens next">
					<p className="font-body text-prose measure">
						The re-score is done, and it did not produce a winner. It established
						two things instead: the pilot's ranking was an artefact of the judge,
						and a neutral judge does not separate the two remaining models on
						keywords. We would rather tell you that than manufacture an order out
						of a 0.05 difference.
					</p>
					<p className="font-body text-prose measure">
						I will be waiting now for your reading of the revised output. The{' '}
						<Link to="/staedel-research/descriptions">descriptions</Link> and{' '}
						<Link to="/staedel-research/tags">keywords</Link> are there sheet by
						sheet, each openable against what it replaced, and the full prompt
						behind each task is printed on its page. If the voice is still not
						yours, or a keyword would not pass review, marking one or two is
						enough. The pattern is usually visible from a small number.
					</p>
				</Section>

				<section className="border-rule border-t pt-10">
					<Display as="h2" size="title" className="mb-6">
						The run, sheet by sheet
					</Display>
					<div className="grid gap-6 md:grid-cols-3">
						{[
							{
								to: '/staedel-research/tags',
								title: 'Keywords',
								blurb:
									'All nine schema fields, five models against your own record, on any sheet in the sample.',
							},
							{
								to: '/staedel-research/descriptions',
								title: 'Descriptions',
								blurb:
									'The bilingual texts (long and short, German and English) as each model wrote them.',
							},
							{
								to: '/staedel-research/evaluation',
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
