/**
 * Creates the Städel researcher account, on production RDS or on the local
 * development database.
 *
 * The app has no admin UI for minting accounts and public signup would send a
 * verification email to an address nobody reads, so the row is written here
 * instead. Against production the script talks to Postgres over the same
 * verified-TLS connection the data migration uses; either way it hashes the
 * password with the same bcrypt cost as `getPasswordHash`, so the resulting
 * rows are indistinguishable from ones the signup flow would have produced.
 *
 * Read-only by default. Pass --apply to write.
 *
 *   npm run account:researcher                  # production, report only
 *   npm run account:researcher -- --apply       # production, create
 *   npm run account:researcher:local -- --apply # local dev database, create
 *
 * Options:
 *   --local             Target DATABASE_URL instead of production RDS. Skips
 *                       the password prompt and the typed confirmation, and
 *                       defaults the account password to `researcher` so it is
 *                       memorable while developing.
 *   --password=<value>  Use this password instead of the default.
 *   --reset             If the account already exists, replace its password
 *                       and re-grant the role rather than failing.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import bcrypt from 'bcryptjs'
import pg from 'pg'
import prompts from 'prompts'

const { Client } = pg

const RDS_HOST =
	'candidgarden-production.cvo2yi4eaqib.eu-central-1.rds.amazonaws.com'
const RDS_PORT = 5432
const RDS_DATABASE = 'candidgarden'
const RDS_USER = 'cg_app'
const RDS_CA_PATH = resolve('.wrangler/rds-global-bundle.pem')

// Login is by username, not email — see `app/routes/_auth/login.tsx`. The
// username has to satisfy UsernameSchema, which allows no hyphens.
const ACCOUNT_EMAIL = 'staedelresearch@candidgarden.com'
const ACCOUNT_USERNAME = 'staedelresearch'
const ACCOUNT_NAME = 'Städel Research'
const ROLE_NAMES = ['researcher', 'user']

const args = new Map()
for (let index = 2; index < process.argv.length; index++) {
	const argument = process.argv[index]
	if (!argument.startsWith('--')) continue
	const [name, inlineValue] = argument.slice(2).split('=', 2)
	args.set(name, inlineValue === undefined ? true : inlineValue)
}

const apply = args.get('apply') === true
const reset = args.get('reset') === true
const local = args.get('local') === true
const providedPassword =
	typeof args.get('password') === 'string' ? args.get('password') : null
// A generated secret is right for production and a nuisance locally, where the
// point is to log in repeatedly without looking anything up.
const LOCAL_DEFAULT_PASSWORD = 'researcher'
const target = local ? 'the local development database' : 'production'

function fail(message) {
	console.error(`\n✖ ${message}`)
	process.exit(1)
}

/**
 * bcrypt truncates at 72 bytes and PasswordSchema rejects anything longer, so
 * the generated password stays comfortably inside both limits.
 */
function generatePassword() {
	return randomBytes(24).toString('base64url')
}

/** Prisma writes `cuid()` ids; any unique text works, but keep the shape. */
function createId() {
	return `c${randomUUID().replaceAll('-', '').slice(0, 24)}`
}

async function connectToLocal() {
	const connectionString = process.env.DATABASE_URL
	if (!connectionString) {
		fail(
			'DATABASE_URL is not set. Run this through `npm run account:researcher:local`, which loads .env.',
		)
	}
	if (!/localhost|127\.0\.0\.1/.test(connectionString)) {
		fail(
			`--local refuses to run against a non-local DATABASE_URL (${new URL(connectionString).host}). Drop --local to target production deliberately.`,
		)
	}
	const client = new Client({
		connectionString,
		connectionTimeoutMillis: 15_000,
		application_name: 'candidgarden-account-provisioning',
	})
	await client.connect()
	await client.query("SET TIME ZONE 'UTC'")
	return client
}

async function connectToRds(password) {
	const ca = await readFile(RDS_CA_PATH, 'utf8').catch(() =>
		fail(
			`Missing RDS CA bundle at ${RDS_CA_PATH}. Download the global bundle from AWS first — see docs/amazon-rds-postgresql.md.`,
		),
	)
	const client = new Client({
		host: RDS_HOST,
		port: RDS_PORT,
		database: RDS_DATABASE,
		user: RDS_USER,
		password,
		ssl: { ca, rejectUnauthorized: true },
		connectionTimeoutMillis: 15_000,
		application_name: 'candidgarden-account-provisioning',
	})
	await client.connect()
	await client.query("SET TIME ZONE 'UTC'")
	return client
}

async function promptForDatabasePassword() {
	const questions = [
		{
			type: 'password',
			name: 'password',
			message: `Saved RDS password for ${RDS_USER}`,
			validate: (value) => Boolean(value) || 'Password is required',
		},
	]
	if (apply) {
		questions.push({
			type: 'text',
			name: 'confirmation',
			message: `Type CREATE ACCOUNT to write ${ACCOUNT_EMAIL} to production`,
			validate: (value) =>
				value === 'CREATE ACCOUNT' || 'Exact confirmation is required',
		})
	}
	const answers = await prompts(questions, {
		onCancel: () => fail('Cancelled without making database changes.'),
	})
	if (!answers.password) fail('Database credentials are required.')
	if (apply && answers.confirmation !== 'CREATE ACCOUNT') {
		fail('Exact confirmation is required.')
	}
	return answers.password
}

async function main() {
	// Local runs skip the prompts entirely: there is no shared secret to guard
	// and no blast radius worth a typed confirmation.
	const client = local
		? await connectToLocal()
		: await connectToRds(await promptForDatabasePassword())

	try {
		const roles = await client.query(
			'SELECT "id", "name" FROM "Role" WHERE "name" = ANY($1)',
			[ROLE_NAMES],
		)
		const roleIds = new Map(roles.rows.map((row) => [row.name, row.id]))
		const missingRoles = ROLE_NAMES.filter((name) => !roleIds.has(name))
		if (missingRoles.length) {
			fail(
				`Missing role(s) in ${target}: ${missingRoles.join(', ')}. Run \`npx prisma migrate deploy\` against ${target} first${local ? '' : ' (CI does this on deploy)'}.`,
			)
		}

		const existing = await client.query(
			'SELECT "id", "email", "username" FROM "User" WHERE "email" = $1 OR "username" = $2',
			[ACCOUNT_EMAIL, ACCOUNT_USERNAME],
		)
		if (existing.rows.length && !reset) {
			fail(
				`An account already exists (${existing.rows
					.map((row) => `${row.username} <${row.email}>`)
					.join(
						', ',
					)}). Re-run with --reset to replace its password and re-grant the role.`,
			)
		}

		const userId = existing.rows[0]?.id ?? createId()
		const accountPassword =
			providedPassword ?? (local ? LOCAL_DEFAULT_PASSWORD : generatePassword())

		console.log('')
		console.log(
			`${existing.rows.length ? 'Would reset' : 'Would create'} in ${target}:`,
		)
		console.log(`  id       ${userId}`)
		console.log(`  email    ${ACCOUNT_EMAIL}`)
		console.log(`  username ${ACCOUNT_USERNAME}`)
		console.log(`  name     ${ACCOUNT_NAME}`)
		console.log(`  roles    ${ROLE_NAMES.join(', ')}`)

		if (!apply) {
			console.log('\nRead-only run. Re-run with --apply to write.')
			return
		}

		const hash = await bcrypt.hash(accountPassword, 10)

		await client.query('BEGIN')
		try {
			await client.query(
				`INSERT INTO "User" ("id", "email", "username", "name", "createdAt", "updatedAt")
				 VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
				 ON CONFLICT ("id") DO UPDATE
				   SET "email" = EXCLUDED."email",
				       "username" = EXCLUDED."username",
				       "name" = EXCLUDED."name",
				       "updatedAt" = CURRENT_TIMESTAMP`,
				[userId, ACCOUNT_EMAIL, ACCOUNT_USERNAME, ACCOUNT_NAME],
			)
			// Password has no primary key, so an upsert is a delete plus insert.
			await client.query('DELETE FROM "Password" WHERE "userId" = $1', [userId])
			await client.query(
				'INSERT INTO "Password" ("hash", "userId") VALUES ($1, $2)',
				[hash, userId],
			)
			for (const name of ROLE_NAMES) {
				await client.query(
					`INSERT INTO "_RoleToUser" ("A", "B") VALUES ($1, $2)
					 ON CONFLICT DO NOTHING`,
					[roleIds.get(name), userId],
				)
			}
			// Any session minted against the old password should not outlive it.
			if (existing.rows.length) {
				await client.query('DELETE FROM "Session" WHERE "userId" = $1', [
					userId,
				])
			}
			await client.query('COMMIT')
		} catch (error) {
			await client.query('ROLLBACK')
			throw error
		}

		console.log(`\n✔ Account written to ${target}.`)
		console.log(
			`\n  Log in at ${local ? 'http://localhost:3000' : 'https://candidgarden.com'}/login with:`,
		)
		console.log(`    username  ${ACCOUNT_USERNAME}`)
		console.log(`    password  ${accountPassword}`)
		if (!local) {
			console.log(
				'\n  Store the password in a password manager now — it is not recoverable from the hash.',
			)
		}
	} finally {
		await client.end()
	}
}

main().catch((error) => {
	console.error(error)
	process.exit(1)
})
