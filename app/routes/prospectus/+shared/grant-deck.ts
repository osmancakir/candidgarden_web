import {
	buildDeck,
	CONTACT_EMAIL,
	PILOT_CLIENT,
	type DeckFigures,
	type Slide,
} from './deck.ts'

/**
 * The funding pitch: the same offer, made to an institution that has to win the
 * money before it can spend it.
 *
 * In this market that is the commoner case and often the only one. The DFG's
 * `Digitalisierung und Erschließung` programme funds museums, libraries and
 * archives, takes applications at any time rather than in rounds, and — since it
 * was re-scoped — names automatic image recognition and Named-Entity Recognition
 * among the procedures it will pay for. A collection with no budget line is
 * still a customer if the application is winnable, and what makes it winnable is
 * evidence that exists before it is submitted.
 *
 * So the argument changes shape. The direct deck asks an institution to trust us
 * with its money; this one offers to be the part of its application that is
 * already built, already run once, and already documented. The audit stops being
 * the cheapest way in and becomes the feasibility study, which is the single most
 * useful thing anyone can hand a reviewer.
 *
 * ## On stating programme conditions
 *
 * This deck names what the programme's own published scope says and nothing
 * more. No volumes, no durations, no success rates, no review timelines — those
 * were not verified when it was written and a supplier who recites them is
 * claiming knowledge they do not have. The caveat is on the slide, with the date
 * of the reading, so a reader can tell how old our information is.
 */

/** The date this deck's reading of the programme's published scope was taken. */
const PROGRAMME_READ_ON = { de: 'August 2026', en: 'August 2026' }

/**
 * A slide shared verbatim with the direct pitch, taken from that deck rather
 * than copied into this one.
 *
 * Six slides make the same argument to both audiences — what already runs, the
 * scoreboard, the discarded metric, the uncertainty, the five things we need,
 * and what survives us. Copying their prose here would be the ordinary way to do
 * it and the wrong one: the two files would drift a phrase at a time, and a
 * figure corrected in one deck would go on being wrong in the other. Reusing the
 * object costs one throwaway array and guarantees they can never disagree.
 */
function shared(direct: Array<Slide>, id: string): Slide {
	const found = direct.find((slide) => slide.id === id)
	if (!found) throw new Error(`prospectus: no slide "${id}" available to share`)
	return found
}

export function buildGrantDeck(f: DeckFigures): Array<Slide> {
	const direct = buildDeck(f)

	return [
		{
			kind: 'title',
			id: 'title',
			eyebrow: {
				de: 'Institut für Kunst-Re-Search',
				en: 'Institute for Art Re-Search',
			},
			title: {
				de: 'Ein Arbeitspaket, das schon läuft',
				en: 'One work package already running',
			},
			lead: {
				de: 'Dieses Deck ist für ein Haus, das die Mittel erst einwerben muss. Candid Garden ist darin der technische Partner eines Erschließungsantrags — der Teil, der bereits gebaut, bereits einmal durchgeführt und bereits dokumentiert ist. Was ein Gutachter sonst als Absichtserklärung liest, liegt hier als Messung vor.',
				en: 'This deck is for an institution that has to win the funding first. Candid Garden is the technical partner in a cataloguing application — the part that is already built, already run once, already documented. What a reviewer usually reads as a statement of intent is here a measurement.',
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
					label: { de: 'Bezugsprogramm', en: 'Programme in view' },
					value: {
						de: 'DFG · Digitalisierung und Erschließung',
						en: 'DFG · Digitisation and Cataloguing',
					},
				},
			],
		},

		{
			kind: 'claim',
			id: 'the-window',
			eyebrow: { de: 'Die Lage', en: 'The situation' },
			title: {
				de: 'Der Förderer hat die Methode benannt',
				en: 'The funder has named the method',
			},
			statement: {
				de: 'Automatische Bilderkennung steht inzwischen im Programmtext selbst.',
				en: 'Automatic image recognition is now written into the programme text itself.',
			},
			body: [
				{
					de: 'Die DFG hat ihr Programm „Digitalisierung und Erschließung“ neu akzentuiert. Es nennt automatische Bilderkennung, Named-Entity-Recognition, OCR und OLR ausdrücklich unter den förderfähigen Verfahren. Was vor kurzem noch begründet werden musste, ist jetzt Teil der Ausschreibung.',
					en: 'The DFG has re-scoped its “Digitisation and Cataloguing” programme. It now names automatic image recognition, Named-Entity Recognition, OCR and OLR explicitly among the fundable procedures. What recently had to be argued for is now part of the programme text.',
				},
				{
					de: 'Anträge können jederzeit eingereicht werden — keine Frist, keine Runde. Der Engpass ist nicht der Kalender, sondern eine Methode, die sich vor einem Gutachter halten lässt.',
					en: 'Applications can be submitted at any time — no deadline, no round. The constraint is not the calendar; it is having a method that holds up in front of a reviewer.',
				},
				{
					de: 'Antragsberechtigt sind gemeinnützige Bibliotheken, Archive, Museen und Forschungssammlungen. Beantragt werden können Personalkosten, projektspezifische Sachkosten und Mittel für Workshops.',
					en: 'Eligible applicants are non-profit libraries, archives, museums and research collections. Personnel costs, project-specific material costs and workshop funds can all be applied for.',
				},
				{
					de: 'Und das Programm verlangt Qualitätskriterien dort, wo es keine etablierten Standards gibt. Für die ikonografische Erschließung von Werken auf Papier gibt es keine. Genau das ist der Punkt, an dem die meisten Anträge dünn werden.',
					en: 'And the programme asks for quality criteria where no established standard exists. For iconographic cataloguing of works on paper, none does. That is precisely where most applications go thin.',
				},
			],
			note: {
				de: `Stand dieser Lesung: ${PROGRAMME_READ_ON.de}. Volumina, Laufzeiten und Konditionen nennt dieses Deck bewusst nicht — die klärt die Programmberatung. Neben der DFG bestehen Landesprogramme und EU-Linien; welche passt, hängt am Bestand und am Träger.`,
				en: `This reading was taken in ${PROGRAMME_READ_ON.en}. This deck deliberately states no volumes, durations or conditions — those are a matter for the programme office. Beyond the DFG there are federal-state programmes and EU lines; which one fits depends on the collection and on who runs it.`,
			},
		},

		{
			kind: 'claim',
			id: 'the-gap',
			eyebrow: {
				de: 'Der Antragsgegenstand',
				en: 'What the application is about',
			},
			title: {
				de: 'Sie können den Zustand beziffern',
				en: 'You can put a number on the state of it',
			},
			statement: {
				de: 'Die Felder sind angelegt. Gefüllt sind sie nicht.',
				en: 'The fields exist. They are not filled.',
			},
			body: [
				{
					de: `In der Pilotsammlung tragen ${f.wellCatalogued.prints.toLocaleString('de-DE')} von ${f.corpus.prints.toLocaleString('de-DE')} Druckgrafiken fünf oder mehr Sachbegriffe; bei den Zeichnungen sind es ${f.wellCatalogued.drawings.toLocaleString('de-DE')} von ${f.corpus.drawings.toLocaleString('de-DE')}. ${f.fields.emptyInEveryRecord} der ${f.fields.requested} angefragten Felder sind in jedem einzelnen Datensatz leer.`,
					en: `In the pilot collection, ${f.wellCatalogued.prints.toLocaleString('en-US')} of ${f.corpus.prints.toLocaleString('en-US')} prints carry five or more thematic keywords; among the drawings it is ${f.wellCatalogued.drawings.toLocaleString('en-US')} of ${f.corpus.drawings.toLocaleString('en-US')}. ${f.fields.emptyInEveryRecord} of the ${f.fields.requested} requested fields are empty in every single record.`,
				},
				{
					de: 'Ein Erschließungsantrag steht und fällt mit einer belastbaren Beschreibung des Ist-Zustands. Die meisten beschreiben ihn in Adjektiven: lückenhaft, uneinheitlich, historisch gewachsen. Das ist nicht falsch, aber es ist nicht prüfbar.',
					en: 'A cataloguing application stands or falls on a defensible description of the current state. Most describe it in adjectives: patchy, inconsistent, historically grown. None of that is wrong, and none of it is checkable.',
				},
				{
					de: 'Diese Beschreibung besteht aus Zählungen. Sie sagt, welches Feld wie oft belegt ist, wo das vereinbarte Vokabular von der Datenbank abweicht und welche Kategorien per Definition leer sind, weil sie erst noch entstehen sollen.',
					en: 'This description consists of counts. It says which field is filled how often, where the agreed vocabulary diverges from the database, and which categories are empty by definition because they are the ones still to be created.',
				},
				{
					de: 'Der Unterschied ist nicht kosmetisch. Ein Gutachter, der einen Bedarf nachrechnen kann, muss ihn nicht glauben.',
					en: 'The difference is not cosmetic. A reviewer who can recompute a need does not have to take it on trust.',
				},
			],
		},

		{
			kind: 'claim',
			id: 'audit-as-feasibility',
			eyebrow: { de: 'Der Hebel', en: 'The lever' },
			title: {
				de: 'Die Bestandsprüfung ist Ihre Machbarkeitsstudie',
				en: 'The audit is your feasibility study',
			},
			statement: {
				de: 'Zwei Wochen Vorarbeit entscheiden über einen Antrag, der Jahre trägt.',
				en: 'Two weeks of preliminary work decide an application that carries for years.',
			},
			body: [
				{
					de: 'Ein Gutachter fragt drei Dinge: Wie ist der Ist-Zustand, taugt das Verfahren für dieses Material, und woran wird die Qualität gemessen? Alle drei lassen sich vorher beantworten, und zwar günstig.',
					en: 'A reviewer asks three things: what is the current state, is the procedure suited to this material, and how will quality be judged? All three are answerable in advance, and cheaply.',
				},
				{
					de: 'Die Bestandsprüfung liefert die Zahlen. Der Modellvergleich liefert den Methodennachweis und das Qualitätskriterium. Zusammen sind sie der empirische Kern des Antrags — geschrieben, bevor er eingereicht wird, statt in ihm versprochen.',
					en: 'The audit supplies the counts. The model comparison supplies the evidence of method and the quality criterion. Together they are the empirical core of the application — written before it is submitted rather than promised inside it.',
				},
				{
					de: 'Beide liegen unter den Schwellen, ab denen ausgeschrieben werden muss. Sie sind also direkt beauftragbar, aus laufenden Mitteln, ohne auf die Entscheidung zu warten, die sie stützen sollen.',
					en: 'Both sit below the thresholds at which a tender becomes necessary. They can be commissioned directly, from existing funds, without waiting for the decision they exist to support.',
				},
				{
					de: 'Und wenn der Antrag scheitert, halten Sie trotzdem eine gemessene Beschreibung Ihres eigenen Bestands in der Hand. Das ist kein Trostpreis. Es ist das, wovon alle angenommen hatten, Sie hätten es längst.',
					en: 'And if the application fails, you still hold a measured description of your own collection. That is not a consolation prize. It is the thing everybody had assumed you already had.',
				},
			],
		},

		shared(direct, 'what-exists'),
		shared(direct, 'the-pilot'),

		{
			kind: 'claim',
			id: 'quality-criteria',
			eyebrow: { de: 'Qualitätskriterien', en: 'Quality criteria' },
			title: {
				de: 'Der Teil, den die meisten Anträge offenlassen',
				en: 'The part most applications leave open',
			},
			statement: {
				de: 'Woran wollen Sie zeigen, dass das Ergebnis gut ist?',
				en: 'By what measure will you show the result is any good?',
			},
			body: [
				{
					de: 'Das Programm verlangt ausdrücklich, Qualitätskriterien zu entwickeln und anzuwenden, wo keine etablierten Standards bestehen. Für die ikonografische Erschließung von Druckgrafik und Zeichnung bestehen keine.',
					en: 'The programme explicitly asks for quality criteria to be developed and applied where no established standards exist. For iconographic cataloguing of prints and drawings, none exist.',
				},
				{
					de: `Die blinde Bewertung gegen das Werk selbst ist ein solches Kriterium: verdeckte Modellnamen, ein unbeteiligtes Richtermodell, getrennte Werte je Kategorie, über eine eingefrorene Stichprobe von ${f.sample.works} Blättern. Reproduzierbar, berichtsfähig — und bereits im Betrieb.`,
					en: `Blind evaluation against the artwork itself is such a criterion: model names hidden, an uninvolved judge, separate values per category, over a frozen sample of ${f.sample.works} sheets. Reproducible, reportable — and already running.`,
				},
				{
					de: 'Damit wird das Vorhaben ein methodischer Beitrag und nicht ein Einkauf. Das ist der Unterschied zwischen einem Dienstleistungsvertrag und etwas, das ein Gutachter fördern kann, ohne es rechtfertigen zu müssen.',
					en: 'That turns the undertaking into a methodological contribution rather than a purchase. It is the difference between a service contract and something a reviewer can fund without having to justify it.',
				},
				{
					de: 'Und es ist publizierbar. Nicht nur die Daten, auch das Bewertungsdesign ist ein Ergebnis, das Ihr Haus unter eigenem Namen veröffentlichen kann.',
					en: 'And it is publishable. Not only the data — the evaluation design is itself a result your institution can publish under its own name.',
				},
			],
		},

		shared(direct, 'the-discarded-metric'),
		shared(direct, 'uncertainty'),

		{
			kind: 'phases',
			id: 'work-packages',
			eyebrow: { de: 'Arbeitspakete', en: 'Work packages' },
			title: {
				de: 'Sechs Pakete, einzeln berichtsfähig',
				en: 'Six packages, each separately reportable',
			},
			lead: {
				de: 'Die Phasen sind so geschnitten, dass sie sich als Arbeitspakete in einen Antrag übernehmen lassen. Die ersten beiden laufen davor und tragen sich als Evidenz selbst; die übrigen laufen nach der Bewilligung.',
				en: 'The phases are cut so they transfer into an application as work packages. The first two run beforehand and pay for themselves as evidence; the rest run after the award.',
			},
			phases: [
				{
					n: '00',
					name: { de: 'Sichtung', en: 'Intake' },
					duration: { de: 'vor Antrag', en: 'pre-submission' },
					output: {
						de: 'Export, Bildzugang, Vokabular gesichtet',
						en: 'Export, image access and vocabulary reviewed',
					},
				},
				{
					n: '01',
					name: { de: 'Bestandsprüfung', en: 'Catalogue audit' },
					duration: { de: 'vor Antrag', en: 'pre-submission' },
					output: {
						de: 'Ist-Zustand in Zählungen — der Bedarfsnachweis',
						en: 'Current state in counts — the evidence of need',
					},
				},
				{
					n: '02',
					name: { de: 'Modellvergleich', en: 'Model comparison' },
					duration: {
						de: 'vor Antrag oder AP 1',
						en: 'pre-submission or WP 1',
					},
					output: {
						de: 'Methodennachweis und Qualitätskriterium',
						en: 'Evidence of method and the quality criterion',
					},
				},
				{
					n: '03',
					name: { de: 'Durchsicht', en: 'Curatorial review' },
					duration: { de: 'im Projekt', en: 'in project' },
					output: {
						de: 'Fachliche Abnahme im Haus, protokolliert',
						en: 'In-house scholarly sign-off, minuted',
					},
				},
				{
					n: '04',
					name: { de: 'Vollständiger Lauf', en: 'Full run' },
					duration: { de: 'im Projekt', en: 'in project' },
					output: {
						de: 'Der ganze Bestand, gestempelt und vorläufig',
						en: 'The whole collection, stamped and provisional',
					},
				},
				{
					n: '05',
					name: { de: 'Rückschreibung', en: 'Writeback' },
					duration: { de: 'im Projekt', en: 'in project' },
					output: {
						de: 'Import, Portalabgabe, Abschlussbericht',
						en: 'Import, delivery to portals, final report',
					},
				},
			],
		},

		{
			kind: 'checklist',
			id: 'roles',
			eyebrow: { de: 'Rollen', en: 'Roles' },
			title: { de: 'Wer was verantwortet', en: 'Who is responsible for what' },
			lead: {
				de: 'Ein Gutachter will das Haus als geistigen Träger sehen und den externen Partner als ausführende Stelle — nicht umgekehrt. Die Aufteilung unten ist genau so geschrieben, und sie ist keine Höflichkeit.',
				en: 'A reviewer wants to see the institution as intellectual lead and the external partner as the executing hand — not the reverse. The split below is written that way on purpose, and it is not a courtesy.',
			},
			items: [
				{
					label: { de: 'Ihr Haus', en: 'Your institution' },
					note: {
						de: 'Trägt das Vorhaben, entscheidet über das Vokabular, verantwortet die fachliche Abnahme und veröffentlicht unter eigenem Namen.',
						en: 'Holds the project, decides the vocabulary, owns the scholarly sign-off, and publishes under its own name.',
					},
				},
				{
					label: { de: 'Candid Garden', en: 'Candid Garden' },
					note: {
						de: 'Technische Durchführung: Pipeline, Bewertung, Erschließung, Lieferung. Projektspezifische Sachkosten, nicht geistige Leitung.',
						en: 'Technical execution: pipeline, evaluation, enrichment, delivery. Project-specific material costs, not intellectual lead.',
					},
				},
				{
					label: { de: 'Das Modell', en: 'The model' },
					note: {
						de: 'Ein Zulieferer, austauschbar, in jedem Datensatz mit Namen und Datum genannt. Kein Projektpartner und keine Autorität.',
						en: 'A supplier: interchangeable, named and dated in every record. Not a project partner and not an authority.',
					},
				},
				{
					label: { de: 'Die Durchsicht', en: 'The review' },
					note: {
						de: 'Bleibt im Haus. Sie ist der Teil, der sich nicht einkaufen lässt, und der Teil, nach dem ein Gutachter zuerst sucht.',
						en: 'Stays in-house. It is the part that cannot be bought in, and the first thing a reviewer looks for.',
					},
				},
				{
					label: { de: 'Die Ergebnisse', en: 'The results' },
					note: {
						de: 'Ihre. In Ihrem Schema, unter Ihren Feldnamen, veröffentlicht wo Sie es wollen — auch in den Fachportalen, die das Programm stärken will.',
						en: 'Yours. In your schema, under your field names, published where you choose — including the subject portals the programme wants strengthened.',
					},
				},
			],
		},

		shared(direct, 'what-we-need'),
		shared(direct, 'what-you-keep'),

		{
			kind: 'claim',
			id: 'costing',
			eyebrow: { de: 'Kalkulation', en: 'Costing' },
			title: {
				de: 'Was in den Antrag gehört',
				en: 'What belongs in the application',
			},
			statement: {
				de: 'Zwei Posten, sauber getrennt.',
				en: 'Two line items, cleanly separated.',
			},
			body: [
				{
					de: 'Unsere Arbeit sind projektspezifische Sachkosten: ein Festpreis je Arbeitspaket, in der Form belegbar, die der Antrag verlangt.',
					en: 'Our work is a project-specific material cost: a fixed price per work package, quotable in the form the application requires.',
				},
				{
					de: 'Die Rechenleistung wird gemessen und zum Einkaufspreis weitergereicht. Der Pilotlauf stellt die Token-Zahl je Werk und Modell fest, bevor der vollständige Lauf beginnt — die Zahl im Antrag ist also eine Messung und keine Schätzung. Das ist die Art Zahl, die eine Begutachtung übersteht.',
					en: 'Compute is measured and passed through at cost. The pilot establishes the token count per work per model before the full run begins — so the figure in the application is a measurement, not an estimate. That is the kind of number that survives review.',
				},
				{
					de: 'Die fachliche Durchsicht sind Ihre Personalkosten, und das soll sie auch sein. Ein Antrag, der diesen Teil auslagert, ist der schwächere.',
					en: 'The scholarly review is your personnel cost, and it should be. An application that outsources that part is the weaker one.',
				},
				{
					de: 'Programmvolumina und Laufzeiten nennen wir hier nicht. Die klären Sie mit der Programmberatung — und ein Anbieter, der behauptet, sie vorher zu kennen, erzählt Ihnen etwas, das er nicht wissen kann.',
					en: 'We do not state programme volumes or durations here. You settle those with the programme office — and a supplier claiming to know them in advance is telling you something they cannot know.',
				},
			],
		},

		{
			kind: 'close',
			id: 'close',
			eyebrow: { de: 'Nächster Schritt', en: 'Next step' },
			title: {
				de: 'Fangen Sie mit der Prüfung an',
				en: 'Start with the audit',
			},
			lead: {
				de: 'Vor dem Antrag, vor der Entscheidung, vor dem Budget: Zwei Wochen und ein Auszug aus Ihrem Bestand ergeben die Zahlen, die der Antrag braucht, und den Beleg, dass das Verfahren zu Ihrem Material passt. Kommt der Antrag nie zustande, wissen Sie trotzdem, was in Ihrer Sammlung steht.',
				en: 'Before the application, before the decision, before the budget: two weeks and an extract from your collection produce the counts the application needs and the evidence that the method fits your material. If the application never happens, you still know what is in your collection.',
			},
			lines: [
				{
					de: 'Das Archiv · candidgarden.com',
					en: 'The archive · candidgarden.com',
				},
				{
					de: 'Der Pilotbericht · auf Anfrage, mit benanntem Zugang',
					en: 'The pilot report · on request, by named account',
				},
				{
					de: 'DFG · Digitalisierung und Erschließung · Anträge jederzeit',
					en: 'DFG · Digitisation and Cataloguing · applications any time',
				},
			],
			email: CONTACT_EMAIL,
		},
	]
}
