import { data } from 'react-router'
import { ArchiveIndexView } from '#app/routes/archive/+shared/index-view.tsx'
import { pipeHeaders } from '#app/utils/headers.server.ts'
import { makeTimings, time } from '#app/utils/timing.server.ts'
import { loadIndex } from './+shared/index-data.server.ts'
import { type Route } from './+types/index.ts'

export const meta: Route.MetaFunction = () => [
	{ title: 'Index · Candid Garden' },
	{
		name: 'description',
		content:
			'The Candid Garden index: 66,000 works from the ARTigo corpus with machine-generated iconographic metadata, filterable by motif, subject class, period, collection and verification status.',
	},
]

export async function loader({ request }: Route.LoaderArgs) {
	const timings = makeTimings('archive index')
	const url = new URL(request.url)
	const result = await time(() => loadIndex(url, timings), {
		timings,
		type: 'loadIndex',
		desc: 'query the archive index',
	})
	return data(result, {
		headers: { 'Server-Timing': timings.toString() },
	})
}

export const headers: Route.HeadersFunction = pipeHeaders

export default function ArchiveIndex({ loaderData }: Route.ComponentProps) {
	return <ArchiveIndexView data={loaderData} />
}
