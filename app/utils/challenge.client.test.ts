/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { consoleWarn } from '#tests/setup/setup-test-env.ts'
import { init } from './challenge.client.ts'

const ORIGIN = 'https://candidgarden.com'

let assign: ReturnType<typeof vi.fn>
let originalFetch: typeof window.fetch
let originalLocation: Location

function challenged() {
	return new Response('<!DOCTYPE html>Just a moment…', {
		status: 403,
		headers: { 'cf-mitigated': 'challenge' },
	})
}

/** Installs `init()` over a fetch that always answers with `response`. */
function withResponse(response: Response) {
	const underlying = vi.fn().mockResolvedValue(response)
	window.fetch = underlying as unknown as typeof window.fetch
	init()
	return underlying
}

beforeEach(() => {
	originalFetch = window.fetch
	originalLocation = window.location
	assign = vi.fn()
	Object.defineProperty(window, 'location', {
		configurable: true,
		value: { href: `${ORIGIN}/archive`, origin: ORIGIN, assign },
	})
	sessionStorage.clear()
})

afterEach(() => {
	window.fetch = originalFetch
	Object.defineProperty(window, 'location', {
		configurable: true,
		value: originalLocation,
	})
})

test('passes an ordinary response through without navigating', async () => {
	withResponse(new Response('{}', { status: 200 }))

	const response = await window.fetch(`${ORIGIN}/_root.data`)

	expect(response.status).toBe(200)
	expect(assign).not.toHaveBeenCalled()
})

test('leaves a 403 that is not a challenge alone', async () => {
	withResponse(new Response('no', { status: 403 }))

	await window.fetch(`${ORIGIN}/_root.data`)

	expect(assign).not.toHaveBeenCalled()
})

test('re-issues a challenged root data request as a document load', async () => {
	withResponse(challenged())

	await window.fetch(`${ORIGIN}/_root.data`)

	expect(assign).toHaveBeenCalledWith('/')
})

test('keeps the query and drops React Router bookkeeping', async () => {
	withResponse(challenged())

	await window.fetch(`${ORIGIN}/archive/123.data?motif=ruin&_routes=root`)

	expect(assign).toHaveBeenCalledWith('/archive/123?motif=ruin')
})

test('falls back to the current page for a challenged non-data request', async () => {
	withResponse(challenged())

	await window.fetch(`${ORIGIN}/resources/healthcheck`)

	expect(assign).toHaveBeenCalledWith(`${ORIGIN}/archive`)
})

test('ignores a challenge from another origin', async () => {
	withResponse(challenged())

	await window.fetch('https://example.com/_root.data')

	expect(assign).not.toHaveBeenCalled()
})

test('accepts a Request object as well as a string', async () => {
	withResponse(challenged())

	await window.fetch(new Request(`${ORIGIN}/_root.data`))

	expect(assign).toHaveBeenCalledWith('/')
})

test('gives up rather than reloading forever', async () => {
	consoleWarn.mockImplementation(() => {})
	withResponse(challenged())

	await window.fetch(`${ORIGIN}/_root.data`)
	await window.fetch(`${ORIGIN}/_root.data`)
	await window.fetch(`${ORIGIN}/_root.data`)

	expect(assign).toHaveBeenCalledTimes(2)
	expect(consoleWarn).toHaveBeenCalledTimes(1)
})

test('still returns the challenge response to the caller', async () => {
	withResponse(challenged())

	const response = await window.fetch(`${ORIGIN}/_root.data`)

	expect(response.status).toBe(403)
	expect(response.headers.get('cf-mitigated')).toBe('challenge')
})
