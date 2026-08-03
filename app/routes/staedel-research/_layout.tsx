import { Outlet } from 'react-router'
import { Data } from '#app/components/institute/primitives.tsx'
import { PilotNav } from './+shared/components.tsx'

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
 * Nothing here touches the database. The pages are pure functions of a frozen
 * run on disk, which is what makes them safe to hand out as a link.
 *
 * No register is declared here on purpose. These pages inherit the reader's
 * resting ground — paper under GROUND PAPER, void under GROUND VOID — and every
 * class beneath is register-relative, so the whole area follows the masthead
 * instead of pinning itself to one ground and stranding the theme toggle.
 */
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
						Unlisted and unindexed. Not linked from the site.
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
