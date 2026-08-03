# The Atlas

`/archive/atlas` renders all 89,800 interpretation embeddings as a point cloud
in three dimensions. The archive index ranks readings into a list; the atlas
shows the space those readings occupy. The list answers _which works_; the atlas
answers _is this one idea or three_.

The layout is fixed. It is fitted offline, shipped as a static file, and does
not move when a query changes — a search **lights** points, it never rearranges
them. That is the whole reason the map is worth building: a projection refitted
per query would be a different space every time, and nothing learned from one
search would carry to the next. Because the space is stable, a query becomes a
constellation _within_ it, and whether a phrase lands in one tight cluster or
scatters across the corpus is the finding.

**It is reached from the index as `Latent space`** — a fourth chip in the browse
legend, set apart from I / II / III and carrying no numeral, because there is no
fourth level of meaning: the latent space is not deeper than iconology, it is
where the readings are kept. See §2 of [brand-design.md](./brand-design.md) for
that call and why it stays outside `PanofskyLevel` in the code.

**And it is a space of readings, not of works.** The vectors are of prose a
language model wrote about the pictures; no image is embedded anywhere in this
pipeline. What the atlas draws is the shape of the archive's _language_, and
since a point cloud cannot show that on its own, the page says it in type.

## Pieces

| Path                                                                  | Role                                                        |
| --------------------------------------------------------------------- | ----------------------------------------------------------- |
| `scripts/export-embedding-atlas.mjs`                                  | Pulls vectors + metadata out of PostgreSQL                  |
| `scripts/umap-atlas.py`                                               | Fits the UMAP projection, writes `atlas.bin` / `atlas.json` |
| `public/atlas/atlas.bin`, `atlas.json`                                | The shipped artefact — geometry and manifest, 1.6 MB        |
| `app/components/institute/atlas-canvas.tsx`                           | The three.js renderer                                       |
| `app/routes/archive/atlas.tsx`                                        | The page: console, legend, hover label, search              |
| `app/routes/resources/atlas-label.tsx`                                | Title and artist for one hovered work                       |
| `searchInterpretationPoints` in `app/utils/semantic-search.server.ts` | The query that lights points                                |

## The offline pipeline

Two commands, both run by hand. Nothing in this pipeline runs in a Worker, in a
loader, or per request.

```sh
npm run atlas:export   # → .atlas/vectors.f32 + .atlas/points.json
npm run atlas:fit      # → .atlas/atlas.bin + atlas.json, copied into public/atlas/
```

`atlas:fit` needs a Python environment with `umap-learn`, created once:

```sh
python3 -m venv .venv-atlas
.venv-atlas/bin/pip install "umap-learn>=0.5.7" numpy
```

Both `.atlas/` and `.venv-atlas/` are gitignored; only the two files under
`public/atlas/` are committed.

### 1. Export

`export-embedding-atlas.mjs` reads the **local** database by default, not RDS.
The local copy is what `push-embeddings-to-production.mjs` pushes from, so it
holds the same vectors, and pulling 368 MB of them through a ~1 GB production
instance to reproduce a file that already exists locally would be a
self-inflicted incident. `--url` exists for the case where local has been reset.

It writes two files whose **row order is the contract between them**:
`vectors.f32` (N × 1024 little-endian float32, no header) and `points.json` (one
metadata entry per row, same order). The vectors are raw float32 rather than
JSON because 92M numbers as text is ~1.1 GB and minutes of `JSON.parse`, against
368 MB and one `np.fromfile`.

Two things the exporter refuses to do quietly: it aborts if
`InterpretationEmbedding` holds vectors from more than one model — two models
occupy unrelated spaces, and UMAP would fit their union into a picture with a
clean seam down the middle that looks like a finding about the corpus and is an
artefact of the mixture — and it paginates by keyset on the primary key rather
than `OFFSET`, so the last batch of a 45-batch export does not cost 45 times the
first.

### 2. Fit

UMAP has no closed form: the layout comes out of an optimisation over the whole
corpus at once, which is minutes of CPU and hundreds of megabytes of working
set. The parameters are in `scripts/umap-atlas.py` and are worth reading before
changing:

- **`metric="cosine"`** — bge-m3 emits unit vectors and the search path ranks
  them with `<=>`. Fitting under Euclidean would project a different geometry
  than the one search uses, and the map would stop agreeing with the results it
  shows.
- **`n_neighbors=15`** — the local/global tradeoff. Lower shatters the corpus
  into islands; higher smooths genuine distinctions into one mass.
- **`min_dist=0.1`** — visual packing only. Lower than the 2D default reads
  better in 3D, because the third axis already separates what would overlap on a
  plane.
- **`init="pca"`** — faster and more globally faithful than `"spectral"` at this
  scale, where the spectral embedding of a 90k-point graph is itself an
  expensive eigenproblem.
- **`--seed 42`** — reproducible, but forces UMAP single-threaded. `--seed -1`
  runs parallel and lands in a different rotation each time. `--sample N` fits a
  random subset, for trying parameters quickly.

Coordinates are then centred on the **median** and scaled by the 99th percentile
of the radius — not by the bounding box. UMAP throws off small satellite
clusters far from the mass, and a bounding-box fit hands most of the volume to
those outliers: the corpus arrives as a small clot low in one corner of an empty
cube. The median holds the dense core at the origin, which is also what
`OrbitControls` rotates about. The transform is recorded in the manifest under
`normalisation`.

### 3. Ship

`atlas.bin` is one flat buffer: a 16-byte header (`CGAT`, format version, point
count, components) followed by four contiguous arrays. The manifest carries each
array's byte offset, so the browser makes typed-array views over a single
`ArrayBuffer` without copying anything.

| Array         | Type            | Meaning                                         |
| ------------- | --------------- | ----------------------------------------------- |
| `positions`   | float32 × N × 3 | Normalised coordinates                          |
| `resourceIds` | uint32 × N      | The work each reading belongs to                |
| `levels`      | uint8 × N       | 2 or 3                                          |
| `spreads`     | uint8 × N       | Quantised interpretive spread; 0 means unpaired |

~1.6 MB for 89,800 points, against ~8 MB for the same data as JSON.
`formatVersion` is bumped whenever the layout changes, and the reader rejects a
mismatch rather than misreading a stale cached file. `coords.f32` (the raw,
un-normalised layout) stays in `.atlas/` for re-runs and diffing.

`umap-atlas.py` also writes a `labels.json` that is **not** shipped: 89,800
titles are ~5 MB against 1.6 MB of geometry, and a reader hovers maybe a dozen
of them. Labels come from the database one at a time via
`/resources/atlas-label`, which also means the map never shows a title that has
since been corrected in the archive.

## Interpretive spread

The one derived measure the atlas carries: **how far a work's Level III reading
sits from its Level II one** — the distance between describing a picture and
saying what it means.

It is measured in the original 1,024 dimensions, deliberately, and not from the
layout. The two readings of a work are each other's nearest neighbour by a wide
margin (median cosine 0.145, against 0.33 for two works by the same artist and
0.51 for an unrelated pair), so UMAP fuses each pair into what is visually a
single point — median separation 0.005 of a unit cube. Reading the spread off
the projection would report ~0 for every work and would be a fact about
`n_neighbors`, not about the corpus.

It is quantised to a byte, and **0 is reserved to mean "this work has only one
reading, so it has no spread"** — which is not the same statement as "its spread
is zero" and is never painted as though it were. Those 15,774 points get a flat
dim neutral; the 37,013 paired works occupy bytes 1–255.

The colour ramp is stretched over the data's own window (the 1st to 99th
percentile, currently 0.087–0.241 of a possible 2.0) rather than over a fixed
`[0, 0.5]`. The distribution is tight enough that a fixed ceiling would compress
every work into a third of the ramp and make the differences the measure exists
to show invisible. The window is recorded in the manifest **and stated in the
legend**, so the stretch is disclosed rather than flattering.

## Rendering

`AtlasCanvas` imports three.js dynamically — ~150 KB, useless on the server, and
WebGL never exists during SSR — then builds one `THREE.Points` with a custom
shader. Size and colour are decided on the GPU per frame from four static
attributes and five uniforms. The alternative, rewriting a colour buffer on the
CPU whenever the query or a filter changes, is 89,800 × 3 floats and a re-upload
per change; here a new query writes one attribute (`aMatch`) and a filter writes
none.

Encoding decisions, following §3 of [brand-design.md](./brand-design.md):

- **Level is not a colour channel.** Two near-neutrals fail both the chroma
  floor and CVD separation as a categorical pair, so level is a filter and a
  size (Level III sits at 0.82× Level II) — both unambiguous.
- **Ultramarine means exactly one thing:** matched. Nothing else is accented.
- **Spread uses one hue, monotone in lightness**, so it survives greyscale and
  colour-blindness. A rainbow would invent categories the measure does not have.
- **A query dims the corpus rather than hiding it** (alpha 0.42 → 0.07). The
  unlit points are what make the lit ones mean something; a constellation with
  the sky removed is a list again.

Picking runs at most once per frame, never per pointer event — raycasting Points
is a linear scan over all 89,800, so a `pointermove` storm would otherwise queue
dozens of full scans per frame. `preserveDrawingBuffer` is on so a view can be
screenshotted or saved; without it `toDataURL()` comes back blank.

## Lighting a query

The `sense` field posts to the loader, which calls `searchInterpretationPoints`
— the same index, operator and `ivfflat.probes` as the archive's semantic
search, minus the collapse to one row per work. A work whose Level II and Level
III passages both match is two points, often far apart, and collapsing them
would hide exactly what the projection exists to show.

The ceiling is 900 readings, larger than the index's 400 and for a different
reason: a list is read, a constellation is only seen, and below a couple of
hundred lit points the result reads as scattered dust rather than as a shape.
Results are cached for an hour (six hours stale-while-revalidate) under a hash
of the query.

An outage costs the reader the highlight, not the map: the loader returns an
empty hit list with a notice, and the projection — a static file — owes nothing
to Workers AI or to the vector index.

## Regenerating

Re-run both stages when the corpus changes materially (new embeddings pushed, a
different model), or when changing fit parameters. The export reads local, so
local must be current first. After `npm run atlas:fit`, commit the two files
under `public/atlas/`.

Changing the binary layout means bumping `FORMAT_VERSION` in `umap-atlas.py` and
the check in `loadAtlas`, or old cached files will be misread as the new shape.

## Known gaps

Stated plainly, per §7 of the brand document.

- **The map requires WebGL and a pointer.** The search form is a plain GET form
  and degrades, but there is no non-WebGL rendering of the cloud and no keyboard
  path through the points. A reader on a screen reader gets the console, the
  counts and the legend — not the shape.
- **1.6 MB before anything is visible.** The file is cacheable and immutable in
  practice, but the first visit pays for all of it.
- **The atlas is not in `InstituteNav`.** It is reached from the index's browse
  legend and from the sitemap, but the four-item institutional menu still does
  not name it.
- **The projection is only as complete as the embeddings.** 89,800 of 108,842
  published readings carry a vector, so the map shows 52,787 of 54,497 works. A
  work can be absent for the uninteresting reason that nobody has embedded it.
- **Near means near; far is only approximately far.** UMAP preserves local
  neighbourhoods, not global distances. Cluster sizes and the gaps between
  clusters carry little meaning, and the interface says so in the corner rather
  than letting the picture imply otherwise.
