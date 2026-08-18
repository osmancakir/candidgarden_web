# The Drift

[The atlas](./atlas.md) holds every work in this archive as a point in one space
— six centuries at once, near each other when their readings say similar things.
The drift is a **passage across that space**. It deals a stack of works one at a
time and asks for nothing but a reaction: **pull**, **push**, **rest**. The
forces decide where the reader ends up, and where they end up is the finding.

It exists because the index does not scale to a reader. Nobody pages through
54,497 records to find out which of them are theirs, and the archive's other
surfaces cannot help — they are all built to describe a work, and none of them
describes the person looking at it. The atlas is the map; this is the only
surface that puts someone inside it.

**The three words are a force, not a rating.** A work pulled the reader towards
it, pushed them off, or exerted nothing either way. "Like" and "dislike" invite
someone to report the opinion they think they ought to hold about a painting,
and a drift built on those collects taste-as-performance. A pull is something
that either happened in front of a picture or did not — which is the only kind
of fact this instrument is any good at recording. `REST` is the third reading of
the same instrument, not an absence of one.

The name is the same claim. A sounding is a measurement someone takes _of_ a
place, which puts the reader outside it; a drift is what happens to something
already in the space, moved by what is around it.

**Three routes, because a screen and a page want opposite things.**

| Route                    | What it is                                                     |
| ------------------------ | -------------------------------------------------------------- |
| `/archive/drift`         | The explanation and the way in. An ordinary document.          |
| `/archive/drift/session` | The stack. Full-viewport, no masthead, no colophon, no scroll. |
| `/archive/drift/readout` | The findings. A document again.                                |

The session is the only route in this application that takes the whole viewport
(`isFullscreenRoute` in `app/root.tsx` locks the page to `100svh` and hides the
chrome for it). That is not styling. A card whose height depends on the page
around it is a card that resizes between an altarpiece and a landscape, and
buttons below a variable-height card are buttons that move under the thumb
between one verdict and the next. Locking the viewport is what buys a fixed
card, and a fixed card is what makes the thing feel like an instrument rather
than a web page that happens to have pictures on it.

**The deck is the feature.** A drift is thirty or forty cards, so which forty
decides everything, and the deck has been rebuilt once already for getting it
wrong. The first one spread over the whole archive: a correct sample, and a bad
deck. This is a teaching collection, so a faithful sample of it is ground plans,
engraved title pages, plates from pattern books and photographs of façades — and
a reader cannot be pulled towards or pushed off a survey drawing of a portal.
They can only be patient with it.

So the deck is now dealt from a pool with two curatorial conditions on it:
**paintings**, by **painters a reader has some chance of having met**. 235
painters from Giotto to Malevich, 7,774 paintings, dealt as 320 cards, no two
alike, capped at four per painter and shared out across the centuries so the
nineteenth does not take the lot. What that costs is stated on the page: no
printmakers, however famous, which loses every Hokusai and most of Dürer; and a
canon that is this archive's own — European, with a German centre of gravity.

**And it spans meaning, not looks.** Within the pool, the spread is taken over
the same bge-m3 reading vectors the atlas is drawn from, which are vectors of
prose a model wrote _about_ the pictures. Two works sit near each other when
their readings say similar things, never when they look alike. The deck spans
subject and mood; it does not span palette, handling or composition, because
this archive holds no data about any of those. The page says so in type rather
than letting the interaction imply otherwise.

## Pieces

| Path                                         | Role                                                   |
| -------------------------------------------- | ------------------------------------------------------ |
| `scripts/lib/drift-painters.mjs`             | The 235 painters. A curatorial list, not a query       |
| `scripts/pick-drift-paintings.mjs`           | Decides which of their records are paintings           |
| `app/data/drift/pool.json`                   | Every verdict, kept and hand-correctable, 1.7 MB       |
| `scripts/build-drift-deck.mjs`               | Chooses the spread offline, writes `deck.json`         |
| `scripts/verify-drift-deck.mjs`              | Looks at the dealt cards and throws the wrong ones out |
| `app/data/drift/deck.json`                   | The shipped deck — 320 cards and the pool, 200 KB      |
| `scripts/write-drift-notes.mjs`              | Looks at each plate, drafts the note on its back       |
| `app/data/drift/notes.json`                  | The notes, keyed by resource id — hand-editable        |
| `app/routes/archive/+shared/drift.ts`        | Isomorphic contract, and the readout's arithmetic      |
| `app/routes/archive/+shared/drift.server.ts` | Cookie, verdicts, batching, drift vector, readout      |
| `app/components/institute/drift.tsx`         | `DriftShell`, the card stack, the readout's figures    |
| `app/routes/archive/drift.tsx`               | The explanation and the way in                         |
| `app/routes/archive/drift_.session.tsx`      | The screen: loader, flush endpoint, card stack         |
| `app/routes/archive/drift_.readout.tsx`      | The findings                                           |
| `DriftVerdict`                               | One row per work per drift                             |

## Building the deck

```sh
npm run drift:paintings                  # → app/data/drift/pool.json  (~5 min, Haiku)
npm run drift:deck                       # → app/data/drift/deck.json  (~1 min)
npm run drift:verify                     # looks at the 320 plates, rejects into pool.json
npm run drift:deck                       # deal replacements; repeat until verify is clean
npm run drift:deck -- --cards 400 --seed 7
```

**Which records are paintings** is decided by a model reading the record —
title, painter, dates, holder, tags and both Panofsky readings, which usually
say outright what the thing is ("in this etching", "the fresco cycle"). A
tag-weight heuristic was tried first and is not good enough in either direction:
the tags describe a _photograph of_ the work in three languages, so `foto` lands
on paintings and `marmor` on anything in a church, and Manet's _Portrait d'Émile
Zola_ scores as a non-painting while four in five Caravaggios are thrown away.
10,731 records go in; 7,867 come out as paintings, and every rejection stays in
the file with the medium the model named, because the rejections are how anyone
checks that Rembrandt lost his etchings and not his portraits.

Reads the **local** database, for the reason the atlas export gives: the same
89,800 vectors are here, and pulling 216 MB of them through a ~1 GB production
instance to rebuild a file that a laptop can build would be a self-inflicted
incident. Takes about a minute.

The algorithm is **k-means++ D² sampling**. Each work is reduced to the mean of
its reading vectors, renormalised; a first work is drawn at random; each further
work is drawn with probability proportional to the square of its cosine distance
from everything already drawn. Three properties earn it the job:

- **Every card is a real work**, not a centroid that nothing sits on.
- **It is density-aware.** Pure farthest-point sampling would collect the
  corpus's 600 strangest objects; D² sampling is pulled towards under-covered
  regions without handing the deck to outliers.
- **The cluster assignment falls out for free**, because maintaining "distance
  to nearest chosen work" is what makes the loop affordable in the first place.
  That is where each card's `represents` count comes from — the number of works
  nearer to it than to any other card, quoted in the readout, because being
  pulled by a card that speaks for 900 works is not the same event as being
  pulled by one that speaks for six.

The seed is fixed at 42 and the run is reproducible. A published sample that
nobody can regenerate is a sample nobody can check.

Four rules run around the sampling, and each exists because of something that
came out of it:

- **Periods are flattened, not reproduced.** Two thirds of the pool is the
  nineteenth century, which is a fact about what German institutions
  photographed. Cards per century go as the century's share raised to
  `PERIOD_FLATTENING` (a half), capped at a quarter of the deck.
- **Four cards per painter**, lifted only where a period is too thin to fill its
  quota otherwise — the fourteenth century here is four painters deep, so its
  fifteen cards cannot be four apiece. What the cap actually came to is recorded
  as `coverage.maxPerPainter`.
- **One card per picture.** The archive holds three plates of the Arena Chapel
  and two of one Domenichino altarpiece as separate records, and their readings
  differ enough that the spread happily picks two. Painter plus normalised title
  is the key.
- **Dates have to be plausible**, both absolutely (1200–1960) and for the
  painter they are filed under (within 70 years of the middle of that painter's
  own record). It was written for the keying errors — Klee's _Gartenhaus_ dated
  `3–1929`, the _Burial of St Lucy_ keyed 1908 for 1608 — and it catches
  attributions too: this archive files **Michelangelo Buonarroti's works under
  the artist record for Caravaggio**, which is how the Doni Tondo came to be
  offered as a Caravaggio. Six works fail the rule and all six are wrong.

`deck.json` also ships `poolWorks`: every painting the deck was allowed to deal,
because the cards drawn towards a reader mid-drift come from the reading index
rather than from the deck. Without that list, a reader who had pulled four
Vermeers would be answered with an engraved copy of one — genuinely the nearest
thing in the space, and not a painting.

**The verify pass is the second opinion.** Reading a record cannot catch a print
whose readings never name a medium, so `npm run drift:verify` fetches all 320
plates and asks Sonnet two questions of the picture itself: is this a painting,
and could this be by the painter on the card. The attribution question is
deliberately weak — "could this be", not "is this" — because a model asked to
authenticate starts rejecting ordinary attributions on stylistic hunches. It is
looking for the Sistine ceiling under Caravaggio's name. Rejections are written
back into `pool.json`, so the next build deals around them.

## The note on the back

A card can be turned over. On the back is one paragraph naming something the
reader's eye slid past — the museum-guide move, where a detail you had already
looked at without seeing becomes the thing you cannot stop seeing.

```sh
npm run drift:notes                     # fills in whatever is missing
npm run drift:notes -- --limit 20       # a sample, to read before committing
npm run drift:notes -- --only 19998 --force
```

**The archive already had prose about every work, and it is the failure this
avoids.** The two GPT-4o readings behind the atlas say a Pietà "evokes a deep
sense of sorrow" and "transcends its historical and religious roots" — text that
would sit under any other Pietà without anyone noticing, because it was written
from a title and a date rather than from the picture. So the notes pass is a
**vision pass**: it sends the actual plate and asks for one specific noticing.
The banned vocabulary in its prompt is quoted from this archive's own readings.

**Three kinds of claim, kept apart because their evidence differs.**

|     | Claim                                                                 | Where it can come from                      |
| --- | --------------------------------------------------------------------- | ------------------------------------------- |
| A   | _The child is on a leash_ — what is in the frame                      | Looking. Free, and checkable by the reader. |
| B   | _Leading strings were ordinary for toddlers then_ — convention        | Documented traditions only.                 |
| C   | _She was 37 years younger and he was showing off_ — biography, motive | **Only from a search that actually ran.**   |

A and B are the note's `body`. C is a separate `context` field and is only ever
shown next to the source it came from, which is why the writer has web search
on: a citation the model recalls rather than retrieves is not a check on the
claim, it is a second invention dressed as one. Any context that comes back
without both a title and a URL is **dropped at write time**, and the server
drops it again on read in case the file was hand-edited into that state. The
back also says in type whether a person has been over it.

**A blank back is still allowed, and now means something different.** Under the
old deck most cards were anonymous panels with no honest paragraph available.
Every card is now a painting by a painter with a literature behind them, so a
blank back is a pass not yet run rather than a work with nothing to say — but
the skip stays, because padding a note would cost the notes their credibility on
the cards that have a real one.

Treat the output as a **draft**. 320 is a hand-checkable number — which is the
whole reason this is affordable at all, and would not be over 54,497 works.
Editing a note by hand and setting `"origin": "EDITORIAL"` is the intended
workflow, and rebuilding the deck does not touch the notes file.

**Turning the card over is always deliberate** — a button and the `f` key, never
a tap on the plate. The stack is built for the verdict of the first two seconds,
and a card that flips under a stray thumb turns a reaction into a reading
exercise. `flippedId` is keyed to the card rather than held as a boolean, so
advancing the stack cannot deal the next card already reversed.

Nearest-drawn cards are pulled from the pool at request time rather than the
deck, so their backs are blank. The notes pass only ever looked at the 320.

## The session layout

Four bands divide the viewport and none of them scrolls: header, stats, card,
buttons. The middle band is `flex-1 min-h-0`; the two outer ones are `shrink-0`.
Every element down the chain repeats `min-h-0`, because a flex item's default
`min-height: auto` is what lets a tall plate push the buttons off the bottom of
the screen — the exact failure the layout exists to prevent.

The card is **absolutely positioned inside** the `flex-1` box rather than sized
by its own content, so it is always precisely the height left over. Inside it,
the plate is `flex-1` and the caption `shrink-0`, and the title reserves two
lines (`min-h-[2lh]`) whether or not it needs them — otherwise `Eine Kanne` and
`Entwurf für den Hochaltar von …` give the caption two different heights and the
picture resizes between those two cards even though the card around it did not.

The plate is `object-contain`, never `object-cover`. §5 forbids cropping works
to decorative ratios, and cropping would also decide for the reader which part
of a painting they are reacting to. A wide landscape simply letterboxes inside
the fixed box.

`sm:max-h-192` caps the band on tall screens, so a desktop viewport does not
stretch one card into a tower; the screen stays top-anchored and the leftover
height falls away below. Phones never reach the cap. Measured across 375×667,
390×844, 820×1180 and 1440×900: card height, plate height and button position
are each single-valued across cards, and the document never scrolls.

The frame is `DriftShell`, which is this application's version of the
`StudyShell` pattern in `libraryuniverse_webapp` — same four bands, same
`min-h-0` chain, same `shrink-0` button row at a fixed `h-12`.

## Runtime

Nothing in the request path calls Workers AI. Unlike `sense` search there is no
query to embed, so the drift costs no neurons and cannot be taken down by the
daily quota.

**Identity is a random token in a signed cookie** (`cg_drift`), not an account.
Requiring a signup before the first card would cost the feature the people it is
for. `userId` is filled in when a signed-in reader passes through, so a drift
can be claimed later without the anonymous ones being orphaned.

**Batching is explore-first.** Cards are dealt twelve at a time from the deck in
an order seeded by the drift id, so a reload deals the same cards rather than
quietly resampling under the reader. After five pulls, up to four cards per
batch are drawn towards the drift vector instead — a third, never more. A deck
that only served what it already believed would confirm itself no matter which
way the reader actually pulled, and two-thirds spread is what keeps a wrong
guess recoverable. The two halves are interleaved, and a nearest-drawn card says
on its face that it was drawn towards you.

**The drift vector is Rocchio**: the average of the pulled works' reading
vectors minus 0.35 × the average of the pushed ones, renormalised. The averaging
happens in Postgres — pgvector's `avg()` returns one 1024-float row where
fetching the inputs would pull one per reading per work across Hyperdrive. The
push weight is below one on purpose: a pull locates a point, a push only says a
direction is wrong, and weighting them equally makes the vector lurch on a
single grimace at a single painting.

## What the readout claims

Everything is measured **relative to what the reader was shown**, and the page
says so twice. The question the numbers answer is "given that you were shown a
card carrying this motif, how much likelier than usual was a pull" — answerable
from forty verdicts. "How much do gardens pull you compared to other people" is
not, and no arithmetic on this table would make it so.

Lift is **damped towards no-effect** by two pseudo-cards at the reader's own
base rate (`LIFT_PRIOR` in `drift.ts`). Undamped, a motif seen three times that
pulled twice scores ×2.2 and tops the list over a motif that pulled eight times
out of thirteen — one card away from being nothing at all. The observed counts
are printed beside every figure so the damping hides no evidence, and the
arithmetic is pure and unit-tested in `+drift.test.ts`.

The atlas link carries the reader's top motifs as a `sense` phrase, not their
vector. It is a translation of the finding into the atlas's vocabulary and is
labelled as one.

## Known gaps

Stated plainly, per §7 of the brand document.

- **It cannot see how anything looks.** The whole apparatus rests on text about
  pictures. A reader whose eye is for a palette or a way of handling paint will
  get a readout about subject matter and no warning that it missed the point
  beyond the one sentence on the page. Fixing this needs image embeddings — CLIP
  over a sample would be tractable; over all 54,497 works on the free tier is
  not.
- **The motifs are the corpus's motifs**, which are mostly German ARTigo tags of
  wildly varying quality. `frequency >= 2` drops the worst of the
  single-annotator noise; it does not make `dach` an interesting finding.
- **A forty-card drift rarely has enough overlap for strong lift.** The deck is
  built to make cards dissimilar, which is exactly what starves the motif
  statistics. Readouts often show a list of ×1.5s. That is an honest reflection
  of the evidence and it does look thin.
- **Verdicts are per browser, not per person.** Clearing cookies starts a new
  drift; a signed-in reader's drifts are recorded but nothing yet reads them
  back across devices, and there is no page listing past drifts.
- **The session has no keyboard path through the stack itself.** Arrow keys give
  a verdict and the three buttons are reachable, but the card is not focusable
  and nothing is announced when the stack advances, so a screen-reader user gets
  the alt text of whichever card they happen to land on.
- **The painting classifier is precise and lossy.** About 260 records the model
  itself labelled a fresco, a watercolour or a pastel came back as "other" —
  Tiepolo ceilings, Delacroix's Moroccan watercolours, Degas pastels — because
  the medium it named and the verdict it gave disagreed. Nothing reconciles
  them, so the pool loses works it should hold. It costs the deck nothing at
  7,774 paintings for 320 cards, and it would matter to anyone reading
  `pool.json` as a census of what the archive holds. It is not one.
- **The painter list is a claim about fame with nobody's name on it.** It was
  written in one sitting against what the archive turned out to hold. Everyone
  in it is defensible; the argument is about who is missing, and the list is in
  one file so that argument can be had in a diff.
- **The deck ages with the archive.** It is a static file. New works and new
  readings do not enter it until `npm run drift:deck` is run again, and
  rerunning it with the same seed does not preserve the old cards' cluster
  numbers.
- **The notes are machine-drafted until somebody reads them.** Every note is a
  claim about a picture written by a model that looked at that picture, which
  makes the A-level observations checkable and the B-level conventions merely
  plausible. The back says so, but a reader who skips the line at the bottom
  will not know. Only `"origin": "EDITORIAL"` means a person has been over it.
- **A `context` claim is only as good as the page it cites.** Search grounds it
  in something retrievable, which is a real improvement on recall, but the
  writer does not evaluate whether the source is any good — a hobbyist page and
  a museum catalogue are both URLs. The citation lets a reader check; it does
  not do the checking.
