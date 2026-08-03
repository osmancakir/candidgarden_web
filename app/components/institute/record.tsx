import { Img } from 'openimg/react'
import { Link } from 'react-router'
import {
	archivalDate,
	displayPeriod,
	formatNearness,
} from '#app/utils/archive.ts'
import { cn } from '#app/utils/misc.tsx'
import { PANOFSKY } from './descent.tsx'
import { Data, Display } from './primitives.tsx'

/* ==========================================================================
   Ways of showing a work, one per browse level (§2, §6).
     Level I   → RecordRow      a real <tr> in a real <table>
     Level II  → EditorialCard  image at true ratio, grotesque title
     Level III → FeaturePlate   single work, monumental, on the deep ground

   Each also knows how to show *why* a work is on the page when the index is
   ranked by meaning: the passage that matched and how near it was.
   ========================================================================== */

export type WorkSummary = {
	id: number
	title: string | null
	artist: string | null
	notBefore: number | null
	notAfter: number | null
	institution: string | null
	objectKey: string | null
	motifs: Array<string>
	updatedAt?: Date | string | number | null
}

/** The `sense` match on a work, as the record components need it. */
export type RecordMatch = {
	level: 2 | 3
	similarity: number
	excerpt: string
}

/**
 * The matched passage, quoted.
 *
 * Set in Times and quoted rather than paraphrased or highlighted: it is
 * somebody's — something's — prose, and the reader is being asked to judge the
 * match by it. The level is named because a phrase landing on a Level III
 * reading means something different from one landing on a Level II.
 */
export function MatchedPassage({
	match,
	className,
}: {
	match: RecordMatch
	className?: string
}) {
	if (!match.excerpt) return null
	return (
		<figure className={cn('border-rule border-l pl-3', className)}>
			<blockquote className="font-body text-prose-sm measure italic">
				“{match.excerpt}”
			</blockquote>
			<figcaption className="mt-1">
				<Data className="text-ground-muted">
					Level {PANOFSKY[match.level].numeral} · {PANOFSKY[match.level].gloss}{' '}
					· nearness{' '}
					<span className="tabular-nums">
						{formatNearness(match.similarity)}
					</span>
				</Data>
			</figcaption>
		</figure>
	)
}

export function workHref(id: number) {
	return `/archive/${id}`
}

/**
 * §8: "artwork alt text drawn from the Level I metadata itself — the archive
 * describing itself is the point." Never a decorative or invented description.
 */
export function plateAlt(work: WorkSummary): string {
	const parts = [work.title ?? 'Untitled work']
	if (work.artist) parts.push(`by ${work.artist}`)
	const period = displayPeriod(work.notBefore, work.notAfter)
	if (period !== 'UNDATED') parts.push(period)
	if (work.motifs.length) {
		parts.push(`Motifs recorded: ${work.motifs.slice(0, 8).join(', ')}`)
	} else {
		parts.push('No motifs recorded')
	}
	return parts.join('. ') + '.'
}

/**
 * §5: "Images are never cropped to decorative aspect ratios; artworks display
 * at their true proportions on generous ground." So the plate constrains
 * height, never both dimensions, and lets width fall where it falls.
 */
export function Plate({
	work,
	src,
	maxHeight = 'max-h-[70vh]',
	className,
	sizes,
}: {
	work: WorkSummary
	src: string
	maxHeight?: string
	className?: string
	sizes?: string
}) {
	return (
		<Img
			src={src}
			alt={plateAlt(work)}
			width={1200}
			height={1200}
			isAboveFold={false}
			sizes={sizes}
			className={cn(
				'h-auto w-auto max-w-full object-contain',
				maxHeight,
				className,
			)}
		/>
	)
}

/**
 * The Level I view of a work: a row of facts, in a table that looks like one.
 *
 * `showMatch` is separate from `match` on purpose: a column exists for the
 * whole table or not at all, and a row that quietly dropped its last cell would
 * break the header alignment for every row beneath it.
 */
export function RecordRow({
	work,
	imgSrc,
	match,
	showMatch = false,
}: {
	work: WorkSummary
	imgSrc: string | null
	match?: RecordMatch | null
	showMatch?: boolean
}) {
	return (
		<tr className="border-rule hover:bg-tint border-b transition-colors">
			<td className="w-16 py-2 pr-3 align-top">
				{imgSrc ? (
					<Link to={workHref(work.id)} tabIndex={-1} aria-hidden>
						<Img
							src={imgSrc}
							alt=""
							width={112}
							height={112}
							className="h-14 w-14 object-cover"
						/>
					</Link>
				) : (
					<span className="border-rule text-ground-muted font-data flex h-14 w-14 items-center justify-center border text-[0.6rem]">
						NO IMG
					</span>
				)}
			</td>
			<td className="py-2 pr-4 align-top">
				<Link
					to={workHref(work.id)}
					className="hover:text-link font-body text-prose no-underline hover:underline"
				>
					{work.title ?? <span className="italic opacity-70">Untitled</span>}
				</Link>
				{match?.excerpt ? (
					<p className="font-body text-prose-sm text-ground-muted measure mt-1 italic">
						“{match.excerpt}”
					</p>
				) : null}
			</td>
			<td className="font-body text-prose-sm py-2 pr-4 align-top italic">
				{work.artist ?? <span className="opacity-60">Unattributed</span>}
			</td>
			<td className="font-data text-data-sm py-2 pr-4 align-top tabular-nums">
				{displayPeriod(work.notBefore, work.notAfter)}
			</td>
			<td className="font-data text-data-sm text-ground-muted hidden py-2 pr-4 align-top md:table-cell">
				{work.institution ?? '—'}
			</td>
			<td className="hidden py-2 align-top lg:table-cell">
				<div className="flex flex-wrap gap-1">
					{work.motifs.slice(0, 4).map((m) => (
						<span
							key={m}
							className="border-rule font-data border px-1.5 py-0.5 text-[0.625rem] uppercase"
						>
							{m}
						</span>
					))}
					{work.motifs.length === 0 ? (
						<span className="text-ground-muted font-data text-[0.625rem] uppercase">
							none recorded
						</span>
					) : null}
				</div>
			</td>
			{showMatch ? (
				<td className="font-data text-data-sm py-2 text-right align-top tabular-nums">
					{match ? (
						<>
							{formatNearness(match.similarity)}
							<span className="text-ground-muted block text-[0.625rem]">
								Lv {PANOFSKY[match.level].numeral}
							</span>
						</>
					) : (
						<span className="text-ground-muted">—</span>
					)}
				</td>
			) : null}
		</tr>
	)
}

/**
 * §6 Editorial card (Level II browse mode). "Image at true ratio, title in
 * grotesque caps at modest size, artist/date in Times italic, timestamp in
 * mono. On void sections, cards lose borders entirely."
 */
export function EditorialCard({
	work,
	imgSrc,
	borderless = false,
	match,
}: {
	work: WorkSummary
	imgSrc: string | null
	borderless?: boolean
	match?: RecordMatch | null
}) {
	return (
		<article
			className={cn(
				'flex flex-col gap-3',
				!borderless && 'border-rule border p-3',
			)}
		>
			<Link to={workHref(work.id)} className="block no-underline">
				{imgSrc ? (
					<Plate
						work={work}
						src={imgSrc}
						maxHeight="max-h-72"
						sizes="(min-width: 1024px) 20rem, (min-width: 640px) 45vw, 90vw"
					/>
				) : (
					<div className="border-rule text-ground-muted font-data text-data-sm flex h-40 items-center justify-center border uppercase">
						No image on file
					</div>
				)}
			</Link>
			<div className="flex flex-col gap-1">
				<Display
					as="h3"
					size="title"
					className="text-[1.0625rem] leading-tight"
				>
					<Link to={workHref(work.id)} className="hover:text-link no-underline">
						{work.title ?? 'Untitled'}
					</Link>
				</Display>
				<p className="font-body text-prose-sm italic">
					{work.artist ?? 'Unattributed'}
					{', '}
					<span className="not-italic">
						{displayPeriod(work.notBefore, work.notAfter)}
					</span>
				</p>
				{work.updatedAt ? (
					<Data className="text-ground-muted normal-case">
						{archivalDate(work.updatedAt)}
					</Data>
				) : null}
				{match ? <MatchedPassage match={match} className="mt-2" /> : null}
			</div>
		</article>
	)
}

/**
 * §2 Level III browse mode: "single-work editorial features". One work at a
 * time, on the deep ground, at the size the Anthology gives a monument.
 */
export function FeaturePlate({
	work,
	imgSrc,
	index,
	total,
	match,
}: {
	work: WorkSummary
	imgSrc: string | null
	index: number
	total: number
	match?: RecordMatch | null
}) {
	return (
		<article className="grid gap-8 py-16 md:grid-cols-12 md:gap-10">
			<div className="md:col-span-7">
				{imgSrc ? (
					<Link to={workHref(work.id)} className="block">
						<Plate
							work={work}
							src={imgSrc}
							maxHeight="max-h-[75vh]"
							sizes="(min-width: 768px) 55vw, 90vw"
						/>
					</Link>
				) : (
					<div className="border-rule text-ground-muted font-data text-data flex h-64 items-center justify-center border uppercase">
						No image on file
					</div>
				)}
			</div>
			<div className="flex flex-col gap-5 md:col-span-5">
				<Data className="text-ground-muted tabular-nums">
					{String(index).padStart(3, '0')} / {String(total).padStart(3, '0')}
				</Data>
				<Display as="h3" size="chapter" className="break-words hyphens-auto">
					<Link to={workHref(work.id)} className="hover:text-link no-underline">
						{work.title ?? 'Untitled'}
					</Link>
				</Display>
				<p className="font-body text-prose-lg italic">
					{work.artist ?? 'Unattributed'}
					{', '}
					<span className="not-italic">
						{displayPeriod(work.notBefore, work.notAfter)}
					</span>
				</p>
				{match ? <MatchedPassage match={match} /> : null}
				{work.motifs.length ? (
					<p className="font-body text-prose measure">
						Motifs recorded at Level I: {work.motifs.slice(0, 12).join(', ')}.
					</p>
				) : (
					<Data className="text-stamp-fg">No motifs on record</Data>
				)}
				<Link
					to={workHref(work.id)}
					className="font-data text-data-sm text-link tracking-[0.12em] uppercase underline underline-offset-4"
				>
					Open dossier →
				</Link>
			</div>
		</article>
	)
}
