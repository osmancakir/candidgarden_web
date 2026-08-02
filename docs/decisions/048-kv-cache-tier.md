# Workers KV Cache Tier

Date: 2026-08-02

Status: accepted

## Context

The Epic Stack had two caches: a persistent SQLite cache replicated by LiteFS,
and a short-lived in-memory LRU. The PostgreSQL migration removed the SQLite
cache and left only the LRU.

That is a worse trade than it looks on Cloudflare Workers. A Node server holds
one long-lived process, so an LRU accumulates useful entries. A Worker isolate
is created and destroyed constantly and there are many of them at once, so an
LRU alone has a near-zero hit rate across real traffic — every isolate starts
cold. The cache was effectively decorative.

Options considered:

- **Workers KV** — designed for read-heavy, eventually consistent data;
  co-located with the Worker; no connection cost.
- **D1** — a real SQLite database, closest to what the Epic Stack had, but it is
  a second database to run migrations against for data that is disposable.
- **Amazon ElastiCache** — strongly consistent, but a Worker reaching it pays a
  network round trip to the AWS region on every cache read, which defeats the
  purpose, and it must be exposed to the internet or reached over a tunnel.
- **Cache API** — already used for transformed images, but it is per-location
  and keyed by `Request`, which does not fit arbitrary values.

## Decision

Use a two-tier cache: the per-isolate LRU in front of a Workers KV namespace,
exposed as a single `cache` object so `cachified` call sites are unchanged.

KV writes go through `ctx.waitUntil` so they never delay the response. A KV hit
populates the LRU so repeat lookups within a request skip the round trip. When
there is no KV binding — the Node harness, Vitest — the cache degrades silently
to LRU-only.

## Consequences

Cached values survive isolate churn, which is what makes caching worth doing
here at all.

The costs are real and must be respected at call sites:

- **Eventually consistent.** A write may take up to a minute to become visible
  elsewhere and deletes are not immediate, so nothing authoritative may live in
  KV and read-modify-write through the cache is forbidden.
- **JSON only.** A `Date` round-trips as a string.
- **60 second minimum TTL.** Shorter entries stay in the LRU only.
- **No bulk delete**, so `/admin/cache` can only enumerate the serving isolate's
  LRU. It is a debugging aid, not an inventory.
