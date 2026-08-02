import { Toaster as Sonner } from 'sonner'

type ToasterProps = React.ComponentProps<typeof Sonner>

const EpicToaster = ({ theme, ...props }: ToasterProps) => {
	return (
		<Sonner
			theme={theme}
			className="toaster group"
			toastOptions={{
				classNames: {
					toast:
						// §10: no shadow, no radius. A toast is a slip of paper with a hairline edge.
						'group toast group-[.toaster]:rounded-none group-[.toaster]:border group-[.toaster]:border-rule group-[.toaster]:bg-ground group-[.toaster]:font-data group-[.toaster]:text-data-sm group-[.toaster]:tracking-wide group-[.toaster]:text-ground-fg group-[.toaster]:shadow-none',
					description:
						'group-[.toast]:text-ground-muted group-[.toast]:font-body group-[.toast]:normal-case',
					actionButton:
						'group-[.toast]:rounded-none group-[.toast]:bg-ground-fg group-[.toast]:text-ground',
					cancelButton:
						'group-[.toast]:rounded-none group-[.toast]:bg-tint group-[.toast]:text-ground-muted',
				},
			}}
			{...props}
		/>
	)
}

export { EpicToaster }
