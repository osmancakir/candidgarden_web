import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { Form, useSearchParams } from 'react-router'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { ErrorList, OTPField } from '#app/components/forms.tsx'
import { AccessPage } from '#app/components/institute/access.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { checkHoneypot } from '#app/utils/honeypot.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { type Route } from './+types/verify.ts'
import { validateRequest } from './verify.server.ts'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export const codeQueryParam = 'code'
export const targetQueryParam = 'target'
export const typeQueryParam = 'type'
export const redirectToQueryParam = 'redirectTo'
const types = ['onboarding', 'reset-password', 'change-email', '2fa'] as const
const VerificationTypeSchema = z.enum(types)
export type VerificationTypes = z.infer<typeof VerificationTypeSchema>

export const VerifySchema = z.object({
	[codeQueryParam]: z.string().min(6).max(6),
	[typeQueryParam]: VerificationTypeSchema,
	[targetQueryParam]: z.string(),
	[redirectToQueryParam]: z.string().optional(),
})

export async function action({ request }: Route.ActionArgs) {
	const formData = await request.formData()
	await checkHoneypot(formData)
	return validateRequest(request, formData)
}

export default function VerifyRoute({ actionData }: Route.ComponentProps) {
	const [searchParams] = useSearchParams()
	const isPending = useIsPending()
	const parseWithZoddType = VerificationTypeSchema.safeParse(
		searchParams.get(typeQueryParam),
	)
	const type = parseWithZoddType.success ? parseWithZoddType.data : null

	// The title takes the display face and the lead takes Times, so the two are
	// kept as plain strings rather than as JSX blocks carrying their own type.
	const emailLead =
		'A six-character code has been sent to your address. It expires in ten minutes.'

	const titles: Record<VerificationTypes, string> = {
		onboarding: 'Check your email',
		'reset-password': 'Check your email',
		'change-email': 'Check your email',
		'2fa': 'Check your authenticator',
	}

	const headings: Record<VerificationTypes, string> = {
		onboarding: emailLead,
		'reset-password': emailLead,
		'change-email': emailLead,
		'2fa':
			'Enter the code from your two-factor application to confirm this is you.',
	}

	const [form, fields] = useForm({
		id: 'verify-form',
		constraint: getZodConstraint(VerifySchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: VerifySchema })
		},
		defaultValue: {
			code: searchParams.get(codeQueryParam),
			type: type,
			target: searchParams.get(targetQueryParam),
			redirectTo: searchParams.get(redirectToQueryParam),
		},
	})

	return (
		<AccessPage
			kind="Verification"
			title={type ? titles[type] : 'Invalid verification type'}
			lead={
				type
					? headings[type]
					: 'This verification link names a type the institute does not issue.'
			}
		>
			<ErrorList errors={form.errors} id={form.errorId} />
			<Form method="POST" {...getFormProps(form)}>
				<HoneypotInputs />
				<div>
					<OTPField
						labelProps={{
							htmlFor: fields[codeQueryParam].id,
							children: 'Code',
						}}
						inputProps={{
							...getInputProps(fields[codeQueryParam], { type: 'text' }),
							autoComplete: 'one-time-code',
							autoFocus: true,
						}}
						errors={fields[codeQueryParam].errors}
					/>
				</div>
				<input {...getInputProps(fields[typeQueryParam], { type: 'hidden' })} />
				<input
					{...getInputProps(fields[targetQueryParam], { type: 'hidden' })}
				/>
				<input
					{...getInputProps(fields[redirectToQueryParam], {
						type: 'hidden',
					})}
				/>
				<StatusButton
					className="w-full"
					status={isPending ? 'pending' : (form.status ?? 'idle')}
					type="submit"
					disabled={isPending}
				>
					Submit
				</StatusButton>
			</Form>
		</AccessPage>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
