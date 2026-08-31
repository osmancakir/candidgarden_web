#!/usr/bin/env node

import assert from 'node:assert/strict'
import {
	displayPeriod,
	fitTitleSize,
	parseArchiveUrl,
	renderArtworkHtml,
	renderCoverHtml,
	selectCoverArtworks,
	selectCandidates,
	slugify,
} from './generate_instagram_carousel_assets.mjs'

assert.equal(parseArchiveUrl('https://candidgarden.com/archive/5811'), 5811)
assert.equal(
	parseArchiveUrl('https://www.candidgarden.com/archive/320171/'),
	320171,
)
assert.throws(() => parseArchiveUrl('https://example.com/archive/5811'))
assert.equal(displayPeriod(1512, 1512), '1512')
assert.equal(displayPeriod(1512, 1519), '1512–1519')
assert.equal(displayPeriod(1512, null), 'AFTER 1512')
assert.equal(displayPeriod(null, null), 'UNDATED')
assert.equal(slugify('Denker & Schriftsteller'), 'denker-schriftsteller')
assert.ok(fitTitleSize('A very long artwork title '.repeat(8)) >= 30)

const candidates = [
	{
		id: 1,
		artist: 'A',
		collection: 'X',
		objectKey: '1.jpg',
		highlight: false,
		match: { similarity: 0.7 },
	},
	{
		id: 2,
		artist: 'A',
		collection: 'X',
		objectKey: '2.jpg',
		highlight: false,
		match: { similarity: 0.699 },
	},
	{
		id: 3,
		artist: 'B',
		collection: 'X',
		objectKey: '3.jpg',
		highlight: false,
		match: { similarity: 0.69 },
	},
	{
		id: 4,
		artist: 'C',
		collection: 'X',
		objectKey: null,
		highlight: true,
		match: { similarity: 0.9 },
	},
]
assert.deepEqual(
	selectCandidates(candidates, 2).map((candidate) => candidate.id),
	[1, 3],
	'first pass should require images and diversify artists',
)

const coverCandidates = Array.from({ length: 12 }, (_, index) => ({
	id: index + 1,
}))
assert.deepEqual(
	selectCoverArtworks(coverCandidates).map((artwork) => artwork.id),
	[1, 3, 4, 6, 7, 9, 10, 12],
	'large decks should sample eight works across the full posting order',
)
assert.equal(selectCoverArtworks(coverCandidates.slice(0, 4)).length, 4)

const html = renderArtworkHtml({
	artwork: {
		id: 5811,
		title: 'The Reader',
		artist: 'Example Artist',
		period: '1901',
		collection: 'Example Collection',
		location: null,
		imageDataUrl: 'data:image/png;base64,AA==',
	},
	index: 1,
	total: 1,
	width: 1080,
	height: 1350,
	fontCss: '',
})
assert.match(html, /object-fit:contain/)
assert.doesNotMatch(html, /object-fit:cover/)
assert.match(
	html,
	/\.plate img\{[^}]*position:absolute;[^}]*inset:0 0 18px;[^}]*height:calc\(100% - 18px\)/,
)
assert.doesNotMatch(html, /\.plate\{[^}]*border-top:/)
assert.match(html, /ARTigo · Record #5811/)

const coverHtml = renderCoverHtml({
	title: 'Thinkers and writers',
	hook: 'What does thought look like?',
	method: 'Renderer self-test',
	domain: 'https://candidgarden.com',
	fontCss: '',
	artworks: [
		{
			title: 'The Reader',
			artist: 'Example Artist',
			imageDataUrl: 'data:image/png;base64,AA==',
		},
		{
			title: 'The Writer',
			artist: 'Second Artist',
			imageDataUrl: 'data:image/png;base64,BB==',
		},
	],
})
assert.match(coverHtml, /body\{background:#fff;/)
assert.match(coverHtml, /class="title-panel"/)
assert.match(coverHtml, /What does thought look like\?/)
assert.doesNotMatch(coverHtml, /Archive selection/)
assert.match(coverHtml, /cover-density-low/)
assert.equal((coverHtml.match(/<figure class="miniature/g) ?? []).length, 2)
assert.match(coverHtml, /object-fit:contain/)

console.log('candidgarden-instagram-carousel self-test: ok')
