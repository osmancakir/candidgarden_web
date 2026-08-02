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
import {
	Data,
	Display,
	NoRecords,
} from '#app/components/institute/primitives.tsx'
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
		<div className="container py-12 md:py-16">
			<header className="border-rule border-b pb-6">
				<Data className="text-ground-muted mb-3 block tracking-[0.2em]">
					Instrumentation
				</Data>
				<Display as="h1" size="chapter">
					Cache
				</Display>
			</header>

			<Form
				method="get"
				role="search"
				className="border-rule mt-8 border"
				onChange={(e) => handleFormChange(e.currentTarget)}
			>
				<div className="border-rule bg-tint flex flex-wrap items-baseline justify-between gap-4 border-b px-4 py-2">
					<Data className="tracking-[0.2em]">Key search</Data>
					<Data className="text-ground-muted normal-case">
						{loaderData.cacheKeys.length} keys shown
					</Data>
				</div>
				<div className="grid gap-x-6 p-4 sm:grid-cols-2">
					<Field
						labelProps={{ children: 'Query' }}
						inputProps={{
							type: 'search',
							name: 'query',
							defaultValue: query,
						}}
					/>
					<Field
						labelProps={{ children: 'Limit' }}
						inputProps={{
							name: 'limit',
							defaultValue: limit,
							type: 'number',
							step: '1',
							min: '1',
							max: '10000',
						}}
					/>
				</div>
			</Form>

			<section className="mt-10">
				<Data className="text-ground-muted mb-3 block tracking-[0.2em]">
					In-memory cache
				</Data>
				{loaderData.cacheKeys.length ? (
					<div className="border-rule border-t">
						{loaderData.cacheKeys.map((key) => (
							<CacheKeyRow key={key} cacheKey={key} />
						))}
					</div>
				) : (
					<NoRecords>No keys match that query</NoRecords>
				)}
			</section>
		</div>
	)
}

function CacheKeyRow({ cacheKey }: { cacheKey: string }) {
	const fetcher = useFetcher<typeof action>()
	const dc = useDoubleCheck()
	const encodedKey = encodeURIComponent(cacheKey)
	const valuePage = `/admin/cache/lru/${encodedKey}`
	return (
		<div className="border-rule flex flex-wrap items-center gap-x-4 gap-y-2 border-b py-2">
			<Link
				reloadDocument
				to={valuePage}
				className="font-data text-data hover:text-link min-w-0 flex-1 break-all"
			>
				{cacheKey}
			</Link>
			<fetcher.Form method="POST" className="shrink-0">
				<input type="hidden" name="cacheKey" value={cacheKey} />
				<Button
					size="sm"
					variant={dc.doubleCheck ? 'destructive' : 'ghost'}
					{...dc.getButtonProps({ type: 'submit' })}
				>
					{fetcher.state === 'idle'
						? dc.doubleCheck
							? 'Confirm'
							: 'Evict'
						: 'Evicting…'}
				</Button>
			</fetcher.Form>
		</div>
	)
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				403: ({ error }) => (
					<p className="font-data text-data text-stamp-fg tracking-widest uppercase">
						Not permitted · {error?.data.message}
					</p>
				),
			}}
		/>
	)
}
