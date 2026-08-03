import { prisma } from '#app/utils/db.server.ts'
import { type Route } from './+types/atlas-label.ts'

/**
 * Title and artist for one work, for the atlas's hover label.
 *
 * The atlas ships geometry, not text: 89,800 titles are ~5MB against 1.6MB of
 * positions, and a reader hovers maybe a dozen of them. So the labels stay in
 * the database and arrive one at a time, which also means the map never shows a
 * title that has since been corrected in the archive.
 */
export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url)
	const id = Number(url.searchParams.get('id'))
	if (!Number.isInteger(id) || id <= 0) {
		return Response.json(
			{ error: 'id must be a positive integer' },
			{ status: 400 },
		)
	}

	const work = await prisma.resource.findUnique({
		where: { id },
		select: {
			id: true,
			title: true,
			titleEn: true,
			notBefore: true,
			notAfter: true,
			institution: true,
			artist: { select: { name: true } },
		},
	})

	if (!work) return Response.json({ error: 'not found' }, { status: 404 })

	return Response.json(
		{
			id: work.id,
			title: work.titleEn ?? work.title,
			artist: work.artist?.name ?? null,
			notBefore: work.notBefore,
			notAfter: work.notAfter,
			institution: work.institution,
		},
		{
			// Immutable enough for a session: a hovered label re-hovered a second
			// later must not cost a second query.
			headers: { 'Cache-Control': 'public, max-age=300' },
		},
	)
}
