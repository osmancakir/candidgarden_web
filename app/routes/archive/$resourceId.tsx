import { invariantResponse } from '@epic-web/invariant'
import { Link } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import {
	Level,
	MonumentalTitle,
	PANOFSKY,
} from '#app/components/institute/descent.tsx'
import {
	Chip,
	Data,
	Display,
	ProvenanceStamp,
	Reading,
	RecordStamp,
	UncertaintyNotice,
} from '#app/components/institute/primitives.tsx'
import { Plate, type WorkSummary } from '#app/components/institute/record.tsx'
import {
	archivalDate,
	confidenceBand,
	confidenceOf,
	displayPeriod,
	formatConfidence,
	uncertaintyNotice,
	verificationLabel,
} from '#app/utils/archive.ts'
import { prisma } from '#app/utils/db.server.ts'
import { getWorkImgSrc } from '#app/utils/misc.tsx'
import { type Route } from './+types/$resourceId.ts'

/**
 * §2 — The Panofsky Descent. The one element the site should be remembered by.
 *
 * The dossier is three stacked sections whose ground darkens (or, in the void
 * theme, lightens) as interpretive depth increases. What each level may say is
 * strictly bounded by what the archive actually holds:
 *
 *   Level I   inventory      — motifs, agreement counts, formal facts. Real data.
 *   Level II  identification — subject classes and their distribution. Derived.
 *   Level III interpretation — provenance of the reading, and its limits.
 *
 * Levels II and III read from `Interpretation`, which currently holds
 * machine-drafted prose imported from the description corpus (see
 * scripts/import-interpretations.mjs). Every reading is rendered with its
 * provenance stated, per §6. Where no reading exists — 152 works have no
 * Level III — the section keeps its original behaviour and says plainly what
 * is missing rather than filling the space, which §7 asks for.
 */

const MAX_MOTIFS = 60

export async function loader({ params }: Route.LoaderArgs) {
	const resourceId = Number(params.resourceId)
	invariantResponse(
		Number.isInteger(resourceId) && resourceId > 0,
		'Not found',
		{
			status: 404,
		},
	)

	const resource = await prisma.resource.findUnique({
		where: { id: resourceId },
		select: {
			id: true,
			title: true,
			titleEn: true,
			notBefore: true,
			notAfter: true,
			location: true,
			institution: true,
			objectKey: true,
			wikiDataId: true,
			artist: { select: { id: true, name: true, wikiDataId: true } },
			wikiDataVerification: {
				select: { status: true, verifiedAt: true, notes: true },
			},
			interpretations: {
				where: { publishedAt: { not: null } },
				select: {
					level: true,
					body: true,
					source: true,
					citation: true,
					author: { select: { name: true } },
				},
			},
			taggings: {
				orderBy: { frequency: 'desc' },
				take: MAX_MOTIFS,
				select: {
					frequency: true,
					tag: {
						select: {
							id: true,
							name: true,
							language: true,
							category: true,
							human: true,
							aiGpt4o: true,
						},
					},
				},
			},
		},
	})

	invariantResponse(resource, 'Not found', { status: 404 })

	const maxFrequency = resource.taggings[0]?.frequency ?? 0
	const motifs = resource.taggings.map((t) => ({
		id: t.tag.id,
		name: t.tag.name,
		language: t.tag.language,
		category: t.tag.category,
		frequency: t.frequency,
		human: t.tag.human,
		ai: t.tag.aiGpt4o,
		agreement: confidenceOf({ frequency: t.frequency, maxFrequency }),
	}))

	// Subject classes present on this work, ordered by weight — the raw material
	// of a Level II reading.
	const byCategory = new Map<string, { count: number; weight: number }>()
	for (const m of motifs) {
		const key = m.category ?? 'unclassified'
		const entry = byCategory.get(key) ?? { count: 0, weight: 0 }
		entry.count += 1
		entry.weight += m.frequency
		byCategory.set(key, entry)
	}
	const categories = [...byCategory.entries()]
		.map(([name, v]) => ({ name, ...v }))
		.sort((a, b) => b.weight - a.weight)

	// Where the crowd and the model diverge across the corpus. `human` and
	// `aiGpt4o` are corpus-wide provenance counts for a tag, not per-work
	// scores, so this is stated as a tendency and never as a per-work claim.
	const humanLeaning = motifs.filter((m) => m.human > m.ai).length
	const modelLeaning = motifs.filter((m) => m.ai > m.human).length

	const verification = verificationLabel(resource.wikiDataVerification?.status)
	const generatedAt = resource.wikiDataVerification?.verifiedAt ?? new Date(0)

	const readingAt = (level: number) =>
		resource.interpretations.find((i) => i.level === level) ?? null

	return {
		work: {
			id: resource.id,
			title: resource.title ?? resource.titleEn,
			titleEn: resource.titleEn,
			artist: resource.artist,
			notBefore: resource.notBefore,
			notAfter: resource.notAfter,
			location: resource.location,
			institution: resource.institution,
			objectKey: resource.objectKey,
			wikiDataId: resource.wikiDataId,
		},
		motifs,
		categories,
		humanLeaning,
		modelLeaning,
		iconographic: readingAt(2),
		iconological: readingAt(3),
		verification,
		verificationNotes: resource.wikiDataVerification?.notes ?? null,
		generatedAt,
		notice: uncertaintyNotice({
			tagCount: motifs.length,
			humanTagCount: humanLeaning,
			topConfidence: motifs[0]?.agreement ?? 0,
			verification,
		}),
	}
}

export const meta: Route.MetaFunction = ({ data }) => {
	const title = data?.work.title ?? 'Untitled work'
	const artist = data?.work.artist?.name
	return [
		{ title: `${title} · Candid Garden` },
		{
			name: 'description',
			content: `Iconographic dossier for ${title}${artist ? ` by ${artist}` : ''}: machine-generated metadata at Panofsky levels I–III.`,
		},
	]
}

export default function Dossier({ loaderData }: Route.ComponentProps) {
	const {
		work,
		motifs,
		categories,
		humanLeaning,
		modelLeaning,
		iconographic,
		iconological,
		verification,
		verificationNotes,
		generatedAt,
		notice,
	} = loaderData

	const summary: WorkSummary = {
		id: work.id,
		title: work.title,
		artist: work.artist?.name ?? null,
		notBefore: work.notBefore,
		notAfter: work.notAfter,
		institution: work.institution,
		objectKey: work.objectKey,
		motifs: motifs.map((m) => m.name),
	}
	const imgSrc = getWorkImgSrc(work.objectKey)
	const period = displayPeriod(work.notBefore, work.notAfter)
	const stamp = <RecordStamp date={generatedAt} run={work.id} />

	return (
		<article>
			{/* ============ LEVEL I — PRE-ICONOGRAPHIC · paper ============ */}
			<Level level={1} stamp={stamp}>
				<div className="grid gap-10 lg:grid-cols-12">
					<div className="lg:col-span-7">
						{imgSrc ? (
							<Plate
								work={summary}
								src={imgSrc}
								maxHeight="max-h-[70vh]"
								sizes="(min-width: 1024px) 55vw, 92vw"
							/>
						) : (
							<div className="border-rule flex h-64 items-center justify-center border">
								<Data className="text-ground-muted">No image on file</Data>
							</div>
						)}
					</div>

					<div className="flex flex-col gap-6 lg:col-span-5">
						<div>
							<Display as="h1" size="title" className="mb-2">
								{work.title ?? 'Untitled'}
							</Display>
							<p className="font-body text-prose-lg italic">
								{work.artist ? (
									<Link
										to={`/?q=${encodeURIComponent(work.artist.name)}`}
										className="hover:text-link"
									>
										{work.artist.name}
									</Link>
								) : (
									'Unattributed'
								)}
								{', '}
								<span className="not-italic">{period}</span>
							</p>
						</div>

						<UncertaintyNotice notice={notice} />

						{/* Formal facts, as a real table (§5). */}
						<table className="border-rule border-t">
							<caption className="sr-only">Catalogue facts</caption>
							<tbody>
								{[
									['Record', `#${work.id}`],
									['Title (EN)', work.titleEn ?? '—'],
									['Period', period],
									['Collection', work.institution ?? '—'],
									['Location', work.location ?? '—'],
									['Wikidata', work.wikiDataId ?? '—'],
									['Attribution', verification],
								].map(([term, value]) => (
									<tr key={term} className="border-rule border-b">
										<th
											scope="row"
											className="font-data text-data-sm text-ground-muted w-36 py-2 pr-4 text-left align-top tracking-[0.12em] uppercase"
										>
											{term}
										</th>
										<td className="font-data text-data py-2 align-top">
											{value}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>

				{/* Motif chips — taxonomy as navigation (§6). */}
				<div className="mt-12">
					<div className="border-rule mb-4 flex flex-wrap items-baseline justify-between gap-4 border-b pb-2">
						<Data className="tracking-[0.2em]">Motifs detected</Data>
						<Data className="text-ground-muted normal-case">
							{motifs.length} recorded · superscript is agreement, not certainty
						</Data>
					</div>
					{motifs.length ? (
						<div className="flex flex-wrap gap-2">
							{motifs.map((m) => (
								<Chip
									key={m.id}
									label={m.name}
									confidence={m.agreement}
									to={`/?motif=${encodeURIComponent(m.name)}`}
								/>
							))}
						</div>
					) : (
						<Data className="text-stamp-fg">
							Nothing was read from this image.
						</Data>
					)}
				</div>
			</Level>

			{/* ============ LEVEL II — ICONOGRAPHIC · slate ============ */}
			<Level level={2} stamp={stamp}>
				<div className="grid gap-10 lg:grid-cols-12">
					<div className="lg:col-span-7">
						{iconographic ? (
							<>
								<Reading
									body={iconographic.body}
									source={iconographic.source}
									author={iconographic.author?.name}
									citation={iconographic.citation}
								/>
								{verificationNotes ? (
									<p className="prose-editorial mt-6">
										<cite>Verification note:</cite> {verificationNotes}
									</p>
								) : null}
							</>
						) : (
							<>
								<div className="prose-editorial">
									<p>
										At Level II the archive asks what the motifs of Level I{' '}
										<em>depict</em> — the conventional subjects a contemporary
										viewer would have recognised. Candid Garden holds no curated
										iconographic reading for this work. What follows is
										therefore not an identification but a description of the
										material an identification would be built from:{' '}
										{motifs.length.toLocaleString('en-US')} motifs distributed
										across {categories.length}{' '}
										{categories.length === 1
											? 'subject class'
											: 'subject classes'}
										.
									</p>
									<p>
										Of those motifs, {humanLeaning} are more often supplied by
										human annotators than by the model across the corpus as a
										whole, and {modelLeaning} more often by the model. This is a
										corpus-wide tendency of each term, not a measurement of this
										work, and it should not be read as agreement about{' '}
										<em>this</em> picture.
									</p>
									{verificationNotes ? (
										<p>
											<cite>Verification note:</cite> {verificationNotes}
										</p>
									) : null}
								</div>

								<p className="font-data text-data text-stamp-fg mt-8 tracking-[0.12em] uppercase">
									No iconographic reading on record · Level II awaiting
									editorial pass
								</p>
							</>
						)}
					</div>

					<div className="lg:col-span-5">
						<Data className="border-rule mb-3 block border-b pb-2 tracking-[0.2em]">
							Subject classes
						</Data>
						<table>
							<caption className="sr-only">
								Subject classes present on this work, by weight
							</caption>
							<thead>
								<tr className="border-rule border-b">
									<th
										scope="col"
										className="font-data text-data-sm py-1 text-left tracking-[0.12em] uppercase"
									>
										Class
									</th>
									<th
										scope="col"
										className="font-data text-data-sm py-1 text-right tracking-[0.12em] uppercase"
									>
										Motifs
									</th>
									<th
										scope="col"
										className="font-data text-data-sm py-1 text-right tracking-[0.12em] uppercase"
									>
										Weight
									</th>
								</tr>
							</thead>
							<tbody>
								{categories.map((c) => (
									<tr key={c.name} className="border-rule border-b">
										<td className="font-data text-data py-1.5">{c.name}</td>
										<td className="font-data text-data py-1.5 text-right tabular-nums">
											{c.count}
										</td>
										<td className="font-data text-data py-1.5 text-right tabular-nums">
											{c.weight}
										</td>
									</tr>
								))}
								{categories.length === 0 ? (
									<tr>
										<td colSpan={3} className="font-data text-data py-3">
											None recorded
										</td>
									</tr>
								) : null}
							</tbody>
						</table>
					</div>
				</div>
			</Level>

			{/* ============ LEVEL III — ICONOLOGICAL · void ============ */}
			<Level level={3} stamp={stamp}>
				<div className="grid gap-12 lg:grid-cols-12">
					<div className="lg:col-span-7">
						<MonumentalTitle>{work.title ?? 'Untitled'}</MonumentalTitle>
						<p className="font-body text-prose-lg mt-6 italic">
							{work.artist?.name ?? 'Unattributed'}
							{', '}
							<span className="not-italic">{period}</span>
						</p>
					</div>

					<div className="flex flex-col gap-8 lg:col-span-5">
						{iconological ? (
							<Reading
								body={iconological.body}
								source={iconological.source}
								author={iconological.author?.name}
								citation={iconological.citation}
							/>
						) : (
							<>
								<div className="prose-editorial">
									<p>
										Level III asks what the work meant — to its makers, its
										patrons, and the culture that produced it — and what the
										machine's reading of it reveals about the machine. Candid
										Garden publishes no iconological synthesis for this work.
									</p>
									<p>
										We consider this the honest state of the record rather than
										a gap to be papered over. A model that has named{' '}
										{motifs.length} motifs has not thereby interpreted a
										painting, and the distance between those two things is the
										subject of this institute.
									</p>
								</div>

								<p className="font-data text-data text-stamp-fg tracking-[0.12em] uppercase">
									No iconological reading on record
								</p>
							</>
						)}

						{/* §6 The provenance stamp — once per dossier. */}
						<ProvenanceStamp
							date={generatedAt}
							run={work.id}
							verification={verification}
						/>

						{/* Carries which reading is under dispute, so §7's invitation
						    lands on a page that can name it rather than a generic one. */}
						<Link
							to={`/support?record=${work.id}&level=${iconological ? 3 : 2}`}
							className="font-data text-data-sm text-link tracking-[0.12em] uppercase underline underline-offset-4"
						>
							Dispute this reading →
						</Link>
					</div>
				</div>

				{/* The strongest motifs, restated at exhibition scale. */}
				{motifs.length ? (
					<div className="border-rule mt-20 border-t pt-8">
						<Data className="text-ground-muted mb-6 block">
							Read by the machine as
						</Data>
						<p className="font-display text-chapter hyphens-auto uppercase">
							{motifs.slice(0, 10).map((m, i) => (
								<span key={m.id}>
									{i > 0 ? <span className="opacity-30"> · </span> : null}
									<span
										className={
											confidenceBand(m.agreement) === 'low' ? 'opacity-40' : ''
										}
										title={`agreement ${formatConfidence(m.agreement)}`}
									>
										{m.name}
									</span>
								</span>
							))}
						</p>
					</div>
				) : null}
			</Level>

			{/* A short return rail, in the resting register. */}
			<nav className="border-rule container flex flex-wrap items-center justify-between gap-4 border-t py-6">
				<Link
					to="/"
					className="font-data text-data-sm text-link tracking-[0.12em] uppercase underline underline-offset-4"
				>
					← Back to the index
				</Link>
				<Data className="text-ground-muted normal-case">
					Record #{work.id} · stamped {archivalDate(generatedAt)} ·{' '}
					{PANOFSKY[1].gloss}–{PANOFSKY[3].gloss}
				</Data>
			</nav>
		</article>
	)
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				404: () => (
					<div className="flex flex-col gap-4">
						<p className="font-display text-chapter uppercase">
							Record not found
						</p>
						<p className="font-body text-prose measure">
							No work with that identifier is held in this archive. It may have
							been withdrawn, or the identifier may be a typo.
						</p>
						<Link
							to="/"
							className="font-data text-data-sm text-link tracking-[0.12em] uppercase underline underline-offset-4"
						>
							← Back to the index
						</Link>
					</div>
				),
			}}
		/>
	)
}
