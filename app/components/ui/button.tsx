import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '#app/utils/misc.tsx'

/**
 * Buttons are machine text: mono, uppercase, wide-tracked, square (§4, §9).
 * They read as laboratory equipment rather than calls to action — no radius, no
 * shadow, no gradient (§10). Every variant is register-relative, so a button
 * dropped inside `.register-void` inverts without being told to.
 */
const buttonVariants = cva(
	'font-data text-data-sm focus-visible:outline-link inline-flex items-center justify-center gap-2 rounded-none border tracking-[0.12em] uppercase outline-hidden transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-40',
	{
		variants: {
			variant: {
				// The curatorial assertion: a solid block of the foreground colour.
				default:
					'border-ground-fg bg-ground-fg text-ground hover:text-ground-fg hover:bg-transparent',
				// The default control: a hairline box that fills on hover.
				outline:
					'border-rule-strong text-ground-fg hover:border-ground-fg hover:bg-ground-fg hover:text-ground bg-transparent',
				// Provenance red, reserved for irreversible acts.
				destructive:
					'border-stamp-fg text-stamp-fg hover:bg-stamp-fg hover:text-ground bg-transparent',
				secondary:
					'bg-tint text-ground-fg hover:bg-tint-strong border-transparent',
				ghost: 'text-ground-fg hover:bg-tint border-transparent bg-transparent',
				// §8: hover states are ultramarine underlines and nothing else.
				link: 'text-link border-transparent bg-transparent underline-offset-4 hover:underline',
			},
			size: {
				default: 'h-10 px-4 py-2',
				wide: 'px-16 py-4',
				sm: 'h-8 px-3',
				lg: 'h-12 px-8',
				pill: 'px-10 py-3',
				icon: 'size-10',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	},
)

export type ButtonVariant = VariantProps<typeof buttonVariants>

const Button = ({
	className,
	variant,
	size,
	asChild = false,
	...props
}: React.ComponentProps<'button'> &
	ButtonVariant & {
		asChild?: boolean
	}) => {
	const Comp = asChild ? Slot : 'button'
	return (
		<Comp
			data-slot="button"
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	)
}

export { Button, buttonVariants }
