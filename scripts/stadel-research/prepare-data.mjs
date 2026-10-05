/**
 * Compact experiment 03-staedel-full-export into the JSON the
 * /staedel-research routes import.
 *
 * The research repo's output is shaped for the runner: one file per model per
 * task per medium, each record carrying its full token-usage envelope, and each
 * round of the experiment overwriting or sitting beside the last. This rewrites
 * the axis for a comparison UI: works first, then the run (round × model), then
 * the payload — because a curator picks a *sheet* and wants every answer to it
 * side by side, not a model and twenty sheets.
 *
 * Three rounds are on the pages, and the script reads each from where it lives:
 *
 *   pilot     1 Aug   five models          research repo at PILOT_REF
 *   revision  25 Aug  the two finalists    working tree, the older model files
 *   round3    5 Oct   their successors,    working tree, the newer model files
 *                     three ways of writing the text
 *
 * Usage:
 *   node scripts/stadel-research/prepare-data.mjs [path-to-research-repo]
 *
 * Defaults to ../candidgarden_stadelResearch, which is where it sits in a
 * normal checkout. Re-run it whenever the experiment is re-run; the output is
 * committed so the app never needs the research repo at build time.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const APP_ROOT = resolve(HERE, '../..')
const RESEARCH_ROOT = resolve(
	process.argv[2] ?? join(APP_ROOT, '../candidgarden_stadelResearch'),
)
const EXPERIMENT_PATH = 'experiments/03-staedel-full-export'
const EXPERIMENT = join(RESEARCH_ROOT, EXPERIMENT_PATH)
const OUT_DIR = join(APP_ROOT, 'app/data/stadel-research')

/** The research repo's own code, read rather than transcribed — see below. */
const importResearch = (path) =>
	import(pathToFileURL(join(RESEARCH_ROOT, path)).href)

const ruleChecks = await importResearch('src/lib/rule-checks.js')
const pricing = await importResearch('src/lib/pricing.js')

/**
 * Every model that has run in experiment 03, newest first.
 *
 * `status` records what each is now. `finalist`: the two models of the current
 * round. `previous`: the two finalists of the 25 August round, replaced by their
 * successors in round 3 but kept, because the museum's notes were written
 * against their output. `retired`: lost on the pilot's own scores; kept as the
 * evidence for cutting the roster. `judge`: Gemini, which left the line-up to
 * score it.
 *
 * `line` ties a model to its provider's succession, which is what lets a page
 * set one sheet's pilot, round-2 and round-3 text in a row.
 */
const MODELS = [
	{
		id: 'openai-gpt-6.1-sol',
		provider: 'OpenAI',
		label: 'GPT-6.1 Sol',
		status: 'finalist',
		line: 'openai',
	},
	{
		id: 'anthropic-claude-opus-5-5',
		provider: 'Anthropic',
		label: 'Claude Opus 5.5',
		status: 'finalist',
		line: 'anthropic',
	},
	{
		id: 'openai-gpt-5.6-sol',
		provider: 'OpenAI',
		label: 'GPT-5.6 Sol',
		status: 'previous',
		line: 'openai',
	},
	{
		id: 'anthropic-claude-opus-5',
		provider: 'Anthropic',
		label: 'Claude Opus 5',
		status: 'previous',
		line: 'anthropic',
	},
	{
		id: 'google-gemini-3.1-pro-preview',
		provider: 'Google',
		label: 'Gemini 3.1 Pro',
		status: 'judge',
		line: null,
	},
	{
		id: 'grok-grok-4.5',
		provider: 'xAI',
		label: 'Grok 4.5',
		status: 'retired',
		line: null,
	},
	{
		id: 'mistral-mistral-large-2512',
		provider: 'Mistral',
		label: 'Mistral Large',
		status: 'retired',
		line: null,
	},
]

/**
 * The research repo's commit holding the pilot output. The 25 August re-run
 * overwrote the two finalists' files in place, so their pilot versions exist
 * only in history; reading them from there rather than copying them in keeps
 * the before/after from drifting from what was actually run on 1 August.
 */
const PILOT_REF = 'f117ba4'

/** The ways a text was written. Only round 3 has more than the first. */
const APPROACHES = [
	{ id: 'direct', dir: 'descriptions' },
	{ id: 'fromKeywords', dir: 'descriptions_from_tags' },
	{ id: 'synthesis', dir: 'descriptions_synthesis' },
]

const ROUNDS = [
	{
		id: 'pilot',
		date: '2026-08-01',
		label: 'Pilot',
		short: '1 Aug',
		ref: PILOT_REF,
		models: [
			'openai-gpt-5.6-sol',
			'anthropic-claude-opus-5',
			'google-gemini-3.1-pro-preview',
			'grok-grok-4.5',
			'mistral-mistral-large-2512',
		],
		approaches: ['direct'],
	},
	{
		// The reporting date shown to the museum, set here rather than read off a
		// file timestamp.
		id: 'revision',
		date: '2026-08-25',
		label: 'Round 2',
		short: '25 Aug',
		ref: null,
		models: ['openai-gpt-5.6-sol', 'anthropic-claude-opus-5'],
		approaches: ['direct'],
	},
	{
		id: 'round3',
		date: '2026-10-05',
		label: 'Round 3',
		short: '5 Oct',
		ref: null,
		models: ['openai-gpt-6.1-sol', 'anthropic-claude-opus-5-5'],
		approaches: ['direct', 'fromKeywords', 'synthesis'],
	},
]

/** The two providers still in the line-up, each a succession of runs. */
const LINES = [
	{ id: 'openai', provider: 'OpenAI' },
	{ id: 'anthropic', provider: 'Anthropic' },
].map((line) => ({
	...line,
	runs: ROUNDS.map((round) => ({
		round: round.id,
		model: round.models.find(
			(id) => MODELS.find((m) => m.id === id)?.line === line.id,
		),
	})).filter((run) => run.model),
}))

const runKey = (roundId, modelId) => `${roundId}/${modelId}`

/**
 * The museum's notes on round 2, and what round 3 did about each.
 *
 * `said` is the note in brief, in the museum's words where they fit; `sheets`
 * are the works it names or that show it best, and each becomes a link to the
 * view that answers it. `measure` names the counted check, if there is one —
 * the figures on the page come from the output, not from this file. `view` says
 * which comparison answers the note: the keyword diff against round 2, or the
 * texts across rounds or across approaches.
 */
const NOTES = [
	{
		id: 'geo',
		area: 'keywords',
		said: 'Geografie holds named places only — „Rom“, „Frankfurt am Main“, „Alte Brücke“ — not „Flusslandschaft“, „Stadtsilhouette“ or „Stadtpanorama“.',
		changed:
			'Geografie now takes proper names only, a building with its place in brackets. Landscape types moved to Natur, unnamed towns and buildings to Kultur.',
		measure: 'geo',
		sheets: ['5738 Z', '5737 Z', '4069 Z'],
		view: 'keywords',
	},
	{
		id: 'compound',
		area: 'keywords',
		said: 'No open compounds such as „Martyriumsversuch unter Kaiser Domitian“ or „nackter Oberkörper“: they are not authority terms.',
		changed:
			'A value must be a term an authority file would hold. Phrases with „als“ or a preposition, and adjective + noun, are split into the concepts they combine.',
		measure: 'compound',
		sheets: ['31501 D', '15690 Z'],
		view: 'keywords',
	},
	{
		id: 'association',
		area: 'keywords',
		said: 'On 31501 D, „Glaubensbezeugnis“ and „Christenverfolgung“ belong under Association.',
		changed:
			'Ikon.Thema takes only what can be pointed at in the image; what it means goes to Assoziation.Thema. This sheet is the example the prompt now gives.',
		check: 'association',
		sheets: ['31501 D'],
		view: 'keywords',
	},
	{
		id: 'artist',
		area: 'keywords',
		said: 'The artist of the work is never an associated person. On 16336 Z Dürer may be, for the signature added later.',
		changed:
			'The catalogue’s artist is barred from Assoziation.Person; another artist named in a later addition, such as a monogram, is allowed.',
		measure: 'artist',
		check: 'artist',
		sheets: ['16336 Z'],
		view: 'keywords',
	},
	{
		id: 'persons',
		area: 'keywords',
		said: 'Persons are named individuals only. „Stadtbevölkerung“, „Hafenarbeiter“, „Schiffer“, „Reiter“ are image elements.',
		changed:
			'Ikon.Person.Name takes named individuals in authority form; unnamed figures and roles go to Ikon.Thema under Mensch.',
		measure: 'role',
		sheets: ['5738 Z', '63931a D', '678 Z'],
		view: 'keywords',
	},
	{
		id: 'sitter',
		area: 'keywords',
		said: 'Depicted persons belong in the main motif, as „Hendrick van Steenwyck der Jüngere“ on 791 Z.',
		changed:
			'A named sitter or saint is listed by name in Ikon.Hauptmotiv.im_einzelnen.',
		check: 'sitter',
		sheets: ['791 Z'],
		view: 'keywords',
	},
	{
		id: 'concept',
		area: 'keywords',
		said: 'Association terms as the bare concept: on 5762 D „Versuchung“, „Keuschheit“, „Weisheit“, not „Elefant als Sinnbild der Keuschheit“.',
		changed:
			'Assoziation.Thema takes the concept alone; the thing that carries it is already in Ikon.Thema.',
		check: 'concept',
		sheets: ['5762 D'],
		view: 'keywords',
	},
	{
		id: 'schraffur',
		area: 'keywords',
		said: '„Schraffur“ as a design element can stay.',
		changed: 'Kept, with the rest of the visible-mark vocabulary.',
		sheets: [],
		view: 'keywords',
	},
	{
		id: 'quotes',
		area: 'texts',
		said: 'Series and proper names in quotation marks: „Apokalypse“ / “Apocalypse”, „Marter des Evangelisten Johannes“.',
		changed:
			'A title of a work, a series or a text is set in quotation marks: „…“ in German, “…” in English.',
		measure: 'quoted',
		sheets: ['31501 D', '31505 D', '3971 D'],
		view: 'approaches',
	},
	{
		id: 'genre',
		area: 'texts',
		said: 'Drawings: keep the kind of sheet in view — Merian as scientific drawing, the „Ruhende Venus“ as a study.',
		changed:
			'The drawings prompt now says what kind of sheet it is when the evidence is there: a study, a natural-history record, a design, a topographical view.',
		sheets: ['1493 Z', '1497 Z', '4060 Z', '805 Z', '6952 Z'],
		view: 'rounds',
	},
	{
		id: 'hedges',
		area: 'texts',
		said: 'Fewer „wohl“ / “probably”: a little more confidence.',
		changed:
			'No hedge on what the catalogue states; at most one per text, where the image genuinely leaves it open.',
		measure: 'hedges',
		sheets: ['4060 Z', '5950 D'],
		view: 'rounds',
	},
	{
		id: 'places',
		area: 'texts',
		said: 'Name the places in the text, consistently — as in the „Ansicht von Frankfurt am Main“.',
		changed:
			'A place that can be named is named. The keyword arm, which hands the model its own Geografie terms, tests whether that helps further.',
		measure: 'places',
		sheets: ['5738 Z', '5737 Z', '15266 Z', '9203 D'],
		view: 'approaches',
	},
	{
		id: 'three',
		area: 'texts',
		said: '4060 Z, 805 Z and 5950 D: apart from technique and style, the old texts were considerably better.',
		changed:
			'Not the technique ban but the length target: it cut the study’s purpose, Goltzius’s injured hand, the small figures of the landscape. A sheet rich in such content may now run to 650 characters, and a documented fact the image bears out may stay.',
		sheets: ['4060 Z', '805 Z', '5950 D'],
		view: 'rounds',
	},
]

/**
 * The notes that name one sheet and one placement, checked on that sheet.
 *
 * Each lists every value matching `find`, in every run, with the field it was
 * filed under; the page sets them in a row so a curator can see where a term sat
 * in round 2 and where it sits now, rather than take a pass mark on trust.
 * `expect` are the terms the note names: one missing from `want`, or also filed
 * elsewhere than `allowAlso`, is reported as open. `forbid` are terms the note
 * rules out.
 */
const SPOT_CHECKS = [
	{
		id: 'association',
		sheet: '31501 D',
		find: /^(Glaubensbezeugnis|Christenverfolgung|Martyrium)$/,
		want: 'Assoziation.Thema',
		expect: ['Glaubensbezeugnis', 'Christenverfolgung'],
	},
	{
		id: 'artist',
		sheet: '16336 Z',
		find: /Dürer|Huber/,
		want: 'Assoziation.Person',
		expect: ['Albrecht Dürer'],
		/** The sheet's own artist: named here, the note is broken. */
		forbid: ['Wolf Huber'],
	},
	{
		id: 'sitter',
		sheet: '791 Z',
		find: /Steenwyck/,
		want: 'Ikon.Hauptmotiv.im_einzelnen',
		expect: ['Hendrick van Steenwyck der Jüngere'],
		/** The note adds the main motif; the name stays a person too. */
		allowAlso: ['Ikon.Person.Name'],
	},
	{
		id: 'concept',
		sheet: '5762 D',
		find: /Versuchung|Keuschheit|Weisheit/,
		want: 'Assoziation.Thema',
		expect: ['Versuchung', 'Keuschheit', 'Weisheit'],
		/** The temptation is also the depicted scene, so Ikon.Thema may keep it. */
		allowAlso: ['Ikon.Thema'],
	},
]

/**
 * The keyword rule added on 25 August, and how it is measured.
 *
 * The museum's instruction was aimed at the descriptions, and checking it
 * against the keyword fields showed it could not be carried over whole: across
 * the 4,583 Ikon.Thema values in the export the museum names a process or a
 * period zero times, but records "Schraffur" 43 times on the formal axes the
 * briefing asks for. So BANNED is what the rule removes — the process, the
 * material, the period — and KEPT is the visible-mark vocabulary it deliberately
 * leaves alone. A fall in KEPT would mean the rule cut deeper than intended, so
 * both are reported rather than only the one that flatters it.
 */
const BANNED_TAG =
	/^(Radierung|Kupferstich|Holzschnitt|Lithografie|Lithographie|Federzeichnung|Pinsel|Lavierung|Kreide|Rötel|Silberstift|Kohle|Graphit|Papier|Büttenpapier|Tusche|Aquarell|Gouache|Bister|Sepia|Druckplatte|Platte|Kaltnadel|Ätzung|Stichel|Abzug|Barock|Renaissance|Manierismus|Gotik|Rokoko|Klassizismus|Romantik|Naturalismus|Realismus|Frühbarock|Hochrenaissance|Spätgotik)$/i

/**
 * "Feder" is both a drawing instrument and a feather, and on this collection it
 * is nearly always the feather: every occurrence in the revised output sits on
 * the Natur axis, among Flügel, Schnabel, Kralle and Fell. Counting the word
 * alone marked correct observations as violations, so the axis decides it.
 */
const AMBIGUOUS_TAG = /^Feder$/i
const isBannedValue = (value, type) =>
	BANNED_TAG.test(value) || (AMBIGUOUS_TAG.test(value) && type !== 'Natur')

const KEPT_TAG =
	/^(Schraffur|Kreuzschraffur|Punktierung|Licht|Schatten|Hell-Dunkel-Kontrast|Linie|Perspektive|Symmetrie|Lichtführung|Lichteinfall|Diagonale|Kontrast)$/i

const MEDIA = [
	{
		id: 'prints',
		dataset: 'prints_sample',
		german: 'Druckgrafik',
		label: 'Prints',
	},
	{
		id: 'drawings',
		dataset: 'drawings_sample',
		german: 'Zeichnung',
		label: 'Drawings',
	},
]

const SCORE_CATEGORIES = ['iconography', 'association', 'atmosphere', 'emotion']

/** The nine schema fields the briefing asks the model to fill. */
const TAG_FIELDS = [
	'Ikon.Hauptmotiv.allgemein',
	'Ikon.Hauptmotiv.im_einzelnen',
	'Ikon.Person.Name',
	'Ikon.Thema',
	'Ikon.Quelle.allgemein',
	'Assoziation.Person',
	'Assoziation.Thema',
	'Atmosphäre',
	'Emotion',
]

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

/** A file as it stood at `ref` in the research repo, or null if absent there. */
function readJsonAtRef(relativePath, ref) {
	try {
		const raw = execFileSync('git', ['show', `${ref}:${relativePath}`], {
			cwd: RESEARCH_ROOT,
			encoding: 'utf8',
			maxBuffer: 64 << 20,
		})
		return JSON.parse(raw)
	} catch {
		return null
	}
}

/** One output file of one run: from history for the pilot, from disk otherwise. */
function readRunFile(round, relativePath) {
	const path = `${EXPERIMENT_PATH}/${relativePath}`
	if (round.ref) return readJsonAtRef(path, round.ref)
	try {
		return readJson(join(RESEARCH_ROOT, path))
	} catch {
		return null
	}
}

/** "31501 D" → "31501-d". Stable, URL-safe, and reversible enough to eyeball. */
function slugify(objectNumber) {
	return String(objectNumber)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
}

/**
 * The evaluation file names models with spaces ("openai gpt 5.6 sol") while the
 * output files name them with hyphens. Normalising both to spaces matches them
 * without a hand-maintained lookup that could silently rot.
 */
const normaliseModel = (name) =>
	String(name)
		.replace(/[^a-z0-9.]+/gi, ' ')
		.trim()

const MODEL_BY_NORMALISED = new Map(
	MODELS.map((m) => [normaliseModel(m.id), m.id]),
)

/** Model output arrays carry values as string[] or as [{type, values}]. */
function normaliseTagValue(value) {
	if (!Array.isArray(value) || value.length === 0) return null
	if (value.every((item) => typeof item === 'string')) {
		const flat = value.filter(Boolean)
		return flat.length ? { kind: 'flat', values: flat } : null
	}
	const groups = []
	for (const item of value) {
		if (!item || typeof item !== 'object' || Array.isArray(item)) continue
		const values = Array.isArray(item.values)
			? item.values.filter((v) => typeof v === 'string' && v.length > 0)
			: []
		if (values.length) groups.push({ type: item.type || 'Ohne Typ', values })
	}
	return groups.length ? { kind: 'grouped', groups } : null
}

function pickTags(record) {
	const out = {}
	for (const field of TAG_FIELDS) {
		const value = normaliseTagValue(record[field])
		if (value) out[field] = value
	}
	return out
}

/**
 * The museum's own record. Ikon.Thema and Ikon.Person.Name arrive as a flat
 * array plus a parallel `.Typ` array of the same length; re-pairing them gives
 * the same grouped shape the models return, so one renderer serves both and a
 * curator compares like with like.
 */
function pairWithTypes(values, types) {
	if (!Array.isArray(values) || values.length === 0) return null
	if (!Array.isArray(types) || types.length !== values.length) {
		return { kind: 'flat', values: values.filter(Boolean) }
	}
	const byType = new Map()
	values.forEach((value, i) => {
		if (!value) return
		const type = types[i] || 'Ohne Typ'
		if (!byType.has(type)) byType.set(type, [])
		byType.get(type).push(value)
	})
	const groups = [...byType].map(([type, vals]) => ({ type, values: vals }))
	return groups.length ? { kind: 'grouped', groups } : null
}

function museumRecord(record) {
	const out = {}
	const flat = (field) => {
		const value = normaliseTagValue(record[field])
		if (value) out[field] = value
	}
	flat('Ikon.Hauptmotiv.allgemein')
	flat('Ikon.Hauptmotiv.im_einzelnen')
	flat('Ikon.Quelle.allgemein')
	const persons = pairWithTypes(
		record['Ikon.Person.Name'],
		record['Ikon.Person.Name.Typ'],
	)
	if (persons) out['Ikon.Person.Name'] = persons
	const themes = pairWithTypes(record['Ikon.Thema'], record['Ikon.Thema.Typ'])
	if (themes) out['Ikon.Thema'] = themes
	return out
}

function countValues(value) {
	if (!value) return 0
	if (value.kind === 'flat') return value.values.length
	return value.groups.reduce((n, g) => n + g.values.length, 0)
}

const countRecord = (record) =>
	Object.values(record).reduce((n, v) => n + countValues(v), 0)

/**
 * Sum a usage envelope into a running per-model token total.
 *
 * Five providers, five spellings, and two accounting conventions: Anthropic and
 * OpenAI count reasoning *inside* the output figure, Google and xAI report it
 * *beside* one. Where a provider states a total, output is derived as
 * total − input, which is right under both conventions. Anthropic states no
 * total and folds reasoning in, so the plain field is already correct there.
 */
function addUsage(total, usage) {
	if (!usage) return total
	const input =
		(usage.input_tokens ??
			usage.prompt_tokens ??
			usage.promptTokens ??
			usage.promptTokenCount ??
			0) +
		(usage.cache_creation_input_tokens ?? 0) +
		(usage.cache_read_input_tokens ?? 0)
	const statedTotal =
		usage.total_tokens ?? usage.totalTokens ?? usage.totalTokenCount
	const statedOutput =
		usage.output_tokens ??
		usage.completion_tokens ??
		usage.completionTokens ??
		usage.candidatesTokenCount ??
		0
	const output = statedTotal == null ? statedOutput : statedTotal - input
	const thinking =
		usage.output_tokens_details?.thinking_tokens ??
		usage.output_tokens_details?.reasoning_tokens ??
		usage.completion_tokens_details?.reasoning_tokens ??
		usage.thoughtsTokenCount ??
		0
	total.calls += 1
	total.input += input
	total.output += output
	total.thinking += thinking
	return total
}

/** "openai-gpt-6.1-sol" → the { provider, version } the research repo prices. */
function researchModel(modelId) {
	const [provider, ...rest] = modelId.split('-')
	return { provider, version: rest.join('-') }
}

/** What one record cost, in USD, at the provider's list price. */
function recordCost(modelId, usage) {
	if (!usage) return 0
	const model = researchModel(modelId)
	return pricing.costOf(
		pricing.normalizeUsage(model.provider, usage),
		pricing.priceFor(model),
	)
}

const round = (n, places = 2) => Math.round(n * 10 ** places) / 10 ** places
const sum = (xs) => xs.reduce((a, b) => a + b, 0)

// ---------------------------------------------------------------------------
// Works

const goldStandard = readJson(join(EXPERIMENT, 'input/gold-standard.json'))

/** works: the 40-sheet evaluation sample, keyed by slug. */
const works = []
const workBySlugAndMedium = new Map()
const slugByObjectNumber = new Map()

for (const medium of MEDIA) {
	const inMedium = goldStandard.filter(
		(r) => r.Objektbezeichnung === medium.german,
	)
	for (const record of inMedium) {
		const slug = slugify(record.Objektnummer)
		const record0 = museumRecord(record)
		const work = {
			id: slug,
			medium: medium.id,
			objectNumber: record.Objektnummer,
			recordNumber: record.Datensatznummer || null,
			title: record.Titel || null,
			titleVariants: (record['Titel.Varianten'] ?? []).filter(Boolean),
			artist: record.Künstler || null,
			objectType: record.Objektbezeichnung || null,
			notBefore: record['Datierung.von'] || null,
			notAfter: record['Datierung.bis'] || null,
			/** S3 key written by scripts/stadel-research/upload-images.mjs. */
			objectKey: `stadel-research/03-staedel-full-export/${slug}.webp`,
			museum: record0,
			museumTagCount: countRecord(record0),
			/** Named places, from the current round's keywords — filled below. */
			places: [],
			/** The museum's notes that name this sheet — filled below. */
			notes: [],
		}
		works.push(work)
		workBySlugAndMedium.set(`${medium.id}:${slug}`, work)
		slugByObjectNumber.set(String(record.Objektnummer), slug)
	}
}

const slugFor = (objectNumber) => {
	const slug = slugByObjectNumber.get(objectNumber)
	if (!slug) throw new Error(`"${objectNumber}" is not in the sample`)
	return slug
}

// ---------------------------------------------------------------------------
// Runs: keywords and texts, every round, every model

/** keywords: work id → run key → { fields, total, flags }. */
const keywords = {}
/** texts: work id → run key → approach → { german, english }. */
const texts = {}
/** The raw records, per run, for measuring: run key → medium → records. */
const rawKeywords = new Map()
/** run key → approach → medium → records. */
const rawTexts = new Map()
/** Tokens per pilot model, for the pilot's roster table. */
const usage = {}
/** USD, per run key → task → medium → { records, usd }. */
const cost = {}

const checkWork = (task, run, slug, medium) => {
	if (!workBySlugAndMedium.has(`${medium.id}:${slug}`)) {
		throw new Error(`${task}: ${run} returned unknown work ${slug}`)
	}
}

const addCost = (key, task, mediumId, modelId, records) => {
	cost[key] ??= {}
	cost[key][task] ??= {}
	cost[key][task][mediumId] = {
		records: records.length,
		usd: sum(records.map((r) => recordCost(modelId, r.usage))),
	}
}

for (const roundDef of ROUNDS) {
	for (const medium of MEDIA) {
		for (const modelId of roundDef.models) {
			const key = runKey(roundDef.id, modelId)

			const tagRecords =
				readRunFile(
					roundDef,
					`output/${medium.dataset}/tags/${modelId}.json`,
				) ?? []
			if (!tagRecords.length) {
				throw new Error(`no keywords for ${key} on ${medium.dataset}`)
			}
			rawKeywords.set(key, { ...rawKeywords.get(key), [medium.id]: tagRecords })
			for (const record of tagRecords) {
				const slug = slugify(record.Objektnummer)
				checkWork('keywords', key, slug, medium)
				const fields = pickTags(record)
				keywords[slug] ??= {}
				keywords[slug][key] = {
					fields,
					total: countRecord(fields),
					flags: ruleChecks.flagKeywords(record),
				}
			}

			for (const approach of APPROACHES) {
				if (!roundDef.approaches.includes(approach.id)) continue
				const textRecords =
					readRunFile(
						roundDef,
						`output/${medium.dataset}/${approach.dir}/${modelId}.json`,
					) ?? []
				if (!textRecords.length) {
					throw new Error(
						`no ${approach.id} texts for ${key} on ${medium.dataset}`,
					)
				}
				const byApproach = rawTexts.get(key) ?? {}
				byApproach[approach.id] = {
					...byApproach[approach.id],
					[medium.id]: textRecords,
				}
				rawTexts.set(key, byApproach)
				for (const record of textRecords) {
					const slug = slugify(record.Objektnummer)
					checkWork(approach.id, key, slug, medium)
					texts[slug] ??= {}
					texts[slug][key] ??= {}
					texts[slug][key][approach.id] = {
						german: {
							long: record.german?.long ?? '',
							short: record.german?.short ?? '',
						},
						english: {
							long: record.english?.long ?? '',
							short: record.english?.short ?? '',
						},
					}
				}
				if (roundDef.id === 'round3') {
					addCost(key, approach.id, medium.id, modelId, textRecords)
				}
			}

			if (roundDef.id === 'round3') {
				addCost(key, 'keywords', medium.id, modelId, tagRecords)
			}

			if (roundDef.id === 'pilot') {
				const totals = {
					tags: { calls: 0, input: 0, output: 0, thinking: 0 },
					descriptions: { calls: 0, input: 0, output: 0, thinking: 0 },
				}
				for (const r of tagRecords) addUsage(totals.tags, r.usage)
				for (const r of rawTexts.get(key).direct[medium.id]) {
					addUsage(totals.descriptions, r.usage)
				}
				usage[`${medium.id}:${modelId}`] = totals
			}
		}
	}
}

const recordsOf = (byMedium, mediumId) =>
	mediumId === 'all'
		? MEDIA.flatMap((m) => byMedium?.[m.id] ?? [])
		: (byMedium?.[mediumId] ?? [])

// The named places a text can be held to, per sheet: every Geografie keyword the
// current round recorded for it. Places are facts of the sheet, not of a model,
// so the union serves to mark them in any round's text.
const currentRound = ROUNDS.at(-1)
for (const work of works) {
	const places = new Set()
	for (const modelId of currentRound.models) {
		const record = recordsOf(
			rawKeywords.get(runKey(currentRound.id, modelId)),
			work.medium,
		).find((r) => slugify(r.Objektnummer) === work.id)
		for (const place of ruleChecks.namedPlaces(record)) places.add(place)
	}
	work.places = [...places].sort((a, b) => b.length - a.length)
}

// ---------------------------------------------------------------------------
// Measures: the museum's rules, counted per run

/**
 * The keyword rules over one run's records. Every figure is a count of values
 * the shared rule checks flag, so the page and `src/tools/rule-checks.js` in the
 * research repo cannot disagree.
 */
function measureKeywords(records) {
	const summary = ruleChecks.summariseKeywords(records)
	return {
		sheets: summary.records,
		values: sum(records.map((r) => countRecord(pickTags(r)))),
		subjectValues: summary.subjectValues,
		geoTotal: summary.geoTotal,
		...Object.fromEntries(
			Object.entries(summary.flagged).map(([check, hits]) => [
				check,
				hits.length,
			]),
		),
	}
}

/**
 * The text rules over one run's records. Places are held to the same run's own
 * keywords, as in the research repo's table: a text is asked to name what its
 * model catalogued.
 */
function measureTextRecords(records, keywordRecords) {
	if (!records.length) return null
	const tagsById = new Map(
		keywordRecords.map((r) => [String(r.Objektnummer), r]),
	)
	const measured = records.map((record) =>
		ruleChecks.measureText(
			record,
			ruleChecks.namedPlaces(tagsById.get(String(record.Objektnummer))),
		),
	)
	const count = (pick) => measured.filter(pick).length
	return {
		texts: measured.length,
		avgLong: Math.round(sum(measured.map((m) => m.length)) / measured.length),
		target: count((m) => m.band === 'short' || m.band === 'target'),
		rich: count((m) => m.band === 'rich'),
		longer: count((m) => m.band === 'long' || m.band === 'over'),
		hedgesDe: sum(measured.map((m) => m.hedgesDe)),
		hedgesEn: sum(measured.map((m) => m.hedgesEn)),
		quoted: count((m) => m.quoted),
		technique: count((m) => m.technique),
		placesNamed: sum(measured.map((m) => m.placesNamed)),
		placesTotal: sum(measured.map((m) => m.placesTotal)),
	}
}

const MEASURE_SCOPES = ['all', ...MEDIA.map((m) => m.id)]

/** scope → run key → keyword measure, for every run on the pages. */
const keywordMeasures = Object.fromEntries(
	MEASURE_SCOPES.map((scope) => [
		scope,
		Object.fromEntries(
			[...rawKeywords].map(([key, byMedium]) => [
				key,
				measureKeywords(recordsOf(byMedium, scope)),
			]),
		),
	]),
)

/** scope → run key → approach → text measure. */
const textMeasures = Object.fromEntries(
	MEASURE_SCOPES.map((scope) => [
		scope,
		Object.fromEntries(
			[...rawTexts].map(([key, byApproach]) => [
				key,
				Object.fromEntries(
					Object.entries(byApproach).map(([approach, byMedium]) => [
						approach,
						measureTextRecords(
							recordsOf(byMedium, scope),
							recordsOf(rawKeywords.get(key), scope),
						),
					]),
				),
			]),
		),
	]),
)

// ---------------------------------------------------------------------------
// Notes and spot checks

const notes = NOTES.map((note) => ({
	...note,
	sheets: note.sheets.map((objectNumber) => ({
		id: slugFor(objectNumber),
		objectNumber,
	})),
}))
for (const note of notes) {
	for (const sheet of note.sheets) {
		works.find((w) => w.id === sheet.id).notes.push(note.id)
	}
}

/** Every value on a sheet, with its field and group type. */
function valuesOnSheet(fields) {
	const out = []
	for (const [field, value] of Object.entries(fields)) {
		if (value.kind === 'flat') {
			for (const v of value.values) out.push({ field, type: null, value: v })
		} else {
			for (const group of value.groups) {
				for (const v of group.values) {
					out.push({ field, type: group.type, value: v })
				}
			}
		}
	}
	return out
}

const spotChecks = SPOT_CHECKS.map((check) => {
	const slug = slugFor(check.sheet)
	return {
		id: check.id,
		sheet: { id: slug, objectNumber: check.sheet },
		want: check.want,
		expect: check.expect,
		runs: ROUNDS.filter((r) => r.id !== 'pilot').flatMap((roundDef) =>
			roundDef.models.map((modelId) => {
				const key = runKey(roundDef.id, modelId)
				const hits = valuesOnSheet(keywords[slug]?.[key]?.fields ?? {}).filter(
					(v) => check.find.test(v.value),
				)
				return {
					run: key,
					hits,
					missing: check.expect.filter(
						(term) =>
							!hits.some((h) => h.field === check.want && h.value === term),
					),
					alsoElsewhere: hits.filter(
						(h) =>
							h.field !== check.want &&
							!(check.allowAlso ?? []).includes(h.field) &&
							check.expect.includes(h.value),
					),
					forbidden: hits.filter((h) => (check.forbid ?? []).includes(h.value)),
				}
			}),
		),
	}
})

// ---------------------------------------------------------------------------
// Cost of round 3, and what a full run would cost

const corpusCounts = { prints: 2041, drawings: 706 }

/** USD per sheet for one run and task, averaged over one medium. */
const perSheet = (key, task, mediumId) => {
	const entry = cost[key]?.[task]?.[mediumId]
	return entry?.records ? entry.usd / entry.records : 0
}

const round3Keys = currentRound.models.map((id) => runKey(currentRound.id, id))
const sampleCost = round(
	sum(
		Object.values(cost).flatMap((byTask) =>
			Object.values(byTask).flatMap((byMedium) =>
				Object.values(byMedium).map((e) => e.usd),
			),
		),
	),
)

/**
 * The full collection, per way of writing and per model. Each scenario includes
 * the keywords, because the museum receives both. The synthesis needs both
 * models' direct texts before it can start, so its price carries both.
 */
const projection = round3Keys.map((key) => {
	const scenario = (tasks) =>
		round(
			sum(
				MEDIA.map(
					(m) =>
						corpusCounts[m.id] *
						sum(tasks.map(([k, task]) => perSheet(k, task, m.id))),
				),
			),
			0,
		)
	return {
		run: key,
		perSheet: Object.fromEntries(
			['keywords', 'direct', 'fromKeywords', 'synthesis'].map((task) => [
				task,
				round(
					sum(
						MEDIA.map((m) => perSheet(key, task, m.id) * corpusCounts[m.id]),
					) / sum(Object.values(corpusCounts)),
					3,
				),
			]),
		),
		full: {
			direct: scenario([
				[key, 'keywords'],
				[key, 'direct'],
			]),
			fromKeywords: scenario([
				[key, 'keywords'],
				[key, 'fromKeywords'],
			]),
			synthesis: scenario([
				[key, 'keywords'],
				...round3Keys.map((k) => [k, 'direct']),
				[key, 'synthesis'],
			]),
		},
	}
})

// ---------------------------------------------------------------------------
// Round 2, measured as it was reported in August

/**
 * What the museum told us was wrong with the pilot texts, counted the way the
 * 25 August report counted it. `technique` is the count of texts naming a
 * material, a process or a period; `inBand` the count inside the length the
 * museum's own published texts occupy.
 */
const TECHNIQUE_RE =
	/Radierung|Kupferstich|Holzschnitt|Lithograf|Feder(zeichnung|strich)?\b|Pinsel|Lavierung|Kreide|Rötel|Silberstift|Kohle|Graphit|Schraffur|Punktierung|Kaltnadel|Ätz|Stichel|Druckplatte|\bPlatte\b|Abzug|Papier|Tusche|Aquarell|Gouache|Bister|Sepia|gehöht|Barock|Renaissance|Manierismus|Gotik|Rokoko|Klassiz|Romantik|Naturalismus|Realismus/i

const BAND = { min: 350, max: 550 }

function measureTexts(records) {
	if (!records.length) return null
	const lengths = records.map((t) => (t.german?.long ?? '').length)
	return {
		texts: records.length,
		technique: records.filter((t) =>
			TECHNIQUE_RE.test(`${t.german?.long ?? ''}${t.german?.short ?? ''}`),
		).length,
		avgLong: Math.round(sum(lengths) / lengths.length),
		inBand: lengths.filter((n) => n >= BAND.min && n <= BAND.max).length,
	}
}

/** Every keyword value on one sheet, with the axis that disambiguates it. */
function tagValues(record) {
	const out = []
	for (const field of TAG_FIELDS) {
		const value = record[field]
		if (!Array.isArray(value)) continue
		for (const item of value) {
			if (typeof item === 'string') out.push({ value: item, type: null })
			else if (item && typeof item === 'object' && Array.isArray(item.values)) {
				for (const v of item.values) {
					if (typeof v === 'string')
						out.push({ value: v, type: item.type ?? null })
				}
			}
		}
	}
	return out
}

function measureTags(records) {
	if (!records.length) return null
	let values = 0
	let banned = 0
	let kept = 0
	let sheetsWithBanned = 0
	for (const record of records) {
		const vs = tagValues(record)
		values += vs.length
		let hit = false
		for (const { value: raw, type } of vs) {
			const v = raw.trim()
			if (isBannedValue(v, type)) {
				banned += 1
				hit = true
			} else if (KEPT_TAG.test(v)) kept += 1
		}
		if (hit) sheetsWithBanned += 1
	}
	return { sheets: records.length, values, banned, sheetsWithBanned, kept }
}

const REVISION_MODELS = ROUNDS.find((r) => r.id === 'revision').models
const allMedia = (byMedium) => recordsOf(byMedium, 'all')

// ---------------------------------------------------------------------------
// Evaluation (round 2 and the pilot; round 3 was not scored)

/** evaluation: work id → model id → { scores, justifications }. */
const evaluation = {}
const scoreboard = {}
const evaluationPilot = {}
const scoreboardPilot = {}
const scoreboardControl = {}

/**
 * Fold one evaluation file into a per-work map and a per-medium scoreboard.
 * A model with no rows is dropped rather than rendered as an empty row.
 */
function foldEvaluation(rows, mediumId, into) {
	const totals = new Map(
		MODELS.map((m) => [
			m.id,
			{ n: 0, ...Object.fromEntries(SCORE_CATEGORIES.map((c) => [c, 0])) },
		]),
	)

	for (const row of rows) {
		const slug = slugify(row.Objektnummer)
		if (!workBySlugAndMedium.has(`${mediumId}:${slug}`)) {
			throw new Error(`evaluation: unknown work ${slug}`)
		}
		into[slug] ??= {}
		for (const entry of row.analysis ?? []) {
			const modelId = MODEL_BY_NORMALISED.get(normaliseModel(entry.model))
			if (!modelId) throw new Error(`evaluation: unknown model ${entry.model}`)
			const scores = Object.fromEntries(
				SCORE_CATEGORIES.map((c) => [c, entry.scores?.[c] ?? null]),
			)
			into[slug][modelId] = {
				scores,
				overall: round(
					SCORE_CATEGORIES.reduce((n, c) => n + (scores[c] ?? 0), 0) /
						SCORE_CATEGORIES.length,
				),
				justifications: entry.justifications ?? {},
			}
			const total = totals.get(modelId)
			total.n += 1
			for (const c of SCORE_CATEGORIES) total[c] += scores[c] ?? 0
		}
	}

	return MODELS.filter((model) => totals.get(model.id).n > 0)
		.map((model) => {
			const total = totals.get(model.id)
			const means = Object.fromEntries(
				SCORE_CATEGORIES.map((c) => [c, round(total[c] / total.n)]),
			)
			return {
				model: model.id,
				works: total.n,
				...means,
				overall: round(
					SCORE_CATEGORIES.reduce((n, c) => n + means[c], 0) /
						SCORE_CATEGORIES.length,
				),
			}
		})
		.sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0))
}

for (const medium of MEDIA) {
	const relative = `${EXPERIMENT_PATH}/output/${medium.dataset}/evaluation/evaluation_summary_masked.json`
	scoreboard[medium.id] = foldEvaluation(
		readJson(join(RESEARCH_ROOT, relative)),
		medium.id,
		evaluation,
	)
	const pilotRows = readJsonAtRef(relative, PILOT_REF)
	scoreboardPilot[medium.id] = pilotRows
		? foldEvaluation(pilotRows, medium.id, evaluationPilot)
		: []

	let controlRows = null
	try {
		controlRows = readJson(
			join(
				EXPERIMENT,
				`output/${medium.dataset}/evaluation/evaluation_summary_neutral_on_pilot_tags.json`,
			),
		)
	} catch {
		controlRows = null
	}
	scoreboardControl[medium.id] = controlRows
		? foldEvaluation(controlRows, medium.id, {})
		: []
}

/**
 * The three readings side by side, per model per medium: the pilot's own
 * judge, a neutral judge on the same keywords, and the neutral judge on the
 * revised ones. The first gap is the judge; the second is the revision.
 */
const judgeCheck = MEDIA.map((medium) => ({
	medium: medium.id,
	models: REVISION_MODELS.map((id) => {
		const find = (board) =>
			board[medium.id]?.find((r) => r.model === id) ?? null
		const pilotJudge = find(scoreboardPilot)?.overall ?? null
		const neutralOnPilot = find(scoreboardControl)?.overall ?? null
		const neutralOnRevised = find(scoreboard)?.overall ?? null
		return {
			id,
			pilotJudge,
			neutralOnPilot,
			neutralOnRevised,
			judgeEffect:
				pilotJudge != null && neutralOnPilot != null
					? round(neutralOnPilot - pilotJudge)
					: null,
			revisionEffect:
				neutralOnPilot != null && neutralOnRevised != null
					? round(neutralOnRevised - neutralOnPilot)
					: null,
		}
	}),
}))

// ---------------------------------------------------------------------------
// Prompts

/**
 * The prompts, captured from the research repo's own builders rather than
 * transcribed. If the prompt changes there, re-running this script moves the
 * page with it — the alternative is a copy that quietly stops being true.
 */
const briefing = await importResearch('src/prompts/staedel-briefing.js')
const { buildDescriptionExamples } = await importResearch(
	'src/prompts/staedel-examples.js',
)
const examples = await buildDescriptionExamples(
	join(EXPERIMENT, 'input/published-texts.json'),
)

/** A metadata block the builders can interpolate, so the captured text shows
 *  the real shape rather than `undefined`. */
const PROMPT_SPECIMEN = {
	Objektnummer: '‹Objektnummer›',
	Künstler: '‹Künstler›',
	Titel: '‹Titel›',
	Objektbezeichnung: '‹Objektbezeichnung›',
	'Datierung.von': '‹von›',
	'Datierung.bis': '‹bis›',
}
const SPECIMEN_CONTEXT = {
	model: { provider: '‹provider›', version: '‹model›' },
	datasetKey: '‹dataset›',
}
/** What the side arms are handed for a real sheet, as placeholders. */
const specimenKeywords = async () => ({
	'Ikon.Hauptmotiv.im_einzelnen': ['‹Hauptmotiv›'],
	'Ikon.Person.Name': [{ type: '‹Typ›', values: ['‹Person›'] }],
	'Ikon.Thema': [{ type: '‹Achse›', values: ['‹Begriff›', '‹Begriff›'] }],
	'Assoziation.Thema': [{ type: '‹Achse›', values: ['‹Begriff›'] }],
})
const specimenDraft = (label) => ({
	german: {
		long: `‹Entwurf ${label}, deutsch, lang›`,
		short: `‹Entwurf ${label}, deutsch, kurz›`,
	},
	english: {
		long: `‹Draft ${label}, English, long›`,
		short: `‹Draft ${label}, English, short›`,
	},
})
const specimenDrafts = async () => [specimenDraft('1'), specimenDraft('2')]

/** Description builders return `{ text, images }`; the page shows the text. */
const capture = async (build) =>
	(await build(PROMPT_SPECIMEN, SPECIMEN_CONTEXT)).text.trim()

const prompts = {
	prints: {
		tags: briefing.generateTagsPrints(PROMPT_SPECIMEN).trim(),
		direct: await capture(briefing.generateDescriptionsPrints(examples.prints)),
		fromKeywords: await capture(
			briefing.generateDescriptionsFromTags(
				'prints',
				examples.prints,
				specimenKeywords,
			),
		),
		synthesis: await capture(
			briefing.generateDescriptionsSynthesis(
				'prints',
				examples.prints,
				specimenDrafts,
			),
		),
	},
	drawings: {
		tags: briefing.generateTagsDrawings(PROMPT_SPECIMEN).trim(),
		direct: await capture(
			briefing.generateDescriptionsDrawings(examples.drawings),
		),
		fromKeywords: await capture(
			briefing.generateDescriptionsFromTags(
				'drawings',
				examples.drawings,
				specimenKeywords,
			),
		),
		synthesis: await capture(
			briefing.generateDescriptionsSynthesis(
				'drawings',
				examples.drawings,
				specimenDrafts,
			),
		),
	},
}

/**
 * The museum's own published texts, measured the same way as the model output:
 * the yardstick the 25 August revision was written against.
 */
const publishedTexts = readJson(join(EXPERIMENT, 'input/published-texts.json'))
const houseReference = (() => {
	const lengths = publishedTexts
		.map((t) => t.de.trim().length)
		.sort((a, b) => a - b)
	return {
		texts: lengths.length,
		withImageInExport: publishedTexts.filter((t) => t.inExport).length,
		usedAsExamples:
			examples.prints.objektnummern.length +
			examples.drawings.objektnummern.length,
		minLong: lengths[0],
		maxLong: lengths[lengths.length - 1],
		avgLong: Math.round(sum(lengths) / lengths.length),
		technique: publishedTexts.filter((t) => TECHNIQUE_RE.test(t.de)).length,
	}
})()

// ---------------------------------------------------------------------------
// Manifest

/** The 25 August round, against the pilot it replaced. */
const revision = {
	date: ROUNDS.find((r) => r.id === 'revision').date,
	tasks: ['descriptions', 'tags'],
	models: REVISION_MODELS,
	unchanged: ['evaluation'],
	band: BAND,
	houseReference,
	examples: {
		prints: examples.prints.objektnummern,
		drawings: examples.drawings.objektnummern,
	},
	/** Every work the museum has already written about, held out of the run. */
	excluded: examples.PUBLISHED_TEXT_IDS,
	judgeCheck,
	descriptions: REVISION_MODELS.map((id) => ({
		id,
		before: measureTexts(allMedia(rawTexts.get(runKey('pilot', id)).direct)),
		after: measureTexts(allMedia(rawTexts.get(runKey('revision', id)).direct)),
	})),
	tags: REVISION_MODELS.map((id) => ({
		id,
		before: measureTags(allMedia(rawKeywords.get(runKey('pilot', id)))),
		after: measureTags(allMedia(rawKeywords.get(runKey('revision', id)))),
	})),
}

const manifest = {
	experiment: '03-staedel-full-export',
	/** The date the pilot output was generated. */
	runDate: ROUNDS[0].date,
	corpus: { works: 2747, ...corpusCounts },
	sample: { works: works.length, perMedium: 20, maxPerArtist: 3 },
	calls: MEDIA.length * ROUNDS[0].models.length * 20 * 2,
	models: MODELS,
	rounds: ROUNDS.map(({ ref: _ref, ...rest }) => rest),
	lines: LINES,
	media: MEDIA.map(({ id, german, label }) => ({ id, german, label })),
	tagFields: TAG_FIELDS,
	scoreCategories: SCORE_CATEGORIES,
	usage,
	revision,
	round3: {
		date: currentRound.date,
		notes,
		spotChecks,
		keywordMeasures,
		textMeasures,
		cost: { sample: sampleCost, projection, corpus: corpusCounts },
	},
	/**
	 * The patterns the text marks use, taken from the research repo's rule
	 * checks so a word marked as a hedge on the page is a word counted as one in
	 * the tables.
	 */
	marks: {
		hedgeDe: ruleChecks.HEDGE.german.source,
		hedgeEn: ruleChecks.HEDGE.english.source,
		technique: ruleChecks.TECHNIQUE.source,
	},
	generatedAt: new Date().toISOString().slice(0, 10),
}

mkdirSync(OUT_DIR, { recursive: true })
const write = (name, value) => {
	const path = join(OUT_DIR, name)
	writeFileSync(path, JSON.stringify(value))
	return `${name} ${(JSON.stringify(value).length / 1024).toFixed(0)} KB`
}

// The per-model files of the two-round layout, superseded by keywords.json and
// texts.json. Removed so nothing can import a stale copy.
for (const stale of [
	'tags.json',
	'tags-pilot.json',
	'descriptions.json',
	'descriptions-pilot.json',
]) {
	rmSync(join(OUT_DIR, stale), { force: true })
}

console.log('Wrote to app/data/stadel-research/:')
for (const line of [
	write('manifest.json', manifest),
	write('works.json', works),
	write('keywords.json', keywords),
	write('texts.json', texts),
	write('evaluation.json', evaluation),
	write('scoreboard.json', scoreboard),
	write('scoreboard-pilot.json', scoreboardPilot),
	write('scoreboard-control.json', scoreboardControl),
	write('evaluation-pilot.json', evaluationPilot),
	write('prompts.json', prompts),
]) {
	console.log(`  ${line}`)
}
