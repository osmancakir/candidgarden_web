import { invariantResponse } from '@epic-web/invariant'
import { Img } from 'openimg/react'
import {
	type LoaderFunctionArgs,
	Form,
	Link,
	useLoaderData,
} from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Data, Display } from '#app/components/institute/primitives.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { getUserImgSrc } from '#app/utils/misc.tsx'
import { useOptionalUser } from '#app/utils/user.ts'
import { type Route } from './+types/index.ts'

export async function loader({ params }: LoaderFunctionArgs) {
	const user = await prisma.user.findFirst({
		select: {
			id: true,
			name: true,
			username: true,
			createdAt: true,
			image: { select: { id: true, objectKey: true } },
		},
		where: {
			username: params.username,
		},
	})

	invariantResponse(user, 'User not found', { status: 404 })

	return { user, userJoinedDisplay: user.createdAt.toLocaleDateString() }
}

export default function ProfileRoute() {
	const data = useLoaderData<typeof loader>()
	const user = data.user
	const userDisplayName = user.name ?? user.username
	const loggedInUser = useOptionalUser()
	const isLoggedInUser = user.id === loggedInUser?.id

	return (
		<div className="container py-12 md:py-16">
			<header className="border-rule flex flex-wrap items-start gap-6 border-b pb-8">
				<Img
					src={
						data.user.image?.objectKey
							? getUserImgSrc(data.user.image.objectKey)
							: getUserImgSrc(null)
					}
					// This is the person's own portrait on their own record, not
					// decoration — it keeps a real accessible name.
					alt={userDisplayName}
					className="border-rule size-32 shrink-0 border object-cover"
					width={512}
					height={512}
				/>
				<div className="min-w-0 flex-1">
					<Data className="text-ground-muted mb-3 block tracking-[0.2em]">
						Contributor
					</Data>
					<Display as="h1" size="chapter" className="break-words">
						{userDisplayName}
					</Display>
					<Data className="text-ground-muted mt-3 block normal-case">
						@{user.username} · joined {data.userJoinedDisplay}
					</Data>
				</div>
			</header>

			<div className="mt-8 flex flex-wrap items-center gap-4">
				<Button asChild variant="outline">
					<Link to="notes" prefetch="intent">
						{isLoggedInUser ? 'My notes' : `${userDisplayName}'s notes`}
					</Link>
				</Button>
				{isLoggedInUser ? (
					<>
						<Button asChild variant="outline">
							<Link to="/settings/profile" prefetch="intent">
								Edit record
							</Link>
						</Button>
						<Form action="/logout" method="POST">
							<Button type="submit" variant="ghost">
								Log out
							</Button>
						</Form>
					</>
				) : null}
			</div>
		</div>
	)
}

export const meta: Route.MetaFunction = ({ data, params }) => {
	const displayName = data?.user.name ?? params.username
	return [
		{ title: `${displayName} · Candid Garden` },
		{
			name: 'description',
			content: `Contributor record for ${displayName} at the Institute for Machine Iconography.`,
		},
	]
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				404: ({ params }) => (
					<div className="flex flex-col gap-3">
						<p className="font-display text-chapter uppercase">
							No such contributor
						</p>
						<p className="font-data text-data text-stamp-fg tracking-widest uppercase">
							“{params.username}” is not on the register
						</p>
					</div>
				),
			}}
		/>
	)
}
