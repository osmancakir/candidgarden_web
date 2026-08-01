# Database

The application uses PostgreSQL through Prisma. Production is designed for
Amazon RDS for PostgreSQL, and local development uses the pgvector PostgreSQL
container in `compose.yaml`.

See [Amazon RDS for PostgreSQL](./amazon-rds-postgresql.md) for provisioning,
networking, TLS, and production connection instructions.

## Local development

```sh
npm run db:start
npx prisma migrate deploy
npx prisma generate
npx prisma db seed
```

Open Prisma Studio with:

```sh
npx prisma studio
```

Stop the local database with `npm run db:stop`. The Compose volume preserves the
data between container restarts.

## Schema changes

Update `prisma/schema.prisma`, then create and review a migration:

```sh
npx prisma migrate dev --name describe_the_change
npx prisma generate
```

Commit both the Prisma schema and generated migration. Deployments apply
checked-in migrations with `prisma migrate deploy` before deploying the Worker.

## Production operations

Use RDS automated backups and point-in-time recovery for application data. Keep
production, staging, development, and test databases separate. Never run
`prisma migrate reset` against production.

The Worker connects to RDS through a cache-disabled Hyperdrive binding. Prisma
migrations do not run inside the Worker; run them from CI or an administrative
machine that has direct network access to RDS.
