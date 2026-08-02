// This is called a "splat route" and as it's in the root `/app/routes/`
// directory, it's a catchall. If no other routes match, this one will and we
// can know that the user is hitting a URL that doesn't exist. By throwing a
// 404 from the loader, we can force the error boundary to render which will
// ensure the user gets the right status code and we can display a nicer error
// message for them than the React Router and/or browser default.

import { Link, useLocation } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import {
	Data,
	Display,
	UncertaintyNotice,
} from '#app/components/institute/primitives.tsx'
import { Plate, type WorkSummary } from '#app/components/institute/record.tsx'
import { displayPeriod } from '#app/utils/archive.ts'
import { prisma } from '#app/utils/db.server.ts'
import { getWorkImgSrc } from '#app/utils/misc.tsx'

/**
 * §8: "The 404 page shows a randomly selected artwork at Level I only,
 * captioned INTERPRETATION NOT FOUND."
 *
 * The joke only lands if the plate is real, so the loader picks an actual work
 * before throwing — the archive answering a question you did not ask, which is
 * the most it can honestly do with a bad URL.
 */

type LostPlate = {
	id: number
	title: string | null
	artist: string | null
	notBefore: number | null
	notAfter: number | null
	institution: string | null
	objectKey: string | null
	motifs: Array<string>
}

async function randomPlate(): Promise<LostPlate | null> {
	// `highlight` works are curated and few, so picking from those is cheap and
	// worth looking at — far better than an OFFSET over 66,000 rows on a page
	// nobody meant to visit.
	const candidates = await prisma.resource.findMany({
		where: { highlight: true, objectKey: { not: null } },
		take: 40,
		select: {
			id: true,
			title: true,
			titleEn: true,
			notBefore: true,
			notAfter: true,
			institution: true,
			objectKey: true,
			artist: { select: { name: true } },
			taggings: {
				orderBy: { frequency: 'desc' },
				take: 8,
				select: { tag: { select: { name: true } } },
			},
		},
	})
	const pick = candidates[Math.floor(Math.random() * candidates.length)]
	if (!pick) return null
	return {
		id: pick.id,
		title: pick.title ?? pick.titleEn,
		artist: pick.artist?.name ?? null,
		notBefore: pick.notBefore,
		notAfter: pick.notAfter,
		institution: pick.institution,
		objectKey: pick.objectKey,
		motifs: pick.taggings.map((t) => t.tag.name),
	}
}

export async function loader() {
	// The plate rides along on the thrown response so the boundary can render it.
	// A failure to find one must never turn a 404 into a 500.
	let plate: LostPlate | null = null
	try {
		plate = await randomPlate()
	} catch {
		plate = null
	}
	throw new Response(JSON.stringify({ plate }), {
		status: 404,
		headers: { 'Content-Type': 'application/json' },
	})
}

export function action() {
	throw new Response('Not found', { status: 404 })
}

export default function NotFound() {
	// due to the loader, this component will never be rendered, but we'll return
	// the error boundary just in case.
	return <ErrorBoundary />
}

function parsePlate(data: unknown): LostPlate | null {
	// `error.data` is whatever the Response body deserialised to: the parsed
	// object when the content type was JSON, a string when it was not.
	if (data && typeof data === 'object' && 'plate' in data) {
		return (data as { plate: LostPlate | null }).plate
	}
	if (typeof data !== 'string') return null
	try {
		return (JSON.parse(data) as { plate?: LostPlate | null }).plate ?? null
	} catch {
		return null
	}
}

export function ErrorBoundary() {
	const location = useLocation()
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				404: ({ error }) => (
					<InterpretationNotFound path={location.pathname} data={error.data} />
				),
			}}
		/>
	)
}

function InterpretationNotFound({
	path,
	data,
}: {
	path: string
	data: unknown
}) {
	const plate = parsePlate(data)
	const imgSrc = getWorkImgSrc(plate?.objectKey)
	const summary: WorkSummary | null = plate
		? {
				id: plate.id,
				title: plate.title,
				artist: plate.artist,
				notBefore: plate.notBefore,
				notAfter: plate.notAfter,
				institution: plate.institution,
				objectKey: plate.objectKey,
				motifs: plate.motifs,
			}
		: null

	return (
		<div className="grid w-full gap-10 lg:grid-cols-12">
			<div className="flex flex-col gap-6 lg:col-span-5">
				<Display as="h1" size="chapter">
					Interpretation not found
				</Display>
				<UncertaintyNotice notice="NO RECORD AT THIS ADDRESS · 404" />
				<div>
					<Data className="text-ground-muted mb-1 block">Requested</Data>
					<pre className="font-data text-data measure break-all whitespace-pre-wrap">
						{path}
					</pre>
				</div>
				<p className="font-body text-prose measure">
					Nothing is filed here. In place of the record you asked for, the
					archive offers one it does hold — shown at Level I only, which is all
					it can vouch for in any case.
				</p>
				<Link
					to="/"
					className="font-data text-data-sm text-link tracking-[0.12em] uppercase underline underline-offset-4"
				>
					← Back to the index
				</Link>
			</div>

			{summary && imgSrc ? (
				<figure className="flex flex-col gap-4 lg:col-span-7">
					<Link to={`/archive/${summary.id}`} className="block">
						<Plate
							work={summary}
							src={imgSrc}
							maxHeight="max-h-[55vh]"
							sizes="(min-width: 1024px) 55vw, 92vw"
						/>
					</Link>
					<figcaption className="border-rule flex flex-col gap-1 border-t pt-3">
						<Data className="tracking-[0.2em]">Level I · Pre-iconographic</Data>
						<span className="font-body text-prose italic">
							{summary.title ?? 'Untitled'}
							{' — '}
							{summary.artist ?? 'Unattributed'}
							{', '}
							<span className="not-italic">
								{displayPeriod(summary.notBefore, summary.notAfter)}
							</span>
						</span>
						{summary.motifs.length ? (
							<Data className="text-ground-muted normal-case">
								{summary.motifs.join(' · ')}
							</Data>
						) : null}
					</figcaption>
				</figure>
			) : null}
		</div>
	)
}
