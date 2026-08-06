import { expect, test } from 'vitest'
import { formatLift, isVerdictValue, scoreMotifs } from './drift.ts'

/**
 * The readout's arithmetic, which is the part of the drift that can mislead.
 *
 * Everything else here either shows a picture or writes a row. These are the
 * numbers a reader will take away and repeat, so they are tested against the
 * cases where a naive rate would say something the sample cannot support.
 */

test('a motif pulled at the base rate has no lift', () => {
	const { toward, against } = scoreMotifs([
		{ name: 'garden', pulled: 5, shown: 10 },
		{ name: 'ruin', pulled: 5, shown: 10 },
	])
	expect(toward).toEqual([])
	expect(against).toEqual([])
})

test('a well-evidenced motif outranks a better-looking accident', () => {
	// Raw rates would put `accident` (2/3 = 0.67) above `evidenced` (8/13 = 0.62).
	// It is one card away from 1/3, and the readout should not lead with it.
	const { toward } = scoreMotifs([
		{ name: 'accident', pulled: 2, shown: 3 },
		{ name: 'evidenced', pulled: 8, shown: 13 },
		{ name: 'filler', pulled: 2, shown: 20 },
	])
	expect(toward.map((motif) => motif.name)).toEqual(['evidenced', 'accident'])
})

test('counts are reported as observed, not as damped', () => {
	const { toward } = scoreMotifs([
		{ name: 'garden', pulled: 6, shown: 7 },
		{ name: 'filler', pulled: 2, shown: 20 },
	])
	expect(toward[0]).toMatchObject({ name: 'garden', pulled: 6, shown: 7 })
	// Damped, so the figure sits below the raw ratio of the two rates (×3.1).
	expect(toward[0]!.lift).toBeLessThan(3.1)
	expect(toward[0]!.lift).toBeGreaterThan(1)
})

test('a motif that never pulled the reader is reported against', () => {
	const { toward, against } = scoreMotifs([
		{ name: 'saint', pulled: 0, shown: 8 },
		{ name: 'garden', pulled: 8, shown: 10 },
	])
	expect(toward.map((motif) => motif.name)).toEqual(['garden'])
	expect(against.map((motif) => motif.name)).toEqual(['saint'])
})

test('a drift with no pulls yields no findings', () => {
	expect(scoreMotifs([{ name: 'saint', pulled: 0, shown: 8 }])).toEqual({
		toward: [],
		against: [],
	})
	expect(scoreMotifs([])).toEqual({ toward: [], against: [] })
})

test('a motif carried by a single pulled card is not reported', () => {
	// `pulled >= 2` — one card is an anecdote, and the whole readout would
	// otherwise fill with the eight motifs of whichever work pulled first.
	const { toward } = scoreMotifs([
		{ name: 'once', pulled: 1, shown: 3 },
		{ name: 'filler', pulled: 4, shown: 20 },
	])
	expect(toward.map((motif) => motif.name)).not.toContain('once')
})

test('verdict values are validated rather than trusted', () => {
	expect(isVerdictValue('PULL')).toBe(true)
	expect(isVerdictValue('REST')).toBe(true)
	expect(isVerdictValue('pull')).toBe(false)
	// The vocabulary these replaced, in case a stale client is still swiping.
	expect(isVerdictValue('LIKE')).toBe(false)
	expect(isVerdictValue(null)).toBe(false)
	expect(isVerdictValue({ verdict: 'PULL' })).toBe(false)
})

test('lift is written as a ratio, never as a percentage', () => {
	expect(formatLift(2.44)).toBe('×2.4')
	expect(formatLift(1)).toBe('×1.0')
})
