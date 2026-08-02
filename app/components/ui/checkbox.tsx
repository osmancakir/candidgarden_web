import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import * as React from 'react'

import { cn } from '#app/utils/misc.tsx'

export type CheckboxProps = Omit<
	React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>,
	'type'
> & {
	type?: string
}

const Checkbox = ({
	className,
	...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) => (
	<CheckboxPrimitive.Root
		data-slot="checkbox"
		className={cn(
			// A square box that fills with the foreground colour — the tick mark of a
			// checklist on a paper form, not a toggle (§5: zero radius throughout).
			'peer border-rule-strong data-[state=checked]:border-ground-fg data-[state=checked]:bg-ground-fg data-[state=checked]:text-ground focus-visible:outline-link size-4 shrink-0 rounded-none border bg-transparent outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40',
			className,
		)}
		{...props}
	>
		<CheckboxPrimitive.Indicator
			data-slot="checkbox-indicator"
			className={cn('flex items-center justify-center text-current')}
		>
			<svg viewBox="0 0 8 8">
				<path
					d="M1,4 L3,6 L7,2"
					stroke="currentcolor"
					strokeWidth="1"
					fill="none"
				/>
			</svg>
		</CheckboxPrimitive.Indicator>
	</CheckboxPrimitive.Root>
)

export { Checkbox }
