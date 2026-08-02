import { invariantResponse } from '@epic-web/invariant'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { NoteEditor } from './+shared/note-editor.tsx'
import { type Route } from './+types/$noteId_.edit.ts'

export { action } from './+shared/note-editor.server.tsx'

export async function loader({ params, request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const note = await prisma.note.findFirst({
		select: {
			id: true,
			title: true,
			content: true,
			images: {
				select: {
					id: true,
					altText: true,
					objectKey: true,
				},
			},
		},
		where: {
			id: params.noteId,
			ownerId: userId,
		},
	})
	invariantResponse(note, 'Not found', { status: 404 })
	return { note }
}

export default function NoteEdit({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	return <NoteEditor note={loaderData.note} actionData={actionData} />
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				404: ({ params }) => (
					<div className="flex flex-col gap-3">
						<p className="font-display text-chapter uppercase">
							Note not found
						</p>
						<p className="font-data text-data text-stamp-fg tracking-widest uppercase">
							No note filed under “{params.noteId}”
						</p>
					</div>
				),
			}}
		/>
	)
}
