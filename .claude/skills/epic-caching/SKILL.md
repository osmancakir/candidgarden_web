---
name: epic-caching
description:
  Guide on caching with cachified, the Workers KV cache, and the per-isolate LRU
  cache
categories:
  - caching
  - performance
  - optimization
---

# Epic Stack: Caching

## When to use this skill

Use this skill when you need to:

- Cache results of expensive queries
- Cache responses from external APIs
- Optimize performance of data that doesn't change frequently
- Implement stale-while-revalidate
- Manage cache invalidation
- Integrate cache with server timing

## Patterns and conventions

### Caching Philosophy

Following Epic Web principles:

**Weigh the cost-benefit of performance optimizations** - Caching adds
complexity. Only add cache when there's a clear, measurable benefit. Don't cache
"just in case" - cache when you have a real performance problem that caching
solves.

**When NOT to use cache:**

- Data that changes frequently (cache invalidation becomes a problem)
- Data that's already fast to fetch (no measurable benefit)
- Data that's only fetched once (no benefit from caching)
- Simple queries that don't need optimization
- When cache invalidation logic becomes more complex than the problem it solves

**Example - Evaluating cost-benefit:**

```typescript
// ✅ Good - Cache expensive external API call
export async function getGitHubEvents({
	username,
	timings,
}: {
	username: string
	timings?: Timings
}) {
	return await cachified({
		key: `github:${username}:events`,
		cache,
		timings,
		getFreshValue: async () => {
			// Expensive: External API call, rate limits, network latency
			const response = await fetch(
				`https://api.github.com/users/${username}/events/public`,
			)
			return await response.json()
		},
		checkValue: GitHubEventSchema.array(),
		ttl: 1000 * 60 * 60, // 1 hour - reasonable for external data
	})
}

// ❌ Avoid - Caching simple, fast database query
export async function getUser({ userId }: { userId: string }) {
	// This query is already fast - caching adds complexity without benefit
	return await cachified({
		key: `user:${userId}`,
		cache,
		getFreshValue: async () => {
			// Simple query, already fast
			return await prisma.user.findUnique({
				where: { id: userId },
				select: { id: true, username: true },
			})
		},
		ttl: 1000 * 60 * 5,
	})
	// Better: Just query directly without cache
}
```

### Two Tiers of Cache

`cache` in `app/utils/cache.server.ts` is a single two-tier cache. You almost
always want `cache`; the tiers are exported separately only for special cases.

1. **LRU (`lruCache`)** - per-isolate, in memory
   - Read first, and populated on a KV hit
   - Dies with the isolate, which on Workers can be seconds
   - Good for deduplication within a request

2. **Workers KV (`kvCache`)** - shared across isolates and regions
   - Survives isolate churn; this is what makes caching worth doing at all here
   - Written through `ctx.waitUntil`, so it never blocks the response
   - **Eventually consistent**: a write can take up to a minute to be visible
     elsewhere, and deletes are not immediate
   - Values are JSON, so a `Date` comes back as a string
   - Entries with a TTL under 60s are skipped — KV's minimum

Outside the Worker runtime (the Node harness, tests) there is no KV binding and
`cache` silently degrades to LRU-only. Never rely on the cache for correctness.

### Using cachified

Epic Stack uses `@epic-web/cachified` as an abstraction for cache management.

**Basic import:**

```typescript
import { cachified, cache } from '#app/utils/cache.server.ts'
import { type Timings } from '#app/utils/timing.server.ts'
```

**Basic structure:**

```typescript
export async function getCachedData({
	timings,
}: {
	timings?: Timings
} = {}) {
	return await cachified({
		key: 'my-cache-key',
		cache,
		timings,
		getFreshValue: async () => {
			// Get fresh data
			return await fetchDataFromAPI()
		},
		checkValue: z.object({
			/* schema */
		}), // Validation with Zod
		ttl: 1000 * 60 * 60 * 24, // 24 hours
		staleWhileRevalidate: 1000 * 60 * 60 * 24 * 30, // 30 days
	})
}
```

### Cache Keys

**Naming conventions:**

- Use format: `entity:identifier:data`
- Examples:
  - `user:${userId}:profile`
  - `note:${noteId}:full`
  - `api:github:events`
  - `tito:scheduled-events`

**Avoid:**

- Keys that are too long
- Keys with special characters
- Keys that don't clearly identify the content

### TTL (Time To Live)

**Define TTL:**

```typescript
await cachified({
	key: 'my-key',
	cache,
	getFreshValue: () => fetchData(),
	ttl: 1000 * 60 * 60 * 24, // 24 hours in milliseconds
})
```

**Null TTL to never expire:**

```typescript
ttl: null, // Never expires (not recommended unless necessary)
```

### Stale-While-Revalidate (SWR)

SWR allows returning stale data while fresh data is fetched in the background.

**Example:**

```typescript
await cachified({
	key: 'my-key',
	cache,
	getFreshValue: () => fetchData(),
	ttl: 1000 * 60 * 60 * 24, // 24 hours - after this it's considered stale
	staleWhileRevalidate: 1000 * 60 * 60 * 24 * 30, // 30 days - up to here returns stale while revalidating
})
```

**Behavior:**

- **Less than 24h**: Returns cache, no request made
- **24h - 30 days**: Returns stale cache immediately, updates in background
- **More than 30 days**: Waits for fresh data before returning

### Validation with Zod

Always validate cached data with Zod:

```typescript
import { z } from 'zod'

const EventSchema = z.object({
	id: z.string(),
	title: z.string(),
	date: z.string(),
})

export async function getEvents({ timings }: { timings?: Timings } = {}) {
	return await cachified({
		key: 'events:all',
		cache,
		timings,
		getFreshValue: async () => {
			const response = await fetch('https://api.example.com/events')
			return await response.json()
		},
		checkValue: EventSchema.array(), // Validates it's an array of events
		ttl: 1000 * 60 * 60 * 24, // 24 hours
	})
}
```

If cached data doesn't pass validation, fresh data is fetched.

### Server Timing Integration

Integrate cache with server timing for monitoring:

```typescript
import { type Timings } from '#app/utils/timing.server.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const timings: Timings = {}

	const events = await getEvents({ timings })

	// Timings are automatically added to headers
	return json(
		{ events },
		{
			headers: combineServerTimings(timings),
		},
	)
}
```

### Cache Invalidation

**Invalidate by key:**

```typescript
import { cache } from '#app/utils/cache.server.ts'

await cache.delete('user:123:profile')
```

**Invalidate multiple keys:**

```typescript
// Search and delete matching keys
import { searchCacheKeys } from '#app/utils/cache.server.ts'

const keys = await searchCacheKeys('user:123', 100)
await Promise.all(keys.map((key) => cache.delete(key)))
```

**There is no "clear everything":** KV has no bulk delete. Delete keys you know
about, or give entries a short enough TTL that a bad value ages out on its own.

### Using the LRU tier directly

For data that must not outlive the request, skip KV:

```typescript
import { lruCache } from '#app/utils/cache.server.ts'

// The LRU tier is useful for:
// - Request deduplication
// - Values too short-lived for KV's 60s minimum TTL
// - Values that are not JSON-serialisable

const cachedValue = lruCache.get('temp-key')
```

### Cache consistency across isolates

KV replicates asynchronously, so after `cache.delete(key)`:

- The isolate that ran the delete sees it immediately (its LRU is cleared)
- Other isolates may serve the old value for up to a minute — both from KV and
  from their own warm LRU entries

**Best practices:**

- Never read-modify-write through the cache; treat PostgreSQL as the only source
  of truth
- Prefer a short TTL over aggressive invalidation
- After a mutation, load fresh data for the current response rather than relying
  on the delete having propagated

### Error Handling

**Handle errors in getFreshValue:**

```typescript
await cachified({
	key: 'my-key',
	cache,
	getFreshValue: async () => {
		try {
			return await fetchData()
		} catch (error) {
			console.error('Failed to fetch fresh data:', error)
			throw error // Re-throw so cachified handles it
		}
	},
	// If getFreshValue fails and there's stale cache, it returns it
	fallbackToCache: true, // Default: true
})
```

### Cache Admin Dashboard

Epic Stack includes a dashboard to manage cache:

**Route:** `/admin/cache`

**Features:**

- View all cache keys
- Search keys
- View details of a key
- Delete keys
- Clear entire cache

## Common examples

### Example 1: Cache external API response

```typescript
// app/utils/api.server.ts
import { cachified, cache } from '#app/utils/cache.server.ts'
import { type Timings } from '#app/utils/timing.server.ts'
import { z } from 'zod'

const GitHubEventSchema = z.object({
	id: z.string(),
	type: z.string(),
	actor: z.object({
		login: z.string(),
	}),
	created_at: z.string(),
})

export async function getGitHubEvents({
	username,
	timings,
}: {
	username: string
	timings?: Timings
}) {
	return await cachified({
		key: `github:${username}:events`,
		cache,
		timings,
		getFreshValue: async () => {
			const response = await fetch(
				`https://api.github.com/users/${username}/events/public`,
			)
			if (!response.ok) {
				throw new Error(`GitHub API error: ${response.statusText}`)
			}
			const data = await response.json()
			return data
		},
		checkValue: GitHubEventSchema.array(),
		ttl: 1000 * 60 * 60, // 1 hour
		staleWhileRevalidate: 1000 * 60 * 60 * 24, // 24 hours
	})
}
```

### Example 2: Cache Prisma query

```typescript
// app/utils/user.server.ts
import { cachified, cache } from '#app/utils/cache.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { z } from 'zod'

const UserStatsSchema = z.object({
	totalNotes: z.number(),
	totalLikes: z.number(),
	joinDate: z.string(),
})

export async function getUserStats({
	userId,
	timings,
}: {
	userId: string
	timings?: Timings
}) {
	return await cachified({
		key: `user:${userId}:stats`,
		cache,
		timings,
		getFreshValue: async () => {
			const [totalNotes, totalLikes, user] = await Promise.all([
				prisma.note.count({ where: { ownerId: userId } }),
				prisma.like.count({ where: { userId } }),
				prisma.user.findUnique({
					where: { id: userId },
					select: { createdAt: true },
				}),
			])

			return {
				totalNotes,
				totalLikes,
				joinDate: user?.createdAt.toISOString() ?? '',
			}
		},
		checkValue: UserStatsSchema,
		ttl: 1000 * 60 * 5, // 5 minutes
		staleWhileRevalidate: 1000 * 60 * 60, // 1 hour
	})
}
```

### Example 3: Invalidate cache after mutation

```typescript
// app/routes/users/$username/notes/new.tsx
export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()

	// ... validate and create note

	const note = await prisma.note.create({
		data: {
			title,
			content,
			ownerId: userId,
		},
		include: { owner: true },
	})

	// Invalidate related cache
	await Promise.all([
		cache.delete(`user:${userId}:notes`),
		cache.delete(`user:${userId}:stats`),
		cache.delete(`note:${note.id}:full`),
	])

	return redirect(`/users/${note.owner.username}/notes/${note.id}`)
}
```

### Example 4: Cache with dependencies

```typescript
export async function getUserWithNotes({
	userId,
	timings,
}: {
	userId: string
	timings?: Timings
}) {
	const user = await cachified({
		key: `user:${userId}:profile`,
		cache,
		timings,
		getFreshValue: async () => {
			return await prisma.user.findUnique({
				where: { id: userId },
				select: {
					id: true,
					username: true,
					name: true,
				},
			})
		},
		checkValue: z
			.object({
				id: z.string(),
				username: z.string(),
				name: z.string().nullable(),
			})
			.nullable(),
		ttl: 1000 * 60 * 30, // 30 minutes
	})

	const notes = await cachified({
		key: `user:${userId}:notes`,
		cache,
		timings,
		getFreshValue: async () => {
			return await prisma.note.findMany({
				where: { ownerId: userId },
				select: {
					id: true,
					title: true,
					updatedAt: true,
				},
				orderBy: { updatedAt: 'desc' },
			})
		},
		checkValue: z.array(
			z.object({
				id: z.string(),
				title: z.string(),
				updatedAt: z.date(),
			}),
		),
		ttl: 1000 * 60 * 10, // 10 minutes
	})

	return { user, notes }
}
```

### Example 5: Use LRU for deduplication

```typescript
// Avoid multiple simultaneous requests to the same URL
const requestCache = new Map<string, Promise<any>>()

export async function fetchWithDedup(url: string) {
	if (requestCache.has(url)) {
		return requestCache.get(url)
	}

	const promise = fetch(url).then((res) => res.json())
	requestCache.set(url, promise)

	// Clean up after 1 second
	setTimeout(() => {
		requestCache.delete(url)
	}, 1000)

	return promise
}
```

## Common mistakes to avoid

- ❌ **Caching without measuring benefit**: Only add cache when there's a clear,
  measurable performance problem
- ❌ **Caching simple, fast queries**: Don't cache data that's already fast to
  fetch - it adds complexity without benefit
- ❌ **Caching frequently changing data**: Cache invalidation becomes more
  complex than the problem it solves
- ❌ **Caching sensitive data**: Never cache passwords, tokens, or sensitive
  personal data
- ❌ **TTL too long**: Avoid very long TTLs (> 1 week) unless absolutely
  necessary
- ❌ **Not validating cached data**: Always use `checkValue` with Zod to
  validate data
- ❌ **Forgetting to invalidate cache**: Invalidate cache after mutations
- ❌ **Assuming cache always works**: Cache can fail, always handle errors
- ❌ **Keys too long or ambiguous**: Use consistent and descriptive format
- ❌ **Not using timings**: Integrate with server timing for monitoring
- ❌ **Forgetting stale-while-revalidate**: Use SWR for better UX when
  appropriate
- ❌ **Over-caching**: Too much caching makes the system harder to understand
  and debug

## References

- [Epic Stack Caching Docs](../epic-stack/docs/caching.md)
- [Epic Web Principles](https://www.epicweb.dev/principles)
- [@epic-web/cachified](https://www.npmjs.com/package/@epic-web/cachified)
- `app/utils/cache.server.ts` - Cache implementation
- `app/routes/admin/cache/` - Admin dashboard
- `app/utils/timing.server.ts` - Server timing utilities
