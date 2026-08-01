import { invariantResponse } from '@epic-web/invariant'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import {
	redirect,
	Form,
	Link,
	useFetcher,
	useSearchParams,
	useSubmit,
} from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Field } from '#app/components/forms.tsx'
import { Spacer } from '#app/components/spacer.tsx'
import { Button } from '#app/components/ui/button.tsx'
import {
	getAllCacheKeys,
	lruCache,
	searchCacheKeys,
} from '#app/utils/cache.server.ts'
import { useDebounce, useDoubleCheck } from '#app/utils/misc.tsx'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { type Route } from './+types/index.ts'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')
	const searchParams = new URL(request.url).searchParams
	const query = searchParams.get('query')
	if (query === '') {
		searchParams.delete('query')
		return redirect(`/admin/cache?${searchParams.toString()}`)
	}
	const limit = Number(searchParams.get('limit') ?? 100)

	const cacheKeys =
		typeof query === 'string'
			? searchCacheKeys(query, limit)
			: getAllCacheKeys(limit)
	return { cacheKeys }
}

export async function action({ request }: Route.ActionArgs) {
	await requireUserWithRole(request, 'admin')
	const formData = await request.formData()
	const key = formData.get('cacheKey')

	invariantResponse(typeof key === 'string', 'cacheKey must be a string')
	lruCache.delete(key)
	return { success: true }
}

export default function CacheAdminRoute({ loaderData }: Route.ComponentProps) {
	const [searchParams] = useSearchParams()
	const submit = useSubmit()
	const query = searchParams.get('query') ?? ''
	const limit = searchParams.get('limit') ?? '100'

	const handleFormChange = useDebounce(async (form: HTMLFormElement) => {
		await submit(form)
	}, 400)

	return (
		<div className="container">
			<h1 className="text-h1">Cache Admin</h1>
			<Spacer size="2xs" />
			<Form
				method="get"
				className="flex flex-col gap-4"
				onChange={(e) => handleFormChange(e.currentTarget)}
			>
				<div className="flex-1">
					<div className="flex flex-1 gap-4">
						<button
							type="submit"
							className="flex h-16 items-center justify-center"
						>
							🔎
						</button>
						<Field
							className="flex-1"
							labelProps={{ children: 'Search' }}
							inputProps={{
								type: 'search',
								name: 'query',
								defaultValue: query,
							}}
						/>
						<div className="text-muted-foreground flex h-16 w-14 items-center text-lg font-medium">
							<span title="Total results shown">
								{loaderData.cacheKeys.length}
							</span>
						</div>
					</div>
				</div>
				<div className="flex flex-wrap items-center gap-4">
					<Field
						labelProps={{
							children: 'Limit',
						}}
						inputProps={{
							name: 'limit',
							defaultValue: limit,
							type: 'number',
							step: '1',
							min: '1',
							max: '10000',
							placeholder: 'results limit',
						}}
					/>
				</div>
			</Form>
			<Spacer size="2xs" />
			<div className="flex flex-col gap-4">
				<h2 className="text-h2">In-memory cache:</h2>
				{loaderData.cacheKeys.map((key) => (
					<CacheKeyRow key={key} cacheKey={key} />
				))}
			</div>
		</div>
	)
}

function CacheKeyRow({ cacheKey }: { cacheKey: string }) {
	const fetcher = useFetcher<typeof action>()
	const dc = useDoubleCheck()
	const encodedKey = encodeURIComponent(cacheKey)
	const valuePage = `/admin/cache/lru/${encodedKey}`
	return (
		<div className="flex items-center gap-2 font-mono">
			<fetcher.Form method="POST">
				<input type="hidden" name="cacheKey" value={cacheKey} />
				<Button
					size="sm"
					variant="secondary"
					{...dc.getButtonProps({ type: 'submit' })}
				>
					{fetcher.state === 'idle'
						? dc.doubleCheck
							? 'You sure?'
							: 'Delete'
						: 'Deleting...'}
				</Button>
			</fetcher.Form>
			<Link reloadDocument to={valuePage}>
				{cacheKey}
			</Link>
		</div>
	)
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				403: ({ error }) => (
					<p>You are not allowed to do that: {error?.data.message}</p>
				),
			}}
		/>
	)
}
