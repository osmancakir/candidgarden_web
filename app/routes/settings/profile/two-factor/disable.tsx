import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { useFetcher } from 'react-router'
import { PanelHeading } from '#app/components/institute/document.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { requireRecentVerification } from '#app/routes/_auth/verify.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { useDoubleCheck } from '#app/utils/misc.tsx'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type BreadcrumbHandle } from '../../profile/_layout.tsx'
import { type Route } from './+types/disable.ts'
import { twoFAVerificationType } from './_layout.tsx'

export const handle: BreadcrumbHandle & SEOHandle = {
	breadcrumb: 'Disable',
	getSitemapEntries: () => null,
}

export async function loader({ request }: Route.LoaderArgs) {
	await requireRecentVerification(request)
	return {}
}

export async function action({ request }: Route.ActionArgs) {
	await requireRecentVerification(request)
	const userId = await requireUserId(request)
	await prisma.verification.delete({
		where: { target_type: { target: userId, type: twoFAVerificationType } },
	})
	return redirectWithToast('/settings/profile/two-factor', {
		title: '2FA Disabled',
		description: 'Two factor authentication has been disabled.',
	})
}

export default function TwoFactorDisableRoute() {
	const disable2FAFetcher = useFetcher<typeof action>()
	const dc = useDoubleCheck()

	return (
		<div className="flex max-w-md flex-col gap-8">
			<PanelHeading
				kind="Credentials"
				title="Disable two-factor"
				lead="We do not recommend it. With two-factor off, a stolen password is enough to reach your account."
			/>
			<disable2FAFetcher.Form method="POST">
				<StatusButton
					variant="destructive"
					status={disable2FAFetcher.state === 'loading' ? 'pending' : 'idle'}
					{...dc.getButtonProps({
						className: 'mx-auto',
						name: 'intent',
						value: 'disable',
						type: 'submit',
					})}
				>
					{dc.doubleCheck ? 'Confirm' : 'Disable two-factor'}
				</StatusButton>
			</disable2FAFetcher.Form>
		</div>
	)
}
