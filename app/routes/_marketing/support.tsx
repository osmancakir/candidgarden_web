import { Link } from 'react-router'
import {
	PANOFSKY,
	type PanofskyLevel,
} from '#app/components/institute/descent.tsx'
import {
	DocumentPage,
	DocumentSection,
} from '#app/components/institute/document.tsx'
import { Data } from '#app/components/institute/primitives.tsx'
import { archivalDate } from '#app/utils/archive.ts'
import { prisma } from '#app/utils/db.server.ts'
import { type Route } from './+types/support.ts'

const INSTITUTE_ADDRESS = 'hey@candidgarden.com'

/**
 * A dossier links here with `?record=&level=`, so the page can name the reading
 * being disputed instead of asking the reader to transcribe it. Section 1 asks
 * for the record number and the stamp; when we already know both, we print them
 * and pre-fill the post rather than making the reader do the archive's work.
 */
export async function loader({ request }: Route.LoaderArgs) {
	const params = new URL(request.url).searchParams
	const record = Number(params.get('record'))
	if (!Number.isInteger(record) || record <= 0) return { dispute: null }

	// Only the two levels that carry a written reading; Level I is inventory and
	// there is nothing there to dispute in prose.
	const requested = Number(params.get('level'))
	const level: PanofskyLevel | null =
		requested === 2 || requested === 3 ? requested : null

	const resource = await prisma.resource.findUnique({
		where: { id: record },
		select: {
			id: true,
			title: true,
			titleEn: true,
			artist: { select: { name: true } },
			wikiDataVerification: { select: { verifiedAt: true } },
			interpretations: {
				where: { publishedAt: { not: null }, ...(level ? { level } : {}) },
				orderBy: { level: 'asc' },
				select: { level: true, source: true, citation: true },
			},
		},
	})
	if (!resource) return { dispute: null }

	const reading = level
		? (resource.interpretations.find((i) => i.level === level) ?? null)
		: null

	return {
		dispute: {
			record: resource.id,
			title: resource.title ?? resource.titleEn,
			artist: resource.artist?.name ?? null,
			level,
			source: reading?.source ?? null,
			citation: reading?.citation ?? null,
			stamped: resource.wikiDataVerification?.verifiedAt ?? null,
		},
	}
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Correspondence · Candid Garden' },
	{
		name: 'description',
		content:
			'How to dispute a reading, report a broken record, or otherwise write to the Institute for Art Re-Search.',
	},
]

type Dispute = NonNullable<Awaited<ReturnType<typeof loader>>['dispute']>

/** The post section 1 asks for, already addressed and already citing itself. */
function disputeMailto(dispute: Dispute) {
	const levelName = dispute.level
		? `Level ${PANOFSKY[dispute.level].numeral} (${PANOFSKY[dispute.level].name})`
		: 'the record'
	const subject = `Dispute · Record #${dispute.record} · ${dispute.level ? `Level ${PANOFSKY[dispute.level].numeral}` : 'general'}`
	const body = [
		`Record: #${dispute.record}${dispute.title ? ` — ${dispute.title}` : ''}`,
		dispute.artist ? `Artist: ${dispute.artist}` : null,
		`Under dispute: ${levelName}`,
		dispute.citation ? `Reading: ${dispute.citation}` : null,
		dispute.stamped ? `Stamped: ${archivalDate(dispute.stamped)}` : null,
		'',
		'What the machine got wrong:',
		'',
		'',
		'What I would put in its place:',
		'',
		'',
	]
		.filter((line) => line !== null)
		.join('\n')

	return `mailto:${INSTITUTE_ADDRESS}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

/**
 * What the reader arrived to dispute, printed back at them. Machine-drafted
 * readings say so here too — a reader deciding whether to spend an evening on a
 * correction should know what they are correcting.
 */
function UnderDispute({ dispute }: { dispute: Dispute }) {
	const level = dispute.level ? PANOFSKY[dispute.level] : null
	return (
		<div className="border-stamp-fg text-stamp-fg border-2 p-4">
			<div className="border-stamp-fg/50 mb-3 border-b pb-1">
				<Data className="tracking-[0.2em]">Under dispute</Data>
			</div>
			<dl className="font-data text-data-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 uppercase">
				<dt className="tracking-[0.12em] opacity-70">Record</dt>
				<dd>
					<Link to={`/archive/${dispute.record}`} className="underline">
						#{dispute.record}
					</Link>
					{dispute.title ? (
						<span className="normal-case"> · {dispute.title}</span>
					) : null}
				</dd>
				{level ? (
					<>
						<dt className="tracking-[0.12em] opacity-70">Level</dt>
						<dd>
							{level.numeral} · {level.name}
						</dd>
					</>
				) : null}
				{dispute.source ? (
					<>
						<dt className="tracking-[0.12em] opacity-70">Reading</dt>
						<dd>
							{dispute.source === 'MODEL'
								? 'Written by a machine'
								: 'Editorial'}
							{dispute.citation ? (
								<span className="normal-case"> · {dispute.citation}</span>
							) : null}
						</dd>
					</>
				) : null}
				{dispute.stamped ? (
					<>
						<dt className="tracking-[0.12em] opacity-70">Stamped</dt>
						<dd>{archivalDate(dispute.stamped)}</dd>
					</>
				) : null}
			</dl>
			<p className="mt-4">
				<a
					href={disputeMailto(dispute)}
					className="font-data text-data-sm tracking-[0.12em] underline underline-offset-4"
				>
					Open a post citing this record →
				</a>
			</p>
		</div>
	)
}

/** §7: "an open invitation to dispute readings". This page is that invitation,
 *  and it puts the dispute route above the support route deliberately. */
export default function SupportRoute({ loaderData }: Route.ComponentProps) {
	const { dispute } = loaderData
	return (
		<DocumentPage
			kind="Correspondence"
			title="Write to the institute"
			lead="We would rather hold a correction than a reading. Disputes are the most useful post we receive; please put them first."
		>
			<DocumentSection n={1} heading="Disputing a reading">
				{dispute ? <UnderDispute dispute={dispute} /> : null}
				<p>
					{dispute
						? 'The post above arrives already citing the record and its stamp. Tell us what the machine got wrong, and what you would put in its place.'
						: 'Cite the record number and the stamp printed beneath it, state what the machine got wrong, and say what you would put in its place.'}{' '}
					A dispute we accept is published against the record, in perpetuity,
					with your name on it — see the{' '}
					<Link to="/essays">register of corrections</Link>.
				</p>
				<p className="not-italic">
					<Data className="text-ground-muted">Address</Data>{' '}
					<a href={`mailto:${INSTITUTE_ADDRESS}`}>{INSTITUTE_ADDRESS}</a>
				</p>
			</DocumentSection>

			<DocumentSection n={2} heading="Reporting a broken record">
				<p>
					Missing plates, unreadable images, records that fail to load: these
					are archive failures, not reader failures. Send the record number and
					what you saw.
				</p>
			</DocumentSection>

			<DocumentSection n={3} heading="Research enquiries">
				<p>
					We are glad to discuss the corpus, the generation runs, and the
					methodology with anyone working in the area. We are not able to supply
					bulk exports on request; the index is filterable and citable by URL
					for exactly this reason.
				</p>
			</DocumentSection>

			<DocumentSection n={4} heading="Account trouble">
				<p>
					If you cannot sign in, the fastest route is the{' '}
					<Link to="/forgot-password">password reset</Link>. If that fails,
					write to us and say which address you registered with.
				</p>
			</DocumentSection>
		</DocumentPage>
	)
}
