import { useCallback, useEffect, useRef, useState } from 'react'
import { Form, Link, data, useNavigate, useNavigation } from 'react-router'
import {
	AtlasCanvas,
	type AtlasHit,
	type AtlasHover,
	type AtlasManifest,
	type ColorMode,
	type LevelFilter,
} from '#app/components/institute/atlas-canvas.tsx'
import { cache, cachified } from '#app/utils/cache.server.ts'
import { pipeHeaders } from '#app/utils/headers.server.ts'
import { searchInterpretationPoints } from '#app/utils/semantic-search.server.ts'
import { makeTimings } from '#app/utils/timing.server.ts'
import { SENSE_MAX_LENGTH } from './+shared/filters.ts'
import { type Route } from './+types/atlas.ts'

/**
 * §2, taken literally: the atlas is Level III, so it rests on void.
 *
 * The archive index ranks readings into a list. This shows the same 89,800
 * readings as the space they actually occupy — where a phrase lands, and
 * whether it lands in one place or several. The list answers "which works";
 * the atlas answers "is this one idea or three".
 */

/**
 * How many readings a query lights.
 *
 * Larger than the index's 400, and for a different reason: a list is read and a
 * constellation is only seen. Below a couple of hundred the lit points read as
 * scattered dust rather than as a shape, and the whole question the map exists
 * to answer — one cluster or several — stops being visible.
 */
const ATLAS_POINTS = 900

export const meta: Route.MetaFunction = () => [
	{ title: 'Atlas · Candid Garden' },
	{
		name: 'description',
		content:
			'89,800 iconographic and iconological readings projected into three dimensions with UMAP. A search lights points in a fixed map rather than reordering a list.',
	},
]

export async function loader({ request }: Route.LoaderArgs) {
	const timings = makeTimings('atlas')
	const url = new URL(request.url)
	const query = (url.searchParams.get('sense') ?? '')
		.trim()
		.slice(0, SENSE_MAX_LENGTH)

	if (!query) {
		return data(
			{ query: '', hits: [] as Array<AtlasHit>, error: null },
			{ headers: { 'Server-Timing': timings.toString() } },
		)
	}

	try {
		const hits = await cachified({
			key: `atlas:sense:v1:${await queryDigest(query)}`,
			cache,
			timings,
			ttl: 1000 * 60 * 60,
			staleWhileRevalidate: 1000 * 60 * 60 * 6,
			getFreshValue: () =>
				searchInterpretationPoints({ query, limit: ATLAS_POINTS }),
		})
		return data(
			{ query, hits, error: null },
			{ headers: { 'Server-Timing': timings.toString() } },
		)
	} catch (error) {
		// Same contract as the index: an outage costs the reader the highlight,
		// not the map. The projection is a static file and owes nothing to
		// Workers AI or to the vector index.
		console.error('atlas sense search failed', error)
		return data(
			{
				query,
				hits: [] as Array<AtlasHit>,
				error: 'The reading index could not be consulted, so nothing is lit.',
			},
			{ headers: { 'Server-Timing': timings.toString() } },
		)
	}
}

async function queryDigest(query: string): Promise<string> {
	const bytes = new TextEncoder().encode(query)
	const hash = await crypto.subtle.digest('SHA-256', bytes)
	return [...new Uint8Array(hash)]
		.slice(0, 12)
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('')
}

export const headers: Route.HeadersFunction = pipeHeaders

type Label = {
	id: number
	title: string | null
	artist: string | null
	notBefore: number | null
	notAfter: number | null
}

export default function Atlas({ loaderData }: Route.ComponentProps) {
	const { query, hits, error } = loaderData
	const navigate = useNavigate()
	const navigation = useNavigation()
	const [colorMode, setColorMode] = useState<ColorMode>('uniform')
	const [levelFilter, setLevelFilter] = useState<LevelFilter>('both')
	const [manifest, setManifest] = useState<AtlasManifest | null>(null)
	const [hover, setHover] = useState<AtlasHover>(null)
	const [label, setLabel] = useState<Label | null>(null)

	const searching =
		navigation.state === 'loading' &&
		navigation.location?.pathname === '/archive/atlas'

	// Labels are fetched per hovered point and remembered for the session, so
	// crossing the same cluster twice costs one request, not two.
	const labelCache = useRef(new Map<number, Label>())

	useEffect(() => {
		if (!hover) {
			setLabel(null)
			return
		}
		const cached = labelCache.current.get(hover.resourceId)
		if (cached) {
			setLabel(cached)
			return
		}
		const abort = new AbortController()
		setLabel(null)
		fetch(`/resources/atlas-label?id=${hover.resourceId}`, {
			signal: abort.signal,
		})
			.then((response) =>
				response.ok ? (response.json() as Promise<Label>) : null,
			)
			.then((value) => {
				if (!value) return
				labelCache.current.set(value.id, value)
				setLabel(value)
			})
			.catch(() => {})
		return () => abort.abort()
	}, [hover])

	const onSelect = useCallback(
		(resourceId: number) => navigate(`/archive/${resourceId}`),
		[navigate],
	)
	const onReady = useCallback(
		(loaded: AtlasManifest) => setManifest(loaded),
		[],
	)

	// `100vh - 4rem` assumes the masthead is one row, which it is only above
	// `lg`: narrower than that the nav wraps under the wordmark and the map hangs
	// off the bottom of the screen, taking the legend with it. On a phone the
	// masthead takes a third of the viewport outright. Below `lg` the map gets a
	// fixed share of the screen instead — a cropped view onto the same fixed
	// layout, at the size the device can afford.
	return (
		<div className="register-void relative h-[70dvh] w-full overflow-hidden lg:h-[calc(100vh-4rem)]">
			<AtlasCanvas
				hits={hits}
				colorMode={colorMode}
				levelFilter={levelFilter}
				onHover={setHover}
				onSelect={onSelect}
				onReady={onReady}
			/>

			{/* The console. Overlaid rather than beside, because the map wants the
			    whole viewport and the controls are four fields. */}
			<div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 md:p-6">
				<div className="pointer-events-auto flex flex-wrap items-start gap-3 md:gap-6">
					{/* A scrim, because the cloud reaches the corners and unbacked type
					    over a field of points is unreadable wherever one lands behind a
					    letter. Void at 80% rather than a blur: the ground stays the
					    ground, and the points behind it stay faintly visible. */}
					<div className="bg-ground/80 w-full p-3 md:w-auto md:max-w-md">
						{/* The chip's own name, in the same mono the descent uses for its
						    level markers — and carrying no numeral, because the sequence
						    stops at III and this is not the next term in it. */}
						<p className="text-ground-muted font-mono text-[10px] tracking-[0.2em] uppercase">
							Latent space
						</p>
						<h1 className="text-ground-fg mt-1 font-serif text-2xl">Atlas</h1>
						{/* Cropped for the phone as the map is: the sentence keeps its
						    numbers and loses its second half, which the reader can find
						    on a screen wide enough to hold the map it describes. */}
						<p className="text-ground-muted mt-1 max-w-sm font-mono text-[11px] leading-relaxed">
							{manifest ? (
								<>
									{`${manifest.count.toLocaleString()} readings of ${manifest.works.toLocaleString()} works, projected from 1,024 dimensions to 3 with UMAP.`}
									<span className="hidden md:inline">
										{' '}
										The layout is fixed; a search lights it.
									</span>
								</>
							) : (
								'Loading the projection.'
							)}
						</p>
						{/* What the space is of, stated before anything is read off it: the
						    vectors are of the readings, which are text a model wrote about
						    the pictures. No image was embedded. A map of language about art
						    is a different object from a map of art, and the difference is
						    invisible in the picture. */}
						<p className="text-ground-muted mt-2 hidden max-w-sm font-mono text-[11px] leading-relaxed md:block">
							Not a fourth level — Panofsky described three. This is where those
							readings are held: the space the embedding model puts its own
							prose in, flattened to 3 of its 1,024 dimensions. It maps what has
							been written about the works, not the works.{' '}
							<Link
								to="/archive"
								className="hover:text-link underline underline-offset-4"
							>
								Back to the index
							</Link>
							.
						</p>
						{/* The same caveat at the length a phone can carry it. The claim
						    the paragraph exists to refuse — that this is a map of art —
						    survives the cut; the account of how it was made does not. */}
						<p className="text-ground-muted mt-2 font-mono text-[11px] leading-relaxed md:hidden">
							A map of what has been written about the works, not of the works.{' '}
							<Link
								to="/archive"
								className="hover:text-link underline underline-offset-4"
							>
								Back to the index
							</Link>
							.
						</p>

						<Form
							method="get"
							className="mt-3 flex flex-wrap items-center gap-2 md:mt-4"
						>
							<input
								type="search"
								name="sense"
								defaultValue={query}
								maxLength={SENSE_MAX_LENGTH}
								placeholder="a phrase — e.g. grief at a graveside"
								aria-label="Search the readings by meaning"
								className="border-rule text-ground-fg placeholder:text-ground-muted focus:border-link min-w-0 flex-1 border bg-transparent px-3 py-2 font-mono text-xs focus:outline-none md:w-72 md:flex-none"
							/>
							<button
								type="submit"
								className="border-rule text-ground-fg hover:border-link hover:text-link shrink-0 border px-3 py-2 font-mono text-xs"
							>
								{searching ? 'Searching…' : 'Light'}
							</button>
							{query ? (
								<Link
									to="/archive/atlas"
									className="text-ground-muted hover:text-link shrink-0 font-mono text-xs underline underline-offset-4"
								>
									clear
								</Link>
							) : null}
						</Form>

						{error ? (
							<p className="text-stamp-fg mt-2 font-mono text-[11px]">
								{error}
							</p>
						) : query ? (
							<p className="text-ground-muted mt-2 font-mono text-[11px]">
								{hits.length.toLocaleString()} readings lit
								{hits.length >= ATLAS_POINTS ? ' (the ceiling)' : ''} · nearest{' '}
								{(hits[0]?.similarity ?? 0).toFixed(3)} cosine
							</p>
						) : null}
					</div>

					<Controls
						colorMode={colorMode}
						setColorMode={setColorMode}
						levelFilter={levelFilter}
						setLevelFilter={setLevelFilter}
					/>
				</div>

				<div className="flex items-end justify-between gap-3 md:gap-6">
					<Legend
						colorMode={colorMode}
						hasQuery={Boolean(query) && hits.length > 0}
						manifest={manifest}
					/>
					{/* Kept clear of the bottom-right corner, where the theme control
					    and the dev indicator sit. The gesture it names differs by
					    device — a phone was told to keep one finger for scrolling — so
					    the instruction has to differ with it. */}
					<p className="bg-ground/80 text-ground-muted mr-12 max-w-36 p-2 text-right font-mono text-[10px] leading-relaxed md:mr-16 md:max-w-60 md:p-3">
						<span className="md:hidden">
							Two fingers to turn and zoom · tap a point for its record.
						</span>
						<span className="hidden md:inline">
							Drag to rotate · scroll to zoom · click a point for its record.
							<br />
							Near means near; far is only approximately far.
						</span>
					</p>
				</div>
			</div>

			{hover ? (
				<div
					className="border-rule bg-ground/95 pointer-events-none absolute z-10 max-w-60 border px-3 py-2 md:max-w-xs"
					style={{
						// Clamped at both ends: on a narrow screen the right-hand bound
						// alone can push the label off the left edge instead.
						left: Math.max(8, Math.min(hover.x + 16, window.innerWidth - 264)),
						top: hover.y + 16,
					}}
				>
					<p className="text-ground-fg font-serif text-sm">
						{label?.title ?? '…'}
					</p>
					<p className="text-ground-muted mt-0.5 font-mono text-[10px]">
						{label?.artist ?? ''}
						{label?.notBefore ? ` · ${label.notBefore}` : ''}
					</p>
					<p className="text-ground-muted mt-1 font-mono text-[10px]">
						Level {hover.level === 3 ? 'III' : 'II'}
						{hover.spread === null
							? ' · single reading'
							: ` · spread ${hover.spread.toFixed(3)}`}
					</p>
				</div>
			) : null}
		</div>
	)
}

function Controls({
	colorMode,
	setColorMode,
	levelFilter,
	setLevelFilter,
}: {
	colorMode: ColorMode
	setColorMode: (mode: ColorMode) => void
	levelFilter: LevelFilter
	setLevelFilter: (filter: LevelFilter) => void
}) {
	return (
		<div className="bg-ground/80 flex flex-col gap-3 p-3 font-mono text-[11px]">
			<Switcher
				label="Colour"
				options={[
					['uniform', 'none'],
					['spread', 'interpretive spread'],
				]}
				value={colorMode}
				onChange={(value) => setColorMode(value as ColorMode)}
			/>
			<Switcher
				label="Level"
				options={[
					['both', 'both'],
					['2', 'II'],
					['3', 'III'],
				]}
				value={String(levelFilter)}
				onChange={(value) =>
					setLevelFilter(value === 'both' ? 'both' : (Number(value) as 2 | 3))
				}
			/>
		</div>
	)
}

function Switcher({
	label,
	options,
	value,
	onChange,
}: {
	label: string
	options: Array<[string, string]>
	value: string
	onChange: (value: string) => void
}) {
	return (
		<div className="flex items-center gap-2">
			<span className="text-ground-muted">{label}</span>
			<div className="border-rule flex border">
				{options.map(([key, text]) => (
					<button
						key={key}
						type="button"
						aria-pressed={value === key}
						onClick={() => onChange(key)}
						className={
							value === key
								? 'bg-ground-fg text-ground px-2 py-1'
								: 'text-ground-fg hover:text-link px-2 py-1'
						}
					>
						{text}
					</button>
				))}
			</div>
		</div>
	)
}

/**
 * Identity is never carried by colour alone here: the legend is always present,
 * level is a filter rather than a hue, and the one accent means exactly one
 * thing.
 */
function Legend({
	colorMode,
	hasQuery,
	manifest,
}: {
	colorMode: ColorMode
	hasQuery: boolean
	manifest: AtlasManifest | null
}) {
	return (
		<div className="bg-ground/80 text-ground-muted flex max-w-[58%] flex-col gap-1.5 p-2 font-mono text-[10px] md:max-w-none md:p-3">
			{hasQuery ? (
				<span className="flex items-center gap-2">
					<span
						className="inline-block h-2 w-2 rounded-full"
						style={{ backgroundColor: '#8B87FF' }}
					/>
					matched — brighter is nearer
				</span>
			) : null}
			{colorMode === 'spread' ? (
				<span className="flex flex-col gap-1">
					<span className="flex items-center gap-2">
						<span
							className="inline-block h-2 w-16"
							style={{
								backgroundImage: 'linear-gradient(to right, #4F4F5C, #8B87FF)',
							}}
						/>
						level II → III cosine distance,{' '}
						{manifest ? manifest.spreadFloor.toFixed(2) : '—'} →{' '}
						{manifest ? manifest.spreadCeiling.toFixed(2) : '—'}
						{/* The caveat, not the gloss: which percentiles the ramp spans is
						    a detail, but that it is measured in 1,024 dimensions rather
						    than in the picture is the thing a reader must not lose. */}
						<span className="hidden md:inline">
							{' '}
							(the 1st to 99th percentile; measured in 1,024 dimensions, not in
							this picture)
						</span>
						<span className="md:hidden"> (measured in 1,024 dimensions)</span>
					</span>
					<span className="flex items-center gap-2">
						<span
							className="inline-block h-2 w-2 rounded-full"
							style={{ backgroundColor: '#474745' }}
						/>
						{manifest
							? `${(manifest.count - 2 * manifest.pairedWorks).toLocaleString()} single readings — no spread to report`
							: 'single readings'}
					</span>
				</span>
			) : (
				<span className="flex items-center gap-2">
					<span
						className="inline-block h-2 w-2 rounded-full"
						style={{ backgroundColor: '#E8E5DE' }}
					/>
					one reading · larger points are level II
				</span>
			)}
		</div>
	)
}
