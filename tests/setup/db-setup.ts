import { execaCommand } from 'execa'
import { afterAll, beforeAll, beforeEach } from 'vitest'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
if (!testDatabaseUrl) {
	throw new Error(
		'TEST_DATABASE_URL is required. It must point to a dedicated PostgreSQL test database.',
	)
}

const parsedTestDatabaseUrl = new URL(testDatabaseUrl)
const databaseName = parsedTestDatabaseUrl.pathname.slice(1)
if (!/(^|[_-])test($|[_-])/.test(databaseName)) {
	throw new Error(
		`Refusing to reset PostgreSQL database "${databaseName}" because its name does not contain "test".`,
	)
}

const poolId = (process.env.VITEST_POOL_ID || '0').replace(
	/[^a-zA-Z0-9_]/g,
	'_',
)
const schema = `vitest_${poolId}`
parsedTestDatabaseUrl.searchParams.set('schema', schema)
process.env.DATABASE_URL = parsedTestDatabaseUrl.toString()

beforeAll(async () => {
	await execaCommand(
		'npx prisma migrate reset --force --skip-seed --skip-generate',
		{
			stdio: 'inherit',
			env: {
				...process.env,
				DATABASE_URL: process.env.DATABASE_URL,
				// The URL guard above ensures only a dedicated test database is reset.
				PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: 'true',
			},
		},
	)
})

beforeEach(async () => {
	// Keep the roles and permissions seeded by the baseline migration while
	// removing user-created data between tests. Cascades cover related records.
	const { prisma } = await import('#app/utils/db.server.ts')
	// Raw SQL bypasses the schema the adapter applies to generated queries, so
	// name the per-worker schema explicitly here.
	await prisma.$executeRawUnsafe(
		`TRUNCATE TABLE "${schema}"."Verification", "${schema}"."User" CASCADE`,
	)
})

afterAll(async () => {
	const { prisma } = await import('#app/utils/db.server.ts')
	await prisma.$disconnect()
})
