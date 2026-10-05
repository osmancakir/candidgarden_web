import { Img } from 'openimg/react'
import { Fragment } from 'react'
import { Form, Link, NavLink, useSearchParams } from 'react-router'
import {
	ConsoleField,
	ConsoleSelect,
} from '#app/components/institute/console.tsx'
import { Data, Display } from '#app/components/institute/primitives.tsx'
import { cn, getWorkImgSrc } from '#app/utils/misc.tsx'
import { type DiffStatus, type DiffValue } from './keyword-diff.ts'
import {
	countTagValue,
	displayDating,
	FLAG_LABELS,
	FIELDS_ABSENT_FROM_MUSEUM_RECORDS,
	MEDIA,
	TAG_FIELDS,
	TAG_SECTIONS,
	type FlagCheck,
	type KeywordFlag,
	type MediumId,
	type Note,
	type TagField,
	type TagRecord,
	type TagValue,
	type Work,
} from './schema.ts'

/* ==========================================================================
   The presentation vocabulary for the Städel pilot.

   These pages are the Institute register applied to a working deliverable:
   paper ground, hairline rules, mono for everything the machine says, Times for
   everything a person wrote. Nothing here is decorative — a curator reading it
   is checking whether a keyword is right, so the layout's whole job is to put
   five models' answers close enough together to be compared by eye.
   ========================================================================== */

const SECTIONS = [
	{ to: '/staedel-research', label: 'Overview', end: true },
	{ to: '/staedel-research/tags', label: 'Keywords', end: false },
	{ to: '/staedel-research/descriptions', label: 'Descriptions', end: false },
	{ to: '/staedel-research/evaluation', label: 'Evaluation', end: false },
]

/* --------------------------------------------------------------------------
   Marking the rounds.

   These pages carry three generations of output at once: the pilot of
   1 August, the revision of 25 August, and round 3 of 5 October. A reader who
   cannot tell which is which will either dismiss the new work or credit the
   old, so the round is marked wherever output appears rather than explained
   once at the top.
   -------------------------------------------------------------------------- */

const REVISION_MARKS = {
	round3: {
		label: 'Round 3 · 5 Oct',
		title:
			'Run on 5 October 2026 with GPT-6.1 Sol and Claude Opus 5.5, after the museum’s notes on round 2.',
		className: 'border-link text-link',
	},
	revised: {
		// Must match the revision round's date in scripts/stadel-research/prepare-data.mjs.
		label: 'Round 2 · 25 Aug',
		title:
			'Re-run after the museum’s reply to the pilot: no technique, style or period, and the house voice from its own published texts.',
		className: 'border-rule-strong text-ground-fg',
	},
	finalist: {
		label: 'Round 3',
		title: 'One of the two models the current round runs.',
		className: 'border-link text-link',
	},
	previous: {
		label: 'Round 2',
		title:
			'A finalist of 25 August, replaced in round 3 by its provider’s successor model.',
		className: 'border-rule-strong text-ground-fg',
	},
	pilot: {
		label: 'Pilot · 1 Aug',
		title: 'Output of the pilot run of 1 August 2026.',
		className: 'border-rule text-ground-muted',
	},
	retired: {
		label: 'Retired',
		title:
			'Lost on the pilot scores and is no longer being run. Kept as the evidence for cutting the roster.',
		className: 'border-rule text-ground-muted',
	},
	judge: {
		label: 'Judge',
		title:
			'No longer a contestant. Scores the other two, which is what makes the judge neutral.',
		className: 'border-rule text-ground-muted',
	},
} as const

export type RevisionMarkKind = keyof typeof REVISION_MARKS

/** The mark for output of a given round. */
export function markForRound(round: 'pilot' | 'revision' | 'round3') {
	return round === 'round3' ? 'round3' : round === 'revision' ? 'revised' : 'pilot'
}

/** The mark itself: mono, bordered, sized to sit beside a heading. */
export function RevisionMark({
	kind,
	className,
}: {
	kind: RevisionMarkKind
	className?: string
}) {
	const mark = REVISION_MARKS[kind]
	return (
		<span
			title={mark.title}
			className={cn(
				'font-data text-data-sm inline-flex items-baseline border px-2 py-0.5 tracking-[0.12em] whitespace-nowrap uppercase',
				mark.className,
				className,
			)}
		>
			{mark.label}
		</span>
	)
}

/**
 * The page-level notice: what changed on this surface, in numbers the reader
 * can check against the output below it.
 */
export function RevisionNotice({
	kind = 'round3',
	caption,
	children,
}: {
	kind?: RevisionMarkKind
	caption?: React.ReactNode
	children?: React.ReactNode
}) {
	return (
		<aside
			role="note"
			className="border-link flex flex-col gap-3 border-l-2 py-2 pl-4"
		>
			<div className="flex flex-wrap items-baseline gap-3">
				<RevisionMark kind={kind} />
				{caption ? (
					<Data className="text-ground-muted normal-case">{caption}</Data>
				) : null}
			</div>
			<div className="font-body text-prose measure flex flex-col gap-3">
				{children}
			</div>
		</aside>
	)
}

/** The rail across the four surfaces of the pilot. Segmented, mono, no chrome. */
export function PilotNav({ className }: { className?: string }) {
	return (
		<nav
			aria-label="Pilot sections"
			className={cn('flex flex-wrap', className)}
		>
			{SECTIONS.map(({ to, label, end }) => (
				<NavLink
					key={to}
					to={to}
					end={end}
					prefetch="intent"
					className={({ isActive }) =>
						cn(
							'font-data text-data-sm -ml-px border px-3 py-2 tracking-[0.12em] uppercase no-underline transition-colors',
							isActive
								? 'border-ground-fg bg-ground-fg text-ground'
								: 'border-rule text-ground-muted hover:border-link hover:text-link',
						)
					}
				>
					{label}
				</NavLink>
			))}
		</nav>
	)
}

/** The masthead of a pilot page: what document this is, and what it claims. */
export function PilotHeader({
	kind,
	title,
	lead,
	aside,
}: {
	kind: string
	title: string
	lead?: React.ReactNode
	aside?: React.ReactNode
}) {
	return (
		<header className="border-rule container border-b py-10 md:py-14">
			<div className="grid gap-8 lg:grid-cols-12">
				<div className="lg:col-span-8">
					<Data className="text-ground-muted mb-4 block tracking-[0.2em]">
						{kind}
					</Data>
					<Display as="h1" size="chapter" className="measure-wide">
						{title}
					</Display>
					{lead ? (
						<p className="font-body text-prose-lg measure mt-6">{lead}</p>
					) : null}
				</div>
				{aside ? (
					<div className="flex flex-col justify-end gap-3 lg:col-span-4">
						{aside}
					</div>
				) : null}
			</div>
		</header>
	)
}

/**
 * The exact prompt the run was made with, disclosed rather than summarised.
 * §6's "uncertainty as content" applied to method: if the team is judging the
 * output, they are entitled to read the instruction that produced it, in full,
 * without asking us for it.
 */
export function PromptDisclosure({
	prompt,
	label,
}: {
	prompt: string
	label: string
}) {
	return (
		<details className="border-rule group border">
			<summary className="hover:text-link font-data text-data-sm cursor-pointer list-none px-4 py-3 tracking-[0.12em] uppercase select-none">
				<span className="mr-2 inline-block group-open:hidden" aria-hidden>
					+
				</span>
				<span className="mr-2 hidden group-open:inline-block" aria-hidden>
					−
				</span>
				{label}
			</summary>
			<div className="border-rule border-t">
				<pre className="font-data text-data max-h-128 overflow-auto p-4 leading-relaxed tracking-normal whitespace-pre-wrap">
					{prompt}
				</pre>
			</div>
		</details>
	)
}

/**
 * A plate at true proportions (§5: artworks are never cropped to fill a
 * layout), with alt text assembled from the museum's own record — the archive
 * describing itself, per §8.
 */
export function Plate({
	work,
	maxHeight = 'max-h-[60vh]',
	sizes,
	className,
}: {
	work: Pick<
		Work,
		'objectKey' | 'title' | 'artist' | 'objectType' | 'notBefore' | 'notAfter'
	>
	maxHeight?: string
	sizes?: string
	className?: string
}) {
	const src = getWorkImgSrc(work.objectKey)
	if (!src) {
		return (
			<div className="border-rule text-ground-muted font-data text-data-sm flex h-48 items-center justify-center border uppercase">
				No plate on file
			</div>
		)
	}
	const alt = [
		work.title ?? 'Untitled sheet',
		work.artist ? `by ${work.artist}` : null,
		work.objectType,
		displayDating(work.notBefore, work.notAfter),
	]
		.filter(Boolean)
		.join('. ')
	return (
		<Img
			src={src}
			alt={`${alt}.`}
			width={1200}
			height={1200}
			isAboveFold={false}
			sizes={sizes}
			className={cn(
				'h-auto w-auto max-w-full object-contain',
				maxHeight,
				className,
			)}
		/>
	)
}

/** The museum's record for one sheet, as a plain definition list. */
export function WorkMetadata({
	work,
	className,
}: {
	work: Work
	className?: string
}) {
	const rows: Array<[string, React.ReactNode]> = [
		['Object no.', work.objectNumber],
		['Record no.', work.recordNumber ?? '—'],
		['Artist', work.artist ?? 'Unattributed'],
		['Object type', work.objectType ?? '—'],
		['Dating', displayDating(work.notBefore, work.notAfter)],
	]
	if (work.titleVariants.length) {
		rows.push(['Title variants', work.titleVariants.join(' · ')])
	}
	return (
		<dl className={cn('border-rule border-t', className)}>
			{rows.map(([term, value]) => (
				<div
					key={term}
					className="border-rule flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b py-2"
				>
					<Data className="text-ground-muted w-40 shrink-0 whitespace-nowrap">
						{term}
					</Data>
					<span className="font-body text-prose-sm min-w-0 flex-1">
						{value}
					</span>
				</div>
			))}
		</dl>
	)
}

/** A single keyword. No confidence superscript: the models return none, and
 *  inventing one would be exactly the kind of claim §6 forbids. */
export function Keyword({
	children,
	flags,
}: {
	children: React.ReactNode
	/** Rule checks that flag the value, shown as a question beside it. */
	flags?: Array<FlagCheck>
}) {
	return (
		<span className="border-rule font-data text-data-sm text-ground-fg inline-block max-w-full border px-2 py-1 leading-relaxed tracking-[0.06em] break-words">
			{children}
			<FlagTags flags={flags} />
		</span>
	)
}

/**
 * The rule checks a value trips, in the stamp colour and in the reader's own
 * terms. A pattern is not a judgement, so the label is phrased as what the
 * check saw, and its gloss sits in the title for anyone who wants the rule.
 */
export function FlagTags({ flags }: { flags?: Array<FlagCheck> }) {
	if (!flags?.length) return null
	return (
		<>
			{[...new Set(flags)].map((check) => (
				<span
					key={check}
					title={`Automatic check: ${FLAG_LABELS[check].gloss}`}
					className="text-stamp-fg ml-2 inline-block text-[0.6875rem] tracking-[0.08em] whitespace-nowrap uppercase"
				>
					⚑ {FLAG_LABELS[check].label}
				</span>
			))}
		</>
	)
}

const DIFF_STYLES: Record<DiffStatus, { className: string; sign: string; label: string }> = {
	kept: { className: 'border-rule text-ground-fg', sign: '', label: 'kept' },
	added: {
		className: 'border-link text-link bg-tint',
		sign: '+',
		label: 'new',
	},
	movedIn: {
		className: 'border-link text-link bg-tint',
		sign: '→',
		label: 'moved here',
	},
	removed: {
		className: 'border-rule border-dashed text-ground-muted line-through decoration-1',
		sign: '−',
		label: 'dropped',
	},
	movedOut: {
		className: 'border-rule border-dashed text-ground-muted',
		sign: '',
		label: 'moved away',
	},
}

/** One value of a {@link KeywordDiff}: kept, new, dropped, or moved. */
export function DiffKeyword({ value }: { value: DiffValue }) {
	const style = DIFF_STYLES[value.status]
	const title =
		value.status === 'movedIn'
			? `Moved here from ${value.elsewhere}`
			: value.status === 'movedOut'
				? `Moved to ${value.elsewhere}`
				: style.label === 'kept'
					? undefined
					: style.label[0]!.toUpperCase() + style.label.slice(1)
	return (
		<span
			title={title}
			className={cn(
				'font-data text-data-sm inline-block max-w-full border px-2 py-1 leading-relaxed tracking-[0.06em] break-words',
				style.className,
			)}
		>
			{style.sign ? (
				<span aria-hidden className="mr-1.5 inline-block opacity-80">
					{style.sign}
				</span>
			) : null}
			<span className="sr-only">{style.label}: </span>
			{value.value}
			{value.status === 'movedIn' ? (
				<span className="text-ground-muted ml-2 text-[0.6875rem] tracking-normal normal-case">
					from {value.elsewhere}
				</span>
			) : value.status === 'movedOut' ? (
				<span className="ml-2 text-[0.6875rem] tracking-normal normal-case">
					→ {value.elsewhere}
				</span>
			) : null}
			<FlagTags flags={value.flags} />
		</span>
	)
}

/** The legend for {@link DiffKeyword}, so no mark needs explaining twice. */
export function DiffLegend({ className }: { className?: string }) {
	const sample = (status: DiffStatus, text: string, elsewhere?: string) => (
		<DiffKeyword value={{ value: text, status, flags: [], elsewhere }} />
	)
	return (
		<div
			className={cn(
				'flex flex-wrap items-center gap-x-4 gap-y-2',
				className,
			)}
		>
			{sample('kept', 'kept')}
			{sample('added', 'new in round 3')}
			{sample('removed', 'dropped since round 2')}
			{sample('movedIn', 'moved', 'Ikon.Thema')}
			<span className="font-data text-data-sm text-stamp-fg tracking-[0.08em] uppercase">
				⚑ flagged by an automatic check
			</span>
		</div>
	)
}

/** One schema field: its German name, its gloss, its count, and its values. */
export function TagFieldBlock({
	field,
	value,
	absent,
	muted,
	flags,
}: {
	field: TagField
	value: TagValue | undefined
	/** Rendered when the source structurally cannot hold this field. */
	absent?: React.ReactNode
	/** Retired or judge output: set back a shade rather than read as current. */
	muted?: boolean
	/** Rule-check flags for this record, matched to values by field and text. */
	flags?: Array<KeywordFlag>
}) {
	const meta = TAG_FIELDS[field]
	const flagsFor = (v: string, type: string | null) =>
		flags
			?.filter(
				(f) =>
					f.field === field &&
					f.value === v &&
					(type === null || f.type === null || f.type === type),
			)
			.map((f) => f.check)
	const count = countTagValue(value)
	return (
		<section className={cn('border-rule border-t pt-3', muted && 'opacity-70')}>
			<div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
				<h4 className="font-data text-data text-ground-fg tracking-[0.06em]">
					{field}
				</h4>
				<Data className="text-ground-muted tabular-nums">{count || '—'}</Data>
			</div>
			<Data className="text-ground-muted mb-3 block tracking-normal normal-case opacity-80">
				{meta.gloss}
			</Data>
			{count === 0 ? (
				<p className="font-body text-prose-sm text-ground-muted italic">
					{absent ?? 'Empty.'}
				</p>
			) : value?.kind === 'flat' ? (
				<div className="flex flex-wrap gap-1.5">
					{value.values.map((v, i) => (
						<Keyword key={`${v}-${i}`}>{v}</Keyword>
					))}
				</div>
			) : (
				<div className="flex flex-col gap-3">
					{value?.groups.map((group, i) => (
						<div key={`${group.type}-${i}`}>
							<div className="mb-1.5 flex items-baseline gap-3">
								<Data className="text-link">{group.type}</Data>
								<Data className="text-ground-muted tabular-nums">
									{group.values.length}
								</Data>
							</div>
							<div className="flex flex-wrap gap-1.5">
								{group.values.map((v, j) => (
									<Keyword key={`${v}-${j}`} flags={flagsFor(v, group.type)}>
										{v}
									</Keyword>
								))}
							</div>
						</div>
					))}
				</div>
			)}
		</section>
	)
}

/** One side of a {@link RecordComparison}: what heading it carries and where
 *  its values come from. */
export type ComparisonSide = {
	heading: string
	subheading: React.ReactNode
	record: TagRecord
	mark?: RevisionMarkKind
	isMuseum?: boolean
	flags?: Array<KeywordFlag>
}

/**
 * Two records, field by field, in a single grid rather than two independent
 * columns. Stacking full columns lets a long list on one side — Ikon.Thema
 * routinely runs past a hundred values — push every field below it out of
 * step with the other side, so "Motif" lands a full section apart between
 * the two. A shared grid makes each field its own row, sized to whichever
 * side is taller; both sides pick back up level on the next row regardless
 * of how the row above filled out.
 */
export function RecordComparison({
	left,
	right,
	className,
}: {
	left: ComparisonSide
	right: ComparisonSide
	className?: string
}) {
	const sides = [left, right]
	return (
		<div className={cn('grid gap-x-10 gap-y-8 lg:grid-cols-2', className)}>
			{sides.map((side, i) => {
				const muted = side.mark === 'retired' || side.mark === 'judge'
				return (
					<header
						key={`head-${i}`}
						className={cn(
							'border-rule-strong border-b pb-3',
							muted && 'opacity-70',
						)}
					>
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
				)
			})}
			{TAG_SECTIONS.map((section) => (
				<Fragment key={section.title}>
					{sides.map((side, i) => (
						<div key={`section-${section.title}-${i}`}>
							<Data className="tracking-[0.2em]">{section.title}</Data>
							<p className="font-body text-prose-sm text-ground-muted mt-1">
								{section.blurb}
							</p>
						</div>
					))}
					{section.fields.flatMap((field) =>
						sides.map((side, i) => (
							<TagFieldBlock
								key={`${field}-${i}`}
								field={field}
								value={side.record[field]}
								flags={side.flags}
								muted={side.mark === 'retired' || side.mark === 'judge'}
								absent={
									side.isMuseum &&
									FIELDS_ABSENT_FROM_MUSEUM_RECORDS.includes(field)
										? 'Not collected by the museum. This is one of the four categories the project was commissioned to add, so there is nothing here to compare against.'
										: undefined
								}
							/>
						)),
					)}
				</Fragment>
			))}
		</div>
	)
}

/**
 * A score out of ten as a hairline meter. Kept deliberately plain: no colour
 * scale, because a colour scale would rank the models a second time and §10
 * allows exactly one accent.
 */
export function ScoreMeter({
	value,
	label,
}: {
	value: number | null
	label: string
}) {
	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-baseline justify-between gap-3">
				<Data className="text-ground-muted">{label}</Data>
				<Data className="tabular-nums">
					{value == null ? '—' : value.toFixed(2)}
				</Data>
			</div>
			<div
				className="bg-tint h-1.5 w-full"
				role="img"
				aria-label={`${label}: ${value == null ? 'not scored' : `${value.toFixed(2)} out of 10`}`}
			>
				<div
					className="bg-ground-fg h-full"
					style={{ width: `${((value ?? 0) / 10) * 100}%` }}
				/>
			</div>
		</div>
	)
}

/** Links that change one search parameter and leave the rest alone. */
export function useHrefWith() {
	const [searchParams] = useSearchParams()
	return function hrefWith(changes: Record<string, string | number | null>) {
		const next = new URLSearchParams(searchParams)
		for (const [key, value] of Object.entries(changes)) {
			if (value === null || value === '') next.delete(key)
			else next.set(key, String(value))
		}
		const qs = next.toString()
		return qs ? `?${qs}` : '?'
	}
}

/** Prints / Drawings. A segmented control, because there are exactly two. */
export function MediumSwitch({
	current,
	hrefFor,
	className,
}: {
	current: MediumId
	hrefFor: (medium: MediumId) => string
	className?: string
}) {
	return (
		<nav aria-label="Medium" className={cn('flex flex-wrap', className)}>
			{MEDIA.map((medium) => {
				const isCurrent = medium.id === current
				return (
					<Link
						key={medium.id}
						to={hrefFor(medium.id)}
						aria-current={isCurrent ? 'true' : undefined}
						prefetch="intent"
						className={cn(
							'font-data text-data-sm -ml-px flex items-baseline gap-2 border px-3 py-2 tracking-[0.12em] uppercase no-underline transition-colors',
							isCurrent
								? 'border-ground-fg bg-ground-fg text-ground'
								: 'border-rule text-ground-muted hover:border-link hover:text-link',
						)}
					>
						<span>{medium.label}</span>
						<span className="opacity-60">{medium.german}</span>
					</Link>
				)
			})}
		</nav>
	)
}

/**
 * The console that drives every browse view: which medium, which sheet, which
 * model. A native GET form, so it works without JavaScript and leaves its state
 * in the URL where it can be cited.
 */
export function SelectionConsole({
	medium,
	workId,
	modelId,
	works,
	models,
	summary,
	resetTo,
	extra,
	modelLabelText = 'Model',
	modelAllLabel,
	modelParam = 'model',
}: {
	medium: MediumId
	workId: string | null
	modelId: string | null
	works: Array<{ id: string; objectNumber: string; title: string | null }>
	models: Array<{ id: string; label: string; provider: string }>
	summary?: React.ReactNode
	resetTo: string
	extra?: React.ReactNode
	modelLabelText?: string
	/** When given, the model select gains an "all models" option with this label. */
	modelAllLabel?: string
	/** The search parameter the model select writes: `model`, or `line`. */
	modelParam?: string
}) {
	return (
		<Form
			method="get"
			role="search"
			preventScrollReset
			className="border-rule border"
		>
			<div className="border-rule bg-tint flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b px-4 py-2">
				<Data className="tracking-[0.2em]">Selection console</Data>
				{summary ? (
					<Data className="text-ground-muted normal-case">{summary}</Data>
				) : null}
			</div>

			<div className="grid gap-x-6 gap-y-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
				<ConsoleField label="Medium" htmlFor="s-medium">
					<ConsoleSelect id="s-medium" name="medium" defaultValue={medium}>
						{MEDIA.map((m) => (
							<option key={m.id} value={m.id}>
								{m.label} · {m.german}
							</option>
						))}
					</ConsoleSelect>
				</ConsoleField>

				<ConsoleField
					label="Sheet"
					htmlFor="s-work"
					hint={`${works.length} in the sample`}
					className="sm:col-span-2"
				>
					<ConsoleSelect id="s-work" name="work" defaultValue={workId ?? ''}>
						<option value="">all sheets</option>
						{works.map((w) => (
							<option key={w.id} value={w.id}>
								{w.objectNumber} — {w.title ?? 'Untitled'}
							</option>
						))}
					</ConsoleSelect>
				</ConsoleField>

				<ConsoleField label={modelLabelText} htmlFor="s-model">
					<ConsoleSelect
							id="s-model"
							name={modelParam}
							defaultValue={modelId ?? ''}
						>
						{modelAllLabel ? <option value="">{modelAllLabel}</option> : null}
						{models.map((m) => (
							<option key={m.id} value={m.id}>
								{m.label} · {m.provider}
							</option>
						))}
					</ConsoleSelect>
				</ConsoleField>

				{extra}
			</div>

			<div className="border-rule flex flex-wrap items-center gap-x-6 gap-y-3 border-t px-4 py-3">
				<button
					type="submit"
					className="font-data text-data-sm border-ground-fg bg-ground-fg text-ground hover:text-ground-fg border px-4 py-2 tracking-[0.12em] uppercase transition-colors hover:bg-transparent"
				>
					Show selection
				</button>
				<Link
					to={resetTo}
					className="font-data text-data-sm text-ground-muted hover:text-link tracking-[0.12em] uppercase underline underline-offset-4"
				>
					Reset selection
				</Link>
			</div>
		</Form>
	)
}

/** Previous / next through the twenty sheets of a medium. */
export function SheetPager({
	previous,
	next,
	position,
	hrefFor,
}: {
	previous: { id: string; objectNumber: string } | null
	next: { id: string; objectNumber: string } | null
	position: string
	hrefFor: (workId: string) => string
}) {
	const disabled =
		'font-data text-data-sm text-ground-muted tracking-[0.12em] uppercase opacity-40'
	const enabled =
		'font-data text-data-sm text-link tracking-[0.12em] uppercase underline underline-offset-4'
	return (
		<nav
			aria-label="Sheets in this sample"
			className="border-rule flex flex-wrap items-center justify-between gap-4 border-t pt-4"
		>
			{previous ? (
				<Link to={hrefFor(previous.id)} rel="prev" className={enabled}>
					← {previous.objectNumber}
				</Link>
			) : (
				<span className={disabled}>← Previous sheet</span>
			)}
			<Data className="text-ground-muted tabular-nums">{position}</Data>
			{next ? (
				<Link to={hrefFor(next.id)} rel="next" className={enabled}>
					{next.objectNumber} →
				</Link>
			) : (
				<span className={disabled}>Next sheet →</span>
			)}
		</nav>
	)
}

/**
 * A row of mutually exclusive options, each a link. Used for every two- or
 * three-way choice on these pages — view, language, length, model — because a
 * link leaves the choice in the URL, where it survives a reload and can be
 * pasted into an email, and a segmented row shows every option at once rather
 * than hiding them in a select.
 */
export function Segmented<T extends string>({
	label,
	options,
	current,
	hrefFor,
	className,
}: {
	label: string
	options: Array<{ id: T; label: React.ReactNode; title?: string }>
	current: T
	hrefFor: (id: T) => string
	className?: string
}) {
	return (
		<div className={cn('flex flex-col gap-1.5', className)}>
			<Data className="text-ground-muted">{label}</Data>
			<nav aria-label={label} className="flex flex-wrap">
				{options.map((option) => {
					const isCurrent = option.id === current
					return (
						<Link
							key={option.id}
							to={hrefFor(option.id)}
							title={option.title}
							aria-current={isCurrent ? 'true' : undefined}
							preventScrollReset
							prefetch="intent"
							className={cn(
								'font-data text-data-sm -ml-px border px-3 py-1.5 tracking-[0.12em] uppercase no-underline transition-colors first:ml-0',
								isCurrent
									? 'border-ground-fg bg-ground-fg text-ground'
									: 'border-rule text-ground-muted hover:border-link hover:text-link',
							)}
						>
							{option.label}
						</Link>
					)
				})}
			</nav>
		</div>
	)
}

/**
 * The museum's own notes that name this sheet, each with what changed in
 * response. Shown on the sheet itself because that is where a curator checks
 * whether a note was taken: reading the note and the output in one place.
 */
export function SheetNotes({
	notes,
	className,
}: {
	notes: Array<Note>
	className?: string
}) {
	if (!notes.length) return null
	return (
		<section
			aria-label="Your notes on this sheet"
			className={cn('border-link flex flex-col gap-4 border-l-2 pl-4', className)}
		>
			<Data className="text-link tracking-[0.2em]">
				Your notes on this sheet
			</Data>
			{notes.map((note) => (
				<div key={note.id} className="flex flex-col gap-1">
					<p className="font-body text-prose-sm italic">{note.said}</p>
					<p className="font-body text-prose-sm text-ground-muted">
						<span className="font-data text-data-sm text-ground-fg mr-2 tracking-[0.12em] uppercase not-italic">
							Round 3
						</span>
						{note.changed}
					</p>
				</div>
			))}
		</section>
	)
}

/* --------------------------------------------------------------------------
   Text marks.

   Four of the museum's notes on the texts are about words a reader can point
   at: hedges („wohl“), titles in quotation marks, named places, and technique.
   Marking them in the text itself lets a curator see a rule followed or broken
   while reading for tone, rather than trusting a count in a table. The
   patterns come from the research repo's rule checks via the manifest, so a
   word marked here is a word counted there.
   -------------------------------------------------------------------------- */

export type MarkKind = 'hedge' | 'quote' | 'place' | 'technique'

const MARK_STYLES: Record<MarkKind, { className: string; title: string }> = {
	quote: {
		className: 'bg-tint text-link',
		title: 'A title or name in quotation marks',
	},
	place: {
		className: 'underline decoration-link decoration-dotted decoration-2 underline-offset-4',
		title: 'A named place from the keywords',
	},
	hedge: {
		className: 'underline decoration-stamp-fg decoration-wavy underline-offset-4',
		title: 'A hedge',
	},
	technique: {
		className: 'text-stamp-fg underline decoration-stamp-fg underline-offset-4',
		title: 'A word the technique check matches',
	},
}

export type MarkPatterns = { hedge: string; technique: string }

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Character ranges to mark, earliest first, overlaps resolved by priority. */
function markRanges(text: string, patterns: MarkPatterns, places: Array<string>) {
	const found: Array<{ start: number; end: number; kind: MarkKind }> = []
	const collect = (regex: RegExp, kind: MarkKind) => {
		for (const match of text.matchAll(regex)) {
			if (match.index === undefined || !match[0]) continue
			found.push({ start: match.index, end: match.index + match[0].length, kind })
		}
	}
	// Priority is the order of collection: a place inside a quoted title belongs
	// to the title, and a hedge cannot be a place.
	collect(/„[^“]+“|“[^”]+”/g, 'quote')
	for (const place of places) {
		collect(new RegExp(`(?<![\\p{L}])${escapeRegex(place)}(?![\\p{L}])`, 'gu'), 'place')
	}
	collect(new RegExp(patterns.hedge, 'gi'), 'hedge')
	collect(new RegExp(patterns.technique, 'gi'), 'technique')

	const taken: typeof found = []
	for (const range of found) {
		if (taken.some((t) => range.start < t.end && t.start < range.end)) continue
		taken.push(range)
	}
	return taken.sort((a, b) => a.start - b.start)
}

/** A text with the museum's rule words marked, or plain when marks are off. */
export function MarkedText({
	text,
	patterns,
	places,
	enabled,
}: {
	text: string
	patterns: MarkPatterns
	places: Array<string>
	enabled: boolean
}) {
	if (!enabled) return <>{text}</>
	const parts: Array<React.ReactNode> = []
	let cursor = 0
	for (const range of markRanges(text, patterns, places)) {
		if (range.start > cursor) parts.push(text.slice(cursor, range.start))
		const style = MARK_STYLES[range.kind]
		parts.push(
			<span key={range.start} title={style.title} className={style.className}>
				{text.slice(range.start, range.end)}
			</span>,
		)
		cursor = range.end
	}
	if (cursor < text.length) parts.push(text.slice(cursor))
	return <>{parts}</>
}

/** How many of each mark a text carries, for the counts above it. */
export function countMarks(
	text: string,
	patterns: MarkPatterns,
	places: Array<string>,
) {
	const counts: Record<MarkKind, number> = {
		hedge: 0,
		quote: 0,
		place: 0,
		technique: 0,
	}
	for (const range of markRanges(text, patterns, places)) counts[range.kind] += 1
	return counts
}

export function MarkLegend({ className }: { className?: string }) {
	const items: Array<[MarkKind, string, string]> = [
		['hedge', 'wohl', 'hedge'],
		['quote', '„Apokalypse“', 'title in quotation marks'],
		['place', 'Frankfurt am Main', 'named place'],
		['technique', 'Radierung', 'technique'],
	]
	return (
		<div
			className={cn(
				'font-body text-prose-sm flex flex-wrap gap-x-5 gap-y-1',
				className,
			)}
		>
			{items.map(([kind, sample, label]) => (
				<span key={kind} className="whitespace-nowrap">
					<span className={MARK_STYLES[kind].className}>{sample}</span>
					<span className="text-ground-muted ml-1.5">{label}</span>
				</span>
			))}
		</div>
	)
}
