import { expect, test } from 'vitest'
import {
	dealOffset,
	nextDeal,
	parseFilters,
	todaysDeal,
	type ArchiveFilters,
} from './filters.ts'

/**
 * The deal, which is the part of the URL contract that can quietly go wrong.
 *
 * A deal is only worth having if it holds still: cutting the same pack with the
 * same seed has to land in the same place, on the server that renders the page
 * and again in the browser that hydrates it, today and whenever the address is
 * followed back. These are the cases where a plausible implementation stops
 * being able to promise that.
 */

function filtersFor(query: string, now?: Date): ArchiveFilters {
	return parseFilters(new URL(`https://candid.garden/${query}`), now)
}

test('the index opens on a deal, not on the alphabet', () => {
	const filters = filtersFor('', new Date('2026-08-07T09:00:00Z'))
	expect(filters.sort).toBe('chance')
	expect(filters.seed).toBe('2026-08-07')
})

test('the deal is the same all day and different tomorrow', () => {
	const morning = filtersFor('', new Date('2026-08-07T00:00:01Z'))
	const night = filtersFor('', new Date('2026-08-07T23:59:59Z'))
	const tomorrow = filtersFor('', new Date('2026-08-08T09:00:00Z'))
	expect(morning.seed).toBe(night.seed)
	expect(tomorrow.seed).not.toBe(morning.seed)
})

test('a cited deal outlives the day it was dealt on', () => {
	const cited = filtersFor('?seed=k3f9ap', new Date('2027-01-01T00:00:00Z'))
	expect(cited.seed).toBe('k3f9ap')
	expect(dealOffset(cited.seed, 54497)).toBe(dealOffset('k3f9ap', 54497))
})

test('a seed from a hostile address falls back to today', () => {
	const now = new Date('2026-08-07T09:00:00Z')
	// Nothing downstream is injectable — the seed only ever reaches a hash — but
	// it is printed on the page, so it never leaves the alphabet it is minted in.
	expect(filtersFor('?seed=<script>', now).seed).toBe(todaysDeal(now))
	expect(filtersFor('?seed=', now).seed).toBe(todaysDeal(now))
	expect(filtersFor(`?seed=${'x'.repeat(33)}`, now).seed).toBe(todaysDeal(now))
})

test('every seed minted by "deal again" is one the URL will give back', () => {
	let seed = todaysDeal(new Date('2026-08-07T09:00:00Z'))
	for (let i = 0; i < 100; i++) {
		seed = nextDeal(seed)
		expect(filtersFor(`?seed=${seed}`).seed).toBe(seed)
	}
})

test('dealing again cuts somewhere else', () => {
	const seed = '2026-08-07'
	expect(nextDeal(seed)).not.toBe(seed)
	// Deterministic, because "deal again" is a link: an href drawn from
	// Math.random() renders one way on the server and another in the browser.
	expect(nextDeal(seed)).toBe(nextDeal(seed))
	expect(nextDeal(nextDeal(seed))).not.toBe(nextDeal(seed))
})

test('a cut always falls inside the pack', () => {
	for (const total of [0, 1, 2, 59, 60, 61, 54497]) {
		for (const seed of ['2026-08-07', 'k3f9ap', 'a', '-'.repeat(32)]) {
			const offset = dealOffset(seed, total)
			expect(Number.isInteger(offset)).toBe(true)
			expect(offset).toBeGreaterThanOrEqual(0)
			expect(offset).toBeLessThanOrEqual(Math.max(0, total - 1))
		}
	}
})

test('the deal does not disturb the orders that have meaning', () => {
	expect(filtersFor('?sort=title').sort).toBe('title')
	expect(filtersFor('?sort=period').sort).toBe('period')
	expect(filtersFor('?sort=motifs').sort).toBe('motifs')
	expect(filtersFor('?sort=nonsense').sort).toBe('chance')
})
