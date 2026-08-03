import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { Link } from 'react-router'
import {
	Data,
	Display,
	NoRecords,
	UncertaintyNotice,
} from '#app/components/institute/primitives.tsx'
import {
	MediumSwitch,
	Plate,
	ScoreMeter,
	SelectionConsole,
	SheetPager,
	useHrefWith,
	WorkMetadata,
} from './+shared/components.tsx'
import {
	evaluationForWork,
	manifest,
	resolveModel,
	resolveSelection,
	scoreboardFor,
	tagsForWorkAndModel,
	worksInMedium,
} from './+shared/pilot.server.ts'
import {
	displayDating,
	mediumGerman,
	mediumLabel,
	SCORE_CATEGORIES,
	type ScoreCategory,
} from './+shared/schema.ts'
import { type Route } from './+types/evaluation.ts'

// Gated by the layout's role check, so it must not be advertised in
// sitemap.xml. remix-seo includes every static route unless told otherwise.
export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

/**
 * How the models were scored, and what the scores do and do not support.
 *
 * The leaderboard is the only thing on these four pages that gets the void
 * ground: it is the one claim the pilot makes, so it is the one place the
 * design raises its voice. Directly beneath it sits the reason the claim is
 * provisional — the judge in this run was itself one of the contestants — and
 * that caveat is not a footnote, because a ranking read without it is wrong.
 *
 * Every score links to its own justification. The judge wrote a sentence per
 * category per sheet; publishing the numbers without those sentences would ask
 * the museum to trust an average over 20 works it cannot inspect.
 */

export const meta: Route.MetaFunction = () => [
	{ title: 'Evaluation · Städel pilot · Candid Garden' },
	{ name: 'robots', content: 'noindex, nofollow' },
]

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url)
	const { medium, work } = resolveSelection(url)
	const modelId = resolveModel(url)
	const sheets = worksInMedium(medium)
	const scoreboard = scoreboardFor(medium)

	const position = work ? sheets.findIndex((w) => w.id === work.id) : -1
	const neighbour = (index: number) => {
		const sheet = index < 0 ? undefined : sheets[index]
		return sheet ? { id: sheet.id, objectNumber: sheet.objectNumber } : null
	}

	return {
		medium,
		modelId,
		models: manifest.models,
		scoreboard,
		sheets: sheets.map((w) => ({
			id: w.id,
			objectNumber: w.objectNumber,
			title: w.title,
		})),
		work,
		/** Browse mode: how the selected model scored on each of the 20 sheets. */
		rows: work
			? null
			: sheets.map((w) => {
					const result = evaluationForWork(w.id).find(
						(entry) => entry.model.id === modelId,
					)?.result
					return {
						id: w.id,
						objectNumber: w.objectNumber,
						objectKey: w.objectKey,
						title: w.title,
						artist: w.artist,
						notBefore: w.notBefore,
						notAfter: w.notAfter,
						scores: result?.scores ?? null,
						overall: result?.overall ?? null,
						tagCount: tagsForWorkAndModel(w.id, modelId).total,
					}
				}),
		/** Sheet mode: all five models ranked on the one sheet, with reasons. */
		byModel: work ? evaluationForWork(work.id) : null,
		position: work ? { index: position + 1, total: sheets.length } : null,
		previous: work ? neighbour(position - 1) : null,
		next: work ? neighbour(position + 1) : null,
	}
}

export default function StadelEvaluation({ loaderData }: Route.ComponentProps) {
	const { medium, modelId, models, scoreboard, sheets, work, rows } = loaderData
	const hrefWith = useHrefWith()
	const selectedModel = models.find((m) => m.id === modelId)
	const leader = scoreboard[0]
	const runnerUp = scoreboard[1]

	return (
		<>
			<header className="border-rule container border-b py-10 md:py-14">
				<div className="grid gap-8 lg:grid-cols-12">
					<div className="lg:col-span-8">
						<Data className="text-ground-muted mb-4 block tracking-[0.2em]">
							Evaluation · masked judge
						</Data>
						<Display as="h1" size="chapter" className="measure-wide">
							Scored against the picture, not the catalogue
						</Display>
						<p className="font-body text-prose-lg measure mt-6">
							Each model's keyword output was put back in front of an
							independent judge model together with the image, and scored out of
							ten on four categories. Model names were hidden, so the judge
							could not recognise whose output it was reading. Twenty sheets per
							medium, five models, one written justification per category per
							sheet. All of it readable here.
						</p>
					</div>
					<div className="flex flex-col justify-end gap-3 lg:col-span-4">
						<Data className="text-ground-muted">Medium</Data>
						<MediumSwitch
							current={medium}
							hrefFor={(next) => hrefWith({ medium: next, work: null })}
						/>
						<p className="font-body text-prose-sm text-ground-muted">
							Scoring the models against the museum's own annotations was tried
							and removed; the reason is set out in{' '}
							<Link
								to="/stadel-research#why-the-catalogue-comparison-was-set-aside"
								className="text-link underline underline-offset-4"
							>
								§3 of the report
							</Link>
							.
						</p>
					</div>
				</div>
			</header>

			{/*
			 * The one claim the pilot makes gets the deep ground (§2, §5).
			 * `register-level-3` rather than `register-void`, because §2 defines
			 * depth relative to the resting ground: void under GROUND PAPER, paper
			 * under GROUND VOID. Pinning it to void would render the leaderboard
			 * void-on-void for a reader in the dark theme and lose the whole point
			 * of raising the voice here.
			 */}
			<section className="register-level-3 px-5 py-14 md:px-8 md:py-20">
				<div className="container flex flex-col gap-8">
					<div className="border-rule flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 border-b pb-3">
						<h2 className="flex items-baseline gap-3">
							<Data className="text-ground-muted">Ranking</Data>
							<Data className="tracking-[0.2em]">
								{mediumLabel(medium)} · {mediumGerman(medium)}
							</Data>
						</h2>
						<Data className="text-ground-muted normal-case">
							mean of 20 sheets · out of 10
						</Data>
					</div>

					<ol className="flex flex-col">
						{scoreboard.map((row, i) => {
							const model = models.find((m) => m.id === row.model)
							const isSelected = row.model === modelId
							return (
								<li
									key={row.model}
									className="border-rule grid items-baseline gap-x-8 gap-y-4 border-b py-6 md:grid-cols-12"
								>
									<div className="flex items-baseline gap-4 md:col-span-5">
										<Data className="text-ground-muted tabular-nums">
											{String(i + 1).padStart(2, '0')}
										</Data>
										<div className="flex flex-col gap-1">
											<Link
												to={hrefWith({ model: row.model, work: null })}
												aria-current={isSelected ? 'true' : undefined}
												className="hover:text-link no-underline"
											>
												<Display
													as="span"
													size="title"
													className="block break-words"
												>
													{model?.label ?? row.model}
												</Display>
											</Link>
											<Data className="text-ground-muted">
												{model?.provider}
											</Data>
										</div>
									</div>
									<div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 md:col-span-5">
										{SCORE_CATEGORIES.map((c) => (
											<ScoreMeter
												key={c.id}
												value={row[c.id]}
												label={c.label}
											/>
										))}
									</div>
									<div className="md:col-span-2 md:text-right">
										<Data className="text-ground-muted block">Overall</Data>
										<span className="font-data text-data-lg tabular-nums">
											{row.overall?.toFixed(2) ?? '—'}
										</span>
									</div>
								</li>
							)
						})}
					</ol>

					<UncertaintyNotice
						notice={`Ranking provisional · the judge was itself one of the contestants · margin over runner-up ${
							leader && runnerUp
								? (leader.overall! - runnerUp.overall!).toFixed(2)
								: '—'
						} · re-score with a neutral judge pending`}
					/>
					<p className="font-body text-prose-sm measure text-ground-muted">
						Iconography is the category that separates the models: it spans more
						than four points across the roster. Atmosphere and emotion sit
						between 8.0 and 9.0 for every model, and at this sample size say
						very little. Read them as a floor, not as a result.
					</p>
				</div>
			</section>

			<div className="container flex flex-col gap-8 py-10 md:py-14">
				<SelectionConsole
					medium={medium}
					workId={work?.id ?? null}
					modelId={modelId}
					works={sheets}
					models={models}
					resetTo={`?medium=${medium}`}
					summary={
						work
							? `${work.objectNumber} · all five models judged`
							: `${sheets.length} sheets · ${selectedModel?.label ?? modelId}`
					}
				/>

				{work && loaderData.byModel && loaderData.position ? (
					<SheetView
						work={work}
						byModel={loaderData.byModel}
						position={loaderData.position}
						previous={loaderData.previous}
						next={loaderData.next}
						hrefWith={hrefWith}
					/>
				) : rows ? (
					<SheetTable
						rows={rows}
						modelLabel={selectedModel?.label ?? modelId}
						hrefWith={hrefWith}
					/>
				) : (
					<NoRecords>No sheets in this medium.</NoRecords>
				)}
			</div>
		</>
	)
}

/** Browse: one model down all twenty sheets, as a table that looks like one. */
function SheetTable({
	rows,
	modelLabel,
	hrefWith,
}: {
	rows: NonNullable<Awaited<ReturnType<typeof loader>>['rows']>
	modelLabel: string
	hrefWith: (changes: Record<string, string | number | null>) => string
}) {
	return (
		<div className="overflow-x-auto">
			<table className="min-w-full">
				<caption className="mb-3 text-left">
					<Data className="tracking-[0.2em]">{modelLabel}</Data>
					<Data className="text-ground-muted ml-3 normal-case">
						per sheet · click a row for the judge's reasoning
					</Data>
				</caption>
				<thead>
					<tr className="border-rule-strong border-b">
						<th
							scope="col"
							className="font-data text-data-sm text-ground-muted py-2 pr-4 text-left tracking-[0.12em] uppercase"
						>
							<span className="sr-only">Plate</span>
						</th>
						<th
							scope="col"
							className="font-data text-data-sm text-ground-muted py-2 pr-4 text-left tracking-[0.12em] uppercase"
						>
							Sheet
						</th>
						<th
							scope="col"
							className="font-data text-data-sm text-ground-muted hidden py-2 pr-4 text-right tracking-[0.12em] uppercase md:table-cell"
						>
							Values
						</th>
						{SCORE_CATEGORIES.map((c) => (
							<th
								key={c.id}
								scope="col"
								title={c.gloss}
								className="font-data text-data-sm text-ground-muted py-2 pr-4 text-right tracking-[0.12em] uppercase"
							>
								{c.label.slice(0, 4)}
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
					{rows.map((row) => (
						<tr
							key={row.id}
							className="border-rule hover:bg-tint border-b transition-colors"
						>
							<td className="w-16 py-2 pr-3 align-top">
								<Link to={hrefWith({ work: row.id })} tabIndex={-1} aria-hidden>
									<Plate
										work={{
											objectKey: row.objectKey,
											title: row.title,
											artist: row.artist,
											objectType: null,
											notBefore: row.notBefore,
											notAfter: row.notAfter,
										}}
										maxHeight="max-h-14"
										className="h-14"
										sizes="56px"
									/>
								</Link>
							</td>
							<td className="py-2 pr-4 align-top">
								<Link
									to={hrefWith({ work: row.id })}
									prefetch="intent"
									className="hover:text-link font-body text-prose-sm no-underline hover:underline"
								>
									{row.title ?? 'Untitled'}
								</Link>
								<Data className="text-ground-muted mt-0.5 block normal-case">
									{row.objectNumber} ·{' '}
									{displayDating(row.notBefore, row.notAfter)}
								</Data>
							</td>
							<td className="font-data text-data text-ground-muted hidden py-2 pr-4 text-right align-top tabular-nums md:table-cell">
								{row.tagCount}
							</td>
							{SCORE_CATEGORIES.map((c) => (
								<td
									key={c.id}
									className="font-data text-data py-2 pr-4 text-right align-top tabular-nums"
								>
									{row.scores?.[c.id]?.toFixed(1) ?? '—'}
								</td>
							))}
							<td className="font-data text-data py-2 text-right align-top font-bold tabular-nums">
								{row.overall?.toFixed(2) ?? '—'}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}

/** Sheet: all five models ranked on this one work, each with its reasoning. */
function SheetView({
	work,
	byModel,
	position,
	previous,
	next,
	hrefWith,
}: {
	work: NonNullable<Awaited<ReturnType<typeof loader>>['work']>
	byModel: NonNullable<Awaited<ReturnType<typeof loader>>['byModel']>
	position: { index: number; total: number }
	previous: { id: string; objectNumber: string } | null
	next: { id: string; objectNumber: string } | null
	hrefWith: (changes: Record<string, string | number | null>) => string
}) {
	return (
		<div className="flex flex-col gap-12">
			<div className="grid gap-8 lg:grid-cols-12">
				<div className="lg:col-span-5">
					<Plate work={work} sizes="(min-width: 1024px) 40vw, 90vw" />
				</div>
				<div className="flex flex-col gap-5 lg:col-span-7">
					<Display as="h2" size="title" className="break-words hyphens-auto">
						{work.title ?? 'Untitled'}
					</Display>
					<WorkMetadata work={work} />
					<SheetPager
						previous={previous}
						next={next}
						position={`${position.index} / ${position.total}`}
						hrefFor={(id) => hrefWith({ work: id })}
					/>
				</div>
			</div>

			<div className="flex flex-col gap-10">
				{byModel.map(({ model, result }, i) => (
					<section key={model.id} className="flex flex-col gap-5">
						<header className="border-rule-strong flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b pb-3">
							<div className="flex items-baseline gap-4">
								<Data className="text-ground-muted tabular-nums">
									{String(i + 1).padStart(2, '0')}
								</Data>
								<div>
									<Display as="h3" size="title" className="text-[1.0625rem]">
										{model.label}
									</Display>
									<Data className="text-ground-muted mt-1 block normal-case">
										{model.provider}
									</Data>
								</div>
							</div>
							<div className="text-right">
								<Data className="text-ground-muted block">Overall</Data>
								<span className="font-data text-data-lg tabular-nums">
									{result?.overall?.toFixed(2) ?? '—'}
								</span>
							</div>
						</header>

						{result ? (
							<div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
								{SCORE_CATEGORIES.map((c) => (
									<div key={c.id} className="flex flex-col gap-2">
										<ScoreMeter
											value={result.scores[c.id as ScoreCategory]}
											label={c.label}
										/>
										<p className="font-body text-prose-sm measure">
											{result.justifications[c.id as ScoreCategory] ??
												'No justification on record.'}
										</p>
									</div>
								))}
							</div>
						) : (
							<p className="font-body text-prose-sm text-ground-muted italic">
								This model was not scored on this sheet.
							</p>
						)}

						<Link
							to={`/stadel-research/tags?work=${work.id}&model=${model.id}`}
							className="font-data text-data-sm text-link tracking-[0.12em] uppercase underline underline-offset-4"
						>
							Read the keywords this scored →
						</Link>
					</section>
				))}
			</div>
		</div>
	)
}
