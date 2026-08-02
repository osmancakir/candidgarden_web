import { generateRobotsTxt } from '@nasa-gcn/remix-seo'
import { getDomainUrl } from '#app/utils/misc.tsx'
import { type Route } from './+types/robots[.]txt.ts'

export function loader({ request }: Route.LoaderArgs) {
	return generateRobotsTxt([
		{ type: 'sitemap', value: `${getDomainUrl(request)}/sitemap.xml` },
		// /stadel-research is an unlisted working area holding one museum's
		// deliverable. It is not part of the archive and should not be indexed;
		// the routes also carry `noindex` in their own meta, since robots.txt is
		// a request and the meta tag is the one crawlers honour after arriving.
		{ type: 'disallow', value: '/stadel-research' },
	])
}
