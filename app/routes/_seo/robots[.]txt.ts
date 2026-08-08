import { generateRobotsTxt } from '@nasa-gcn/remix-seo'
import { getDomainUrl } from '#app/utils/misc.tsx'
import { type Route } from './+types/robots[.]txt.ts'

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
	])
}
