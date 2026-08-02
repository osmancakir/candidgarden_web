import * as LabelPrimitive from '@radix-ui/react-label'
import { cva } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '#app/utils/misc.tsx'

/**
 * A field label names a column of data, so it speaks in the machine voice:
 * mono, uppercase, wide-tracked (§4). This is what makes an ordinary form read
 * as a console.
 */
const labelVariants = cva(
	'font-data text-data-sm text-ground-muted block tracking-[0.12em] uppercase peer-disabled:cursor-not-allowed peer-disabled:opacity-40',
)

const Label = ({
	className,
	...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) => (
	<LabelPrimitive.Root
		data-slot="label"
		className={cn(labelVariants(), className)}
		{...props}
	/>
)

export { Label }
