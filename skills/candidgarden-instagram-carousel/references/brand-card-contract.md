# Candid Garden card contract

This is the social-card translation of `docs/brand-design.md`, not a separate
campaign style.

## Palette

- White `#FFFFFF`: cover ground, giving the miniature salon wall a clean gallery
  setting.
- Paper `#F2F0EB`: default artwork-card ground.
- Ink `#1A1A1A`: primary text.
- Void `#0D0D0D` and bone `#E8E5DE`: the archive's deep register; reserve these
  for non-cover applications.
- Ultramarine `#1F00E0`: the only interface accent; links, active rule, or one
  directional cue.
- Stamp `#9E2B25`: provenance only.
- Slate `#8C8C88`: Level II ground, never small text on paper. Use `#5F5C57` for
  secondary paper text.

No additional accent colours, gradients, shadows, rounded corners, glass
effects, or decorative textures.

## Type

- Archivo Black, uppercase: deck theme and artwork title. Curatorial assertion.
- Times New Roman/Times: artist and human-facing prose. Scholarly voice.
- IBM Plex Mono: collection facts, plate counts, record IDs, and provenance.
  Machine voice.

The script loads the repository's self-hosted Archivo Black and IBM Plex Mono
files and embeds them as data URLs. Do not add an external font dependency.

## Artwork plate

The complete artwork must remain visible. The image lives in a generous bounded
plate with `object-fit: contain`, centred on paper. Letterboxing is correct;
cropping is not. Do not stretch, mask, tilt, recolour, or place type over the
artwork.

Artwork cards carry one masthead rule above the plate. The plate must not add a
second top rule. Images may upscale to fill the available plate while remaining
fully contained. Keep an 18 px paper gap between the image and the plate's
bottom rule so the artwork does not touch the title divider.

If an explicitly requested record has no image, show `IMAGE NOT ON FILE` in the
same ruled plate. Sense selections skip such records because the user asked for
prominent image-bearing works.

## Structure

- 1080x1350 pixels (`4:5`) by default.
- One cover followed by one card per artwork; `--no-cover` is allowed.
- Hairline rules and a strict rectilinear grid.
- Cover: a white salon-wall composition with the theme centred between two
  irregular rows of uncropped artwork miniatures. Include the `CANDID·GARDEN`
  wordmark with its single ultramarine dot, `Institute for Art Re-Search`, a
  short theme-specific question, selection method, and archive address. Keep
  each miniature in a thin, rectilinear frame and never crop it. Show every work
  when the deck contains up to eight; for larger decks, sample eight evenly
  across the posting order. Enlarge the frames when there are four or fewer
  works.
- Artwork card: wordmark and plate count, uncropped plate, title, artist/period,
  collection/location, and a small provenance stamp with record ID.
- Keep every text block within a 72 px safe edge.

The renderer auto-fits long titles and caps metadata lines rather than shrinking
everything into illegibility. Review all generated cards at full size before
delivery.
