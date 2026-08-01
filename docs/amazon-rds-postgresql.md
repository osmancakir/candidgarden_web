# Amazon RDS for PostgreSQL

The application database uses PostgreSQL and its baseline migration enables the
`vector` extension. Amazon RDS for PostgreSQL supports this extension.

> This repository rewrites the original SQLite baseline because the application
> has not shipped data yet. It does not copy data from an existing SQLite
> database. If a populated SQLite database exists, export and transform that
> data before deploying this baseline.

## Local development

The Compose service uses the official pgvector PostgreSQL image and creates
separate development and test databases.

```sh
cp .env.example .env
npm run db:start
npx prisma migrate deploy
npx prisma generate --sql
npx prisma db seed
```

Stop the local database with `npm run db:stop`. Its data remains in the
`postgres-data` Docker volume.

## Create the RDS database

Use **Amazon RDS for PostgreSQL**, not an RDS engine such as MySQL. PostgreSQL
17 is a conservative default for this project; verify the selected minor version
in AWS's
[supported extension table](https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-extensions.html)
before creating the instance.

In the RDS console:

1. Create a PostgreSQL DB instance and a database named `candidgarden`.
2. Enable storage encryption, automated backups, and deletion protection for
   production.
3. Prefer private access when the application runs in the same VPC. An app
   hosted outside AWS needs explicit network connectivity to that VPC. If a
   public development instance is unavoidable, restrict its security group to
   known source addresses and do not allow `0.0.0.0/0` on port 5432.
4. Store credentials in a secret manager or in the deployment platform's secret
   store. Never commit the connection URL.

The first migration must run as a database user that can execute
`CREATE EXTENSION vector`. The initial RDS administrator can do this for a new
database. Apply the checked-in migration once connectivity is available:

```sh
DATABASE_URL='postgresql://USER:PASSWORD@RDS_ENDPOINT:5432/candidgarden?schema=public&sslmode=require&connection_limit=5' \
  npx prisma migrate deploy
```

URL-encode special characters in the username and password. RDS for PostgreSQL
15 and later requires TLS by default. `sslmode=require` encrypts traffic; for
server identity verification, install the
[Amazon RDS CA bundle](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html)
and use `sslmode=verify-full` with `sslrootcert` in the connection
configuration.

Verify the extension and migrations:

```sql
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
SELECT migration_name, finished_at
FROM "_prisma_migrations"
ORDER BY finished_at DESC;
```

## Configure the deployed app

Set `DATABASE_URL` as a runtime secret on every environment. For the current Fly
deployment:

```sh
fly secrets set DATABASE_URL='postgresql://USER:PASSWORD@RDS_ENDPOINT:5432/candidgarden?schema=public&sslmode=require&connection_limit=5' --app YOUR_APP
```

Use a separate RDS database or instance for staging. Do not point
`TEST_DATABASE_URL` at production; the test harness deliberately resets schemas
and rejects database names that do not contain `test`.

RDS Proxy is optional. It becomes useful when connection churn or the number of
application instances approaches the database connection limit, but it is not
required for the first deployment.
