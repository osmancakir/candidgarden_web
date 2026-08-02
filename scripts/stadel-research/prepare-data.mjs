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

/** Experiment 03's roster: one current vision model per provider. */
const MODELS = [
	{ id: 'openai-gpt-5.6-sol', provider: 'OpenAI', label: 'GPT-5.6 Sol' },
	{
		id: 'anthropic-claude-opus-5',
		provider: 'Anthropic',
		label: 'Claude Opus 5',
	},
	{
		id: 'google-gemini-3.1-pro-preview',
		provider: 'Google',
		label: 'Gemini 3.1 Pro',
	},
	{ id: 'grok-grok-4.5', provider: 'xAI', label: 'Grok 4.5' },
	{
		id: 'mistral-mistral-large-2512',
		provider: 'Mistral',
		label: 'Mistral Large',
	},
]

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
const usage = {}

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
		}
	}
}

/** evaluation: work id → model id → { scores, justifications }. */
const evaluation = {}
/** scoreboard: medium → model id → per-category means and an overall. */
const scoreboard = {}

for (const medium of MEDIA) {
	const rows = readJson(
		join(
			EXPERIMENT,
			`output/${medium.dataset}/evaluation/evaluation_summary_masked.json`,
		),
	)
	const totals = new Map(
		MODELS.map((m) => [
			m.id,
			{ n: 0, ...Object.fromEntries(SCORE_CATEGORIES.map((c) => [c, 0])) },
		]),
	)

	for (const row of rows) {
		const slug = slugify(row.Objektnummer)
		if (!workBySlugAndMedium.has(`${medium.id}:${slug}`)) {
			throw new Error(`evaluation: unknown work ${slug}`)
		}
		evaluation[slug] ??= {}
		for (const entry of row.analysis ?? []) {
			const modelId = MODEL_BY_NORMALISED.get(normaliseModel(entry.model))
			if (!modelId) throw new Error(`evaluation: unknown model ${entry.model}`)
			const scores = Object.fromEntries(
				SCORE_CATEGORIES.map((c) => [c, entry.scores?.[c] ?? null]),
			)
			evaluation[slug][modelId] = {
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

	scoreboard[medium.id] = MODELS.map((model) => {
		const total = totals.get(model.id)
		const means = Object.fromEntries(
			SCORE_CATEGORIES.map((c) => [
				c,
				total.n ? round(total[c] / total.n) : null,
			]),
		)
		return {
			model: model.id,
			works: total.n,
			...means,
			overall: total.n
				? round(
						SCORE_CATEGORIES.reduce((n, c) => n + means[c], 0) /
							SCORE_CATEGORIES.length,
					)
				: null,
		}
	}).sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0))
}

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

const prompts = {
	prints: {
		tags: briefing.generateTagsPrints(PROMPT_SPECIMEN).trim(),
		descriptions: briefing.generateDescriptionsPrints(PROMPT_SPECIMEN).trim(),
	},
	drawings: {
		tags: briefing.generateTagsDrawings(PROMPT_SPECIMEN).trim(),
		descriptions: briefing.generateDescriptionsDrawings(PROMPT_SPECIMEN).trim(),
	},
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
	write('evaluation.json', evaluation),
	write('scoreboard.json', scoreboard),
	write('prompts.json', prompts),
]) {
	console.log(`  ${line}`)
}
