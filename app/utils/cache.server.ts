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

// Keep the generic name at call sites while using a single process-local cache.
export const cache = lruCache

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
