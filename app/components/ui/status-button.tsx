import { useSpinDelay } from 'spin-delay'
import { cn } from '#app/utils/misc.tsx'
import { Button, type ButtonVariant } from './button.tsx'
import { Icon } from './icon.tsx'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from './tooltip.tsx'

export const StatusButton = ({
	message,
	status,
	className,
	children,
	spinDelay,
	...props
}: React.ComponentProps<'button'> &
	ButtonVariant & {
		status: 'pending' | 'success' | 'error' | 'idle'
		message?: string | null
		spinDelay?: Parameters<typeof useSpinDelay>[1]
	}) => {
	const delayedPending = useSpinDelay(status === 'pending', {
		delay: 400,
		minDuration: 300,
		...spinDelay,
	})
	// §10 refuses skeleton-shimmer loaders in favour of mono status text, so the
	// pending state announces itself in words rather than spinning.
	const companion = {
		pending: delayedPending ? (
			<span role="status" className="font-data text-data-sm tracking-[0.12em]">
				WORKING…
			</span>
		) : null,
		success: (
			<span
				role="status"
				className="inline-flex size-6 items-center justify-center"
			>
				<Icon name="check" title="success" />
			</span>
		),
		error: (
			<span
				role="status"
				className="border-stamp-fg text-stamp-fg inline-flex size-6 items-center justify-center border"
			>
				<Icon name="cross-1" title="error" />
			</span>
		),
		idle: null,
	}[status]

	return (
		<Button className={cn('flex justify-center gap-4', className)} {...props}>
			<div>{children}</div>
			{message ? (
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger>{companion}</TooltipTrigger>
						<TooltipContent>{message}</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			) : (
				companion
			)}
		</Button>
	)
}
StatusButton.displayName = 'Button'
