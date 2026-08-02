# Security

The Epic Stack has several security measures in place to protect your users and
yourself. This (incomplete) document, explains some of the security measures
that are in place and how to use them.

## Content Security Policy

The Epic Stack uses a strict
[Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP).
This means that only resources from trusted sources are allowed to be loaded.
However, by default, the CSP is set to `report-only` which means that the
browser will report violations of the CSP without actually blocking the
resource.

This is to prevent new users of the Epic Stack from being blocked or surprised
by the CSP by default. However, it is recommended to enable the CSP in
`app/entry.server.tsx` by removing the `reportOnly: true` option.

## Secrets

The currently recommended policy for managing secrets is to place them in a
`.env` file in the root of the application (which is `.gitignore`d). There is a
`.env.example` which can be used as a template for this file (and if you do not
need to actually connect to real services, this can be used as
`cp .env.example .env`).

Production and staging secrets are stored separately with `wrangler secret put`
or `wrangler secret bulk`. See [the deployment guide](./deployment.md). Never
commit `.env`, `.dev.vars`, or bulk secret files.

## [Cross-Site Scripting (XSS)](https://developer.mozilla.org/en-US/docs/Glossary/Cross-site_scripting)

React has built-in support for XSS protection. It does this by escaping all
values by default. This means that if you want to render HTML, you need to use
the `dangerouslySetInnerHTML` prop. This is a good thing, but it does mean that
you need to be careful when rendering HTML. Never pass anything that is
user-generated to this prop.

## [Cross-Site Request Forgery (CSRF)](https://forms.epicweb.dev/07)

The Epic Stack has built-in support to prevent CSRF attacks. We use the
[`remix-utils`](https://github.com/sergiodxa/remix-utils)
[CSRF-related utilities](https://github.com/sergiodxa/remix-utils#csrf) to do
this.

## [Honeypot](https://forms.epicweb.dev/06)

The Epic Stack has built-in support for honeypot fields. We use the
[`remix-utils`](https://github.com/sergiodxa/remix-utils)
[honeypot-related utilities](https://github.com/sergiodxa/remix-utils#form-honeypot)
to do this.

## Rate Limiting

Rate limiting runs in both runtimes at three tiers: 10 requests per minute for
authentication, verification, password reset, onboarding, settings mutations,
and administrative paths; 100 for other mutations; 1000 for everything else.

Which tier a request falls into is decided in one shared module,
[`app/utils/rate-limit.server.ts`](../app/utils/rate-limit.server.ts). Add a new
sensitive path to `STRONG_PATHS` there and both runtimes pick it up — do not
duplicate the list.

- **Production (Worker):** Cloudflare rate-limiting bindings declared in
  `wrangler.jsonc`. The check runs before a Hyperdrive client is opened, so a
  flood cannot exhaust the database connection pool. The key derives from
  `CF-Connecting-IP`, which Cloudflare sets itself and strips from client input,
  so it cannot be spoofed the way `X-Forwarded-For` can.
- **Node harness:** `express-rate-limit` with the same tiers, deliberately
  loosened during development and Playwright runs.

## Security Headers

The nonce-based Content-Security-Policy is built per render in
`app/entry.server.tsx`. Every other security header comes from
[`app/utils/security-headers.server.ts`](../app/utils/security-headers.server.ts),
which both the Worker and the Node harness apply, so the two cannot drift.
`Referrer-Policy` is deliberately omitted because it breaks the `redirectTo`
flow.
