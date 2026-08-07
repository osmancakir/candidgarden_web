import { Link } from 'react-router'
import {
	DocumentPage,
	DocumentSection,
	Ledger,
	LedgerRow,
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
			'Essays, methodology and corrections from the Institute for Art Re-Search — the chapter that revisits the archive’s own gaps.',
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

			<DocumentSection
				n="III"
				heading="On borrowing other people’s identifiers"
			>
				<p>
					A record that only means something inside its own database is a dead
					end. The archive can say that a work is by Rembrandt and hangs in the
					Rijksmuseum, and nothing outside this website can act on either claim,
					because “Rembrandt” and “Rijksmuseum” are strings we happen to have
					stored. So the three things this archive names most often — artists,
					works, and the institutions holding them — have been reconciled
					against Wikidata, and now carry identifiers that other collections
					already use.
				</p>
				<div className="mt-6 not-italic">
					<Ledger>
						<LedgerRow
							label="Artists"
							value="5,371 of 6,910 carry a QID (77.7%), resolving to 5,363 distinct people."
						/>
						<LedgerRow
							label="Works"
							value="3,066 of 54,497 carry a QID — 8.0% of the 38,304 that reconciliation could reach at all."
						/>
						<LedgerRow
							label="Collections"
							value="956 institutions on file, holding 27,186 works (71.7% of everything with a named holder)."
						/>
					</Ledger>
				</div>
				<p className="mt-6">
					The works are the honest disappointment, and the headline 5.6% is the
					wrong number to read either way. A title is only ever matched inside
					its own artist’s list of works, so a work with no artist, or with an
					artist who has no identifier, was never a candidate: 16,193 of them,
					before the matching began. What the rest miss on is mostly
					translation. Rembrandt’s <em>Die Heimkehr des verlorenen Sohnes</em>{' '}
					is <em>Die Rückkehr des verlorenen Sohnes</em> on Wikidata — the same
					painting, and no amount of normalising gets from one string to the
					other.
				</p>
				<p>
					The collections went better, and are the part a reader will actually
					notice. What the archive held was a free-text field on each work:
					4,181 distinct spellings over 37,934 works, from “Rijksmuseum” to
					“Paris, Musée du Louvre (inv. 3890)”. Reconciling the string rather
					than the work is what collapses the variants — the Rijksmuseum is
					named four ways here and is{' '}
					<Link to="/archive/collection/Q190804">Q190804</Link> every time — and
					it is why a collection now has a page of its own, listing the
					spellings it answers to and linking out so the claim can be checked
					rather than believed.
				</p>
				<p>
					Nothing was written on a name alone. A candidate had to be called what
					the archive calls it in some language, be the kind of thing that holds
					works, and sit in the right city, compared across every name that city
					has anywhere — which is what lets “Venedig” meet Venezia without a
					table of exonyms. Where more than one candidate survived all three,
					the group was refused rather than guessed at: 773 strings are held for
					review and 2,083 matched nothing, most of them private hands that have
					no identifier and never will. The tests earned their strictness. An
					earlier pass proposed a street plaque outside the old Bibliothèque
					nationale as the library itself, and was about to claim 254 works for
					it.
				</p>
				<p>
					None of this is verified. There are zero human confirmations on
					record, and the table that would hold them is empty for the same
					reason Levels II and III are empty above: it is the record of a person
					having checked, and no person has. Three identifiers are known to be
					wrong and excluded by hand; more are wrong and not yet known to be. A
					QID here is a machine’s claim, published because a checkable claim is
					worth more than a private one — not because it is settled.
				</p>
			</DocumentSection>

			<DocumentSection n="IV" heading="Register of corrections">
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
					<NoRecords>No correction is in the queue currently.</NoRecords>
				</div>
			</DocumentSection>

			<DocumentSection n="V" heading="Submitting a dispute">
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
