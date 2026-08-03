import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { Link } from 'react-router'
import {
	ConsoleField,
	ConsoleSelect,
} from '#app/components/institute/console.tsx'
import {
	Data,
	Display,
	NoRecords,
} from '#app/components/institute/primitives.tsx'
import {
	MediumSwitch,
	Plate,
	PromptDisclosure,
	SelectionConsole,
	SheetPager,
	useHrefWith,
	WorkMetadata,
} from './+shared/components.tsx'
import {
	descriptionsForWork,
	descriptionsForWorkAndModel,
	manifest,
	promptFor,
	resolveModel,
	resolveSelection,
	worksInMedium,
} from './+shared/pilot.server.ts'
import {
	displayDating,
	mediumGerman,
	type DescriptionSet,
} from './+shared/schema.ts'
import { type Route } from './+types/descriptions.ts'

// Gated by the layout's role check, so it must not be advertised in
// sitemap.xml. remix-seo includes every static route unless told otherwise.
export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

/**
 * Task 2: the bilingual visitor texts.
 *
 * Two axes matter to a reader checking these — language and length — and they
 * are orthogonal, so both stay in the URL rather than in a tab that resets on
 * navigation. The house rule from the prompt is disclosed above the texts: the
 * short version is not a truncation of the long one, and German and English are
 * not translations of each other. Anyone reviewing them for the museum needs to
 * know that before they start marking discrepancies as errors.
 *
 * The texts are shown as written, character counts included, because the
 * briefing sets hard limits (800 / 500) and whether a model respects them is
 * part of what is being assessed.
 */

export const meta: Route.MetaFunction = () => [
	{ title: 'Descriptions · Städel pilot · Candid Garden' },
	{ name: 'robots', content: 'noindex, nofollow' },
]

const LANGUAGES = [
	{ id: 'german', label: 'Deutsch', tag: 'de' },
	{ id: 'english', label: 'English', tag: 'en' },
] as const

type LanguageId = (typeof LANGUAGES)[number]['id']

const LIMITS = { long: 800, short: 500 } as const

function parseLanguage(value: string | null): LanguageId {
	return value === 'english' ? 'english' : 'german'
}

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url)
	const { medium, work } = resolveSelection(url)
	const modelId = resolveModel(url)
	const language = parseLanguage(url.searchParams.get('lang'))
	const sheets = worksInMedium(medium)

	const position = work ? sheets.findIndex((w) => w.id === work.id) : -1
	const neighbour = (index: number) => {
		const sheet = index < 0 ? undefined : sheets[index]
		return sheet ? { id: sheet.id, objectNumber: sheet.objectNumber } : null
	}

	return {
		medium,
		modelId,
		language,
		models: manifest.models,
		prompt: promptFor(medium, 'descriptions'),
		sheets: sheets.map((w) => ({
			id: w.id,
			objectNumber: w.objectNumber,
			title: w.title,
		})),
		work,
		/** Browse mode: every sheet with the selected model's short text. */
		rows: work
			? null
			: sheets.map((w) => ({
					id: w.id,
					objectNumber: w.objectNumber,
					objectKey: w.objectKey,
					title: w.title,
					artist: w.artist,
					notBefore: w.notBefore,
					notAfter: w.notAfter,
					text:
						descriptionsForWorkAndModel(w.id, modelId)?.[language].short ??
						null,
				})),
		/** Sheet mode: every model's four texts for the one sheet. */
		byModel: work ? descriptionsForWork(work.id) : null,
		position: work ? { index: position + 1, total: sheets.length } : null,
		previous: work ? neighbour(position - 1) : null,
		next: work ? neighbour(position + 1) : null,
	}
}

/** One text, with the count the briefing's limit is measured against. */
function TextBlock({ kind, text }: { kind: 'long' | 'short'; text: string }) {
	const limit = LIMITS[kind]
	const over = text.length > limit
	return (
		<div className="flex flex-col gap-2">
			<div className="border-rule flex flex-wrap items-baseline justify-between gap-x-4 border-b pb-1">
				<Data className="text-ground-muted">
					{kind === 'long' ? 'Long' : 'Short'}
				</Data>
				<Data
					className={
						over
							? 'text-stamp-fg tabular-nums'
							: 'text-ground-muted tabular-nums'
					}
					title={
						over
							? `Over the briefing's ${limit}-character limit`
							: `Within the briefing's ${limit}-character limit`
					}
				>
					{text.length} / {limit}
					{over ? ' · over' : null}
				</Data>
			</div>
			{text ? (
				<p className="font-body text-prose measure whitespace-pre-line">
					{text}
				</p>
			) : (
				<p className="font-body text-prose-sm text-ground-muted italic">
					No text returned.
				</p>
			)}
		</div>
	)
}

export default function StadelDescriptions({
	loaderData,
}: Route.ComponentProps) {
	const { medium, modelId, language, models, prompt, sheets, work, rows } =
		loaderData
	const hrefWith = useHrefWith()
	const selectedModel = models.find((m) => m.id === modelId)

	return (
		<>
			<header className="border-rule container border-b py-10 md:py-14">
				<div className="grid gap-8 lg:grid-cols-12">
					<div className="lg:col-span-8">
						<Data className="text-ground-muted mb-4 block tracking-[0.2em]">
							Task 2 · Visitor descriptions
						</Data>
						<Display as="h1" size="chapter" className="measure-wide">
							Four texts per sheet, per model
						</Display>
						<p className="font-body text-prose-lg measure mt-6">
							German and English, long and short, written from the image and the
							catalogue record together. Two things follow from the prompt and
							are worth knowing before you mark anything as a discrepancy: the
							short version is not a truncation of the long one, and the German
							and English are not translations of each other. Each carries the
							same substance, idiomatic in its own language.
						</p>
					</div>
					<div className="flex flex-col justify-end gap-3 lg:col-span-4">
						<Data className="text-ground-muted">Medium</Data>
						<MediumSwitch
							current={medium}
							hrefFor={(next) => hrefWith({ medium: next, work: null })}
						/>
						<p className="font-body text-prose-sm text-ground-muted">
							Character limits are the briefing's: 800 for the long text, 500
							for the short. Counts are shown on every text, and marked when
							exceeded.
						</p>
					</div>
				</div>
			</header>

			<div className="container flex flex-col gap-8 pb-16">
				<PromptDisclosure
					prompt={prompt}
					label={`The description prompt for ${mediumGerman(medium)}, in full`}
				/>

				<SelectionConsole
					medium={medium}
					workId={work?.id ?? null}
					modelId={modelId}
					works={sheets}
					models={models}
					resetTo={`?medium=${medium}`}
					summary={
						work
							? `${work.objectNumber} · all five models`
							: `${sheets.length} sheets · ${selectedModel?.label ?? modelId}`
					}
					extra={
						<ConsoleField
							label="Language"
							htmlFor="s-lang"
							hint="browse view only"
						>
							<ConsoleSelect id="s-lang" name="lang" defaultValue={language}>
								{LANGUAGES.map((l) => (
									<option key={l.id} value={l.id}>
										{l.label}
									</option>
								))}
							</ConsoleSelect>
						</ConsoleField>
					}
				/>

				{work && loaderData.byModel && loaderData.position ? (
					<SheetView
						work={work}
						byModel={loaderData.byModel}
						position={loaderData.position}
						previous={loaderData.previous}
						next={loaderData.next}
						hrefWith={hrefWith}
					/>
				) : rows ? (
					<SheetGrid rows={rows} language={language} hrefWith={hrefWith} />
				) : (
					<NoRecords>No sheets in this medium.</NoRecords>
				)}
			</div>
		</>
	)
}

/** Browse: twenty sheets with one model's short text under each plate. */
function SheetGrid({
	rows,
	language,
	hrefWith,
}: {
	rows: NonNullable<Awaited<ReturnType<typeof loader>>['rows']>
	language: LanguageId
	hrefWith: (changes: Record<string, string | number | null>) => string
}) {
	const tag = LANGUAGES.find((l) => l.id === language)!.tag
	return (
		<div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
			{rows.map((row) => (
				<article key={row.id} className="flex flex-col gap-3">
					<Link
						to={hrefWith({ work: row.id })}
						prefetch="intent"
						className="block no-underline"
					>
						<Plate
							work={{
								objectKey: row.objectKey,
								title: row.title,
								artist: row.artist,
								objectType: null,
								notBefore: row.notBefore,
								notAfter: row.notAfter,
							}}
							maxHeight="max-h-64"
							sizes="(min-width: 1024px) 22rem, (min-width: 640px) 45vw, 90vw"
						/>
					</Link>
					<Display as="h3" size="title" className="text-[1rem] leading-tight">
						<Link
							to={hrefWith({ work: row.id })}
							className="hover:text-link no-underline"
						>
							{row.title ?? 'Untitled'}
						</Link>
					</Display>
					<p className="font-body text-prose-sm italic">
						{row.artist ?? 'Unattributed'}
						{', '}
						<span className="not-italic">
							{displayDating(row.notBefore, row.notAfter)}
						</span>
					</p>
					{row.text ? (
						<p
							className="font-body text-prose-sm border-rule border-t pt-3"
							lang={tag}
						>
							{row.text}
						</p>
					) : (
						<p className="font-body text-prose-sm text-ground-muted border-rule border-t pt-3 italic">
							No text returned for this sheet.
						</p>
					)}
				</article>
			))}
		</div>
	)
}

/** Sheet: the plate once, then all five models' four texts beneath it. */
function SheetView({
	work,
	byModel,
	position,
	previous,
	next,
	hrefWith,
}: {
	work: NonNullable<Awaited<ReturnType<typeof loader>>['work']>
	byModel: NonNullable<Awaited<ReturnType<typeof loader>>['byModel']>
	position: { index: number; total: number }
	previous: { id: string; objectNumber: string } | null
	next: { id: string; objectNumber: string } | null
	hrefWith: (changes: Record<string, string | number | null>) => string
}) {
	return (
		<div className="flex flex-col gap-12">
			<div className="grid gap-8 lg:grid-cols-12">
				<div className="lg:col-span-5">
					<Plate work={work} sizes="(min-width: 1024px) 40vw, 90vw" />
				</div>
				<div className="flex flex-col gap-5 lg:col-span-7">
					<Display as="h2" size="title" className="break-words hyphens-auto">
						{work.title ?? 'Untitled'}
					</Display>
					<WorkMetadata work={work} />
					<SheetPager
						previous={previous}
						next={next}
						position={`${position.index} / ${position.total}`}
						hrefFor={(id) => hrefWith({ work: id })}
					/>
				</div>
			</div>

			<div className="flex flex-col gap-12">
				{byModel.map(({ model, descriptions }) => (
					<section key={model.id} className="flex flex-col gap-6">
						<header className="border-rule-strong border-b pb-3">
							<Display as="h3" size="title" className="text-[1.0625rem]">
								{model.label}
							</Display>
							<Data className="text-ground-muted mt-1 block normal-case">
								{model.provider} · {model.id}
							</Data>
						</header>
						{descriptions ? (
							<TextPair descriptions={descriptions} />
						) : (
							<p className="font-body text-prose-sm text-ground-muted italic">
								This model returned no description for this sheet.
							</p>
						)}
					</section>
				))}
			</div>
		</div>
	)
}

function TextPair({ descriptions }: { descriptions: DescriptionSet }) {
	return (
		<div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
			{LANGUAGES.map((lang) => (
				<div key={lang.id} className="flex flex-col gap-6" lang={lang.tag}>
					<Data className="tracking-[0.2em]">{lang.label}</Data>
					<TextBlock kind="long" text={descriptions[lang.id].long} />
					<TextBlock kind="short" text={descriptions[lang.id].short} />
				</div>
			))}
		</div>
	)
}
