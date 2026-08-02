import { Honeypot, SpamError } from 'remix-utils/honeypot/server'

// The Honeypot constructor seeds itself with random bytes, and Workers refuse to
// generate randomness while modules are still evaluating. Build the instance on
// first use — inside a request — rather than at module scope.
let honeypotInstance: Honeypot | undefined

export function getHoneypot() {
	honeypotInstance ??= new Honeypot({
		validFromFieldName: process.env.NODE_ENV === 'test' ? null : undefined,
		encryptionSeed: process.env.HONEYPOT_SECRET,
	})
	return honeypotInstance
}

export async function checkHoneypot(formData: FormData) {
	try {
		await getHoneypot().check(formData)
	} catch (error) {
		if (error instanceof SpamError) {
			throw new Response('Form not submitted properly', { status: 400 })
		}
		throw error
	}
}
