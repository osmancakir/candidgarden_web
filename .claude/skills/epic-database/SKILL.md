---
name: epic-database
description:
  Guide on Prisma, PostgreSQL on Amazon RDS, and Cloudflare Hyperdrive
categories:
  - database
  - prisma
  - postgresql
  - hyperdrive
---

# Epic Stack: Database

## When to use this skill

Use this skill when you need to:

- Design database schema with Prisma
- Create migrations
- Work with PostgreSQL, Amazon RDS, and Hyperdrive
- Optimize queries and performance
- Create seed scripts
- Understand how the Worker gets a request-scoped Prisma client
- Manage backups and restores

## Patterns and conventions

### Database Philosophy

Following Epic Web principles:

**Do as little as possible** - Only fetch the data you actually need. Use
`select` to fetch specific fields instead of entire models. Avoid over-fetching
data "just in case" - fetch what you need, when you need it.

**Pragmatism over purity** - Optimize queries when there's a measurable benefit,
but don't over-optimize prematurely. Simple, readable queries are often better
than complex optimized ones. Add indexes when queries are slow, not before.

**Example - Fetch only what you need:**

```typescript
// ✅ Good - Fetch only needed fields
const user = await prisma.user.findUnique({
	where: { id: userId },
	select: {
		id: true,
		username: true,
		name: true,
		// Only fetch what you actually use
	},
})

// ❌ Avoid - Fetching everything
const user = await prisma.user.findUnique({
	where: { id: userId },
	// Fetches all fields including password hash, email, etc.
})
```

**Example - Pragmatic optimization:**

```typescript
// ✅ Good - Simple query first, optimize if needed
const notes = await prisma.note.findMany({
	where: { ownerId: userId },
	select: { id: true, title: true, updatedAt: true },
	orderBy: { updatedAt: 'desc' },
	take: 20,
})

// Only add indexes if this query is actually slow
// Don't pre-optimize

// ❌ Avoid - Over-optimizing before measuring
// Adding complex indexes, joins, etc. before knowing if it's needed
```

### Prisma Schema

This stack uses Prisma with PostgreSQL (Amazon RDS in production, the
`compose.yaml` container locally).

**Basic configuration:**

Two clients are generated from one schema, because the Node harness and the
Worker need different runtimes. `vite.config.ts` aliases `#prisma-client` to the
right one based on `CLOUDFLARE_WORKERS`. Never import a generated client
directly — always import `prisma` from `#app/utils/db.server.ts`.

```prisma
// prisma/schema.prisma
generator nodeClient {
  provider   = "prisma-client"
  output     = "../app/generated/prisma-node"
  runtime    = "nodejs"
  engineType = "client"
}

generator workerClient {
  provider   = "prisma-client"
  output     = "../app/generated/prisma-worker"
  runtime    = "cloudflare"
  engineType = "client"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

**Request-scoped clients:** the Worker opens a Prisma client per request over
the Hyperdrive binding and disposes of it once the response body has drained.
`db.server.ts` exposes that through an `AsyncLocalStorage` proxy so ordinary
`import { prisma }` call sites work unchanged in both runtimes. Do not cache a
Prisma client at module scope in Worker code.

**Basic model:**

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  username  String   @unique
  name      String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  notes     Note[]
  roles     Role[]
}

model Note {
  id      String @id @default(cuid())
  title   String
  content String

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  owner   User   @relation(fields: [ownerId], references: [id])
  ownerId String

  @@index([ownerId])
  @@index([ownerId, updatedAt])
}
```

### CUID2 for IDs

Epic Stack uses CUID2 to generate unique IDs.

**Advantages:**

- Globally unique
- Sortable
- Secure (no exposed information)
- URL-friendly

**Example:**

```prisma
model User {
  id String @id @default(cuid()) // Automatically generates CUID2
}
```

### Timestamps

**Standard fields:**

```prisma
model User {
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt // Automatically updated
}
```

### Relationships

**One-to-Many:**

```prisma
model User {
  id    String @id @default(cuid())
  notes Note[]
}

model Note {
  id      String @id @default(cuid())
  owner   User   @relation(fields: [ownerId], references: [id])
  ownerId String

  @@index([ownerId])
}
```

**One-to-One:**

```prisma
model User {
  id      String  @id @default(cuid())
  image   UserImage?
}

model UserImage {
  id        String @id @default(cuid())
  user      User   @relation(fields: [userId], references: [id])
  userId    String @unique
}
```

**Many-to-Many:**

```prisma
model User {
  id    String @id @default(cuid())
  roles Role[]
}

model Role {
  id    String @id @default(cuid())
  users User[]
}
```

### Indexes

**Create indexes:**

```prisma
model Note {
  id      String @id @default(cuid())
  ownerId String
  updatedAt DateTime

  @@index([ownerId])              // Simple index
  @@index([ownerId, updatedAt])   // Composite index
}
```

**Best practices:**

- Index foreign keys
- Index fields used in `where` frequently
- Index fields used in `orderBy`
- Use composite indexes for complex queries

### Cascade Delete

**Configure cascade:**

```prisma
model User {
  id    String @id @default(cuid())
  notes Note[]
}

model Note {
  id      String @id @default(cuid())
  owner   User   @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  ownerId String
}
```

**Options:**

- `onDelete: Cascade` - Deletes children when parent is deleted
- `onDelete: SetNull` - Sets to null when parent is deleted
- `onDelete: Restrict` - Prevents deletion if there are children

### Migrations

**Create migration:**

```bash
npx prisma migrate dev --name add_user_field
```

**Apply migrations in production:**

```bash
npx prisma migrate deploy
```

**Automatic migrations:** `.github/workflows/deploy.yml` runs
`prisma migrate deploy` against the staging or production RDS instance before
`wrangler deploy`. Migrations run from CI over a direct `DATABASE_URL`, not
through Hyperdrive — Hyperdrive is a runtime connection pool, not a migration
path.

**"Widen then Narrow" strategy for zero-downtime:**

1. **Widen app** - App accepts A or B
2. **Widen db** - DB provides A and B, app writes to both
3. **Narrow app** - App only uses B
4. **Narrow db** - DB only provides B

**Example: Rename field `name` to `firstName` and `lastName`:**

```prisma
// Step 1: Widen app (accepts both)
model User {
  id        String @id @default(cuid())
  name      String?  // Deprecated
  firstName String?  // New
  lastName  String?  // New
}

// Step 2: Widen db (migration copies data)
// In SQL migration:
ALTER TABLE User ADD COLUMN firstName TEXT;
ALTER TABLE User ADD COLUMN lastName TEXT;
UPDATE User SET firstName = name;

// Step 3: Narrow app (only uses new fields)
// Code only uses firstName and lastName

// Step 4: Narrow db (removes old field)
ALTER TABLE User DROP COLUMN name;
```

### Prisma Client

**Import Prisma Client:**

```typescript
import { prisma } from '#app/utils/db.server.ts'
```

**Basic query:**

```typescript
const user = await prisma.user.findUnique({
	where: { id: userId },
})
```

**Specific select:**

```typescript
const user = await prisma.user.findUnique({
	where: { id: userId },
	select: {
		id: true,
		email: true,
		username: true,
		// Don't include password or sensitive data
	},
})
```

**Include relations:**

```typescript
const user = await prisma.user.findUnique({
	where: { id: userId },
	include: {
		notes: {
			select: {
				id: true,
				title: true,
			},
			orderBy: { updatedAt: 'desc' },
		},
		roles: true,
	},
})
```

**Complex queries:**

```typescript
const notes = await prisma.note.findMany({
	where: {
		ownerId: userId,
		title: { contains: searchTerm },
	},
	select: {
		id: true,
		title: true,
		updatedAt: true,
	},
	orderBy: { updatedAt: 'desc' },
	take: 20,
	skip: (page - 1) * 20,
})
```

### Transactions

**Use transactions:**

```typescript
await prisma.$transaction(async (tx) => {
	const user = await tx.user.create({
		data: {
			email,
			username,
			roles: { connect: { name: 'user' } },
		},
	})

	await tx.note.create({
		data: {
			title: 'Welcome',
			content: 'Welcome to the app!',
			ownerId: user.id,
		},
	})

	return user
})
```

### PostgreSQL through Hyperdrive

There is one primary RDS instance and no read replicas, so unlike the LiteFS
setup this replaced, **every isolate can read and write**. There is no primary
election, no write forwarding, and no `ensurePrimary()`.

**What Hyperdrive does:** it pools connections at the edge, so a Worker isolate
does not pay a TCP + TLS + Postgres handshake per request, and RDS does not see
one connection per isolate. The Worker reads `env.HYPERDRIVE.connectionString`
and hands it to Prisma's `pg` adapter.

**What this means when writing queries:**

- Connections are precious. Do not hold a transaction open across an `await` on
  anything slow (an S3 upload, a third-party API).
- Prefer a handful of well-shaped queries over many small round trips; each one
  crosses the network to your RDS region.
- Reads and writes are strongly consistent, so read-after-write works normally.

```typescript
// The connection string only exists inside the Worker request scope.
// App code never touches it — it imports the proxy instead.
import { prisma } from '#app/utils/db.server.ts'

export async function action({ request }: Route.ActionArgs) {
	// No primary check needed; just write.
	await prisma.user.create({
		data: {
			/* ... */
		},
	})
}
```

### Seed Scripts

**Create seed:**

```typescript
// prisma/seed.ts
import { prisma } from '#app/utils/db.server.ts'

async function seed() {
	// Create roles
	await prisma.role.createMany({
		data: [
			{ name: 'user', description: 'Standard user' },
			{ name: 'admin', description: 'Administrator' },
		],
	})

	// Create users
	const user = await prisma.user.create({
		data: {
			email: 'user@example.com',
			username: 'testuser',
			roles: { connect: { name: 'user' } },
		},
	})

	console.log('Seed complete!')
}

seed()
	.catch((e) => {
		console.error(e)
		process.exit(1)
	})
	.finally(async () => {
		await prisma.$disconnect()
	})
```

**Run seed:**

```bash
npx prisma db seed
# Or directly:
npx tsx prisma/seed.ts
```

### Query Optimization

**Guidelines (pragmatic approach):**

- Use `select` to fetch only needed fields - do as little as possible
- Use selective `include` - only include relations you actually use
- Index fields used in `where` and `orderBy` - but only if queries are slow
- Use composite indexes for complex queries - when you have a real performance
  problem
- Avoid `select: true` (fetches everything) - be explicit about what you need
- Measure first, optimize second - don't pre-optimize

**Optimized example (do as little as possible):**

```typescript
// ❌ Avoid: Fetches everything unnecessarily
const user = await prisma.user.findUnique({
	where: { id: userId },
	// Fetches password hash, email, all relations, etc.
})

// ✅ Good: Only needed fields - do as little as possible
const user = await prisma.user.findUnique({
	where: { id: userId },
	select: {
		id: true,
		username: true,
		name: true,
		// Only what you actually use
	},
})

// ✅ Better: With selective relations (only if you need them)
const user = await prisma.user.findUnique({
	where: { id: userId },
	select: {
		id: true,
		username: true,
		notes: {
			select: {
				id: true,
				title: true,
			},
			take: 10, // Only fetch what you need
		},
	},
})
```

### Prisma Query Logging

**Configure logging:**

```typescript
// app/utils/db.server.ts
const client = new PrismaClient({
	log: [
		{ level: 'query', emit: 'event' },
		{ level: 'error', emit: 'stdout' },
		{ level: 'warn', emit: 'stdout' },
	],
})

client.$on('query', async (e) => {
	if (e.duration < 20) return // Only log slow queries

	console.info(`prisma:query - ${e.duration}ms - ${e.query}`)
})
```

### Database URL

`DATABASE_URL` is used by the Prisma CLI (migrations, seed, Studio) and by the
Node harness. The deployed Worker never reads it — it uses the Hyperdrive
binding instead.

**Development** (the `compose.yaml` container, started with `npm run db:start`):

```bash
DATABASE_URL="postgresql://candidgarden:candidgarden@localhost:5432/candidgarden?schema=public"
```

Note the `?schema=` parameter: `pg` ignores it, so `db.server.ts` parses it out
and passes it to the adapter explicitly. Drop it and every query silently lands
on the default `search_path`.

**Production (Amazon RDS):**

```bash
DATABASE_URL="postgresql://USER:PASSWORD@RDS_ENDPOINT:5432/candidgarden?schema=public&sslmode=require&connection_limit=5"
```

### Connecting to the production DB

RDS is reached directly over the network — there is no instance to SSH into.
Whether it is publicly reachable or only from a VPC/bastion is your RDS security
group configuration; see `docs/amazon-rds-postgresql.md`.

```bash
# psql
psql "$PRODUCTION_DATABASE_URL"

# Prisma Studio against production — read carefully before editing anything
DATABASE_URL="$PRODUCTION_DATABASE_URL" npx prisma studio
```

## Common examples

### Example 1: Create model with relations

```prisma
model Post {
  id        String   @id @default(cuid())
  title     String
  content   String
  published Boolean  @default(false)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  author   User   @relation(fields: [authorId], references: [id], onDelete: Cascade)
  authorId String

  comments Comment[]
  tags     Tag[]

  @@index([authorId])
  @@index([authorId, published])
  @@index([published, updatedAt])
}

model Comment {
  id      String @id @default(cuid())
  content String

  createdAt DateTime @default(now())

  post   Post   @relation(fields: [postId], references: [id], onDelete: Cascade)
  postId String

  author   User   @relation(fields: [authorId], references: [id])
  authorId String

  @@index([postId])
  @@index([authorId])
}
```

### Example 2: Complex query with pagination

```typescript
export async function getPosts({
	userId,
	page = 1,
	perPage = 20,
	published,
}: {
	userId?: string
	page?: number
	perPage?: number
	published?: boolean
}) {
	const where: Prisma.PostWhereInput = {}

	if (userId) {
		where.authorId = userId
	}
	if (published !== undefined) {
		where.published = published
	}

	const [posts, total] = await Promise.all([
		prisma.post.findMany({
			where,
			select: {
				id: true,
				title: true,
				updatedAt: true,
				author: {
					select: {
						id: true,
						username: true,
					},
				},
			},
			orderBy: { updatedAt: 'desc' },
			take: perPage,
			skip: (page - 1) * perPage,
		}),
		prisma.post.count({ where }),
	])

	return {
		posts,
		total,
		pages: Math.ceil(total / perPage),
	}
}
```

### Example 3: Transaction with multiple operations

```typescript
export async function createPostWithTags({
	authorId,
	title,
	content,
	tagNames,
}: {
	authorId: string
	title: string
	content: string
	tagNames: string[]
}) {
	return await prisma.$transaction(async (tx) => {
		// Create tags if they don't exist
		await Promise.all(
			tagNames.map((name) =>
				tx.tag.upsert({
					where: { name },
					update: {},
					create: { name },
				}),
			),
		)

		// Create post
		const post = await tx.post.create({
			data: {
				title,
				content,
				authorId,
				tags: {
					connect: tagNames.map((name) => ({ name })),
				},
			},
		})

		return post
	})
}
```

### Example 4: Seed with related data

```typescript
async function seed() {
	// Create permissions
	const permissions = await Promise.all([
		prisma.permission.create({
			data: {
				action: 'create',
				entity: 'note',
				access: 'own',
				description: 'Can create own notes',
			},
		}),
		prisma.permission.create({
			data: {
				action: 'read',
				entity: 'note',
				access: 'own',
				description: 'Can read own notes',
			},
		}),
	])

	// Create roles with permissions
	const userRole = await prisma.role.create({
		data: {
			name: 'user',
			description: 'Standard user',
			permissions: {
				connect: permissions.map((p) => ({ id: p.id })),
			},
		},
	})

	// Create user with role
	const user = await prisma.user.create({
		data: {
			email: 'user@example.com',
			username: 'testuser',
			roles: {
				connect: { id: userRole.id },
			},
		},
	})

	console.log('Seed complete!')
}
```

## Common mistakes to avoid

- ❌ **Fetching unnecessary data**: Use `select` to fetch only what you need -
  do as little as possible
- ❌ **Over-optimizing prematurely**: Measure first, then optimize. Don't add
  indexes "just in case"
- ❌ **Not using indexes when needed**: Index foreign keys and fields used in
  frequent queries, but only if they're actually slow
- ❌ **N+1 queries**: Use `include` to fetch relations in a single query when
  you need them
- ❌ **Not using transactions for related operations**: Always use transactions
  when multiple operations must be atomic
- ❌ **Caching a Prisma client at module scope in Worker code**: the client is
  request-scoped and disposed after the response; import the `prisma` proxy
- ❌ **Holding a transaction open across a slow await**: Hyperdrive connections
  are pooled and finite; never await S3 or a third-party API inside one
- ❌ **Running migrations through Hyperdrive**: `prisma migrate deploy` needs a
  direct `DATABASE_URL` to RDS
- ❌ **Dropping `?schema=` from the connection string**: `pg` ignores it, so
  queries land on the default `search_path`
- ❌ **Breaking migrations without strategy**: Use "widen then narrow" for
  zero-downtime
- ❌ **Not validating data before inserting**: Always validate with Zod before
  create/update
- ❌ **Forgetting `onDelete` in relations**: Explicitly decide what to do when
  parent is deleted
- ❌ **Not using CUID2**: Epic Stack uses CUID2 by default, don't use UUID or
  others
- ❌ **Not closing Prisma Client**: Prisma handles this automatically, but
  ensure in scripts
- ❌ **Complex queries when simple ones work**: Prefer simple, readable queries
  over complex optimized ones unless there's a real problem

## References

- [Epic Stack Database Docs](../epic-stack/docs/database.md)
- [Epic Web Principles](https://www.epicweb.dev/principles)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Cloudflare Hyperdrive](https://developers.cloudflare.com/hyperdrive/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- `prisma/schema.prisma` - Complete schema
- `prisma/seed.ts` - Seed example
- `app/utils/db.server.ts` - Request-scoped Prisma client and proxy
- `workers/app.ts` - Where the per-request client is created and disposed
- `docs/amazon-rds-postgresql.md` - RDS provisioning and connection details
