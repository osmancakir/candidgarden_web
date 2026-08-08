import { getDomainUrl } from '#app/utils/misc.tsx'
import { type Route } from './+types/sitemap.pages[.]xml.ts'
import {
	collectionPaths,
	STATIC_PATHS,
	urlSet,
} from './sitemap-data.server.ts'

/** Everything that is a page rather than a work: the essays, and the holders. */
export async function loader({ request }: Route.LoaderArgs) {
	const origin = getDomainUrl(request)
	return urlSet(origin, [...STATIC_PATHS, ...(await collectionPaths())])
}
