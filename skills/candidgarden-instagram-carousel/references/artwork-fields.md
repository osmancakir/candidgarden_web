# Artwork data and selection

## Live source

The generator reads the same PostgreSQL archive used by the app and fetches the
original artwork object from S3. It does not scrape rendered dossier pages. Run
it from the web repository with `.env` loaded.

Required environment for explicit links:

- `DATABASE_URL`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `AWS_S3_BUCKET`

Sense queries additionally require `CLOUDFLARE_ACCOUNT_ID` and
`CLOUDFLARE_API_TOKEN` because the query must be embedded with the same
`@cf/baai/bge-m3` model as the archive's reading vectors. A different embedding
model produces meaningless distances.

## Field mapping

| Archive field                                            | Card/caption use                                             |
| -------------------------------------------------------- | ------------------------------------------------------------ |
| `Resource.id`                                            | Plate number, provenance stamp, archive URL                  |
| `title`, then `titleEn`                                  | Artwork title; `Untitled` only when both are absent          |
| `Artist.name`                                            | Artist; `Unattributed` when absent                           |
| `notBefore`, `notAfter`                                  | Single year or en-dash range; `Undated` when absent          |
| resolved `Institution.name`, then `Resource.institution` | Collection line                                              |
| `location`                                               | Secondary collection/location line when useful               |
| `wikiDataId`                                             | Manifest only; do not crowd the card with it                 |
| `objectKey`                                              | Original S3 image, embedded into scratch HTML                |
| `highlight`                                              | Small editorial-prominence preference in Sense mode          |
| strongest `Tagging` rows                                 | Manifest context for the docent note, never treated as proof |
| matching reading level and similarity                    | Manifest disclosure for Sense mode                           |

The renderer uses `object-fit: contain` inside a bounded plate. Never switch it
to `cover`, never set a decorative crop, and never use an AI-generated
substitute for a missing archive image.

## Sense selection

The script asks for a broad nearest-neighbour band, collapses it to one reading
per work, and retrieves catalogue records. It then:

1. excludes records without an archive image;
2. keeps semantic similarity as the dominant score;
3. adds a small preference for an editorial highlight and complete attribution;
4. takes at most one work per named artist on the first pass;
5. fills any empty places from the remaining ranked candidates.

The output manifest includes the query, reading level, similarity, and selection
note. Caption wording must say `near` or `selected from the reading search`, not
`the best`, `the most relevant`, or `depicts` unless separately established.

## Offline JSON

`--artwork-file` accepts either an array or `{ "artworks": [...] }`. Each entry
may contain:

```json
{
	"id": 5811,
	"title": "A title",
	"artist": "An artist",
	"notBefore": 1870,
	"notAfter": 1874,
	"collection": "A collection",
	"institution": "Catalogue wording",
	"location": "City or inventory detail",
	"imageUrl": "./fixtures/artwork.jpg",
	"motifs": ["book", "figure"],
	"sourceUrl": "https://candidgarden.com/archive/5811"
}
```

`imageUrl` may be an HTTP(S) URL, data URL, `file:` URL, or a path relative to
the JSON file. Local files are useful for deterministic renderer tests.
