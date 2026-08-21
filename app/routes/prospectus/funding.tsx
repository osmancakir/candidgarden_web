import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { figures, scoreboards } from './+shared/figures.server.ts'
import { buildGrantDeck } from './+shared/grant-deck.ts'
import { DeckPlayer } from './+shared/player.tsx'
import { type Route } from './+types/funding.ts'

/**
 * The funding pitch, for an institution that has to win the money first.
 *
 * A separate address rather than a mode of `/prospectus`, because it is sent to
 * a different person for a different reason and both links get pasted into
 * emails that outlive the meeting. `?deck=grant` would have made the two decks
 * one page wearing two hats, and the wrong hat would eventually be shown to the
 * wrong room.
 *
 * Everything below the argument is shared: the same player, the same figures out
 * of the same frozen run, and six slides taken from the direct deck by reference
 * rather than by copy.
 */

// Unlisted, like its sibling. See `index.tsx` for why this is not role-gated.
export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Förderantrag · Candid Garden' },
	{ name: 'robots', content: 'noindex, nofollow' },
	{
		name: 'description',
		content:
			'Candid Garden as the technical partner in a cataloguing funding application: the audit as feasibility study, blind evaluation as the quality criterion, and six work packages.',
	},
]

export async function loader() {
	return { figures: figures(), scoreboards: scoreboards() }
}

/** Pure data, same as the direct deck — nothing to refetch between slides. */
export function shouldRevalidate() {
	return false
}

export default function FundingProspectusRoute({
	loaderData,
}: Route.ComponentProps) {
	return (
		<DeckPlayer
			slides={buildGrantDeck(loaderData.figures)}
			scoreboards={loaderData.scoreboards}
			kind={{ de: 'Förderantrag', en: 'Funding application' }}
		/>
	)
}
