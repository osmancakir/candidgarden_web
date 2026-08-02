import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import * as React from 'react'

import { cn } from '#app/utils/misc.tsx'

function TooltipProvider(
	props: React.ComponentProps<typeof TooltipPrimitive.Provider>,
) {
	return <TooltipPrimitive.Provider data-slot="tooltip-provider" {...props} />
}

function Tooltip(props: React.ComponentProps<typeof TooltipPrimitive.Root>) {
	return (
		<TooltipProvider>
			<TooltipPrimitive.Root data-slot="tooltip" {...props} />
		</TooltipProvider>
	)
}

function TooltipTrigger(
	props: React.ComponentProps<typeof TooltipPrimitive.Trigger>,
) {
	return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

const TooltipContent = ({
	className,
	sideOffset = 4,
	...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) => (
	<TooltipPrimitive.Content
		data-slot="tooltip-content"
		sideOffset={sideOffset}
		className={cn(
			// §8/§10: no zoom, no slide, no shadow — a hairline box that is simply
			// there or not there.
			'bg-ground text-ground-fg border-rule-strong font-data text-data-sm z-50 overflow-hidden rounded-none border px-2 py-1 tracking-wide',
			className,
		)}
		{...props}
	/>
)

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
