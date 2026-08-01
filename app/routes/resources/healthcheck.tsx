import { prisma } from '#app/utils/db.server.ts'

export async function loader() {
	try {
		// Exercise the Hyperdrive and RDS path without scanning an app table.
		await prisma.$queryRaw`SELECT 1`
		return new Response('OK')
	} catch (error: unknown) {
		console.log('healthcheck ❌', { error })
		return new Response('ERROR', { status: 500 })
	}
}
