/**
 * Compact the pilot run of experiment 03-staedel-full-export into the JSON the
 * /stadel-research routes import.
 *
 * The research repo's output is shaped for the runner: one file per model per
 * task per medium, each record carrying its full token-usage envelope. That is
 * 1.7 MB across 22 files, indexed the wrong way round for a comparison UI — a
 * reader picks a *work* and wants five models against it, not a model and
 * twenty works.
 *
 * So this rewrites the axis: works first, models nested. Usage is aggregated
 * into per-model totals rather than kept per record, which is the only lossy
 * step and the only one worth taking (it drops ~40% of the bytes and no reader
 * wants a token count on a single sheet).
 *
 * Usage:
 *   node scripts/stadel-research/prepare-data.mjs [path-to-research-repo]
 *
 * Defaults to ../candidgarden_stadelResearch, which is where it sits in a
 * normal checkout. Re-run it whenever the experiment is re-run; the output is
 * committed so the app never needs the research repo at build time.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const APP_ROOT = resolve(HERE, '../..')
const RESEARCH_ROOT = resolve(
	process.argv[2] ?? join(APP_ROOT, '../candidgarden_stadelResearch'),
)
const EXPERIMENT = join(RESEARCH_ROOT, 'experiments/03-staedel-full-export')
const OUT_DIR = join(APP_ROOT, 'app/data/stadel-research')

/**
 * Experiment 03's roster, as the pilot ran it: one current vision model per
 * provider.
 *
 * `status` records what happened to each after the pilot. The three marked
 * `retired` lost on the pilot's own scores and are no longer being run, but they
 * stay on the page because they are the evidence for cutting the roster to two —
 * removing them would leave the decision unsupported. Gemini is retired as a
 * contestant and now serves as the judge, which is the one role a non-contestant
 * can hold.
 */
const MODELS = [
	{
		id: 'openai-gpt-5.6-sol',
		provider: 'OpenAI',
		label: 'GPT-5.6 Sol',
		status: 'finalist',
	},
	{
		id: 'anthropic-claude-opus-5',
		provider: 'Anthropic',
		label: 'Claude Opus 5',
		status: 'finalist',
	},
	{
		id: 'google-gemini-3.1-pro-preview',
		provider: 'Google',
		label: 'Gemini 3.1 Pro',
		status: 'judge',
	},
	{ id: 'grok-grok-4.5', provider: 'xAI', label: 'Grok 4.5', status: 'retired' },
	{
		id: 'mistral-mistral-large-2512',
		provider: 'Mistral',
		label: 'Mistral Large',
		status: 'retired',
	},
]

/**
 * The revision of 25 August 2026, after the museum's reply to the pilot.
 *
 * The museum asked for three things: that the descriptions stop naming
 * technique, style and period; that its own published texts guide the voice;
 * and that the vocabulary deviation be adopted. The first two changed the
 * description prompt, so the descriptions were re-run — but only for the two
 * finalists, and only that task. Everything else on these pages is still pilot
 * output, which is why this is a list of exactly what moved rather than a date
 * stamped over the whole report.
 */
const REVISION = {
	// The reporting date shown to the museum, set here rather than read off a file
	// timestamp. RevisionMark's label in +shared/components.tsx prints the same
	// date in short form and has to be changed with it.
	date: '2026-08-25',
	tasks: ['descriptions', 'tags'],
	models: ['openai-gpt-5.6-sol', 'anthropic-claude-opus-5'],
	/**
	 * The research repo's git ref still holding the pilot output. The superseded
	 * versions are read from there rather than copied into this repo, so the
	 * before/after cannot drift from what was actually run on 1 August.
	 */
	baselineRef: 'HEAD',
	/** The scores are still the pilot's: the re-score has not been run. */
	unchanged: ['evaluation'],
}

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
 * the Natur axis, among Flügel, Schnabel, Kralle and Fell — demons' wings on
 * 33744 D, a wing on 30945 D. Counting the word alone marked four correct
 * observations as violations, so the axis decides it. Federzeichnung, which is
 * unambiguously the technique, stays in BANNED_TAG above.
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

/** The eight schema fields the briefing asks the model to fill. */
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
 * Sum a usage envelope into a running per-model total.
 *
 * Five providers, five spellings, and — worse than the spelling — two different
 * accounting conventions. Anthropic and OpenAI count reasoning *inside* the
 * output figure; Google and xAI report it *beside* one. Adding the reasoning
 * field unconditionally would double-count two models; ignoring it would
 * undercount the other two, and Gemini spends more on reasoning than on the
 * answer.
 *
 * So where a provider states a total, the output is derived as total − input.
 * That is the provider's own arithmetic rather than ours, it is right under
 * both conventions, and it keeps the column comparable across the roster.
 * Anthropic states no total and folds reasoning in, so the plain field is
 * already correct there.
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

const round = (n, places = 2) => Math.round(n * 10 ** places) / 10 ** places

// ---------------------------------------------------------------------------

/**
 * A file as it stood at `REVISION.baselineRef` in the research repo, or null if
 * it did not exist there. Used only for the superseded description texts.
 */
function readJsonAtRef(relativePath, ref = REVISION.baselineRef) {
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

/**
 * What the museum told us was wrong with the pilot texts, counted.
 *
 * Both figures are measured off the texts themselves rather than asserted, so
 * the claim on the page is checkable against the same JSON the page renders.
 * `technique` is the count of texts naming a material, a process or a period —
 * the thing the museum asked us to remove; `inBand` is the count falling inside
 * the length its own published texts occupy.
 */
const TECHNIQUE_RE =
	/Radierung|Kupferstich|Holzschnitt|Lithograf|Feder(zeichnung|strich)?\b|Pinsel|Lavierung|Kreide|Rötel|Silberstift|Kohle|Graphit|Schraffur|Punktierung|Kaltnadel|Ätz|Stichel|Druckplatte|\bPlatte\b|Abzug|Papier|Tusche|Aquarell|Gouache|Bister|Sepia|gehöht|Barock|Renaissance|Manierismus|Gotik|Rokoko|Klassiz|Romantik|Naturalismus|Realismus/i

const BAND = { min: 350, max: 550 }

function measureTexts(texts) {
	if (!texts.length) return null
	const lengths = texts.map((t) => t.german.long.length)
	return {
		texts: texts.length,
		technique: texts.filter((t) =>
			TECHNIQUE_RE.test(`${t.german.long}${t.german.short}`),
		).length,
		avgLong: Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length),
		inBand: lengths.filter((n) => n >= BAND.min && n <= BAND.max).length,
	}
}

/**
 * Every keyword value on one sheet, across all nine fields, carrying the
 * thematic axis it was filed under — which is what disambiguates a feather from
 * a drawing pen.
 */
function tagValues(record) {
	const out = []
	for (const field of TAG_FIELDS) {
		const value = record[field]
		if (!Array.isArray(value)) continue
		for (const item of value) {
			if (typeof item === 'string') out.push({ value: item, type: null })
			else if (item && typeof item === 'object' && Array.isArray(item.values)) {
				for (const v of item.values) {
					if (typeof v === 'string') out.push({ value: v, type: item.type ?? null })
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

const goldStandard = readJson(join(EXPERIMENT, 'input/gold-standard.json'))

/** works: the 40-sheet evaluation sample, keyed by slug. */
const works = []
const workBySlugAndMedium = new Map()

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
		}
		works.push(work)
		workBySlugAndMedium.set(`${medium.id}:${slug}`, work)
	}
}

/** tags / descriptions: work id → model id → payload. */
const tags = {}
const descriptions = {}
/** The same shapes, holding only the output the revision superseded. */
const descriptionsPilot = {}
const tagsPilot = {}
const usage = {}
/** model id → { before, after }, for the revision summary. */
const revisionSamples = new Map(
	REVISION.models.map((id) => [
		id,
		{ before: [], after: [], tagsBefore: [], tagsAfter: [] },
	]),
)

for (const medium of MEDIA) {
	for (const model of MODELS) {
		const usageKey = `${medium.id}:${model.id}`
		usage[usageKey] = {
			tags: { calls: 0, input: 0, output: 0, thinking: 0 },
			descriptions: { calls: 0, input: 0, output: 0, thinking: 0 },
		}

		const tagRecords = readJson(
			join(EXPERIMENT, `output/${medium.dataset}/tags/${model.id}.json`),
		)
		for (const record of tagRecords) {
			const slug = slugify(record.Objektnummer)
			if (!workBySlugAndMedium.has(`${medium.id}:${slug}`)) {
				throw new Error(`tags: ${model.id} returned unknown work ${slug}`)
			}
			addUsage(usage[usageKey].tags, record.usage)
			const picked = pickTags(record)
			tags[slug] ??= {}
			tags[slug][model.id] = { fields: picked, total: countRecord(picked) }
			if (revisionSamples.has(model.id)) {
				revisionSamples.get(model.id).tagsAfter.push(record)
			}
		}

		// The superseded keywords, read out of the research repo's history, for
		// the two models the revision re-ran.
		if (REVISION.models.includes(model.id)) {
			const pilotTags =
				readJsonAtRef(
					`experiments/03-staedel-full-export/output/${medium.dataset}/tags/${model.id}.json`,
				) ?? []
			for (const record of pilotTags) {
				const slug = slugify(record.Objektnummer)
				if (!workBySlugAndMedium.has(`${medium.id}:${slug}`)) continue
				const picked = pickTags(record)
				tagsPilot[slug] ??= {}
				tagsPilot[slug][model.id] = {
					fields: picked,
					total: countRecord(picked),
				}
				revisionSamples.get(model.id).tagsBefore.push(record)
			}
		}

		const descriptionRecords = readJson(
			join(
				EXPERIMENT,
				`output/${medium.dataset}/descriptions/${model.id}.json`,
			),
		)
		for (const record of descriptionRecords) {
			const slug = slugify(record.Objektnummer)
			if (!workBySlugAndMedium.has(`${medium.id}:${slug}`)) {
				throw new Error(
					`descriptions: ${model.id} returned unknown work ${slug}`,
				)
			}
			addUsage(usage[usageKey].descriptions, record.usage)
			descriptions[slug] ??= {}
			descriptions[slug][model.id] = {
				german: {
					long: record.german?.long ?? '',
					short: record.german?.short ?? '',
				},
				english: {
					long: record.english?.long ?? '',
					short: record.english?.short ?? '',
				},
			}
			if (revisionSamples.has(model.id)) {
				revisionSamples.get(model.id).after.push(descriptions[slug][model.id])
			}
		}

		// The superseded texts, read out of the research repo's history. Only the
		// revised models have a before; the other three were never re-run, so
		// their current text *is* their pilot text and a comparison would be a
		// row of identical columns.
		if (REVISION.models.includes(model.id)) {
			const pilotRecords =
				readJsonAtRef(
					`experiments/03-staedel-full-export/output/${medium.dataset}/descriptions/${model.id}.json`,
				) ?? []
			for (const record of pilotRecords) {
				const slug = slugify(record.Objektnummer)
				if (!workBySlugAndMedium.has(`${medium.id}:${slug}`)) continue
				const set = {
					german: {
						long: record.german?.long ?? '',
						short: record.german?.short ?? '',
					},
					english: {
						long: record.english?.long ?? '',
						short: record.english?.short ?? '',
					},
				}
				descriptionsPilot[slug] ??= {}
				descriptionsPilot[slug][model.id] = set
				revisionSamples.get(model.id).before.push(set)
			}
		}
	}
}

/** evaluation: work id → model id → { scores, justifications }. */
const evaluation = {}
/** scoreboard: medium → model id → per-category means and an overall. */
const scoreboard = {}
/**
 * The pilot's five-model scoreboard, kept alongside the new one.
 *
 * The re-score covers only the two models still being run, so on its own it
 * would leave the other three as rows of dashes — and, worse, would delete the
 * comparison that justifies having cut the roster to two. Both are read: the
 * current file for the neutral re-score, and the same file at the baseline ref
 * for the pilot.
 */
const evaluationPilot = {}
const scoreboardPilot = {}

/**
 * Fold one evaluation file into a per-work map and a per-medium scoreboard.
 *
 * `models` is passed rather than assumed, because the pilot file carries five
 * and the re-score carries two; a model with no rows is dropped from the
 * scoreboard instead of being rendered as an empty row.
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

/**
 * The control: the neutral judge scoring the *pilot* keywords.
 *
 * Without it the re-score cannot be read. It differs from the pilot's own
 * scoreboard in two ways at once — a different judge and different keywords —
 * and every score falls about two points, which looks like a regression caused
 * by the revision. This third reading holds the keywords fixed and changes only
 * the judge, which separates the two. Optional: if the file is absent the pages
 * simply omit the comparison rather than guessing at it.
 */
const scoreboardControl = {}

for (const medium of MEDIA) {
	const relative = `experiments/03-staedel-full-export/output/${medium.dataset}/evaluation/evaluation_summary_masked.json`
	scoreboard[medium.id] = foldEvaluation(
		readJson(join(EXPERIMENT, `output/${medium.dataset}/evaluation/evaluation_summary_masked.json`)),
		medium.id,
		evaluation,
	)
	const pilotRows = readJsonAtRef(relative)
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
 * The three readings side by side, per model per medium: what the pilot's own
 * judge said, what a neutral judge says about the same keywords, and what it
 * says about the revised ones. The first gap is the judge; the second is the
 * revision.
 */
const judgeCheck = MEDIA.map((medium) => ({
	medium: medium.id,
	models: REVISION.models.map((id) => {
		const find = (board) => board[medium.id]?.find((r) => r.model === id) ?? null
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

/**
 * The prompts, captured from the research repo's own builders rather than
 * transcribed. If the prompt changes there, re-running this script moves the
 * page with it — the alternative is a copy that quietly stops being true.
 */
const briefing = await import(
	pathToFileURL(join(RESEARCH_ROOT, 'src/prompts/staedel-briefing.js')).href
)

/** A metadata block the prompt builders can interpolate, so the captured text
 *  shows the real shape rather than `undefined`. */
const PROMPT_SPECIMEN = {
	Künstler: '‹Künstler›',
	Titel: '‹Titel›',
	Objektbezeichnung: '‹Objektbezeichnung›',
	'Datierung.von': '‹von›',
	'Datierung.bis': '‹bis›',
}

/**
 * The description builders are factories now: they take the museum's published
 * texts as few-shot examples and return the builder. Called with the examples,
 * they also return `{ text, images }` rather than a bare string, because the
 * example images are sent ahead of the artwork. The page shows the text.
 */
const { buildDescriptionExamples } = await import(
	pathToFileURL(join(RESEARCH_ROOT, 'src/prompts/staedel-examples.js')).href
)
const examples = await buildDescriptionExamples(
	join(EXPERIMENT, 'input/published-texts.json'),
)

const describePrompt = (build, medium) =>
	build(examples[medium])(PROMPT_SPECIMEN).text.trim()

const prompts = {
	prints: {
		tags: briefing.generateTagsPrints(PROMPT_SPECIMEN).trim(),
		descriptions: describePrompt(briefing.generateDescriptionsPrints, 'prints'),
	},
	drawings: {
		tags: briefing.generateTagsDrawings(PROMPT_SPECIMEN).trim(),
		descriptions: describePrompt(
			briefing.generateDescriptionsDrawings,
			'drawings',
		),
	},
}

/**
 * The museum's own published texts, measured the same way as the model output.
 * This is the yardstick the revision was written against: 20 texts the Städel
 * published on works in this collection, none of which names a technique.
 */
const publishedTexts = readJson(join(EXPERIMENT, 'input/published-texts.json'))
const houseReference = (() => {
	const lengths = publishedTexts.map((t) => t.de.trim().length).sort((a, b) => a - b)
	const mean = Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)
	return {
		texts: lengths.length,
		withImageInExport: publishedTexts.filter((t) => t.inExport).length,
		usedAsExamples: examples.prints.objektnummern.length +
			examples.drawings.objektnummern.length,
		minLong: lengths[0],
		maxLong: lengths[lengths.length - 1],
		avgLong: mean,
		technique: publishedTexts.filter((t) => TECHNIQUE_RE.test(t.de)).length,
	}
})()

const revision = {
	...REVISION,
	band: BAND,
	houseReference,
	examples: {
		prints: examples.prints.objektnummern,
		drawings: examples.drawings.objektnummern,
	},
	/** Every work the museum has already written about, held out of the run. */
	excluded: examples.PUBLISHED_TEXT_IDS,
	judgeCheck,
	descriptions: REVISION.models.map((id) => ({
		id,
		before: measureTexts(revisionSamples.get(id).before),
		after: measureTexts(revisionSamples.get(id).after),
	})),
	tags: REVISION.models.map((id) => ({
		id,
		before: measureTags(revisionSamples.get(id).tagsBefore),
		after: measureTags(revisionSamples.get(id).tagsAfter),
	})),
}

const manifest = {
	experiment: '03-staedel-full-export',
	/** The date the pilot output on disk was generated. */
	runDate: '2026-08-01',
	corpus: { works: 2747, prints: 2041, drawings: 706 },
	sample: { works: works.length, perMedium: 20, maxPerArtist: 3 },
	calls: MEDIA.length * MODELS.length * 20 * 2,
	models: MODELS,
	media: MEDIA.map(({ id, german, label }) => ({ id, german, label })),
	tagFields: TAG_FIELDS,
	scoreCategories: SCORE_CATEGORIES,
	usage,
	revision,
	generatedAt: new Date().toISOString().slice(0, 10),
}

mkdirSync(OUT_DIR, { recursive: true })
const write = (name, value) => {
	const path = join(OUT_DIR, name)
	writeFileSync(path, JSON.stringify(value))
	return `${name} ${(JSON.stringify(value).length / 1024).toFixed(0)} KB`
}

console.log('Wrote to app/data/stadel-research/:')
for (const line of [
	write('manifest.json', manifest),
	write('works.json', works),
	write('tags.json', tags),
	write('descriptions.json', descriptions),
	write('descriptions-pilot.json', descriptionsPilot),
	write('tags-pilot.json', tagsPilot),
	write('evaluation.json', evaluation),
	write('scoreboard.json', scoreboard),
	write('scoreboard-pilot.json', scoreboardPilot),
	write('scoreboard-control.json', scoreboardControl),
	write('evaluation-pilot.json', evaluationPilot),
	write('prompts.json', prompts),
]) {
	console.log(`  ${line}`)
}
