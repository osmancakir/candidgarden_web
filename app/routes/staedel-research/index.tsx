import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { Link } from 'react-router'
import {
	Data,
	Display,
	ProvenanceStamp,
	UncertaintyNotice,
} from '#app/components/institute/primitives.tsx'
import { cn } from '#app/utils/misc.tsx'
import {
	PilotHeader,
	RevisionMark,
	RevisionNotice,
} from './+shared/components.tsx'
import {
	currentRound,
	lines,
	manifest,
	pilotScoreboardFor,
	revision,
	round3,
	runInfo,
	scoreboardFor,
	usageForMedium,
} from './+shared/pilot.server.ts'
import {
	APPROACHES,
	MEDIA,
	SCORE_CATEGORIES,
	type KeywordMeasure,
	type MediumId,
	type Note,
	type TextRuleMeasure,
} from './+shared/schema.ts'
import { type Route } from './+types/index.ts'

// Gated by the layout's role check, so it must not be advertised in
// sitemap.xml. remix-seo includes every static route unless told otherwise.
export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

/**
 * The report. Round 3 leads, because it is what the museum is being asked to
 * read now, and it is laid out in the order of the museum's own notes: each
 * note, what changed in response, the count that shows it, and a link straight
 * to the sheets that show it. Every figure is computed from the run by the prep
 * script, so a claim here can be checked against the sheet it links to.
 *
 * The pilot and round-2 report sits folded beneath, unchanged in substance: it
 * is the record of how the roster and the rules got here.
 */

export const meta: Route.MetaFunction = () => [
	{ title: 'Städel research · Candid Garden' },
	{ name: 'robots', content: 'noindex, nofollow' },
	{
		name: 'description',
		content:
			'Vision models on the Städel graphic collection: round 3, answering the museum’s notes on keywords and texts.',
	},
]

const FLAG_UNITS = {
	geo: 'Geografie values that are not a named place, of all Geografie values',
	compound: 'Open compounds in the subject fields',
	artist: 'The work’s own artist under Assoziation.Person',
	role: 'Unnamed roles filed as persons',
} as const

type MeasureRow = {
	from: string
	to: string
	before: string
	after: string
	improved: boolean
}

/** What a note's count looks like, round 2 against round 3, for each line. */
function measureFor(
	note: Note,
): { unit: string; rows: Array<MeasureRow> } | null {
	if (!note.measure) return null
	const rows = lines.map((line) => {
		const before = runInfo(line.id, 'revision')!
		const after = runInfo(line.id, currentRound.id)!
		const kb = round3.keywordMeasures.all[before.key] as KeywordMeasure
		const ka = round3.keywordMeasures.all[after.key] as KeywordMeasure
		const tb = round3.textMeasures.all[before.key]?.direct as TextRuleMeasure
		const ta = round3.textMeasures.all[after.key]?.direct as TextRuleMeasure
		const base = { from: before.model.label, to: after.model.label }
		switch (note.measure) {
			case 'geo':
				return {
					...base,
					before: `${kb.geo} / ${kb.geoTotal}`,
					after: `${ka.geo} / ${ka.geoTotal}`,
					improved: ka.geo < kb.geo,
				}
			case 'quoted':
				return {
					...base,
					before: `${tb.quoted} / ${tb.texts}`,
					after: `${ta.quoted} / ${ta.texts}`,
					improved: ta.quoted > tb.quoted,
				}
			case 'hedges':
				return {
					...base,
					before: `${tb.hedgesDe} · ${tb.hedgesEn}`,
					after: `${ta.hedgesDe} · ${ta.hedgesEn}`,
					improved: ta.hedgesDe < tb.hedgesDe,
				}
			case 'places':
				return {
					...base,
					before: `${tb.placesNamed} / ${tb.placesTotal}`,
					after: `${ta.placesNamed} / ${ta.placesTotal}`,
					improved:
						ta.placesNamed / (ta.placesTotal || 1) >
						tb.placesNamed / (tb.placesTotal || 1),
				}
			default:
				return {
					...base,
					before: String(kb[note.measure!]),
					after: String(ka[note.measure!]),
					improved: ka[note.measure!] < kb[note.measure!],
				}
		}
	})
	const unit =
		note.measure === 'quoted'
			? 'Texts with a title in „…“, of all texts'
			: note.measure === 'hedges'
				? 'Hedges in the German · English texts'
				: note.measure === 'places'
					? 'Named places from the model’s keywords that its German text names'
					: FLAG_UNITS[note.measure as keyof typeof FLAG_UNITS]
	return { unit, rows }
}

/** The per-sheet check a note names, for the current round only. */
function spotFor(note: Note) {
	if (!note.check) return null
	const check = round3.spotChecks.find((c) => c.id === note.check)
	if (!check) return null
	return {
		want: check.want,
		sheet: check.sheet,
		runs: check.runs
			.filter((r) => r.run.startsWith(`${currentRound.id}/`))
			.map((r) => ({
				model:
					manifest.models.find((m) => r.run.endsWith(`/${m.id}`))?.label ??
					r.run,
				inPlace: r.hits
					.filter((h) => h.field === check.want)
					.map((h) => h.value),
				missing: r.missing,
				alsoElsewhere: r.alsoElsewhere.map(
					(h) => `${h.field}${h.type ? ` · ${h.type}` : ''} (${h.value})`,
				),
				forbidden: r.forbidden.map((h) => h.value),
			})),
	}
}

function hrefForNote(note: Note, workId: string) {
	if (note.view === 'keywords') return `/staedel-research/tags?work=${workId}`
	if (note.view === 'rounds') {
		return `/staedel-research/descriptions?work=${workId}&view=rounds`
	}
	return `/staedel-research/descriptions?work=${workId}`
}

/** Each way of writing, per model: the counts, for the choice. */
function approachRows() {
	return lines.flatMap((line) => {
		const run = runInfo(line.id, currentRound.id)!
		return APPROACHES.map((approach) => {
			const m = round3.textMeasures.all[run.key]?.[approach.id] as
				| TextRuleMeasure
				| undefined
			return {
				key: `${line.id}-${approach.id}`,
				line: line.id,
				model: run.model.label,
				approach: approach.id,
				label: approach.short,
				avgLong: m?.avgLong ?? null,
				rich: m?.rich ?? null,
				hedgesDe: m?.hedgesDe ?? null,
				quoted: m?.quoted ?? null,
				places: m ? `${m.placesNamed} / ${m.placesTotal}` : '—',
				texts: m?.texts ?? 0,
			}
		})
	})
}

export async function loader() {
	const notes = round3.notes.map((note) => ({
		...note,
		measure: measureFor(note),
		spot: spotFor(note),
		links: note.sheets.map((sheet) => ({
			...sheet,
			href: hrefForNote(note, sheet.id),
		})),
	}))
	const runs = lines.map((line) => ({
		before: runInfo(line.id, 'revision')!.model,
		after: runInfo(line.id, currentRound.id)!.model,
	}))
	/** Keyword values per model, round 2 → round 3: what the rules cost. */
	const valueTotals = lines.map((line) => {
		const measure = (key: string) =>
			(round3.keywordMeasures.all as Record<string, KeywordMeasure>)[key]!
				.values
		return {
			before: measure(runInfo(line.id, 'revision')!.key),
			after: measure(runInfo(line.id, currentRound.id)!.key),
		}
	})
	return {
		manifest,
		revision,
		round: currentRound,
		runs,
		valueTotals,
		notes,
		approaches: approachRows(),
		scoreboards: Object.fromEntries(
			MEDIA.map((m) => [m.id, scoreboardFor(m.id)]),
		) as Record<MediumId, ReturnType<typeof scoreboardFor>>,
		pilotScoreboards: Object.fromEntries(
			MEDIA.map((m) => [m.id, pilotScoreboardFor(m.id)]),
		) as Record<MediumId, ReturnType<typeof pilotScoreboardFor>>,
		usage: Object.fromEntries(
			MEDIA.map((m) => [m.id, usageForMedium(m.id)]),
		) as Record<MediumId, ReturnType<typeof usageForMedium>>,
	}
}

type LoaderData = Awaited<ReturnType<typeof loader>>

/** A numbered section, mirroring the document layout used across the site. */
function Section({
	n,
	heading,
	children,
}: {
	n: number
	heading: string
	children: React.ReactNode
}) {
	const id = heading.toLowerCase().replace(/[^a-z0-9]+/g, '-')
	return (
		<section
			id={id}
			className="grid scroll-mt-24 gap-x-8 gap-y-5 md:grid-cols-12"
		>
			<div className="md:col-span-3">
				<h2 className="flex items-baseline gap-3">
					<Data className="text-ground-muted tabular-nums">
						{String(n).padStart(2, '0')}
					</Data>
					<span className="font-display text-title uppercase">{heading}</span>
				</h2>
			</div>
			<div className="flex min-w-0 flex-col gap-6 md:col-span-9">
				{children}
			</div>
		</section>
	)
}

export default function StadelOverview({ loaderData }: Route.ComponentProps) {
	const { manifest: run, notes, runs } = loaderData
	const keywordNotes = notes.filter((n) => n.area === 'keywords')
	const textNotes = notes.filter((n) => n.area === 'texts')

	return (
		<>
			<PilotHeader
				kind="Round 3 · 5 October 2026"
				title="Your notes, taken one by one"
				lead={
					<>
						Every note from your reply on round 2 went into the prompts, and the
						{` ${run.sample.works}`}-sheet sample was run again with each
						provider’s newer model:{' '}
						{runs.map((r) => r.after.label).join(' and ')}, replacing{' '}
						{runs.map((r) => r.before.label).join(' and ')}. Below, each note
						sits beside what changed, the count that shows it, and the sheets
						where you can check it yourself.
					</>
				}
				aside={
					<ProvenanceStamp
						dataset="Städel · Graphische Sammlung"
						run={run.experiment}
						verification="PENDING"
					/>
				}
			/>

			<div className="container flex flex-col gap-14 py-12 md:py-16">
				<RevisionNotice caption="where to look">
					<p>
						<strong>Keywords:</strong> open any sheet on the{' '}
						<Link to="/staedel-research/tags">keywords page</Link> and you see
						one model’s round-3 keywords against its round-2 keywords, every
						value marked as new, dropped or moved, and every value an automatic
						check still doubts marked with a ⚑.
					</p>
					<p>
						<strong>Texts:</strong> on the{' '}
						<Link to="/staedel-research/descriptions">descriptions page</Link> a
						sheet shows both models’ texts in a grid. The columns are either the
						three ways round 3 wrote them, or the three rounds side by side. In
						the text itself, hedges, quoted titles and named places are marked.
					</p>
					<p className="text-ground-muted">
						The figures count with word lists and patterns, so they show a rule
						moving rather than prove it. That is why each one links to sheets
						you can read.
					</p>
				</RevisionNotice>

				<Section n={1} heading="Your notes on the keywords">
					<NoteList notes={keywordNotes} />
					<p className="font-body text-prose measure">
						One consequence to weigh: the stricter rules make the records
						shorter. Across both media the keyword values fell from{' '}
						{loaderData.valueTotals
							.map(
								(t) =>
									`${t.before.toLocaleString('en-US')} to ${t.after.toLocaleString('en-US')}`,
							)
							.join(' and ')}{' '}
						per model. Most of that is phrases split or dropped and roles moved
						out of the person fields. Whether anything you would want to keep
						went with them is best judged on a sheet: the{' '}
						<Link to="/staedel-research/tags?work=5738-z&show=changes">
							changes on 5738 Z
						</Link>{' '}
						are a good place to start.
					</p>
				</Section>

				<Section n={2} heading="Your notes on the texts">
					<NoteList notes={textNotes} />
				</Section>

				<Section n={3} heading="Three ways of writing the text">
					<p className="font-body text-prose measure">
						You asked whether the texts could be synthesised from the different
						models, and whether the keywords should be their basis. Round 3
						tried both beside the usual text, on the same 40 sheets:
					</p>
					<ul className="font-body text-prose measure flex flex-col gap-2">
						{APPROACHES.map((a) => (
							<li key={a.id}>
								<strong>{a.label}.</strong> {a.gloss}
							</li>
						))}
					</ul>
					<ApproachTable rows={loaderData.approaches} />
					<div className="prose-editorial measure">
						<p>
							<strong>Our reading.</strong> Claude Opus 5.5’s direct texts
							already carry most of what you asked for. The keyword version adds
							the most visible gain for almost no extra cost: more of the places
							named, more titles in quotation marks, and otherwise much the same
							text.
						</p>
						<p>
							The synthesis helps the weaker draft more than the stronger one.
							As synthesiser, GPT-6.1 Sol writes longer and picks up what its
							own draft missed: Goltzius’s injured hand on{' '}
							<Link to="/staedel-research/descriptions?work=805-z">805 Z</Link>{' '}
							comes over from Claude’s draft. The two syntheses come out close
							to each other and close to Claude’s draft, and Claude as
							synthesiser brings back some of the hedges. Since a synthesis
							needs both models’ texts first, it roughly doubles the cost. It is
							worth it if GPT stays in the line-up, and much less so if it does
							not.
						</p>
						<p>
							Which text reads best is your call, not a count’s. Two sheets that
							show the difference well:{' '}
							<Link to="/staedel-research/descriptions?work=5738-z">
								5738 Z
							</Link>{' '}
							and{' '}
							<Link to="/staedel-research/descriptions?work=4060-z">
								4060 Z
							</Link>
							.
						</p>
					</div>
				</Section>

				<Section n={4} heading="4060 Z, 805 Z and 5950 D">
					<div className="prose-editorial measure">
						<p>
							You found the pilot texts on these three better than round 2’s,
							apart from technique and style, and asked whether the texts you
							sent were the cause. Partly, yes, though not through the technique
							ban. Round 2 modelled itself on your published texts: one
							paragraph, 350–550 characters, the scene and its story. That cut
							content no rule forbade. On 4060 Z it cut what the sheet is for
							(Carracci trying out a pose); on 805 Z, that the hand is
							Goltzius’s own, injured since childhood; on 5950 D, the small
							figures that people the landscape.
						</p>
						<p>
							Round 3 gives a rich sheet up to 650 characters, keeps a
							documented fact the image bears out, and has the drawings prompt
							name the kind of sheet when the evidence is there. Claude’s
							round-3 texts bring all three back. GPT’s names the study and the
							sheet’s purpose but still leaves out the injured hand on 805 Z.
						</p>
					</div>
					<div className="grid gap-4 sm:grid-cols-3">
						{[
							{ id: '4060-z', no: '4060 Z', title: 'Ruhende Venus' },
							{
								id: '805-z',
								no: '805 Z',
								title: 'Vier Studien einer rechten Hand',
							},
							{ id: '5950-d', no: '5950 D', title: 'Die drei Bäume' },
						].map((sheet) => (
							<Link
								key={sheet.id}
								to={`/staedel-research/descriptions?work=${sheet.id}&view=rounds`}
								className="border-rule hover:border-link group flex flex-col gap-1 border p-4 no-underline transition-colors"
							>
								<Data className="text-ground-muted">{sheet.no}</Data>
								<span className="font-body text-prose group-hover:text-link">
									{sheet.title}
								</span>
								<Data className="text-link mt-2 normal-case">
									Pilot · Round 2 · Round 3, side by side →
								</Data>
							</Link>
						))}
					</div>
				</Section>

				<EarlierRounds data={loaderData} />

				<section className="border-rule border-t pt-10">
					<Display as="h2" size="title" className="mb-6">
						The run, sheet by sheet
					</Display>
					<div className="grid gap-6 md:grid-cols-3">
						{[
							{
								to: '/staedel-research/tags',
								title: 'Keywords',
								blurb:
									'Round 3 against round 2, value by value, or against your own record. Every flagged value marked.',
							},
							{
								to: '/staedel-research/descriptions',
								title: 'Descriptions',
								blurb:
									'Three ways of writing, or three rounds, side by side for both models, German and English.',
							},
							{
								to: '/staedel-research/evaluation',
								title: 'Evaluation',
								blurb:
									'The neutral judge’s scores on the round-2 keywords, with every justification.',
							},
						].map((card) => (
							<Link
								key={card.to}
								to={card.to}
								className="border-rule hover:border-link group flex flex-col gap-3 border p-5 no-underline transition-colors"
							>
								<Display
									as="h3"
									size="title"
									className="group-hover:text-link text-[1.0625rem]"
								>
									{card.title}
								</Display>
								<p className="font-body text-prose-sm">{card.blurb}</p>
							</Link>
						))}
					</div>
				</section>
			</div>
		</>
	)
}

/**
 * The notes, one row each: what you wrote, what changed, and the evidence —
 * a count where a rule can be counted, the placement of the named terms where
 * the note names a sheet, and the sheets to open either way.
 */
function NoteList({ notes }: { notes: LoaderData['notes'] }) {
	return (
		<ol className="border-rule-strong flex flex-col border-t">
			{notes.map((note) => (
				<li
					key={note.id}
					className="border-rule grid gap-x-8 gap-y-4 border-b py-6 lg:grid-cols-12"
				>
					<div className="flex flex-col gap-1 lg:col-span-4">
						<Data className="text-ground-muted">You wrote</Data>
						<p className="font-body text-prose italic">{note.said}</p>
					</div>
					<div className="flex flex-col gap-1 lg:col-span-4">
						<Data className="text-ground-muted">Round 3</Data>
						<p className="font-body text-prose-sm">{note.changed}</p>
					</div>
					<div className="flex flex-col gap-3 lg:col-span-4">
						{note.measure ? <MeasureBlock measure={note.measure} /> : null}
						{note.spot ? <SpotBlock spot={note.spot} /> : null}
						{note.links.length ? (
							<div className="flex flex-wrap gap-2">
								{note.links.map((link) => (
									<Link
										key={link.id}
										to={link.href}
										className="font-data text-data-sm border-link text-link hover:bg-link hover:text-ground border px-2 py-1 tracking-[0.08em] no-underline transition-colors"
									>
										{link.objectNumber} →
									</Link>
								))}
							</div>
						) : null}
					</div>
				</li>
			))}
		</ol>
	)
}

function MeasureBlock({
	measure,
}: {
	measure: NonNullable<LoaderData['notes'][number]['measure']>
}) {
	return (
		<div className="flex flex-col gap-1">
			<p className="font-body text-prose-sm text-ground-muted">
				{measure.unit}
			</p>
			<table className="font-data text-data">
				<tbody>
					{measure.rows.map((row) => (
						<tr key={row.to} className="align-baseline">
							<th
								scope="row"
								className="font-body text-prose-sm py-0.5 pr-3 text-left font-normal"
							>
								{row.to}
							</th>
							<td className="text-ground-muted py-0.5 pr-2 text-right whitespace-nowrap tabular-nums">
								{row.before}
							</td>
							<td className="text-ground-muted py-0.5 pr-2" aria-hidden>
								→
							</td>
							<td
								className={cn(
									'py-0.5 text-right whitespace-nowrap tabular-nums',
									row.improved ? 'text-link' : 'text-ground-fg',
								)}
							>
								{row.after}
							</td>
						</tr>
					))}
				</tbody>
			</table>
			<p className="font-body text-prose-sm text-ground-muted">
				Round 2 → round 3, 40 sheets
			</p>
		</div>
	)
}

function SpotBlock({
	spot,
}: {
	spot: NonNullable<LoaderData['notes'][number]['spot']>
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<p className="font-body text-prose-sm text-ground-muted break-words">
				On {spot.sheet.objectNumber}, under{' '}
				<code className="break-all">{spot.want}</code>
			</p>
			{spot.runs.map((run) => {
				const open =
					run.missing.length + run.alsoElsewhere.length + run.forbidden.length
				return (
					<div key={run.model} className="font-body text-prose-sm">
						<span className="mr-2">{run.model}:</span>
						{run.inPlace.length ? (
							<span className="text-link">{run.inPlace.join(', ')}</span>
						) : (
							<span className="text-ground-muted italic">none</span>
						)}
						{open ? (
							<span className="text-stamp-fg block text-[0.8125rem]">
								{[
									run.missing.length
										? `missing: ${run.missing.join(', ')}`
										: null,
									run.alsoElsewhere.length
										? `also under ${run.alsoElsewhere.join(', ')}`
										: null,
									run.forbidden.length
										? `still lists ${run.forbidden.join(', ')}`
										: null,
								]
									.filter(Boolean)
									.join(' · ')}
							</span>
						) : null}
					</div>
				)
			})}
		</div>
	)
}

function ApproachTable({ rows }: { rows: LoaderData['approaches'] }) {
	const head = [
		'Model',
		'Written',
		'Ø DE long',
		'551–650',
		'Hedges DE',
		'„Titles“',
		'Places named',
	]
	return (
		<div className="overflow-x-auto">
			<table className="min-w-full">
				<caption className="mb-3 text-left">
					<Data className="text-ground-muted normal-case">
						Round 3, both media, {rows[0]?.texts ?? 40} sheets per row
					</Data>
				</caption>
				<thead>
					<tr className="border-rule-strong border-b">
						{head.map((h, i) => (
							<th
								key={h}
								scope="col"
								className={cn(
									'font-data text-data-sm text-ground-muted py-2 pr-4 tracking-[0.08em] whitespace-nowrap uppercase',
									i < 2 ? 'text-left' : 'text-right',
								)}
							>
								{h}
							</th>
						))}
					</tr>
				</thead>
				<tbody className="font-data text-data">
					{rows.map((row, i) => (
						<tr
							key={row.key}
							className={cn(
								'border-rule border-b',
								i > 0 &&
									rows[i - 1]!.line !== row.line &&
									'border-t-rule-strong border-t',
							)}
						>
							<th
								scope="row"
								className="font-body text-prose-sm py-2 pr-4 text-left font-normal whitespace-nowrap"
							>
								{row.model}
							</th>
							<td className="py-2 pr-4 whitespace-nowrap">
								<Link
									to={`/staedel-research/descriptions?line=${row.line}&approach=${row.approach}`}
									className="hover:text-link no-underline hover:underline"
								>
									{row.label}
								</Link>
							</td>
							<td className="py-2 pr-4 text-right tabular-nums">
								{row.avgLong ?? '—'}
							</td>
							<td className="py-2 pr-4 text-right tabular-nums">
								{row.rich ?? '—'}
							</td>
							<td className="py-2 pr-4 text-right tabular-nums">
								{row.hedgesDe ?? '—'}
							</td>
							<td className="py-2 pr-4 text-right tabular-nums">
								{row.quoted ?? '—'}
							</td>
							<td className="py-2 text-right tabular-nums">{row.places}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}

/* ==========================================================================
   The pilot and round 2, as reported on 25 August.
   ========================================================================== */

function ScoreTable({
	medium,
	rows,
	models,
}: {
	medium: MediumId
	rows: ReturnType<typeof scoreboardFor>
	models: typeof manifest.models
}) {
	const label = MEDIA.find((m) => m.id === medium)!
	return (
		<div className="overflow-x-auto">
			<table className="min-w-full">
				<caption className="mb-3 text-left">
					<Data className="tracking-[0.2em]">
						{label.label} · {label.german}
					</Data>
					<Data className="text-ground-muted ml-3 normal-case">
						mean of 20 sheets, out of 10
					</Data>
				</caption>
				<thead>
					<tr className="border-rule-strong border-b">
						<th
							scope="col"
							className="font-data text-data-sm text-ground-muted py-2 pr-4 text-left tracking-[0.12em] uppercase"
						>
							Model
						</th>
						{SCORE_CATEGORIES.map((c) => (
							<th
								key={c.id}
								scope="col"
								className="font-data text-data-sm text-ground-muted py-2 pr-4 text-right tracking-[0.12em] uppercase"
							>
								{c.label}
							</th>
						))}
						<th
							scope="col"
							className="font-data text-data-sm text-ground-fg py-2 text-right tracking-[0.12em] uppercase"
						>
							Overall
						</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => {
						const model = models.find((m) => m.id === row.model)
						return (
							<tr key={row.model} className="border-rule border-b">
								<th scope="row" className="py-2 pr-4 text-left font-normal">
									<Link
										to={`/staedel-research/evaluation?medium=${medium}&model=${row.model}`}
										className="hover:text-link font-body text-prose no-underline hover:underline"
									>
										{model?.label ?? row.model}
									</Link>
									<Data className="text-ground-muted ml-2">
										{model?.provider}
									</Data>
								</th>
								{SCORE_CATEGORIES.map((c) => (
									<td
										key={c.id}
										className="font-data text-data py-2 pr-4 text-right tabular-nums"
									>
										{row[c.id]?.toFixed(2) ?? '—'}
									</td>
								))}
								<td className="font-data text-data py-2 text-right font-bold tabular-nums">
									{row.overall?.toFixed(2) ?? '—'}
								</td>
							</tr>
						)
					})}
				</tbody>
			</table>
		</div>
	)
}

/**
 * The report as it stood after round 2, folded. Kept whole rather than
 * summarised: it is the evidence for the roster, the neutral judge and the
 * keyword rule round 3 builds on, and a reader who wants to know why things
 * are as they are should find the argument as it was made.
 */
function EarlierRounds({ data }: { data: LoaderData }) {
	const {
		manifest: run,
		revision: rev,
		scoreboards,
		pilotScoreboards,
		usage,
	} = data
	const pilotModels = usage.prints.map((u) => u.model)
	return (
		<details className="border-rule group border">
			<summary className="hover:text-link cursor-pointer list-none px-5 py-4 select-none">
				<div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
					<span className="font-display text-title uppercase">
						<span className="mr-3 inline-block group-open:hidden" aria-hidden>
							+
						</span>
						<span className="mr-3 hidden group-open:inline-block" aria-hidden>
							−
						</span>
						Earlier rounds
					</span>
					<span className="flex flex-wrap gap-2">
						<RevisionMark kind="pilot" />
						<RevisionMark kind="revised" />
					</span>
				</div>
				<p className="font-body text-prose-sm text-ground-muted mt-2">
					The pilot of 1 August and round 2 of 25 August: how the roster was cut
					to two, why the scores use a neutral judge, and why the catalogue is
					not a scoreboard.
				</p>
			</summary>

			<div className="border-rule flex flex-col gap-14 border-t px-5 py-10">
				<RevisionNotice kind="revised" caption="as reported on 25 August">
					<p>
						After your reply of 13 August we rewrote both prompts and re-ran the
						sample for the two leading models. The descriptions stopped naming a
						material, a process or a period: measured over{' '}
						{rev.descriptions[0]!.before.texts} texts per model, technique
						appeared in every text before and in none after. The average German
						long text fell from{' '}
						{rev.descriptions.map((m) => m.before.avgLong).join(' and ')}{' '}
						characters to{' '}
						{rev.descriptions.map((m) => m.after.avgLong).join(' and ')},
						against the {rev.houseReference.avgLong} your own published texts
						average.
					</p>
					<p>
						The keywords changed under a narrower rule: no process, no material,
						no period, but keeping the mark vocabulary your own records use,
						such as <code>Schraffur</code>. The {rev.houseReference.texts} texts
						you sent set the voice; {rev.houseReference.usedAsExamples} of them
						are shown to the model as examples, and all{' '}
						{rev.houseReference.withImageInExport} that are in this export are
						held out of the full run.
					</p>
				</RevisionNotice>

				<Section n={1} heading="The pilot roster">
					<p className="font-body text-prose measure">
						The roster was taken from each provider’s live model list: one model
						per provider, each the provider’s flagship for vision at the time.
					</p>
					<div className="overflow-x-auto">
						<table className="min-w-full">
							<thead>
								<tr className="border-rule-strong border-b">
									{[
										'Provider',
										'Model',
										'Since',
										'Calls',
										'Tokens in',
										'Tokens out',
									].map((h, i) => (
										<th
											key={h}
											scope="col"
											className={cn(
												'font-data text-data-sm text-ground-muted py-2 pr-4 tracking-[0.12em] uppercase',
												i < 3 ? 'text-left' : 'text-right',
											)}
										>
											{h}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{pilotModels.map((model) => {
									const p = usage.prints.find((u) => u.model.id === model.id)
									const d = usage.drawings.find((u) => u.model.id === model.id)
									return (
										<tr key={model.id} className="border-rule border-b">
											<td className="font-body text-prose py-2 pr-4">
												{model.provider}
											</td>
											<td className="font-data text-data py-2 pr-4 tracking-normal">
												{model.id.replace(/^[a-z]+-/, '')}
											</td>
											<td className="py-2 pr-4">
												<RevisionMark kind={model.status} />
											</td>
											<td className="font-data text-data py-2 pr-4 text-right tabular-nums">
												{(p?.calls ?? 0) + (d?.calls ?? 0)}
											</td>
											<td className="font-data text-data py-2 pr-4 text-right tabular-nums">
												{((p?.input ?? 0) + (d?.input ?? 0)).toLocaleString(
													'en-US',
												)}
											</td>
											<td className="font-data text-data py-2 text-right tabular-nums">
												{((p?.output ?? 0) + (d?.output ?? 0)).toLocaleString(
													'en-US',
												)}
											</td>
										</tr>
									)
								})}
							</tbody>
						</table>
					</div>
					<p className="font-body text-prose-sm text-ground-muted measure">
						Token counts are the pilot sample only: {run.sample.works} sheets
						across both tasks.
					</p>
				</Section>

				<Section n={2} heading="What the comparison showed">
					<div className="flex flex-col gap-3">
						<div className="flex flex-wrap items-baseline gap-3">
							<RevisionMark kind="pilot" />
							<Data className="text-ground-muted normal-case">
								five models, judged by one of the contestants
							</Data>
						</div>
						<ScoreTable
							medium="prints"
							rows={pilotScoreboards.prints}
							models={run.models}
						/>
						<ScoreTable
							medium="drawings"
							rows={pilotScoreboards.drawings}
							models={run.models}
						/>
					</div>
					<div className="prose-editorial measure">
						<p>
							This is the run that decided the roster. Mistral scores lowest on
							both media, well over a point behind the next model; Google and
							xAI score level with each other and behind both leaders. What it
							could <em>not</em> decide is the order at the top, because the
							judge was itself the model it placed first.
						</p>
					</div>
					<div className="flex flex-col gap-3">
						<div className="flex flex-wrap items-baseline gap-3">
							<RevisionMark kind="revised" />
							<Data className="text-ground-muted normal-case">
								two models, judged by a model outside the run
							</Data>
						</div>
						<ScoreTable
							medium="prints"
							rows={scoreboards.prints}
							models={run.models}
						/>
						<ScoreTable
							medium="drawings"
							rows={scoreboards.drawings}
							models={run.models}
						/>
					</div>
					<div className="prose-editorial measure">
						<p>
							On identical keywords, swapping the judge reversed the order: the
							pilot’s lead was the judge preferring its own output. On the
							revised keywords the two are 0.05 and 0.13 apart on a 20-sheet
							sample, well inside the noise, so a neutral judge does not
							separate them. The{' '}
							<Link to="/staedel-research/evaluation">evaluation page</Link>{' '}
							shows the working.
						</p>
					</div>
					<UncertaintyNotice notice="No order presented between the two finalists · difference within noise at n=20" />
				</Section>

				<Section n={3} heading="Why the catalogue is not a scoreboard">
					<div className="prose-editorial measure">
						<p>
							The catalogue is unevenly filled: only{' '}
							<strong>66 of 2,041</strong> prints and <strong>18 of 706</strong>{' '}
							drawings carry five or more thematic keywords. On a record where
							you hold four keywords and the model finds all four and adds
							sixty-five more, an overlap score reads as 6% precision. Run
							across the roster, that metric ranked the models almost exactly
							inversely to how much they write.
						</p>
						<p>
							Four of the nine fields (<code>Assoziation.Person</code>,{' '}
							<code>Assoziation.Thema</code>, <code>Atmosphäre</code> and{' '}
							<code>Emotion</code>) are empty across all {run.sample.works}{' '}
							sample records, by design: they are what the project adds. So the
							models are scored against the artwork itself, and your records
							stay the backbone of every run (the work list, the metadata, the
							images) without being the scoreboard. The{' '}
							<Link to="/staedel-research/tags?compare=museum">
								keyword comparison
							</Link>{' '}
							still sets your record beside the models on every sheet.
						</p>
					</div>
				</Section>

				<Section n={4} heading="What you asked in August">
					<ol className="prose-editorial measure list-decimal pl-5">
						<li>
							<strong>Technique: withdrawn from the texts.</strong> A text that
							never names a technique cannot get one wrong.
						</li>
						<li>
							<strong>
								The example texts: {rev.houseReference.texts} received, and they
								set the voice.
							</strong>{' '}
							Your texts run {rev.houseReference.minLong}–
							{rev.houseReference.maxLong} characters and average{' '}
							{rev.houseReference.avgLong}, where the pilot’s averaged{' '}
							{rev.descriptions[0]!.before.avgLong} and{' '}
							{rev.descriptions[1]!.before.avgLong}.
						</li>
						<li>
							<strong>The vocabulary deviation: confirmed.</strong> The prompt
							keeps the vocabulary your export actually uses.
						</li>
					</ol>
				</Section>
			</div>
		</details>
	)
}
