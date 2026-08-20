import { startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { HydratedRouter } from 'react-router/dom'
import { init as initChallengeHandling } from './utils/challenge.client.ts'

if (ENV.MODE === 'production' && ENV.SENTRY_DSN) {
	void import('./utils/monitoring.client.tsx').then(({ init }) => init())
}

// Before hydration, so every data request React Router makes goes through it.
initChallengeHandling()

startTransition(() => {
	hydrateRoot(document, <HydratedRouter />)
})
