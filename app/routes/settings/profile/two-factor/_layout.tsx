import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { Outlet } from 'react-router'
import { type VerificationTypes } from '#app/routes/_auth/verify.tsx'
import { type BreadcrumbHandle } from '../../profile/_layout.tsx'

export const handle: BreadcrumbHandle & SEOHandle = {
	breadcrumb: '2FA',
	getSitemapEntries: () => null,
}

export const twoFAVerificationType = '2fa' satisfies VerificationTypes

export default function TwoFactorRoute() {
	return <Outlet />
}
