import * as React from 'react'

import { cn } from '#app/utils/misc.tsx'

/**
 * Long-form input is prose, so it is set in the body face at the reading
 * measure — what you type looks like what it will become. Short/`data` inputs
 * stay mono; see `Input`.
 */
const Textarea = ({
	className,
	...props
}: React.ComponentProps<'textarea'>) => {
	return (
		<textarea
			className={cn(
				'font-body text-ground-fg placeholder:text-ground-muted border-rule-strong text-prose flex min-h-32 w-full rounded-none border bg-transparent px-3 py-2 leading-relaxed outline-hidden',
				'focus-visible:border-link focus-visible:outline-link focus-visible:outline-2 focus-visible:outline-offset-0',
				'aria-[invalid]:border-stamp-fg',
				'disabled:cursor-not-allowed disabled:opacity-40',
				className,
			)}
			{...props}
		/>
	)
}

export { Textarea }
