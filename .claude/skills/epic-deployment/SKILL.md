---
name: epic-deployment
description:
  Guide on deployment with Cloudflare Workers, Amazon RDS, S3, and CI/CD
categories:
  - deployment
  - cloudflare
  - workers
  - ci-cd
---

# Epic Stack: Deployment

## When to use this skill

Use this skill when you need to:

- Deploy to Cloudflare Workers (staging or production)
- Configure Wrangler bindings, secrets, or environments
- Set up or change the CI/CD workflow
- Apply database migrations as part of a deploy
- Debug a deploy that built locally but failed on Cloudflare
- Roll back a bad release

## The shape of the deployment

One React Router application, two runtimes:

|                        | Runtime            | Entry                          | Used for                  |
| ---------------------- | ------------------ | ------------------------------ | ------------------------- |
| **Production/staging** | Cloudflare Workers | `workers/app.ts`               | Real traffic              |
| **Local/test**         | Node + Express     | `index.ts` → `server/index.ts` | `npm run dev`, Playwright |

Persistence lives outside Cloudflare: **PostgreSQL on Amazon RDS** (reached
through Hyperdrive) and **Amazon S3** for uploaded images, resized on the fly by
Cloudflare Image Transformations.

There is no container image, no volume, no primary region, and no instance to
SSH into. A Worker isolate is created and destroyed constantly — never assume
anything survives between requests except what is in Postgres, S3, or KV.

### Bindings

Declared in `wrangler.jsonc`. **Wrangler environments do not inherit top-level
bindings**, so every binding is repeated verbatim under `env.staging` and
`env.production`. Forgetting to add a new binding to all three places is the
single most common configuration bug here.

| Binding                                                             | Purpose                                      |
| ------------------------------------------------------------------- | -------------------------------------------- |
| `HYPERDRIVE`                                                        | Pooled Postgres connection string for RDS    |
| `CACHE_KV`                                                          | Shared cache tier behind the per-isolate LRU |
| `STRONGEST_RATE_LIMIT` / `STRONG_RATE_LIMIT` / `GENERAL_RATE_LIMIT` | 10 / 100 / 1000 requests per minute          |
| `ASSETS`                                                            | Static client build                          |

Placeholder ids are all-zero on purpose, so a misconfigured deploy fails instead
of silently connecting to the wrong database.

## Patterns and conventions

### Deployable Commits

Following Epic Web principles:

**Deployable commits** - Every commit to the main branch should be deployable.
This means:

- The code should be in a working state
- Tests should pass
- The application should build successfully
- No "WIP" or "TODO" commits that break the build

**Benefits:**

- Easy rollback - any commit can be deployed
- Continuous deployment - deploy any time
- Clear history - each commit represents a working state
- Faster recovery - can deploy any previous commit

### Small and Short Lived Merge Requests

Following Epic Web principles:

**Small and short lived merge requests** - Keep PRs small and merge them
quickly. Large PRs are hard to review, risky to merge, and slow down the team.

**Guidelines:**

- **Small PRs** - Focus on one feature or fix per PR
- **Short-lived** - Merge within a day or two, not weeks
- **Reviewable** - PRs should be reviewable in 30 minutes or less
- **Independent** - Each PR should be independently deployable

**When PRs get too large:**

- Split into multiple smaller PRs
- Use feature flags to merge incrementally
- Break down into logical pieces

### Building

`CLOUDFLARE_ENV` must be set **at build time**, not only at deploy time. The
Vite plugin flattens the selected Worker environment into the bundle; running
`wrangler deploy --env X` after a build made without `CLOUDFLARE_ENV=X` deploys
the wrong configuration.

```bash
npm run build:worker            # default environment
npm run build:worker:staging
npm run build:worker:production

npm run deploy:staging          # builds, then deploys
npm run deploy:production
```

`CLOUDFLARE_WORKERS=true` additionally switches `#prisma-client` to the
Cloudflare-runtime Prisma client. That is why there are two build scripts rather
than one.

**Validate without touching Cloudflare state:**

```bash
npm run build:worker:staging
CLOUDFLARE_ENV=staging npx wrangler deploy --dry-run
```

### Local development

```bash
npm run db:start      # Postgres via compose.yaml
npm run dev           # Node harness + MSW mocks, reads .env
npm run dev:worker    # real workerd runtime, reads .dev.vars
```

Use `dev:worker` when the change touches anything runtime-specific: Hyperdrive,
KV, rate limiting, `cf: { image }` transformations, or the Worker's response
headers. `npm run dev` does not exercise any of those.

### Secrets

Secrets live in Cloudflare, never in `wrangler.jsonc` (`vars` are plaintext and
visible in the dashboard).

```bash
npx wrangler secret put SESSION_SECRET --env production
npx wrangler secret bulk .secrets.production --env production
```

`wrangler.jsonc` declares required secret names under `secrets.required`, so a
deploy fails loudly when one was never set. GitHub only needs
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `PRODUCTION_DATABASE_URL`, and
`STAGING_DATABASE_URL`.

### Amazon S3 Object Storage

```bash
aws s3 mb s3://[YOUR_BUCKET_NAME] --region [YOUR_AWS_REGION]
```

Keep Block Public Access enabled and grant the IAM user only `s3:GetObject` and
`s3:PutObject` on that bucket's objects. Workers cannot assume an EC2 instance
role, so this is a long-lived access key stored as a Worker secret — scope it
tightly and rotate it.

### Database Migrations

Prisma CLI cannot run inside a Worker, and Hyperdrive is a runtime pool, not a
migration path. Migrations run from CI over a **direct** `DATABASE_URL` before
`wrangler deploy`:

```yaml
- name: Apply production migrations
  if: github.ref == 'refs/heads/main'
  run: npx prisma migrate deploy
  env:
    DATABASE_URL: ${{ secrets.PRODUCTION_DATABASE_URL }}
```

Because migrations land before the new code, use **"widen then narrow"** for
anything destructive: add the new column, deploy code that writes both,
backfill, then remove the old column in a later deploy.

Do not make RDS publicly reachable just to let a hosted runner connect. Use a
self-hosted runner or private connectivity.

### Database Backups

Backups are RDS automated backups and snapshots, configured in AWS — not
something this repo does. Verify the retention window and **test a restore**
before launch; an untested backup is not a backup.

### CI/CD

`.github/workflows/deploy.yml` runs lint, typecheck, both builds, Vitest, and
Playwright. On success, a push to `dev` deploys staging and a push to `main`
deploys production. Both test jobs run a real Postgres service container — there
is no in-memory database to fall back on.

### Environment Detection

```typescript
// Worker vars, not FLY_* — see app/utils/env.server.ts
const isProduction = process.env.ALLOW_INDEXING === 'true'
```

Prefer explicit Worker `vars` in `wrangler.jsonc` over inferring the environment
from a name. Add a var to all three config blocks when you introduce one.

### Rollback

Deploys are immutable versions. Roll back through the dashboard, or:

```bash
npx wrangler deployments list --env production
npx wrangler rollback [VERSION_ID] --env production
```

**A code rollback does not undo a migration.** If the bad deploy included a
schema change, roll the schema forward with a new migration instead of reverting
it.

## Common mistakes to avoid

- ❌ **Adding a binding only at the top level**: environments do not inherit;
  add it to `env.staging` and `env.production` too
- ❌ **Deploying without `CLOUDFLARE_ENV` at build time**:
  `wrangler deploy --env` alone deploys a bundle built for the wrong environment
- ❌ **Leaving placeholder all-zero ids**: replace them with real Hyperdrive and
  KV ids before deploying
- ❌ **Testing runtime behaviour with `npm run dev`**: use `npm run dev:worker`
  for Hyperdrive, KV, rate limits, or image transformations
- ❌ **Running migrations through Hyperdrive**: use a direct `DATABASE_URL`
- ❌ **Assuming a rollback reverts the database**: roll schema changes forward
- ❌ **Non-deployable commits**: every commit to main should be deployable
- ❌ **Large, long-lived PRs**: keep PRs small and merge quickly
- ❌ **Secrets in `vars`**: `vars` are plaintext; use `wrangler secret`
- ❌ **Storing state in module scope**: isolates are short-lived and numerous
- ❌ **Treating KV as authoritative**: it is eventually consistent, cache only
- ❌ **Exposing RDS publicly for CI convenience**: use private connectivity
- ❌ **`CLOUDFLARE_API_TOKEN` in the repo**: GitHub Secrets only

## References

- [Epic Web Principles](https://www.epicweb.dev/principles)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Hyperdrive](https://developers.cloudflare.com/hyperdrive/)
- [Rate limiting bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Workers KV](https://developers.cloudflare.com/kv/)
- `wrangler.jsonc` - Worker configuration and bindings
- `workers/app.ts` - Worker entry point
- `docs/deployment.md` - Step-by-step deployment guide
- `docs/amazon-rds-postgresql.md` - RDS provisioning
- `.github/workflows/deploy.yml` - CI/CD workflow
