import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { Outlet } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Data } from '#app/components/institute/primitives.tsx'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { PilotNav } from './+shared/components.tsx'
import { type Route } from './+types/_layout.ts'

// Gated by the role check below, so it must not be advertised in sitemap.xml.
// remix-seo includes every static route unless told otherwise, and each route
// beneath this one repeats the opt-out — the layout's handle does not cover
// its children.
export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

/**
 * The Städel working area.
 *
 * These four routes are not part of the archive's argument — they are a
 * deliverable for one museum, presented in the Institute register because that
 * is the house style, but stamped as what they are: an unlisted working area
 * carrying one dated experiment. §7 asks for the deadpan institutional voice
 * and for gaps to be stated plainly; a page that quietly looked like the rest
 * of the site would be neither.
 *
 * The pages themselves are pure functions of a frozen run on disk — the only
 * database read in the area is the role check below. Access is not by obscurity
 * but by named account: the gate lives on the layout, so every route beneath it
 * inherits it and no child can be reached by typing its path directly.
 *
 * No register is declared here on purpose. These pages inherit the reader's
 * resting ground — paper under GROUND PAPER, void under GROUND VOID — and every
 * class beneath is register-relative, so the whole area follows the masthead
 * instead of pinning itself to one ground and stranding the theme toggle.
 */
export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'researcher')
	return null
}

export default function StadelResearchLayout() {
	return (
		<div className="flex min-h-full flex-col">
			<div className="border-rule bg-tint border-b">
				<div className="container flex flex-wrap items-center justify-between gap-x-8 gap-y-3 py-3">
					<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
						<Data className="tracking-[0.2em]">Städel Museum</Data>
						<Data className="text-ground-muted">
							Graphische Sammlung · working area
						</Data>
					</div>
					<Data className="text-ground-muted normal-case">
						Unlisted and unindexed. Access by named account only.
					</Data>
				</div>
			</div>
			<div className="border-rule container border-b py-3">
				<PilotNav />
			</div>
			<Outlet />
		</div>
	)
}

/**
 * A signed-in reader without the role gets 403 here rather than at the root.
 * Without a boundary on this route the thrown 403 bubbles past the layout and
 * the document goes out as a 500, which reads as a broken site rather than a
 * closed door.
 */
export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				403: () => (
					<p className="font-data text-data text-stamp-fg tracking-widest uppercase">
						Not permitted · this working area is issued to named accounts
					</p>
				),
			}}
		/>
	)
}
