import { cn } from '#app/utils/misc.tsx'

/** The homepage's section heading, with an optional `(07)`-style count. */
export function SectionTitle({
	children,
	count,
	id,
	className,
}: {
	children: React.ReactNode
	count?: number
	id?: string
	className?: string
}) {
	return (
		<h2
			id={id}
			className={cn(
				'font-display flex items-start gap-3 text-[clamp(2.5rem,7vw,6rem)] leading-[0.9] tracking-[-0.02em] uppercase',
				className,
			)}
		>
			{children}
			{count != null ? (
				<sup className="font-data text-data-sm text-ground-muted mt-2 tracking-normal">
					({String(count).padStart(2, '0')})
				</sup>
			) : null}
		</h2>
	)
}
