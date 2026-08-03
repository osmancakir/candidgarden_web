/**
 * Credentials for the operational scripts, read from `.env` first and prompted
 * for only when genuinely absent.
 *
 * These scripts used to prompt unconditionally, which meant retyping an RDS
 * password out of a notebook for every audit — and a value typed that often
 * ends up somewhere it should not be. `.env` already holds all of them, so it
 * is the source of truth and the prompt is the fallback, not the other way
 * round.
 *
 * `.env` is loaded here rather than relying on `node --env-file=.env`, because
 * some of these scripts are invoked as bare `node scripts/…`. dotenv does not
 * overwrite variables that are already set, so passing both is harmless and a
 * real environment variable still wins over the file.
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import dotenv from 'dotenv'
import prompts from 'prompts'

dotenv.config({ path: resolve('.env'), quiet: true })

export const RDS_HOST =
	'candidgarden-production.cvo2yi4eaqib.eu-central-1.rds.amazonaws.com'
export const RDS_PORT = 5432
export const RDS_DATABASE = 'candidgarden'
export const RDS_CA_PATH = resolve('.wrangler/rds-global-bundle.pem')

/** Which `.env` key holds the password for which RDS role. */
const PASSWORD_VARIABLES = {
	cg_admin: 'CG_ADMIN_PASSWORD',
	cg_app: 'CG_APP_PASSWORD',
}

/**
 * Returns `name` from the environment, prompting for it only if unset.
 *
 * The prompt says which variable would have avoided it, so the fix is obvious
 * the first time rather than after the third run.
 */
export async function secret(name, { label = name, mask = true } = {}) {
	const existing = process.env[name]
	if (existing) return existing
	const { value } = await prompts(
		{
			type: mask ? 'password' : 'text',
			name: 'value',
			message: `${label} (set ${name} in .env to skip this)`,
			validate: (input) => Boolean(input) || `${label} is required`,
		},
		{
			onCancel: () => {
				console.error('Cancelled without making changes.')
				process.exit(1)
			},
		},
	)
	if (!value) {
		console.error(`${label} is required.`)
		process.exit(1)
	}
	return value
}

/** The RDS password for `user`, from `.env` when the role is one we know. */
export async function rdsPassword(user) {
	const variable = PASSWORD_VARIABLES[user]
	if (variable) {
		return secret(variable, { label: `RDS password for ${user}` })
	}
	// An unrecognised role has no dedicated variable; ask for it.
	return secret(`RDS_PASSWORD_${user.toUpperCase()}`, {
		label: `RDS password for ${user}`,
	})
}

/**
 * TLS options for RDS.
 *
 * pg 8.16 and later read `sslmode=require` as `verify-full`, and Amazon's chain
 * is not in Node's trust store. The repo ships the RDS global bundle for this;
 * pinning it keeps verification on, where `rejectUnauthorized: false` would
 * switch off the check that produced the error rather than satisfying it.
 */
export async function rdsSsl() {
	try {
		return { ca: await readFile(RDS_CA_PATH, 'utf8'), rejectUnauthorized: true }
	} catch {
		throw new Error(
			`The RDS certificate bundle is missing at ${RDS_CA_PATH}. Download it with:\n` +
				'  curl -o .wrangler/rds-global-bundle.pem \\\n' +
				'    https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem',
		)
	}
}

/**
 * TCP keepalives, which `pg` leaves off by default.
 *
 * A long `CREATE INDEX` sends nothing over the socket for as long as it runs.
 * Without keepalives the NAT or firewall between here and RDS eventually drops
 * an idle session; Postgres then notices the client is gone and rolls the
 * statement back, while the driver waits forever on a socket that is already
 * dead. That cost a 47-minute HNSW build once — the symptom is a script that
 * hangs with no server-side backend behind it.
 */
const KEEPALIVE = {
	keepAlive: true,
	keepAliveInitialDelayMillis: 30_000,
}

/** A `pg` client config for the production database as `user`. */
export async function rdsConfig(user, applicationName) {
	return {
		host: RDS_HOST,
		port: RDS_PORT,
		database: RDS_DATABASE,
		user,
		password: await rdsPassword(user),
		ssl: await rdsSsl(),
		connectionTimeoutMillis: 15_000,
		application_name: applicationName,
		...KEEPALIVE,
	}
}

/**
 * A `pg` config from a connection URL.
 *
 * The URL is decomposed into discrete fields rather than handed to pg as a
 * `connectionString`, because pg does
 * `Object.assign({}, config, parse(config.connectionString))` — parsed values
 * win — so an `sslmode=` in the URL silently discards the `ssl` built here and
 * the connection fails with SELF_SIGNED_CERT_IN_CHAIN as though nothing were
 * configured.
 */
export async function configFromUrl(connectionString, applicationName) {
	const url = new URL(connectionString)
	const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
	return {
		host: url.hostname,
		port: url.port ? Number(url.port) : 5432,
		database: decodeURIComponent(url.pathname.replace(/^\//, '')),
		user: decodeURIComponent(url.username),
		password: decodeURIComponent(url.password),
		ssl: local ? false : await rdsSsl(),
		connectionTimeoutMillis: 15_000,
		application_name: applicationName,
		...KEEPALIVE,
	}
}

/** AWS credentials for the production image bucket. */
export async function awsCredentials() {
	return {
		accessKeyId: await secret('AWS_ACCESS_KEY_ID', {
			label: 'AWS access key ID',
		}),
		secretAccessKey: await secret('AWS_SECRET_ACCESS_KEY', {
			label: 'AWS secret access key',
		}),
	}
}

/** Hides the password when a connection target is printed. */
export function describeTarget(config) {
	return `${config.user}@${config.host}:${config.port}/${config.database}`
}
