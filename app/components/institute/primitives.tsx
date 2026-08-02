import { Link } from 'react-router'
import {
	archivalDate,
	DATASET,
	confidenceBand,
	formatConfidence,
	type VerificationStatus,
} from '#app/utils/archive.ts'
import { cn } from '#app/utils/misc.tsx'

/* ==========================================================================
   The Institute's component vocabulary (§6 of docs/brand-design.md).

   Everything here is register-relative: these read `--ground`, `--link`,
   `--rule` and `--stamp-fg` rather than naming a colour, so the same chip is
   correct on paper, on slate and on void without a variant prop.
   ========================================================================== */

/**
 * Machine text. Anything the *system* says — a label, a count, a status —
 * rather than anything a curator or scholar says.
 */
export function Data({
	className,
	as: Comp = 'span',
	...props
}: React.HTMLAttributes<HTMLElement> & { as?: React.ElementType }) {
	return (
		<Comp
			className={cn(
				'font-data text-data-sm tracking-[0.12em] uppercase',
				className,
			)}
			{...props}
		/>
	)
}

/**
 * Curatorial assertion — condensed grotesque caps. `level` picks the size step
 * rather than the heading level, so semantics and scale stay independent.
 */
export function Display({
	as: Comp = 'h2',
	size = 'chapter',
	className,
	...props
}: React.HTMLAttributes<HTMLElement> & {
	as?: React.ElementType
	size?: 'display' | 'chapter' | 'title'
}) {
	return (
		<Comp
			className={cn(
				'font-display uppercase',
				size === 'display' && 'text-display',
				size === 'chapter' && 'text-chapter',
				size === 'title' && 'text-title',
				className,
			)}
			{...props}
		/>
	)
}

/**
 * §5: "Every entry is timestamped." The record stamp — generation date and run
 * — is scientific provenance, not decoration.
 */
export function RecordStamp({
	date,
	run,
	className,
}: {
	date: Date | string | number
	run?: string | number
	className?: string
}) {
	return (
		<Data
			className={cn('text-ground-muted tracking-widest normal-case', className)}
		>
			<time dateTime={new Date(date).toISOString()}>{archivalDate(date)}</time>
			{run != null ? ` · run ${run}` : null}
		</Data>
	)
}

/**
 * §6 Metadata chip. A motif, carrying its confidence as a superscript. Clicking
 * one pivots into the index filtered by that motif — taxonomy as navigation.
 */
export function Chip({
	label,
	confidence,
	to,
	active = false,
	className,
}: {
	label: string
	confidence?: number
	to?: string
	active?: boolean
	className?: string
}) {
	const band = confidence == null ? null : confidenceBand(confidence)
	const body = (
		<>
			<span className="tracking-widest">{label}</span>
			{confidence == null ? null : (
				<sup
					className={cn(
						'ml-1 text-[0.6em] tabular-nums',
						band === 'low' ? 'text-stamp-fg' : 'text-ground-muted',
					)}
					title={`Agreement score ${formatConfidence(confidence)}`}
				>
					{formatConfidence(confidence)}
				</sup>
			)}
		</>
	)

	const classes = cn(
		'font-data text-data-sm inline-flex items-baseline border px-2 py-1 uppercase transition-colors',
		active
			? 'border-link bg-link text-ground'
			: 'border-rule text-ground-fg hover:border-link hover:text-link',
		className,
	)

	if (!to) return <span className={classes}>{body}</span>
	return (
		<Link to={to} className={cn(classes, 'no-underline')}>
			{body}
		</Link>
	)
}

/**
 * §6 The provenance stamp. A bordered mono block in the sealing-wax red,
 * referencing a print-room collection stamp. Appears once per dossier and in
 * essay footers; it is the project's trust mark.
 */
export function ProvenanceStamp({
	dataset = DATASET,
	run,
	date,
	verification,
	className,
}: {
	dataset?: string
	run?: string | number
	date: Date | string | number
	verification: VerificationStatus
	className?: string
}) {
	return (
		<div
			className={cn(
				'border-stamp-fg text-stamp-fg inline-block max-w-full border-2 p-3',
				className,
			)}
		>
			<div className="border-stamp-fg/50 mb-2 border-b pb-1">
				<Data className="tracking-[0.2em]">Provenance</Data>
			</div>
			<dl className="font-data text-data-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 uppercase">
				<dt className="tracking-[0.12em] opacity-70">Dataset</dt>
				<dd>{dataset}</dd>
				{run != null ? (
					<>
						<dt className="tracking-[0.12em] opacity-70">Run</dt>
						<dd>{run}</dd>
					</>
				) : null}
				<dt className="tracking-[0.12em] opacity-70">Generated</dt>
				<dd>{archivalDate(date)}</dd>
				<dt className="tracking-[0.12em] opacity-70">Human check</dt>
				<dd>{verification}</dd>
			</dl>
		</div>
	)
}

/**
 * §6 "Uncertainty as content." Where a reading is contested or thin, the
 * interface says so in its own voice, prominently, in mono. Renders nothing
 * when there is nothing to disclose — silence here has to mean something.
 */
export function UncertaintyNotice({
	notice,
	className,
}: {
	notice: string | null | undefined
	className?: string
}) {
	if (!notice) return null
	return (
		<p
			role="note"
			className={cn(
				'border-stamp-fg text-stamp-fg font-data text-data border-l-2 py-1 pl-3 tracking-[0.12em] uppercase',
				className,
			)}
		>
			{notice}
		</p>
	)
}

/**
 * A hairline-ruled section head: mono eyebrow on the left, stamp on the right.
 * Used above every block of records so the page reads as a filed document.
 */
export function SectionHead({
	eyebrow,
	aside,
	children,
	className,
}: {
	eyebrow?: React.ReactNode
	aside?: React.ReactNode
	children?: React.ReactNode
	className?: string
}) {
	return (
		<div className={cn('border-rule border-b pb-2', className)}>
			<div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
				{eyebrow ? <Data className="text-ground-muted">{eyebrow}</Data> : null}
				{aside ? <div className="ml-auto">{aside}</div> : null}
			</div>
			{children}
		</div>
	)
}

/**
 * §10 refuses skeleton-shimmer loaders. This is the replacement: the archive
 * telling you plainly what it is doing.
 */
export function LoadingRecords({ className }: { className?: string }) {
	return (
		<Data role="status" className={cn('text-ground-muted block', className)}>
			Loading records…
		</Data>
	)
}

/**
 * The empty state. An archive with nothing to show says so as a finding, not as
 * an apology or an illustration.
 */
export function NoRecords({
	children = 'No records match these filters.',
	className,
}: {
	children?: React.ReactNode
	className?: string
}) {
	return (
		<div className={cn('border-rule border py-16 text-center', className)}>
			<Data className="text-ground-muted">{children}</Data>
		</div>
	)
}
