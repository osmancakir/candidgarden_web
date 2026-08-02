import { data } from 'react-router'
import { loadIndex } from '#app/routes/archive/+shared/index-data.server.ts'
import { ArchiveIndexView } from '#app/routes/archive/+shared/index-view.tsx'
import { pipeHeaders } from '#app/utils/headers.server.ts'
import { makeTimings, time } from '#app/utils/timing.server.ts'
import { type Route } from './+types/index.ts'

/**
 * §5: "The index is the homepage."
 *
 * Candid Garden opens with the archive, not with a hero — so `/` renders the
 * same view as `/archive` rather than a landing page that points at it. One
 * implementation, two addresses; the institutional statement that would have
 * been the hero is the paragraph at the top of the index.
 */

export const meta: Route.MetaFunction = () => [
	{ title: 'Candid Garden · Institute for Machine Iconography' },
	{
		name: 'description',
		content:
			'Machine-generated iconographic metadata for 66,000 works from the ARTigo corpus, structured by Panofsky’s three levels of meaning and presented for scholarly correction.',
	},
]

export async function loader({ request }: Route.LoaderArgs) {
	const timings = makeTimings('index')
	const url = new URL(request.url)
	const result = await time(() => loadIndex(url, timings), {
		timings,
		type: 'loadIndex',
		desc: 'query the archive index',
	})
	return data(result, { headers: { 'Server-Timing': timings.toString() } })
}

export const headers: Route.HeadersFunction = pipeHeaders

export default function Index({ loaderData }: Route.ComponentProps) {
	return <ArchiveIndexView data={loaderData} />
}
