import { z } from 'zod'

const schema = z.object({
	NODE_ENV: z.enum(['production', 'development', 'test'] as const),
	// Node development/tests use this directly. Production Workers use the
	// HYPERDRIVE binding instead.
	DATABASE_URL: z.string().url().optional(),
	SESSION_SECRET: z.string(),
	HONEYPOT_SECRET: z.string(),
	// If you plan on using Sentry, remove the .optional()
	SENTRY_DSN: z.string().optional(),
	// If you plan to use Resend, remove the .optional()
	RESEND_API_KEY: z.string().optional(),
	// If you plan to use GitHub auth, remove the .optional()
	GITHUB_CLIENT_ID: z.string().optional(),
	GITHUB_CLIENT_SECRET: z.string().optional(),
	GITHUB_REDIRECT_URI: z.string().optional(),
	GITHUB_TOKEN: z.string().optional(),

	ALLOW_INDEXING: z.enum(['true', 'false']).optional(),

	// Amazon S3 configuration. Credentials use the AWS SDK provider chain.
	AWS_ACCESS_KEY_ID: z.string(),
	AWS_SECRET_ACCESS_KEY: z.string(),
	AWS_SESSION_TOKEN: z.string().optional(),
	AWS_REGION: z.string(),
	AWS_S3_BUCKET: z.string(),
})

declare global {
	namespace NodeJS {
		interface ProcessEnv extends z.infer<typeof schema> {}
	}
}

export function init() {
	// Vite replaces direct NODE_ENV reads at build time, but the Workers
	// process.env object does not contain that build-time value.
	const parsed = schema.safeParse({
		...process.env,
		NODE_ENV: process.env.NODE_ENV,
	})

	if (parsed.success === false) {
		console.error(
			'❌ Invalid environment variables:',
			parsed.error.flatten().fieldErrors,
		)

		throw new Error('Invalid environment variables')
	}
}

/**
 * This is used in both `entry.server.ts` and `root.tsx` to ensure that
 * the environment variables are set and globally available before the app is
 * started.
 *
 * NOTE: Do *not* add any environment variables in here that you do not wish to
 * be included in the client.
 * @returns all public ENV variables
 */
export function getEnv() {
	return {
		MODE: process.env.NODE_ENV,
		SENTRY_DSN: process.env.SENTRY_DSN,
		ALLOW_INDEXING: process.env.ALLOW_INDEXING,
	}
}

type ENV = ReturnType<typeof getEnv>

declare global {
	var ENV: ENV
	interface Window {
		ENV: ENV
	}
}
