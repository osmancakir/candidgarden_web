---
name: candidgarden-instagram-carousel
description:
  Generate a Candid Garden Instagram artwork carousel from candidgarden.com
  archive links or a Sense semantic-search phrase. Select strong image-bearing
  results, fetch catalogue metadata and uncropped artwork images, render
  brand-compliant 1080x1350 PNG cards, and write the caption, docent note,
  ordered artwork list, hashtags, and one music recommendation. Use for Candid
  Garden carousel posts and social artwork selections; do not use for unrelated
  social-media brands.
---

# Candid Garden Instagram Carousel

Create a publishable carousel from either explicit archive records or a phrase
searched against Candid Garden's machine-written readings.

## Inputs

Accept one of:

- One or more `https://candidgarden.com/archive/<id>` links. Preserve their
  order.
- A Sense phrase such as `thinkers and writers`. Default to six works unless the
  user gives a count.

Optional inputs are a deck title, cover hook, caption language, output
directory, and whether to omit the cover. Infer a concise title from a Sense
phrase. Also write a short, theme-specific question for the cover and pass it
with `--hook`; prefer three to eight words and do not merely restate the title.
For an unthemed list, use `From the archive` unless the user supplies a better
title, and use `What connects these works?` as the hook.

## Generate the deck

Run from the Candid Garden web repository root so the script can resolve the
project's database, S3 credentials, Playwright, and self-hosted fonts:

```bash
node --env-file=.env \
  skills/candidgarden-instagram-carousel/scripts/generate_instagram_carousel_assets.mjs \
  --query "thinkers and writers" \
  --limit 6
```

For explicit records, repeat `--url`:

```bash
node --env-file=.env \
  skills/candidgarden-instagram-carousel/scripts/generate_instagram_carousel_assets.mjs \
  --url "https://candidgarden.com/archive/5811" \
  --url "https://candidgarden.com/archive/7013" \
  --title "Thinkers and writers" \
  --hook "What does thought look like?"
```

The default output is `output/candidgarden-instagram/<deck-slug>/`. PNG
filenames are numbered in posting order. `manifest.json` records the selection
and reliable caption facts; read it before writing the caption.

Use `--artwork-file <json>` for offline development or supplied catalogue data.
Use `--no-render` only to inspect HTML, `--no-cover` when the user wants artwork
cards only, and `--out-dir` to override the destination.

If live data is requested, do not silently replace a failed database, Workers
AI, or S3 fetch with invented metadata or a web-search result. Report the
missing prerequisite. A query selection may skip records without images; an
explicit list instead renders the archive's honest `IMAGE NOT ON FILE` state.

Read [references/artwork-fields.md](references/artwork-fields.md) when data
retrieval, selection, or input JSON needs attention. Read
[references/brand-card-contract.md](references/brand-card-contract.md) before
changing the card renderer.

## Selection rules for Sense phrases

Treat semantic results as candidates, not as a curatorial verdict. The script
ranks the nearest reading first, applies only a small editorial-highlight and
metadata-completeness preference, requires an image, and diversifies repeated
artists before filling remaining places. Do not claim that proximity proves a
work depicts the query.

Inspect the selected works and the rendered cards. Replace an obviously weak or
repetitive candidate only when there is concrete evidence in the candidate
metadata or image; keep the selection rationale candid.

## Caption and music

After rendering, write the caption in chat rather than to a file. Use the user's
language; otherwise use English. Read
[references/caption-guide.md](references/caption-guide.md) for the required
shape and voice.

The response must include:

1. A compact hook naming the carousel's theme.
2. A `Docent note —` paragraph grounded in what the cards and catalogue actually
   show.
3. `Works in order` with every card's title, artist, period, collection, and
   archive URL.
4. One song as `Music — “Track” — Artist`, with a brief fit rationale.
5. Eight to twelve hashtags, always including `#candidgarden` and
   `#artresearch`.

For a Sense-generated deck, add one plain disclosure that the works were
selected by proximity to machine-written readings, not by image recognition or
proof of subject matter.

## Deliver

Return the output directory, list the numbered PNGs, summarize any skipped or
incomplete records, and then provide the full caption and music recommendation.
Never describe a missing card as complete.
