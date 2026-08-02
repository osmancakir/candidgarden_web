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
	PromptDisclosure,
	SelectionConsole,
	SheetPager,
	TagFieldBlock,
	useHrefWith,
	WorkMetadata,
} from './+shared/components.tsx'
import {
	indexRows,
	manifest,
	promptFor,
	resolveModel,
	resolveSelection,
	tagsForWork,
	worksInMedium,
} from './+shared/pilot.server.ts'
import {
	countTagRecord,
	countTagValue,
	displayDating,
	FIELDS_ABSENT_FROM_MUSEUM_RECORDS,
	mediumGerman,
	mediumLabel,
	TAG_FIELDS,
	TAG_SECTIONS,
	type TagField,
	type TagRecord,
} from './+shared/schema.ts'
import { type Route } from './+types/tags.ts'

/**
 * Keyword generation, sheet by sheet.
 *
 * The question a curator actually has is not "which model is best" — the
 * evaluation page answers that — but "what would this add to *this* record".
 * So the sheet view is a two-column comparison: the Städel's own annotation on
 * the left, one model's output on the right, the same nine fields in the same
 * order down both. The count matrix above it holds the whole roster, so the
 * reader picks which model to open rather than scrolling six full records.
 *
 * Four of the nine fields are structurally empty on the museum side — they are
 * the categories this project exists to add. The left column says so in each of
 * them rather than showing an unexplained blank, because a silent gap reads as
 * a data error and this one is the point of the work.
 */

export const meta: Route.MetaFunction = () => [
	{ title: 'Keywords · Städel pilot · Candid Garden' },
	{ name: 'robots', content: 'noindex, nofollow' },
]

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url)
	const { medium, work } = resolveSelection(url)
	const modelId = resolveModel(url)
	const sheets = worksInMedium(medium)

	const position = work ? sheets.findIndex((w) => w.id === work.id) : -1
	const neighbour = (index: number) => {
		const sheet = index < 0 ? undefined : sheets[index]
		return sheet ? { id: sheet.id, objectNumber: sheet.objectNumber } : null
	}

	// One shape either way: a union here would force every consumer to narrow
	// before touching a field that is simply absent in browse mode.
	return {
		medium,
		modelId,
		models: manifest.models,
		prompt: promptFor(medium, 'tags'),
		sheets: sheets.map((w) => ({
			id: w.id,
			objectNumber: w.objectNumber,
			title: w.title,
		})),
		work,
		rows: work ? null : indexRows(medium, modelId),
		byModel: work ? tagsForWork(work.id) : null,
		position: work ? { index: position + 1, total: sheets.length } : null,
		previous: work ? neighbour(position - 1) : null,
		next: work ? neighbour(position + 1) : null,
	}
}

/** Counts for every source against every field: the comparison, at a glance. */
function CountMatrix({
	museum,
	byModel,
	selectedModelId,
	hrefWith,
}: {
	museum: TagRecord
	byModel: Array<{
		model: { id: string; label: string; provider: string }
		tags: { fields: TagRecord; total: number }
	}>
	selectedModelId: string
	hrefWith: (changes: Record<string, string | number | null>) => string
}) {
	const fields = Object.keys(TAG_FIELDS) as Array<TagField>
	const sources = [
		{ id: 'museum', label: 'Städel record', record: museum, href: null },
		...byModel.map((entry) => ({
			id: entry.model.id,
			label: entry.model.label,
			record: entry.tags.fields,
			href: hrefWith({ model: entry.model.id }),
		})),
	]

	return (
		<div className="overflow-x-auto">
			<table className="min-w-full">
				<caption className="mb-3 text-left">
					<Data className="tracking-[0.2em]">Values per field</Data>
					<Data className="text-ground-muted ml-6 normal-case">
						counts only — open a model to read them
					</Data>
				</caption>
				<thead>
					<tr className="border-rule-strong border-b">
						<th
							scope="col"
							className="font-data text-data-sm text-ground-muted py-2 pr-4 text-left tracking-[0.12em] uppercase"
						>
							Source
						</th>
						{fields.map((field) => (
							<th
								key={field}
								scope="col"
								title={TAG_FIELDS[field].gloss}
								className="font-data text-data-sm text-ground-muted py-2 pr-3 text-right tracking-normal"
							>
								{/* Ikon. is the default namespace and drops; Assoziation.
								    abbreviates but stays, because Person and Thema exist in
								    both and an unqualified header would collide. */}
								{field
									.replace(/^Ikon\./, '')
									.replace(/^Assoziation\./, 'Assoz. ')}
							</th>
						))}
						<th
							scope="col"
							className="font-data text-data-sm text-ground-fg py-2 text-right tracking-[0.12em] uppercase"
						>
							Total
						</th>
					</tr>
				</thead>
				<tbody>
					{sources.map((source) => {
						const isSelected = source.id === selectedModelId
						const isMuseum = source.id === 'museum'
						return (
							<tr
								key={source.id}
								className={
									'border-rule border-b ' +
									(isSelected || isMuseum ? 'bg-tint' : '')
								}
							>
								<th scope="row" className="py-2 pr-4 text-left font-normal">
									{source.href ? (
										<Link
											to={source.href}
											className="hover:text-link font-body text-prose-sm no-underline hover:underline"
											aria-current={isSelected ? 'true' : undefined}
										>
											{source.label}
										</Link>
									) : (
										<span className="font-body text-prose-sm">
											{source.label}
										</span>
									)}
								</th>
								{fields.map((field) => {
									const n = countTagValue(source.record[field])
									const structurallyAbsent =
										isMuseum &&
										FIELDS_ABSENT_FROM_MUSEUM_RECORDS.includes(field)
									return (
										<td
											key={field}
											className={
												'font-data text-data py-2 pr-3 text-right tabular-nums ' +
												(n === 0 ? 'text-ground-muted' : '')
											}
										>
											{structurallyAbsent ? (
												<span title="Not collected by the museum — this is a field the project adds">
													n/a
												</span>
											) : (
												n || '·'
											)}
										</td>
									)
								})}
								<td className="font-data text-data py-2 text-right font-bold tabular-nums">
									{countTagRecord(source.record)}
								</td>
							</tr>
						)
					})}
				</tbody>
			</table>
		</div>
	)
}

/** One source's full record, in the four bands the prompt asks for. */
function RecordColumn({
	heading,
	subheading,
	record,
	isMuseum = false,
}: {
	heading: string
	subheading: React.ReactNode
	record: TagRecord
	isMuseum?: boolean
}) {
	return (
		<div className="flex flex-col gap-8">
			<header className="border-rule-strong border-b pb-3">
				<Display as="h3" size="title" className="text-[1.0625rem]">
					{heading}
				</Display>
				<Data className="text-ground-muted mt-1 block normal-case">
					{subheading}
				</Data>
			</header>
			{TAG_SECTIONS.map((section) => (
				<section key={section.title} className="flex flex-col gap-4">
					<div>
						<Data className="tracking-[0.2em]">{section.title}</Data>
						<p className="font-body text-prose-sm text-ground-muted mt-1">
							{section.blurb}
						</p>
					</div>
					{section.fields.map((field) => (
						<TagFieldBlock
							key={field}
							field={field}
							value={record[field]}
							absent={
								isMuseum && FIELDS_ABSENT_FROM_MUSEUM_RECORDS.includes(field)
									? 'Not collected by the museum. This is one of the four categories the project was commissioned to add, so there is nothing here to compare against.'
									: undefined
							}
						/>
					))}
				</section>
			))}
		</div>
	)
}

export default function StadelTags({ loaderData }: Route.ComponentProps) {
	const { medium, modelId, models, prompt, sheets, work, rows } = loaderData
	const hrefWith = useHrefWith()
	const selectedModel = models.find((m) => m.id === modelId)

	return (
		<>
			<TagsHeader
				medium={medium}
				modelLabel={selectedModel?.label ?? modelId}
				hrefWith={hrefWith}
			/>

			<div className="container flex flex-col gap-8 pb-16">
				<PromptDisclosure
					prompt={prompt}
					label={`The tagging prompt for ${mediumGerman(medium)}, in full`}
				/>

				<SelectionConsole
					medium={medium}
					workId={work?.id ?? null}
					modelId={modelId}
					works={sheets}
					models={models}
					resetTo={`?medium=${medium}`}
					summary={
						work
							? `${work.objectNumber} · all five models`
							: `${sheets.length} sheets · ${selectedModel?.label ?? modelId}`
					}
				/>

				{work && loaderData.byModel && loaderData.position ? (
					<SheetView
						work={work}
						byModel={loaderData.byModel}
						modelId={modelId}
						selectedModelLabel={selectedModel?.label ?? modelId}
						selectedModelProvider={selectedModel?.provider ?? ''}
						position={loaderData.position}
						previous={loaderData.previous}
						next={loaderData.next}
						hrefWith={hrefWith}
					/>
				) : rows ? (
					<SheetGrid rows={rows} hrefWith={hrefWith} />
				) : (
					<NoRecords>No sheets in this medium.</NoRecords>
				)}
			</div>
		</>
	)
}

function TagsHeader({
	medium,
	modelLabel: label,
	hrefWith,
}: {
	medium: 'prints' | 'drawings'
	modelLabel: string
	hrefWith: (changes: Record<string, string | number | null>) => string
}) {
	return (
		<header className="border-rule container border-b py-10 md:py-14">
			<div className="grid gap-8 lg:grid-cols-12">
				<div className="lg:col-span-8">
					<Data className="text-ground-muted mb-4 block tracking-[0.2em]">
						Task 1 · Iconographic keywords
					</Data>
					<Display as="h1" size="chapter" className="measure-wide">
						Nine fields, five models, one record
					</Display>
					<p className="font-body text-prose-lg measure mt-6">
						Every sheet in the sample, tagged independently by each model
						against the schema agreed in the briefing — and set beside the
						annotation the Städel already holds for that sheet. Values are the
						model's own German; nothing here has been edited, reordered or
						filtered.
					</p>
				</div>
				<div className="flex flex-col justify-end gap-3 lg:col-span-4">
					<Data className="text-ground-muted">Medium</Data>
					<MediumSwitch
						current={medium}
						hrefFor={(next) => hrefWith({ medium: next, work: null })}
					/>
					<p className="font-body text-prose-sm text-ground-muted">
						Prompts differ by medium: printmaking marks and lettering for{' '}
						{mediumLabel('prints').toLowerCase()}, autograph marks and
						preparatory function for {mediumLabel('drawings').toLowerCase()}.
						Currently showing {label}.
					</p>
				</div>
			</div>
		</header>
	)
}

/** The browse view: twenty sheets, with what each source holds on them. */
function SheetGrid({
	rows,
	hrefWith,
}: {
	rows: NonNullable<Awaited<ReturnType<typeof loader>>['rows']>
	hrefWith: (changes: Record<string, string | number | null>) => string
}) {
	return (
		<div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
							maxHeight="max-h-72"
							sizes="(min-width: 1280px) 18rem, (min-width: 640px) 45vw, 90vw"
						/>
					</Link>
					<div className="flex flex-col gap-1">
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
						</p>
						<dl className="border-rule mt-1 flex flex-wrap gap-x-5 gap-y-1 border-t pt-2">
							<div className="flex items-baseline gap-2">
								<Data className="text-ground-muted">Städel</Data>
								<Data className="tabular-nums">{row.museumTagCount}</Data>
							</div>
							<div className="flex items-baseline gap-2">
								<Data className="text-ground-muted">Model</Data>
								<Data className="tabular-nums">{row.modelTagCount}</Data>
							</div>
						</dl>
					</div>
				</article>
			))}
		</div>
	)
}

/** The sheet view: plate, count matrix, then record against record. */
function SheetView({
	work,
	byModel,
	modelId,
	selectedModelLabel,
	selectedModelProvider,
	position,
	previous,
	next,
	hrefWith,
}: {
	work: NonNullable<Awaited<ReturnType<typeof loader>>['work']>
	byModel: NonNullable<Awaited<ReturnType<typeof loader>>['byModel']>
	modelId: string
	selectedModelLabel: string
	selectedModelProvider: string
	position: { index: number; total: number }
	previous: { id: string; objectNumber: string } | null
	next: { id: string; objectNumber: string } | null
	hrefWith: (changes: Record<string, string | number | null>) => string
}) {
	const selected = byModel.find((entry) => entry.model.id === modelId)
	const museumTotal = countTagRecord(work.museum)
	const modelTotal = selected?.tags.total ?? 0

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
					<UncertaintyNotice
						notice={
							museumTotal === 0
								? 'No iconographic annotation on record for this sheet · nothing to compare against'
								: null
						}
					/>
					<SheetPager
						previous={previous}
						next={next}
						position={`${position.index} / ${position.total}`}
						hrefFor={(id) => hrefWith({ work: id })}
					/>
				</div>
			</div>

			<CountMatrix
				museum={work.museum}
				byModel={byModel}
				selectedModelId={modelId}
				hrefWith={hrefWith}
			/>

			<div className="grid gap-x-10 gap-y-12 lg:grid-cols-2">
				<RecordColumn
					heading="Städel record"
					subheading={`As catalogued · ${museumTotal} values`}
					record={work.museum}
					isMuseum
				/>
				<RecordColumn
					heading={selectedModelLabel}
					subheading={`${selectedModelProvider} · ${modelTotal} values · ${
						modelTotal - museumTotal >= 0 ? '+' : ''
					}${modelTotal - museumTotal} against the record`}
					record={selected?.tags.fields ?? {}}
				/>
			</div>
		</div>
	)
}
