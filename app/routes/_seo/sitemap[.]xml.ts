import { getDomainUrl } from '#app/utils/misc.tsx'
import { type Route } from './+types/sitemap[.]xml.ts'
import { chunkCount, sitemapIndex } from './sitemap-data.server.ts'

/**
 * The index of sitemaps. A sitemap index may contain sitemaps and nothing else,
 * so the static pages get a file of their own rather than being listed here
 * beside the work chunks.
 */
export async function loader({ request }: Route.LoaderArgs) {
	const origin = getDomainUrl(request)
	const chunks = await chunkCount()
	return sitemapIndex(origin, [
		'/sitemap/pages.xml',
		...Array.from({ length: chunks }, (_, i) => `/sitemap/works/${i + 1}.xml`),
	])
}
