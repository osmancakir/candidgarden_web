import { ARCHIVE, CONTACT_EMAIL } from '#app/routes/prospectus/+shared/deck.ts'
import atlasShot from './work/atlas.jpg'
import dossierShot from './work/dossier.jpg'
import driftShot from './work/drift.jpg'
import magpieCard from './work/magpie-jar.png'

/**
 * What the homepage says, kept apart from how it is laid out.
 *
 * Every figure is passed in or imported rather than typed into a sentence: the
 * archive's from `ARCHIVE`, which the prospectus deck also reads, and the
 * Städel pilot's from the frozen run via the loader. A number on the company
 * page that disagreed with the report the client holds would be the one mistake
 * this page could not survive.
 *
 * The screenshots under `work/` are of our own surfaces and products, taken
 * from the running sites. None shows a client's holdings: the Städel card is
 * typographic on purpose, because the sheets are the museum's to publish.
 */

export { ARCHIVE, CONTACT_EMAIL }

export type StaedelFigures = {
	sample: number
	maxPerArtist: number
	calls: number
	rounds: number
	collection: number
}

const n = (value: number) => value.toLocaleString('en-US')

/* --------------------------------------------------------------------------
   Services
   -------------------------------------------------------------------------- */

export type Service = {
	id: string
	name: string
	line: string
	delivers: Array<string>
	/**
	 * Where the same work can already be seen, and the row links there. Null
	 * when nothing public shows it yet: that row asks the reader to write.
	 */
	evidence: { label: string; to: string } | null
}

export const SERVICES: Array<Service> = [
	{
		id: 'collections',
		name: 'AI cataloguing',
		line: 'Iconographic keywords and bilingual descriptions for whole collections, in your schema, every record stamped with the model and run that made it.',
		delivers: [
			'Catalogue audit',
			'Full run',
			'Writeback to Axiell, MuseumPlus, CSV',
		],
		evidence: { label: 'The archive', to: '/archive' },
	},
	{
		id: 'evaluation',
		name: 'Model evaluation',
		line: 'Which model to trust, settled on your own material: every major provider, a frozen sample, blind scoring, the cost before the full run.',
		delivers: ['Blind scoring', 'Disclosed prompts', 'Cost per model'],
		evidence: null,
	},
	{
		id: 'digitalisation',
		name: 'Digitalisation',
		line: 'Free text into identifiers. Artists, works and holders matched to Wikidata, metadata in the standard your repository expects, ambiguity held back for review.',
		delivers: ['Wikidata QIDs', 'DataCite & schema work', 'Migrations'],
		evidence: { label: 'The archive', to: '/archive' },
	},
	{
		id: 'synthetic-data',
		name: 'Synthetic data',
		line: 'Datasets written by models to a schema and checked by validators: evaluation sets, test fixtures, training material, texts graded to a reading level.',
		delivers: ['Typed output', 'Validator passes', 'Provenance per row'],
		evidence: null,
	},
	{
		id: 'web',
		name: 'Web applications',
		line: 'Full stack, from schema to deploy pipeline: React and TypeScript on Cloudflare or AWS, Postgres or SQLite, tested before anything ships.',
		delivers: [
			'React Router · TypeScript',
			'Postgres · pgvector · D1',
			'CI/CD',
		],
		evidence: { label: 'Magpie Jar', to: 'https://magpiejar.com' },
	},
	{
		id: 'mobile',
		name: 'Mobile apps',
		line: 'Native iOS and Android in React Native, Expo or Flutter, taken through store review, with sign-in, subscriptions and the API behind them.',
		delivers: ['React Native · Flutter', 'Sign in with Apple', 'RevenueCat'],
		evidence: { label: 'Magpie Jar', to: 'https://magpiejar.com' },
	},
	{
		id: 'research',
		name: 'Research',
		line: 'Questions answered with a method and a written report: semantic search, maps of latent space, model bias, evaluations built to fail visibly.',
		delivers: ['Embeddings', 'UMAP · WebGL', 'Written reports'],
		evidence: { label: 'The atlas', to: '/archive/atlas' },
	},
]

/* --------------------------------------------------------------------------
   Work — parked. The homepage does not render it for now (see
   `selected-work.tsx`); the cards stay here so it can come back as it was.
   -------------------------------------------------------------------------- */

export type WorkCard = {
	id: string
	client: string
	category: string
	title: string
	line: string
	href: string
	external?: boolean
	/** A screenshot, or null for a typographic plate. */
	image: string | null
	/** `contain` for an image with a face of its own that must not be cut. */
	fit?: 'cover' | 'contain'
	/** Grid span on desktop, out of twelve. */
	span: 5 | 6 | 7 | 12
	aspect: string
}

export function workCards(staedel: StaedelFigures): Array<WorkCard> {
	return [
		{
			id: 'work-staedel',
			client: 'Städel Museum, Frankfurt',
			category: 'Model evaluation · AI cataloguing',
			title: 'Which model to trust with a print room',
			line: `Current vision models on the Graphische Sammlung’s prints and drawings, scored blind against the sheets themselves, in ${staedel.rounds} rounds that each answered the curators’ notes. The museum reads every comparison in a private working area here.`,
			href: '/staedel-research',
			image: null,
			span: 12,
			aspect: 'aspect-[4/5] sm:aspect-[16/9] lg:aspect-[21/9]',
		},
		{
			id: 'work-archive',
			client: 'Candid Garden Archive',
			category: 'AI cataloguing · Digitalisation',
			title: `${n(ARCHIVE.works)} works, read at three levels of meaning`,
			line: `Every work in the ARTigo corpus described, identified and interpreted by machine, ${n(ARCHIVE.artistsReconciled)} artists reconciled with Wikidata, and every reading stamped with its model and date.`,
			href: '/archive',
			image: dossierShot,
			span: 7,
			aspect: 'aspect-[16/10]',
		},
		{
			id: 'work-drift',
			client: 'Candid Garden Archive',
			category: 'Public interface',
			title: 'The drift',
			line: 'Forty paintings, Giotto to Malevich. Pull or push each one, and the forces decide where in the latent space you end up.',
			href: '/archive/drift',
			image: driftShot,
			span: 5,
			aspect: 'aspect-[4/5]',
		},
		{
			id: 'work-magpie',
			client: 'Magpie Jar',
			category: 'Product · Web & mobile',
			title: 'Recommendations that trust you',
			line: 'Films, series, records, books and art, each picked with a one-line reason. The web is in service; the iOS and Android apps are in Flutter.',
			href: 'https://magpiejar.com',
			external: true,
			image: magpieCard,
			fit: 'contain',
			span: 5,
			aspect: 'aspect-[1200/630]',
		},
		{
			id: 'work-atlas',
			client: 'Candid Garden Archive',
			category: 'Research · WebGL',
			title: `${n(ARCHIVE.readings)} readings, as a model holds them`,
			line: 'The archive’s readings projected from 1,024 dimensions to three and drawn in the browser, so a search lights a constellation instead of reordering a list.',
			href: '/archive/atlas',
			image: atlasShot,
			span: 7,
			aspect: 'aspect-[16/10]',
		},
	]
}

/* --------------------------------------------------------------------------
   Collaborators, terms
   -------------------------------------------------------------------------- */

export const WORKED_WITH: Array<{ name: string; note: string }> = [
	{ name: 'Städel Museum', note: 'Frankfurt am Main' },
	{ name: 'LMU München', note: 'Art history, ARTigo' },
	{ name: 'UB der LMU', note: 'DataCite metadata' },
]

export const TERMS: Array<{ term: string; body: string }> = [
	{
		term: 'By the phase',
		body: 'Fixed price per phase, each signed off on its own. Stop after any of them and keep what was made.',
	},
	{
		term: 'Compute at cost',
		body: 'Model and hosting costs passed through without markup, measured in a pilot before the full run.',
	},
	{
		term: 'Nothing rented',
		body: 'No seats, no minimum term, no portal. The result is a file in your system or code in your repository.',
	},
	{
		term: 'Public buyers',
		body: 'Phases cut to sit below procurement thresholds, with the evidence a funding application needs.',
	},
]
