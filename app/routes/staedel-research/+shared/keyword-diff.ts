import {
	TAG_SECTIONS,
	type FlagCheck,
	type KeywordFlag,
	type TagField,
	type TagRecord,
} from './schema.ts'

/**
 * One sheet's keywords, round against round, value by value.
 *
 * Most of what the museum asked for in its notes on round 2 is a value that
 * should leave a field ("Flusslandschaft" from Geografie), leave the record
 * ("Elefant als Sinnbild der Keuschheit"), or change field ("Christenverfolgung"
 * from Ikon.Thema to Assoziation.Thema). Two full records side by side make a
 * curator find each of those by eye among a hundred values; a diff says it
 * directly. A value is identified by field, group type and text, so a move
 * between axes of Ikon.Thema reads as a move too.
 *
 * Pure and client-safe: the loader computes it, the page only renders it.
 */

export type DiffStatus =
	/** In both rounds, in the same place. */
	| 'kept'
	/** New in the later round. */
	| 'added'
	/** Gone from the later round altogether. */
	| 'removed'
	/** New here, and gone from where the earlier round had it. */
	| 'movedIn'
	/** Gone from here, because the later round put it elsewhere. */
	| 'movedOut'

export type DiffValue = {
	value: string
	status: DiffStatus
	/** For a move: where the value came from, or where it went. */
	elsewhere?: string
	/** The rule checks that flag this value, in the round it belongs to. */
	flags: Array<FlagCheck>
}

export type DiffGroup = { type: string | null; values: Array<DiffValue> }

export type DiffField = {
	field: TagField
	groups: Array<DiffGroup>
	counts: Record<DiffStatus, number>
}

export type KeywordDiff = {
	fields: Array<DiffField>
	totals: Record<DiffStatus, number>
	flagsBefore: number
	flagsAfter: number
}

type Entry = { field: TagField; type: string | null; value: string }

const FIELD_ORDER = TAG_SECTIONS.flatMap((s) => s.fields)

function entriesOf(record: TagRecord): Array<Entry> {
	const out: Array<Entry> = []
	for (const field of FIELD_ORDER) {
		const value = record[field]
		if (!value) continue
		if (value.kind === 'flat') {
			for (const v of value.values) out.push({ field, type: null, value: v })
		} else {
			for (const group of value.groups) {
				for (const v of group.values) {
					out.push({ field, type: group.type, value: v })
				}
			}
		}
	}
	return out
}

const norm = (value: string) => value.trim().toLowerCase()
const placeKey = (e: Pick<Entry, 'field' | 'type'>) =>
	`${e.field}\u0000${e.type ?? ''}`
const entryKey = (e: Entry) => `${placeKey(e)}\u0000${norm(e.value)}`

/** "Ikon.Thema · Geschichte", or just the axis when the field is the same. */
function describePlace(place: Entry, relativeTo: TagField) {
	if (place.field === relativeTo && place.type) return place.type
	return place.type ? `${place.field} · ${place.type}` : place.field
}

function flagIndex(flags: Array<KeywordFlag>) {
	const index = new Map<string, Array<FlagCheck>>()
	for (const flag of flags) {
		const key = entryKey(flag)
		index.set(key, [...(index.get(key) ?? []), flag.check])
	}
	return index
}

const zero = (): Record<DiffStatus, number> => ({
	kept: 0,
	added: 0,
	removed: 0,
	movedIn: 0,
	movedOut: 0,
})

export function diffKeywords(
	before: { fields: TagRecord; flags: Array<KeywordFlag> },
	after: { fields: TagRecord; flags: Array<KeywordFlag> },
): KeywordDiff {
	const beforeEntries = entriesOf(before.fields)
	const afterEntries = entriesOf(after.fields)
	const beforeKeys = new Set(beforeEntries.map(entryKey))
	const afterKeys = new Set(afterEntries.map(entryKey))
	const beforeFlags = flagIndex(before.flags)
	const afterFlags = flagIndex(after.flags)

	/** Where each value text sits in a round, for spotting moves. */
	const placesOf = (entries: Array<Entry>) => {
		const map = new Map<string, Array<Entry>>()
		for (const e of entries) {
			map.set(norm(e.value), [...(map.get(norm(e.value)) ?? []), e])
		}
		return map
	}
	const beforePlaces = placesOf(beforeEntries)
	const afterPlaces = placesOf(afterEntries)

	/** field → group type → values, keeping first-seen order. */
	const layout = new Map<TagField, Map<string | null, Array<DiffValue>>>()
	const push = (e: Entry, value: DiffValue) => {
		const groups = layout.get(e.field) ?? new Map()
		layout.set(e.field, groups)
		groups.set(e.type, [...(groups.get(e.type) ?? []), value])
	}

	// The later round first, in its own order: it is what would be delivered.
	const seen = new Set<string>()
	for (const e of afterEntries) {
		const key = entryKey(e)
		if (seen.has(key)) continue
		seen.add(key)
		const flags = afterFlags.get(key) ?? []
		if (beforeKeys.has(key)) {
			push(e, { value: e.value, status: 'kept', flags })
			continue
		}
		// A move: the earlier round had this value somewhere this round no
		// longer does. If it still sits in its old place too, it is simply new.
		const vacated = (beforePlaces.get(norm(e.value)) ?? []).find(
			(old) => !afterKeys.has(entryKey(old)),
		)
		push(
			e,
			vacated
				? {
						value: e.value,
						status: 'movedIn',
						elsewhere: describePlace(vacated, e.field),
						flags,
					}
				: { value: e.value, status: 'added', flags },
		)
	}

	// Then what the earlier round had and this one dropped, where it used to sit.
	for (const e of beforeEntries) {
		const key = entryKey(e)
		if (afterKeys.has(key) || seen.has(key)) continue
		seen.add(key)
		const flags = beforeFlags.get(key) ?? []
		const destination = (afterPlaces.get(norm(e.value)) ?? []).find(
			(now) => !beforeKeys.has(entryKey(now)),
		)
		push(
			e,
			destination
				? {
						value: e.value,
						status: 'movedOut',
						elsewhere: describePlace(destination, e.field),
						flags,
					}
				: { value: e.value, status: 'removed', flags },
		)
	}

	const totals = zero()
	const fields: Array<DiffField> = FIELD_ORDER.filter((f) => layout.has(f)).map(
		(field) => {
			const counts = zero()
			const groups = [...layout.get(field)!].map(([type, values]) => {
				for (const v of values) {
					counts[v.status] += 1
					totals[v.status] += 1
				}
				return { type, values }
			})
			return { field, groups, counts }
		},
	)

	return {
		fields,
		totals,
		flagsBefore: before.flags.length,
		flagsAfter: after.flags.length,
	}
}
