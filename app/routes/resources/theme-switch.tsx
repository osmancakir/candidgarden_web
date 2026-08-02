import { useForm, getFormProps } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { invariantResponse } from '@epic-web/invariant'
import { data, redirect, useFetcher, useFetchers } from 'react-router'
import { ServerOnly } from 'remix-utils/server-only'
import { z } from 'zod'
import { useHints, useOptionalHints } from '#app/utils/client-hints.tsx'
import {
	useOptionalRequestInfo,
	useRequestInfo,
} from '#app/utils/request-info.ts'
import { type Theme, setTheme } from '#app/utils/theme.server.ts'
import { type Route } from './+types/theme-switch.ts'
const ThemeFormSchema = z.object({
	theme: z.enum(['system', 'light', 'dark']),
	// this is useful for progressive enhancement
	redirectTo: z.string().optional(),
})

export async function action({ request }: Route.ActionArgs) {
	const formData = await request.formData()
	const submission = parseWithZod(formData, {
		schema: ThemeFormSchema,
	})

	invariantResponse(submission.status === 'success', 'Invalid theme received')

	const { theme, redirectTo } = submission.value

	const responseInit = {
		headers: { 'set-cookie': setTheme(theme) },
	}
	if (redirectTo) {
		return redirect(redirectTo, responseInit)
	} else {
		return data({ result: submission.reply() }, responseInit)
	}
}

export function ThemeSwitch({
	userPreference,
}: {
	userPreference?: Theme | null
}) {
	const fetcher = useFetcher<typeof action>()
	const requestInfo = useRequestInfo()

	const [form] = useForm({
		id: 'theme-switch',
		lastResult: fetcher.data?.result,
	})

	const optimisticMode = useOptimisticThemeMode()
	const mode = optimisticMode ?? userPreference ?? 'system'
	const nextMode =
		mode === 'system' ? 'light' : mode === 'light' ? 'dark' : 'system'

	// The control names the ground it will put you on rather than showing a sun
	// or a moon: in this project "light" and "dark" are registers with names —
	// paper and void — and the toggle is the one place that says so out loud.
	const modeLabel = {
		light: { text: 'Paper', a11y: 'Light theme — the paper register' },
		dark: { text: 'Void', a11y: 'Dark theme — the void register' },
		system: { text: 'Auto', a11y: 'Follow the system theme' },
	} as const

	return (
		<fetcher.Form
			method="POST"
			{...getFormProps(form)}
			action="/resources/theme-switch"
		>
			<ServerOnly>
				{() => (
					<input type="hidden" name="redirectTo" value={requestInfo.path} />
				)}
			</ServerOnly>
			<input type="hidden" name="theme" value={nextMode} />
			<button
				type="submit"
				className="font-data text-data-sm border-rule text-ground-muted hover:border-link hover:text-link inline-flex cursor-pointer items-center gap-2 border px-2 py-1.5 tracking-[0.12em] uppercase transition-colors"
			>
				<span aria-hidden="true">Ground</span>
				<span className="text-ground-fg">{modeLabel[mode].text}</span>
				<span className="sr-only">{modeLabel[mode].a11y}</span>
			</button>
		</fetcher.Form>
	)
}

/**
 * If the user's changing their theme mode preference, this will return the
 * value it's being changed to.
 */
export function useOptimisticThemeMode() {
	const fetchers = useFetchers()
	const themeFetcher = fetchers.find(
		(f) => f.formAction === '/resources/theme-switch',
	)

	if (themeFetcher && themeFetcher.formData) {
		const submission = parseWithZod(themeFetcher.formData, {
			schema: ThemeFormSchema,
		})

		if (submission.status === 'success') {
			return submission.value.theme
		}
	}
}

/**
 * @returns the user's theme preference, or the client hint theme if the user
 * has not set a preference.
 */
export function useTheme() {
	const hints = useHints()
	const requestInfo = useRequestInfo()
	const optimisticMode = useOptimisticThemeMode()
	if (optimisticMode) {
		return optimisticMode === 'system' ? hints.theme : optimisticMode
	}
	return requestInfo.userPrefs.theme ?? hints.theme
}

export function useOptionalTheme() {
	const optionalHints = useOptionalHints()
	const optionalRequestInfo = useOptionalRequestInfo()
	const optimisticMode = useOptimisticThemeMode()
	if (optimisticMode) {
		return optimisticMode === 'system' ? optionalHints?.theme : optimisticMode
	}
	return optionalRequestInfo?.userPrefs.theme ?? optionalHints?.theme
}
