import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { redirect, Link, useFetcher } from 'react-router'
import {
	Ledger,
	LedgerRow,
	PanelHeading,
} from '#app/components/institute/document.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { generateTOTP } from '#app/utils/totp.server.ts'
import { type Route } from './+types/index.ts'
import { twoFAVerificationType } from './_layout.tsx'
import { twoFAVerifyVerificationType } from './verify.tsx'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const verification = await prisma.verification.findUnique({
		where: { target_type: { type: twoFAVerificationType, target: userId } },
		select: { id: true },
	})
	return { is2FAEnabled: Boolean(verification) }
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const { otp: _otp, ...config } = await generateTOTP()
	const verificationData = {
		...config,
		type: twoFAVerifyVerificationType,
		target: userId,
	}
	await prisma.verification.upsert({
		where: {
			target_type: { target: userId, type: twoFAVerifyVerificationType },
		},
		create: verificationData,
		update: verificationData,
	})
	return redirect('/settings/profile/two-factor/verify')
}

export default function TwoFactorRoute({ loaderData }: Route.ComponentProps) {
	const enable2FAFetcher = useFetcher<typeof action>()

	return (
		<div className="flex max-w-2xl flex-col gap-8">
			<PanelHeading
				kind="Credentials"
				title="Two-factor authentication"
				lead="A second factor means a stolen password is not enough to reach your account."
			/>

			<Ledger>
				<LedgerRow
					label="Status"
					value={loaderData.is2FAEnabled ? 'Enabled' : 'Not enabled'}
					action={
						loaderData.is2FAEnabled ? (
							<Link
								to="disable"
								className="font-data text-data-sm text-link tracking-[0.12em] uppercase underline underline-offset-4"
							>
								Disable 2FA
							</Link>
						) : (
							<enable2FAFetcher.Form method="POST">
								<StatusButton
									type="submit"
									name="intent"
									value="enable"
									size="sm"
									status={
										enable2FAFetcher.state === 'loading' ? 'pending' : 'idle'
									}
								>
									Enable 2FA
								</StatusButton>
							</enable2FAFetcher.Form>
						)
					}
				/>
			</Ledger>

			{loaderData.is2FAEnabled ? null : (
				<p className="font-body text-prose measure text-ground-muted">
					You will need an authenticator application —{' '}
					<a
						className="text-link underline underline-offset-4"
						href="https://1password.com/"
					>
						1Password
					</a>
					, Aegis, or any other TOTP client — and you will be asked for a code
					from it whenever you sign in.
				</p>
			)}
		</div>
	)
}
