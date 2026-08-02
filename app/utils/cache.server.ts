import {
	cachified as baseCachified,
	verboseReporter,
	mergeReporters,
	type CacheEntry,
	type CachifiedOptions,
	type Cache,
	totalTtl,
	type CreateReporter,
} from '@epic-web/cachified'
import { remember } from '@epic-web/remember'
import { LRUCache } from 'lru-cache'
import { getCloudflareContext } from './cloudflare.server.ts'
import { cachifiedTimingReporter, type Timings } from './timing.server.ts'

const lru = remember(
	'lru-cache',
	() => new LRUCache<string, CacheEntry<unknown>>({ max: 5000 }),
)

export const lruCache = {
	name: 'app-memory-cache',
	set: (key, value) => {
		const ttl = totalTtl(value?.metadata)
		lru.set(key, value, {
			ttl: ttl === Infinity ? undefined : ttl,
			start: value?.metadata?.createdTime,
		})
		return value
	},
	get: (key) => lru.get(key),
	delete: (key) => lru.delete(key),
} satisfies Cache

/** KV's minimum accepted `expirationTtl`, in seconds. */
const KV_MIN_TTL_SECONDS = 60

function getKv() {
	return getCloudflareContext()?.env.CACHE_KV
}

/**
 * Workers KV, used as the shared tier behind the per-isolate LRU.
 *
 * Entries are JSON, so values must be JSON-serialisable — a `Date` comes back
 * as a string. Cache plain data, or revive it yourself in the `getFreshValue`
 * consumer.
 *
 * KV is eventually consistent: a write can take up to a minute to be visible in
 * other locations, and a delete is not immediate. That is fine for a cache and
 * wrong for anything authoritative.
 */
export const kvCache = {
	name: 'app-kv-cache',
	get: async (key) => {
		const kv = getKv()
		if (!kv) return undefined
		try {
			return (await kv.get(key, 'json')) as CacheEntry<unknown> | undefined
		} catch (error) {
			console.error('Failed to read from the KV cache', { key, error })
			return undefined
		}
	},
	set: async (key, value) => {
		const kv = getKv()
		if (!kv) return
		const ttl = totalTtl(value?.metadata)
		// KV rejects a sub-60s TTL, so short-lived entries live only in the LRU.
		if (ttl !== Infinity && ttl / 1000 < KV_MIN_TTL_SECONDS) return
		try {
			await kv.put(key, JSON.stringify(value), {
				expirationTtl: ttl === Infinity ? undefined : Math.floor(ttl / 1000),
			})
		} catch (error) {
			console.error('Failed to write to the KV cache', { key, error })
		}
	},
	delete: async (key) => {
		const kv = getKv()
		if (!kv) return
		try {
			await kv.delete(key)
		} catch (error) {
			console.error('Failed to delete from the KV cache', { key, error })
		}
	},
} satisfies Cache

/**
 * A two-tier cache: the per-isolate LRU in front, Workers KV behind it.
 *
 * Each Worker isolate is short-lived and has its own memory, so an LRU alone
 * gives a near-zero hit rate across a real traffic pattern — this is what
 * replaced the Epic Stack's persistent SQLite cache. Outside Workers there is
 * no KV binding and this degrades to exactly the LRU behaviour.
 */
export const cache = {
	name: 'app-cache',
	get: async (key) => {
		const memoryEntry = lruCache.get(key)
		if (memoryEntry !== undefined) return memoryEntry

		const kvEntry = await kvCache.get(key)
		// Warm the isolate so repeat hits in this request skip the KV round trip.
		if (kvEntry !== undefined) lruCache.set(key, kvEntry)
		return kvEntry
	},
	set: async (key, value) => {
		lruCache.set(key, value)

		const ctx = getCloudflareContext()?.ctx
		const write = kvCache.set(key, value)
		// Don't make the response wait on the KV write, but don't let the isolate
		// be torn down before it lands either.
		if (ctx) ctx.waitUntil(write)
		else await write
	},
	delete: async (key) => {
		lruCache.delete(key)
		await kvCache.delete(key)
	},
} satisfies Cache

/**
 * Admin cache routes list keys from the isolate-local LRU only. Enumerating KV
 * would need a paginated `list()` and would show a different set on every
 * isolate, so it is intentionally not wired up here.
 */
export function getAllCacheKeys(limit: number) {
	return [...lru.keys()].slice(0, limit)
}

export function searchCacheKeys(search: string, limit: number) {
	return [...lru.keys()].filter((key) => key.includes(search)).slice(0, limit)
}

export async function cachified<Value>(
	{
		timings,
		...options
	}: CachifiedOptions<Value> & {
		timings?: Timings
	},
	reporter: CreateReporter<Value> = verboseReporter<Value>(),
): Promise<Value> {
	return baseCachified(
		options,
		mergeReporters(cachifiedTimingReporter(timings), reporter),
	)
}
