# Monitoring

This document describes how to get [Sentry](https://sentry.io/) (the Epic
application monitoring provider) set up for error, performance, and replay
monitoring.

> **NOTE**: this is an optional step and only needed if you want monitoring in
> production.

## SaaS vs Self-Hosted

Sentry offers both a [SaaS solution](https://sentry.io/) and
[self-hosted solution](https://develop.sentry.dev/self-hosted/). This guide
assumes you are using SaaS but the guide still works with self-hosted with a few
modifications.

## Signup

You can sign up for Sentry and create a Remix project from visiting
[this url](https://sentry.io/signup/?project_platform=javascript-remix) and
filling out the signup form.

## Setting up the sentry-vite plugin

Once you see the onboarding page which has the DSN, copy that somewhere (this
becomes `SENTRY_DSN`). Store it as a secret in both Worker environments:

```sh
npx wrangler secret put SENTRY_DSN --config wrangler.jsonc --env production
npx wrangler secret put SENTRY_DSN --config wrangler.jsonc --env staging
```

See the guides for React Router v7
[here(library)](https://docs.sentry.io/platforms/javascript/guides/react/features/react-router/v7/)
and
[here(framwork)](https://docs.sentry.io/platforms/javascript/guides/react-router/).
Note that the dedicated SDK for React Router is under development and features
are lacking.

To generate the auth token, click
[this](https://sentry.io/orgredirect/settings/:orgslug/developer-settings/new-internal/)
to create an internal integration (which grants the selected capabilities to the
recipient, similar to how RBAC works). Give it a name and add the scope for
`Releases:Admin` and `Organization:Read`. Press Save, and then generate the auth
token at the bottom of the page under "Tokens", and copy that to a secure
location (this becomes `SENTRY_AUTH_TOKEN`). Then visit the organization general
settings page and copy the organization slug (`SENTRY_ORG`), and the slug name
for your project under `Organization > Projects > Project > Name`
(`SENTRY_PROJECT`).

Add `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` to
[GitHub Actions secrets](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions)
so the Vite build can publish releases and source maps. You can do the same for
any other secret (environment variable) you need at build time, just make sure
those secrets (variables) are available on the CI runner: see the 'deploy' job
from [`deploy`](../.github/workflows/deploy.yml) workflow. Note that these do
not need to be added to the [`env.server`](../app/utils/env.server.ts) env vars
schema, as they are only used during the build and not the runtime.

The Sentry Vite plugin in [`vite.config.ts`](../vite.config.ts) will create
sentry releases for you and automatically associate commits during the vite
build once the `SENTRY_AUTH_TOKEN` is set. In this setup we have utilized a
simple strategy for naming releases using the commit SHA supplied by the GitHub
Actions deployment job.
