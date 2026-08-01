# Cloudflare Workers Deployment

The production application runs as a server-rendered React Router application on
Cloudflare Workers. Amazon RDS remains the PostgreSQL system of record and is
reached through Cloudflare Hyperdrive. Uploaded images remain in private Amazon
S3 buckets.

The Node/Express entry point is retained only as the local development and test
harness. Fly.io, its container image, and its deployment workflow are no longer
used.

## 1. Prepare Amazon RDS for Hyperdrive

Create separate RDS PostgreSQL databases and users for production and staging.
Follow the [RDS setup guide](./amazon-rds-postgresql.md), including TLS,
backups, and least-privilege database permissions.

Hyperdrive must be able to reach the database. Use one of Cloudflare's
documented AWS RDS connectivity options:

- a public RDS endpoint whose security group permits the documented Hyperdrive
  egress addresses; or
- a private connection through Workers VPC or Cloudflare Tunnel.

See Cloudflare's
[Amazon RDS/Aurora guide](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/aws-rds-aurora/)
before changing the RDS network boundary.

Create cache-disabled Hyperdrive configurations because this application has
authentication, sessions, mutations, and read-after-write behavior:

```sh
npx wrangler hyperdrive create candidgarden-production \
  --connection-string="$PRODUCTION_DATABASE_URL" \
  --caching-disabled \
  --sslmode=verify-full

npx wrangler hyperdrive create candidgarden-staging \
  --connection-string="$STAGING_DATABASE_URL" \
  --caching-disabled \
  --sslmode=verify-full
```

Replace the all-zero Hyperdrive IDs under `env.production` and `env.staging` in
`wrangler.jsonc` with the IDs returned by those commands. The placeholder IDs
deliberately prevent a real deployment from connecting to an unintended
database.

## 2. Prepare Amazon S3

Create separate private buckets and IAM users for production and staging. Keep
S3 Block Public Access enabled and grant each IAM user only `s3:GetObject` and
`s3:PutObject` for its own bucket. The complete policy is in the
[image storage guide](./image-storage.md).

Cloudflare Workers cannot assume an EC2 instance role, so the scoped IAM access
key and secret key must be stored as Worker secrets.

Cloudflare Image Transformations must be enabled for the account/zone used by
the Worker. The application uses it instead of Sharp and caches transformed
images at the edge.

## 3. Configure Worker secrets

Create local files that are not committed to Git:

```dotenv
# .secrets.production
SESSION_SECRET="a-long-random-production-value"
HONEYPOT_SECRET="a-different-long-random-value"
AWS_ACCESS_KEY_ID="production-iam-access-key"
AWS_SECRET_ACCESS_KEY="production-iam-secret-key"
AWS_REGION="eu-central-1"
AWS_S3_BUCKET="production-private-bucket"

# Optional integrations
RESEND_API_KEY="..."
SENTRY_DSN="..."
GITHUB_CLIENT_ID="..."
GITHUB_CLIENT_SECRET="..."
GITHUB_REDIRECT_URI="https://your-domain.example/auth/github/callback"
```

Create an equivalent `.secrets.staging` file with staging-only credentials, then
upload both sets:

```sh
npx wrangler secret bulk .secrets.production \
  --config wrangler.jsonc --env production
npx wrangler secret bulk .secrets.staging \
  --config wrangler.jsonc --env staging
```

The required secret names are declared in `wrangler.jsonc`. `ALLOW_INDEXING` is
a non-secret Worker variable: it is `false` in staging and `true` in production.

For Worker-runtime local development, copy `.dev.vars.example` to `.dev.vars`.
The existing `npm run dev` command continues to use the Node/MSW harness and
`.env`.

## 4. Apply database migrations

Prisma CLI does not run inside the Worker. Apply checked-in migrations from a
trusted machine or CI runner that has direct RDS network access:

```sh
DATABASE_URL="$PRODUCTION_DATABASE_URL" npx prisma migrate deploy
DATABASE_URL="$STAGING_DATABASE_URL" npx prisma migrate deploy
```

Never expose RDS publicly only to make a generic hosted CI runner work. Use a
self-hosted runner, private connectivity, or a short-lived tightly scoped
administrative path when the database is private.

## 5. Build and deploy

Authenticate Wrangler, then build and deploy the selected environment:

```sh
npx wrangler login
npm run deploy:staging
npm run deploy:production
```

The build uses `CLOUDFLARE_ENV` so the Vite plugin flattens the correct Worker
environment before Wrangler deploys it. Passing only `wrangler deploy --env`
after a Vite build is not sufficient.

To validate the bundle without changing Cloudflare state:

```sh
npm run build:worker:staging
CLOUDFLARE_ENV=staging npx wrangler deploy --dry-run
```

## 6. Configure GitHub Actions

The deployment workflow expects these GitHub repository secrets:

- `CLOUDFLARE_API_TOKEN` with permission to deploy the Worker;
- `CLOUDFLARE_ACCOUNT_ID`;
- `PRODUCTION_DATABASE_URL`; and
- `STAGING_DATABASE_URL`.

The Worker application secrets from step 3 live in Cloudflare, not GitHub. A
push to `dev` deploys staging and a push to `main` deploys production after
linting, type checking, the Node and Worker builds, Vitest, Playwright, and the
database migration succeed.

## 7. Domains, rate limits, and observability

Attach production and staging custom domains in the Cloudflare dashboard or add
environment-specific routes to `wrangler.jsonc`. Update OAuth callback URLs
after the domains are final.

The former Express rate limiter does not run in production. Configure Cloudflare
WAF/rate-limiting rules for authentication, verification, password reset,
onboarding, settings mutations, and administrative paths before public launch.

Workers Logs and traces are enabled at a 10% sampling rate in `wrangler.jsonc`.
Adjust the sampling rate after observing production traffic and cost. The small
application LRU is isolate-local, opportunistic, and never authoritative.
