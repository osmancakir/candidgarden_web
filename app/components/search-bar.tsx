import { useId } from 'react'
import { Form, useSearchParams, useSubmit } from 'react-router'
import { useDebounce, useIsPending } from '#app/utils/misc.tsx'
import { Input } from './ui/input.tsx'
import { Label } from './ui/label.tsx'

/**
 * The masthead search strip. It is a single console row rather than a rounded
 * search pill: a labelled native input and a mono submit, with the pending
 * state announced in words (§10 refuses shimmer).
 */
export function SearchBar({
	status,
	autoFocus = false,
	autoSubmit = false,
}: {
	status: 'idle' | 'pending' | 'success' | 'error'
	autoFocus?: boolean
	autoSubmit?: boolean
}) {
	const id = useId()
	const [searchParams] = useSearchParams()
	const submit = useSubmit()
	const isSubmitting = useIsPending({
		formMethod: 'GET',
		formAction: '/users',
	})
	const isPending = isSubmitting || status === 'pending'

	const handleFormChange = useDebounce(async (form: HTMLFormElement) => {
		await submit(form)
	}, 400)

	return (
		<Form
			method="GET"
			action="/users"
			role="search"
			className="flex items-center gap-3"
			onChange={(e) => autoSubmit && handleFormChange(e.currentTarget)}
		>
			<Label htmlFor={id} className="shrink-0">
				Search
			</Label>
			<Input
				type="search"
				name="search"
				id={id}
				defaultValue={searchParams.get('search') ?? ''}
				placeholder="name or username"
				className="h-9 flex-1"
				autoFocus={autoFocus}
			/>
			<button
				type="submit"
				className="font-data text-data-sm border-rule-strong text-ground-fg hover:border-link hover:text-link h-9 shrink-0 border px-3 tracking-[0.12em] uppercase transition-colors"
			>
				Query
			</button>
			<span
				role="status"
				aria-live="polite"
				className="font-data text-data-sm text-ground-muted w-24 shrink-0 tracking-widest uppercase"
			>
				{isPending ? 'Working…' : status === 'error' ? 'Query failed' : ''}
			</span>
		</Form>
	)
}
