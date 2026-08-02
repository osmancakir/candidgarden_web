import { cn } from '#app/utils/misc.tsx'
import { Data, Display } from './primitives.tsx'

/**
 * The layout for every authentication surface.
 *
 * §10 refuses marketing heroes and centred product cards, so access pages are
 * built like the rest of the Institute: a mono document kind, a display title,
 * a Times statement, and the form itself in a hairline box at a narrow measure.
 * The tone follows §7 — the site asks you to identify yourself, it does not
 * welcome you back to your journey.
 */
export function AccessPage({
	kind,
	title,
	lead,
	children,
	aside,
	className,
}: {
	kind: string
	title: string
	lead?: React.ReactNode
	children: React.ReactNode
	/** Secondary routes — other ways in, or the way back out. */
	aside?: React.ReactNode
	className?: string
}) {
	return (
		<div className={cn('container py-12 md:py-20', className)}>
			<div className="grid gap-10 lg:grid-cols-12">
				<header className="lg:col-span-5">
					<Data className="text-ground-muted mb-4 block tracking-[0.2em]">
						{kind}
					</Data>
					<Display as="h1" size="chapter">
						{title}
					</Display>
					{lead ? (
						<p className="font-body text-prose-lg measure mt-6">{lead}</p>
					) : null}
					{aside ? <div className="mt-8">{aside}</div> : null}
				</header>

				<div className="lg:col-span-6 lg:col-start-7">
					<div className="border-rule border p-5 md:p-8">{children}</div>
				</div>
			</div>
		</div>
	)
}

/** A ruled divider carrying a mono label — "or", "alternatively", "passkey". */
export function AccessDivider({ children }: { children: React.ReactNode }) {
	return (
		<div className="my-6 flex items-center gap-4">
			<span className="bg-rule h-px flex-1" />
			<Data className="text-ground-muted">{children}</Data>
			<span className="bg-rule h-px flex-1" />
		</div>
	)
}
