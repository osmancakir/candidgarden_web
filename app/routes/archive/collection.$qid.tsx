import { invariantResponse } from '@epic-web/invariant'
import { Link, data } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import {
	Data,
	Display,
	NoRecords,
	SectionHead,
} from '#app/components/institute/primitives.tsx'
import {
	RecordRow,
	type WorkSummary,
} from '#app/components/institute/record.tsx'
import { verificationLabel } from '#app/utils/archive.ts'
import { prisma } from '#app/utils/db.server.ts'
import { pipeHeaders } from '#app/utils/headers.server.ts'
import { cn, getWorkImgSrc } from '#app/utils/misc.tsx'
import { makeTimings } from '#app/utils/timing.server.ts'
import { collectionIndexHref, isInstitutionId } from './+shared/filters.ts'
import { type Route } from './+types/collection.$qid.ts'

/**
 * One holder of works, and everything the archive can say about it.
 *
 * The page exists because `Institution` is an assertion and assertions have to
 * be inspectable. Filtering the index to Q190804 shows a reader 7,991 works and
 * asks them to take on trust that those four spellings are one museum; this
 * page shows the spellings, names the identifier, and links out to Wikidata so
 * the claim can be checked rather than believed. It is the same duty the work
 * page discharges for a reading — say what was claimed, and by what.
 *
 * Addressed by QID rather than by row id: the register is re-runnable and keyed
 * on `wikiDataId`, so the integer is free to move under a re-import while a
 * cited URL is not.
 */

/** Works listed per page. Matches the index, so paging feels like one archive. */
const WORKS_PER_PAGE = 48

/** How many of the archive's spellings are shown before the tail is summarised. */
const SPELLINGS_SHOWN = 12

const WORK_SELECT = {
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
		take: 4,
		select: { tag: { select: { name: true } } },
	},
} as const

export async function loader({ params, request }: Route.LoaderArgs) {
	const timings = makeTimings('collection')
	const qid = params.qid ?? ''
	invariantResponse(isInstitutionId(qid), 'Not found', { status: 404 })

	const institution = await prisma.institution.findFirst({
		where: { wikiDataId: qid, deletedAt: null },
		select: {
			id: true,
			name: true,
			wikiDataId: true,
			objectKey: true,
			updatedAt: true,
			wikiDataVerification: { select: { status: true, verifiedAt: true } },
		},
	})
	invariantResponse(institution, 'Not found', { status: 404 })

	const url = new URL(request.url)
	const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1)
	const where = { institutionId: institution.id }

	const [total, works, spellings, span] = await Promise.all([
		prisma.resource.count({ where }),
		prisma.resource.findMany({
			where,
			orderBy: [{ title: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
			skip: (page - 1) * WORKS_PER_PAGE,
			take: WORKS_PER_PAGE,
			select: WORK_SELECT,
		}),
		// What the cataloguers actually wrote. This is the evidence for the
		// grouping, so it is shown in full rather than summarised into a count:
		// a reader who thinks one of these strings is a different institution can
		// see it here and say so.
		prisma.resource.groupBy({
			by: ['institution'],
			where,
			_count: { _all: true },
			orderBy: { _count: { institution: 'desc' } },
		}),
		prisma.resource.aggregate({
			where,
			_min: { notBefore: true },
			_max: { notAfter: true },
		}),
	])

	return data(
		{
			collection: {
				name: institution.name,
				wikiDataId: institution.wikiDataId,
				objectKey: institution.objectKey,
				updatedAt: institution.updatedAt,
			},
			verification: verificationLabel(institution.wikiDataVerification?.status),
			total,
			page,
			pageCount: Math.max(1, Math.ceil(total / WORKS_PER_PAGE)),
			works: works.map(
				(work): WorkSummary => ({
					id: work.id,
					title: work.title ?? work.titleEn,
					artist: work.artist?.name ?? null,
					notBefore: work.notBefore,
					notAfter: work.notAfter,
					// The archive's own wording, not the register's name: it is the
					// same in every row on this page, and repeating it 48 times would
					// say nothing where the cataloguer's variant says something.
					institution: work.institution,
					objectKey: work.objectKey,
					motifs: work.taggings.map((t) => t.tag.name),
				}),
			),
			spellings: spellings.map((row) => ({
				name: row.institution,
				works: row._count._all,
			})),
			earliest: span._min.notBefore,
			latest: span._max.notAfter,
		},
		{ headers: { 'Server-Timing': timings.toString() } },
	)
}

export const headers: Route.HeadersFunction = pipeHeaders

export const meta: Route.MetaFunction = ({ data: loaderData }) => {
	if (!loaderData) return [{ title: 'Collection not found · Candid Garden' }]
	const { collection, total } = loaderData
	return [
		{ title: `${collection.name} · Candid Garden` },
		{
			name: 'description',
			content: `${total.toLocaleString('en-US')} works held by ${collection.name} (${collection.wikiDataId}) in the Candid Garden archive, with machine-generated iconographic metadata.`,
		},
	]
}

export default function CollectionPage({ loaderData }: Route.ComponentProps) {
	const {
		collection,
		verification,
		total,
		page,
		pageCount,
		works,
		spellings,
		earliest,
		latest,
	} = loaderData

	const indexHref = collectionIndexHref(collection.wikiDataId ?? '')
	const shown = spellings.slice(0, SPELLINGS_SHOWN)
	const hidden = spellings.length - shown.length

	return (
		<article>
			<section className="border-rule container border-b py-10 md:py-14">
				<Data className="text-ground-muted mb-3">Collection</Data>
				<div className="grid gap-8 lg:grid-cols-12">
					<div className="lg:col-span-7">
						<Display as="h1" size="chapter" className="mb-5">
							{collection.name}
						</Display>
						<p className="font-body text-prose-lg measure">
							Candid Garden holds{' '}
							<span className="font-data text-data-lg tabular-nums">
								{total.toLocaleString('en-US')}
							</span>{' '}
							{total === 1 ? 'work' : 'works'} recorded as belonging to this
							collection
							{spellings.length > 1 ? (
								<>
									, filed by the archive's cataloguers under {spellings.length}{' '}
									different names
								</>
							) : null}
							. That grouping is a claim made by matching those names against
							Wikidata, not a statement from the institution itself, and it is
							set out in full below.
						</p>
					</div>

					{/* The identifier, plainly, as a table — the same form the work page
					    gives its catalogue facts. */}
					<div className="lg:col-span-5">
						<table className="border-rule w-full border-t">
							<caption className="sr-only">Register entry</caption>
							<tbody>
								{[
									[
										'Wikidata',
										collection.wikiDataId ? (
											<a
												href={`https://www.wikidata.org/wiki/${collection.wikiDataId}`}
												className="hover:text-link underline underline-offset-4"
												rel="noreferrer"
												target="_blank"
											>
												{collection.wikiDataId}
											</a>
										) : (
											'—'
										),
									],
									['Works held', total.toLocaleString('en-US')],
									[
										'Archive spellings',
										spellings.length.toLocaleString('en-US'),
									],
									[
										'Period',
										earliest || latest
											? `${earliest ?? '?'}–${latest ?? '?'}`
											: 'undated',
									],
									['Attribution', verification],
								].map(([term, value]) => (
									<tr key={String(term)} className="border-rule border-b">
										<th
											scope="row"
											className="font-data text-data-sm text-ground-muted w-40 py-2 pr-4 text-left align-top tracking-[0.12em] uppercase"
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
						<p className="font-body text-prose-sm text-ground-muted mt-3">
							The register carries one row per institution and names it as
							Wikidata does. Every work below keeps the cataloguer's own
							wording, which is what the archive actually recorded.
						</p>
					</div>
				</div>
			</section>

			{/* ---- The evidence for the grouping ---- */}
			<section className="border-rule container border-b py-8">
				<SectionHead
					eyebrow="Filed in the archive as"
					aside={
						<Data className="text-ground-muted normal-case">
							{spellings.length.toLocaleString('en-US')}{' '}
							{spellings.length === 1 ? 'spelling' : 'spellings'} · all matched
							to {collection.wikiDataId}
						</Data>
					}
					className="mb-4"
				/>
				<ul className="flex flex-wrap gap-2">
					{shown.map((spelling) => (
						<li
							key={spelling.name ?? 'unrecorded'}
							className="border-rule font-data text-data-sm flex items-baseline gap-2 border px-2 py-1"
						>
							<span>{spelling.name ?? 'no wording recorded'}</span>
							<span className="text-ground-muted tabular-nums">
								{spelling.works.toLocaleString('en-US')}
							</span>
						</li>
					))}
					{hidden > 0 ? (
						<li className="font-data text-data-sm text-ground-muted flex items-center px-2 py-1">
							and {hidden.toLocaleString('en-US')} more, each on a handful of
							works
						</li>
					) : null}
				</ul>
			</section>

			{/* ---- The works ---- */}
			<section className="container py-10">
				<SectionHead
					eyebrow="Works held"
					aside={
						<Link
							to={indexHref}
							className="font-data text-data-sm text-link tracking-[0.12em] uppercase underline underline-offset-4"
						>
							Open in the filter console →
						</Link>
					}
					className="mb-4"
				/>

				{works.length === 0 ? (
					// A register entry with no works and a page past the end of the list
					// are different findings, and saying the first when the second is
					// true would tell a reader the archive is empty when it is not.
					total === 0 ? (
						<NoRecords>
							No works are linked to this collection. The register holds the
							entry, but nothing in the archive points at it.
						</NoRecords>
					) : (
						<NoRecords>
							This collection holds {total.toLocaleString('en-US')} works, but
							there is no page {page}.{' '}
							<Link
								to="?page=1"
								className="hover:text-link underline underline-offset-4"
							>
								Start at the first page.
							</Link>
						</NoRecords>
					)
				) : (
					<div className="overflow-x-auto">
						<table className="min-w-full">
							<caption className="sr-only">
								Works held by {collection.name}, ordered by title.
							</caption>
							<thead>
								<tr className="border-rule-strong border-b">
									{[
										'',
										'Title',
										'Artist',
										'Period',
										'Recorded as',
										'Motifs',
									].map((heading, index) => (
										<th
											key={heading || index}
											scope="col"
											className={cn(
												'font-data text-data-sm text-ground-muted py-2 pr-4 text-left tracking-[0.12em] uppercase',
												heading === 'Recorded as' && 'hidden md:table-cell',
												heading === 'Motifs' && 'hidden lg:table-cell',
											)}
										>
											{heading || <span className="sr-only">Plate</span>}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{works.map((work) => (
									<RecordRow
										key={work.id}
										work={work}
										imgSrc={getWorkImgSrc(work.objectKey)}
									/>
								))}
							</tbody>
						</table>
					</div>
				)}

				<Pages page={page} pageCount={pageCount} total={total} />
			</section>

			<nav className="border-rule container flex flex-wrap items-center justify-between gap-4 border-t py-6">
				<Link
					to="/"
					className="font-data text-data-sm text-link tracking-[0.12em] uppercase underline underline-offset-4"
				>
					← Back to the index
				</Link>
				<Data className="text-ground-muted normal-case">
					Register entry {collection.wikiDataId} · one row per institution, not
					per spelling
				</Data>
			</nav>
		</article>
	)
}

function Pages({
	page,
	pageCount,
	total,
}: {
	page: number
	pageCount: number
	total: number
}) {
	if (pageCount <= 1) return null
	const from = (page - 1) * WORKS_PER_PAGE + 1
	const to = Math.min(page * WORKS_PER_PAGE, total)
	// Past the end there is no range to state, and stating one anyway produces
	// "479,905–7,991 of 7,991". The nav still renders, because a reader who
	// over-shot needs the way back more than they need the arithmetic.
	const inRange = from <= total
	return (
		<nav
			aria-label="Pages of works"
			className="border-rule mt-10 flex flex-wrap items-center justify-between gap-4 border-t pt-4"
		>
			<Data className="text-ground-muted tabular-nums">
				{inRange
					? `${from.toLocaleString('en-US')}–${to.toLocaleString('en-US')} of ${total.toLocaleString('en-US')}`
					: `${total.toLocaleString('en-US')} in all`}
			</Data>
			<div className="flex items-center gap-4">
				{page > 1 ? (
					<Link
						to={`?page=${page - 1}`}
						rel="prev"
						className="font-data text-data-sm text-link tracking-[0.12em] uppercase underline underline-offset-4"
					>
						← Previous
					</Link>
				) : (
					<span className="font-data text-data-sm text-ground-muted tracking-[0.12em] uppercase opacity-40">
						← Previous
					</span>
				)}
				<Data className="tabular-nums">
					{page} / {pageCount}
				</Data>
				{page < pageCount ? (
					<Link
						to={`?page=${page + 1}`}
						rel="next"
						className="font-data text-data-sm text-link tracking-[0.12em] uppercase underline underline-offset-4"
					>
						Next →
					</Link>
				) : (
					<span className="font-data text-data-sm text-ground-muted tracking-[0.12em] uppercase opacity-40">
						Next →
					</span>
				)}
			</div>
		</nav>
	)
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				404: () => (
					<div className="container py-20">
						<Display as="h1" size="title" className="mb-4">
							No such collection
						</Display>
						<p className="font-body text-prose measure mb-6">
							The register holds one row per institution, addressed by its
							Wikidata identifier — <code>/archive/collection/Q190804</code>.
							This one is not in it: either the identifier is wrong, or the
							holder was never reconciled and exists only as the wording on each
							work.
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
