import { Link } from 'react-router'
import {
	DocumentPage,
	DocumentSection,
} from '#app/components/institute/document.tsx'
import { ProvenanceStamp } from '#app/components/institute/primitives.tsx'
import { type Route } from './+types/about.ts'

/**
 * §7: "The About page is written as an institute charter — mission,
 * definitions, selection criteria, and an open invitation to dispute readings."
 * First-person plural, deadpan, quietly witty; nothing here sells.
 */

export const meta: Route.MetaFunction = () => [
	{ title: 'Charter · Candid Garden' },
	{
		name: 'description',
		content:
			'The charter of the Institute for Art Re-Search: mission, definitions, selection criteria, and the standing invitation to dispute our readings.',
	},
]

export default function AboutRoute() {
	return (
		<DocumentPage
			kind="Charter"
			title="Institute for Art Re-Search"
			lead="Candid Garden is a research project. It publishes machine-generated iconographic metadata for works in the ARTigo corpus, structured by Erwin Panofsky’s three levels of meaning, and presents that metadata for scholarly correction. We are not a museum, we are not a product, and we are not confident."
			stamp={
				<ProvenanceStamp
					date={new Date('2026-03-14T00:00:00Z')}
					verification="PENDING"
				/>
			}
		>
			<DocumentSection n={1} heading="Mission">
				<p>
					We hold that the interesting question about a machine reading of a
					painting is not whether it is right. It is what the reading reveals
					about the reader. Candid Garden therefore publishes the machine’s
					output in full — including where it is thin, contested, or plainly
					wrong — alongside the human annotations it was measured against, and
					stamps every record with the model and date that produced it.
				</p>
				<p>
					In an archive of machine-generated metadata, provenance is not
					decoration. It ages into a historical record of what models saw in
					pictures, and when.
				</p>
			</DocumentSection>

			<DocumentSection n={2} heading="Definitions">
				<p>
					<strong>Candid Garden defines a motif</strong> as a discrete depicted
					element that an annotator — human or machine — named when looking at a
					work: a garden, a putto, a fold of drapery. A motif is a claim about
					what is <em>there</em>, not about what it means.
				</p>
				<p>
					<strong>We define agreement</strong> as the number of annotations that
					applied a given motif to a given work, normalised against the
					strongest motif on that work. The superscript figure on every chip in
					this archive is that number. It is not a model probability, it is not
					a confidence interval, and it is not a measure of truth. Two
					annotators can agree and both be wrong.
				</p>
				<p>
					<strong>We define a reading</strong> as an interpretive statement at
					Panofsky’s Level II or III. The archive currently holds none. Where a
					dossier says so, that is the record being accurate, not the site being
					broken. See the <Link to="/glossary">glossary</Link> for the full
					vocabulary.
				</p>
			</DocumentSection>

			<DocumentSection n={3} heading="Selection criteria">
				<p>
					A work enters the archive if it is present in the ARTigo dataset, has
					a recoverable image, and carries at least one annotation. We do not
					select for quality, canonicity, or visual appeal. Works with no motifs
					on record are retained and displayed as such: an empty record is
					evidence about the corpus, and hiding it would misrepresent the
					collection’s shape.
				</p>
				<p>
					We do not crop artworks to fit our layouts. Everything is shown at its
					true proportions, on whatever ground the level calls for.
				</p>
			</DocumentSection>

			<DocumentSection n={4} heading="Method">
				<p>
					Each dossier descends through Panofsky’s three levels, and the page
					changes ground as it goes. Level I is inventory and looks like
					inventory. Level II is identification and looks like a catalogue
					entry. Level III is interpretation and looks like an exhibition. The
					design is an argument: the further you read, the less the archive can
					vouch for.
				</p>
			</DocumentSection>

			<DocumentSection n={5} heading="Corrections">
				<p>
					We invite dispute. If a reading in this archive is wrong — and some of
					them are — we would rather hold the correction than the reading. Write
					to us through the <Link to="/support">correspondence page</Link>, cite
					the record number and its stamp, and tell us what the machine got
					wrong. Notes that survive review are published against the record with
					the disputant credited.
				</p>
			</DocumentSection>

			<DocumentSection n={6} heading="Language">
				<p>
					The institutional register translates naturally into German
					administrative prose, which is half the joke and all of the
					credibility. German parity is planned and not yet delivered; this
					paragraph will be removed when it is.
				</p>
			</DocumentSection>
		</DocumentPage>
	)
}
