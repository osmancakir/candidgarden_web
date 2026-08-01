# Caching

The application has one process-local LRU cache, exposed through
`app/utils/cache.server.ts`. It is used through
[`cachified`](https://www.npmjs.com/package/@epic-web/cachified) for values that
are slow or rate-limited to retrieve.

The cache is intentionally ephemeral:

- each application instance has its own entries;
- entries disappear when an instance restarts;
- no application correctness may depend on a cached value existing.

This is sufficient for the current GitHub profile lookup. If shared caching
becomes necessary later, replace the cache adapter with a managed service such
as Amazon ElastiCache rather than storing cache data on the application host.

## Usage

```tsx
import { cache, cachified } from '#app/utils/cache.server.ts'

const result = await cachified({
	key: 'example:key',
	cache,
	ttl: 1000 * 60,
	swr: 1000 * 60 * 60,
	getFreshValue: async () => fetchExpensiveValue(),
})
```

Administrators can inspect or evict entries at `/admin/cache` on the instance
serving that request.
