import * as React from 'react'

import { cn } from '#app/utils/misc.tsx'

/**
 * Text inputs belong to the console, not to a form-as-product: square, hairline
 * underline-and-box, mono value text so what the operator typed reads as data
 * (§6, "laboratory equipment, not e-commerce faceting").
 */
const Input = ({
	className,
	type,
	...props
}: React.ComponentProps<'input'>) => {
	return (
		<input
			data-slot="input"
			type={type}
			className={cn(
				'font-data text-ground-fg placeholder:text-ground-muted border-rule-strong text-data flex h-10 w-full rounded-none border bg-transparent px-3 py-2 tracking-normal outline-hidden',
				'focus-visible:border-link focus-visible:outline-link focus-visible:outline-2 focus-visible:outline-offset-0',
				'aria-[invalid]:border-stamp-fg aria-[invalid]:text-stamp-fg',
				'file:font-data file:text-data-sm file:border-0 file:bg-transparent file:tracking-[0.12em] file:uppercase',
				'disabled:cursor-not-allowed disabled:opacity-40',
				className,
			)}
			{...props}
		/>
	)
}

export { Input }
