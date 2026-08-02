import { invariantResponse } from '@epic-web/invariant'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { useState } from 'react'
import { data, useFetcher } from 'react-router'
import {
	Ledger,
	LedgerRow,
	PanelHeading,
} from '#app/components/institute/document.tsx'
import { Data, NoRecords } from '#app/components/institute/primitives.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '#app/components/ui/tooltip.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { resolveConnectionData } from '#app/utils/connections.server.ts'
import {
	ProviderConnectionForm,
	type ProviderName,
	ProviderNameSchema,
	providerIcons,
	providerNames,
} from '#app/utils/connections.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { pipeHeaders } from '#app/utils/headers.server.js'
import { makeTimings } from '#app/utils/timing.server.ts'
import { createToastHeaders } from '#app/utils/toast.server.ts'
import { type Route } from './+types/connections.ts'
import { type BreadcrumbHandle } from './_layout.tsx'

export const handle: BreadcrumbHandle & SEOHandle = {
	breadcrumb: 'Connections',
	getSitemapEntries: () => null,
}

async function userCanDeleteConnections(userId: string) {
	const user = await prisma.user.findUnique({
		select: {
			password: { select: { userId: true } },
			_count: { select: { connections: true } },
		},
		where: { id: userId },
	})
	// user can delete their connections if they have a password
	if (user?.password) return true
	// users have to have more than one remaining connection to delete one
	return Boolean(user?._count.connections && user?._count.connections > 1)
}

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const timings = makeTimings('profile connections loader')
	const rawConnections = await prisma.connection.findMany({
		select: { id: true, providerName: true, providerId: true, createdAt: true },
		where: { userId },
	})
	const connections: Array<{
		providerName: ProviderName
		id: string
		displayName: string
		link?: string | null
		createdAtFormatted: string
	}> = []
	for (const connection of rawConnections) {
		const r = ProviderNameSchema.safeParse(connection.providerName)
		if (!r.success) continue
		const providerName = r.data
		const connectionData = await resolveConnectionData(
			providerName,
			connection.providerId,
			{ timings },
		)
		connections.push({
			...connectionData,
			providerName,
			id: connection.id,
			createdAtFormatted: connection.createdAt.toLocaleString(),
		})
	}

	return data(
		{
			connections,
			canDeleteConnections: await userCanDeleteConnections(userId),
		},
		{ headers: { 'Server-Timing': timings.toString() } },
	)
}

export const headers: Route.HeadersFunction = pipeHeaders

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	invariantResponse(
		formData.get('intent') === 'delete-connection',
		'Invalid intent',
	)
	invariantResponse(
		await userCanDeleteConnections(userId),
		'You cannot delete your last connection unless you have a password.',
	)
	const connectionId = formData.get('connectionId')
	invariantResponse(typeof connectionId === 'string', 'Invalid connectionId')
	await prisma.connection.delete({
		where: {
			id: connectionId,
			userId: userId,
		},
	})
	const toastHeaders = await createToastHeaders({
		title: 'Deleted',
		description: 'Your connection has been deleted.',
	})
	return data({ status: 'success' } as const, { headers: toastHeaders })
}

export default function Connections({ loaderData }: Route.ComponentProps) {
	return (
		<div className="flex flex-col gap-8">
			<PanelHeading
				kind="Credentials"
				title="Connections"
				lead="Third-party identity providers that can sign you in to this account."
			/>

			{loaderData.connections.length ? (
				<Ledger>
					<ul>
						{loaderData.connections.map((c) => (
							<li key={c.id}>
								<Connection
									connection={c}
									canDelete={loaderData.canDeleteConnections}
								/>
							</li>
						))}
					</ul>
				</Ledger>
			) : (
				<NoRecords>No connections on file</NoRecords>
			)}

			<section>
				<Data className="text-ground-muted mb-3 block tracking-[0.2em]">
					Add a connection
				</Data>
				<div className="border-rule flex flex-col gap-3 border p-4">
					{providerNames.map((providerName) => (
						<ProviderConnectionForm
							key={providerName}
							type="Connect"
							providerName={providerName}
						/>
					))}
				</div>
			</section>
		</div>
	)
}

function Connection({
	connection,
	canDelete,
}: {
	connection: Route.ComponentProps['loaderData']['connections'][number]
	canDelete: boolean
}) {
	const deleteFetcher = useFetcher<typeof action>()
	const [infoOpen, setInfoOpen] = useState(false)
	const icon = providerIcons[connection.providerName]
	return (
		<LedgerRow
			label={
				<span className="inline-flex items-center gap-1.5">
					{icon}
					{connection.providerName}
				</span>
			}
			value={
				<>
					{connection.link ? (
						<a
							href={connection.link}
							className="text-link underline underline-offset-4"
						>
							{connection.displayName}
						</a>
					) : (
						connection.displayName
					)}{' '}
					<span className="font-data text-data-sm text-ground-muted">
						· connected {connection.createdAtFormatted}
					</span>
				</>
			}
			action={
				canDelete ? (
					<deleteFetcher.Form method="POST">
						<input name="connectionId" value={connection.id} type="hidden" />
						<StatusButton
							name="intent"
							value="delete-connection"
							variant="destructive"
							size="sm"
							status={
								deleteFetcher.state !== 'idle'
									? 'pending'
									: (deleteFetcher.data?.status ?? 'idle')
							}
						>
							Disconnect
						</StatusButton>
					</deleteFetcher.Form>
				) : (
					<TooltipProvider>
						<Tooltip open={infoOpen} onOpenChange={setInfoOpen}>
							<TooltipTrigger
								onClick={() => setInfoOpen(true)}
								className="font-data text-data-sm text-ground-muted tracking-[0.12em] uppercase underline underline-offset-4"
							>
								Locked
							</TooltipTrigger>
							<TooltipContent>
								You cannot remove your last connection unless you have a
								password.
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				)
			}
		/>
	)
}
