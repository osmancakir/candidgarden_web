import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { Link } from 'react-router'
import {
	ConsoleField,
	ConsoleSelect,
} from '#app/components/institute/console.tsx'
import {
	Data,
	Display,
	NoRecords,
} from '#app/components/institute/primitives.tsx'
import { cn } from '#app/utils/misc.tsx'
import {
	countMarks,
	MarkedText,
	MarkLegend,
	markForRound,
	MediumSwitch,
	Plate,
	PromptDisclosure,
	RevisionMark,
	RevisionNotice,
	Segmented,
	SelectionConsole,
	SheetNotes,
	SheetPager,
	useHrefWith,
	WorkMetadata,
	type MarkPatterns,
	type RevisionMarkKind,
} from './+shared/components.tsx'
import {
	currentRound,
	currentRun,
	lineModel,
	lines,
	manifest,
	modelInfo,
	notesForWork,
	pagerFor,
	promptFor,
	resolveSelection,
	round3,
	runInfo,
	textFor,
	worksInMedium,
} from './+shared/pilot.server.ts'
import {
	APPROACHES,
	displayDating,
	mediumGerman,
	parseApproach,
	parseLine,
	type ApproachId,
	type DescriptionSet,
	type MediumId,
	type RoundId,
} from './+shared/schema.ts'
import { type Route } from './+types/descriptions.ts'

// Gated by the layout's role check, so it must not be advertised in
// sitemap.xml. remix-seo includes every static route unless told otherwise.
export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

/**
 * Task 2: the bilingual visitor texts.
 *
 * A sheet now has up to nine texts per language and length worth reading: two
 * models, three ways of writing in round 3, and each model's text from the two
 * earlier rounds. Shown all at once they are unreadable, so the sheet view is
 * one grid with a fixed shape — a row per model, three columns — and the reader
 * chooses what the columns are: the three ways of writing, or the three rounds.
 * Language and length pick which of the four texts fills the cells. All of it
 * is in the URL, so any comparison can be sent as a link.
 *
 * The words the museum's notes are about — hedges, quoted titles, named places,
 * technique — are marked in the text itself, with the marks on by default and
 * one click to read without them.
 */

export const meta: Route.MetaFunction = () => [
	{ title: 'Descriptions · Städel research · Candid Garden' },
	{ name: 'robots', content: 'noindex, nofollow' },
]

const LANGUAGES = [
	{ id: 'german', label: 'Deutsch', tag: 'de' },
	{ id: 'english', label: 'English', tag: 'en' },
] as const

type LanguageId = (typeof LANGUAGES)[number]['id']
type Length = 'long' | 'short'
type View = 'approaches' | 'rounds'

const parseLanguage = (value: string | null): LanguageId =>
	value === 'english' ? 'english' : 'german'
const parseLength = (value: string | null): Length =>
	value === 'short' ? 'short' : 'long'
const parseView = (value: string | null): View =>
	value === 'rounds' ? 'rounds' : 'approaches'

const ROUND_ORDER: Array<RoundId> = ['pilot', 'revision', 'round3']

type Cell = {
	key: string
	heading: string
	subheading: string
	/** Only where cells in a row differ in round: the rounds view. */
	mark: RevisionMarkKind | null
	text: DescriptionSet | null
}

/** One row of the grid: a model line, and its three cells in the chosen view. */
function gridFor(workId: string, view: View) {
	return lines.map((line) => {
		const current = runInfo(line.id, currentRound.id)!
		const cells: Array<Cell> =
			view === 'approaches'
				? APPROACHES.map((approach) => ({
						key: approach.id,
						heading: approach.short,
						subheading:
							approach.id === 'synthesis'
								? 'Rewritten from both models’ direct texts'
								: '',
						mark: null,
						text: textFor(workId, current.key, approach.id),
					}))
				: ROUND_ORDER.map((roundId) => {
						const run = runInfo(line.id, roundId)
						return {
							key: roundId,
							// The badge carries the round, so the heading names the model.
							heading: run?.model.label ?? '—',
							subheading: '',
							mark: markForRound(roundId),
							text: run ? textFor(workId, run.key, 'direct') : null,
						}
					})
		return {
			line: line.id,
			label: view === 'approaches' ? current.model.label : line.provider,
			/** Beside the label only where the label is not the provider already. */
			provider: view === 'approaches' ? line.provider : '',
			cells,
		}
	})
}

/** The rule counts for the medium: round 2, then round 3's three ways. */
function measureRows(medium: MediumId) {
	const measures = round3.textMeasures[medium]
	return lines.flatMap((line) => {
		const before = runInfo(line.id, 'revision')!
		const after = runInfo(line.id, currentRound.id)!
		return [
			{
				key: `${line.id}-revision`,
				line: line.id,
				model: before.model.label,
				mark: 'revised' as const,
				approach: 'Direct',
				m: measures[before.key]?.direct ?? null,
			},
			...APPROACHES.map((approach) => ({
				key: `${line.id}-${approach.id}`,
				line: line.id,
				model: after.model.label,
				mark: 'round3' as const,
				approach: approach.short,
				m: measures[after.key]?.[approach.id] ?? null,
			})),
		]
	})
}

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url)
	const { medium, work } = resolveSelection(url)
	const line = parseLine(url.searchParams.get('line'))
	const approach = parseApproach(url.searchParams.get('approach'))
	const language = parseLanguage(url.searchParams.get('lang'))
	const length = parseLength(url.searchParams.get('length'))
	const view = parseView(url.searchParams.get('view'))
	const marks = url.searchParams.get('marks') !== 'off'
	const sheets = worksInMedium(medium)
	const run = currentRun(line)

	return {
		medium,
		line,
		approach,
		language,
		length,
		view,
		marks,
		patterns: {
			hedge:
				language === 'german' ? manifest.marks.hedgeDe : manifest.marks.hedgeEn,
			technique: manifest.marks.technique,
		} satisfies MarkPatterns,
		lineOptions: lines.map((l) => {
			const model = modelInfo(lineModel(l.id, currentRound.id)!)!
			return { id: l.id, label: model.label, provider: model.provider }
		}),
		measures: measureRows(medium),
		prompts: Object.fromEntries(
			APPROACHES.map((a) => [a.id, promptFor(medium, a.id)]),
		) as Record<ApproachId, string>,
		sheets: sheets.map((w) => ({
			id: w.id,
			objectNumber: w.objectNumber,
			title: w.title,
		})),
		work,
		/** Browse mode: every sheet with one model's round-3 short text. */
		rows: work
			? null
			: sheets.map((w) => ({
					id: w.id,
					objectNumber: w.objectNumber,
					objectKey: w.objectKey,
					title: w.title,
					artist: w.artist,
					notBefore: w.notBefore,
					notAfter: w.notAfter,
					inNotes: w.notes.length > 0,
					text: textFor(w.id, run, approach)?.[language].short ?? null,
				})),
		sheet: work
			? {
					...pagerFor(medium, work.id),
					notes: notesForWork(work),
					grid: gridFor(work.id, view),
				}
			: null,
	}
}

type LoaderData = Awaited<ReturnType<typeof loader>>

export default function StadelDescriptions({
	loaderData,
}: Route.ComponentProps) {
	const { medium, line, approach, language, work, rows, sheets, lineOptions } =
		loaderData
	const hrefWith = useHrefWith()
	const selected = lineOptions.find((l) => l.id === line)
	const approachLabel = APPROACHES.find((a) => a.id === approach)!.short

	return (
		<>
			<header className="border-rule container border-b py-10 md:py-14">
				<div className="grid gap-8 lg:grid-cols-12">
					<div className="lg:col-span-8">
						<Data className="text-ground-muted mb-4 block tracking-[0.2em]">
							Task 2 · Visitor descriptions
						</Data>
						<Display as="h1" size="chapter" className="measure-wide">
							Three ways of writing, three rounds
						</Display>
						<p className="font-body text-prose-lg measure mt-6">
							Round 3 wrote every text three ways: directly from the image and
							the record, as before; with the model’s own keywords in hand; and
							as a synthesis of both models’ direct texts. Open a sheet to read
							the three side by side, or switch the columns to the pilot, round
							2 and round 3, to see how one model’s text changed.
						</p>
					</div>
					<div className="flex flex-col justify-end gap-3 lg:col-span-4">
						<Data className="text-ground-muted">Medium</Data>
						<MediumSwitch
							current={medium}
							hrefFor={(next) => hrefWith({ medium: next, work: null })}
						/>
						<p className="font-body text-prose-sm text-ground-muted">
							The German and English are not translations of each other, and the
							short text is not a cut of the long one: each is written for its
							own reader, with the same substance.
						</p>
					</div>
				</div>
			</header>

			<div className="container flex flex-col gap-8 pb-16">
				<RevisionNotice
					caption={`the text rules of your notes, counted on the ${mediumGerman(medium)} sample`}
				>
					<p>
						German long texts within 550 characters, in the 551–650 a rich sheet
						may now take, and over; the hedges in each language; texts with a
						title in quotation marks; and how many of the named places in the
						model’s own keywords the German text names. Technique stays at zero
						throughout.
					</p>
					<MeasureTable rows={loaderData.measures} />
				</RevisionNotice>

				<div className="flex flex-col gap-2">
					{APPROACHES.map((a) => (
						<PromptDisclosure
							key={a.id}
							prompt={loaderData.prompts[a.id]}
							label={`${a.label}: the round-3 prompt for ${mediumGerman(medium)}`}
						/>
					))}
				</div>

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
							? `${work.objectNumber} · both models`
							: `${sheets.length} sheets · ${selected?.label} · ${approachLabel}`
					}
					extra={
						<>
							<ConsoleField
								label="Written"
								htmlFor="s-approach"
								hint="browse view only"
							>
								<ConsoleSelect
									id="s-approach"
									name="approach"
									defaultValue={approach}
								>
									{APPROACHES.map((a) => (
										<option key={a.id} value={a.id}>
											{a.label}
										</option>
									))}
								</ConsoleSelect>
							</ConsoleField>
							<ConsoleField label="Language" htmlFor="s-lang">
								<ConsoleSelect id="s-lang" name="lang" defaultValue={language}>
									{LANGUAGES.map((l) => (
										<option key={l.id} value={l.id}>
											{l.label}
										</option>
									))}
								</ConsoleSelect>
							</ConsoleField>
						</>
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
					<SheetGrid rows={rows} language={language} hrefWith={hrefWith} />
				) : (
					<NoRecords>No sheets in this medium.</NoRecords>
				)}
			</div>
		</>
	)
}

function MeasureTable({ rows }: { rows: LoaderData['measures'] }) {
	const head = [
		'Model',
		'Written',
		'Ø DE long',
		'≤550 / ≤650 / over',
		'Hedges DE',
		'Hedges EN',
		'„Titles“',
		'Places named',
	]
	return (
		<div className="overflow-x-auto">
			<table className="min-w-full">
				<thead>
					<tr className="border-rule-strong border-b">
						{head.map((h, i) => (
							<th
								key={h}
								scope="col"
								className={cn(
									'font-data text-data-sm text-ground-muted py-2 pr-4 tracking-[0.08em] whitespace-nowrap uppercase',
									i < 2 ? 'text-left' : 'text-right',
								)}
							>
								{h}
							</th>
						))}
					</tr>
				</thead>
				<tbody className="font-data text-data">
					{rows.map((row, i) => (
						<tr
							key={row.key}
							className={cn(
								'border-rule border-b',
								i > 0 &&
									rows[i - 1]!.line !== row.line &&
									'border-t-rule-strong border-t',
							)}
						>
							<th
								scope="row"
								className="py-2 pr-4 text-left font-normal whitespace-nowrap"
							>
								<span className="font-body text-prose-sm mr-2">
									{row.model}
								</span>
								<RevisionMark kind={row.mark} />
							</th>
							<td className="py-2 pr-4 whitespace-nowrap">{row.approach}</td>
							{row.m ? (
								<>
									<td className="py-2 pr-4 text-right tabular-nums">
										{row.m.avgLong}
									</td>
									<td className="py-2 pr-4 text-right tabular-nums">
										{row.m.target} / {row.m.rich} / {row.m.longer}
									</td>
									<td className="py-2 pr-4 text-right tabular-nums">
										{row.m.hedgesDe}
									</td>
									<td className="py-2 pr-4 text-right tabular-nums">
										{row.m.hedgesEn}
									</td>
									<td className="py-2 pr-4 text-right tabular-nums">
										{row.m.quoted} / {row.m.texts}
									</td>
									<td className="py-2 text-right tabular-nums">
										{row.m.placesTotal
											? `${row.m.placesNamed} / ${row.m.placesTotal}`
											: '—'}
									</td>
								</>
							) : (
								<td colSpan={6} className="text-ground-muted py-2">
									—
								</td>
							)}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}

/** Browse: twenty sheets with one model's short text under each plate. */
function SheetGrid({
	rows,
	language,
	hrefWith,
}: {
	rows: NonNullable<LoaderData['rows']>
	language: LanguageId
	hrefWith: (changes: Record<string, string | number | null>) => string
}) {
	const tag = LANGUAGES.find((l) => l.id === language)!.tag
	return (
		<div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
			{rows.map((row) => (
				<article key={row.id} className="flex flex-col gap-3">
					<Link
						to={hrefWith({ work: row.id })}
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
							maxHeight="max-h-64"
							sizes="(min-width: 1024px) 22rem, (min-width: 640px) 45vw, 90vw"
						/>
					</Link>
					<Display as="h3" size="title" className="text-[1rem] leading-tight">
						<Link
							to={hrefWith({ work: row.id })}
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
						<Data className="text-ground-muted ml-2 not-italic">
							{row.objectNumber}
						</Data>
					</p>
					{row.inNotes ? (
						<Data className="text-link normal-case">Named in your notes</Data>
					) : null}
					{row.text ? (
						<p
							className="font-body text-prose-sm border-rule border-t pt-3"
							lang={tag}
						>
							{row.text}
						</p>
					) : (
						<p className="font-body text-prose-sm text-ground-muted border-rule border-t pt-3 italic">
							No text returned for this sheet.
						</p>
					)}
				</article>
			))}
		</div>
	)
}

/** Sheet: plate and notes, the controls, then the grid of texts. */
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
	const { view, language, length, marks, patterns } = data
	const lang = LANGUAGES.find((l) => l.id === language)!

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

			<div className="border-rule bg-ground sticky top-0 z-10 flex flex-col gap-3 border-t border-b py-4">
				<div className="flex flex-wrap items-end gap-x-8 gap-y-4">
					<Segmented
						label="Columns"
						current={view}
						options={[
							{
								id: 'approaches',
								label: 'Three ways of writing',
								title: 'Round 3: direct, from the keywords, synthesis',
							},
							{
								id: 'rounds',
								label: 'Three rounds',
								title: 'The direct text: pilot, round 2, round 3',
							},
						]}
						hrefFor={(id) =>
							hrefWith({ view: id === 'approaches' ? null : id })
						}
					/>
					<Segmented
						label="Language"
						current={language}
						options={LANGUAGES.map((l) => ({ id: l.id, label: l.label }))}
						hrefFor={(id) => hrefWith({ lang: id === 'german' ? null : id })}
					/>
					<Segmented
						label="Length"
						current={length}
						options={[
							{ id: 'long', label: 'Long' },
							{ id: 'short', label: 'Short' },
						]}
						hrefFor={(id) => hrefWith({ length: id === 'long' ? null : id })}
					/>
					<Segmented
						label="Marks"
						current={marks ? 'on' : 'off'}
						options={[
							{ id: 'on', label: 'On' },
							{ id: 'off', label: 'Off' },
						]}
						hrefFor={(id) => hrefWith({ marks: id === 'on' ? null : 'off' })}
					/>
				</div>
				{marks ? <MarkLegend /> : null}
			</div>

			<div className="flex flex-col gap-12">
				{sheet.grid.map((row) => (
					<section key={row.line} className="flex flex-col gap-4">
						<header className="border-rule-strong flex flex-wrap items-baseline justify-between gap-x-4 border-b pb-2">
							<Display as="h3" size="title" className="text-[1.0625rem]">
								{row.label}
							</Display>
							<Data className="text-ground-muted normal-case">
								{row.provider}
							</Data>
						</header>
						<div className="grid gap-x-8 gap-y-10 lg:grid-cols-3">
							{row.cells.map((cell) => (
								<TextCell
									key={cell.key}
									cell={cell}
									text={cell.text?.[language][length] ?? null}
									length={length}
									lang={lang.tag}
									marks={marks}
									patterns={patterns}
									places={work.places}
								/>
							))}
						</div>
					</section>
				))}
			</div>

			{view === 'approaches' ? (
				<p className="font-body text-prose-sm text-ground-muted measure">
					{APPROACHES.map((a) => (
						<span key={a.id} className="mb-1 block">
							<strong className="text-ground-fg">{a.short}.</strong> {a.gloss}
						</span>
					))}
				</p>
			) : (
				<p className="font-body text-prose-sm text-ground-muted measure">
					Each column is the direct text, the only way all three rounds wrote.
					The pilot still names technique and runs long; round 2 brought both
					into line, and round 3 answers your notes on that.
				</p>
			)}
		</div>
	)
}

/**
 * The length band a text falls in. The long text aims at 350–550 characters
 * and may take up to 650 on a rich sheet; the short one aims at 200–300 under
 * a cap of 500.
 */
function band(length: Length, n: number) {
	if (length === 'short') {
		return n > 500
			? { label: 'over 500', warn: true }
			: { label: 'within 500', warn: false }
	}
	if (n <= 550) return { label: 'within 550', warn: false }
	if (n <= 650) return { label: 'rich-sheet room', warn: false }
	return { label: 'over 650', warn: true }
}

function TextCell({
	cell,
	text,
	length,
	lang,
	marks,
	patterns,
	places,
}: {
	cell: NonNullable<LoaderData['sheet']>['grid'][number]['cells'][number]
	text: string | null
	length: Length
	lang: string
	marks: boolean
	patterns: MarkPatterns
	places: Array<string>
}) {
	const counts = text ? countMarks(text, patterns, places) : null
	const b = text ? band(length, text.length) : null
	return (
		<article className="flex flex-col gap-3" lang={lang}>
			<header className="border-rule flex flex-col gap-1 border-b pb-2">
				<div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
					<Data className="tracking-[0.16em]">{cell.heading}</Data>
					{cell.mark ? <RevisionMark kind={cell.mark} /> : null}
				</div>
				{cell.subheading ? (
					<Data className="text-ground-muted normal-case">
						{cell.subheading}
					</Data>
				) : null}
				{text && b && counts ? (
					<Data className="text-ground-muted flex flex-wrap gap-x-3 tracking-normal normal-case tabular-nums">
						<span className={b.warn ? 'text-stamp-fg' : undefined}>
							{text.length} chars · {b.label}
						</span>
						{counts.hedge ? (
							<span className="text-stamp-fg">
								{counts.hedge} hedge{counts.hedge > 1 ? 's' : ''}
							</span>
						) : null}
						{counts.quote ? <span>{counts.quote} quoted</span> : null}
						{counts.place ? (
							<span>
								{counts.place} place{counts.place > 1 ? 's' : ''}
							</span>
						) : null}
						{counts.technique ? (
							<span
								className="text-stamp-fg"
								title="Check the word: a depicted quill matches too"
							>
								{counts.technique} technique?
							</span>
						) : null}
					</Data>
				) : null}
			</header>
			{text ? (
				<p className="font-body text-prose whitespace-pre-line">
					<MarkedText
						text={text}
						patterns={patterns}
						places={places}
						enabled={marks}
					/>
				</p>
			) : (
				<p className="font-body text-prose-sm text-ground-muted italic">
					No text in this round.
				</p>
			)}
		</article>
	)
}
