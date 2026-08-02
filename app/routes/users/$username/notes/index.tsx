import { type Route as NotesRoute } from './+types/_layout.ts'
import { type Route } from './+types/index.ts'

export default function NotesIndexRoute() {
	return (
		<div className="border-rule border py-16 text-center">
			<span className="font-data text-data-sm text-ground-muted tracking-[0.12em] uppercase">
				Select a note from the rail
			</span>
		</div>
	)
}

export const meta: Route.MetaFunction = ({ params, matches }) => {
	const notesMatch = matches.find(
		(m) => m?.id === 'routes/users/$username/notes',
	) as { data: NotesRoute.ComponentProps['loaderData'] }

	const displayName = notesMatch?.data?.owner.name ?? params.username
	const noteCount = notesMatch?.data?.owner.notes.length ?? 0
	const notesText = noteCount === 1 ? 'note' : 'notes'
	return [
		{ title: `Notes · ${displayName} · Candid Garden` },
		{
			name: 'description',
			content: `${noteCount} ${notesText} filed by ${displayName} at the Institute for Machine Iconography.`,
		},
	]
}
