import { Link } from 'react-router'
import { DocumentPage, Glossary } from '#app/components/institute/document.tsx'
import { type Route } from './+types/glossary.ts'

/**
 * §8: "A /glossary page (CARI) defines the project's terms, including
 * Panofsky's, in plain language."
 *
 * The German column is not ornament — §7 asks for DE/EN parity, and an
 * iconography project inherits its vocabulary from German-language scholarship
 * anyway. Giving each term its German original is the most honest form the
 * parity can take before the site is fully translated.
 */

export const meta: Route.MetaFunction = () => [
	{ title: 'Glossary · Candid Garden' },
	{
		name: 'description',
		content:
			'Definitions of the terms used in the Candid Garden archive, including Panofsky’s three levels of meaning, in plain language.',
	},
]

export default function GlossaryRoute() {
	return (
		<DocumentPage
			kind="Glossary"
			title="Terms used in this archive"
			lead="Defined in plain language, in the sense this institute uses them. Where a term comes from German-language scholarship, the original is given; where our use is narrower than the scholarly one, we say so."
		>
			<Glossary
				entries={[
					{
						term: 'Iconography',
						German: 'Ikonographie',
						definition: (
							<>
								The identification of the subjects depicted in a work — this is
								Judith, that is a vanitas. It answers <em>what is shown</em>.
								Panofsky’s Level II.
							</>
						),
					},
					{
						term: 'Iconology',
						German: 'Ikonologie',
						definition: (
							<>
								The interpretation of what a work meant within the culture that
								produced it: its symptomatic content, the assumptions it carries
								without stating. It answers <em>what it meant</em>. Panofsky’s
								Level III, and the level this archive is least able to supply.
							</>
						),
					},
					{
						term: 'Pre-iconographic',
						German: 'Vorikonographisch',
						definition: (
							<>
								Description before interpretation: shapes, figures, objects,
								gestures, named without reference to what they signify. A woman
								holding a severed head, not yet Judith. Panofsky’s Level I, and
								the only level this archive can populate from data alone.
							</>
						),
					},
					{
						term: 'Motif',
						German: 'Bildmotiv',
						definition: (
							<>
								A discrete depicted element that an annotator named when looking
								at a work. A claim about what is present, not about what it
								means. Every chip in this archive is a motif; clicking one
								filters the index by it.
							</>
						),
					},
					{
						term: 'Agreement',
						definition: (
							<>
								How many annotations applied a motif to a work, normalised
								against that work’s strongest motif. The superscript on every
								chip. <strong>It is not a confidence score</strong>: the model
								does not report its certainty here, and a high agreement figure
								means many annotators said the same thing, not that they were
								right.
							</>
						),
					},
					{
						term: 'Record',
						German: 'Datensatz',
						definition: (
							<>
								One work and everything the archive holds about it. Every record
								carries a stamp: the date its metadata was generated, the model
								that generated it, and the run number.
							</>
						),
					},
					{
						term: 'Dossier',
						definition: (
							<>
								The page for a single record, structured as a descent through
								the three levels. See any work in the <Link to="/">index</Link>.
							</>
						),
					},
					{
						term: 'Provenance stamp',
						definition: (
							<>
								The bordered red block on each dossier, naming dataset, model,
								run and human-verification status. It borrows the form of a
								print-room collection stamp — a mark applied <em>to</em> the
								archive rather than part of the interface.
							</>
						),
					},
					{
						term: 'Ground',
						definition: (
							<>
								The background a section is set on: <em>paper</em>,{' '}
								<em>slate</em>, or <em>void</em>. In a dossier the ground
								changes with the Panofsky level. The control in the masthead
								chooses which ground the site rests on.
							</>
						),
					},
					{
						term: 'ARTigo',
						definition: (
							<>
								The source dataset: a games-with-a-purpose project that
								collected image annotations for artworks from human players.
								Every human annotation in this archive originates there.
							</>
						),
					},
					{
						term: 'Unreviewed',
						definition: (
							<>
								No human has checked the attribution on this record. It is the
								default state and it is not a defect; the archive is larger than
								its reviewers.
							</>
						),
					},
				]}
			/>
		</DocumentPage>
	)
}
