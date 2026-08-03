import { Img } from 'openimg/react'
import { Link, NavLink, useSearchParams } from 'react-router'
import {
	ConsoleField,
	ConsoleSelect,
} from '#app/components/institute/console.tsx'
import { Data, Display } from '#app/components/institute/primitives.tsx'
import { cn, getWorkImgSrc } from '#app/utils/misc.tsx'
import {
	countTagValue,
	displayDating,
	MEDIA,
	TAG_FIELDS,
	type MediumId,
	type ModelInfo,
	type TagField,
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
	{ to: '/stadel-research', label: 'Overview', end: true },
	{ to: '/stadel-research/tags', label: 'Keywords', end: false },
	{ to: '/stadel-research/descriptions', label: 'Descriptions', end: false },
	{ to: '/stadel-research/evaluation', label: 'Evaluation', end: false },
]

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
export function Keyword({ children }: { children: React.ReactNode }) {
	return (
		<span className="border-rule font-data text-data-sm text-ground-fg inline-block max-w-full border px-2 py-1 leading-relaxed tracking-[0.06em] break-words">
			{children}
		</span>
	)
}

/** One schema field: its German name, its gloss, its count, and its values. */
export function TagFieldBlock({
	field,
	value,
	absent,
}: {
	field: TagField
	value: TagValue | undefined
	/** Rendered when the source structurally cannot hold this field. */
	absent?: React.ReactNode
}) {
	const meta = TAG_FIELDS[field]
	const count = countTagValue(value)
	return (
		<section className="border-rule border-t pt-3">
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
									<Keyword key={`${v}-${j}`}>{v}</Keyword>
								))}
							</div>
						</div>
					))}
				</div>
			)}
		</section>
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
}: {
	medium: MediumId
	workId: string | null
	modelId: string | null
	works: Array<{ id: string; objectNumber: string; title: string | null }>
	models: Array<ModelInfo>
	summary?: React.ReactNode
	resetTo: string
	extra?: React.ReactNode
	modelLabelText?: string
	/** When given, the model select gains an "all models" option with this label. */
	modelAllLabel?: string
}) {
	return (
		<form method="get" role="search" className="border-rule border">
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
					<ConsoleSelect id="s-model" name="model" defaultValue={modelId ?? ''}>
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
		</form>
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
