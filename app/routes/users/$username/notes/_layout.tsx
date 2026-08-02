import { invariantResponse } from '@epic-web/invariant'
import { Img } from 'openimg/react'
import { Link, NavLink, Outlet } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Data } from '#app/components/institute/primitives.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { cn, getUserImgSrc } from '#app/utils/misc.tsx'
import { useOptionalUser } from '#app/utils/user.ts'
import { type Route } from './+types/_layout.ts'

export async function loader({ params }: Route.LoaderArgs) {
	const owner = await prisma.user.findFirst({
		select: {
			id: true,
			name: true,
			username: true,
			image: { select: { objectKey: true } },
			notes: { select: { id: true, title: true } },
		},
		where: { username: params.username },
	})

	invariantResponse(owner, 'Owner not found', { status: 404 })

	return { owner }
}

export default function NotesRoute({ loaderData }: Route.ComponentProps) {
	const user = useOptionalUser()
	const isOwner = user?.id === loaderData.owner.id
	const ownerDisplayName = loaderData.owner.name ?? loaderData.owner.username
	// The notes sidebar is filed like the rest of the archive: a hairline-ruled
	// rail of records, mono, square, with the active one filled rather than
	// tinted.
	const navLinkDefaultClassName =
		'font-data text-data-sm block border-l-2 border-transparent py-2 pr-4 pl-4 tracking-wide no-underline transition-colors hover:text-link'
	return (
		<div className="container py-12 md:py-16">
			<div className="grid gap-8 md:grid-cols-12">
				<div className="md:col-span-4 lg:col-span-3">
					<Link
						to={`/users/${loaderData.owner.username}`}
						className="border-rule flex items-center gap-3 border-b pb-4 no-underline"
					>
						<Img
							src={getUserImgSrc(loaderData.owner.image?.objectKey)}
							alt=""
							aria-hidden
							className="border-rule size-12 shrink-0 border object-cover"
							width={192}
							height={192}
						/>
						<span className="min-w-0">
							<Data className="text-ground-muted block">Notes by</Data>
							<span className="font-body text-prose block truncate">
								{ownerDisplayName}
							</span>
						</span>
					</Link>

					<ul className="mt-4">
						{isOwner ? (
							<li>
								<NavLink
									to="new"
									className={({ isActive }) =>
										cn(
											navLinkDefaultClassName,
											'text-link uppercase',
											isActive && 'border-link',
										)
									}
								>
									<span aria-hidden>+ </span>New note
								</NavLink>
							</li>
						) : null}
						{loaderData.owner.notes.map((note) => (
							<li key={note.id}>
								<NavLink
									to={note.id}
									preventScrollReset
									prefetch="intent"
									className={({ isActive }) =>
										cn(
											navLinkDefaultClassName,
											'line-clamp-2',
											isActive ? 'border-link text-link' : 'text-ground-fg',
										)
									}
								>
									{note.title}
								</NavLink>
							</li>
						))}
						{loaderData.owner.notes.length === 0 && !isOwner ? (
							<li>
								<Data className="text-ground-muted block py-2">
									No notes on file
								</Data>
							</li>
						) : null}
					</ul>
				</div>

				<div className="md:col-span-8 lg:col-span-9">
					<Outlet />
				</div>
			</div>
		</div>
	)
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
