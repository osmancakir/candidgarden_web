import { captureException } from '@sentry/core'
import { useEffect, type ReactElement } from 'react'
import {
	type ErrorResponse,
	isRouteErrorResponse,
	useParams,
	useRouteError,
} from 'react-router'
import { getErrorMessage } from '#app/utils/misc.tsx'

type StatusHandler = (info: {
	error: ErrorResponse
	params: Record<string, string | undefined>
}) => ReactElement | null

/**
 * §7: errors and gaps are stated plainly. The status code takes the display
 * face — an error is still an assertion — and the detail is machine voice in
 * the provenance red.
 */
export function GeneralErrorBoundary({
	defaultStatusHandler = ({ error }) => (
		<div className="flex flex-col gap-3">
			<p className="font-display text-display leading-none uppercase">
				{error.status}
			</p>
			<p className="font-data text-data text-stamp-fg tracking-[0.12em] uppercase">
				{error.data}
			</p>
		</div>
	),
	statusHandlers,
	unexpectedErrorHandler = (error) => (
		<div className="flex flex-col gap-3">
			<p className="font-display text-chapter uppercase">Unhandled condition</p>
			<p className="font-data text-data text-stamp-fg measure tracking-widest">
				{getErrorMessage(error)}
			</p>
			<p className="font-body text-prose measure text-ground-muted">
				This failure has been recorded. It is a gap in the archive, not in your
				reading of it.
			</p>
		</div>
	),
}: {
	defaultStatusHandler?: StatusHandler
	statusHandlers?: Record<number, StatusHandler>
	unexpectedErrorHandler?: (error: unknown) => ReactElement | null
}) {
	const error = useRouteError()
	const params = useParams()
	const isResponse = isRouteErrorResponse(error)

	if (typeof document !== 'undefined') {
		console.error(error)
	}

	useEffect(() => {
		if (isResponse) return

		captureException(error)
	}, [error, isResponse])

	return (
		<div className="container flex flex-1 items-start py-24">
			{isResponse
				? (statusHandlers?.[error.status] ?? defaultStatusHandler)({
						error,
						params,
					})
				: unexpectedErrorHandler(error)}
		</div>
	)
}
