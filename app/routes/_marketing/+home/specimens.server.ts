import { type WorkSummary } from '#app/components/institute/record.tsx'
import { dealOffset, todaysDeal } from '#app/routes/archive/+shared/filters.ts'
import { DEAL_ORDER } from '#app/routes/archive/+shared/index-data.server.ts'
import { prisma } from '#app/utils/db.server.ts'

/**
 * A few plates from the archive for the homepage's exhibit of it.
 *
 * They are cut from today's deal, the same stored permutation the index's
 * `chance` order reads, so the homepage shows a different handful each day
 * without anyone curating them. Curating would select for looking good, and the
 * archive's charter says it does not do that.
 *
 * Only works with an image and a title are dealt: a plate saying "no image on
 * file" is the honest thing for a record, but it is not an exhibit.
 *
 * The homepage belongs to the company rather than the archive, so a database
 * that cannot be reached costs the reader these plates and nothing else.
 */
export async function loadSpecimens(count = 4): Promise<Array<WorkSummary>> {
	const where = { objectKey: { not: null }, title: { not: null } }
	try {
		const total = await prisma.resource.count({ where })
		if (total === 0) return []
		const rows = await prisma.resource.findMany({
			where,
			orderBy: DEAL_ORDER,
			skip: Math.min(
				dealOffset(todaysDeal(), total),
				Math.max(0, total - count),
			),
			take: count,
			select: {
				id: true,
				title: true,
				notBefore: true,
				notAfter: true,
				institution: true,
				objectKey: true,
				artist: { select: { name: true } },
				taggings: {
					orderBy: { frequency: 'desc' },
					take: 8,
					select: { tag: { select: { name: true } } },
				},
			},
		})
		return rows.map((r) => ({
			id: r.id,
			title: r.title,
			artist: r.artist?.name ?? null,
			notBefore: r.notBefore,
			notAfter: r.notAfter,
			institution: r.institution,
			objectKey: r.objectKey,
			motifs: r.taggings.map((t) => t.tag.name),
		}))
	} catch (error) {
		console.error('homepage specimens could not be loaded', error)
		return []
	}
}
