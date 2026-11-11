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
 *
 * Since November 2026 the charter is the studio's, not only the archive's.
 * What it promises about client work is restated from the homepage (the
 * services and the terms in `+home/content.ts`) rather than added here, so the
 * two cannot drift into promising different things. The archive keeps its own
 * sections, because the archive is where these rules are tested in public.
 */

export const meta: Route.MetaFunction = () => [
	{ title: 'Charter · Candid Garden' },
	{
		name: 'description',
		content:
			'The charter of Candid Garden, a research and software studio in Munich: how we treat machine output, model evaluation and a client’s material, and the rules of our own archive.',
	},
]

export default function AboutRoute() {
	return (
		<DocumentPage
			kind="Charter"
			title="What we hold ourselves to"
			lead="Candid Garden is a research and software studio in Munich. We build web and mobile applications, catalogue collections with machine vision, evaluate models and generate data — for clients, and for an archive of our own. This charter is the part of the work that does not change with the client. We are not a museum, and we are not confident on anyone’s behalf."
			stamp={
				<ProvenanceStamp
					date={new Date('2026-11-11T00:00:00Z')}
					verification="PENDING"
				/>
			}
		>
			<DocumentSection n={1} heading="Mission">
				<p>
					The interesting question about a machine’s output is rarely whether it
					is right. It is what the output reveals about the machine, and whether
					anyone downstream can still tell a claim from a fact. We build
					software that keeps that difference visible: every record a model
					writes is stamped with the model, the run and the date that produced
					it, and stays marked as machine-made until a person has checked it.
				</p>
				<p>
					Provenance is not decoration. In a catalogue it ages into a historical
					record of what models saw in pictures, and when. In a client’s system
					it is what lets the next person decide what to trust without having to
					ask us.
				</p>
			</DocumentSection>

			<DocumentSection n={2} heading="Evaluation">
				<p>
					When a client asks which model to trust, we answer on their material
					rather than on a benchmark. The sample is frozen before any model sees
					it, so it cannot drift toward the result. The prompts are disclosed.
					The outputs are scored blind — whoever judges them is not told which
					model wrote what — and each model’s cost is measured in the pilot,
					before anyone commits to a full run.
				</p>
			</DocumentSection>

			<DocumentSection n={3} heading="A client’s material">
				<p>
					A client’s holdings are theirs to publish. We do not show their
					records, images or results on this site or anywhere else without their
					say-so, which is why most of the work we can show is our own. Clients
					read their results here, in private areas opened per person.
				</p>
				<p>
					What we deliver is a file in the client’s system or code in their
					repository: no seats, no minimum term, no portal to keep paying for.
					Model and hosting costs are passed through without markup. Work is
					priced by the phase, and a client can stop after any phase and keep
					what was made.
				</p>
			</DocumentSection>

			<DocumentSection n={4} heading="The archive">
				<p>
					The <Link to="/archive">Candid Garden Archive</Link> is our own
					research collection, and the place where the rules above are tested in
					public. It holds the works of the ARTigo corpus, structured by Erwin
					Panofsky’s three levels of meaning, and presents what the machine made
					of them for scholarly correction.
				</p>
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

			<DocumentSection n={5} heading="Definitions">
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
					the archive is that number. It is not a model probability, it is not a
					confidence interval, and it is not a measure of truth. Two annotators
					can agree and both be wrong.
				</p>
				<p>
					<strong>We define a reading</strong> as an interpretive statement at
					Panofsky’s Level II or III. Every reading the archive holds was
					written by a machine, and says so beneath it, with the model and the
					corpus it came from. None has yet been checked by a person. See the{' '}
					<Link to="/glossary">glossary</Link> for the full vocabulary.
				</p>
			</DocumentSection>

			<DocumentSection n={6} heading="Method">
				<p>
					Each dossier descends through Panofsky’s three levels, and the page
					changes ground as it goes. Level I is inventory and looks like
					inventory. Level II is identification and looks like a catalogue
					entry. Level III is interpretation and looks like an exhibition. The
					design is an argument: the further you read, the less the archive can
					vouch for.
				</p>
			</DocumentSection>

			<DocumentSection n={7} heading="Corrections">
				<p>
					We invite dispute. If a reading in the archive is wrong — and some of
					them are — we would rather hold the correction than the reading. Write
					to us through the <Link to="/support">correspondence page</Link>, cite
					the record number and its stamp, and tell us what the machine got
					wrong. Notes that survive review are published against the record with
					the disputant credited.
				</p>
			</DocumentSection>

			<DocumentSection n={8} heading="Language">
				<p>
					We work in English and German. The institutional register translates
					naturally into German administrative prose, which is half the joke and
					all of the credibility. German parity on this site is planned and not
					yet delivered; this paragraph will be removed when it is.
				</p>
			</DocumentSection>
		</DocumentPage>
	)
}
