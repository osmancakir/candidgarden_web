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
	/** Named places from the current round's keywords, longest first. */
	places: Array<string>
	/** The museum's notes that name this sheet. */
	notes: Array<NoteId>
}

/**
 * A value the research repo's rule checks flag (src/lib/rule-checks.js there).
 * Crude by design — a pattern, not a judgement — so the pages show it as a
 * question beside the value, never as a verdict on it.
 */
export type FlagCheck =
	| 'artist'
	| 'geo'
	| 'role'
	| 'title'
	| 'compound'
	| 'banned'

export type KeywordFlag = {
	check: FlagCheck
	field: TagField
	type: string | null
	value: string
}

export const FLAG_LABELS: Record<FlagCheck, { label: string; gloss: string }> =
	{
		artist: {
			label: 'artist',
			gloss: 'The work’s own artist, listed as an associated person.',
		},
		geo: {
			label: 'not a named place',
			gloss: 'Filed under Geografie, but a kind of place rather than a named one.',
		},
		role: {
			label: 'role, not a name',
			gloss: 'An unnamed figure or group filed as a person.',
		},
		title: {
			label: 'title as motif',
			gloss: 'The catalogue title copied into the main motif.',
		},
		compound: {
			label: 'open compound',
			gloss: 'A phrase rather than a term an authority file would hold.',
		},
		banned: {
			label: 'technique',
			gloss: 'A process, material or period.',
		},
	}

export type ModelTags = {
	fields: TagRecord
	total: number
	flags: Array<KeywordFlag>
}

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

/**
 * What became of a model. `finalist`: the current round's two. `previous`: the
 * 25 August finalists, replaced by their successors but kept because the
 * museum's notes were written against them. `retired` models lost on the
 * pilot's own scores; `judge` is the one role a non-contestant can hold.
 */
export type ModelStatus = 'finalist' | 'previous' | 'judge' | 'retired'

export type ModelInfo = {
	id: ModelId
	provider: string
	label: string
	status: ModelStatus
	/** The provider succession this model belongs to, if it is still in one. */
	line: LineId | null
}

/** Retired models and the judge are no longer generating results for the
 *  roster; their output stays on the page but is set back a shade so a
 *  reader can tell at a glance which record is still live. */
export function isModelMuted(status: ModelStatus): boolean {
	return status === 'retired' || status === 'judge'
}

/* --------------------------------------------------------------------------
   Rounds, lines and approaches.

   Every output on these pages belongs to a *run*: one round of the experiment,
   one model. A run key is `round/model`. A *line* is a provider's succession of
   runs — OpenAI's pilot, round-2 and round-3 models — which is the axis a
   reader follows to see one sheet's text change over time. An *approach* is a
   way of writing the text; only round 3 tried more than one.
   -------------------------------------------------------------------------- */

export type RoundId = 'pilot' | 'revision' | 'round3'
export type LineId = 'openai' | 'anthropic'
export type ApproachId = 'direct' | 'fromKeywords' | 'synthesis'
export type RunKey = `${RoundId}/${string}`

export const runKey = (round: RoundId, model: ModelId): RunKey =>
	`${round}/${model}`

export type Round = {
	id: RoundId
	date: string
	label: string
	short: string
	models: Array<ModelId>
	approaches: Array<ApproachId>
}

export type Line = {
	id: LineId
	provider: string
	runs: Array<{ round: RoundId; model: ModelId }>
}

export const APPROACHES: Array<{
	id: ApproachId
	label: string
	short: string
	gloss: string
}> = [
	{
		id: 'direct',
		label: 'Written directly',
		short: 'Direct',
		gloss: 'From the image and the catalogue record, as in every round so far.',
	},
	{
		id: 'fromKeywords',
		label: 'Written from the keywords',
		short: 'From keywords',
		gloss:
			'The same prompt, plus the keywords the same model catalogued for the sheet, given as a checklist rather than an outline.',
	},
	{
		id: 'synthesis',
		label: 'Synthesised from both',
		short: 'Synthesis',
		gloss:
			'Both models’ direct texts, unlabelled as A and B, rewritten into one text by the model named.',
	},
]

export function parseApproach(value: string | null): ApproachId {
	return APPROACHES.some((a) => a.id === value)
		? (value as ApproachId)
		: 'direct'
}

export function parseLine(value: string | null): LineId {
	return value === 'anthropic' ? 'anthropic' : 'openai'
}

/** One sheet's four texts from one run, one approach. */
export type TextSets = Partial<Record<ApproachId, DescriptionSet>>

/** The museum's rules for keywords, counted over one run. */
export type KeywordMeasure = {
	sheets: number
	values: number
	subjectValues: number
	geoTotal: number
} & Record<FlagCheck, number>

/** The museum's rules for texts, counted over one run and approach. */
export type TextRuleMeasure = {
	texts: number
	avgLong: number
	/** German long text within 550 characters. */
	target: number
	/** 551–650: the room a rich sheet may take. */
	rich: number
	/** Over 650. */
	longer: number
	hedgesDe: number
	hedgesEn: number
	/** Texts with at least one title set in „…“. */
	quoted: number
	technique: number
	placesNamed: number
	placesTotal: number
}

export type NoteId =
	| 'geo'
	| 'compound'
	| 'association'
	| 'artist'
	| 'persons'
	| 'sitter'
	| 'concept'
	| 'schraffur'
	| 'quotes'
	| 'genre'
	| 'hedges'
	| 'places'
	| 'three'

/** One of the museum's notes on round 2, and what round 3 did about it. */
export type Note = {
	id: NoteId
	area: 'keywords' | 'texts'
	said: string
	changed: string
	measure?: FlagCheck | 'quoted' | 'hedges' | 'places'
	check?: string
	sheets: Array<{ id: string; objectNumber: string }>
	view: 'keywords' | 'approaches' | 'rounds'
}

/** Where every matching term sits on one sheet, run by run. */
export type SpotCheck = {
	id: string
	sheet: { id: string; objectNumber: string }
	want: TagField
	/** The terms the note names. */
	expect: Array<string>
	runs: Array<{
		run: RunKey
		hits: Array<SpotHit>
		/** Named terms not filed under `want`. */
		missing: Array<string>
		/** Named terms filed under `want` and somewhere else too. */
		alsoElsewhere: Array<SpotHit>
		/** Terms the note rules out, found anyway. */
		forbidden: Array<SpotHit>
	}>
}

export type SpotHit = { field: TagField; type: string | null; value: string }

export type MeasureScope = 'all' | MediumId

export type Round3 = {
	date: string
	notes: Array<Note>
	spotChecks: Array<SpotCheck>
	keywordMeasures: Record<MeasureScope, Record<RunKey, KeywordMeasure>>
	textMeasures: Record<
		MeasureScope,
		Record<RunKey, Partial<Record<ApproachId, TextRuleMeasure>>>
	>
	cost: {
		/** USD, the whole round-3 sample. */
		sample: number
		projection: Array<{
			run: RunKey
			perSheet: Record<'keywords' | ApproachId, number>
			full: Record<ApproachId, number>
		}>
		corpus: Record<MediumId, number>
	}
}

/** Counted off the texts themselves by the prep script, never asserted. */
export type TextMeasure = {
	texts: number
	technique: number
	avgLong: number
	inBand: number
}

/**
 * The revision of 25 August 2026: what the museum's reply to the pilot changed,
 * and what it did not. Scoped deliberately — one task, two models — so a reader
 * can tell revised output from pilot output anywhere on these pages.
 */
/**
 * The keyword rule is narrower than the description rule, so it needs two
 * numbers rather than one: `banned` is what it removes — process, material,
 * period — and `kept` is the visible-mark vocabulary it deliberately leaves,
 * because the museum's own records use it. A fall in `kept` would mean the rule
 * cut too deep, so it is reported beside the figure it flatters.
 */
export type TagMeasure = {
	sheets: number
	values: number
	banned: number
	sheetsWithBanned: number
	kept: number
}

/**
 * One model's score under three readings. The gap between the first two is the
 * judge alone (same keywords); the gap between the last two is the revision
 * alone (same judge). Without the middle column the fall from `pilotJudge` to
 * `neutralOnRevised` is unreadable — it could be either.
 */
export type JudgeCheckRow = {
	id: ModelId
	pilotJudge: number | null
	neutralOnPilot: number | null
	neutralOnRevised: number | null
	judgeEffect: number | null
	revisionEffect: number | null
}

export type Revision = {
	date: string
	tasks: Array<string>
	models: Array<ModelId>
	descriptions: Array<{
		id: ModelId
		before: TextMeasure
		after: TextMeasure
	}>
	tags: Array<{ id: ModelId; before: TagMeasure; after: TagMeasure }>
	judgeCheck: Array<{ medium: MediumId; models: Array<JudgeCheckRow> }>
	unchanged: Array<string>
	band: { min: number; max: number }
	houseReference: {
		texts: number
		withImageInExport: number
		usedAsExamples: number
		minLong: number
		maxLong: number
		avgLong: number
		technique: number
	}
	examples: Record<MediumId, Array<string>>
	excluded: Array<string>
}

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
	revision: Revision
	rounds: Array<Round>
	lines: Array<Line>
	round3: Round3
	/** Regex sources for the text marks, from the research repo's rule checks. */
	marks: { hedgeDe: string; hedgeEn: string; technique: string }
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
