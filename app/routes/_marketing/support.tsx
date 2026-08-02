import { Link } from 'react-router'
import {
	DocumentPage,
	DocumentSection,
} from '#app/components/institute/document.tsx'
import { Data } from '#app/components/institute/primitives.tsx'
import { type Route } from './+types/support.ts'

export const meta: Route.MetaFunction = () => [
	{ title: 'Correspondence · Candid Garden' },
	{
		name: 'description',
		content:
			'How to dispute a reading, report a broken record, or otherwise write to the Institute for Art Re-Search.',
	},
]

/** §7: "an open invitation to dispute readings". This page is that invitation,
 *  and it puts the dispute route above the support route deliberately. */
export default function SupportRoute() {
	return (
		<DocumentPage
			kind="Correspondence"
			title="Write to the institute"
			lead="We would rather hold a correction than a reading. Disputes are the most useful post we receive; please put them first."
		>
			<DocumentSection n={1} heading="Disputing a reading">
				<p>
					Cite the record number and the stamp printed beneath it, state what
					the machine got wrong, and say what you would put in its place. A
					dispute we accept is published against the record, in perpetuity, with
					your name on it — see the{' '}
					<Link to="/essays">register of corrections</Link>.
				</p>
				<p className="not-italic">
					<Data className="text-ground-muted">Address</Data>{' '}
					<a href="mailto:hey@candidgarden.com">hey@candidgarden.com</a>
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
