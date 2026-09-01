import descriptionsPilotData from '#app/data/stadel-research/descriptions-pilot.json'
import descriptionsData from '#app/data/stadel-research/descriptions.json'
import evaluationPilotData from '#app/data/stadel-research/evaluation-pilot.json'
import evaluationData from '#app/data/stadel-research/evaluation.json'
import manifestData from '#app/data/stadel-research/manifest.json'
import promptsData from '#app/data/stadel-research/prompts.json'
import scoreboardControlData from '#app/data/stadel-research/scoreboard-control.json'
import scoreboardPilotData from '#app/data/stadel-research/scoreboard-pilot.json'
import scoreboardData from '#app/data/stadel-research/scoreboard.json'
import tagsPilotData from '#app/data/stadel-research/tags-pilot.json'
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
/** The texts the revision superseded, for the two models it re-ran. */
const descriptionsPilot = descriptionsPilotData as unknown as Record<
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

/** The two models still being scored; the rest are judge or retired. */
export const FINALIST_MODEL_IDS = manifest.models
	.filter((m) => m.status === 'finalist')
	.map((m) => m.id)

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

/**
 * The pilot's five-model ranking. Kept because it is the evidence for cutting
 * the roster to two — the re-score covers only the two that remain, so it
 * cannot show why the other three were dropped.
 */
const scoreboardPilot = scoreboardPilotData as unknown as Record<
	MediumId,
	Array<ScoreRow>
>
const evaluationPilot = evaluationPilotData as unknown as Record<
	string,
	Record<ModelId, WorkEvaluation>
>

export function pilotScoreboardFor(medium: MediumId) {
	return scoreboardPilot[medium] ?? []
}

/** The neutral judge on the pilot's keywords — the control that separates the
 *  judge's effect from the revision's. */
const scoreboardControl = scoreboardControlData as unknown as Record<
	MediumId,
	Array<ScoreRow>
>

export function controlScoreboardFor(medium: MediumId) {
	return scoreboardControl[medium] ?? []
}

export function judgeCheckFor(medium: MediumId) {
	return revision.judgeCheck.find((j) => j.medium === medium)?.models ?? []
}

export function pilotEvaluationForWorkAndModel(
	workId: string,
	modelId: ModelId,
) {
	return evaluationPilot[workId]?.[modelId] ?? null
}

/** Every model scored on one sheet, each paired with its pilot score. */
export function evaluationWithPilotForWork(workId: string) {
	return evaluationForWork(workId).map((entry) => ({
		...entry,
		superseded: pilotEvaluationForWorkAndModel(workId, entry.model.id),
	}))
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

export function resolveModel(
	url: URL,
	param = 'model',
	allowedIds: Array<ModelId> = MODEL_IDS,
): ModelId {
	const requested = url.searchParams.get(param)
	return requested && allowedIds.includes(requested)
		? requested
		: allowedIds[0]!
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

export const revision = manifest.revision

/** The two models the revision re-ran, for both tasks. */
const REVISED_MODELS = new Set<ModelId>(revision.models)

export function isRevised(modelId: ModelId) {
	return REVISED_MODELS.has(modelId)
}

export function revisionFor(
	modelId: ModelId,
	task: 'descriptions' | 'tags' = 'descriptions',
) {
	return revision[task].find((m) => m.id === modelId) ?? null
}

/**
 * The superseded text for one sheet, or null where there is none — either the
 * model was never re-run, or it returned nothing on 1 August.
 */
export function pilotDescriptionsForWorkAndModel(
	workId: string,
	modelId: ModelId,
): DescriptionSet | null {
	return descriptionsPilot[workId]?.[modelId] ?? null
}

const tagsPilot = tagsPilotData as unknown as Record<
	string,
	Record<ModelId, ModelTags>
>

export function pilotTagsForWorkAndModel(workId: string, modelId: ModelId) {
	return tagsPilot[workId]?.[modelId] ?? null
}

/** Every model's keywords for one sheet, each paired with what it replaced. */
export function tagsWithPilotForWork(workId: string) {
	return tagsForWork(workId).map((entry) => ({
		...entry,
		superseded: pilotTagsForWorkAndModel(workId, entry.model.id),
	}))
}

/** Every model's texts for one sheet, each paired with what it replaced. */
export function descriptionsWithPilotForWork(workId: string) {
	return descriptionsForWork(workId).map((entry) => ({
		...entry,
		superseded: pilotDescriptionsForWorkAndModel(workId, entry.model.id),
	}))
}

/** Only the two finalists are scored — evaluation was never re-run for the
 *  judge or the retired models. */
export function evaluationForWork(workId: string) {
	const byModel = evaluation[workId] ?? {}
	return manifest.models
		.filter((model) => model.status === 'finalist')
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
