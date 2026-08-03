import descriptionsData from '#app/data/stadel-research/descriptions.json'
import evaluationData from '#app/data/stadel-research/evaluation.json'
import manifestData from '#app/data/stadel-research/manifest.json'
import promptsData from '#app/data/stadel-research/prompts.json'
import scoreboardData from '#app/data/stadel-research/scoreboard.json'
import tagsData from '#app/data/stadel-research/tags.json'
import worksData from '#app/data/stadel-research/works.json'
import {
	countTagRecord,
	parseMedium,
	type DescriptionSet,
	type Manifest,
	type MediumId,
	type ModelId,
	type ModelTags,
	type ScoreRow,
	type Work,
	type WorkEvaluation,
} from './schema.ts'

/**
 * Server-side access to the pilot run.
 *
 * The compacted experiment is 1.2 MB of JSON. It is imported here, in a
 * `.server` module, so it stays in the worker and never reaches a browser —
 * loaders hand the client one work's worth at a time. That is also why
 * selection lives in the URL rather than in component state: it is the query,
 * not a UI preference, and it makes every comparison in this pilot a citable
 * link the Städel team can paste into an email.
 */

export const manifest = manifestData as unknown as Manifest
export const works = worksData as unknown as Array<Work>

const tags = tagsData as unknown as Record<string, Record<ModelId, ModelTags>>
const descriptions = descriptionsData as unknown as Record<
	string,
	Record<ModelId, DescriptionSet>
>
const evaluation = evaluationData as unknown as Record<
	string,
	Record<ModelId, WorkEvaluation>
>
const scoreboard = scoreboardData as unknown as Record<
	MediumId,
	Array<ScoreRow>
>
const prompts = promptsData as unknown as Record<
	MediumId,
	{ tags: string; descriptions: string }
>

const worksById = new Map(works.map((w) => [w.id, w]))

export const MODEL_IDS = manifest.models.map((m) => m.id)

export function modelInfo(id: ModelId) {
	return manifest.models.find((m) => m.id === id) ?? null
}

export function modelLabel(id: ModelId) {
	return modelInfo(id)?.label ?? id
}

export function worksInMedium(medium: MediumId) {
	return works.filter((w) => w.medium === medium)
}

export function scoreboardFor(medium: MediumId) {
	return scoreboard[medium] ?? []
}

export function promptFor(medium: MediumId, task: 'tags' | 'descriptions') {
	return prompts[medium]?.[task] ?? ''
}

/**
 * Resolve `?medium=` and `?work=` together. A work id wins over the medium
 * parameter when the two disagree, so a link to a single sheet stays valid even
 * if it is pasted without its medium — a bookmarked comparison should not
 * silently show a different work.
 */
export function resolveSelection(url: URL) {
	const requestedWorkId = url.searchParams.get('work')
	const work = requestedWorkId ? (worksById.get(requestedWorkId) ?? null) : null
	const medium = work?.medium ?? parseMedium(url.searchParams.get('medium'))
	return { medium, work }
}

export function resolveModel(url: URL, param = 'model'): ModelId {
	const requested = url.searchParams.get(param)
	return requested && MODEL_IDS.includes(requested) ? requested : MODEL_IDS[0]!
}

/** Every model's tagging of one sheet, in roster order, with counts. */
export function tagsForWork(workId: string) {
	const byModel = tags[workId] ?? {}
	return manifest.models.map((model) => ({
		model,
		tags: byModel[model.id] ?? { fields: {}, total: 0 },
	}))
}

export function tagsForWorkAndModel(workId: string, modelId: ModelId) {
	return tags[workId]?.[modelId] ?? { fields: {}, total: 0 }
}

export function descriptionsForWork(workId: string) {
	const byModel = descriptions[workId] ?? {}
	return manifest.models.map((model) => ({
		model,
		descriptions: byModel[model.id] ?? null,
	}))
}

export function descriptionsForWorkAndModel(
	workId: string,
	modelId: ModelId,
): DescriptionSet | null {
	return descriptions[workId]?.[modelId] ?? null
}

export function evaluationForWork(workId: string) {
	const byModel = evaluation[workId] ?? {}
	return manifest.models
		.map((model) => ({ model, result: byModel[model.id] ?? null }))
		.sort((a, b) => (b.result?.overall ?? 0) - (a.result?.overall ?? 0))
}

/**
 * The index rows a browse view needs: enough to render a plate and a caption,
 * and the two counts that make the list worth scanning — how much the museum
 * holds on this sheet, and how much the models added.
 */
export function indexRows(medium: MediumId, modelId: ModelId) {
	return worksInMedium(medium).map((work) => ({
		id: work.id,
		objectNumber: work.objectNumber,
		objectKey: work.objectKey,
		title: work.title,
		artist: work.artist,
		notBefore: work.notBefore,
		notAfter: work.notAfter,
		museumTagCount: work.museumTagCount,
		modelTagCount: countTagRecord(tagsForWorkAndModel(work.id, modelId).fields),
		overall: evaluation[work.id]?.[modelId]?.overall ?? null,
	}))
}

export type IndexRow = ReturnType<typeof indexRows>[number]

/**
 * Aggregate token usage per model for one medium, both tasks. Used on the
 * overview to show what a full run of 2,747 sheets would cost in tokens: the
 * sample is 20 sheets per medium, so the corpus figure is a straight multiple.
 */
export function usageForMedium(medium: MediumId) {
	return manifest.models.map((model) => {
		const totals = manifest.usage[`${medium}:${model.id}`]
		const calls = (totals?.tags.calls ?? 0) + (totals?.descriptions.calls ?? 0)
		const input = (totals?.tags.input ?? 0) + (totals?.descriptions.input ?? 0)
		const output =
			(totals?.tags.output ?? 0) + (totals?.descriptions.output ?? 0)
		return {
			model,
			calls,
			input,
			output,
			perWork: calls ? Math.round((input + output) / (calls / 2)) : 0,
		}
	})
}
