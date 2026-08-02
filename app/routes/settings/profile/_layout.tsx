import { invariantResponse } from '@epic-web/invariant'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { Link, Outlet, useMatches } from 'react-router'
import { z } from 'zod'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { cn } from '#app/utils/misc.tsx'
import { useUser } from '#app/utils/user.ts'
import { type Route } from './+types/_layout.tsx'

export const BreadcrumbHandle = z.object({ breadcrumb: z.any() })
export type BreadcrumbHandle = z.infer<typeof BreadcrumbHandle>

export const handle: BreadcrumbHandle & SEOHandle = {
	breadcrumb: 'Record',
	getSitemapEntries: () => null,
}

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { username: true },
	})
	invariantResponse(user, 'User not found', { status: 404 })
	return {}
}

const BreadcrumbHandleMatch = z.object({
	handle: BreadcrumbHandle,
})

export default function EditUserProfile() {
	const user = useUser()
	const matches = useMatches()
	const breadcrumbs = matches
		.map((m) => {
			const result = BreadcrumbHandleMatch.safeParse(m)
			if (!result.success || !result.data.handle.breadcrumb) return null
			return (
				<Link key={m.id} to={m.pathname} className="flex items-center">
					{result.data.handle.breadcrumb}
				</Link>
			)
		})
		.filter(Boolean)

	return (
		<div className="container py-12 md:py-16">
			{/* A filing path, not a breadcrumb trail with chevrons — the machine
			    telling you which drawer you have open. */}
			<nav aria-label="Breadcrumb" className="border-rule border-b pb-3">
				<ol className="font-data text-data-sm flex flex-wrap items-center gap-2 tracking-[0.12em] uppercase">
					<li>
						<Link
							className="text-ground-muted hover:text-link no-underline hover:underline"
							to={`/users/${user.username}`}
						>
							{user.username}
						</Link>
					</li>
					{breadcrumbs.map((breadcrumb, i, arr) => (
						<li
							key={i}
							className={cn(
								'flex items-center gap-2',
								i < arr.length - 1 && 'text-ground-muted',
							)}
						>
							<span aria-hidden className="text-ground-muted opacity-50">
								/
							</span>
							{breadcrumb}
						</li>
					))}
				</ol>
			</nav>
			<div className="mt-10 max-w-3xl">
				<Outlet />
			</div>
		</div>
	)
}
