# Candid Garden — Brand & Design Document

**Working title of the direction: "The Institute and the Dark Room"** A fusion
of CARI (cari.institute) and Net Art Anthology (anthology.rhizome.org), applied
to an AI-iconography research project.

_This document describes the direction and, from §3 onward, how it is built in
this app: React Router v7 on the Epic Stack, Tailwind v4 (CSS-first, no
`tailwind.config.js`), Prisma/PostgreSQL, deployed to Cloudflare Workers. Where
the design as first written collided with the stack or with its own
accessibility floor, the collision and its resolution are recorded rather than
quietly smoothed over._

---

## 1. Premise

Candid Garden is a research project: AI-generated iconographic metadata for
~66,000 artworks from the ARTigo dataset, structured by Panofsky's three levels
of meaning. The redesign should make the site _feel_ like what it is — a
fictional-but-serious research institution with an archive attached — rather
than a portfolio piece or a SaaS landing page.

The two source sites contribute two distinct registers:

**From CARI:** the institute-as-brand. CARI presents itself as a "Consumer
Aesthetics Research Institute" — a deadpan institutional fiction, complete with
an FAQ, a glossary, attribution guidelines, a team page, and a taxonomic index
you query through a filter console (keyword, earliest known example, end of
popularity, relevant decade). The interface is deliberately utilitarian,
web-vernacular, paper-colored, almost bureaucratic. The taxonomy _is_ the
design.

**From Net Art Anthology:** the archive as monument. Black background, enormous
display type, a chronology broken into chapters, every entry stamped with an
archival date (MM/DD/YY), artist names set in caps, editorial deep-dives per
work, and an obsessive preservation/provenance ethos ("identifying, preserving,
and presenting" works that would otherwise vanish). Plus wit in the
infrastructure: print the page and you get ASCII art telling you the internet is
for surfing.

**The fusion:** Candid Garden's front-of-house is the Institute (CARI register —
light, tabular, taxonomic, deadpan). Its depths are the Dark Room (Anthology
register — black, monumental, editorial). And the transition between them is not
arbitrary: it maps onto Panofsky.

---

## 2. The Signature: The Panofsky Descent

This is the one element the site should be remembered by. Every artwork dossier
is structured as a literal descent through Panofsky's three levels, and the
page's visual register darkens as interpretive depth increases:

**Level I — Pre-iconographic (paper).** Factual description, formal elements,
AI-detected motifs. Set in the Institute register: paper background, tabular
data, serif body, metadata chips. This is inventory. It looks like inventory.

**Level II — Iconographic (grey).** Subjects, allegories, conventional meanings.
The background deepens to a mid archival grey; type gets larger; the filter
chips give way to running editorial prose with citations. This is
identification. It looks like a catalogue entry.

**Level III — Iconological (black).** Intrinsic meaning, cultural context, the
AI's interpretive synthesis — and, importantly, its uncertainty. Full Anthology
register: near-black ground, monumental display caps, generous leading, images
full-bleed. This is interpretation. It looks like an exhibition.

Implemented as three stacked page sections with background transitions on scroll
(CSS only, simple section backgrounds — no JS scroll-jacking). On the index/list
pages, the three levels also function as a visual legend: works can be browsed
"at Level I" (data table), "at Level II" (card grid), "at Level III"
(single-work editorial features).

Spend all boldness here. Everything else stays quiet.

**The descent and the theme toggle.** The app keeps a light/dark preference,
which appears to collide with a design where dark _means_ depth. It does not,
because the descent is defined **relative to the resting ground** rather than
absolutely: it always travels the full distance away from wherever the reader
started.

| Theme                  | Level I | Level II | Level III |
| ---------------------- | ------- | -------- | --------- |
| light (rests on paper) | paper   | slate    | void      |
| dark (rests on void)   | void    | slate    | paper     |

Level II is `slate` in both directions — it is the hinge, and it is the only
part of the descent that does not move. The claim the design makes is not
"deeper is darker" but "deeper is further from where you began", which survives
the inversion intact. The toggle in the masthead names the ground rather than
showing a sun or a moon (`GROUND PAPER` / `GROUND VOID` / `GROUND AUTO`) — it is
the one control that says the vocabulary out loud.

---

## 3. Color

Two grounds, one accent, one stamp.

| Token         | Hex       | Role                                                                                                              |
| ------------- | --------- | ----------------------------------------------------------------------------------------------------------------- |
| `paper`       | `#F2F0EB` | Institute ground (Level I). Warm archival off-white — closer to acid-free folder stock than to cream.             |
| `slate`       | `#8C8C88` | Transitional ground (Level II) and secondary text on paper.                                                       |
| `void`        | `#0D0D0D` | Dark Room ground (Level III), footer, and full-bleed image sections. Not pure black — near-black, like Anthology. |
| `ink`         | `#1A1A1A` | Body text on paper.                                                                                               |
| `bone`        | `#E8E5DE` | Body text on void.                                                                                                |
| `ultramarine` | `#1F00E0` | The single accent. Links, active filters, timestamps, the logo mark.                                              |
| `stamp`       | `#9E2B25` | Used _only_ for provenance stamps (see §6). Never for UI chrome.                                                  |

**Why ultramarine.** It does double duty in a way no other color can for this
project: it is the default hyperlink blue of the early web — the exact
vernacular CARI and net art both canonize — and it is simultaneously the most
storied pigment in art history, the lapis-lazuli blue reserved for the Virgin's
robe. One hex value that belongs equally to Panofsky and to Netscape. Use it
sparingly and it never stops being ultramarine; use it everywhere and it becomes
a tech brand.

**Why a separate stamp red.** Print rooms and provenance archives mark ownership
with red collection stamps (Lugt numbers). Candid Garden borrows this: the dull
sealing-wax red appears only on provenance elements — model attribution, dataset
citation, human-verification marks. It is a mark applied _to_ the archive, not
part of the interface.

**Three of these pairings fail the accessibility floor in §8, and the build
corrects them.** Measured against WCAG 2.1:

| Pairing                      | Ratio   | Verdict   |
| ---------------------------- | ------- | --------- |
| `ink` on `paper`             | 15.28:1 | AAA       |
| `bone` on `void`             | 15.45:1 | AAA       |
| `ink` on `slate`             | 5.16:1  | AA        |
| `ultramarine` on `paper`     | 8.64:1  | AAA       |
| `slate` as _text_ on `paper` | 2.96:1  | **fails** |
| `ultramarine` on `void`      | 1.98:1  | **fails** |
| `stamp` on `void`            | 2.62:1  | **fails** |

So the palette gains three register-relative relatives. They are the same hues
raised into legibility, not new colours, and they are only ever used on the
ground that requires them:

| Token        | Hex       | Ratio           | Role                                                                   |
| ------------ | --------- | --------------- | ---------------------------------------------------------------------- |
| `ultra-lift` | `#8B87FF` | 6.49:1 on void  | Links and focus rings on the void ground.                              |
| `stamp-lift` | `#D97A73` | 6.46:1 on void  | Provenance marks on the void ground.                                   |
| `slate-ink`  | `#5F5C57` | 5.84:1 on paper | Secondary _text_ on paper. `slate` remains the Level II _ground_ only. |
| `slate-bone` | `#A8A49C` | 7.83:1 on void  | Secondary text on void.                                                |

The rule that follows: **`slate` is a ground, never a text colour**, and the
accent you write is `--link`, never a literal hex — the register decides which
ultramarine you get.

Because the Level II ground is `slate`, it always carries **ink**, never bone
(bone on slate is 2.68:1). The descent therefore reads ink-on-paper →
ink-on-slate → bone-on-void, which darkens the ground while keeping every step
legible.

---

## 4. Typography

Three faces, three jobs, mirroring the two registers plus the data layer beneath
both.

**Display — condensed grotesque, all caps.** The Anthology voice. Used for
artwork titles at Level III, chapter/section headers, and the wordmark. Free
option: _Archivo Black_ or _Anton_; if licensing a face, something in the
Founders Grotesk Condensed / Druk family. Tracking slightly tight, size
unapologetically large (clamp from 2.5rem to 7rem). Titles may break mid-word
like Anthology's headlines — the break is a feature.

**Body — Times, unapologetically.** The CARI voice. The body face is the system
Times stack: `"Times New Roman", Times, Tinos, serif`. This is a deliberate
vernacular move, not a shortcut: the un-webfonted institutional serif _is_ the
early-web research-institute aesthetic both source sites trade on, it costs zero
bytes, and against disciplined spacing it reads as a choice. Set at
1.06–1.125rem with generous measure (65–72ch) and 1.6 leading so it reads as
edited prose, not default prose.

**Data — monospace.** For everything the machine says: metadata chips,
confidence scores, timestamps, model identifiers, the filter console, table
cells. `"IBM Plex Mono", "JetBrains Mono", ui-monospace, monospace`. Small
(0.8125rem), often uppercase with wide tracking for labels. The monospace layer
is also the ASCII-art layer (see §8).

The type system encodes the epistemology: grotesque caps = curatorial assertion,
Times = scholarly prose, mono = machine output. A reader should be able to tell
_who is speaking_ — curator, scholar, or model — from the typeface alone.

**Hosting.** The CSP built in `app/entry.server.tsx` sets `font-src 'self'`, so
no external font host is reachable. Archivo Black and IBM Plex Mono are
self-hosted as woff2 under `public/fonts/` (latin + latin-ext, ~116 KB total;
latin-ext carries the German diacritics §7 requires) and declared in
`app/styles/fonts.css`. The body face costs nothing, which is the point. A
metric-matched `Display Fallback` face keeps the `font-display: swap` from
reflowing headlines.

---

## 5. Layout & Structure

**The index is the homepage.** Like CARI's aesthetics index, Candid Garden opens
not with a hero image but with the archive itself: a filter console above a
dense, scannable index of works. Filters worthy of the ARTigo material: motif
keyword, iconographic subject (Iconclass-style), period, medium,
model-confidence range, verification status. Filters are visible form elements
in the mono face — a console, not a hamburger. A one-paragraph institutional
statement in Times sits above it, CARI-style, and that is the entire "hero."

**Chapters, but by meaning rather than time.** Anthology's chronological
chapters become Candid Garden's three Panofsky levels as global sections, with
an optional fourth — _Reprise_ — for essays, methodology, and corrections,
mirroring Anthology's Chapter 5 that revisited gaps in the canon.

**Every entry is timestamped.** Anthology stamps each work with its
re-presentation date. Candid Garden stamps each metadata record with its
generation date and model: `03/14/26 · claude-sonnet-4-6 · run 118`. In an
AI-metadata project this is not decoration — it is scientific provenance, and it
ages into a historical record of what models saw in pictures and when.

**Grid discipline.** 12-column grid, zero border-radius throughout, hairline
rules (`1px solid` ink at 20% opacity on paper; bone at 20% on void). Tables are
real `<table>` elements and are allowed to look like tables. Images are never
cropped to decorative aspect ratios; artworks display at their true proportions
on generous ground.

Wireframe of a work dossier:

```
┌──────────────────────────────────────────────┐
│ CANDID GARDEN · INSTITUTE FOR MACHINE        │  paper · mono nav
│ ICONOGRAPHY              INDEX  ESSAYS  ABOUT│
├──────────────────────────────────────────────┤
│ [artwork, true ratio, on paper]              │
│ LEVEL I · PRE-ICONOGRAPHIC        03/14/26   │
│ table: motifs · formal elements · palette    │
│ chips: [garden] [putto] [drapery] 0.87       │
├──────────────────────────────────────────────┤  ← ground: slate
│ LEVEL II · ICONOGRAPHIC                      │
│ Times prose, 68ch, citations, Iconclass refs │
├──────────────────────────────────────────────┤  ← ground: void
│ LEVEL III                                    │
│ ICONOLOGICAL READING                         │  grotesque, huge, bone
│ editorial synthesis · model uncertainty      │
│ ▣ stamp: dataset · model · human-verified    │
└──────────────────────────────────────────────┘
```

---

## 6. Components

**Metadata chips.** Mono, uppercase, paper chips with hairline borders on Level
I; each chip carries its confidence score as a superscript. Clicking a chip
pivots into the index filtered by that motif — the CARI move of
taxonomy-as-navigation.

**The provenance stamp.** A bordered mono block in `stamp` red, visually
referencing a collection stamp: dataset source, model + version, run date,
human-verification status. Appears once per dossier and in essay footers. This
is the project's trust mark and its most direct nod to print-room culture —
appropriate for a project born from print-graphics metadata work.

**The filter console.** CARI's search-and-filter block elevated to a designed
object: labeled fieldsets, native selects styled minimally, a visible "Reset
filters" text button. It should feel like laboratory equipment, not e-commerce
faceting.

**Editorial cards (Level II browse mode).** Image at true ratio, title in
grotesque caps at modest size, artist/date in Times italic, timestamp in mono.
On `void` sections, cards lose borders entirely — images float on black,
Anthology-style.

**Uncertainty as content.** Where the model's reading is contested or
low-confidence, say so in the interface's own voice, prominently, in mono:
`MODEL CONFIDENCE LOW · READING CONTESTED · 2 HUMAN ANNOTATIONS DISAGREE`. Both
source sites derive credibility from candor about their own limits (CARI's
attribution ethics, Anthology's restoration notes); for an AI project this
candor is the brand.

---

## 7. Voice & Tone

Deadpan institutional, first-person plural, quietly witty. CARI's register ("We
hope that you will participate with us in researching…") crossed with
Anthology's curatorial confidence. Concretely: the site never says "AI-powered
insights"; it says "machine-generated iconographic metadata, presented for
scholarly correction." Errors and gaps are stated plainly. The About page is
written as an institute charter — mission, definitions ("Candid Garden defines a
motif as…"), selection criteria, and an open invitation to dispute readings,
directly echoing both sites' definition/criteria sections.

German/English parity from day one; the institutional register translates
naturally into German administrative prose, which is half the joke and all of
the credibility.

---

## 8. Details, Wit, and Infrastructure

The print stylesheet is an easter egg: printing any page yields the Candid
Garden wordmark in ASCII plus the line _"Iconology is for reading, not
printing."_ — a direct homage to Anthology's `NO CARRIER` print sheet. It is
built as a hidden `PrintColophon` element in `root.tsx` that `@media print`
reveals while hiding every sibling, so the ASCII stays readable in source rather
than being escaped into a CSS `content` string. A `/glossary` page (CARI)
defines the project's terms, including Panofsky's, in plain language. A visible
`humans.txt`-style colophon credits dataset, models, typefaces, and advisors,
mirroring Anthology's exhaustive staff/advisor credits. The 404 page shows a
randomly selected artwork at Level I only, captioned `INTERPRETATION NOT FOUND`.

**Motion:** almost none. The section-ground transition on the Panofsky descent
is the only animated moment; everything else is instant.
`prefers-reduced-motion` collapses even that to hard cuts. Hover states are
ultramarine underlines and nothing else.

> **Build note.** Stripping the enter/exit animations from the Radix menus has a
> consequence worth knowing: a `DropdownMenuItem` wrapping a submit button used
> to stay mounted for the length of its exit animation, which is what let the
> click reach the form. With no animation the menu unmounts immediately and the
> submit is lost. Any menu item that submits must therefore submit by ref
> (`onSelect` → `preventDefault` → `form.requestSubmit()`) rather than relying
> on presence timing. `user-dropdown.tsx` does this.

**Accessibility floor:** contrast AA at minimum on both grounds (bone on void
and ink on paper both clear AAA for body sizes — see the measured table in §3,
including the three pairings that fail as literally specified), visible focus
rings in ultramarine, all filter controls native and keyboard-operable, artwork
alt text drawn from the Level I metadata itself — the archive describing itself
is the point.

Two rules the terseness of the machine voice keeps threatening:

- **A link must state its own purpose.** The mono register tempts you to label a
  settings action `CHANGE`; out of context that fails WCAG 2.4.4. Write
  `CHANGE EMAIL`. Terse is not the same as truncated.
- **One `<main>` per page.** Only `root.tsx` owns the landmark; route layouts
  use `<div>`.

Decorative plates take `alt=""` and `aria-hidden`; a portrait on its owner's
record does not — it is content.

---

## 9. Implementation — Tailwind v4, CSS-first

This app is on **Tailwind v4**, which has no `tailwind.config.js`. The theme is
declared in CSS, in `app/styles/tailwind.css`, and the system has three layers.

**1. The raw palette** — seven fixed hexes plus the four lifted relatives from
§3. These never change meaning.

**2. Registers** — `paper`, `slate` and `void` are grounds a section declares
for itself. Declaring one rebinds the semantic variables, so anything nested
inside is correct on that ground without being told which ground it is on:

```css
.register-void {
	--ground: var(--void);
	--ground-fg: var(--bone);
	--link: var(--ultra-lift); /* the accessible ultramarine */
	--stamp-fg: var(--stamp-lift);
	--rule: color-mix(in oklab, var(--bone) 20%, transparent);
	background-color: var(--void);
	color: var(--bone);
}
```

`.register-level-1/2/3` are the same mechanism applied relative to the resting
ground (see §2).

**3. The theme bridge.** Every register also rebinds the shadcn variable names
(`--background`, `--primary`, `--border`, `--ring`, …). This is what makes the
stock Epic Stack primitives — dropdown menu, sonner, checkbox, input-otp —
correct inside a `void` section without any of them being rewritten to know
about registers.

```css
@theme inline {
	--color-ground: var(--ground); /* bg-ground, text-ground */
	--color-ground-fg: var(--ground-fg);
	--color-ground-muted: var(--ground-muted);
	--color-link: var(--link); /* text-link */
	--color-stamp-fg: var(--stamp-fg);
	--color-rule: var(--rule); /* border-rule — the hairline */
	--color-tint: var(--tint);
	/* radius is zeroed globally, so `rounded-md` compiles to 0 */
	--radius-sm: 0;
	--radius-md: 0;
	--radius-lg: 0;
	--radius-xl: 0;
}

@theme {
	--font-display: 'Archivo Black', 'Display Fallback', Impact, sans-serif;
	--font-body: 'Times New Roman', Times, Tinos, serif;
	--font-data: 'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace;
	--font-sans: var(--font-body); /* bare `font-sans` lands in the brand */
	--font-mono: var(--font-data);

	--text-display: clamp(2.5rem, 9vw, 7rem);
	--text-chapter: clamp(1.75rem, 4.5vw, 3.25rem);
	--text-title: clamp(1.25rem, 2.4vw, 1.875rem);
	--text-prose: 1.0625rem; /* §4: 1.06–1.125rem */
	--text-data: 0.8125rem;
	--container-measure: 68ch; /* §4: 65–72ch */
}
```

**Authoring conventions.**

- Write **register-relative** classes (`bg-ground`, `text-ground-fg`,
  `text-ground-muted`, `text-link`, `border-rule`), not literal colours. A
  component written this way is automatically correct on all three grounds.
  Reach for `bg-paper` / `text-ink` only when a thing must be one specific
  ground regardless of context.
- `border-rule` _is_ the hairline — it already carries the 20% opacity from §5,
  so write `border border-rule`, not `border-ink/20`.
- Radius is zero everywhere by construction; you cannot accidentally round
  something. `rounded-full` is deliberately preserved for the one case that
  needs it (the progress bar).
- `.measure` sets the reading column; `.label-data` and `.heading-display` are
  the two type shorthands.

### Component vocabulary

The §6 components live in `app/components/institute/`:

| File             | Contents                                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| `primitives.tsx` | `Data`, `Display`, `Chip`, `RecordStamp`, `ProvenanceStamp`, `UncertaintyNotice`, `LoadingRecords`, `NoRecords` |
| `descent.tsx`    | `Level`, `MonumentalTitle`, `LevelLegend`, and the `PANOFSKY` table                                             |
| `console.tsx`    | `FilterConsole`, `ConsoleField`, `ConsoleSelect`, `ConsoleInput`                                                |
| `record.tsx`     | `Plate`, `RecordRow` (Level I), `EditorialCard` (Level II), `FeaturePlate` (Level III)                          |
| `chrome.tsx`     | `Wordmark`, `InstituteNav`, `Colophon`, `PrintColophon`                                                         |
| `document.tsx`   | `DocumentPage`, `DocumentSection`, `Glossary`, `Ledger`, `LedgerRow`, `PanelHeading`                            |
| `access.tsx`     | `AccessPage`, `AccessDivider` — the authentication surfaces                                                     |

Archival conventions (the `MM/DD/YY` stamp, period formatting, agreement bands,
the uncertainty sentence) are centralised in `app/utils/archive.ts` so a date
stamped on an index row is byte-identical to the same date on a dossier.

---

## 9b. Route map

The index **is** the homepage (§5): `/` and `/archive` render the same view from
one implementation in `app/routes/archive/+shared/`. Filter state lives entirely
in the URL, so any view of the archive is citable, works without JavaScript, and
degrades to a plain GET form.

| Route                             | Register                      | Notes                                                                 |
| --------------------------------- | ----------------------------- | --------------------------------------------------------------------- |
| `/`, `/archive`                   | paper (level 3 flips to void) | Statement, filter console, records at the chosen level                |
| `/archive/:id`                    | **the descent**               | The signature. Paper → slate → void                                   |
| `/about`                          | paper                         | Institute charter (§7)                                                |
| `/glossary`                       | paper                         | §8, with the German original per term                                 |
| `/essays`                         | paper                         | The _Reprise_ chapter (§5) — methodology and the corrections register |
| `/privacy`, `/tos`, `/support`    | paper                         | Notice, attribution ethics, and the invitation to dispute             |
| `/login`, `/signup`, `/verify`, … | paper                         | `AccessPage` — no centred product card                                |
| `/settings/profile/*`             | paper                         | `Ledger` rows; the archive files its users like its works             |
| `/users`, `/users/:username`      | paper                         | The contributor register                                              |
| `*` (404)                         | paper                         | §8: a real work at Level I, captioned `INTERPRETATION NOT FOUND`      |

**One route group is not part of the archive.** `/stadel-research/*` is an
unlisted working area holding a single dated deliverable for the Städel Museum's
Graphische Sammlung: the pilot report, the generated keywords, the generated
descriptions, and the model evaluation. It is written in the Institute register
because that is the house style, but it declares no register of its own — it
rests on the reader's ground and every class beneath it is register-relative, so
`GROUND VOID` carries it exactly as `GROUND PAPER` does. The one raised voice is
the evaluation leaderboard, which takes `register-level-3` rather than
`register-void` so it inverts with the theme like the rest of the descent (§2).

It touches no Prisma model. The pages are pure functions of a frozen experiment
committed under `app/data/stadel-research/` (regenerated by
`npm run stadel:data` from the research repo), with the 40 plates in S3 under
`stadel-research/` (`npm run stadel:images`). Selection lives entirely in the
URL, so any comparison is a citable link. The routes carry `noindex, nofollow`
in their own meta and `robots.txt` disallows the prefix; they are absent from
`InstituteNav` and from the sitemap.

**Data mapping.** The archive is built on the Prisma models the app already
carries. `Resource` is a work; `Artist` and `Institution` supply attribution;
`Tagging.frequency` gives per-work motif weight; `Tag.category` gives the
subject classes at Level II; `Tag.human` vs `Tag.aiGpt4o` give the corpus-wide
crowd/model split; `WikiDataVerification.status` drives the attribution filter
and the stamp's human-check line.

**Agreement is not confidence.** The superscript on a chip is
`Tagging.frequency` normalised against the strongest tagging on that work. It is
an observed agreement rate, not a model probability, and §6's candour requires
the interface to keep saying so — in the glossary, in the charter, and in the
caption above the chips themselves.

**Levels II and III hold no prose, and say so.** The corpus carries motif
annotations and nothing else. Rather than generate fluent filler for the two
interpretive levels, those sections render their structure and state plainly
that no reading is on record. Per §7 this is the honest state of the archive,
and per §6 the candour is the brand.

---

## 10. What to Refuse

To keep the fusion honest, the redesign explicitly avoids: rounded cards and
drop shadows; gradient accents; a marketing hero with a screenshot;
skeleton-shimmer loaders (use mono `LOADING RECORDS…` text); carousel
components; more than one accent color; cropping artworks to fill layouts; and
any copy that sells rather than states. Both source sites earn trust by looking
like they were built for the work rather than for conversion — that restraint is
the brand.

---

## 11. Known gaps

Stated plainly, per §7.

- **German parity is not delivered.** The glossary gives each term its German
  original and the institutional register was written to translate cleanly, but
  there is no i18n layer and `<html lang>` is hard-coded to `en`. §7 asks for
  parity from day one; this is the largest outstanding debt.
- **Levels II and III hold no curated prose** because the corpus holds no
  interpretive text. The sections render their structure and disclose the
  absence. Populating them means adding storage for readings — with model, run
  and verification status per reading, so the stamp keeps meaning something.
- **The print sheet withholds the page.** This is §8 as specified and it is
  genuinely funny, but it means a scholar cannot print a dossier. If the archive
  ever wants to be printed from, that is a deliberate reversal to make, not a
  bug to fix quietly.
- **The Epic Stack demo surfaces remain.** Notes and the contributor register
  are restyled into the Institute register but are still boilerplate features;
  they are not part of the archive's argument.
