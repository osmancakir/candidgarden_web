import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { buildDeck } from './+shared/deck.ts'
import { figures, scoreboards } from './+shared/figures.server.ts'
import { DeckPlayer } from './+shared/player.tsx'
import { type Route } from './+types/index.ts'

/**
 * The prospectus: what Candid Garden sells, as a deck.
 *
 * This is the pitch for an institution spending its own money. Its sibling at
 * `/prospectus/funding` makes the same offer to an institution that has to win
 * the money first, which in this market is the commoner case; the two share a
 * player, a set of figures and about a third of their slides.
 *
 * Unlisted rather than gated. A prospective customer has no account here, so a
 * role check would be the wrong instrument — but the archive's own rule is that
 * nothing markets itself between a visitor and the research material, so this
 * page is kept out of the sitemap and out of the index and reaches people the
 * way a proposal does: because someone sent it to them.
 */

// Unlisted: sitemap-data.server.ts keeps a hand-written path list this is
// absent from, and this opts out of the generated entries as well, so neither
// road to a sitemap passes through here.
export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Prospectus · Candid Garden' },
	{ name: 'robots', content: 'noindex, nofollow' },
	{
		name: 'description',
		content:
			'What Candid Garden offers museums and collections: catalogue audits, model evaluation pilots, iconographic enrichment, semantic search and identifiers.',
	},
]

export async function loader() {
	return { figures: figures(), scoreboards: scoreboards() }
}

/**
 * The deck is a pure function of the frozen pilot run, so moving between slides
 * has nothing to fetch. Without this, every arrow key would put a request on
 * the wire — which is exactly the moment, mid-sentence in front of a room, when
 * a hotel wifi is least worth trusting.
 */
export function shouldRevalidate() {
	return false
}

export default function ProspectusRoute({ loaderData }: Route.ComponentProps) {
	return (
		<DeckPlayer
			slides={buildDeck(loaderData.figures)}
			scoreboards={loaderData.scoreboards}
			kind={{ de: 'Leistungsübersicht', en: 'Prospectus' }}
		/>
	)
}
