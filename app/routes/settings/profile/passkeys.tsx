import { startRegistration } from '@simplewebauthn/browser'
import { formatDistanceToNow } from 'date-fns'
import { useState } from 'react'
import { Form, useRevalidator } from 'react-router'
import { z } from 'zod'
import {
	Ledger,
	LedgerRow,
	PanelHeading,
} from '#app/components/institute/document.tsx'
import {
	NoRecords,
	UncertaintyNotice,
} from '#app/components/institute/primitives.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { type Route } from './+types/passkeys.ts'

export const handle = {
	breadcrumb: 'Passkeys',
}

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const passkeys = await prisma.passkey.findMany({
		where: { userId },
		orderBy: { createdAt: 'desc' },
		select: {
			id: true,
			deviceType: true,
			createdAt: true,
		},
	})
	return { passkeys }
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const intent = formData.get('intent')

	if (intent === 'delete') {
		const passkeyId = formData.get('passkeyId')
		if (typeof passkeyId !== 'string') {
			return Response.json(
				{ status: 'error', error: 'Invalid passkey ID' },
				{ status: 400 },
			)
		}

		await prisma.passkey.delete({
			where: {
				id: passkeyId,
				userId, // Ensure the passkey belongs to the user
			},
		})
		return Response.json({ status: 'success' })
	}

	return Response.json(
		{ status: 'error', error: 'Invalid intent' },
		{ status: 400 },
	)
}

const RegistrationOptionsSchema = z.object({
	options: z.object({
		rp: z.object({
			id: z.string(),
			name: z.string(),
		}),
		user: z.object({
			id: z.string(),
			name: z.string(),
			displayName: z.string(),
		}),
		challenge: z.string(),
		pubKeyCredParams: z.array(
			z.object({
				type: z.literal('public-key'),
				alg: z.number(),
			}),
		),
		authenticatorSelection: z
			.object({
				authenticatorAttachment: z
					.enum(['platform', 'cross-platform'])
					.optional(),
				residentKey: z
					.enum(['required', 'preferred', 'discouraged'])
					.optional(),
				userVerification: z
					.enum(['required', 'preferred', 'discouraged'])
					.optional(),
				requireResidentKey: z.boolean().optional(),
			})
			.optional(),
	}),
}) satisfies z.ZodType<{ options: PublicKeyCredentialCreationOptionsJSON }>

export default function Passkeys({ loaderData }: Route.ComponentProps) {
	const revalidator = useRevalidator()
	const [error, setError] = useState<string | null>(null)

	async function handlePasskeyRegistration() {
		try {
			setError(null)
			const resp = await fetch('/webauthn/registration')
			const jsonResult = await resp.json()
			const parsedResult = RegistrationOptionsSchema.parse(jsonResult)

			const regResult = await startRegistration({
				optionsJSON: parsedResult.options,
			})

			const verificationResp = await fetch('/webauthn/registration', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(regResult),
			})

			if (!verificationResp.ok) {
				throw new Error('Failed to verify registration')
			}

			void revalidator.revalidate()
		} catch (err) {
			console.error('Failed to create passkey:', err)
			setError('Failed to create passkey. Please try again.')
		}
	}

	return (
		<div className="flex flex-col gap-8">
			<PanelHeading
				kind="Credentials"
				title="Passkeys"
				lead="Hardware and platform authenticators registered to this account. Any one of them can sign you in without a password."
			/>

			<div>
				<form action={handlePasskeyRegistration}>
					<Button type="submit" variant="outline" size="sm">
						Register new passkey
					</Button>
				</form>
			</div>

			<UncertaintyNotice notice={error ? error.toUpperCase() : null} />

			{loaderData.passkeys.length ? (
				<Ledger>
					<ul title="passkeys">
						{loaderData.passkeys.map((passkey) => (
							<li key={passkey.id}>
								<LedgerRow
									label={
										passkey.deviceType === 'platform'
											? 'Device'
											: 'Security key'
									}
									value={`Registered ${formatDistanceToNow(new Date(passkey.createdAt))} ago`}
									action={
										<Form method="POST">
											<input
												type="hidden"
												name="passkeyId"
												value={passkey.id}
											/>
											<Button
												type="submit"
												name="intent"
												value="delete"
												variant="destructive"
												size="sm"
											>
												Revoke
											</Button>
										</Form>
									}
								/>
							</li>
						))}
					</ul>
				</Ledger>
			) : (
				<NoRecords>No passkeys registered</NoRecords>
			)}
		</div>
	)
}
