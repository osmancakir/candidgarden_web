import { Link } from 'react-router'
import { Data } from '#app/components/institute/primitives.tsx'
import { cn } from '#app/utils/misc.tsx'
import { type StaedelFigures, type WorkCard } from './content.ts'
import { SectionTitle } from './section-title.tsx'

/**
 * Selected work — parked, November 2026.
 *
 * The homepage's case-study grid, taken off the page until there are
 * screenshots worth leading with. Nothing imports it; to bring it back, have
 * the loader in `../index.tsx` build `StaedelFigures` again (from `figures()`
 * in the prospectus and `rounds` in the Städel pilot), render
 * `<Work cards={workCards(staedel)} staedel={staedel} />` between the
 * statement and the services, put the "Work" item back in
 * the masthead nav, and point the service rows' evidence at the `#work-*`
 * anchors again.
 */

const n = (value: number) => value.toLocaleString('en-US')

const SPAN: Record<WorkCard['span'], string> = {
	5: 'md:col-span-5',
	6: 'md:col-span-6',
	7: 'md:col-span-7',
	12: 'md:col-span-12',
}

export function Work({
	cards,
	staedel,
}: {
	cards: Array<WorkCard>
	staedel: StaedelFigures
}) {
	return (
		<section id="work" className="container scroll-mt-24 pb-28">
			<div className="border-rule mb-12 flex flex-wrap items-end justify-between gap-6 border-b pb-6">
				<SectionTitle count={cards.length}>Selected work</SectionTitle>
				<Data className="text-ground-muted max-w-xs tracking-normal normal-case">
					A client engagement, our own collection, and the products we run.
					Everything here can be opened.
				</Data>
			</div>
			<div className="grid gap-x-6 gap-y-16 md:grid-cols-12">
				{cards.map((card) => (
					<WorkCardView key={card.id} card={card} staedel={staedel} />
				))}
			</div>
		</section>
	)
}

function CardLink({
	card,
	className,
	children,
}: {
	card: WorkCard
	className?: string
	children: React.ReactNode
}) {
	return card.external ? (
		<a href={card.href} target="_blank" rel="noreferrer" className={className}>
			{children}
		</a>
	) : (
		<Link to={card.href} prefetch="intent" className={className}>
			{children}
		</Link>
	)
}

function WorkCardView({
	card,
	staedel,
}: {
	card: WorkCard
	staedel: StaedelFigures
}) {
	return (
		<article id={card.id} className={cn('group scroll-mt-24', SPAN[card.span])}>
			<CardLink
				card={card}
				className="border-rule relative block overflow-hidden border no-underline"
			>
				<div className={cn('relative w-full overflow-hidden', card.aspect)}>
					{card.image ? (
						<img
							src={card.image}
							alt=""
							loading="lazy"
							className={cn(
								'absolute inset-0 h-full w-full motion-safe:transition-transform motion-safe:duration-700 motion-safe:group-hover:scale-[1.03]',
								card.fit === 'contain'
									? 'bg-paper object-contain'
									: 'object-cover object-left-top',
							)}
						/>
					) : (
						<StaedelPlate staedel={staedel} />
					)}
				</div>
			</CardLink>
			<div className="mt-5 flex flex-col gap-2">
				<Data className="text-ground-muted">
					{card.category}
					<span aria-hidden> · </span>
					<span className="text-ground-fg">{card.client}</span>
				</Data>
				<h3 className="font-display text-title leading-[1.02] uppercase">
					<CardLink card={card} className="group-hover:text-link no-underline">
						{card.title}
						{card.external ? (
							<span aria-hidden className="ml-2 align-top text-[0.6em]">
								↗
							</span>
						) : null}
					</CardLink>
				</h3>
				<p className="font-body text-prose text-ground-muted max-w-[60ch]">
					{card.line}
				</p>
			</div>
		</article>
	)
}

/**
 * The Städel card has no screenshot. The sheets are the museum's to publish
 * and the scoreboard is the museum's to read, so the card says what the work
 * was in figures, on the accent ground, and links to the working area — which
 * asks for a named account, as it should.
 */
function StaedelPlate({ staedel }: { staedel: StaedelFigures }) {
	const items = [
		[n(staedel.sample), 'sheets, frozen'],
		[n(staedel.calls), 'model calls'],
		[String(staedel.rounds), 'rounds of notes'],
		['0', 'model names shown to the judge'],
	] as const
	return (
		<div className="bg-ultra text-bone absolute inset-0 flex flex-col justify-between p-6 md:p-10">
			<div className="flex flex-wrap items-baseline justify-between gap-4">
				<span className="font-data text-data-sm tracking-[0.25em] uppercase">
					Graphische Sammlung · Pilot 2026
				</span>
				<span className="font-data text-data-sm tracking-[0.25em] uppercase opacity-80">
					Working area · by named account →
				</span>
			</div>
			<p className="font-display text-[clamp(3rem,10vw,9.5rem)] leading-[0.85] tracking-[-0.03em] uppercase">
				Judged blind.
			</p>
			<div className="grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4">
				{items.map(([value, label]) => (
					<div key={label} className="border-bone/40 border-t pt-3">
						<div className="font-display text-[clamp(2.25rem,5vw,4.5rem)] leading-[0.85] tracking-[-0.03em]">
							{value}
						</div>
						<div className="font-data text-data-sm mt-2 tracking-[0.14em] uppercase opacity-85">
							{label}
						</div>
					</div>
				))}
			</div>
		</div>
	)
}
