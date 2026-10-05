import evaluationPilotData from '#app/data/stadel-research/evaluation-pilot.json'
import evaluationData from '#app/data/stadel-research/evaluation.json'
import keywordsData from '#app/data/stadel-research/keywords.json'
import manifestData from '#app/data/stadel-research/manifest.json'
import promptsData from '#app/data/stadel-research/prompts.json'
import scoreboardControlData from '#app/data/stadel-research/scoreboard-control.json'
import scoreboardPilotData from '#app/data/stadel-research/scoreboard-pilot.json'
import scoreboardData from '#app/data/stadel-research/scoreboard.json'
import textsData from '#app/data/stadel-research/texts.json'
import worksData from '#app/data/stadel-research/works.json'
import {
	parseMedium,
	runKey,
	type ApproachId,
	type DescriptionSet,
	type LineId,
	type Manifest,
	type MediumId,
	type ModelId,
	type ModelTags,
	type RoundId,
	type RunKey,
	type ScoreRow,
	type TextSets,
	type Work,
	type WorkEvaluation,
} from './schema.ts'

/**
 * Server-side access to the experiment's three rounds.
 *
 * The compacted experiment is a few MB of JSON. It is imported here, in a
 * `.server` module, so it stays in the worker and never reaches a browser —
 * loaders hand the client one work's worth at a time. That is also why
 * selection lives in the URL rather than in component state: it is the query,
 * not a UI preference, and it makes every comparison a citable link the Städel
 * team can paste into an email.
 */

export const manifest = manifestData as unknown as Manifest
export const works = worksData as unknown as Array<Work>

const keywords = keywordsData as unknown as Record<
	string,
	Record<RunKey, ModelTags>
>
const texts = textsData as unknown as Record<string, Record<RunKey, TextSets>>
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
	{ tags: string } & Record<ApproachId, string>
>

const worksById = new Map(works.map((w) => [w.id, w]))

export const rounds = manifest.rounds
export const lines = manifest.lines
export const round3 = manifest.round3
export const revision = manifest.revision
export const currentRound = rounds.at(-1)!

export function roundInfo(id: RoundId) {
	return rounds.find((r) => r.id === id)!
}

export function modelInfo(id: ModelId) {
	return manifest.models.find((m) => m.id === id) ?? null
}

export function modelLabel(id: ModelId) {
	return modelInfo(id)?.label ?? id
}

/** The model a line ran in a round, or null if the line sat that round out. */
export function lineModel(line: LineId, round: RoundId) {
	return (
		lines.find((l) => l.id === line)?.runs.find((r) => r.round === round)
			?.model ?? null
	)
}

/** The current round's run key for a line. */
export function currentRun(line: LineId): RunKey {
	return runKey(currentRound.id, lineModel(line, currentRound.id)!)
}

/** The run a line made in a round, with the model's label, for headers. */
export function runInfo(line: LineId, round: RoundId) {
	const model = lineModel(line, round)
	if (!model) return null
	return {
		key: runKey(round, model),
		round: roundInfo(round),
		model: modelInfo(model)!,
	}
}

export function worksInMedium(medium: MediumId) {
	return works.filter((w) => w.medium === medium)
}

export function workById(id: string) {
	return worksById.get(id) ?? null
}

export function keywordsFor(workId: string, key: RunKey): ModelTags | null {
	return keywords[workId]?.[key] ?? null
}

export function textFor(
	workId: string,
	key: RunKey,
	approach: ApproachId = 'direct',
): DescriptionSet | null {
	return texts[workId]?.[key]?.[approach] ?? null
}

export function promptFor(medium: MediumId, task: 'tags' | ApproachId): string {
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

/** Previous / next within a medium, and the position, for the sheet pager. */
export function pagerFor(medium: MediumId, workId: string) {
	const sheets = worksInMedium(medium)
	const index = sheets.findIndex((w) => w.id === workId)
	const neighbour = (i: number) => {
		const sheet = i < 0 ? undefined : sheets[i]
		return sheet ? { id: sheet.id, objectNumber: sheet.objectNumber } : null
	}
	return {
		position: { index: index + 1, total: sheets.length },
		previous: neighbour(index - 1),
		next: neighbour(index + 1),
	}
}

/** The museum's notes that name a sheet, in the order they were written. */
export function notesForWork(work: Pick<Work, 'notes'>) {
	return round3.notes.filter((note) => work.notes.includes(note.id))
}

export function spotCheckForWork(workId: string) {
	return round3.spotChecks.find((c) => c.sheet.id === workId) ?? null
}

// ---------------------------------------------------------------------------
// Evaluation — round 2 and the pilot. Round 3 was not scored.

/** The two models the 25 August round re-ran, and the re-score covers. */
export const SCORED_MODEL_IDS = revision.models

export function resolveModel(
	url: URL,
	param = 'model',
	allowedIds: Array<ModelId> = SCORED_MODEL_IDS,
): ModelId {
	const requested = url.searchParams.get(param)
	return requested && allowedIds.includes(requested)
		? requested
		: allowedIds[0]!
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

/** Both scored models on one sheet, best first. */
export function evaluationForWork(workId: string) {
	const byModel = evaluation[workId] ?? {}
	return SCORED_MODEL_IDS.map((id) => ({
		model: modelInfo(id)!,
		result: byModel[id] ?? null,
	})).sort((a, b) => (b.result?.overall ?? 0) - (a.result?.overall ?? 0))
}

/** The number of keywords a scored model gave a sheet in round 2. */
export function scoredKeywordCount(workId: string, modelId: ModelId) {
	return keywordsFor(workId, runKey('revision', modelId))?.total ?? 0
}

/**
 * Tokens per model for one medium, both tasks, as the pilot ran them. Used for
 * the pilot's roster table.
 */
export function usageForMedium(medium: MediumId) {
	return roundInfo('pilot').models.map((id) => {
		const model = modelInfo(id)!
		const totals = manifest.usage[`${medium}:${id}`]
		const calls = (totals?.tags.calls ?? 0) + (totals?.descriptions.calls ?? 0)
		const input = (totals?.tags.input ?? 0) + (totals?.descriptions.input ?? 0)
		const output =
			(totals?.tags.output ?? 0) + (totals?.descriptions.output ?? 0)
		return { model, calls, input, output }
	})
}
