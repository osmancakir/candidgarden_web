import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import * as React from 'react'

import { cn } from '#app/utils/misc.tsx'

function DropdownMenu(
	props: React.ComponentProps<typeof DropdownMenuPrimitive.Root>,
) {
	return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuPortal(
	props: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>,
) {
	return (
		<DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
	)
}

function DropdownMenuTrigger(
	props: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>,
) {
	return (
		<DropdownMenuPrimitive.Trigger
			data-slot="dropdown-menu-trigger"
			{...props}
		/>
	)
}

function DropdownMenuGroup(
	props: React.ComponentProps<typeof DropdownMenuPrimitive.Group>,
) {
	return (
		<DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
	)
}

function DropdownMenuSub(
	props: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>,
) {
	return <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />
}

function DropdownMenuRadioGroup(
	props: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>,
) {
	return (
		<DropdownMenuPrimitive.RadioGroup
			data-slot="dropdown-menu-radio-group"
			{...props}
		/>
	)
}

const DropdownMenuContent = ({
	className,
	sideOffset = 4,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) => (
	<DropdownMenuPrimitive.Portal>
		<DropdownMenuPrimitive.Content
			data-slot="dropdown-menu-content"
			sideOffset={sideOffset}
			className={cn(
				'bg-popover text-popover-foreground border-rule z-50 min-w-[8rem] overflow-hidden rounded-none border p-1',
				className,
			)}
			{...props}
		/>
	</DropdownMenuPrimitive.Portal>
)

const DropdownMenuSubTrigger = ({
	className,
	inset,
	children,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & {
	inset?: boolean
}) => (
	<DropdownMenuPrimitive.SubTrigger
		data-slot="dropdown-menu-sub-trigger"
		data-inset={inset}
		className={cn(
			'focus:bg-accent data-[state=open]:bg-accent font-data text-data-sm flex items-center rounded-none px-2 py-1.5 tracking-[0.12em] uppercase outline-hidden select-none',
			inset && 'pl-8',
			className,
		)}
		{...props}
	>
		{children}
		<span className="ml-auto size-4">▶️</span>
	</DropdownMenuPrimitive.SubTrigger>
)

const DropdownMenuSubContent = ({
	className,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) => (
	<DropdownMenuPrimitive.SubContent
		data-slot="dropdown-menu-sub-content"
		className={cn(
			'bg-popover text-popover-foreground border-rule z-50 min-w-[8rem] overflow-hidden rounded-none border p-1',
			className,
		)}
		{...props}
	/>
)

const DropdownMenuItem = ({
	className,
	inset,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
	inset?: boolean
}) => (
	<DropdownMenuPrimitive.Item
		data-slot="dropdown-menu-item"
		data-inset={inset}
		className={cn(
			'focus:bg-accent focus:text-accent-foreground font-data text-data-sm relative flex cursor-pointer items-center rounded-none px-2 py-1.5 tracking-[0.12em] uppercase outline-hidden transition-colors select-none data-disabled:pointer-events-none data-disabled:opacity-50',
			inset && 'pl-8',
			className,
		)}
		{...props}
	/>
)

const DropdownMenuCheckboxItem = ({
	className,
	children,
	checked,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) => (
	<DropdownMenuPrimitive.CheckboxItem
		data-slot="dropdown-menu-checkbox-item"
		className={cn(
			'focus:bg-accent focus:text-accent-foreground font-data text-data-sm relative flex cursor-pointer items-center rounded-none py-1.5 pr-2 pl-8 tracking-[0.12em] uppercase outline-hidden transition-colors select-none data-disabled:pointer-events-none data-disabled:opacity-50',
			className,
		)}
		checked={checked}
		{...props}
	>
		<span className="absolute left-2 flex size-3.5 items-center justify-center">
			<DropdownMenuPrimitive.ItemIndicator>
				<span className="size-4">
					<svg viewBox="0 0 8 8">
						<path
							d="M1,4 L3,6 L7,2"
							stroke="black"
							strokeWidth="1"
							fill="none"
						/>
					</svg>
				</span>
			</DropdownMenuPrimitive.ItemIndicator>
		</span>
		{children}
	</DropdownMenuPrimitive.CheckboxItem>
)

const DropdownMenuRadioItem = ({
	className,
	children,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) => (
	<DropdownMenuPrimitive.RadioItem
		data-slot="dropdown-menu-radio-item"
		className={cn(
			'focus:bg-accent focus:text-accent-foreground font-data text-data-sm relative flex cursor-pointer items-center rounded-none py-1.5 pr-2 pl-8 tracking-[0.12em] uppercase outline-hidden transition-colors select-none data-disabled:pointer-events-none data-disabled:opacity-50',
			className,
		)}
		{...props}
	>
		<span className="absolute left-2 flex size-3.5 items-center justify-center">
			<DropdownMenuPrimitive.ItemIndicator>
				<span className="size-2">⚪</span>
			</DropdownMenuPrimitive.ItemIndicator>
		</span>
		{children}
	</DropdownMenuPrimitive.RadioItem>
)

const DropdownMenuLabel = ({
	className,
	inset,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & {
	inset?: boolean
}) => (
	<DropdownMenuPrimitive.Label
		data-slot="dropdown-menu-label"
		data-inset={inset}
		className={cn(
			'px-2 py-1.5 text-sm font-semibold',
			inset && 'pl-8',
			className,
		)}
		{...props}
	/>
)

const DropdownMenuSeparator = ({
	className,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) => (
	<DropdownMenuPrimitive.Separator
		data-slot="dropdown-menu-separator"
		className={cn('bg-muted -mx-1 my-1 h-px', className)}
		{...props}
	/>
)

const DropdownMenuShortcut = ({
	className,
	...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
	return (
		<span
			className={cn('ml-auto text-xs tracking-widest opacity-60', className)}
			{...props}
		/>
	)
}

export {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuCheckboxItem,
	DropdownMenuRadioItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuGroup,
	DropdownMenuPortal,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuRadioGroup,
}
