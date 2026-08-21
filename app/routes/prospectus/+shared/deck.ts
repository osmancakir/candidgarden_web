/**
 * The prospectus deck: what Candid Garden sells, in the order it should be
 * heard, in two languages.
 *
 * All the copy lives here rather than in the renderers so that the person who
 * gives this talk can edit the argument without reading JSX. The renderers in
 * `slides.tsx` know about six shapes of slide and nothing about the pitch.
 *
 * German is the primary language: the leads are German-speaking collections,
 * the schema fields in every example are German, and a keyword list is not
 * something you translate for a Sammlungsleiter and hope. English is full
 * parity rather than a summary, because the same deck has to work in Vienna,
 * Amsterdam and Basel.
 *
 * Numbers are not written here. They arrive from `figures.server.ts`, derived
 * from the frozen pilot run, so a figure on a slide cannot drift away from the
 * report it was computed in.
 */

export type Lang = 'de' | 'en'

/** One string in both languages. Everything a reader sees is one of these. */
export type L = { de: string; en: string }

export function say(value: L, lang: Lang) {
	return value[lang]
}

export const LANGS: Array<{ id: Lang; short: string; full: L }> = [
	{ id: 'de', short: 'DE', full: { de: 'Deutsch', en: 'German' } },
	{ id: 'en', short: 'EN', full: { de: 'Englisch', en: 'English' } },
]

export const DEFAULT_LANG: Lang = 'de'

export function parseLang(value: string | null): Lang {
	return value === 'en' ? 'en' : DEFAULT_LANG
}

/**
 * Whether the pilot client may be named on a link that leaves the building.
 *
 * The pilot was run for one museum against their unpublished catalogue, and the
 * sharpest slide in this deck is a finding about how thinly that catalogue is
 * filled. That is entirely fair to say about *a* collection and not ours to say
 * about *theirs* until they agree to it. So the deck runs anonymised, and this
 * is the single line that changes once the client confirms in writing — every
 * figure stays exactly as it is either way.
 */
export const NAME_THE_PILOT_CLIENT = false

const CLIENT_NAMED: L = {
	de: 'Städel Museum · Graphische Sammlung',
	en: 'Städel Museum · Department of Prints and Drawings',
}

const CLIENT_ANONYMOUS: L = {
	de: 'Eine deutsche Graphische Sammlung',
	en: 'A German department of prints and drawings',
}

export const PILOT_CLIENT: L = NAME_THE_PILOT_CLIENT
	? CLIENT_NAMED
	: CLIENT_ANONYMOUS

/**
 * The archive's own figures, as published in the project README.
 *
 * Deliberately constants rather than a count query. This deck is opened in a
 * meeting room on someone else's wifi, and a presentation that shows an error
 * boundary because a database was unreachable has failed at the only moment it
 * had to work. The numbers move when the corpus is reingested, which is rarely
 * and never during a pitch.
 */
export const ARCHIVE = {
	works: 54_497,
	readings: 89_800,
	dimensions: 1_024,
	artistsReconciled: 5_371,
	artistsPercent: '77,7',
	worksPlaced: 27_186,
	worksPlacedPercent: '71,7',
	institutionRows: 956,
	/** Distinct free-text holder strings the 956 rows were resolved out of. */
	institutionStrings: 4_181,
	/** Index, atlas, drift: three ways into the same corpus. */
	publicSurfaces: 3,
	heldForReview: 773,
	atlasBytes: { de: '1,6 MB', en: '1.6 MB' } satisfies L,
	asOf: { de: 'Stand März 2026', en: 'As of March 2026' } satisfies L,
}

export const CONTACT_EMAIL = 'hey@candidgarden.com'

/* ==========================================================================
   Slide shapes.
   ========================================================================== */

type Base = {
	/** Stable, so a link to a slide survives reordering the deck. */
	id: string
	eyebrow: L
	title: L
}

export type Slide =
	| (Base & {
			kind: 'title'
			lead: L
			meta: Array<{ label: L; value: L }>
	  })
	| (Base & {
			kind: 'claim'
			statement: L
			figure?: { value: L; caption: L }
			body: Array<L>
			note?: L
	  })
	| (Base & { kind: 'scores'; lead: L; body: Array<L>; note: L })
	| (Base & {
			kind: 'capabilities'
			lead: L
			items: Array<{ value: L; label: L; note: L }>
	  })
	| (Base & {
			kind: 'service'
			number: string
			promise: L
			does: Array<L>
			delivers: Array<L>
			evidence: L
			duration: L
	  })
	| (Base & {
			kind: 'phases'
			lead: L
			phases: Array<{ n: string; name: L; duration: L; output: L }>
	  })
	| (Base & {
			kind: 'checklist'
			lead: L
			items: Array<{ label: L; note: L }>
	  })
	| (Base & { kind: 'close'; lead: L; lines: Array<L>; email: string })

/**
 * What the deck needs from the frozen run in order to state a number out loud.
 * Raw numbers, not formatted strings — the copy formats them per language,
 * because 5.17 is 5,17 in the room this deck is shown in.
 */
export type DeckFigures = {
	corpus: { works: number; prints: number; drawings: number }
	sample: { works: number; perMedium: number; maxPerArtist: number }
	calls: number
	providers: number
	iconography: { low: number; high: number }
	/** How many times the full corpus is the evaluation sample. */
	fullRunMultiple: number
	/** Records carrying five or more thematic keywords, per medium. */
	wellCatalogued: { prints: number; drawings: number }
	fields: { requested: number; emptyInEveryRecord: number }
	vocabulary: {
		unusedAgreedTerms: number
		commonestValue: string
		commonestValueCount: number
	}
}

/* ==========================================================================
   The deck.
   ========================================================================== */

const deNum = (n: number) => n.toLocaleString('de-DE')
const enNum = (n: number) => n.toLocaleString('en-US')
const deDec = (n: number) => n.toFixed(2).replace('.', ',')
const enDec = (n: number) => n.toFixed(2)

/**
 * The argument, in order.
 *
 * It opens on the prospect's problem rather than on us, spends three slides
 * earning the right to be believed, and only then names a price list. The two
 * slides in the middle — the metric we threw away, and the uncertainty we
 * print — are the ones doing the actual selling: everything else in this market
 * is a demo.
 */
export function buildDeck(f: DeckFigures): Array<Slide> {
	return [
		{
			kind: 'title',
			id: 'title',
			eyebrow: {
				de: 'Institut für Kunst-Re-Search',
				en: 'Institute for Art Re-Search',
			},
			title: {
				de: 'Maschinenlesungen, die ein Kurator prüfen kann',
				en: 'Machine readings a curator can check',
			},
			lead: {
				de: 'Candid Garden erschließt Sammlungen ikonografisch mit aktuellen Bildmodellen — und legt bei jedem Datensatz offen, welches Modell ihn wann erzeugt hat und wie sicher er ist. Was Sie bekommen, ist keine Blackbox mit einer Prozentzahl, sondern Material, das Ihre Fachleute korrigieren können.',
				en: 'Candid Garden catalogues collections iconographically using current vision models — and states, on every record, which model produced it, when, and how certain it is. What you get is not a black box with a percentage attached, but material your specialists can correct.',
			},
			meta: [
				{
					label: { de: 'Vorgelegt von', en: 'Presented by' },
					value: {
						de: 'Osman Cakir · Candid Garden',
						en: 'Osman Cakir · Candid Garden',
					},
				},
				{
					label: { de: 'Belegt durch', en: 'Evidenced by' },
					value: PILOT_CLIENT,
				},
				{
					label: { de: 'Archiv', en: 'Archive' },
					value: {
						de: `${deNum(ARCHIVE.works)} Werke, öffentlich einsehbar`,
						en: `${enNum(ARCHIVE.works)} works, publicly readable`,
					},
				},
			],
		},

		{
			kind: 'claim',
			id: 'the-empty-fields',
			eyebrow: { de: 'Das Problem', en: 'The problem' },
			title: {
				de: 'Was in Ihren Daten fehlt',
				en: 'What is missing from your records',
			},
			statement: {
				de: 'Die Felder sind angelegt. Gefüllt sind sie nicht.',
				en: 'The fields exist. They are not filled.',
			},
			body: [
				{
					de: `In der Pilotsammlung tragen ${deNum(f.wellCatalogued.prints)} von ${deNum(f.corpus.prints)} Druckgrafiken fünf oder mehr Sachbegriffe. Bei den Zeichnungen sind es ${deNum(f.wellCatalogued.drawings)} von ${deNum(f.corpus.drawings)}.`,
					en: `In the pilot collection, ${enNum(f.wellCatalogued.prints)} of ${enNum(f.corpus.prints)} prints carry five or more thematic keywords. Among the drawings it is ${enNum(f.wellCatalogued.drawings)} of ${enNum(f.corpus.drawings)}.`,
				},
				{
					de: `${f.fields.emptyInEveryRecord} der ${f.fields.requested} angefragten Felder — Assoziation, Atmosphäre, Emotion — sind in jedem einzelnen Datensatz leer. Das ist kein Versäumnis. Es sind genau die Kategorien, die ergänzt werden sollen.`,
					en: `${f.fields.emptyInEveryRecord} of the ${f.fields.requested} requested fields — association, atmosphere, emotion — are empty in every single record. That is not negligence. Those are precisely the categories the work is meant to add.`,
				},
				{
					de: 'Ein so erschlossener Bestand lässt sich durchsuchen, wenn man weiß, wonach man sucht. Befragen lässt er sich nicht.',
					en: 'A collection catalogued that way can be searched by anyone who already knows what they are looking for. It cannot be questioned.',
				},
			],
			note: {
				de: 'Gezählt, nicht geschätzt — aus dem vollständigen Export der Sammlung.',
				en: 'Counted, not estimated — from the collection’s complete export.',
			},
		},

		{
			kind: 'claim',
			id: 'model-choice',
			eyebrow: {
				de: 'Warum nicht einfach ein KI-Produkt',
				en: 'Why not simply buy an AI product',
			},
			title: {
				de: 'Die eine Zahl, die sich nicht raten lässt',
				en: 'The one number nobody can guess',
			},
			statement: {
				de: 'Zwischen dem besten und dem schwächsten Modell liegen vier Punkte.',
				en: 'Four points separate the best model from the weakest.',
			},
			figure: {
				value: {
					de: `${deDec(f.iconography.low)} – ${deDec(f.iconography.high)}`,
					en: `${enDec(f.iconography.low)} – ${enDec(f.iconography.high)}`,
				},
				caption: {
					de: `Ikonografie-Score von zehn · ${f.providers} aktuelle Modelle · dieselben ${f.sample.works} Blätter`,
					en: `Iconography score out of ten · ${f.providers} current models · the same ${f.sample.works} sheets`,
				},
			},
			body: [
				{
					de: 'Die Benchmarks der Anbieter laufen auf Fotografien und Gemälden. Ihr Bestand ist Grafik, oft vor 1800, katalogisiert auf Deutsch, in Ihrem Vokabular.',
					en: 'Vendor benchmarks are run on photographs and paintings. Your holdings are works on paper, often pre-1800, catalogued in German, in your own vocabulary.',
				},
				{
					de: 'Welches Modell das leistet, entscheidet sich an Ihrem Material — nicht an einer Rangliste, die jemand anderes veröffentlicht hat, und nicht an dem Anbieter, mit dem Ihr Haus ohnehin einen Vertrag hat.',
					en: 'Which model can do that is settled by your material — not by a leaderboard somebody else published, and not by whichever vendor your institution already has a contract with.',
				},
				{
					de: 'Vier Punkte Abstand heißen nicht, dass die Modellwahl das Projekt wäre. Sie heißen, dass sie die einzige Größe ist, die sich von außen nicht abschätzen lässt — und dass vier Wochen Messung sie klären, wo Vermutungen es nicht tun.',
					en: 'A four-point spread does not mean model choice is the project. It means it is the one quantity that cannot be estimated from outside — and that four weeks of measurement settle it where assumptions do not.',
				},
				{
					de: 'Das Projekt fängt danach an: beim Vokabular, bei der Durchsicht, bei der Frage, was überhaupt gemessen werden soll. Das Modell ist austauschbar. Diese Entscheidungen sind es nicht.',
					en: 'The project begins after that: at the vocabulary, at the review, at the question of what should be measured at all. The model is replaceable. Those decisions are not.',
				},
			],
		},

		{
			kind: 'capabilities',
			id: 'what-exists',
			eyebrow: { de: 'Was bereits fertig ist', en: 'What is already finished' },
			title: {
				de: 'Eine Sammlung, ganz durchgearbeitet',
				en: 'One collection, taken the whole way',
			},
			lead: {
				de: 'Der schwierige Teil ist nicht der Anfang. Pilotprojekte über fünfhundert Datensätze gibt es überall; sie enden dort, wo die Arbeit anfängt. Dieser Bestand ist fertig, öffentlich und im Betrieb — jede Zahl unten ist eine Adresse, die Sie aufrufen können.',
				en: 'The hard part is not starting. Pilots on five hundred records are everywhere; they stop where the work begins. This corpus is finished, public and in service — every figure below is an address you can open.',
			},
			items: [
				{
					value: { de: deNum(ARCHIVE.works), en: enNum(ARCHIVE.works) },
					label: { de: 'Werke erschlossen', en: 'Works catalogued' },
					note: {
						de: 'Vom Rohdatensatz bis zum einzeln zitierbaren Eintrag',
						en: 'From raw dataset to individually citable record',
					},
				},
				{
					value: { de: deNum(ARCHIVE.readings), en: enNum(ARCHIVE.readings) },
					label: { de: 'Deutungen geschrieben', en: 'Readings written' },
					note: {
						de: 'Zwei Panofsky-Ebenen, jede mit Modell und Datum gestempelt',
						en: 'Two Panofsky levels, each stamped with model and date',
					},
				},
				{
					value: {
						de: deNum(ARCHIVE.artistsReconciled),
						en: enNum(ARCHIVE.artistsReconciled),
					},
					label: {
						de: 'Künstler eindeutig identifiziert',
						en: 'Artists unambiguously identified',
					},
					note: {
						de: `${ARCHIVE.artistsPercent} % — der Rest wurde zurückgehalten, nicht geraten`,
						en: `${ARCHIVE.artistsPercent.replace(',', '.')}% — the remainder was held back, not guessed`,
					},
				},
				{
					value: {
						de: deNum(ARCHIVE.worksPlaced),
						en: enNum(ARCHIVE.worksPlaced),
					},
					label: {
						de: 'Werke einem Haus zugeordnet',
						en: 'Works placed with a holder',
					},
					note: {
						de: `Aus ${deNum(ARCHIVE.institutionStrings)} uneinheitlichen Freitextnamen`,
						en: `Out of ${enNum(ARCHIVE.institutionStrings)} inconsistent free-text names`,
					},
				},
				{
					// The one figure on this slide that is a zero, and the one that
					// makes the other five believable: nothing here is inflated,
					// because the field that would inflate it is empty on purpose.
					value: { de: '0', en: '0' },
					label: {
						de: 'Datensätze als geprüft ausgegeben',
						en: 'Records presented as verified',
					},
					note: {
						de: 'Das Feld bleibt leer, bis ein Mensch es füllt',
						en: 'The field stays empty until a person fills it',
					},
				},
				{
					value: {
						de: deNum(ARCHIVE.publicSurfaces),
						en: enNum(ARCHIVE.publicSurfaces),
					},
					label: {
						de: 'Zugänge zum selben Bestand',
						en: 'Ways into the same corpus',
					},
					note: {
						de: 'Index, Atlas, Drift — Liste, Karte, Instrument',
						en: 'Index, atlas, drift — list, map, instrument',
					},
				},
			],
		},

		{
			kind: 'scores',
			id: 'the-pilot',
			eyebrow: { de: 'Der Pilotlauf', en: 'The pilot run' },
			title: {
				de: 'Fünf Modelle, blind bewertet',
				en: 'Five models, judged blind',
			},
			lead: {
				de: `Eine eingefrorene Stichprobe von ${deNum(f.sample.works)} Blättern — ${f.sample.perMedium} Druckgrafiken, ${f.sample.perMedium} Zeichnungen, höchstens ${f.sample.maxPerArtist} Werke je Künstler, damit kein Name die Auswahl bestimmt. ${deNum(f.calls)} Modellaufrufe über beide Aufgaben.`,
				en: `A frozen sample of ${enNum(f.sample.works)} sheets — ${f.sample.perMedium} prints, ${f.sample.perMedium} drawings, capped at ${f.sample.maxPerArtist} works per artist so no single name decides the sample. ${enNum(f.calls)} model calls across both tasks.`,
			},
			body: [
				{
					de: 'Bewertet wurde gegen das Werk selbst, nicht gegen den Katalog, mit verdeckten Modellnamen — das Richtermodell konnte nicht erkennen, wessen Ausgabe es liest.',
					en: 'Scoring was against the artwork itself rather than the catalogue, with model names hidden — the judge could not tell whose output it was reading.',
				},
				{
					de: 'Die Ikonografie trennt die Modelle. Atmosphäre und Emotion liegen bei allen zwischen 8 und 9 und sagen bei dieser Stichprobengröße wenig aus. Auch das steht so im Bericht.',
					en: 'Iconography is what separates the models. Atmosphere and emotion sit between 8 and 9 for everyone and, at this sample size, say very little. The report says so too.',
				},
			],
			note: {
				de: 'Rangfolge vorläufig · das Richtermodell stand selbst im Wettbewerb · Nachbewertung ausstehend',
				en: 'Ranking provisional · the judge was itself a contestant · re-score pending',
			},
		},

		{
			kind: 'claim',
			id: 'the-discarded-metric',
			eyebrow: { de: 'Wie wir arbeiten', en: 'How we work' },
			title: { de: 'Die verworfene Kennzahl', en: 'The metric we threw away' },
			statement: {
				de: 'Wir haben die Kennzahl verworfen, um die man uns gebeten hatte — und gesagt, warum.',
				en: 'We discarded the metric we had been asked for — and said why.',
			},
			body: [
				{
					de: 'Das Briefing verlangte einen Abgleich der Modellausgabe gegen die vorhandenen Katalogdaten. Wir haben ihn gebaut, ausgeführt und anschließend aus der Bewertung genommen.',
					en: 'The briefing asked for the model output to be scored against the existing catalogue records. We built it, ran it, and then took it out of the evaluation.',
				},
				{
					de: 'Auf dünn erschlossenen Datensätzen misst diese Kennzahl den Katalog, nicht das Modell. Wo vier Begriffe hinterlegt sind, das Modell alle vier findet und fünfundsechzig weitere nennt, liest sich das als sechs Prozent Präzision.',
					en: 'On thinly catalogued records that metric measures the catalogue, not the model. Where four keywords are on file, the model finds all four and adds sixty-five more, it reads as six per cent precision.',
				},
				{
					de: 'Über den ganzen Lauf gerechnet sortiert sie die Modelle fast exakt umgekehrt zu ihrer Ausführlichkeit: Das knappste Modell gewinnt.',
					en: 'Run across the whole roster it ranks the models almost exactly inversely to how much they write: the tersest model comes first.',
				},
				{
					de: 'Ein Anbieter optimiert die Zahl, an der er gemessen wird. Wir haben stattdessen berichtet, dass die Zahl das Falsche misst — und einen Vergleich vorgelegt, den Ihre Fachleute mit eigenen Augen prüfen können.',
					en: 'A vendor optimises the number it is graded on. We reported instead that the number was measuring the wrong thing — and delivered a comparison your specialists can check with their own eyes.',
				},
			],
		},

		{
			kind: 'claim',
			id: 'uncertainty',
			eyebrow: { de: 'Wie wir arbeiten', en: 'How we work' },
			title: { de: 'Unsicherheit ist Inhalt', en: 'Uncertainty is content' },
			statement: {
				de: 'Unsicherheit ist Inhalt, nicht Kleingedrucktes.',
				en: 'Uncertainty is content, not small print.',
			},
			body: [
				{
					de: 'Im Pilotbericht steht, dass das Richtermodell selbst im Wettbewerb stand und sein Vorsprung kleiner ist als die Selbstbevorzugung, die ihn erklären könnte. Die Rangfolge ist als vorläufig gestempelt, und die Nachbewertung läuft.',
					en: 'The pilot report states that the judge was itself one of the contestants and that its margin is smaller than the self-preference which could explain it. The ranking is stamped provisional, and the re-score is under way.',
				},
				{
					de: 'Jeder Datensatz trägt Modell und Laufdatum. In drei Jahren ist noch nachvollziehbar, welche Maschine was gesehen hat — und der Bestand wird zum historischen Dokument darüber, wie Modelle Bilder gelesen haben.',
					en: 'Every record carries its model and its run date. In three years it will still be traceable which machine saw what — and the collection becomes a historical record of how models read pictures.',
				},
				{
					de: 'Nichts wird als geprüft ausgegeben, was niemand geprüft hat. Das Feld für die menschliche Bestätigung bleibt leer, bis ein Mensch sie erteilt.',
					en: 'Nothing is presented as verified that nobody verified. The human-confirmation field stays empty until a person fills it.',
				},
				{
					de: 'Das ist keine Bescheidenheit. Es ist die einzige Form, in der maschinelle Metadaten überhaupt in einen wissenschaftlichen Katalog dürfen.',
					en: 'This is not modesty. It is the only form in which machine metadata can enter a scholarly catalogue at all.',
				},
			],
		},

		{
			kind: 'service',
			id: 'service-audit',
			number: '01',
			eyebrow: { de: 'Leistung 01', en: 'Service 01' },
			title: { de: 'Bestandsprüfung', en: 'Catalogue audit' },
			promise: {
				de: 'Bevor irgendetwas erzeugt wird: Was steht eigentlich in Ihren Daten?',
				en: 'Before anything is generated: what do your records actually contain?',
			},
			does: [
				{
					de: 'Füllgrad je Feld über den gesamten Bestand — gezählt, nicht hochgerechnet.',
					en: 'Fill rate per field across the whole collection — counted, not extrapolated.',
				},
				{
					de: 'Abgleich des vereinbarten Vokabulars mit dem, was die Datenbank tatsächlich enthält.',
					en: 'Reconciliation of the agreed vocabulary against what the database actually holds.',
				},
				{
					de: 'Feststellung, welche Felder messbar sind und welche per Definition leer bleiben.',
					en: 'A determination of which fields are measurable and which stay empty by design.',
				},
			],
			delivers: [
				{
					de: 'Einen Bericht je Feld, mit Zählungen.',
					en: 'A report per field, with counts.',
				},
				{
					de: 'Eine Vokabularliste mit begründeten Abweichungsvorschlägen.',
					en: 'A vocabulary list with reasoned proposals where it diverges.',
				},
				{
					de: 'Eine schriftliche Aussage darüber, was sich evaluieren lässt und was nicht.',
					en: 'A written statement of what can be evaluated and what cannot.',
				},
			],
			evidence: {
				de: `Im Pilotprojekt tauchten ${f.vocabulary.unusedAgreedTerms} Begriffe der vereinbarten Liste im Bestand kein einziges Mal auf — während der häufigste Wert der Sammlung, ${f.vocabulary.commonestValue} mit ${deNum(f.vocabulary.commonestValueCount)} Datensätzen, auf dieser Liste überhaupt nicht stand.`,
				en: `In the pilot, ${f.vocabulary.unusedAgreedTerms} terms from the agreed list appeared not once in the holdings — while the commonest value in the collection, ${f.vocabulary.commonestValue} with ${enNum(f.vocabulary.commonestValueCount)} records, was absent from that list altogether.`,
			},
			duration: { de: '1–2 Wochen', en: '1–2 weeks' },
		},

		{
			kind: 'service',
			id: 'service-pilot',
			number: '02',
			eyebrow: { de: 'Leistung 02', en: 'Service 02' },
			title: { de: 'Modellvergleich', en: 'Evaluation pilot' },
			promise: {
				de: 'Die aktuellen Bildmodelle aller großen Anbieter, auf Ihren eigenen Blättern, blind bewertet.',
				en: 'The current vision models from every major provider, on your own sheets, judged blind.',
			},
			does: [
				{
					de: 'Eine eingefrorene Stichprobe aus Ihrem Bestand, je Künstler begrenzt, damit kein Name die Auswahl dominiert.',
					en: 'A frozen sample from your collection, capped per artist so no single name dominates it.',
				},
				{
					de: 'Je ein aktuelles Modell pro Anbieter, auf beiden Aufgaben: Verschlagwortung und Beschreibung.',
					en: 'One current model per provider, across both tasks: keywording and description.',
				},
				{
					de: 'Bewertung gegen das Werk selbst, mit verdeckten Modellnamen und vollständig offengelegtem Prompt.',
					en: 'Scoring against the artwork itself, with model names hidden and the prompt disclosed in full.',
				},
			],
			delivers: [
				{
					de: 'Eine Rangliste je Gattung und Kategorie, mit ihrer eigenen Unsicherheit im Text.',
					en: 'A ranking per medium and category, with its own uncertainty stated in the text.',
				},
				{
					de: 'Einen zugangsbeschränkten Arbeitsbereich: jedes Blatt, jedes Modell, jeder Prompt — jede Gegenüberstellung als zitierbarer Link.',
					en: 'A restricted working area: every sheet, every model, every prompt — each comparison a citable link.',
				},
				{
					de: 'Die Token-Abrechnung je Modell, also die Kosten des vollständigen Laufs, vor der Entscheidung.',
					en: 'Token accounting per model — the cost of the full run, before you commit to it.',
				},
			],
			evidence: {
				de: `${deNum(f.calls)} Modellaufrufe, ${f.sample.works} Blätter, zwei Gattungen, ${f.providers} Anbieter. Bereits ausgeliefert.`,
				en: `${enNum(f.calls)} model calls, ${f.sample.works} sheets, two media, ${f.providers} providers. Already delivered.`,
			},
			duration: { de: '3–4 Wochen', en: '3–4 weeks' },
		},

		{
			kind: 'service',
			id: 'service-enrichment',
			number: '03',
			eyebrow: { de: 'Leistung 03', en: 'Service 03' },
			title: {
				de: 'Erschließung und Rückschreibung',
				en: 'Enrichment and writeback',
			},
			promise: {
				de: 'Der gesamte Bestand durch das gewählte Modell — in Ihrem Schema, nicht in unserem.',
				en: 'The whole collection through the chosen model — in your schema, not ours.',
			},
			does: [
				{
					de: 'Ikonografische Verschlagwortung auf Ihren Feldnamen. Ikon.Hauptmotiv.allgemein bleibt Ikon.Hauptmotiv.allgemein.',
					en: 'Iconographic keywording on your own field names. Ikon.Hauptmotiv.allgemein stays Ikon.Hauptmotiv.allgemein.',
				},
				{
					de: 'Beschreibungen zweisprachig, je in einer langen und einer kurzen Fassung.',
					en: 'Bilingual descriptions, each in a long and a short version.',
				},
				{
					de: 'Kontrollierte Vokabulare werden eingehalten. Abweichungen werden vorgelegt, nicht stillschweigend vorgenommen.',
					en: 'Controlled vocabularies are honoured. Departures are put to you, never made quietly.',
				},
			],
			delivers: [
				{
					de: 'UTF-8-CSV mit Semikolon als Trennzeichen, dazu die getrennte Schlagwort- und Typenliste.',
					en: 'UTF-8 CSV with semicolon delimiter, plus the separate keyword-and-type list.',
				},
				{
					de: 'Import nach Axiell, MuseumPlus oder was bei Ihnen läuft.',
					en: 'Import into Axiell, MuseumPlus, or whatever you run.',
				},
				{
					de: 'Jeder Datensatz gestempelt mit Modell und Laufdatum, jeder als vorläufig gekennzeichnet.',
					en: 'Every record stamped with model and run date, every one marked provisional.',
				},
			],
			evidence: {
				de: `Der Pilotbestand umfasst ${deNum(f.corpus.works)} Blätter, rund das ${f.fullRunMultiple}-Fache der Stichprobe. Der Aufwand ist vorher bekannt, weil der Pilotlauf ihn gemessen hat.`,
				en: `The pilot collection is ${enNum(f.corpus.works)} sheets, roughly ${f.fullRunMultiple}× the sample. The effort is known in advance because the pilot measured it.`,
			},
			duration: { de: 'nach Bestandsgröße', en: 'scales with the collection' },
		},

		{
			kind: 'service',
			id: 'service-access',
			number: '04',
			eyebrow: { de: 'Leistung 04', en: 'Service 04' },
			title: {
				de: 'Suche, Identifikatoren, Publikumsflächen',
				en: 'Search, identifiers, public surfaces',
			},
			promise: {
				de: 'Erschlossene Daten, die man auch benutzen kann — von innen und von außen.',
				en: 'Catalogued data somebody can actually use — from inside the house and from outside it.',
			},
			does: [
				{
					de: `Semantische Suche: Anfragen werden eingebettet und gegen ${deNum(ARCHIVE.dimensions)}-dimensionale Vektoren in PostgreSQL mit pgvector gerankt. Gefunden wird nach Bedeutung, nicht nach Zeichenkette.`,
					en: `Semantic search: queries are embedded and ranked against ${enNum(ARCHIVE.dimensions)}-dimensional vectors in PostgreSQL with pgvector. Retrieval is by meaning, not by string match.`,
				},
				{
					de: 'Wikidata-Abgleich für Künstler, Werke und besitzende Institutionen. Mehrdeutigkeit wird zurückgehalten, nicht geraten.',
					en: 'Wikidata reconciliation for artists, works and holding institutions. Ambiguity is held back, never guessed.',
				},
				{
					de: `Publikumsflächen: der Atlas als begehbarer Bestandsraum — ${deNum(ARCHIVE.readings)} Punkte in ${ARCHIVE.atlasBytes.de} im Browser — und der Drift als Instrument, das den Besucher aufzeichnet statt das Werk.`,
					en: `Public surfaces: the atlas as a collection space you can walk — ${enNum(ARCHIVE.readings)} points in ${ARCHIVE.atlasBytes.en} in the browser — and the drift as an instrument that records the visitor rather than the work.`,
				},
			],
			delivers: [
				{
					de: 'Lauffähige Suche über Ihrem Bestand — auf Ihrer Infrastruktur oder auf unserer.',
					en: 'Working search over your collection — on your infrastructure or on ours.',
				},
				{
					de: 'QIDs in Ihren Daten, jede Zuordnung einzeln nachprüfbar und einzeln widerrufbar.',
					en: 'QIDs in your records, every assignment individually checkable and individually revocable.',
				},
				{
					de: 'Eine öffentliche Fläche, die Ihre Sammlung nicht als Trefferliste zeigt.',
					en: 'A public surface that does not present your collection as a list of search results.',
				},
			],
			evidence: {
				de: `${deNum(ARCHIVE.institutionRows)} Institutionszeilen, jede mit QID; ${deNum(ARCHIVE.heldForReview)} mehrdeutige Zeichenketten zur Prüfung zurückgehalten, statt sie zu raten.`,
				en: `${enNum(ARCHIVE.institutionRows)} institution rows, every one with a QID; ${enNum(ARCHIVE.heldForReview)} ambiguous strings held for review rather than guessed.`,
			},
			duration: {
				de: 'modular beauftragbar',
				en: 'commissioned module by module',
			},
		},

		{
			kind: 'phases',
			id: 'engagement',
			eyebrow: { de: 'Ablauf', en: 'How an engagement runs' },
			title: {
				de: 'Sechs Schritte, einzeln abnehmbar',
				en: 'Six steps, each signed off on its own',
			},
			lead: {
				de: 'Jede Phase wird einzeln beauftragt und einzeln abgenommen. Nach jeder können Sie aufhören und behalten, was bis dahin entstanden ist.',
				en: 'Each phase is commissioned and signed off separately. You can stop after any of them and keep what has been produced.',
			},
			phases: [
				{
					n: '01',
					name: { de: 'Sichtung', en: 'Intake' },
					duration: { de: '1 Woche', en: '1 week' },
					output: {
						de: 'Export, Bildzugang und Vokabular liegen vor',
						en: 'Export, image access and vocabulary in hand',
					},
				},
				{
					n: '02',
					name: { de: 'Bestandsprüfung', en: 'Catalogue audit' },
					duration: { de: '1–2 Wochen', en: '1–2 weeks' },
					output: {
						de: 'Bericht darüber, was messbar ist',
						en: 'A report on what is measurable',
					},
				},
				{
					n: '03',
					name: { de: 'Modellvergleich', en: 'Evaluation pilot' },
					duration: { de: '3–4 Wochen', en: '3–4 weeks' },
					output: {
						de: 'Rangliste plus begehbarer Arbeitsbereich',
						en: 'Ranking plus a working area to read',
					},
				},
				{
					n: '04',
					name: { de: 'Durchsicht', en: 'Curatorial review' },
					duration: { de: '2 Wochen', en: '2 weeks' },
					output: {
						de: 'Ihre Anmerkungen, Blatt für Blatt',
						en: 'Your notes, sheet by sheet',
					},
				},
				{
					n: '05',
					name: { de: 'Vollständiger Lauf', en: 'Full run' },
					duration: { de: 'nach Umfang', en: 'scales with size' },
					output: {
						de: 'Der ganze Bestand durch das gewählte Modell',
						en: 'The whole collection through the chosen model',
					},
				},
				{
					n: '06',
					name: { de: 'Rückschreibung', en: 'Writeback' },
					duration: { de: '1–2 Wochen', en: '1–2 weeks' },
					output: { de: 'CSV, Import, Abnahme', en: 'CSV, import, sign-off' },
				},
			],
		},

		{
			kind: 'checklist',
			id: 'what-we-need',
			eyebrow: { de: 'Von Ihrer Seite', en: 'From your side' },
			title: { de: 'Was wir brauchen', en: 'What we need' },
			lead: {
				de: 'Fünf Dinge. Keines davon muss vollständig oder aufgeräumt sein — den Zustand Ihrer Daten messen wir ohnehin, das ist die erste Leistung.',
				en: 'Five things. None of them has to be complete or tidy — we measure the state of your data anyway, that is the first service.',
			},
			items: [
				{
					label: { de: 'Einen Export', en: 'An export' },
					note: {
						de: 'Werkdaten in beliebigem tabellarischem Format. Lücken sind kein Hindernis, sondern Befund.',
						en: 'Object records in any tabular format. Gaps are not an obstacle, they are a finding.',
					},
				},
				{
					label: { de: 'Bildzugang', en: 'Image access' },
					note: {
						de: 'IIIF, ein S3-Bucket oder eine Festplatte. Auflösung ist wichtiger als Vollständigkeit.',
						en: 'IIIF, an S3 bucket, or a hard drive. Resolution matters more than completeness.',
					},
				},
				{
					label: { de: 'Ihr Vokabular', en: 'Your vocabulary' },
					note: {
						de: 'Die kontrollierten Listen, so wie sie gelten. Weichen sie von der Datenbank ab, finden wir das heraus und sagen es.',
						en: 'The controlled lists as they officially stand. Where they diverge from the database, we find out and say so.',
					},
				},
				{
					label: {
						de: 'Eine Handvoll Beispieltexte',
						en: 'A handful of example texts',
					},
					note: {
						de: 'Sechs bis zehn veröffentlichte Texte zu Werken derselben Gattung. Ein Gemäldetext bringt dem Modell bei, über Farbe und Oberfläche zu schreiben — bei Druckgrafik hilft das nicht.',
						en: 'Six to ten published texts on works in the same medium. A painting text teaches the model to write about colour and surface, which does not transfer to works on paper.',
					},
				},
				{
					label: {
						de: 'Einen benannten Ansprechpartner',
						en: 'One named contact',
					},
					note: {
						de: 'Eine Person, die entscheiden darf, ob ein Schlagwort durchgeht. Ihre Stunden sind der Teil des Projekts, der sich nicht einkaufen lässt — und genau dort entsteht der Unterschied zwischen erzeugten Daten und einem Katalog, den Ihr Haus vertreten kann.',
						en: 'A person permitted to decide whether a keyword passes. Their hours are the part of the project that cannot be bought in — and that is exactly where generated data turns into a catalogue your institution can stand behind.',
					},
				},
			],
		},

		{
			kind: 'claim',
			id: 'what-you-keep',
			eyebrow: { de: 'Was bleibt', en: 'What remains' },
			title: {
				de: 'Die Modelle sind Verbrauchsmaterial',
				en: 'The models are consumables',
			},
			statement: {
				de: 'Wenn wir morgen verschwinden, verlieren Sie nichts.',
				en: 'If we disappear tomorrow, you lose nothing.',
			},
			body: [
				{
					de: 'Das Modell, das Ihren Bestand erschließt, wird in zwei Jahren abgekündigt sein. Der Anbieter wird die Preise ändern. Das Feld bewegt sich schneller weiter, als eine Ausschreibung dauert. Nichts davon ist ein Risiko, solange das Ergebnis nicht am Anbieter hängt.',
					en: 'The model that catalogues your collection will be deprecated within two years. The provider will change its prices. The field moves on faster than a procurement cycle takes. None of that is a risk so long as the result does not hang on the provider.',
				},
				{
					de: 'Deshalb ist das Ergebnis eine Datei in Ihrem Schema, unter Ihren Feldnamen, in Ihrem System — und jeder Datensatz trägt das Modell und das Datum, unter dem er entstanden ist. Wird in fünf Jahren neu gerechnet, bleibt nachvollziehbar, was ersetzt wird und was stehen bleibt.',
					en: 'So the result is a file in your schema, under your field names, in your system — and every record carries the model and the date it was made under. When it is re-run in five years, it stays traceable what is replaced and what stands.',
				},
				{
					de: 'Es gibt kein Portal, in dem Ihre Daten wohnen, keinen Zugang, den wir abschalten können, und keine Suche, die aufhört zu funktionieren, weil eine Rechnung offen ist.',
					en: 'There is no portal your data lives in, no access we can switch off, and no search that stops working because an invoice is outstanding.',
				},
				{
					de: 'Was Sie einkaufen, ist keine Software. Es ist die Entscheidung, was gemessen wird, das Vokabular, in dem es geschrieben steht, und die Durchsicht, die es in Ihren Katalog lässt. Das ist auch der Teil, den niemand als Produkt verkaufen kann.',
					en: 'What you are buying is not software. It is the decision about what gets measured, the vocabulary it is written in, and the review that lets it into your catalogue. That is also the part nobody can sell you as a product.',
				},
			],
			note: {
				de: 'Der einzige Posten mit Laufzeit ist die Rechenleistung — und die wird zum Einkaufspreis weitergereicht.',
				en: 'The only line item with a term attached is the compute — and that is passed through at cost.',
			},
		},

		{
			kind: 'claim',
			id: 'cost',
			eyebrow: { de: 'Konditionen', en: 'Terms' },
			title: { de: 'Was es kostet', en: 'What it costs' },
			statement: {
				de: 'Feste Preise je Phase. Rechenkosten zum Einkaufspreis.',
				en: 'Fixed price per phase. Compute passed through at cost.',
			},
			body: [
				{
					de: 'Die Modellkosten werden gemessen und ohne Aufschlag weitergereicht. Aus dem Pilotlauf ist die Token-Zahl je Werk und Modell bekannt, bevor der vollständige Lauf beginnt — der größte Posten des Projekts ist also derjenige, den Sie vorher genau kennen.',
					en: 'Model costs are measured and passed through without markup. The pilot establishes the token count per work per model before the full run starts — so the largest line item is the one you know exactly in advance.',
				},
				{
					de: 'Keine Lizenz pro Arbeitsplatz, keine Mindestlaufzeit, kein Speicherzwang. Das Ergebnis ist eine Datei in Ihrem System und gehört Ihnen.',
					en: 'No per-seat licence, no minimum term, no hosting lock-in. The result is a file in your system and it is yours.',
				},
				{
					de: 'Was ein konkreter Bestand kostet, hängt an drei Zahlen: Werke, Felder, Sprachen. Die klären wir im ersten Gespräch — und das kostet nichts.',
					en: 'What a specific collection costs turns on three numbers: works, fields, languages. We settle those in the first conversation — and that conversation is free.',
				},
			],
			note: {
				de: 'Öffentliche Häuser: Die Phasen sind so geschnitten, dass jede für sich unter einer Vergabegrenze bleiben kann.',
				en: 'For public institutions: the phases are cut so each can sit below a procurement threshold on its own.',
			},
		},

		{
			kind: 'close',
			id: 'close',
			eyebrow: { de: 'Nächster Schritt', en: 'Next step' },
			title: {
				de: 'Schicken Sie uns tausend Zeilen',
				en: 'Send us a thousand rows',
			},
			lead: {
				de: 'Ein Auszug aus Ihrem Bestand und eine Handvoll Bilder genügen, um zu zeigen, was an Ihrem eigenen Material herauskommt. Danach entscheiden Sie, ob es etwas taugt.',
				en: 'An extract from your collection and a handful of images are enough to show what comes out on your own material. After that you decide whether it is worth anything.',
			},
			lines: [
				{
					de: 'Das Archiv · candidgarden.com',
					en: 'The archive · candidgarden.com',
				},
				{
					de: 'Der Atlas · candidgarden.com/archive/atlas',
					en: 'The Atlas · candidgarden.com/archive/atlas',
				},
				{
					de: 'Der Drift · candidgarden.com/archive/drift',
					en: 'The Drift · candidgarden.com/archive/drift',
				},
			],
			email: CONTACT_EMAIL,
		},
	]
}
