import { cache, cachified } from '#app/utils/cache.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { type Route } from './+types/atlas-work.ts'

/**
 * One work, abridged, for the dialog a click on the atlas opens.
 *
 * The atlas used to send a click straight to the dossier, which threw away the
 * reader's place in the map for every point they were only curious about. The
 * dialog shows enough to decide whether the dossier is worth the trip: the
 * plate, the facts, the strongest motifs and the opening of each reading.
 *
 * The readings are cut here rather than in the browser so the full text, which
 * is the dossier's to show, never crosses the wire for a glance.
 */

/** Roughly four lines in the dialog's measure. */
const EXCERPT_LENGTH = 320
const MOTIFS = 8

/** Same reasoning as the dossier's TTLs: nothing here is per-reader. */
const TTL = 1000 * 60 * 60 * 6
const SWR = 1000 * 60 * 60 * 24 * 7

export type AtlasWork = NonNullable<Awaited<ReturnType<typeof buildWork>>>

export async function loader({ request }: Route.LoaderArgs) {
	const id = Number(new URL(request.url).searchParams.get('id'))
	if (!Number.isInteger(id) || id <= 0) {
		return Response.json(
			{ error: 'id must be a positive integer' },
			{ status: 400 },
		)
	}

	const work = await cachified({
		key: `atlas:work:v2:${id}`,
		cache,
		ttl: TTL,
		staleWhileRevalidate: SWR,
		getFreshValue: () => buildWork(id),
	})
	if (!work) return Response.json({ error: 'not found' }, { status: 404 })

	return Response.json(work, {
		headers: { 'Cache-Control': 'public, max-age=300' },
	})
}

async function buildWork(id: number) {
	const resource = await prisma.resource.findUnique({
		where: { id },
		select: {
			id: true,
			title: true,
			titleEn: true,
			notBefore: true,
			notAfter: true,
			institution: true,
			objectKey: true,
			artist: { select: { name: true } },
			interpretations: {
				where: { publishedAt: { not: null } },
				select: { level: true, body: true, source: true },
				orderBy: { level: 'asc' },
			},
			taggings: {
				orderBy: { frequency: 'desc' },
				take: MOTIFS,
				select: { tag: { select: { name: true } } },
			},
		},
	})
	if (!resource) return null

	return {
		id: resource.id,
		title: resource.title ?? resource.titleEn,
		titleEn:
			resource.titleEn && resource.titleEn !== resource.title
				? resource.titleEn
				: null,
		artist: resource.artist?.name ?? null,
		notBefore: resource.notBefore,
		notAfter: resource.notAfter,
		institution: resource.institution,
		objectKey: resource.objectKey,
		motifs: resource.taggings.map((t) => t.tag.name),
		readings: resource.interpretations.map((reading) => ({
			level: reading.level as 2 | 3,
			source: reading.source,
			...excerpt(reading.body),
		})),
	}
}

/**
 * One flat line, cut at a word boundary. The imported readings carry Markdown
 * emphasis around titles, which would otherwise show as literal asterisks.
 */
function excerpt(body: string) {
	const flat = body
		.replace(/(\*\*|__|\*)(\S(?:.*?\S)?)\1/g, '$2')
		.replace(/\s+/g, ' ')
		.trim()
	if (flat.length <= EXCERPT_LENGTH) return { excerpt: flat }
	const cut = flat.slice(0, EXCERPT_LENGTH)
	const end = cut.lastIndexOf(' ')
	return {
		excerpt: `${(end > EXCERPT_LENGTH * 0.6 ? cut.slice(0, end) : cut).replace(/[\s,;:.–—-]+$/, '')}…`,
	}
}
