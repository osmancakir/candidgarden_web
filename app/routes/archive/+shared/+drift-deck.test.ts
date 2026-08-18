import { expect, test } from 'vitest'
import deckData from '#app/data/drift/deck.json'

/**
 * Invariants of the deck file itself.
 *
 * The deck is data rather than code, built by a script that talks to a database
 * and a model and is run by hand every few months. That is exactly the shape of
 * thing that regresses silently: a rebuilt deck is 200KB of JSON nobody reads,
 * and the failures it can carry — the same painting dealt twice, a painter
 * taking a tenth of the deck, a card dated 1908 for 1608 — all look fine in a
 * diff and wrong on a phone. These are the properties `build-drift-deck.mjs`
 * exists to guarantee, asserted against what it actually wrote.
 */

const deck = deckData as unknown as {
	formatVersion: number
	pool: { painters: number; paintings: number }
	coverage: {
		cards: number
		maxPerPainter: number
		periods: Array<{ century: number; cards: number }>
	}
	poolWorks: Array<number>
	cards: Array<{
		id: number
		title: string | null
		artist: string | null
		notBefore: number | null
		notAfter: number | null
		objectKey: string | null
		represents: number
		readings: number
	}>
}

test('every card is a painting the deck was allowed to deal', () => {
	const pool = new Set(deck.poolWorks)
	const missing = deck.cards.filter((card) => !pool.has(card.id))
	expect(missing.map((card) => card.id)).toEqual([])
	expect(deck.poolWorks).toHaveLength(deck.pool.paintings)
})

test('every card can be shown, placed and dated', () => {
	for (const card of deck.cards) {
		expect(card.objectKey, `card ${card.id} has no plate`).toBeTruthy()
		expect(card.readings, `card ${card.id} has no reading`).toBeGreaterThan(0)
		expect(
			card.notBefore ?? card.notAfter,
			`card ${card.id} is undated`,
		).toBeTruthy()
	}
})

test('no painting is dealt twice under the same painter', () => {
	const seen = new Map<string, number>()
	for (const card of deck.cards) {
		const key = `${card.artist}|${(card.title ?? '')
			.toLowerCase()
			.replace(/[^\p{L}\p{N}]+/gu, ' ')
			.trim()}`
		expect(seen.has(key), `${key} is dealt twice`).toBe(false)
		seen.set(key, card.id)
	}
})

test('no painter takes more than their share', () => {
	const perPainter = new Map<string, number>()
	for (const card of deck.cards) {
		const painter = card.artist ?? 'unattributed'
		perPainter.set(painter, (perPainter.get(painter) ?? 0) + 1)
	}

	// The builder caps painters at four and lifts the cap only where a period is
	// too thin to fill its quota otherwise — the fourteenth century here, which
	// this archive knows through four painters. What it lifted the cap to is
	// recorded on the deck, so the cards have to agree with the record.
	const over = [...perPainter].filter(
		([, count]) => count > deck.coverage.maxPerPainter,
	)
	expect(over).toEqual([])

	// And however thin a period is, no single hand may be a twentieth of what a
	// reader sees. Past that the drift is measuring a painter, not a reader.
	expect(deck.coverage.maxPerPainter).toBeLessThanOrEqual(
		deck.cards.length / 20,
	)
})

test('the deck spans centuries rather than reproducing the archive', () => {
	const centuries = new Set(
		deck.cards.map((card) => {
			const year = card.notBefore ?? card.notAfter ?? 0
			return Math.floor((year - 1) / 100) + 1
		}),
	)
	// Six centuries is the claim the page makes to the reader in its first
	// sentence, so it is the one worth failing a build over.
	expect(centuries.size).toBeGreaterThanOrEqual(6)

	// And no single century may hold most of the deck, which is what a spread
	// over this archive gives you if nobody stops it.
	const perCentury = new Map<number, number>()
	for (const card of deck.cards) {
		const century =
			Math.floor(((card.notBefore ?? card.notAfter ?? 0) - 1) / 100) + 1
		perCentury.set(century, (perCentury.get(century) ?? 0) + 1)
	}
	const largest = Math.max(...perCentury.values())
	expect(largest).toBeLessThanOrEqual(deck.cards.length * 0.3)
})

test('dates are plausible for the painter they are filed under', () => {
	const years = new Map<string, Array<number>>()
	for (const card of deck.cards) {
		const painter = card.artist ?? 'unattributed'
		const year = card.notBefore ?? card.notAfter
		if (year === null) continue
		if (!years.has(painter)) years.set(painter, [])
		years.get(painter)!.push(year)
	}
	for (const [painter, painterYears] of years) {
		const span = Math.max(...painterYears) - Math.min(...painterYears)
		expect(span, `${painter} spans ${span} years`).toBeLessThanOrEqual(140)
	}
	for (const card of deck.cards) {
		const year = card.notBefore ?? card.notAfter ?? 0
		expect(year, `card ${card.id}`).toBeGreaterThanOrEqual(1200)
		expect(year, `card ${card.id}`).toBeLessThanOrEqual(1960)
	}
})
