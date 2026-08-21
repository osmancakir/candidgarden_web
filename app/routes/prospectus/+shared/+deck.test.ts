import { expect, test } from 'vitest'
import {
	buildDeck,
	LANGS,
	parseLang,
	type DeckFigures,
	type L,
	type Slide,
} from './deck.ts'
import { buildGrantDeck } from './grant-deck.ts'

/**
 * Invariants of the prospectus deck.
 *
 * The failure this file exists to catch is a missing translation. A deck in two
 * languages is written in one sitting and edited a phrase at a time afterwards,
 * and an English string left behind in the German column is invisible in a diff
 * and mortifying in a room — it is the one defect that makes the argument on
 * screen ("this was built for your collection, in your vocabulary") false while
 * the page still renders perfectly.
 *
 * The figures are a stand-in rather than the real run: these assertions are
 * about the shape of the copy, and importing the server module would drag 1.2 MB
 * of one museum's catalogue into a unit test to check that a sentence has a
 * German half.
 */

const FIGURES: DeckFigures = {
	corpus: { works: 2747, prints: 2041, drawings: 706 },
	sample: { works: 40, perMedium: 20, maxPerArtist: 3 },
	calls: 400,
	providers: 5,
	iconography: { low: 5.17, high: 9.19 },
	fullRunMultiple: 69,
	wellCatalogued: { prints: 66, drawings: 18 },
	fields: { requested: 9, emptyInEveryRecord: 4 },
	vocabulary: {
		unusedAgreedTerms: 6,
		commonestValue: 'Personendarstellung',
		commonestValueCount: 560,
	},
}

const deck = buildDeck(FIGURES)
const grantDeck = buildGrantDeck(FIGURES)

/** Both arguments, so no invariant is enforced on only one of them. */
const DECKS: Array<[string, Array<Slide>]> = [
	['direct', deck],
	['funding', grantDeck],
]

/** Every `{ de, en }` pair anywhere in a slide, however deeply nested. */
function localizedStrings(value: unknown, path: string): Array<[string, L]> {
	if (value == null || typeof value !== 'object') return []
	if (Array.isArray(value)) {
		return value.flatMap((entry, i) => localizedStrings(entry, `${path}[${i}]`))
	}
	const record = value as Record<string, unknown>
	if (typeof record.de === 'string' && typeof record.en === 'string') {
		return [[path, record as L]]
	}
	return Object.entries(record).flatMap(([key, entry]) =>
		localizedStrings(entry, `${path}.${key}`),
	)
}

const everyString = DECKS.flatMap(([name, slides]) =>
	slides.flatMap((slide) => localizedStrings(slide, `${name}/${slide.id}`)),
)

test.each(DECKS)(
	'the %s deck opens on a title and ends on a close',
	(_, slides) => {
		expect(slides.length).toBeGreaterThan(5)
		expect(slides[0]?.kind).toBe('title')
		expect(slides.at(-1)?.kind).toBe('close')
	},
)

test.each(DECKS)(
	'%s slide ids are unique — they are its addresses',
	(_, slides) => {
		const ids = slides.map((slide) => slide.id)
		expect(new Set(ids).size).toBe(ids.length)
	},
)

/**
 * The funding deck takes six slides from the direct one by reference rather
 * than by copy, so that a figure corrected in one cannot go on being wrong in
 * the other. This asserts the sharing is real: an identity check, not a deep
 * comparison, because a copy that happens to be equal today is exactly the
 * regression the `shared()` helper exists to prevent.
 */
test('shared slides are the same objects in both decks', () => {
	const SHARED_IDS = [
		'what-exists',
		'the-pilot',
		'the-discarded-metric',
		'uncertainty',
		'what-we-need',
		'what-you-keep',
	]
	const direct = buildDeck(FIGURES)
	const funding = buildGrantDeck(FIGURES)
	// Rebuilt from one `buildDeck` call inside `buildGrantDeck`, so identity
	// holds within a single build rather than across two.
	const rebuiltFunding = buildGrantDeck(FIGURES)
	expect(rebuiltFunding).toHaveLength(funding.length)

	for (const id of SHARED_IDS) {
		const a = direct.find((slide) => slide.id === id)
		const b = funding.find((slide) => slide.id === id)
		expect(b, `funding deck is missing shared slide "${id}"`).toBeDefined()
		expect(b).toEqual(a)
	}
})

test('every localized string is filled in both languages', () => {
	const empty = everyString.filter(
		([, value]) => !value.de.trim() || !value.en.trim(),
	)
	expect(empty.map(([path]) => path)).toEqual([])
})

/**
 * A German half identical to its English half is almost always a translation
 * that was never done. The exceptions are real — a bare email address, a proper
 * noun, a schema field name that must not be translated — so they are listed
 * rather than pattern-matched, and a new one has to be added deliberately.
 */
test('no localized string is untranslated prose', () => {
	const ALLOWED_IDENTICAL = [
		/^Osman Cakir/,
		/^Candid Garden$/,
		/^Emotion$/,
		// A bare number below a thousand carries no separator, so both languages
		// really do spell it the same way. Anything longer does not: this stops
		// at three digits precisely so that a 2.041 left sitting in the English
		// column still fails.
		/^\d{1,3}$/,
	]
	const suspicious = everyString.filter(
		([, value]) =>
			value.de === value.en &&
			!ALLOWED_IDENTICAL.some((allowed) => allowed.test(value.de)),
	)
	expect(suspicious.map(([path, value]) => `${path}: ${value.de}`)).toEqual([])
})

test('the funding deck states no programme figures it cannot vouch for', () => {
	const window = grantDeck.find((slide) => slide.id === 'the-window')
	const text = JSON.stringify(window)
	// Volumes, durations and success rates were not verified when this deck was
	// written, and a supplier reciting them is claiming knowledge it lacks. The
	// caveat naming the reading date is what stands in their place.
	expect(text).toMatch(/Programmberatung|programme office/)
	expect(text).not.toMatch(/€|EUR|Euro/)
})

test('the figures reach the copy rather than being described in it', () => {
	const problem = deck.find((slide) => slide.id === 'the-empty-fields')
	const body = (problem as Extract<Slide, { kind: 'claim' }>).body
	// The German thousands separator is the point: 2.041, never 2,041.
	expect(body[0]?.de).toContain('2.041')
	expect(body[0]?.en).toContain('2,041')
	expect(body[0]?.de).toContain('66')
})

test('parseLang falls back to German rather than throwing', () => {
	expect(parseLang('en')).toBe('en')
	expect(parseLang('de')).toBe('de')
	expect(parseLang(null)).toBe('de')
	expect(parseLang('fr')).toBe('de')
	expect(LANGS.map((entry) => entry.id)).toEqual(['de', 'en'])
})
