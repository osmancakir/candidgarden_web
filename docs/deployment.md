# Deployment

The current application container is configured for Fly.io and uses Amazon RDS
for PostgreSQL as its application database.

## Fly.io setup

1. Install Fly and authenticate:

   ```sh
   fly auth login
   ```

2. Create production and staging apps:

   ```sh
   fly apps create YOUR_APP
   fly apps create YOUR_APP-staging
   ```

3. Create separate RDS PostgreSQL databases for production and staging. Follow
   [the RDS setup guide](./amazon-rds-postgresql.md), including its networking
   and TLS guidance.

4. Add application secrets:

   ```sh
   fly secrets set DATABASE_URL='YOUR_PRODUCTION_RDS_URL' SESSION_SECRET='YOUR_RANDOM_SECRET' HONEYPOT_SECRET='YOUR_RANDOM_SECRET' --app YOUR_APP
   fly secrets set DATABASE_URL='YOUR_STAGING_RDS_URL' SESSION_SECRET='YOUR_RANDOM_SECRET' HONEYPOT_SECRET='YOUR_RANDOM_SECRET' ALLOW_INDEXING=false --app YOUR_APP-staging
   ```

5. Set up Tigris object storage for uploaded images:

   ```sh
   fly storage create --app YOUR_APP
   fly storage create --app YOUR_APP-staging
   ```

6. Add a `FLY_API_TOKEN` to the GitHub repository secrets if deployments run
   through the included GitHub Actions workflow.

No Fly volume or Consul attachment is needed. Application state is in RDS and
object storage; the small LRU cache is process-local and disposable.

## Container startup

The production image performs these operations in order:

1. `prisma migrate deploy`
2. `prisma generate --sql`
3. `npm start`

Prisma's PostgreSQL advisory lock serializes concurrent migration attempts
during rolling deployments.

## Local container build

```sh
docker build -t candidgarden -f other/Dockerfile --build-arg COMMIT_SHA=$(git rev-parse --short HEAD) .
docker run --rm -p 8080:8080 \
  -e DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/candidgarden?schema=public' \
  -e SESSION_SECRET='somesecret' \
  -e HONEYPOT_SECRET='somesecret' \
  candidgarden
```

The application is then available at `http://localhost:8080`.
