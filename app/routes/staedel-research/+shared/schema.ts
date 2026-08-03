/**
 * The vocabulary of the Städel pilot, shared by loaders and components.
 *
 * Everything here is client-safe: types, field labels, and the URL grammar. The
 * data itself is server-only (see pilot.server.ts) because the compacted run is
 * 1.2 MB and no view needs more than one work's worth of it at a time.
 *
 * Field names stay in the museum's German — `Ikon.Hauptmotiv.allgemein`, not
 * "main motif". They are the schema that will be written back into Axiell, and
 * renaming them for display would put a translation layer between what the team
 * reads here and what they receive in the CSV. The English gloss sits alongside
 * as a gloss, which is what it is.
 */

export type MediumId = 'prints' | 'drawings'
export type ModelId = string
export type ScoreCategory =
	| 'iconography'
	| 'association'
	| 'atmosphere'
	| 'emotion'

/**
 * A model returns each field either as a bare list or as typed groups. The
 * museum's own records are re-paired into the same two shapes by the prep
 * script, so one renderer serves both and a curator compares like with like.
 */
export type TagValue =
	| { kind: 'flat'; values: Array<string> }
	| { kind: 'grouped'; groups: Array<{ type: string; values: Array<string> }> }

export type TagField =
	| 'Ikon.Hauptmotiv.allgemein'
	| 'Ikon.Hauptmotiv.im_einzelnen'
	| 'Ikon.Person.Name'
	| 'Ikon.Thema'
	| 'Ikon.Quelle.allgemein'
	| 'Assoziation.Person'
	| 'Assoziation.Thema'
	| 'Atmosphäre'
	| 'Emotion'

export type TagRecord = Partial<Record<TagField, TagValue>>

export type Work = {
	id: string
	medium: MediumId
	objectNumber: string
	recordNumber: string | null
	title: string | null
	titleVariants: Array<string>
	artist: string | null
	objectType: string | null
	notBefore: string | null
	notAfter: string | null
	objectKey: string
	museum: TagRecord
	museumTagCount: number
}

export type ModelTags = { fields: TagRecord; total: number }

export type DescriptionSet = {
	german: { long: string; short: string }
	english: { long: string; short: string }
}

export type WorkEvaluation = {
	scores: Record<ScoreCategory, number | null>
	overall: number
	justifications: Partial<Record<ScoreCategory, string>>
}

export type ScoreRow = {
	model: ModelId
	works: number
	overall: number | null
} & Record<ScoreCategory, number | null>

export type ModelInfo = { id: ModelId; provider: string; label: string }

export type UsageTotals = {
	tags: { calls: number; input: number; output: number; thinking: number }
	descriptions: {
		calls: number
		input: number
		output: number
		thinking: number
	}
}

export type Manifest = {
	experiment: string
	runDate: string
	corpus: { works: number; prints: number; drawings: number }
	sample: { works: number; perMedium: number; maxPerArtist: number }
	calls: number
	models: Array<ModelInfo>
	media: Array<{ id: MediumId; german: string; label: string }>
	tagFields: Array<TagField>
	scoreCategories: Array<ScoreCategory>
	usage: Record<string, UsageTotals>
	generatedAt: string
}

export const MEDIA: Array<{ id: MediumId; label: string; german: string }> = [
	{ id: 'prints', label: 'Prints', german: 'Druckgrafik' },
	{ id: 'drawings', label: 'Drawings', german: 'Zeichnung' },
]

export const DEFAULT_MEDIUM: MediumId = 'prints'

export function parseMedium(value: string | null): MediumId {
	return value === 'drawings' ? 'drawings' : DEFAULT_MEDIUM
}

export function mediumLabel(medium: MediumId) {
	return MEDIA.find((m) => m.id === medium)?.label ?? medium
}

export function mediumGerman(medium: MediumId) {
	return MEDIA.find((m) => m.id === medium)?.german ?? medium
}

export const SCORE_CATEGORIES: Array<{
	id: ScoreCategory
	label: string
	gloss: string
}> = [
	{
		id: 'iconography',
		label: 'Iconography',
		gloss: 'Is the subject correctly recognised?',
	},
	{
		id: 'association',
		label: 'Association',
		gloss: 'Are the contextual links sound?',
	},
	{
		id: 'atmosphere',
		label: 'Atmosphere',
		gloss: 'Does the mood match the sheet?',
	},
	{
		id: 'emotion',
		label: 'Emotion',
		gloss: 'Does the stated effect match the work?',
	},
]

/** German schema name, English gloss, and what the field is for. */
export const TAG_FIELDS: Record<TagField, { gloss: string; note: string }> = {
	'Ikon.Hauptmotiv.allgemein': {
		gloss: 'Primary subject class',
		note: 'Controlled vocabulary, led by the terms the Städel actually catalogues.',
	},
	'Ikon.Hauptmotiv.im_einzelnen': {
		gloss: 'Specific central motifs',
		note: 'What the sheet is mainly about, in free terms.',
	},
	'Ikon.Person.Name': {
		gloss: 'Figures depicted',
		note: 'Only those visible in the image. Named-but-absent belongs to Assoziation.Person.',
	},
	'Ikon.Thema': {
		gloss: 'Thematic keywords',
		note: 'Every visible element, filed on one of the eleven thematic axes.',
	},
	'Ikon.Quelle.allgemein': {
		gloss: 'Textual source',
		note: 'The work or corpus depicted, where there is an identifiable one.',
	},
	'Assoziation.Person': {
		gloss: 'Associated persons',
		note: 'Not depicted, but bound up with the work — patron, dedicatee, author.',
	},
	'Assoziation.Thema': {
		gloss: 'Associated themes',
		note: 'The interpretive layer: what the depicted things mean.',
	},
	Atmosphäre: {
		gloss: 'Mood',
		note: 'Controlled vocabulary of 45 terms.',
	},
	Emotion: {
		gloss: 'Viewer response',
		note: 'Controlled vocabulary of 28 terms. Evoked, not depicted.',
	},
}

/** The four bands the fields fall into, in the order the prompt asks for them. */
export const TAG_SECTIONS: Array<{
	title: string
	blurb: string
	fields: Array<TagField>
}> = [
	// Blurbs are written source-neutral: the same four bands head the museum's
	// own record and each model's, and a phrase like "what the model reads"
	// would misdescribe the left-hand column every time.
	{
		title: 'Motif',
		blurb: 'The visible, nameable subject of the sheet.',
		fields: [
			'Ikon.Hauptmotiv.allgemein',
			'Ikon.Hauptmotiv.im_einzelnen',
			'Ikon.Person.Name',
		],
	},
	{
		title: 'Themes',
		blurb:
			'Every catalogued element, filed on a thematic axis, plus its source.',
		fields: ['Ikon.Thema', 'Ikon.Quelle.allgemein'],
	},
	{
		title: 'Associations',
		blurb:
			'What is not in the picture but is in the work — the iconological layer.',
		fields: ['Assoziation.Person', 'Assoziation.Thema'],
	},
	{
		title: 'Mood',
		blurb: 'Atmosphere and the response it is expected to produce.',
		fields: ['Atmosphäre', 'Emotion'],
	},
]

/**
 * §3 of the status note: four of the nine fields are empty in every museum
 * record, because they are the categories the Städel asked us to *add*. The
 * comparison view says so rather than showing an unexplained blank column.
 */
export const FIELDS_ABSENT_FROM_MUSEUM_RECORDS: Array<TagField> = [
	'Assoziation.Person',
	'Assoziation.Thema',
	'Atmosphäre',
	'Emotion',
]

export function countTagValue(value: TagValue | undefined): number {
	if (!value) return 0
	if (value.kind === 'flat') return value.values.length
	return value.groups.reduce((n, g) => n + g.values.length, 0)
}

export function countTagRecord(record: TagRecord): number {
	return Object.values(record).reduce((n, v) => n + countTagValue(v), 0)
}

/** "1496"–"1498" → "1496–1498"; a single year stands alone; nothing is honest. */
export function displayDating(
	notBefore: string | null,
	notAfter: string | null,
) {
	if (notBefore && notAfter && notBefore !== notAfter) {
		return `${notBefore}–${notAfter}`
	}
	return notBefore || notAfter || 'undated'
}

export function workLabel(work: Pick<Work, 'title' | 'objectNumber'>) {
	return work.title ?? work.objectNumber
}
