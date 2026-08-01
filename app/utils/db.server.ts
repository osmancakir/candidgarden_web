import { AsyncLocalStorage } from 'node:async_hooks'
import { remember } from '@epic-web/remember'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '#prisma-client'

const prismaContext = new AsyncLocalStorage<PrismaClient>()

export function createPrismaClient(connectionString: string) {
	return new PrismaClient({
		adapter: new PrismaPg({ connectionString }),
		log: [
			{ level: 'error', emit: 'stdout' },
			{ level: 'warn', emit: 'stdout' },
		],
	})
}

function getLocalPrismaClient() {
	return remember('prisma', () => {
		const connectionString = process.env.DATABASE_URL
		if (!connectionString) {
			throw new Error(
				'DATABASE_URL is required outside the Cloudflare Workers runtime',
			)
		}
		return createPrismaClient(connectionString)
	})
}

function getPrismaClient() {
	return prismaContext.getStore() ?? getLocalPrismaClient()
}

export function runWithPrisma<T>(client: PrismaClient, callback: () => T): T {
	return prismaContext.run(client, callback)
}

/**
 * Existing loaders and actions import this proxy. In Workers it resolves to the
 * request-local Hyperdrive client; the Node development/test server falls back
 * to the local DATABASE_URL client.
 */
export const prisma = new Proxy({} as PrismaClient, {
	get(_target, property) {
		const client = getPrismaClient()
		const value = Reflect.get(client, property, client)
		return typeof value === 'function' ? value.bind(client) : value
	},
})
