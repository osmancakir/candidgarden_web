import { AsyncLocalStorage } from 'node:async_hooks'

type CloudflareContext = {
	env: Env
	ctx: ExecutionContext
}

const cloudflareContext = new AsyncLocalStorage<CloudflareContext>()

/**
 * Makes the Worker's bindings reachable from ordinary module code.
 *
 * Loaders and actions receive `context.cloudflare`, but shared utilities like
 * the cache are imported directly and have no request argument to thread an
 * `Env` through. This mirrors the AsyncLocalStorage approach already used for
 * the request-scoped Prisma client in `db.server.ts`.
 *
 * Returns `undefined` in the Node harness and in tests, so every caller must
 * have a working fallback for the non-Worker case.
 */
export function runWithCloudflare<T>(
	context: CloudflareContext,
	callback: () => T,
): T {
	return cloudflareContext.run(context, callback)
}

export function getCloudflareContext(): CloudflareContext | undefined {
	return cloudflareContext.getStore()
}
