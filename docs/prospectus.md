# The Prospectus

`/prospectus` and `/prospectus/funding` are the surfaces in this project that
sell something. It is a deck: sixteen slides, in German and English, advanced
with an arrow key, stating what Candid Garden offers a museum and what it has
already delivered.

It exists because the work had outgrown the way it was being described. The
archive demonstrates the capability, the Städel working area proves it against a
real collection, and neither is something you can put in front of a
Sammlungsleitung in twenty minutes. This is that twenty minutes.

## Two decks, one player

| Route                 | For                                            | Spine                                                                                                   |
| --------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `/prospectus`         | An institution spending its own money          | Problem → proof → four services → terms                                                                 |
| `/prospectus/funding` | An institution that has to win the money first | The programme names the method → the audit is your feasibility study → quality criteria → work packages |

The funding deck exists because in this market it is the commoner case. The
DFG's _Digitalisierung und Erschließung_ programme funds museums, libraries and
archives, takes applications at any time rather than in rounds, and — since it
was re-scoped — names automatic image recognition and Named-Entity Recognition
among the procedures it pays for. A collection with no budget line is still a
customer if the application is winnable, and what makes it winnable is evidence
that exists before submission. That turns the audit from the cheapest way in
into the feasibility study, which is the most useful thing anyone can hand a
reviewer.

**Six slides are shared, by reference and not by copy.** `buildGrantDeck` calls
`buildDeck` and lifts `what-exists`, `the-pilot`, `the-discarded-metric`,
`uncertainty`, `what-we-need` and `what-you-keep` straight out of it. Copying
their prose would be the ordinary way and the wrong one: two files drift a
phrase at a time, and a figure corrected in one deck goes on being wrong in the
other. A test asserts the sharing is real.

**Both routes are decks, and `isFullscreenRoute` matches the prefix** rather
than the two paths, so a third deck cannot quietly render with a masthead over
it.

### What the funding deck may not say

It states what the programme's published scope says and nothing beyond it — no
volumes, no durations, no success rates, no review timelines. Those were not
verified when it was written, and a supplier reciting them is claiming knowledge
it does not have. In their place the slide carries a caveat naming the month the
reading was taken, so a reader can judge how stale the information is, and
points at the DFG's own Programmberatung. A test asserts that slide mentions the
programme office and contains no currency figures.

Re-read the programme text before showing this deck to anyone, and move the date
in `PROGRAMME_READ_ON` when you do.

## What the deck is arguing

The moat is not the software. It is the whole service — the judgment about what
is worth measuring, the vocabulary work, the review loop, and a catalogue the
institution can still defend in ten years. The models underneath are commodity
and will be replaced; anything sold as a subscription to them is a rental of
something that is about to expire.

Three slides carry that claim and must not drift back toward vendor framing:

- **06 · Die verworfene Kennzahl.** We built the metric the briefing asked for,
  ran it, and reported that it was measuring the catalogue rather than the
  model. No product can decline to optimise the number it is graded on. This is
  the most on-thesis slide in the deck.
- **07 · Unsicherheit ist Inhalt.** Method sold as method: the ranking states
  its own limits, and the human-confirmation field stays empty until a person
  fills it.
- **14 · Die Modelle sind Verbrauchsmaterial.** The durability argument, stated
  plainly — no portal, no access to switch off, no search that stops working
  over an unpaid invoice. "If we disappear tomorrow, you lose nothing" is the
  most credible available proof that the value is the work rather than the
  lock-in, because it is a claim only someone confident in the work can make.

Two slides were rewritten once already for pulling against this, and the reasons
are worth keeping so they are not undone:

- **03** used to be headed _"Die Modellwahl ist das Projekt."_ That hands the
  moat to a leaderboard: if the model is the value, a benchmark published next
  year replaces us. It now argues that the four-point spread is the one quantity
  nobody can estimate from outside — an instrument, measured first because it
  cannot be guessed — and that the project starts afterwards, at the vocabulary
  and the review.
- **04** used to be a stack board: vector dimensions, pgvector, the atlas
  binary's byte count. A Sammlungsleitung does not buy dimensions, and that
  framing sells the commodity half of the offer. It now argues that finishing is
  the rare thing — pilots on five hundred records are everywhere and stop where
  the work begins — with outcome figures instead of infrastructure ones. The
  engineering specifics moved into service 04, where a technical reader looks
  for them.

The zero on slide 04 is deliberate. Among five achievement figures, "0 records
presented as verified" is the one that makes the other five believable.

## Unlisted, not gated

The [Städel area](../app/routes/staedel-research) is closed by a role check,
because its readers are named people at one museum. A prospective customer has
no account here, so the same instrument would be the wrong one — a login is a
door slammed in the face of exactly the person the page is for.

So the deck is public and unlisted:

- `noindex, nofollow` in its own `meta`.
- `getSitemapEntries: () => null` on the route handle.
- absent from `STATIC_PATHS` in `sitemap-data.server.ts`, which is a
  hand-written allowlist rather than a derived one.

Both sitemap roads are closed, and the page reaches people the way a proposal
does: because someone sent it to them. That keeps the README's promise that no
marketing page stands between a visitor and the research material — the archive
is still the homepage, and this is a document you are handed.

## Everything that decides the screen is in the URL

`?slide=`, `?lang=` and `?ground=`. A link to slide seven in German on a dark
ground survives being pasted into an email, and a presenter who has set a room
up once can bookmark exactly that.

Slides are addressed by **id**, not by number, so reordering the argument cannot
break a link that was already sent. Navigation replaces rather than pushes
history: twelve arrow presses should not become twelve entries the presenter has
to walk back out of.

`shouldRevalidate` returns `false`. The deck is a pure function of a frozen run,
so moving between slides has nothing to fetch — which matters at precisely the
moment, mid-sentence in a meeting room, when the wifi is least worth trusting.
For the same reason the archive's own figures in `ARCHIVE` are constants rather
than a count query: a presentation that shows an error boundary because a
database was unreachable has failed at the only job it had.

## The numbers are derived, never retyped

`+shared/figures.server.ts` reads the corpus sizes, the sample, the call count
and the scoreboard out of the same frozen Städel run the client received.
Quoting a figure the report does not support is the one mistake this argument
cannot survive, so the deck cannot hold a number the report disagrees with.

Three figures cannot come from there and are stated in that module with their
source: the fill-rate counts, which were computed over the whole export rather
than the committed 40-work sample, and the vocabulary finding. They match §3 and
§4 of the pilot report and must be changed together with it.

## Naming the client

`NAME_THE_PILOT_CLIENT` in `+shared/deck.ts` is `false`.

The pilot was run for one museum against their unpublished catalogue, and the
sharpest slide in the deck is a finding about how thinly that catalogue is
filled. That is entirely fair to say about _a_ German graphic collection and not
ours to say about _theirs_ until they agree to it in writing. Flip the constant
when they do; every figure stays exactly as it is either way.

## The ground toggle

Root hides the site chrome for fullscreen routes (`isFullscreenRoute` in
`app/root.tsx`), and with it the masthead's ground control. The deck carries its
own, because this is the one page where it is not a preference: a paper-white
deck on a projector in a darkened room is unreadable, and a void deck printed to
hand round is a wasted cartridge. It names the ground in the site's own
vocabulary — `GROUND VOID` / `GROUND PAPER` — rather than showing a sun and a
moon.

## Editing the pitch

All the copy is in `+shared/deck.ts` and `+shared/grant-deck.ts`, as data. The
renderers in `+shared/slides.tsx` know about eight shapes of slide and nothing
about the argument, and `+shared/player.tsx` knows how to show a deck and
nothing about which one — so the person giving the talk can rewrite either
argument without reading JSX.

The two decks share a player deliberately. A presenter has learnt one set of
arrow keys, one contents sheet on `o`, and two toggles in one corner; a second
deck whose spacebar behaved differently would be discovered in front of a room.

`+shared/+deck.test.ts` guards the failure that a bilingual deck actually has:
an English string left behind in the German column. It asserts that every
localized pair is filled, that no pair is identical outside a short allowlist of
proper nouns, and that the interpolated figures arrive formatted for the
language they are shown in — 2.041 in German, 2,041 in English.

## Known gaps

- **No print stylesheet.** The deck is a screen. Printing it produces fifteen
  copies of slide one, because only the current slide is in the DOM.
- **No speaker notes.** The argument each slide is making is in the deck file's
  comments rather than on a second screen.
- **The evidence is one pilot.** Every claim about delivery rests on a single
  engagement with a single collection, and the deck says so on the title slide
  rather than implying a client list that does not exist.
