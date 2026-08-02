import {
	DocumentPage,
	DocumentSection,
} from '#app/components/institute/document.tsx'
import { type Route } from './+types/privacy.ts'

export const meta: Route.MetaFunction = () => [
	{ title: 'Privacy · Candid Garden' },
	{
		name: 'description',
		content:
			'What the Institute for Art Re-Search records about its readers, and what it does not.',
	},
]

/** §7: state, never sell. A privacy page in the institutional register is just
 *  a list of what is held and why. */
export default function PrivacyRoute() {
	return (
		<DocumentPage
			kind="Notice"
			title="What we record about you"
			lead="This institute keeps records about pictures. It keeps as few as it can about readers. What follows is the complete list."
		>
			<DocumentSection n={1} heading="Accounts">
				<p>
					If you hold an account, we store the name and email address you gave
					us, a hash of your password, and any passkeys or connected identity
					providers you chose to register. We store the sessions that keep you
					signed in. We do not store your password.
				</p>
			</DocumentSection>

			<DocumentSection n={2} heading="Reading the archive">
				<p>
					Browsing the index and opening dossiers requires no account and
					produces no profile. Filter state lives in the URL, which is the point
					— a view of the archive should be citable — and not in a record of
					what you looked at.
				</p>
				<p>
					Search terms submitted to the archive may be retained in aggregate to
					show us which parts of the corpus readers cannot find. They are not
					connected to accounts.
				</p>
			</DocumentSection>

			<DocumentSection n={3} heading="Preferences">
				<p>
					Your choice of ground — paper, void, or automatic — is stored in a
					cookie so the site does not forget it between visits. It is a display
					preference and nothing else reads it.
				</p>
			</DocumentSection>

			<DocumentSection n={4} heading="Errors">
				<p>
					When something breaks, we record the failure so we can fix it. Those
					reports may include the page you were on and the shape of the error.
					We do not attach them to your identity where we can avoid it.
				</p>
			</DocumentSection>

			<DocumentSection n={5} heading="Getting it back, or getting rid of it">
				<p>
					Account holders can download everything we hold about them, and can
					delete the account outright, from the profile settings. Deletion is
					deletion; we do not keep a shadow copy.
				</p>
			</DocumentSection>
		</DocumentPage>
	)
}
