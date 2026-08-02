import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { data, redirect, Form, Link } from 'react-router'
import { z } from 'zod'
import { ErrorList, Field } from '#app/components/forms.tsx'
import { PanelHeading } from '#app/components/institute/document.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import {
	checkIsCommonPassword,
	getPasswordHash,
	requireUserId,
	verifyUserPassword,
} from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { PasswordSchema } from '#app/utils/user-validation.ts'
import { type Route } from './+types/password.ts'
import { type BreadcrumbHandle } from './_layout.tsx'

export const handle: BreadcrumbHandle & SEOHandle = {
	breadcrumb: 'Password',
	getSitemapEntries: () => null,
}

const ChangePasswordForm = z
	.object({
		currentPassword: PasswordSchema,
		newPassword: PasswordSchema,
		confirmNewPassword: PasswordSchema,
	})
	.superRefine(({ confirmNewPassword, newPassword }, ctx) => {
		if (confirmNewPassword !== newPassword) {
			ctx.addIssue({
				path: ['confirmNewPassword'],
				code: z.ZodIssueCode.custom,
				message: 'The passwords must match',
			})
		}
	})

async function requirePassword(userId: string) {
	const password = await prisma.password.findUnique({
		select: { userId: true },
		where: { userId },
	})
	if (!password) {
		throw redirect('/settings/profile/password/create')
	}
}

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	await requirePassword(userId)
	return {}
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	await requirePassword(userId)
	const formData = await request.formData()
	const submission = await parseWithZod(formData, {
		async: true,
		schema: ChangePasswordForm.superRefine(
			async ({ currentPassword, newPassword }, ctx) => {
				if (currentPassword && newPassword) {
					const user = await verifyUserPassword({ id: userId }, currentPassword)
					if (!user) {
						ctx.addIssue({
							path: ['currentPassword'],
							code: z.ZodIssueCode.custom,
							message: 'Incorrect password.',
						})
					}
					const isCommonPassword = await checkIsCommonPassword(newPassword)
					if (isCommonPassword) {
						ctx.addIssue({
							path: ['newPassword'],
							code: 'custom',
							message: 'Password is too common',
						})
					}
				}
			},
		),
	})
	if (submission.status !== 'success') {
		return data(
			{
				result: submission.reply({
					hideFields: ['currentPassword', 'newPassword', 'confirmNewPassword'],
				}),
			},
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { newPassword } = submission.value

	await prisma.user.update({
		select: { username: true },
		where: { id: userId },
		data: {
			password: {
				update: {
					hash: await getPasswordHash(newPassword),
				},
			},
		},
	})

	return redirectWithToast(
		`/settings/profile`,
		{
			type: 'success',
			title: 'Password Changed',
			description: 'Your password has been changed.',
		},
		{ status: 302 },
	)
}

export default function ChangePasswordRoute({
	actionData,
}: Route.ComponentProps) {
	const isPending = useIsPending()

	const [form, fields] = useForm({
		id: 'password-change-form',
		constraint: getZodConstraint(ChangePasswordForm),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ChangePasswordForm })
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<div className="flex flex-col gap-8">
			<PanelHeading
				kind="Credentials"
				title="Change password"
				lead="Confirm the password you have now, then set the one you want. All other sessions stay signed in."
			/>
			<Form method="POST" {...getFormProps(form)} className="max-w-md">
				<Field
					labelProps={{ children: 'Current Password' }}
					inputProps={{
						...getInputProps(fields.currentPassword, { type: 'password' }),
						autoComplete: 'current-password',
					}}
					errors={fields.currentPassword.errors}
				/>
				<Field
					labelProps={{ children: 'New Password' }}
					inputProps={{
						...getInputProps(fields.newPassword, { type: 'password' }),
						autoComplete: 'new-password',
					}}
					errors={fields.newPassword.errors}
				/>
				<Field
					labelProps={{ children: 'Confirm New Password' }}
					inputProps={{
						...getInputProps(fields.confirmNewPassword, {
							type: 'password',
						}),
						autoComplete: 'new-password',
					}}
					errors={fields.confirmNewPassword.errors}
				/>
				<ErrorList id={form.errorId} errors={form.errors} />
				<div className="flex flex-wrap gap-3">
					<StatusButton
						type="submit"
						status={isPending ? 'pending' : (form.status ?? 'idle')}
					>
						Change Password
					</StatusButton>
					<Button variant="ghost" asChild>
						<Link to="..">Cancel</Link>
					</Button>
				</div>
			</Form>
		</div>
	)
}
