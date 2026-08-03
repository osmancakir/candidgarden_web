import fs from 'node:fs'
import path from 'node:path'
import { cloudflare } from '@cloudflare/vite-plugin'
import { reactRouter } from '@react-router/dev/vite'
import {
	type SentryReactRouterBuildOptions,
	sentryReactRouter,
} from '@sentry/react-router'
import tailwindcss from '@tailwindcss/vite'
import { reactRouterDevTools } from 'react-router-devtools'
import { defineConfig } from 'vite'
import { envOnlyMacros } from 'vite-env-only'
import { iconsSpritesheet } from 'vite-plugin-icons-spritesheet'

export default defineConfig((config) => {
	const mode = config.mode ?? process.env.NODE_ENV
	const isTest = mode === 'test' || Boolean(process.env.VITEST)
	const isCloudflare = process.env.CLOUDFLARE_WORKERS === 'true'
	const cacheServerStubPlugin = {
		name: 'vitest-cache-server-stub',
		enforce: 'pre' as const,
		resolveId(source: string) {
			if (!process.env.VITEST) return null
			if (source.endsWith('cache.server.ts')) {
				return path.resolve('tests/mocks/cache-server.ts')
			}
			return null
		},
	}
	// The AWS SDK splits every runtime-specific module into a Node and a browser
	// variant, and picks between them with a `browser` field that remaps subpaths
	// (`@aws-sdk/client-s3` swaps `runtimeConfig`, `@smithy/core` swaps its
	// `serde`/`checksum`/`config` submodules, and so on). Vite only honours that
	// field in the client environment, so the Worker build silently mixes the two
	// halves: the Node `runtimeConfig` calls `emitWarningIfUnsupportedVersion`
	// from the browser build of `@aws-sdk/core/client`, where it is a `node-only`
	// symbol rather than a function, and the Node stream helpers hand a Node
	// `Readable` to the browser stream collector, which expects `getReader()`.
	// Apply the mapping ourselves so the Worker stays on the browser variant —
	// fetch handler, WebCrypto, web streams — all the way down.
	const browserFieldCache = new Map<string, Record<string, string> | null>()

	function findPackageRoot(file: string) {
		let dir = path.dirname(file)
		while (dir.includes(`${path.sep}node_modules${path.sep}`)) {
			if (fs.existsSync(path.join(dir, 'package.json'))) return dir
			const parent = path.dirname(dir)
			if (parent === dir) break
			dir = parent
		}
		return null
	}

	function getBrowserField(pkgRoot: string) {
		if (!browserFieldCache.has(pkgRoot)) {
			let map: Record<string, string> | null = null
			try {
				const pkg = JSON.parse(
					fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8'),
				) as { browser?: unknown }
				if (pkg.browser && typeof pkg.browser === 'object') {
					map = pkg.browser as Record<string, string>
				}
			} catch {
				map = null
			}
			browserFieldCache.set(pkgRoot, map)
		}
		return browserFieldCache.get(pkgRoot) ?? null
	}

	const awsSdkBrowserFieldPlugin = {
		name: 'aws-sdk-browser-field',
		enforce: 'pre' as const,
		async resolveId(
			this: {
				resolve: (
					source: string,
					importer?: string,
					options?: Record<string, unknown>,
				) => Promise<{ id: string } | null>
			},
			source: string,
			importer: string | undefined,
			options: Record<string, unknown>,
		) {
			if (!isCloudflare) return null

			const resolved = await this.resolve(source, importer, {
				...options,
				skipSelf: true,
			})
			if (!resolved) return null

			const id = resolved.id
			if (!/node_modules[\\/](@aws-sdk|@smithy)[\\/]/.test(id)) return resolved

			const pkgRoot = findPackageRoot(id)
			if (!pkgRoot) return resolved
			const browserMap = getBrowserField(pkgRoot)
			if (!browserMap) return resolved

			const relative = `./${path
				.relative(pkgRoot, id)
				.split(path.sep)
				.join('/')}`
			const target =
				browserMap[relative] ?? browserMap[relative.replace(/\.js$/, '')]
			if (!target) return resolved

			for (const candidate of [target, `${target}.js`]) {
				const mapped = path.resolve(pkgRoot, candidate)
				if (fs.existsSync(mapped)) return { id: mapped }
			}
			return resolved
		},
	}
	return {
		resolve: {
			alias: {
				'#prisma-client': path.resolve(
					isCloudflare
						? './app/generated/prisma-worker/client.ts'
						: './app/generated/prisma-node/client.ts',
				),
			},
		},
		build: {
			target: 'es2022',
			cssMinify: mode === 'production',

			rollupOptions: isCloudflare
				? undefined
				: {
						input: config.isSsrBuild ? './server/app.ts' : undefined,
						external: [/node:.*/, 'fsevents'],
					},

			assetsInlineLimit: (source: string) => {
				if (
					source.endsWith('favicon.svg') ||
					source.endsWith('apple-touch-icon.png')
				) {
					return false
				}
			},

			sourcemap: true,
		},
		server: {
			watch: {
				ignored: ['**/playwright-report/**'],
			},
		},
		sentryConfig,
		plugins: [
			cacheServerStubPlugin,
			awsSdkBrowserFieldPlugin,
			isCloudflare ? cloudflare({ viteEnvironment: { name: 'ssr' } }) : null,
			envOnlyMacros(),
			tailwindcss(),
			reactRouterDevTools(),

			iconsSpritesheet({
				inputDir: './other/svg-icons',
				outputDir: './app/components/ui/icons',
				fileName: 'sprite.svg',
				withTypes: true,
				iconNameTransformer: (name) => name,
			}),
			// it would be really nice to have this enabled in tests, but we'll have to
			// wait until https://github.com/remix-run/remix/issues/9871 is fixed
			isTest ? null : reactRouter(),
			mode === 'production' && process.env.SENTRY_AUTH_TOKEN
				? sentryReactRouter(sentryConfig, config)
				: null,
		],
		test: {
			include: ['./app/**/*.test.{ts,tsx}', './scripts/**/*.test.{ts,tsx}'],
			setupFiles: ['./tests/setup/setup-test-env.ts'],
			restoreMocks: true,
			coverage: {
				include: ['app/**/*.{ts,tsx}'],
				all: true,
			},
		},
	}
})

const sentryConfig: SentryReactRouterBuildOptions = {
	authToken: process.env.SENTRY_AUTH_TOKEN,
	org: process.env.SENTRY_ORG,
	project: process.env.SENTRY_PROJECT,

	unstable_sentryVitePluginOptions: {
		release: {
			name: process.env.COMMIT_SHA,
			setCommits: {
				auto: true,
			},
		},
		sourcemaps: {
			filesToDeleteAfterUpload: ['./build/**/*.map'],
		},
	},
}
