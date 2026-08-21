import { Data, Display } from '#app/components/institute/primitives.tsx'
import { cn } from '#app/utils/misc.tsx'
import { say, type L, type Lang, type Slide } from './deck.ts'
import { type Scoreboards } from './figures.server.ts'

/* ==========================================================================
   The prospectus, rendered as a screen rather than as a document.

   Every other surface in this project is built to be read at the reader's own
   pace. This one is built to be *shown*: one claim at a time, at a size that
   survives a projector at the back of a Sitzungszimmer, with the argument's
   spine — eyebrow, title, claim — in the same place on every slide so a room
   can follow where it is without being told.

   The vocabulary is the house one, unchanged. Mono for anything the machine
   says, Archivo Black for an assertion, Times for anything a person wrote. A
   pitch that arrived in a different typeface than the work it is pitching would
   be the first thing in the room that was not what it said it was.
   ========================================================================== */

/**
 * The headline size for the two slides that get one.
 *
 * Not `size="display"` as-is: that step tops out at 7rem, and MASCHINENLESUNGEN
 * set in Archivo Black at 7rem is wider than the deck's own measure — the
 * German compound runs off the right edge of a 1600px projector. The step is
 * capped rather than the word hyphenated, because a hyphen through a display-cap
 * headline looks like a mistake and a smaller headline does not.
 */
const HEADLINE =
	'text-[clamp(2.25rem,6.4vw,5rem)] leading-[0.92] tracking-[-0.02em]'

/** Eyebrow and title: the two lines that sit in the same place on every slide. */
function SlideHead({
	slide,
	lang,
	className,
}: {
	slide: Slide
	lang: Lang
	className?: string
}) {
	return (
		<div className={cn('flex flex-col gap-3', className)}>
			<Data className="text-ground-muted tracking-[0.2em]">
				{say(slide.eyebrow, lang)}
			</Data>
			<Display as="h2" size="title" className="measure-wide">
				{say(slide.title, lang)}
			</Display>
		</div>
	)
}

/** A body paragraph. Times, at the measure, never wider. */
function Para({ text, className }: { text: string; className?: string }) {
	return (
		<p className={cn('font-body text-prose-lg measure', className)}>{text}</p>
	)
}

/**
 * The footnote band at the bottom of a slide — where a claim states its own
 * limits. Set in the stamp red rather than in grey: on this deck the caveat is
 * the argument, and greying it out would contradict the slide it sits under.
 */
function Caveat({ text }: { text: string }) {
	return (
		<p className="border-stamp-fg/40 text-stamp-fg font-data text-data-sm measure-wide border-l-2 py-1 pl-4 tracking-[0.12em] uppercase">
			{text}
		</p>
	)
}

function List({
	items,
	lang,
	marker,
}: {
	items: Array<L>
	lang: Lang
	marker: 'rule' | 'none'
}) {
	return (
		<ul className="flex flex-col gap-3">
			{items.map((item, i) => (
				<li
					key={i}
					className={cn(
						'font-body text-prose measure',
						marker === 'rule' && 'border-rule border-l pl-4',
					)}
				>
					{say(item, lang)}
				</li>
			))}
		</ul>
	)
}

/* ---------------------------------------------------------------- the kinds */

function TitleSlide({
	slide,
	lang,
}: {
	slide: Extract<Slide, { kind: 'title' }>
	lang: Lang
}) {
	return (
		<div className="flex flex-col gap-8">
			<Data className="text-ground-muted tracking-[0.2em]">
				{say(slide.eyebrow, lang)}
			</Data>
			<Display as="h2" size="display" className={cn('measure-wide', HEADLINE)}>
				{say(slide.title, lang)}
			</Display>
			<Para text={say(slide.lead, lang)} />
			<dl className="border-rule grid gap-x-8 gap-y-4 border-t pt-6 sm:grid-cols-3">
				{slide.meta.map((entry) => (
					<div key={entry.label.en} className="flex flex-col gap-1">
						<dt>
							<Data className="text-ground-muted">
								{say(entry.label, lang)}
							</Data>
						</dt>
						<dd className="font-body text-prose-sm">
							{say(entry.value, lang)}
						</dd>
					</div>
				))}
			</dl>
		</div>
	)
}

function ClaimSlide({
	slide,
	lang,
}: {
	slide: Extract<Slide, { kind: 'claim' }>
	lang: Lang
}) {
	return (
		<div className="flex flex-col gap-8">
			<SlideHead slide={slide} lang={lang} />
			<Display as="p" size="chapter" className="measure-wide">
				{say(slide.statement, lang)}
			</Display>
			{slide.figure ? (
				<div className="border-rule-strong flex flex-col gap-2 border-y py-5">
					<span className="font-data text-display text-link leading-none tabular-nums">
						{say(slide.figure.value, lang)}
					</span>
					<Data className="text-ground-muted normal-case">
						{say(slide.figure.caption, lang)}
					</Data>
				</div>
			) : null}
			{/* Two columns above lg so four paragraphs do not become a scroll on a
			    projector; one column below, where a narrow measure reads better than
			    a squeezed pair. */}
			<div className="grid gap-x-12 gap-y-5 lg:grid-cols-2">
				{slide.body.map((para, i) => (
					<Para key={i} text={say(para, lang)} />
				))}
			</div>
			{slide.note ? <Caveat text={say(slide.note, lang)} /> : null}
		</div>
	)
}

function CapabilitiesSlide({
	slide,
	lang,
}: {
	slide: Extract<Slide, { kind: 'capabilities' }>
	lang: Lang
}) {
	return (
		<div className="flex flex-col gap-8">
			<SlideHead slide={slide} lang={lang} />
			<Para text={say(slide.lead, lang)} />
			<dl className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
				{slide.items.map((item) => (
					<div
						key={item.label.en}
						className="border-rule flex flex-col gap-1 border-t pt-4"
					>
						<dt className="font-data text-chapter leading-none tabular-nums">
							{say(item.value, lang)}
						</dt>
						<dd className="flex flex-col gap-1">
							<Data>{say(item.label, lang)}</Data>
							<span className="font-body text-prose-sm text-ground-muted">
								{say(item.note, lang)}
							</span>
						</dd>
					</div>
				))}
			</dl>
		</div>
	)
}

function ScoresSlide({
	slide,
	lang,
	scoreboards,
}: {
	slide: Extract<Slide, { kind: 'scores' }>
	lang: Lang
	scoreboards: Scoreboards
}) {
	const decimal = (value: number | null) =>
		value == null
			? '—'
			: lang === 'de'
				? value.toFixed(2).replace('.', ',')
				: value.toFixed(2)

	return (
		<div className="flex flex-col gap-7">
			<SlideHead slide={slide} lang={lang} />
			<Para text={say(slide.lead, lang)} className="text-prose" />
			<div className="grid gap-x-10 gap-y-8 xl:grid-cols-2">
				{scoreboards.map((board) => (
					<div key={board.id} className="overflow-x-auto">
						<table className="min-w-full">
							<caption className="mb-2 text-left">
								<Data className="tracking-[0.2em]">
									{lang === 'de' ? board.german : board.label}
								</Data>
							</caption>
							<thead>
								<tr className="border-rule-strong border-b">
									<th
										scope="col"
										className="font-data text-data-sm text-ground-muted py-2 pr-4 text-left tracking-[0.12em] uppercase"
									>
										{lang === 'de' ? 'Modell' : 'Model'}
									</th>
									{board.rows[0]?.scores.map((score) => (
										<th
											key={score.id}
											scope="col"
											className="font-data text-data-sm text-ground-muted py-2 pr-4 text-right tracking-[0.12em] uppercase"
										>
											{say(score.label, lang)}
										</th>
									))}
									<th
										scope="col"
										className="font-data text-data-sm py-2 text-right tracking-[0.12em] uppercase"
									>
										{lang === 'de' ? 'Gesamt' : 'Overall'}
									</th>
								</tr>
							</thead>
							<tbody>
								{board.rows.map((row) => (
									<tr key={row.model} className="border-rule border-b">
										<th
											scope="row"
											className="font-body text-prose-sm py-2 pr-4 text-left font-normal"
										>
											{row.label}
											<Data className="text-ground-muted ml-2">
												{row.provider}
											</Data>
										</th>
										{row.scores.map((score) => (
											<td
												key={score.id}
												className="font-data text-data py-2 pr-4 text-right tabular-nums"
											>
												{decimal(score.value)}
											</td>
										))}
										<td className="font-data text-data py-2 text-right font-bold tabular-nums">
											{decimal(row.overall)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				))}
			</div>
			<div className="grid gap-x-12 gap-y-4 lg:grid-cols-2">
				{slide.body.map((para, i) => (
					<Para key={i} text={say(para, lang)} className="text-prose" />
				))}
			</div>
			<Caveat text={say(slide.note, lang)} />
		</div>
	)
}

function ServiceSlide({
	slide,
	lang,
}: {
	slide: Extract<Slide, { kind: 'service' }>
	lang: Lang
}) {
	const doesLabel = lang === 'de' ? 'Was geschieht' : 'What happens'
	const deliversLabel = lang === 'de' ? 'Was Sie erhalten' : 'What you receive'
	const evidenceLabel = lang === 'de' ? 'Beleg' : 'Evidence'
	const durationLabel = lang === 'de' ? 'Dauer' : 'Duration'

	return (
		<div className="flex flex-col gap-7">
			<div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
				<div className="flex items-baseline gap-5">
					<span className="font-data text-chapter text-ground-muted leading-none tabular-nums">
						{slide.number}
					</span>
					<Display as="h2" size="chapter" className="measure-wide">
						{say(slide.title, lang)}
					</Display>
				</div>
				<div className="border-rule flex flex-col gap-1 border-l pl-4">
					<Data className="text-ground-muted">{durationLabel}</Data>
					<Data>{say(slide.duration, lang)}</Data>
				</div>
			</div>
			<p className="font-body text-prose-lg measure-wide border-rule-strong border-l-2 pl-5 italic">
				{say(slide.promise, lang)}
			</p>
			<div className="grid gap-x-12 gap-y-7 lg:grid-cols-2">
				<div className="flex flex-col gap-4">
					<Data className="text-ground-muted tracking-[0.2em]">
						{doesLabel}
					</Data>
					<List items={slide.does} lang={lang} marker="rule" />
				</div>
				<div className="flex flex-col gap-4">
					<Data className="text-ground-muted tracking-[0.2em]">
						{deliversLabel}
					</Data>
					<List items={slide.delivers} lang={lang} marker="rule" />
				</div>
			</div>
			<div className="border-rule flex flex-col gap-2 border-t pt-5">
				<Data className="text-stamp-fg tracking-[0.2em]">{evidenceLabel}</Data>
				<p className="font-body text-prose measure-wide">
					{say(slide.evidence, lang)}
				</p>
			</div>
		</div>
	)
}

function PhasesSlide({
	slide,
	lang,
}: {
	slide: Extract<Slide, { kind: 'phases' }>
	lang: Lang
}) {
	return (
		<div className="flex flex-col gap-7">
			<SlideHead slide={slide} lang={lang} />
			<Para text={say(slide.lead, lang)} className="text-prose" />
			<ol className="border-rule flex flex-col border-t">
				{slide.phases.map((phase) => (
					<li
						key={phase.n}
						className="border-rule grid items-baseline gap-x-6 gap-y-1 border-b py-3 sm:grid-cols-[3rem_minmax(0,14rem)_minmax(0,9rem)_1fr]"
					>
						<span className="font-data text-data text-ground-muted tabular-nums">
							{phase.n}
						</span>
						<Display as="h3" size="title" className="text-[1.0625rem]">
							{say(phase.name, lang)}
						</Display>
						<Data className="text-ground-muted">
							{say(phase.duration, lang)}
						</Data>
						<span className="font-body text-prose-sm">
							{say(phase.output, lang)}
						</span>
					</li>
				))}
			</ol>
		</div>
	)
}

function ChecklistSlide({
	slide,
	lang,
}: {
	slide: Extract<Slide, { kind: 'checklist' }>
	lang: Lang
}) {
	return (
		<div className="flex flex-col gap-7">
			<SlideHead slide={slide} lang={lang} />
			<Para text={say(slide.lead, lang)} className="text-prose" />
			<dl className="grid gap-x-10 gap-y-6 lg:grid-cols-2">
				{slide.items.map((item, i) => (
					<div
						key={item.label.en}
						className="border-rule flex flex-col gap-1 border-t pt-4"
					>
						<dt className="flex items-baseline gap-3">
							<span className="font-data text-data-sm text-ground-muted tabular-nums">
								{String(i + 1).padStart(2, '0')}
							</span>
							<Display as="span" size="title" className="text-[1.0625rem]">
								{say(item.label, lang)}
							</Display>
						</dt>
						<dd className="font-body text-prose-sm pl-9">
							{say(item.note, lang)}
						</dd>
					</div>
				))}
			</dl>
		</div>
	)
}

function CloseSlide({
	slide,
	lang,
}: {
	slide: Extract<Slide, { kind: 'close' }>
	lang: Lang
}) {
	return (
		<div className="flex flex-col gap-8">
			<Data className="text-ground-muted tracking-[0.2em]">
				{say(slide.eyebrow, lang)}
			</Data>
			<Display as="h2" size="display" className={cn('measure-wide', HEADLINE)}>
				{say(slide.title, lang)}
			</Display>
			<Para text={say(slide.lead, lang)} />
			<a
				href={`mailto:${slide.email}`}
				className="text-link font-data text-title w-fit tracking-[0.08em] no-underline hover:underline"
			>
				{slide.email}
			</a>
			<ul className="border-rule flex flex-col gap-2 border-t pt-5">
				{slide.lines.map((line, i) => (
					<li key={i}>
						<Data className="text-ground-muted normal-case">
							{say(line, lang)}
						</Data>
					</li>
				))}
			</ul>
		</div>
	)
}

/** One slide, whichever kind it is. */
export function SlideView({
	slide,
	lang,
	scoreboards,
}: {
	slide: Slide
	lang: Lang
	scoreboards: Scoreboards
}) {
	switch (slide.kind) {
		case 'title':
			return <TitleSlide slide={slide} lang={lang} />
		case 'claim':
			return <ClaimSlide slide={slide} lang={lang} />
		case 'capabilities':
			return <CapabilitiesSlide slide={slide} lang={lang} />
		case 'scores':
			return <ScoresSlide slide={slide} lang={lang} scoreboards={scoreboards} />
		case 'service':
			return <ServiceSlide slide={slide} lang={lang} />
		case 'phases':
			return <PhasesSlide slide={slide} lang={lang} />
		case 'checklist':
			return <ChecklistSlide slide={slide} lang={lang} />
		case 'close':
			return <CloseSlide slide={slide} lang={lang} />
	}
}
