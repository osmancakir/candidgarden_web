import { generateRobotsTxt } from '@nasa-gcn/remix-seo'
import { getDomainUrl } from '#app/utils/misc.tsx'
import { type Route } from './+types/robots[.]txt.ts'

/** The package does not re-export this, so it is recovered from the signature. */
type RobotsPolicy = NonNullable<Parameters<typeof generateRobotsTxt>[0]>[number]

/**
 * Crawlers that get nothing but `Disallow: /`.
 *
 * These are not hypothetical. Over one 24h sample of the Worker logs, three of
 * them — AwarioBot, SemrushBot and MJ12bot — were ~48% of all traffic, against
 * a few dozen requests from real browsers. Every one of those hits is a
 * Hyperdrive round trip to a 1 GB RDS instance, so the crawl budget of a
 * backlink index was being paid for out of the archive's database.
 *
 * None of these bots sends traffic back. They index links to resell as SEO
 * metrics, or listen for brand mentions. Nothing in the archive's reach depends
 * on them, so the trade is entirely one-directional.
 *
 * Search engines proper — Googlebot, Bingbot, DuckDuckBot, Applebot — are
 * deliberately absent from this list and keep the `User-agent: *` grant above.
 *
 * robots.txt is a request, not a control. Semrush, Ahrefs and MJ12 do honour
 * it, generally within a day or two. The ones that do not are why the WAF rules
 * documented in `docs/bot-mitigation.md` exist; this file is the polite half of
 * the same policy, and the half that costs nothing to keep current.
 */
const deniedAgents = [
	// Backlink and SEO index crawlers, heaviest first as observed.
	'AwarioBot',
	'AwarioSmartBot',
	'AwarioRssBot',
	'SemrushBot',
	'SemrushBot-BA',
	'SemrushBot-SI',
	'SemrushBot-SWA',
	'MJ12bot',
	'AhrefsBot',
	'AhrefsSiteAudit',
	'DotBot',
	'SERankingBacklinksBot',
	'BLEXBot',
	'DataForSeoBot',
	'Barkrowler',
	'serpstatbot',
	'PetalBot',
	'SeekportBot',
	'ZoominfoBot',
	// Bulk AI-training corpora. Blocking these does not touch search ranking:
	// `Google-Extended` and `Applebot-Extended` are training opt-outs only, and
	// are read independently of Googlebot and Applebot.
	'GPTBot',
	'ClaudeBot',
	'CCBot',
	'Bytespider',
	'Google-Extended',
	'Applebot-Extended',
	'Meta-ExternalAgent',
	'Meta-ExternalFetcher',
	'Diffbot',
	'Omgilibot',
	'ImagesiftBot',
	'Timpibot',
	'Webzio-Extended',
] satisfies string[]

/**
 * Assistant fetchers, allowed on purpose.
 *
 * These fire when a person asks an assistant about a page and it goes to read
 * that one page — a reader arriving through a different door, not a corpus
 * being harvested. They are one request per question rather than a walk of
 * 54,497 dossiers, so they cost roughly what a browser costs.
 *
 * The `User-agent: *` group already permits them; the explicit grant is here so
 * that tightening the default later does not silently take them with it.
 */
const allowedAgents = [
	'ChatGPT-User',
	'OAI-SearchBot',
	'Claude-User',
	'Claude-SearchBot',
	'Perplexity-User',
] satisfies string[]

export function loader({ request }: Route.LoaderArgs) {
	return generateRobotsTxt([
		{ type: 'sitemap', value: `${getDomainUrl(request)}/sitemap.xml` },
		// /staedel-research is an unlisted working area holding one museum's
		// deliverable. It is not part of the archive and should not be indexed;
		// the routes also carry `noindex` in their own meta, since robots.txt is
		// a request and the meta tag is the one crawlers honour after arriving.
		// The area is behind a role check as well, so a crawler that ignores all
		// three gets a redirect to /login rather than the pages.
		{ type: 'disallow', value: '/staedel-research' },
		// Image transformations are metered, and crawlers gain nothing by walking
		// the resized variants — the plates they reach from archive pages are the
		// same images. Well-behaved bots honour this; the dimension allowlist in
		// `app/routes/resources/images.tsx` is what stops the rest.
		{ type: 'disallow', value: '/resources/images' },
		// The facet space, which is a crawl trap rather than a set of pages.
		//
		// Every index row carries up to twelve motif chips, so one page of the
		// archive offers ~720 filtered addresses, and the filters compose: motif ×
		// century × institution × category is a combinatorial surface no crawler
		// can finish and no reader asked to have indexed. Each of those addresses
		// is also a database query, which is how a link surface became an outage.
		//
		// `seed` is the worst of them — a deal is minted per day and `deal again`
		// mints more, so it enumerates without bound.
		//
		// `page` is deliberately absent from this list. The sitemap carries only
		// the static routes, so walking the paginated index is the only way a
		// crawler reaches the 54,497 dossiers; disallowing it would make the
		// archive undiscoverable rather than merely cheaper to crawl.
		{ type: 'disallow', value: '/*?*motif=' },
		{ type: 'disallow', value: '/*?*sense=' },
		{ type: 'disallow', value: '/*?*institution=' },
		{ type: 'disallow', value: '/*?*century=' },
		{ type: 'disallow', value: '/*?*category=' },
		{ type: 'disallow', value: '/*?*verification=' },
		{ type: 'disallow', value: '/*?*minAgreement=' },
		{ type: 'disallow', value: '/*?*sort=' },
		{ type: 'disallow', value: '/*?*seed=' },
		...deniedAgents.flatMap((agent): RobotsPolicy[] => [
			{ type: 'userAgent', value: agent },
			{ type: 'disallow', value: '/' },
		]),
		...allowedAgents.flatMap((agent): RobotsPolicy[] => [
			{ type: 'userAgent', value: agent },
			{ type: 'allow', value: '/' },
		]),
	])
}
