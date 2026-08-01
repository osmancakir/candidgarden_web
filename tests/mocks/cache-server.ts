type CacheEntry<Value> = {
	metadata: {
		createdTime: number
		ttl?: number | null
		swr?: number | null
	}
	value: Value
}

const lruStore = new Map<string, CacheEntry<unknown>>()

export const lruCache = {
	name: 'test-lru-cache',
	set: (key: string, value: CacheEntry<unknown>) => {
		lruStore.set(key, value)
		return value
	},
	get: (key: string) => lruStore.get(key),
	delete: (key: string) => lruStore.delete(key),
}

export const cache = lruCache

export function getAllCacheKeys(limit: number) {
	return [...lruStore.keys()].slice(0, limit)
}

export function searchCacheKeys(search: string, limit: number) {
	const matches = (value: string) => value.includes(search)
	return [...lruStore.keys()].filter(matches).slice(0, limit)
}

export async function cachified<Value>(options: {
	getFreshValue: (context: {
		metadata: CacheEntry<unknown>['metadata']
	}) => Promise<Value> | Value
}): Promise<Value> {
	return options.getFreshValue({
		metadata: { createdTime: Date.now(), ttl: null, swr: null },
	})
}
