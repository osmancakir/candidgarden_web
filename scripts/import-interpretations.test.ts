import { expect, test } from 'vitest'
// @ts-expect-error -- plain .mjs script, no declaration file
import { splitDescription } from './import-interpretations.mjs'

test('splits the trailing present-relevance paragraph into level III', () => {
	const { levelII, levelIII } = splitDescription(
		[
			'The artwork portrays Prometheus bound to a rocky outcrop.',
			'The eagle is a symbol of Zeus’s vengeance.',
			'In a contemporary context, it resonates with themes of rebellion.',
		].join('\n\n'),
	)

	expect(levelII).toBe(
		'The artwork portrays Prometheus bound to a rocky outcrop.\n\nThe eagle is a symbol of Zeus’s vengeance.',
	)
	expect(levelIII).toBe(
		'In a contemporary context, it resonates with themes of rebellion.',
	)
})

test('strips the header block that restates database fields', () => {
	const { levelII } = splitDescription(
		[
			'**Title: Gefesselter Prometheus**  \n**Artist: Pieter Paul Rubens**  \n**Date Range: 1611 - 1612**',
			'The artwork portrays Prometheus bound to a rocky outcrop.',
			'This work holds significance today as a commentary on progress.',
		].join('\n\n'),
	)

	expect(levelII).toBe(
		'The artwork portrays Prometheus bound to a rocky outcrop.',
	)
})

test('strips a bare description heading', () => {
	const { levelII } = splitDescription(
		[
			'**Artwork Description: Marais**',
			'"Marais" offers a captivating aerial view of Paris.',
			'It resonates with modern viewers as a record of urban change.',
		].join('\n\n'),
	)

	expect(levelII).toBe('"Marais" offers a captivating aerial view of Paris.')
})

test('leaves level III null when the text never turns to the present', () => {
	const { levelII, levelIII } = splitDescription(
		[
			'The façade captures the viewer’s attention with intricate details.',
			'The interplay of light and shadow structures the composition.',
		].join('\n\n'),
	)

	expect(levelII).toContain('The façade captures')
	expect(levelIII).toBeNull()
})

test('keeps a paragraph for level II when the opening one reads as present-tense', () => {
	const { levelII, levelIII } = splitDescription(
		[
			'Moreau’s "Saint Sébastien" resonates with themes of martyrdom.',
			'It continues to invite reflection on suffering and redemption.',
		].join('\n\n'),
	)

	expect(levelII).toBe(
		'Moreau’s "Saint Sébastien" resonates with themes of martyrdom.',
	)
	expect(levelIII).toBe(
		'It continues to invite reflection on suffering and redemption.',
	)
})
