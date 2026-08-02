import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { invariantResponse } from '@epic-web/invariant'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { Img } from 'openimg/react'
import { data, Link, useFetcher } from 'react-router'
import { z } from 'zod'
import { ErrorList, Field } from '#app/components/forms.tsx'
import {
	Ledger,
	LedgerRow,
	PanelHeading,
} from '#app/components/institute/document.tsx'
import { Data } from '#app/components/institute/primitives.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { requireUserId, sessionKey } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { getUserImgSrc, useDoubleCheck } from '#app/utils/misc.tsx'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { NameSchema, UsernameSchema } from '#app/utils/user-validation.ts'
import { type Route } from './+types/index.ts'
import { twoFAVerificationType } from './two-factor/_layout.tsx'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

const ProfileFormSchema = z.object({
	name: NameSchema.nullable().default(null),
	username: UsernameSchema,
})

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const user = await prisma.user.findUniqueOrThrow({
		where: { id: userId },
		select: {
			id: true,
			name: true,
			username: true,
			email: true,
			image: {
				select: { objectKey: true },
			},
			_count: {
				select: {
					sessions: {
						where: {
							expirationDate: { gt: new Date() },
						},
					},
				},
			},
		},
	})

	const twoFactorVerification = await prisma.verification.findUnique({
		select: { id: true },
		where: { target_type: { type: twoFAVerificationType, target: userId } },
	})

	const password = await prisma.password.findUnique({
		select: { userId: true },
		where: { userId },
	})

	return {
		user,
		hasPassword: Boolean(password),
		isTwoFactorEnabled: Boolean(twoFactorVerification),
	}
}

type ProfileActionArgs = {
	request: Request
	userId: string
	formData: FormData
}
const profileUpdateActionIntent = 'update-profile'
const signOutOfSessionsActionIntent = 'sign-out-of-sessions'
const deleteDataActionIntent = 'delete-data'

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const intent = formData.get('intent')
	switch (intent) {
		case profileUpdateActionIntent: {
			return profileUpdateAction({ request, userId, formData })
		}
		case signOutOfSessionsActionIntent: {
			return signOutOfSessionsAction({ request, userId, formData })
		}
		case deleteDataActionIntent: {
			return deleteDataAction({ request, userId, formData })
		}
		default: {
			throw new Response(`Invalid intent "${intent}"`, { status: 400 })
		}
	}
}

export default function EditUserProfile({ loaderData }: Route.ComponentProps) {
	const { user, isTwoFactorEnabled, hasPassword } = loaderData
	return (
		<div className="flex flex-col gap-10">
			<PanelHeading
				kind="Personnel record"
				title={user.name ?? user.username}
				lead="What the institute holds about you, and the controls for changing it."
			/>

			<div className="flex flex-wrap items-start gap-6">
				{/* Square, like every plate in the archive (§5). */}
				<div className="relative">
					<Img
						src={getUserImgSrc(user.image?.objectKey)}
						alt={user.name ?? user.username}
						className="border-rule size-40 border object-cover"
						width={640}
						height={640}
						isAboveFold
					/>
					<Button asChild variant="outline" size="sm" className="mt-2 w-full">
						<Link preventScrollReset to="photo">
							Change profile photo
						</Link>
					</Button>
				</div>
				<div className="min-w-64 flex-1">
					<UpdateProfile loaderData={loaderData} />
				</div>
			</div>

			<section>
				<Data className="text-ground-muted mb-3 block tracking-[0.2em]">
					Credentials
				</Data>
				<Ledger>
					<LedgerRow
						label="Email"
						value={user.email}
						action={<SettingsLink to="change-email">Change email</SettingsLink>}
					/>
					<LedgerRow
						label="Password"
						value={hasPassword ? 'Set' : 'Not set'}
						action={
							<SettingsLink to={hasPassword ? 'password' : 'password/create'}>
								{hasPassword ? 'Change password' : 'Create password'}
							</SettingsLink>
						}
					/>
					<LedgerRow
						label="Two-factor"
						value={isTwoFactorEnabled ? 'Enabled' : 'Not enabled'}
						action={
							<SettingsLink to="two-factor">
								{isTwoFactorEnabled ? 'Manage 2FA' : 'Enable 2FA'}
							</SettingsLink>
						}
					/>
					<LedgerRow
						label="Passkeys"
						value="Sign in without a password"
						action={<SettingsLink to="passkeys">Manage passkeys</SettingsLink>}
					/>
					<LedgerRow
						label="Connections"
						value="Third-party identity providers"
						action={
							<SettingsLink to="connections">Manage connections</SettingsLink>
						}
					/>
				</Ledger>
			</section>

			<section>
				<Data className="text-ground-muted mb-3 block tracking-[0.2em]">
					Your data
				</Data>
				<Ledger>
					<LedgerRow
						label="Export"
						value="Everything the institute holds about you, as JSON."
						action={
							<Link
								reloadDocument
								download="candid-garden-data.json"
								to="/resources/download-user-data"
								className="font-data text-data-sm text-link tracking-[0.12em] uppercase underline underline-offset-4"
							>
								Download
							</Link>
						}
					/>
					<SignOutOfSessions loaderData={loaderData} />
					<DeleteData />
				</Ledger>
			</section>
		</div>
	)
}

/** The house style for an action at the end of a ledger row. */
function SettingsLink({
	to,
	children,
}: {
	to: string
	children: React.ReactNode
}) {
	return (
		<Link
			to={to}
			preventScrollReset
			className="font-data text-data-sm text-link tracking-[0.12em] uppercase underline underline-offset-4"
		>
			{children}
		</Link>
	)
}

async function profileUpdateAction({ userId, formData }: ProfileActionArgs) {
	const submission = await parseWithZod(formData, {
		async: true,
		schema: ProfileFormSchema.superRefine(async ({ username }, ctx) => {
			const existingUsername = await prisma.user.findUnique({
				where: { username },
				select: { id: true },
			})
			if (existingUsername && existingUsername.id !== userId) {
				ctx.addIssue({
					path: ['username'],
					code: z.ZodIssueCode.custom,
					message: 'A user already exists with this username',
				})
			}
		}),
	})
	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { username, name } = submission.value

	await prisma.user.update({
		select: { username: true },
		where: { id: userId },
		data: {
			name: name,
			username: username,
		},
	})

	return {
		result: submission.reply(),
	}
}

function UpdateProfile({
	loaderData,
}: {
	loaderData: Route.ComponentProps['loaderData']
}) {
	const fetcher = useFetcher<typeof profileUpdateAction>()

	const [form, fields] = useForm({
		id: 'edit-profile',
		constraint: getZodConstraint(ProfileFormSchema),
		lastResult: fetcher.data?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ProfileFormSchema })
		},
		defaultValue: {
			username: loaderData.user.username,
			name: loaderData.user.name,
		},
	})

	return (
		<fetcher.Form method="POST" {...getFormProps(form)}>
			<div className="grid gap-x-6 sm:grid-cols-2">
				<Field
					labelProps={{
						htmlFor: fields.username.id,
						children: 'Username',
					}}
					inputProps={getInputProps(fields.username, { type: 'text' })}
					errors={fields.username.errors}
				/>
				<Field
					labelProps={{ htmlFor: fields.name.id, children: 'Name' }}
					inputProps={getInputProps(fields.name, { type: 'text' })}
					errors={fields.name.errors}
				/>
			</div>

			<ErrorList errors={form.errors} id={form.errorId} />

			<div className="mt-4">
				<StatusButton
					type="submit"
					name="intent"
					value={profileUpdateActionIntent}
					status={
						fetcher.state !== 'idle' ? 'pending' : (form.status ?? 'idle')
					}
				>
					Save record
				</StatusButton>
			</div>
		</fetcher.Form>
	)
}

async function signOutOfSessionsAction({ request, userId }: ProfileActionArgs) {
	const authSession = await authSessionStorage.getSession(
		request.headers.get('cookie'),
	)
	const sessionId = authSession.get(sessionKey)
	invariantResponse(
		sessionId,
		'You must be authenticated to sign out of other sessions',
	)
	await prisma.session.deleteMany({
		where: {
			userId,
			id: { not: sessionId },
		},
	})
	return { status: 'success' } as const
}

function SignOutOfSessions({
	loaderData,
}: {
	loaderData: Route.ComponentProps['loaderData']
}) {
	const dc = useDoubleCheck()

	const fetcher = useFetcher<typeof signOutOfSessionsAction>()
	const otherSessionsCount = loaderData.user._count.sessions - 1
	return (
		<LedgerRow
			label="Sessions"
			value={
				otherSessionsCount
					? `Signed in on ${otherSessionsCount + 1} devices.`
					: 'This is your only session.'
			}
			action={
				otherSessionsCount ? (
					<fetcher.Form method="POST">
						<StatusButton
							{...dc.getButtonProps({
								type: 'submit',
								name: 'intent',
								value: signOutOfSessionsActionIntent,
							})}
							variant={dc.doubleCheck ? 'destructive' : 'outline'}
							size="sm"
							status={
								fetcher.state !== 'idle'
									? 'pending'
									: (fetcher.data?.status ?? 'idle')
							}
						>
							{dc.doubleCheck ? 'Confirm' : 'Sign out others'}
						</StatusButton>
					</fetcher.Form>
				) : null
			}
		/>
	)
}

async function deleteDataAction({ userId }: ProfileActionArgs) {
	await prisma.user.delete({ where: { id: userId } })
	return redirectWithToast('/', {
		type: 'success',
		title: 'Data Deleted',
		description: 'All of your data has been deleted',
	})
}

function DeleteData() {
	const dc = useDoubleCheck()

	const fetcher = useFetcher<typeof deleteDataAction>()
	// §7: state plainly what will happen. Deletion is deletion.
	return (
		<LedgerRow
			label="Deletion"
			value="Removes your account and everything attached to it. There is no shadow copy and no recovery."
			action={
				<fetcher.Form method="POST">
					<StatusButton
						{...dc.getButtonProps({
							type: 'submit',
							name: 'intent',
							value: deleteDataActionIntent,
						})}
						variant="destructive"
						size="sm"
						status={fetcher.state !== 'idle' ? 'pending' : 'idle'}
					>
						{dc.doubleCheck ? 'Confirm deletion' : 'Delete everything'}
					</StatusButton>
				</fetcher.Form>
			}
		/>
	)
}
