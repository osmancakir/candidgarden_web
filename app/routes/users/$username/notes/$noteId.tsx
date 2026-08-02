import { getFormProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { invariantResponse } from '@epic-web/invariant'
import { formatDistanceToNow } from 'date-fns'
import { Img } from 'openimg/react'
import { useRef, useEffect } from 'react'
import { data, Form, Link } from 'react-router'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { floatingToolbarClassName } from '#app/components/floating-toolbar.tsx'
import { ErrorList } from '#app/components/forms.tsx'
import { Data, Display } from '#app/components/institute/primitives.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { getNoteImgSrc, useIsPending } from '#app/utils/misc.tsx'
import { requireUserWithPermission } from '#app/utils/permissions.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { userHasPermission, useOptionalUser } from '#app/utils/user.ts'
import { type Route } from './+types/$noteId.ts'
import { type Route as NotesRoute } from './+types/_layout.ts'

export async function loader({ params }: Route.LoaderArgs) {
	const note = await prisma.note.findUnique({
		where: { id: params.noteId },
		select: {
			id: true,
			title: true,
			content: true,
			ownerId: true,
			updatedAt: true,
			images: {
				select: {
					id: true,
					altText: true,
					objectKey: true,
				},
			},
		},
	})

	invariantResponse(note, 'Not found', { status: 404 })

	const date = new Date(note.updatedAt)
	const timeAgo = formatDistanceToNow(date)

	return { note, timeAgo }
}

const DeleteFormSchema = z.object({
	intent: z.literal('delete-note'),
	noteId: z.string(),
})

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const submission = parseWithZod(formData, {
		schema: DeleteFormSchema,
	})
	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { noteId } = submission.value

	const note = await prisma.note.findFirst({
		select: { id: true, ownerId: true, owner: { select: { username: true } } },
		where: { id: noteId },
	})
	invariantResponse(note, 'Not found', { status: 404 })

	const isOwner = note.ownerId === userId
	await requireUserWithPermission(
		request,
		isOwner ? `delete:note:own` : `delete:note:any`,
	)

	await prisma.note.delete({ where: { id: note.id } })

	return redirectWithToast(`/users/${note.owner.username}/notes`, {
		type: 'success',
		title: 'Success',
		description: 'Your note has been deleted.',
	})
}

export default function NoteRoute({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const user = useOptionalUser()
	const isOwner = user?.id === loaderData.note.ownerId
	const canDelete = userHasPermission(
		user,
		isOwner ? `delete:note:own` : `delete:note:any`,
	)
	const displayBar = canDelete || isOwner

	// Add ref for auto-focusing
	const sectionRef = useRef<HTMLElement>(null)

	// Focus the section when the note ID changes
	useEffect(() => {
		if (sectionRef.current) {
			sectionRef.current.focus()
		}
	}, [loaderData.note.id])

	return (
		<section
			ref={sectionRef}
			className="flex flex-col"
			aria-labelledby="note-title"
			tabIndex={-1} // Make the section focusable without keyboard navigation
		>
			<header className="border-rule border-b pb-4">
				<Data className="text-ground-muted mb-2 block tracking-[0.2em]">
					Note · {loaderData.timeAgo} ago
				</Data>
				<Display as="h2" id="note-title" size="title">
					{loaderData.note.title}
				</Display>
			</header>

			{loaderData.note.images.length ? (
				<ul className="flex flex-wrap gap-4 py-6">
					{loaderData.note.images.map((image) => (
						<li key={image.id}>
							<a href={getNoteImgSrc(image.objectKey)}>
								<Img
									src={getNoteImgSrc(image.objectKey)}
									alt={image.altText ?? ''}
									className="border-rule size-32 border object-cover"
									width={512}
									height={512}
								/>
							</a>
						</li>
					))}
				</ul>
			) : null}

			<p className="font-body text-prose measure mt-6 whitespace-break-spaces">
				{loaderData.note.content}
			</p>

			{displayBar ? (
				<div className={floatingToolbarClassName}>
					<Data className="text-ground-muted mr-auto normal-case">
						Filed {loaderData.timeAgo} ago
					</Data>
					{canDelete ? (
						<DeleteNote id={loaderData.note.id} actionData={actionData} />
					) : null}
					<Button asChild variant="outline">
						<Link to="edit">Edit</Link>
					</Button>
				</div>
			) : null}
		</section>
	)
}

export function DeleteNote({
	id,
	actionData,
}: {
	id: string
	actionData: Route.ComponentProps['actionData'] | undefined
}) {
	const isPending = useIsPending()
	const [form] = useForm({
		id: 'delete-note',
		lastResult: actionData?.result,
	})

	return (
		<Form method="POST" {...getFormProps(form)}>
			<input type="hidden" name="noteId" value={id} />
			<StatusButton
				type="submit"
				name="intent"
				value="delete-note"
				variant="destructive"
				status={isPending ? 'pending' : (form.status ?? 'idle')}
				disabled={isPending}
			>
				Delete
			</StatusButton>
			<ErrorList errors={form.errors} id={form.errorId} />
		</Form>
	)
}

export const meta: Route.MetaFunction = ({ data, params, matches }) => {
	const notesMatch = matches.find(
		(m) => m?.id === 'routes/users/$username/notes',
	) as { data: NotesRoute.ComponentProps['loaderData'] } | undefined

	const displayName = notesMatch?.data?.owner.name ?? params.username
	const noteTitle = data?.note.title ?? 'Note'
	const noteContentsSummary =
		data && data.note.content.length > 100
			? data?.note.content.slice(0, 97) + '...'
			: 'No content'
	return [
		{ title: `${noteTitle} · ${displayName} · Candid Garden` },
		{
			name: 'description',
			content: noteContentsSummary,
		},
	]
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				403: () => (
					<p className="font-data text-data text-stamp-fg tracking-widest uppercase">
						Not permitted
					</p>
				),
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
