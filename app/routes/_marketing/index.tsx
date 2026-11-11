import { useEffect, useState } from 'react'
import { data, Link } from 'react-router'
import { AtlasCanvas } from '#app/components/institute/atlas-canvas.tsx'
import { Data } from '#app/components/institute/primitives.tsx'
import { plateAlt, workHref } from '#app/components/institute/record.tsx'
import { pipeHeaders } from '#app/utils/headers.server.ts'
import { getWorkImgSrc } from '#app/utils/misc.tsx'
import { makeTimings, time } from '#app/utils/timing.server.ts'
import { useOptionalUser, userHasRole } from '#app/utils/user.ts'
import {
	ARCHIVE,
	CONTACT_EMAIL,
	SERVICE_GROUPS,
	SERVICES,
	STANDARDS,
	TERMS,
	WORKED_WITH,
	type Service,
} from './+home/content.ts'
import { SectionTitle } from './+home/section-title.tsx'
import { loadSpecimens } from './+home/specimens.server.ts'
import atlasStill from './+home/work/atlas-still.jpg'
import { type Route } from './+types/index.ts'

/**
 * The company page.
 *
 * Until November 2026 this address rendered the archive index (§5, "the index
 * is the homepage"). Candid Garden is now a studio that sells its work, so the
 * index moved to `/archive` alone and this page shows what is offered.
 *
 * The first version of this page was the Institute register applied straight —
 * numbered, ruled, all text — and it read like a filing cabinet. This one keeps
 * the register's materials (paper and void, one ultramarine, Archivo Black,
 * Times, Plex Mono, no radius) and takes its structure from the studios
 * museums actually hire: the work itself full-bleed behind the first
 * sentence, the services as big rows. (The case-study grid is parked in
 * `+home/selected-work.tsx` for now.) Ultramarine, which the rest of the site
 * spends on links alone, floods each service row under the pointer, because a
 * company page that whispers is not doing its job.
 *
 * What it still refuses from §10: rounded cards, drop shadows, carousels, and
 * copy that sells rather than states. Every figure is read from the data the
 * work was delivered from.
 */

export const meta: Route.MetaFunction = () => [
	{ title: 'Candid Garden · Collection data & software, Munich' },
	{
		name: 'description',
		content:
			'Candid Garden is a research and software studio in Munich. We catalogue museum and library collections with AI, align records to GND, Getty AAT, Iconclass and Wikidata, deliver LIDO and CIDOC CRM, and write back into MuseumPlus and Axiell. One project, no subscription.',
	},
]

export async function loader() {
	const timings = makeTimings('home')
	const specimens = await time(() => loadSpecimens(10), {
		timings,
		type: 'loadSpecimens',
		desc: 'deal plates from the archive',
	})
	return data(
		{ specimens },
		{ headers: { 'Server-Timing': timings.toString() } },
	)
}

export const headers: Route.HeadersFunction = pipeHeaders

const n = (value: number) => value.toLocaleString('en-US')

type Specimens = Route.ComponentProps['loaderData']['specimens']

export default function Index({ loaderData }: Route.ComponentProps) {
	const { specimens } = loaderData
	return (
		<div className="flex flex-col">
			<Hero />
			<Statement />
			<Services />
			<Standards />
			<TodayInTheArchive specimens={specimens} />
			<WorkedWith />
			<HowWeWork />
			<Contact />
		</div>
	)
}

/* ==========================================================================
   Hero — the atlas, live, behind the first sentence.
   ========================================================================== */

/**
 * Whether to draw the atlas or show its still. three.js and 1.6 MB of
 * geometry are a fair price for a desktop visitor and an unfair one for a
 * phone on a train, so small screens and Save-Data get the photograph.
 */
function useLiveAtlas() {
	const [live, setLive] = useState(false)
	useEffect(() => {
		const connection = (
			navigator as Navigator & { connection?: { saveData?: boolean } }
		).connection
		setLive(
			window.matchMedia('(min-width: 768px)').matches && !connection?.saveData,
		)
	}, [])
	return live
}

const noop = () => {}

function Hero() {
	const live = useLiveAtlas()
	return (
		<section className="register-void relative isolate flex min-h-[calc(100svh-5rem)] flex-col justify-end overflow-hidden">
			<div aria-hidden className="absolute inset-0 -z-10">
				{live ? (
					<AtlasCanvas
						ambient
						hits={[]}
						colorMode="uniform"
						levelFilter="both"
						onHover={noop}
						onSelect={noop}
						onReady={noop}
					/>
				) : (
					<img
						src={atlasStill}
						alt=""
						className="h-full w-full object-cover opacity-80"
					/>
				)}
			</div>
			{/* A scrim beneath the type, not an accent: it exists so bone stays
			    legible where the densest part of the cloud passes behind it. */}
			<div
				aria-hidden
				className="from-void via-void/60 pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-3/4 bg-gradient-to-t to-transparent"
			/>

			<div className="container pt-32 pb-10 md:pb-12">
				<Data className="block tracking-[0.25em]">
					Candid Garden · Collection data &amp; software · Munich
				</Data>
				<h1 className="font-display mt-6 max-w-[19ch] text-[clamp(2.4rem,5.4vw,5.25rem)] leading-[0.93] tracking-[-0.02em] uppercase">
					We catalogue, standardise and publish{' '}
					<span className="text-link">collections</span>
				</h1>
				<p className="font-body text-prose-lg text-bone/85 mt-8 max-w-[58ch]">
					For museums, libraries and archives. We enrich your records with
					current vision and language models, match them to GND, Getty AAT,
					Iconclass and Wikidata, deliver LIDO or CIDOC CRM, and write the
					result back into MuseumPlus, Axiell or whatever you run. You keep a
					finished catalogue, not a login.
				</p>

				<div className="border-rule mt-10 flex flex-col gap-6 border-t pt-6 md:flex-row md:items-end md:justify-between">
					<ul className="flex flex-wrap gap-x-5 gap-y-2">
						{SERVICES.map((s) => (
							<li key={s.id}>
								<a
									href={`#${s.id}`}
									className="font-data text-data-sm hover:text-link tracking-[0.14em] uppercase no-underline"
								>
									{s.name}
								</a>
							</li>
						))}
					</ul>
					<div className="max-w-sm md:text-right">
						<Data className="text-ground-muted block tracking-normal normal-case">
							Behind this sentence: {n(ARCHIVE.readings)} readings from our
							archive, where an embedding model holds them.
							{live ? ' Rendered live.' : null}
						</Data>
						<Link
							to="/archive/atlas"
							className="font-data text-data-sm text-link mt-2 inline-block tracking-[0.14em] uppercase underline underline-offset-4"
						>
							Enter the atlas →
						</Link>
					</div>
				</div>
			</div>
		</section>
	)
}

/* ==========================================================================
   Statement — one sentence, large, with the nouns that matter in ink.
   ========================================================================== */

function Em({ children }: { children: React.ReactNode }) {
	return <span className="text-ground-fg">{children}</span>
}

function Statement() {
	return (
		<section className="container py-24 md:py-36">
			<p className="font-body text-ground-muted max-w-[30ch] text-[clamp(1.6rem,3.4vw,3.1rem)] leading-[1.18] tracking-[-0.01em]">
				<Em>Candid Garden</Em> is a research and software studio in Munich. We
				make <Em>collections legible to machines</Em>, and machines legible to
				people: every record a model writes carries the{' '}
				<Em>model, run and date</Em> that made it, so your specialists can
				correct it. For institutions that need the work{' '}
				<Em>finished, in their own system</Em>, not demonstrated in ours.
			</p>
		</section>
	)
}

/* ==========================================================================
   Services — big rows that take the accent under the pointer.
   ========================================================================== */

function Services() {
	return (
		<section id="services" className="scroll-mt-24 pb-28">
			<div className="container">
				<div className="border-rule flex flex-wrap items-end justify-between gap-6 border-b pb-6">
					<SectionTitle count={SERVICES.length}>What we do</SectionTitle>
					<Data className="text-ground-muted max-w-xs tracking-normal normal-case">
						One project or one phase at a time. Where the same thing can already
						be seen, the row opens it.
					</Data>
				</div>
			</div>
			{SERVICE_GROUPS.map((group, gi) => {
				const offset = SERVICE_GROUPS.slice(0, gi).reduce(
					(sum, g) => sum + g.services.length,
					0,
				)
				return (
					<div key={group.id} id={group.id} className="scroll-mt-24">
						<div className="container flex flex-col gap-3 pt-14 pb-6 md:grid md:grid-cols-12 md:gap-x-6">
							<Data className="tracking-[0.25em] md:col-span-6">
								{group.title}
							</Data>
							<p className="font-body text-prose text-ground-muted max-w-[52ch] md:col-span-6">
								{group.lead}
							</p>
						</div>
						<ol className="border-rule border-t">
							{group.services.map((service, i) => (
								<ServiceRow
									key={service.id}
									service={service}
									n={offset + i + 1}
								/>
							))}
						</ol>
					</div>
				)
			})}
		</section>
	)
}

/* ==========================================================================
   Standards — the systems, vocabularies and schemas, named outright.
   ========================================================================== */

function Standards() {
	return (
		<section id="standards" className="container scroll-mt-24 pb-28">
			<div className="border-rule flex flex-wrap items-end justify-between gap-6 border-b pb-6">
				<SectionTitle>Systems &amp; standards</SectionTitle>
				<Data className="text-ground-muted max-w-xs tracking-normal normal-case">
					What we read, write and align to. A typical German art-history project
					is LIDO or CIDOC CRM for structure, with GND, AAT and Iconclass for
					the terms.
				</Data>
			</div>
			<ul className="grid gap-x-8 gap-y-10 pt-8 md:grid-cols-3">
				{STANDARDS.map(({ title, items }) => (
					<li key={title} className="flex flex-col gap-4">
						<span className="font-display text-title uppercase">{title}</span>
						<ul className="flex flex-col gap-2">
							{items.map((item) => (
								<li
									key={item}
									className="font-data text-data-sm border-rule border-b pb-2 tracking-[0.1em] uppercase"
								>
									{item}
								</li>
							))}
						</ul>
					</li>
				))}
			</ul>
		</section>
	)
}

/**
 * A row links to where the service can be seen: a page of ours, a product's
 * own site in a new tab, or — when nothing public shows it yet — the contact
 * section.
 */
function ServiceLink({
	to,
	className,
	children,
}: {
	to: string
	className: string
	children: React.ReactNode
}) {
	if (to.startsWith('http')) {
		return (
			<a href={to} target="_blank" rel="noreferrer" className={className}>
				{children}
			</a>
		)
	}
	if (to.startsWith('#')) {
		return (
			<a href={to} className={className}>
				{children}
			</a>
		)
	}
	return (
		<Link to={to} prefetch="intent" className={className}>
			{children}
		</Link>
	)
}

function ServiceRow({ service, n }: { service: Service; n: number }) {
	const { evidence } = service
	return (
		<li id={service.id} className="border-rule scroll-mt-24 border-b">
			<ServiceLink
				to={evidence?.to ?? '#contact'}
				className="group hover:bg-ultra hover:text-bone focus-visible:bg-ultra focus-visible:text-bone block no-underline transition-colors duration-150"
			>
				<div className="container grid items-baseline gap-x-6 gap-y-3 py-8 md:grid-cols-12 md:py-10">
					<span className="font-data text-data-sm text-ground-muted group-hover:text-bone/80 tabular-nums md:col-span-1">
						{String(n).padStart(2, '0')}
					</span>
					<h3 className="font-display text-[clamp(2rem,3.5vw,3.25rem)] leading-[0.95] tracking-[-0.015em] break-words uppercase md:col-span-5">
						{service.name}
					</h3>
					<div className="flex flex-col gap-3 md:col-span-6">
						<p className="font-body text-prose-lg text-ground-muted group-hover:text-bone group-focus-visible:text-bone max-w-[52ch]">
							{service.line}
						</p>
						<div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
							<span className="font-data text-data-sm text-ground-muted group-hover:text-bone/80 tracking-[0.12em] uppercase">
								{service.delivers.join(' · ')}
							</span>
							<span className="font-data text-data-sm text-link group-hover:text-bone tracking-[0.14em] uppercase underline underline-offset-4">
								{evidence ? (
									<>
										See: {evidence.label}{' '}
										{evidence.to.startsWith('http') ? '↗' : '→'}
									</>
								) : (
									'Ask about it →'
								)}
							</span>
						</div>
					</div>
				</div>
			</ServiceLink>
		</li>
	)
}

/* ==========================================================================
   Today in the archive — a strip of plates, dealt, at their true ratio.
   ========================================================================== */

function TodayInTheArchive({ specimens }: { specimens: Specimens }) {
	if (!specimens.length) return null
	return (
		<section className="register-void py-14">
			<div className="container flex flex-wrap items-baseline justify-between gap-4">
				<Data className="tracking-[0.25em]">Today in the archive</Data>
				<Data className="text-ground-muted tracking-normal normal-case">
					Dealt from the index, not chosen. A new hand each day.{' '}
					<Link
						to="/archive"
						className="text-link underline underline-offset-4"
					>
						Open the index →
					</Link>
				</Data>
			</div>
			{/* Height-constrained, never cropped: §5 still holds for artworks even
			    where screenshots are allowed to be cut. */}
			<ul className="mt-8 flex gap-4 overflow-x-auto px-5 pb-2 md:px-8">
				{specimens.map((work) => {
					const src = getWorkImgSrc(work.objectKey)
					if (!src) return null
					return (
						<li key={work.id} className="shrink-0">
							<Link
								to={workHref(work.id)}
								className="group block no-underline"
								title={`${work.title ?? 'Untitled'}${work.artist ? ` — ${work.artist}` : ''}`}
							>
								<img
									src={`${src}&h=640`}
									alt={plateAlt(work)}
									loading="lazy"
									className="h-56 w-auto max-w-none md:h-72"
								/>
								<span className="font-data text-data-sm text-ground-muted group-hover:text-link mt-2 block max-w-[14rem] truncate tracking-[0.1em] uppercase">
									{work.title ?? 'Untitled'}
								</span>
							</Link>
						</li>
					)
				})}
			</ul>
		</section>
	)
}

/* ==========================================================================
   Worked with, how we work
   ========================================================================== */

function WorkedWith() {
	return (
		<section className="container py-20">
			<Data className="text-ground-muted tracking-[0.25em]">Worked with</Data>
			<ul className="border-rule mt-6 grid border-t sm:grid-cols-3">
				{WORKED_WITH.map(({ name, note }) => (
					<li
						key={name}
						className="border-rule flex flex-col gap-1 border-b py-6 sm:border-r sm:px-6 sm:first:pl-0 sm:last:border-r-0"
					>
						<span className="font-display text-title uppercase">{name}</span>
						<Data className="text-ground-muted tracking-normal normal-case">
							{note}
						</Data>
					</li>
				))}
			</ul>
		</section>
	)
}

function HowWeWork() {
	return (
		<section id="terms" className="container scroll-mt-24 pb-28">
			<SectionTitle className="mb-10">How it works</SectionTitle>
			<ol className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
				{TERMS.map(({ term, body }, i) => (
					<li
						key={term}
						className="border-ground-fg flex flex-col gap-3 border-t-2 pt-4"
					>
						<span className="font-data text-data-sm text-ground-muted tabular-nums">
							{String(i + 1).padStart(2, '0')}
						</span>
						<span className="font-display text-title uppercase">{term}</span>
						<p className="font-body text-prose text-ground-muted">{body}</p>
					</li>
				))}
			</ol>
		</section>
	)
}

/* ==========================================================================
   Contact and client access
   ========================================================================== */

/**
 * Login is for clients and for the owner. Accounts are opened when an
 * engagement starts, so a signed-in reader is shown what they can open rather
 * than a stranger being invited to make an account.
 */
function ClientAccess() {
	const user = useOptionalUser()
	const areas = [
		userHasRole(user ?? null, 'researcher')
			? { label: 'Städel · Graphische Sammlung', to: '/staedel-research' }
			: null,
		userHasRole(user ?? null, 'admin')
			? { label: 'Administration', to: '/admin/cache' }
			: null,
	].filter((a): a is { label: string; to: string } => a !== null)

	return (
		<div id="access" className="border-rule scroll-mt-24 border p-6">
			<Data className="text-ground-muted block tracking-[0.25em]">
				Client access
			</Data>
			<p className="font-body text-prose mt-3">
				Clients read their work here, in private areas opened per person: every
				item, every model, every comparison as a link they can cite.
			</p>
			{user ? (
				<div className="mt-4">
					<Data className="text-ground-muted block tracking-normal normal-case">
						Signed in as {user.name ?? user.username}
					</Data>
					{areas.length ? (
						<ul className="mt-2 flex flex-col gap-1">
							{areas.map((a) => (
								<li key={a.to}>
									<Link
										to={a.to}
										className="font-data text-data-sm text-link tracking-[0.12em] uppercase underline underline-offset-4"
									>
										{a.label} →
									</Link>
								</li>
							))}
						</ul>
					) : (
						<Data className="mt-2 block tracking-normal normal-case">
							No working area is open on this account yet.
						</Data>
					)}
				</div>
			) : (
				<Link
					to="/login"
					className="font-data text-data-sm border-ground-fg hover:bg-ground-fg hover:text-ground mt-5 inline-block border px-5 py-3 tracking-[0.18em] uppercase no-underline transition-colors"
				>
					Client login →
				</Link>
			)}
		</div>
	)
}

function Contact() {
	return (
		<section
			id="contact"
			className="border-rule container scroll-mt-24 border-t pt-20 pb-24"
		>
			<div className="grid gap-x-10 gap-y-12 lg:grid-cols-12">
				<div className="lg:col-span-8">
					<SectionTitle className="max-w-[12ch]">
						Send us a thousand rows.
					</SectionTitle>
					<p className="font-body text-prose-lg text-ground-muted mt-6 max-w-[48ch]">
						Or a paragraph about the problem. For a collection, an export and a
						handful of images are enough to show what comes out on your own
						material — and that first conversation costs nothing.
					</p>
					<a
						href={`mailto:${CONTACT_EMAIL}`}
						className="font-display text-link mt-8 inline-block text-[clamp(1.6rem,4vw,3.25rem)] break-all underline decoration-2 underline-offset-[0.15em]"
					>
						{CONTACT_EMAIL}
					</a>
					<Data className="text-ground-muted mt-4 block tracking-normal normal-case">
						Munich · English and German
					</Data>
				</div>
				<div className="lg:col-span-4 lg:pt-4">
					<ClientAccess />
				</div>
			</div>
		</section>
	)
}
