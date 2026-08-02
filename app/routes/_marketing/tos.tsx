import { Link } from 'react-router'
import {
	DocumentPage,
	DocumentSection,
} from '#app/components/institute/document.tsx'
import { type Route } from './+types/tos.ts'

export const meta: Route.MetaFunction = () => [
	{ title: 'Terms · Candid Garden' },
	{
		name: 'description',
		content:
			'Terms of use for the Candid Garden archive, including attribution guidelines for citing machine-generated readings.',
	},
]

/** CARI's attribution ethics, in this institute's voice (§1, §7). */
export default function TermsOfServiceRoute() {
	return (
		<DocumentPage
			kind="Terms"
			title="Terms of use and attribution"
			lead="Use the archive. Cite it accurately. Do not represent a machine reading as a scholarly one."
		>
			<DocumentSection n={1} heading="Use">
				<p>
					The metadata published here may be quoted, linked, analysed and
					redistributed for research, teaching and criticism. You do not need
					our permission and you will not be asked to register for it.
				</p>
			</DocumentSection>

			<DocumentSection n={2} heading="Attribution">
				<p>
					When you cite a record, cite its stamp. A reading without its model
					and date is not a citation of this archive; it is a rumour about it.
					The form we ask for is:
				</p>
				<p>
					<cite>
						Candid Garden, record #1042, motif “garden” (agreement 0.87),
						generated 03/14/26 by claude-sonnet-4-6, run 118.
					</cite>
				</p>
				<p>
					Do not attribute a Level I motif to a scholar, a museum, or the ARTigo
					project. Motifs are machine and crowd output; the{' '}
					<Link to="/glossary">glossary</Link> says exactly what each figure
					means and does not mean.
				</p>
			</DocumentSection>

			<DocumentSection n={3} heading="Images">
				<p>
					Artwork images are reproduced for research purposes and remain subject
					to the rights of their holding institutions. Nothing in these terms
					grants you rights in an image. Where a work’s collection is recorded,
					it is shown on the dossier; direct rights enquiries there.
				</p>
			</DocumentSection>

			<DocumentSection n={4} heading="Warranty">
				<p>
					There is none. This archive publishes machine output that it expects
					to be wrong in places, and says so on every page that carries it. Do
					not make decisions of consequence on the basis of a reading you have
					not checked.
				</p>
			</DocumentSection>

			<DocumentSection n={5} heading="Accounts">
				<p>
					Accounts exist so that annotations and disputes can be credited. We
					may close an account that is used to vandalise the record. We will say
					why.
				</p>
			</DocumentSection>
		</DocumentPage>
	)
}
