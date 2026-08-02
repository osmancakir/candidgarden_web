import { cn } from '#app/utils/misc.tsx'
import { Data, Display } from './primitives.tsx'

/**
 * The layout for the Institute's written matter — charter, glossary, terms,
 * essays (§7, §8).
 *
 * These pages are documents, not landing pages: a mono masthead line, a display
 * title, one Times lead paragraph, and numbered sections at the reading
 * measure. Nothing is centred, nothing is boxed, and the numbering is visible
 * because a document that cites itself is the joke and the credibility both.
 */

export function DocumentPage({
	kind,
	title,
	lead,
	stamp,
	children,
	className,
}: {
	/** e.g. "Charter", "Glossary", "Terms" — the machine naming the document. */
	kind: string
	title: string
	lead?: React.ReactNode
	stamp?: React.ReactNode
	children: React.ReactNode
	className?: string
}) {
	return (
		<div className={cn('container py-12 md:py-16', className)}>
			<header className="border-rule border-b pb-8">
				<div className="mb-4 flex flex-wrap items-baseline justify-between gap-4">
					<Data className="text-ground-muted tracking-[0.2em]">{kind}</Data>
					{stamp ? <div className="ml-auto">{stamp}</div> : null}
				</div>
				<Display as="h1" size="chapter" className="measure-wide">
					{title}
				</Display>
				{lead ? (
					<p className="font-body text-prose-lg measure mt-6">{lead}</p>
				) : null}
			</header>
			<div className="mt-10 flex flex-col gap-12">{children}</div>
		</div>
	)
}

/** A numbered section of a document. The number is mono; the prose is Times. */
export function DocumentSection({
	n,
	heading,
	children,
	id,
}: {
	n: number | string
	heading: string
	children: React.ReactNode
	id?: string
}) {
	const slug =
		id ??
		String(heading)
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
	return (
		<section
			id={slug}
			className="grid scroll-mt-24 gap-x-8 gap-y-4 md:grid-cols-12"
		>
			<div className="md:col-span-3">
				<h2 className="flex items-baseline gap-3">
					<Data className="text-ground-muted tabular-nums">
						{typeof n === 'number' ? String(n).padStart(2, '0') : n}
					</Data>
					<span className="font-display text-title uppercase">{heading}</span>
				</h2>
			</div>
			<div className="prose-editorial md:col-span-9">{children}</div>
		</section>
	)
}

/**
 * A ledger: hairline-ruled rows of label, state, and action. Used wherever the
 * interface has a list of settings, credentials or connections to show. It is
 * the same visual logic as an index row — this archive files its users the way
 * it files its works.
 */
export function Ledger({
	children,
	className,
}: {
	children: React.ReactNode
	className?: string
}) {
	return <div className={cn('border-rule border-t', className)}>{children}</div>
}

export function LedgerRow({
	label,
	value,
	action,
	className,
}: {
	label: React.ReactNode
	value?: React.ReactNode
	action?: React.ReactNode
	className?: string
}) {
	return (
		<div
			className={cn(
				'border-rule flex flex-wrap items-baseline gap-x-6 gap-y-2 border-b py-4',
				className,
			)}
		>
			<Data className="text-ground-muted w-40 shrink-0">{label}</Data>
			{value ? (
				<div className="font-body text-prose min-w-0 flex-1">{value}</div>
			) : (
				<div className="flex-1" />
			)}
			{action ? <div className="ml-auto shrink-0">{action}</div> : null}
		</div>
	)
}

/** The heading used at the top of each settings surface. */
export function PanelHeading({
	kind,
	title,
	lead,
	className,
}: {
	kind?: string
	title: string
	lead?: React.ReactNode
	className?: string
}) {
	return (
		<header className={cn('border-rule border-b pb-4', className)}>
			{kind ? (
				<Data className="text-ground-muted mb-3 block tracking-[0.2em]">
					{kind}
				</Data>
			) : null}
			<Display as="h1" size="title">
				{title}
			</Display>
			{lead ? (
				<p className="font-body text-prose measure text-ground-muted mt-3">
					{lead}
				</p>
			) : null}
		</header>
	)
}

/**
 * §8: "A /glossary page defines the project's terms, including Panofsky's, in
 * plain language." A definition list is the right element and is allowed to
 * look like one.
 */
export function Glossary({
	entries,
}: {
	entries: Array<{ term: string; German?: string; definition: React.ReactNode }>
}) {
	return (
		<dl className="border-rule border-t">
			{entries.map(({ term, German, definition }) => (
				<div
					key={term}
					className="border-rule grid gap-x-8 gap-y-2 border-b py-5 md:grid-cols-12"
				>
					<dt className="md:col-span-3">
						<span className="font-display text-title block uppercase">
							{term}
						</span>
						{German ? (
							<Data className="text-ground-muted mt-1 block normal-case italic">
								{German}
							</Data>
						) : null}
					</dt>
					<dd className="font-body text-prose measure md:col-span-9">
						{definition}
					</dd>
				</div>
			))}
		</dl>
	)
}
