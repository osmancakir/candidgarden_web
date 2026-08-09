import { Link, useFetcher } from 'react-router'
import {
	DocumentPage,
	DocumentSection,
	Ledger,
	LedgerRow,
} from '#app/components/institute/document.tsx'
import { Data, RecordStamp } from '#app/components/institute/primitives.tsx'
import { archivalDate } from '#app/utils/archive.ts'
import { prisma } from '#app/utils/db.server.ts'
import coverPlate from './+companions/cover.webp'
import { type Route } from './+types/companions.ts'

/**
 * The one document this institute publishes that no machine wrote.
 *
 * It predates the archive and sits outside it, so it is filed as a companion
 * rather than as a record: same paper register, same numbered sections, but a
 * named human voice in §2 — because a site whose whole argument is that every
 * reading should say who made it cannot print an unattributed one.
 *
 * The cover is imported rather than linked from the bucket the PDF itself lives
 * in: `img-src` is `'self'`, and a cover that fails to load on a page about
 * looking at pictures would be its own small joke.
 */

const COMPANION = {
	fileName: 'reading-companion-all-the-beauty.pdf',
	href: 'https://artaigo-bucket-v1.fly.storage.tigris.dev/webappAssets/arbook_20250607.pdf',
	/** Stated on the page because 242 MB of plates is a decision, not a detail. */
	size: '242 MB',
	compiled: new Date('2025-06-07T00:00:00Z'),
}

export async function loader() {
	const downloads = await prisma.pdfDownload.count({
		where: { fileName: COMPANION.fileName },
	})
	return { downloads }
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Reading companion · Candid Garden' },
	{
		name: 'description',
		content:
			'A reading companion to Patrick Bringley’s All the Beauty in the World: the artworks the book names, gathered as plates with their licences tracked down, free to download.',
	},
]

export default function CompanionsRoute({ loaderData }: Route.ComponentProps) {
	const { downloads } = loaderData
	// The tally is a side effect of the click, never a condition of it. If the
	// POST fails the reader still gets the file; the count simply stays where it
	// was. A successful submission revalidates the loader, so the figure below
	// moves without a reload.
	const tally = useFetcher()

	return (
		<DocumentPage
			kind="Companion · Out of series"
			title="All the Beauty in the World"
			lead="A reading companion to Patrick Bringley’s memoir of ten years spent standing still in the Metropolitan Museum of Art. The book names a great many works and reproduces none of them; this is the volume of plates it does not carry, gathered one work at a time with their licences tracked down."
			stamp={<RecordStamp date={COMPANION.compiled} />}
		>
			<DocumentSection n={1} heading="Description">
				<div className="mb-6 flex flex-col gap-6 sm:flex-row sm:items-start">
					<figure className="shrink-0">
						<img
							src={coverPlate}
							alt="Cover of All the Beauty in the World by Patrick Bringley"
							width={1303}
							height={2000}
							className="border-rule h-auto w-40 border sm:w-48"
						/>
						<figcaption className="mt-2">
							<Data className="text-ground-muted normal-case">
								Bringley, 2023
							</Data>
						</figcaption>
					</figure>
					<div>
						<p>
							The companion is a single PDF holding the artworks the book
							mentions, in high-quality reproductions gathered with their
							licences checked rather than assumed. It is meant to be read
							beside the book, so that a work named on the page can be looked at
							on the spot instead of searched for.
						</p>
						<p>
							Nothing in it is machine-generated. It carries no motifs, no
							agreement scores, and no readings — it is a set of pictures and
							their credits, which is a humbler object than anything in the{' '}
							<Link to="/archive">index</Link> and considerably better attested.
						</p>
					</div>
				</div>
			</DocumentSection>

			<DocumentSection n={2} heading="Note from the compiler">
				<p>
					This institute is, at present, one person, and this is the document
					that gives that away.
				</p>
				<p>
					<em>All the Beauty in the World</em> was the most affecting book I
					read in 2025. I had visited the Met for the first time in the summer
					of 2024 and was thoroughly undone by it; reading Bringley’s account of
					standing in those rooms for ten years was like being returned there,
					and it polished my soul.
				</p>
				<p>
					I was, at the time, longing to stand still myself — to find some
					stillness in a chaotic year. So I turned the book into a form of
					meditation: collecting the artworks one by one, tracking down their
					licences, and compiling them into this companion. It took a while.
					That was the point.
				</p>
				<p>
					If you decide to read the book — and you should — I hope this helps
					you pause, look properly, and perhaps dream a little.
				</p>
			</DocumentSection>

			<DocumentSection n={3} heading="Rights and reproduction">
				<p>
					The plates were collected with care and with respect for the licences
					attached to them: each one looked up rather than taken on trust. That
					is the same standard the archive proper holds itself to — see the{' '}
					<Link to="/tos">terms</Link>.
				</p>
				<p>
					If a credit here is wrong, it is wrong in a document with a person’s
					name behind it, and we would rather hold the correction than the
					error. Write to the <Link to="/support">correspondence page</Link>{' '}
					with the plate and what it should say.
				</p>
			</DocumentSection>

			<DocumentSection n={4} heading="The file">
				<div className="not-italic">
					<Ledger>
						<LedgerRow label="Document" value="Reading companion · one PDF" />
						<LedgerRow
							label="Size"
							value={`${COMPANION.size} — plates at full resolution, and it is a long download on a phone`}
						/>
						<LedgerRow
							label="Compiled"
							value={archivalDate(COMPANION.compiled)}
						/>
						<LedgerRow label="Price" value="None. It is a gift." />
						<LedgerRow
							label="Downloads"
							value={
								<span className="tabular-nums">
									{downloads.toLocaleString('en-US')}
								</span>
							}
						/>
					</Ledger>
				</div>
				<p className="mt-6">
					<a
						href={COMPANION.href}
						target="_blank"
						rel="noopener noreferrer"
						onClick={() => {
							void tally.submit(
								{ fileName: COMPANION.fileName },
								{ method: 'POST', action: '/resources/track-download' },
							)
						}}
						className="font-data text-data-sm tracking-[0.12em] uppercase underline underline-offset-4"
					>
						Download the companion · PDF, {COMPANION.size} →
					</a>
				</p>
			</DocumentSection>
		</DocumentPage>
	)
}
