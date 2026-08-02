# Caching

The application has a two-tier cache, exposed as `cache` from
`app/utils/cache.server.ts` and used through
[`cachified`](https://www.npmjs.com/package/@epic-web/cachified) for values that
are slow or rate-limited to retrieve.

1. **Per-isolate LRU** — read first, written on every set, and populated on a KV
   hit. A Worker isolate can live for only seconds, so this tier mostly serves
   repeat lookups within a single request.
2. **Workers KV (`CACHE_KV`)** — shared across isolates and regions. This is
   what makes caching worthwhile on Workers at all; writes go through
   `ctx.waitUntil`, so they never delay the response.

Outside the Worker runtime — the Node harness, Vitest — there is no KV binding
and the cache degrades to LRU-only. No application correctness may depend on a
cached value existing.

### KV constraints worth knowing

- **Eventually consistent.** A write can take up to a minute to become visible
  elsewhere, and deletes are not immediate. Never read-modify-write through the
  cache; PostgreSQL is the only source of truth.
- **JSON only.** A `Date` round-trips as a string. Cache plain data, or revive
  it in the consumer.
- **60 second minimum TTL.** Shorter-lived entries stay in the LRU only.
- **No bulk delete.** Delete keys you know about, or let a short TTL age a bad
  value out.

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

Administrators can inspect or evict entries at `/admin/cache`. That view lists
keys from the LRU of the isolate serving the request only — KV has no cheap
enumeration, and every isolate holds a different subset. Treat it as a debugging
aid, not an inventory.
