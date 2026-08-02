# Rate Limiting in the Worker

Date: 2026-08-02

Status: accepted

## Context

The Epic Stack rate-limits in Express middleware. After the Cloudflare Workers
migration that middleware only ran in the local development and Playwright
harness — the deployed Worker never loads `server/index.ts`. Production was left
relying on Cloudflare WAF rate-limiting rules configured by hand in the
dashboard.

That is unversioned. The limits are invisible in code review, absent from
preview deployments, easy to forget when standing up a new environment, and
silently missing until someone notices the abuse.

The same problem applied to security headers: the Node harness used
`@nichtsam/helmet`, while the Worker hand-rolled a shorter list that was missing
HSTS. Two implementations of the same intent drift.

## Decision

Enforce rate limiting in the Worker using Cloudflare rate-limiting bindings
declared in `wrangler.jsonc`, at the same three tiers the Express limiter uses:
10, 100, and 1000 requests per minute.

Both runtimes decide _which_ tier a request falls into by calling
`getRateLimitTier` in `app/utils/rate-limit.server.ts`. Only the enforcement
mechanism differs. The same pattern applies to security headers, which both
runtimes read from `app/utils/security-headers.server.ts`.

The Worker checks the limit before opening a Hyperdrive client, so a flood
cannot exhaust the database connection pool. The rate-limit key derives from
`CF-Connecting-IP`, which Cloudflare sets itself and strips from client input.

## Consequences

Limits are versioned with the code, apply to every environment including
previews, and are visible in `wrangler deploy --dry-run` output. Adding a
sensitive path means editing one list.

Constraints inherited from the platform:

- `simple.period` accepts only 10 or 60 seconds.
- Rate-limiting bindings are best-effort and account-local rather than a
  globally exact counter, so treat the limits as abuse protection, not quota
  accounting.
- The bindings must be repeated under each Wrangler environment, since
  environments do not inherit top-level bindings.

WAF rules remain available for coarser controls such as country blocking and bot
scoring, but are no longer required for basic abuse protection.
