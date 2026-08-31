#!/usr/bin/env node

import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
	renderArtworkHtml,
	renderCoverHtml,
	renderFiles,
} from './generate_instagram_carousel_assets.mjs'

const width = 1080
const height = 1350
const keepOutput = process.argv.includes('--keep')
const outDir = await fs.mkdtemp(
	path.join(os.tmpdir(), 'candidgarden-carousel-smoke-'),
)

try {
	const imagePath = path.resolve('public/readme/archive.png')
	const imageDataUrl = `data:image/png;base64,${(await fs.readFile(imagePath)).toString('base64')}`
	const artwork = {
		id: 5811,
		title: 'Study for a Reader with an Intentionally Long Catalogue Title',
		artist: 'Example Artist',
		period: '1870–1874',
		collection: 'Candid Garden renderer fixture',
		location: 'Local smoke test',
		imageDataUrl,
	}
	const slides = [
		{
			filename: '01-cover.png',
			html: renderCoverHtml({
				title: 'Thinkers and writers',
				hook: 'What does thought look like?',
				method: 'Renderer smoke test',
				domain: 'https://candidgarden.com',
				fontCss: '',
				artworks: [artwork],
			}),
		},
		{
			filename: '02-artwork-01-5811.png',
			html: renderArtworkHtml({ artwork, index: 1, total: 1, fontCss: '' }),
		},
	]
	const files = await renderFiles(slides, { outDir, width, height })
	assert.deepEqual(files, ['01-cover.png', '02-artwork-01-5811.png'])

	for (const filename of files) {
		const png = await fs.readFile(path.join(outDir, filename))
		assert.equal(png.toString('ascii', 1, 4), 'PNG')
		assert.equal(png.readUInt32BE(16), width)
		assert.equal(png.readUInt32BE(20), height)
	}
	console.log('candidgarden-instagram-carousel render smoke test: ok')
	if (keepOutput) console.log(`Smoke cards kept in ${outDir}`)
} finally {
	if (!keepOutput) await fs.rm(outDir, { recursive: true, force: true })
}
