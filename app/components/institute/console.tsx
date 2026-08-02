import { Form, Link } from 'react-router'
import { cn } from '#app/utils/misc.tsx'
import { Data } from './primitives.tsx'

/* ==========================================================================
   §6 The filter console.

   "Labeled fieldsets, native selects styled minimally, a visible Reset filters
   text button. It should feel like laboratory equipment, not e-commerce
   faceting." Every control here is a native element inside a GET form, so the
   console is fully keyboard-operable, works with JavaScript disabled, and
   leaves its state in the URL where it can be cited (§8).
   ========================================================================== */

export function FilterConsole({
	children,
	action,
	resetTo,
	summary,
	className,
}: {
	children: React.ReactNode
	action?: string
	/** Where "reset filters" points — usually the bare index path. */
	resetTo: string
	/** e.g. "1,284 records · 6 filters active" */
	summary?: React.ReactNode
	className?: string
}) {
	return (
		<Form
			method="get"
			action={action}
			role="search"
			className={cn('border-rule border', className)}
		>
			<div className="border-rule bg-tint flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b px-4 py-2">
				<Data className="tracking-[0.2em]">Filter console</Data>
				{summary ? (
					<Data className="text-ground-muted normal-case">{summary}</Data>
				) : null}
			</div>

			<div className="grid gap-x-6 gap-y-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
				{children}
			</div>

			<div className="border-rule flex flex-wrap items-center gap-x-6 gap-y-3 border-t px-4 py-3">
				<button
					type="submit"
					className="font-data text-data-sm border-ground-fg bg-ground-fg text-ground hover:text-ground-fg border px-4 py-2 tracking-[0.12em] uppercase transition-colors hover:bg-transparent"
				>
					Apply filters
				</button>
				{/* A text button, not a styled one — §6 asks for it visible and plain. */}
				<Link
					to={resetTo}
					className="font-data text-data-sm text-ground-muted hover:text-link tracking-[0.12em] uppercase underline underline-offset-4"
				>
					Reset filters
				</Link>
			</div>
		</Form>
	)
}

/** A labelled console control. The label is the machine naming a column. */
export function ConsoleField({
	label,
	hint,
	htmlFor,
	children,
	className,
}: {
	label: string
	hint?: string
	htmlFor: string
	children: React.ReactNode
	className?: string
}) {
	return (
		<div className={cn('flex flex-col gap-1.5', className)}>
			<label
				htmlFor={htmlFor}
				className="font-data text-data-sm text-ground-muted tracking-[0.12em] uppercase"
			>
				{label}
			</label>
			{children}
			{hint ? (
				<Data className="text-ground-muted normal-case opacity-70">{hint}</Data>
			) : null}
		</div>
	)
}

/**
 * A native `<select>`, styled minimally (§6). The arrow is drawn with a
 * background gradient rather than replaced with a component, so the control
 * keeps its platform behaviour on touch devices.
 */
export function ConsoleSelect({
	className,
	...props
}: React.ComponentProps<'select'>) {
	return (
		<select
			className={cn(
				'border-rule-strong font-data text-data text-ground-fg focus-visible:border-link focus-visible:outline-link h-10 w-full appearance-none rounded-none border bg-transparent px-3 outline-hidden focus-visible:outline-2',
				className,
			)}
			{...props}
		/>
	)
}

export function ConsoleInput({
	className,
	...props
}: React.ComponentProps<'input'>) {
	return (
		<input
			className={cn(
				'border-rule-strong font-data text-data text-ground-fg placeholder:text-ground-muted focus-visible:border-link focus-visible:outline-link h-10 w-full rounded-none border bg-transparent px-3 outline-hidden focus-visible:outline-2',
				className,
			)}
			{...props}
		/>
	)
}
