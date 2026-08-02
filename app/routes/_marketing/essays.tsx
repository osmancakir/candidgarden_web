import { Link } from 'react-router'
import {
	DocumentPage,
	DocumentSection,
} from '#app/components/institute/document.tsx'
import {
	Data,
	NoRecords,
	RecordStamp,
} from '#app/components/institute/primitives.tsx'
import { type Route } from './+types/essays.ts'

/**
 * §5: "Anthology's chronological chapters become Candid Garden's three Panofsky
 * levels as global sections, with an optional fourth — Reprise — for essays,
 * methodology, and corrections, mirroring Anthology's Chapter 5 that revisited
 * gaps in the canon."
 *
 * This is that fourth chapter. The methodology note is real and written; the
 * corrections register is genuinely empty and says so rather than being seeded
 * with plausible-looking entries.
 */

export const meta: Route.MetaFunction = () => [
	{ title: 'Reprise · Candid Garden' },
	{
		name: 'description',
		content:
			'Essays, methodology and corrections from the Institute for Machine Iconography — the chapter that revisits the archive’s own gaps.',
	},
]

export default function EssaysRoute() {
	return (
		<DocumentPage
			kind="Reprise · Chapter IV"
			title="Essays, methodology, and corrections"
			lead="The chapter that revisits the archive’s gaps. Everything here is about the limits of what the preceding three levels can claim."
			stamp={<RecordStamp date={new Date('2026-03-14T00:00:00Z')} run={118} />}
		>
			<DocumentSection n="I" heading="On calling it confidence">
				<p>
					The number in superscript beside every motif in this archive is an
					agreement rate. It counts how many annotations applied a term to a
					work and divides by the strongest such count on that work. We
					considered calling it confidence. We decided not to, and the reasoning
					is worth stating because the temptation recurs.
				</p>
				<p>
					A confidence score implies the reader has been told something about
					the model’s internal state — that the system, having produced an
					answer, also reported how sure it was. Nothing of the sort has
					happened here. What we have is a tally of external agreement, most of
					it human, collected by a game. A motif can sit at 1.00 because a
					hundred players all saw a horse, and the horse can still be a donkey.
				</p>
				<p>
					The distinction matters more in an AI archive than it would elsewhere,
					because the interface is the only thing standing between a plausible
					number and a reader’s willingness to trust it. So the chips carry the
					number, the <Link to="/glossary">glossary</Link> defines it, and the
					word “confidence” appears only where the model has genuinely reported
					one — which is, at present, nowhere.
				</p>
			</DocumentSection>

			<DocumentSection n="II" heading="Why Levels II and III are empty">
				<p>
					Every dossier in this archive descends through Panofsky’s three levels
					and, at the second and third, tells you there is no reading on record.
					This is not an unfinished feature. The corpus holds motif annotations
					— Level I material — and nothing else. To populate Level II we would
					have to generate identifications; to populate Level III, we would have
					to generate interpretation.
				</p>
				<p>
					Both are within a model’s power to produce fluently and neither is
					within this institute’s power to warrant. An archive that filled those
					sections with unmarked machine prose would be a more impressive
					website and a considerably worse research instrument. The empty
					sections are the finding.
				</p>
				<p>
					When readings are added, they will arrive stamped: model, run, date,
					and a human-verification status that starts at <em>unreviewed</em> and
					stays there until someone actually reviews it.
				</p>
			</DocumentSection>

			<DocumentSection n="III" heading="Register of corrections">
				<p>
					Corrections accepted against published records are listed here in
					perpetuity, with the original reading, the correction, and the person
					who supplied it. Nothing is quietly edited. If we were wrong, the
					archive keeps a record of having been wrong.
				</p>
				<div className="mt-6 not-italic">
					<Data className="text-ground-muted mb-3 block">
						Corrections on file
					</Data>
					<NoRecords>
						No corrections have been accepted yet. This is a young archive, not
						an accurate one.
					</NoRecords>
				</div>
			</DocumentSection>

			<DocumentSection n="IV" heading="Submitting a dispute">
				<p>
					Cite the record number and the stamp beneath it, describe what the
					machine got wrong, and say what you would put in its place. Send it
					through the <Link to="/support">correspondence page</Link>. We publish
					disputes we accept and we credit the disputant.
				</p>
			</DocumentSection>
		</DocumentPage>
	)
}
