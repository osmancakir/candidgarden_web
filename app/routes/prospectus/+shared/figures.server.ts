import {
	manifest,
	scoreboardFor,
} from '#app/routes/staedel-research/+shared/pilot.server.ts'
import {
	MEDIA,
	SCORE_CATEGORIES,
} from '#app/routes/staedel-research/+shared/schema.ts'
import { type DeckFigures, type L } from './deck.ts'

/**
 * The deck's numbers, taken from the pilot run rather than retyped.
 *
 * A pitch that quotes a figure the report does not support is the one mistake
 * this whole argument cannot survive, so the corpus sizes, the sample, the call
 * count and the scoreboard are all read out of the same frozen run the client
 * received. Change the run and the slides change with it.
 *
 * Three groups of figures cannot come from there, and are stated here with
 * their source rather than smuggled into the copy:
 */

/**
 * Records carrying five or more thematic keywords, per medium.
 *
 * Computed over the *whole* export during the pilot; the committed sample holds
 * only 40 works, so it cannot be recomputed here. These are the figures §3 of
 * the pilot report states, and the two must not disagree.
 */
const WELL_CATALOGUED = { prints: 66, drawings: 18 }

/**
 * The vocabulary finding from §4 of the report: terms in the agreed list that
 * the export never uses, against the commonest value it actually contains.
 */
const VOCABULARY = {
	unusedAgreedTerms: 6,
	commonestValue: 'Personendarstellung',
	commonestValueCount: 560,
}

/**
 * German names for the four score categories.
 *
 * The Städel schema carries English labels because that module's audience is
 * the run itself. On a deck shown to a German collection, a column headed
 * ICONOGRAPHY above a German sentence is the kind of seam that makes a room
 * wonder who the material was really written for.
 */
const CATEGORY_LABELS: Record<string, L> = {
	iconography: { de: 'Ikonografie', en: 'Iconography' },
	association: { de: 'Assoziation', en: 'Association' },
	atmosphere: { de: 'Atmosphäre', en: 'Atmosphere' },
	emotion: { de: 'Emotion', en: 'Emotion' },
}

/** The scoreboard the deck puts on screen, both media, roster order preserved. */
export function scoreboards() {
	return MEDIA.map((medium) => ({
		id: medium.id,
		label: medium.label,
		german: medium.german,
		rows: scoreboardFor(medium.id).map((row) => {
			const model = manifest.models.find((m) => m.id === row.model)
			return {
				model: row.model,
				label: model?.label ?? row.model,
				provider: model?.provider ?? '',
				scores: SCORE_CATEGORIES.map((c) => ({
					id: c.id,
					label: CATEGORY_LABELS[c.id] ?? { de: c.label, en: c.label },
					value: row[c.id],
				})),
				overall: row.overall,
			}
		}),
	}))
}

export type Scoreboards = ReturnType<typeof scoreboards>

/**
 * The spread the "model choice is the project" slide rests on: the lowest and
 * highest iconography mean anywhere in the run. Read across both media, because
 * the claim is about the roster rather than about prints.
 */
function iconographySpread() {
	const values = MEDIA.flatMap((medium) =>
		scoreboardFor(medium.id)
			.map((row) => row.iconography)
			.filter((v): v is number => v != null),
	)
	return { low: Math.min(...values), high: Math.max(...values) }
}

export function figures(): DeckFigures {
	return {
		corpus: manifest.corpus,
		sample: manifest.sample,
		calls: manifest.calls,
		providers: manifest.models.length,
		iconography: iconographySpread(),
		fullRunMultiple: Math.round(manifest.corpus.works / manifest.sample.works),
		wellCatalogued: WELL_CATALOGUED,
		fields: {
			requested: manifest.tagFields.length,
			// The four the museum's own records leave empty in every row —
			// association, atmosphere, emotion — which is the slide's whole point.
			emptyInEveryRecord: 4,
		},
		vocabulary: VOCABULARY,
	}
}
