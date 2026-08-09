import { prisma } from '#app/utils/db.server.ts'
import { type Route } from './+types/track-download.ts'

/**
 * A tally of how many times a published document has been fetched.
 *
 * The count is printed back to the reader on the page that offers the file, so
 * it has to be a record rather than an analytics event that disappears into
 * someone else's dashboard. What is kept is deliberately thin: the file, a
 * truncated address, the country Cloudflare already put on the request, and the
 * user agent. Enough to tell a reader from a crawler, not enough to tell one
 * reader from another.
 */

/** Only the files the archive actually hands out. Anything else is noise. */
const TRACKED_FILES = new Set(['reading-companion-all-the-beauty.pdf'])

/**
 * The last octet of a v4 address, or everything past the third hextet of a v6
 * one, is the part that identifies a household. It never reaches the database.
 */
function anonymiseIp(ip: string | null | undefined): string | null {
	if (!ip) return null
	if (ip.includes(':')) {
		const head = ip.split(':').slice(0, 3).join(':')
		return head ? `${head}::` : null
	}
	const octets = ip.split('.')
	if (octets.length !== 4) return null
	return `${octets.slice(0, 3).join('.')}.xxx`
}

export async function action({ request }: Route.ActionArgs) {
	const formData = await request.formData()
	const fileName = formData.get('fileName')

	if (typeof fileName !== 'string' || !TRACKED_FILES.has(fileName)) {
		return Response.json({ error: 'unknown file' }, { status: 400 })
	}

	const ipAddress = anonymiseIp(
		request.headers.get('cf-connecting-ip') ??
			request.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
	)

	try {
		await prisma.pdfDownload.create({
			data: {
				fileName,
				ipAddress,
				country: request.headers.get('cf-ipcountry'),
				userAgent: request.headers.get('user-agent'),
			},
		})
	} catch (error) {
		// The reader already has the file by the time this runs. A failed tally is
		// our problem, not theirs, and must not surface as an error on the page.
		console.error('Failed to record a download:', error)
		return Response.json({ recorded: false }, { status: 200 })
	}

	return Response.json({ recorded: true })
}
