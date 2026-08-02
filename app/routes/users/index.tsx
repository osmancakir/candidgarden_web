import { Img } from 'openimg/react'
import { redirect, Link } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { ErrorList } from '#app/components/forms.tsx'
import {
	Data,
	Display,
	LoadingRecords,
	NoRecords,
} from '#app/components/institute/primitives.tsx'
import { SearchBar } from '#app/components/search-bar.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { cn, getUserImgSrc, useDelayedIsPending } from '#app/utils/misc.tsx'
import { type Route } from './+types/index.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const searchTerm = new URL(request.url).searchParams.get('search')
	if (searchTerm === '') {
		return redirect('/users')
	}

	const like = `%${searchTerm ?? ''}%`
	const users = await prisma.$queryRaw<
		Array<{
			id: string
			username: string
			name: string | null
			imageId: string | null
			imageObjectKey: string | null
		}>
	>`
		SELECT
			"User"."id",
			"User"."username",
			"User"."name",
			"UserImage"."id" AS "imageId",
			"UserImage"."objectKey" AS "imageObjectKey"
		FROM "User"
		LEFT JOIN "UserImage" ON "User"."id" = "UserImage"."userId"
		WHERE "User"."username" ILIKE ${like}
			OR "User"."name" ILIKE ${like}
		ORDER BY (
			SELECT "Note"."updatedAt"
			FROM "Note"
			WHERE "Note"."ownerId" = "User"."id"
			ORDER BY "Note"."updatedAt" DESC
			LIMIT 1
		) DESC
		LIMIT 50
	`
	return { status: 'idle', users } as const
}

export default function UsersRoute({ loaderData }: Route.ComponentProps) {
	const isPending = useDelayedIsPending({
		formMethod: 'GET',
		formAction: '/users',
	})

	return (
		<div className="container py-12 md:py-16">
			<header className="border-rule border-b pb-6">
				<Data className="text-ground-muted mb-3 block tracking-[0.2em]">
					Register
				</Data>
				<Display as="h1" size="chapter">
					Contributors
				</Display>
				<p className="font-body text-prose-lg measure mt-4">
					Everyone who holds an account with the institute. Annotations and
					disputes are credited here.
				</p>
			</header>

			<div className="mt-6 max-w-xl">
				<SearchBar status={loaderData.status} autoFocus autoSubmit />
			</div>

			<div className="mt-10">
				{loaderData.status === 'idle' ? (
					loaderData.users.length ? (
						<ul
							className={cn(
								'border-rule grid border-t sm:grid-cols-2 lg:grid-cols-3',
								isPending && 'opacity-50',
							)}
						>
							{loaderData.users.map((user) => (
								<li key={user.id} className="border-rule border-b">
									<Link
										to={user.username}
										className="hover:bg-tint flex items-center gap-4 p-4 no-underline transition-colors"
										aria-label={`${user.name || user.username} profile`}
									>
										<Img
											alt=""
											aria-hidden
											src={getUserImgSrc(user.imageObjectKey)}
											className="border-rule size-12 shrink-0 border object-cover"
											width={192}
											height={192}
										/>
										<span className="min-w-0">
											{user.name ? (
												<span className="font-body text-prose block truncate">
													{user.name}
												</span>
											) : null}
											<span className="font-data text-data-sm text-ground-muted block truncate tracking-wide">
												{user.username}
											</span>
										</span>
									</Link>
								</li>
							))}
						</ul>
					) : (
						<NoRecords>No contributors match that query</NoRecords>
					)
				) : loaderData.status === 'error' ? (
					<ErrorList errors={['There was an error parsing the results']} />
				) : (
					<LoadingRecords />
				)}
			</div>
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
