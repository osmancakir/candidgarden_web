import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { Link } from 'react-router'
import {
	Data,
	Display,
	NoRecords,
	UncertaintyNotice,
} from '#app/components/institute/primitives.tsx'
import { cn } from '#app/utils/misc.tsx'
import {
	DiffKeyword,
	DiffLegend,
	MediumSwitch,
	Plate,
	PromptDisclosure,
	RecordComparison,
	RevisionMark,
	RevisionNotice,
	Segmented,
	SelectionConsole,
	SheetNotes,
	SheetPager,
	TagFieldBlock,
	useHrefWith,
	WorkMetadata,
	type ComparisonSide,
} from './+shared/components.tsx'
import { diffKeywords, type KeywordDiff } from './+shared/keyword-diff.ts'
import {
	currentRound,
	keywordsFor,
	lineModel,
	lines,
	modelInfo,
	notesForWork,
	pagerFor,
	promptFor,
	resolveSelection,
	round3,
	runInfo,
	spotCheckForWork,
	worksInMedium,
} from './+shared/pilot.server.ts'
import {
	countTagRecord,
	displayDating,
	FIELDS_ABSENT_FROM_MUSEUM_RECORDS,
	FLAG_LABELS,
	mediumGerman,
	parseLine,
	TAG_FIELDS,
	TAG_SECTIONS,
	type FlagCheck,
	type LineId,
	type MediumId,
	type TagField,
} from './+shared/schema.ts'
import { type Route } from './+types/tags.ts'

// Gated by the layout's role check, so it must not be advertised in
// sitemap.xml. remix-seo includes every static route unless told otherwise.
export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

/**
 * Keyword generation, sheet by sheet.
 *
 * The museum's notes on round 2 were almost all about single values: a term
 * that should not be in Geografie, a role filed as a person, a phrase that is
 * not an authority term, a meaning filed as a visible thing. So the sheet view
 * leads with a diff — round 3 against round 2, one model at a time — in which
 * every value is marked kept, new, dropped or moved, and every value an
 * automatic check flags carries the flag. The comparison against the Städel's
 * own record, and against the other model, stays one click away.
 */

export const meta: Route.MetaFunction = () => [
	{ title: 'Keywords · Städel research · Candid Garden' },
	{ name: 'robots', content: 'noindex, nofollow' },
]

const COMPARE = ['previous', 'museum', 'other'] as const
type Compare = (typeof COMPARE)[number]
const parseCompare = (value: string | null): Compare =>
	COMPARE.includes(value as Compare) ? (value as Compare) : 'previous'

/** The flags that answer one of the museum's notes, in the order of the notes. */
const RULE_ROWS: Array<{ check: FlagCheck; note: string }> = [
	{ check: 'artist', note: 'The work’s artist under Assoziation.Person' },
	{ check: 'geo', note: 'Geografie values that are not a named place' },
	{ check: 'role', note: 'Unnamed roles filed as persons' },
	{ check: 'compound', note: 'Open compounds in the subject fields' },
	{ check: 'title', note: 'The catalogue title copied into the main motif' },
	{ check: 'banned', note: 'Technique, material or period' },
]

function ruleTable(medium: MediumId) {
	const measures = round3.keywordMeasures[medium]
	return {
		lines: lines.map((line) => {
			const before = runInfo(line.id, 'revision')!
			const after = runInfo(line.id, currentRound.id)!
			return {
				id: line.id,
				before: { label: before.model.label, ...measures[before.key]! },
				after: { label: after.model.label, ...measures[after.key]! },
			}
		}),
	}
}

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url)
	const { medium, work } = resolveSelection(url)
	const line = parseLine(url.searchParams.get('line'))
	const compare = parseCompare(url.searchParams.get('compare'))
	const changesOnly = url.searchParams.get('show') === 'changes'
	const otherLine: LineId = line === 'openai' ? 'anthropic' : 'openai'
	const sheets = worksInMedium(medium)

	const current = runInfo(line, currentRound.id)!
	const previous = runInfo(line, 'revision')!
	const other = runInfo(otherLine, currentRound.id)!

	const lineOptions = lines.map((l) => {
		const model = modelInfo(lineModel(l.id, currentRound.id)!)!
		return { id: l.id, label: model.label, provider: model.provider }
	})

	const sheet = work
		? (() => {
				const now = keywordsFor(work.id, current.key) ?? {
					fields: {},
					total: 0,
					flags: [],
				}
				const before = keywordsFor(work.id, previous.key) ?? {
					fields: {},
					total: 0,
					flags: [],
				}
				const theirs = keywordsFor(work.id, other.key) ?? {
					fields: {},
					total: 0,
					flags: [],
				}
				const spot = spotCheckForWork(work.id)
				return {
					...pagerFor(medium, work.id),
					notes: notesForWork(work),
					spotCheck: spot
						? {
								...spot,
								runs: spot.runs.map((r) => {
									const [round, model] = r.run.split('/') as [string, string]
									return {
										...r,
										round: round === 'round3' ? 'Round 3' : 'Round 2',
										model: modelInfo(model)?.label ?? model,
									}
								}),
							}
						: null,
					now,
					before,
					theirs,
					diff: diffKeywords(before, now),
				}
			})()
		: null

	return {
		medium,
		line,
		compare,
		changesOnly,
		lineOptions,
		current: { label: current.model.label, provider: current.model.provider },
		previous: { label: previous.model.label },
		other: { label: other.model.label, provider: other.model.provider },
		rules: ruleTable(medium),
		prompt: promptFor(medium, 'tags'),
		sheets: sheets.map((w) => ({
			id: w.id,
			objectNumber: w.objectNumber,
			title: w.title,
		})),
		work,
		sheet,
		rows: work
			? null
			: sheets.map((w) => {
					const now = keywordsFor(w.id, current.key)
					const before = keywordsFor(w.id, previous.key)
					return {
						id: w.id,
						objectNumber: w.objectNumber,
						objectKey: w.objectKey,
						title: w.title,
						artist: w.artist,
						notBefore: w.notBefore,
						notAfter: w.notAfter,
						inNotes: w.notes.length > 0,
						now: now?.total ?? 0,
						before: before?.total ?? 0,
						flagsNow: now?.flags.length ?? 0,
						flagsBefore: before?.flags.length ?? 0,
					}
				}),
	}
}

export default function StadelTags({ loaderData }: Route.ComponentProps) {
	const { medium, line, lineOptions, prompt, sheets, work, rows, current } =
		loaderData
	const hrefWith = useHrefWith()

	return (
		<>
			<header className="border-rule container border-b py-10 md:py-14">
				<div className="grid gap-8 lg:grid-cols-12">
					<div className="lg:col-span-8">
						<Data className="text-ground-muted mb-4 block tracking-[0.2em]">
							Task 1 · Iconographic keywords
						</Data>
						<Display as="h1" size="chapter" className="measure-wide">
							What round 3 changed, value by value
						</Display>
						<p className="font-body text-prose-lg measure mt-6">
							Open any sheet to see one model’s round-3 keywords against its
							round-2 keywords: every value marked as kept, new, dropped or
							moved to another field. The comparison with your own record, and
							with the other model, is a switch on the same page.
						</p>
					</div>
					<div className="flex flex-col justify-end gap-3 lg:col-span-4">
						<Data className="text-ground-muted">Medium</Data>
						<MediumSwitch
							current={medium}
							hrefFor={(next) => hrefWith({ medium: next, work: null })}
						/>
					</div>
				</div>
			</header>

			<div className="container flex flex-col gap-8 pb-16">
				<RevisionNotice
					caption={`the rules of your notes, counted on the ${mediumGerman(medium)} sample`}
				>
					<p>
						Each row counts the values an automatic check flags, in round 2 and
						in round 3, across the 20 sheets of this medium. The checks are word
						lists and patterns, so a count is an indicator rather than a
						verdict. Flagged values carry a ⚑ on every sheet, so you can judge
						each one yourself.
					</p>
					<RuleTable rules={loaderData.rules} />
				</RevisionNotice>

				<PromptDisclosure
					prompt={prompt}
					label={`The round-3 keyword prompt for ${mediumGerman(medium)}, in full`}
				/>

				<SelectionConsole
					medium={medium}
					workId={work?.id ?? null}
					modelId={line}
					modelParam="line"
					works={sheets}
					models={lineOptions}
					resetTo={`?medium=${medium}`}
					summary={
						work
							? `${work.objectNumber} · ${current.label}`
							: `${sheets.length} sheets · ${current.label} · round 3`
					}
				/>

				{work && loaderData.sheet ? (
					<SheetView
						work={work}
						sheet={loaderData.sheet}
						data={loaderData}
						hrefWith={hrefWith}
					/>
				) : rows ? (
					<SheetGrid rows={rows} line={line} hrefWith={hrefWith} />
				) : (
					<NoRecords>No sheets in this medium.</NoRecords>
				)}
			</div>
		</>
	)
}

/**
 * Round 2 against round 3 for each rule, per model. The total number of values
 * is the first row, because it fell, and a reader should weigh the falling flag
 * counts against it rather than discover it later.
 */
function RuleTable({
	rules,
}: {
	rules: Awaited<ReturnType<typeof loader>>['rules']
}) {
	const cell = (before: number, after: number, total?: [number, number]) => (
		<span className="tabular-nums">
			<span className="text-ground-muted">
				{before}
				{total ? `/${total[0]}` : ''}
			</span>
			<span className="text-ground-muted mx-1.5">→</span>
			<span className={cn(after < before ? 'text-link' : 'text-ground-fg')}>
				{after}
				{total ? `/${total[1]}` : ''}
			</span>
		</span>
	)
	return (
		<div className="overflow-x-auto">
			<table className="min-w-full">
				<thead>
					<tr className="border-rule-strong border-b">
						<th
							scope="col"
							className="font-data text-data-sm text-ground-muted py-2 pr-4 text-left tracking-[0.12em] uppercase"
						>
							Rule
						</th>
						{rules.lines.map((l) => (
							<th
								key={l.id}
								scope="col"
								className="font-data text-data-sm text-ground-muted py-2 pr-4 text-right tracking-normal"
							>
								{l.before.label} → {l.after.label}
							</th>
						))}
					</tr>
				</thead>
				<tbody className="font-data text-data">
					<tr className="border-rule border-b">
						<th
							scope="row"
							className="font-body text-prose-sm py-2 pr-4 text-left font-normal"
						>
							Keyword values, all fields
						</th>
						{rules.lines.map((l) => (
							<td key={l.id} className="py-2 pr-4 text-right">
								<span className="tabular-nums">
									<span className="text-ground-muted">{l.before.values}</span>
									<span className="text-ground-muted mx-1.5">→</span>
									{l.after.values}
								</span>
							</td>
						))}
					</tr>
					{RULE_ROWS.map((row) => (
						<tr key={row.check} className="border-rule border-b">
							<th
								scope="row"
								className="font-body text-prose-sm py-2 pr-4 text-left font-normal"
							>
								{row.note}
							</th>
							{rules.lines.map((l) => (
								<td key={l.id} className="py-2 pr-4 text-right">
									{row.check === 'geo'
										? cell(l.before.geo, l.after.geo, [
												l.before.geoTotal,
												l.after.geoTotal,
											])
										: cell(l.before[row.check], l.after[row.check])}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}

/** The browse view: twenty sheets, with how much each changed. */
function SheetGrid({
	rows,
	line,
	hrefWith,
}: {
	rows: NonNullable<Awaited<ReturnType<typeof loader>>['rows']>
	line: LineId
	hrefWith: (changes: Record<string, string | number | null>) => string
}) {
	return (
		<div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{rows.map((row) => (
				<article key={row.id} className="flex flex-col gap-3">
					<Link
						to={hrefWith({ work: row.id, line })}
						prefetch="intent"
						className="block no-underline"
					>
						<Plate
							work={{
								objectKey: row.objectKey,
								title: row.title,
								artist: row.artist,
								objectType: null,
								notBefore: row.notBefore,
								notAfter: row.notAfter,
							}}
							maxHeight="max-h-72"
							sizes="(min-width: 1280px) 18rem, (min-width: 640px) 45vw, 90vw"
						/>
					</Link>
					<div className="flex flex-col gap-1">
						<Display as="h3" size="title" className="text-[1rem] leading-tight">
							<Link
								to={hrefWith({ work: row.id, line })}
								className="hover:text-link no-underline"
							>
								{row.title ?? 'Untitled'}
							</Link>
						</Display>
						<p className="font-body text-prose-sm italic">
							{row.artist ?? 'Unattributed'}
							{', '}
							<span className="not-italic">
								{displayDating(row.notBefore, row.notAfter)}
							</span>
						</p>
						<dl className="border-rule mt-1 flex flex-wrap gap-x-5 gap-y-1 border-t pt-2">
							<div className="flex items-baseline gap-2">
								<Data className="text-ground-muted">{row.objectNumber}</Data>
							</div>
							<div
								className="flex items-baseline gap-2"
								title="Keyword values, round 2 → round 3"
							>
								<Data className="text-ground-muted">Values</Data>
								<Data className="tabular-nums">
									{row.before} → {row.now}
								</Data>
							</div>
							<div
								className="flex items-baseline gap-2"
								title="Values an automatic check flags, round 2 → round 3"
							>
								<Data className="text-stamp-fg">⚑</Data>
								<Data className="tabular-nums">
									{row.flagsBefore} → {row.flagsNow}
								</Data>
							</div>
						</dl>
						{row.inNotes ? (
							<Data className="text-link mt-1 normal-case">
								Named in your notes
							</Data>
						) : null}
					</div>
				</article>
			))}
		</div>
	)
}

type LoaderData = Awaited<ReturnType<typeof loader>>

/** The sheet view: plate and notes, then the comparison the reader chose. */
function SheetView({
	work,
	sheet,
	data,
	hrefWith,
}: {
	work: NonNullable<LoaderData['work']>
	sheet: NonNullable<LoaderData['sheet']>
	data: LoaderData
	hrefWith: (changes: Record<string, string | number | null>) => string
}) {
	const { compare, changesOnly, current, previous, other } = data
	const museumTotal = countTagRecord(work.museum)

	return (
		<div className="flex flex-col gap-10">
			<div className="grid gap-8 lg:grid-cols-12">
				<div className="lg:col-span-5">
					<Plate work={work} sizes="(min-width: 1024px) 40vw, 90vw" />
				</div>
				<div className="flex flex-col gap-5 lg:col-span-7">
					<Display as="h2" size="title" className="break-words hyphens-auto">
						{work.title ?? 'Untitled'}
					</Display>
					<WorkMetadata work={work} />
					<SheetNotes notes={sheet.notes} />
					<SheetPager
						previous={sheet.previous}
						next={sheet.next}
						position={`${sheet.position.index} / ${sheet.position.total}`}
						hrefFor={(id) => hrefWith({ work: id })}
					/>
				</div>
			</div>

			{sheet.spotCheck ? <SpotCheckTable check={sheet.spotCheck} /> : null}

			<div className="border-rule flex flex-wrap items-end gap-x-8 gap-y-4 border-t pt-6">
				<Segmented
					label="Model"
					current={data.line}
					options={data.lineOptions.map((l) => ({
						id: l.id,
						label: l.label,
					}))}
					hrefFor={(id) => hrefWith({ line: id })}
				/>
				<Segmented
					label={`Compare ${current.label} with`}
					current={compare}
					options={[
						{ id: 'previous', label: `Round 2 · ${previous.label}` },
						{ id: 'museum', label: 'Städel record' },
						{ id: 'other', label: other.label },
					]}
					hrefFor={(id) => hrefWith({ compare: id === 'previous' ? null : id })}
				/>
				{compare === 'previous' ? (
					<Segmented
						label="Show"
						current={changesOnly ? 'changes' : 'all'}
						options={[
							{ id: 'all', label: 'All values' },
							{ id: 'changes', label: 'Changes only' },
						]}
						hrefFor={(id) => hrefWith({ show: id === 'all' ? null : id })}
					/>
				) : null}
			</div>

			{compare === 'previous' ? (
				<DiffView
					diff={sheet.diff}
					changesOnly={changesOnly}
					beforeLabel={previous.label}
					afterLabel={current.label}
				/>
			) : (
				<SideBySide
					left={
						compare === 'museum'
							? {
									heading: 'Städel record',
									subheading: `As catalogued · ${museumTotal} values`,
									record: work.museum,
									isMuseum: true,
								}
							: {
									heading: other.label,
									subheading: `${other.provider} · ${sheet.theirs.total} values`,
									record: sheet.theirs.fields,
									flags: sheet.theirs.flags,
									mark: 'round3',
								}
					}
					right={{
						heading: current.label,
						subheading: `${current.provider} · ${sheet.now.total} values`,
						record: sheet.now.fields,
						flags: sheet.now.flags,
						mark: 'round3',
					}}
				/>
			)}
			{compare === 'museum' && museumTotal === 0 ? (
				<UncertaintyNotice notice="No iconographic annotation on record for this sheet · nothing to compare against" />
			) : null}
		</div>
	)
}

/**
 * Where the terms a note names sit on this sheet, run by run. Every matching
 * value is listed with its field, and those in the field the note asks for are
 * set in the accent: a curator reads the placement, not a pass mark.
 */
function SpotCheckTable({
	check,
}: {
	check: NonNullable<NonNullable<LoaderData['sheet']>['spotCheck']>
}) {
	return (
		<section className="border-rule flex flex-col gap-3 border p-4">
			<div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
				<Data className="tracking-[0.2em]">Where the terms sit</Data>
				<Data className="text-ground-muted break-all normal-case">
					In the accent: filed under {check.want}, as your note asks
				</Data>
			</div>
			<ul className="flex flex-col">
				{check.runs.map((run) => (
					<li
						key={run.run}
						className="border-rule flex flex-col gap-x-4 gap-y-1 border-t py-2 sm:flex-row sm:items-baseline"
					>
						<div className="flex shrink-0 items-baseline gap-3 sm:w-72">
							<RevisionMark
								kind={run.round === 'Round 3' ? 'round3' : 'revised'}
							/>
							<span className="font-body text-prose-sm">{run.model}</span>
						</div>
						{run.hits.length ? (
							<ul className="flex min-w-0 flex-wrap gap-x-4 gap-y-1">
								{run.hits.map((hit, i) => (
									<li
										key={`${hit.field}-${hit.value}-${i}`}
										className={cn(
											'font-data text-data-sm tracking-normal break-all',
											hit.field === check.want
												? 'text-link'
												: 'text-ground-muted',
										)}
									>
										<span className="text-ground-fg">{hit.value}</span>
										<span className="ml-1.5">
											{hit.field.replace(/^Ikon\./, '')}
											{hit.type ? ` · ${hit.type}` : ''}
										</span>
									</li>
								))}
							</ul>
						) : (
							<span className="font-body text-prose-sm text-ground-muted italic">
								None of these terms.
							</span>
						)}
					</li>
				))}
			</ul>
		</section>
	)
}

/** Round 2 against round 3 in one column: the diff, by the four bands. */
function DiffView({
	diff,
	changesOnly,
	beforeLabel,
	afterLabel,
}: {
	diff: KeywordDiff
	changesOnly: boolean
	beforeLabel: string
	afterLabel: string
}) {
	const t = diff.totals
	const moved = t.movedIn
	const visible = (status: string) => !changesOnly || status !== 'kept'
	const fields = new Map(diff.fields.map((f) => [f.field, f]))

	return (
		<div className="flex flex-col gap-8">
			<div className="flex flex-col gap-3">
				<p className="font-body text-prose measure">
					<strong>{afterLabel}</strong> (round 3) against{' '}
					<strong>{beforeLabel}</strong> (round 2):{' '}
					<span className="text-link">{t.added} new</span>,{' '}
					<span className="text-ground-muted">{t.removed} dropped</span>,{' '}
					{moved} moved to another field, {t.kept} kept. Automatic checks flag{' '}
					{diff.flagsBefore} values in round 2 and {diff.flagsAfter} in round 3.
				</p>
				<DiffLegend />
			</div>

			{TAG_SECTIONS.map((section) => {
				const sectionFields = section.fields
					.map((f) => fields.get(f))
					.filter((f) => f !== undefined)
					.filter((f) => !changesOnly || f.counts.kept < countAll(f.counts))
				if (changesOnly && sectionFields.length === 0) return null
				return (
					<section key={section.title} className="flex flex-col gap-5">
						<div className="border-rule-strong border-b pb-2">
							<Data className="tracking-[0.2em]">{section.title}</Data>
							<p className="font-body text-prose-sm text-ground-muted mt-1">
								{section.blurb}
							</p>
						</div>
						{section.fields.map((field) => {
							const f = fields.get(field)
							if (!f) {
								return changesOnly ? null : (
									<EmptyField key={field} field={field} />
								)
							}
							if (changesOnly && f.counts.kept === countAll(f.counts)) {
								return null
							}
							return (
								<div key={field} className="border-rule border-t pt-3">
									<div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
										<div className="flex flex-wrap items-baseline gap-x-3">
											<h4 className="font-data text-data text-ground-fg tracking-[0.06em]">
												{field}
											</h4>
											<Data className="text-ground-muted tracking-normal normal-case opacity-80">
												{TAG_FIELDS[field].gloss}
											</Data>
										</div>
										<Data className="text-ground-muted tabular-nums">
											{f.counts.added + f.counts.movedIn > 0 ? (
												<span className="text-link mr-3">
													+{f.counts.added + f.counts.movedIn}
												</span>
											) : null}
											{f.counts.removed + f.counts.movedOut > 0 ? (
												<span className="mr-3">
													−{f.counts.removed + f.counts.movedOut}
												</span>
											) : null}
											{f.counts.kept} kept
										</Data>
									</div>
									<div className="grid gap-x-8 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
										{f.groups.map((group) => {
											const values = group.values.filter((v) =>
												visible(v.status),
											)
											if (!values.length) return null
											return (
												<div
													key={group.type ?? '—'}
													className={cn(
														group.type === null &&
															'md:col-span-2 xl:col-span-3',
													)}
												>
													{group.type ? (
														<Data className="text-link mb-1.5 block">
															{group.type}
														</Data>
													) : null}
													<div className="flex flex-wrap gap-1.5">
														{values.map((v, i) => (
															<DiffKeyword
																key={`${v.value}-${v.status}-${i}`}
																value={v}
															/>
														))}
													</div>
												</div>
											)
										})}
									</div>
								</div>
							)
						})}
					</section>
				)
			})}
		</div>
	)
}

const countAll = (counts: Record<string, number>) =>
	Object.values(counts).reduce((a, b) => a + b, 0)

function EmptyField({ field }: { field: TagField }) {
	return (
		<div className="border-rule flex flex-wrap items-baseline justify-between gap-x-4 border-t pt-3">
			<h4 className="font-data text-data text-ground-muted tracking-[0.06em]">
				{field}
			</h4>
			<p className="font-body text-prose-sm text-ground-muted italic">
				Empty in both rounds.
			</p>
		</div>
	)
}

/** Two records side by side: a full column each below lg, a field grid above. */
function SideBySide({
	left,
	right,
}: {
	left: ComparisonSide
	right: ComparisonSide
}) {
	return (
		<>
			<div className="grid gap-y-12 lg:hidden">
				{[left, right].map((side) => (
					<div key={side.heading} className="flex flex-col gap-6">
						<header className="border-rule-strong border-b pb-3">
							<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
								<Display as="h3" size="title" className="text-[1.0625rem]">
									{side.heading}
								</Display>
								{side.mark ? <RevisionMark kind={side.mark} /> : null}
							</div>
							<Data className="text-ground-muted mt-1 block normal-case">
								{side.subheading}
							</Data>
						</header>
						{TAG_SECTIONS.flatMap((section) => section.fields).map((field) => (
							<TagFieldBlock
								key={field}
								field={field}
								value={side.record[field]}
								flags={side.flags}
								absent={
									side.isMuseum &&
									FIELDS_ABSENT_FROM_MUSEUM_RECORDS.includes(field)
										? 'Not collected by the museum: one of the four categories the project adds.'
										: undefined
								}
							/>
						))}
					</div>
				))}
			</div>
			<RecordComparison className="hidden lg:grid" left={left} right={right} />
			<p className="font-body text-prose-sm text-ground-muted measure">
				Flags (⚑) mark what an automatic check matched:{' '}
				{(Object.keys(FLAG_LABELS) as Array<FlagCheck>)
					.map((c) => FLAG_LABELS[c].label)
					.join(', ')}
				. They are prompts to look, not verdicts.
			</p>
		</>
	)
}
