<div align="center">
  <h1 align="center"><a href="https://www.epicweb.dev/epic-stack">The Epic Stack 🚀</a></h1>
  <strong align="center">
    Ditch analysis paralysis and start shipping Epic Web apps.
  </strong>
  <p>
    This is an opinionated project starter and reference that allows teams to
    ship their ideas to production faster and on a more stable foundation based
    on the experience of <a href="https://kentcdodds.com">Kent C. Dodds</a> and
    <a href="https://github.com/epicweb-dev/epic-stack/graphs/contributors">contributors</a>.
  </p>
</div>

```sh
npx epicli
```

[![The Epic Stack](https://github-production-user-asset-6210df.s3.amazonaws.com/1500684/246885449-1b00286c-aa3d-44b2-9ef2-04f694eb3592.png)](https://www.epicweb.dev/epic-stack)

[The Epic Stack](https://www.epicweb.dev/epic-stack)

<hr />

## PostgreSQL and Amazon RDS migration

**Commit:** `migrate application to PostgreSQL for Amazon RDS`

This project has been fully migrated from SQLite to PostgreSQL and prepared for
Amazon RDS for PostgreSQL with pgvector support.

The migration includes:

- changing the Prisma datasource and initial migration to PostgreSQL;
- enabling the `vector` extension in the database baseline;
- updating TypedSQL queries for PostgreSQL syntax and behavior;
- adding a local PostgreSQL 17 + pgvector environment with Docker Compose;
- moving the test suite to isolated PostgreSQL schemas;
- removing the SQLite application database, persistent SQLite cache, LiteFS, Fly
  volumes, Consul coordination, and SQLite administration routes;
- retaining only a disposable, process-local LRU cache for GitHub profile
  lookups; and
- updating the production Docker and Fly configuration to connect through
  `DATABASE_URL` and apply Prisma migrations before startup.

The PostgreSQL migration, pgvector installation, authorization seed data,
TypedSQL generation, test suite, type checking, linting, application build, and
production Docker image build have all been verified successfully.

The repository is RDS-ready, but AWS access keys alone do not provision the
infrastructure. An RDS PostgreSQL instance, database credentials, networking,
security groups, TLS configuration, and a production `DATABASE_URL` must still
be created. See the [Amazon RDS setup guide](./docs/amazon-rds-postgresql.md)
for the deployment requirements.

Because this migration rewrites the original baseline for a new application, it
does not copy records from an existing SQLite database. A populated legacy
database would require a separate data-export and transformation process.

## Watch Kent's Introduction to The Epic Stack

[![Epic Stack Talk slide showing Flynn Rider with knives, the text "I've been around and I've got opinions" and Kent speaking in the corner](https://github-production-user-asset-6210df.s3.amazonaws.com/1500684/277818553-47158e68-4efc-43ae-a477-9d1670d4217d.png)](https://www.epicweb.dev/talks/the-epic-stack)

["The Epic Stack" by Kent C. Dodds](https://www.epicweb.dev/talks/the-epic-stack)

## Docs

[Read the docs](https://github.com/epicweb-dev/epic-stack/blob/main/docs)
(please 🙏).

## Support

- 🆘 Join the
  [discussion on GitHub](https://github.com/epicweb-dev/epic-stack/discussions)
  and the [KCD Community on Discord](https://kcd.im/discord).
- 💡 Create an
  [idea discussion](https://github.com/epicweb-dev/epic-stack/discussions/new?category=ideas)
  for suggestions.
- 🐛 Open a [GitHub issue](https://github.com/epicweb-dev/epic-stack/issues) to
  report a bug.

## Branding

Want to talk about the Epic Stack in a blog post or talk? Great! Here are some
assets you can use in your material:
[EpicWeb.dev/brand](https://epicweb.dev/brand)

## Thanks

You rock 🪨
