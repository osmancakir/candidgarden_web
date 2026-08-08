import { invariantResponse } from '@epic-web/invariant'
import { getDomainUrl } from '#app/utils/misc.tsx'
import { type Route } from './+types/sitemap.works.$chunk[.]xml.ts'
import { chunkCount, urlSet, workIds } from './sitemap-data.server.ts'

/**
 * One chunk of the archive's dossiers.
 *
 * The chunk is validated against the count rather than trusted, because the
 * number in the path is reachable by hand and an unchecked one is an invitation
 * to ask for `/sitemap/works/99999.xml` — which would otherwise cost a database
 * round trip to answer with an empty file, once per guess.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
	const chunk = Number(params.chunk)
	const chunks = await chunkCount()
	invariantResponse(
		Number.isInteger(chunk) && chunk >= 1 && chunk <= chunks,
		'Not found',
		{ status: 404 },
	)

	const origin = getDomainUrl(request)
	const ids = await workIds(chunk)
	return urlSet(
		origin,
		ids.map((id) => `/archive/${id}`),
	)
}
