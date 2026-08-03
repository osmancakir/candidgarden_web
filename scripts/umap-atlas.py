"""Projects the bge-m3 interpretation vectors to 3D with UMAP.

Consumes what `scripts/export-embedding-atlas.mjs` wrote and emits the binary
the atlas route renders. Run it in the venv that has umap-learn:

    python3 -m venv .venv-atlas
    .venv-atlas/bin/pip install "umap-learn>=0.5.7" numpy
    .venv-atlas/bin/python scripts/umap-atlas.py --in .atlas

This is an offline step and must stay one. UMAP has no closed form: the layout
comes out of an optimisation over the whole corpus at once, which is minutes of
CPU and hundreds of megabytes of working set. It cannot run in a Worker, in a
loader, or per query — the route reads the file this produces.

Outputs, all in the input directory:

    coords.f32    N x 3 float32, the raw layout, kept for re-runs and diffing.
    atlas.bin     What the browser fetches. Header, then four parallel arrays
                  described in the manifest — positions, resource ids, levels,
                  and interpretive spread. ~1.6MB for 89,800 points, against
                  ~8MB for the same data as JSON.
    atlas.json    Manifest: counts, offsets, fit parameters, and the bounds the
                  positions were normalised into.

Fit parameters worth knowing before changing them:

  metric="cosine"   The vectors are L2-normalised by bge-m3 and the search path
                    ranks them with `<=>`. Fitting under Euclidean would be
                    projecting a different geometry than the one search uses,
                    and the map would stop agreeing with the results it shows.

  n_neighbors=15    Governs the local/global tradeoff. Lower shatters the
                    corpus into many small islands; higher smooths genuine
                    distinctions into one mass. 15 is UMAP's default and is a
                    reasonable first look at a corpus this size.

  min_dist=0.1      Only affects how tightly points pack visually. In 3D a
                    lower value than the 2D default reads better, because the
                    third axis already separates what would overlap on a plane.

  init="pca"        Faster and more globally faithful than the "spectral"
                    default at this scale, where the spectral embedding of a
                    90k-point graph is itself an expensive eigenproblem.
"""

import argparse
import json
import struct
import sys
import time
from pathlib import Path

import numpy as np

DIMENSIONS = 1024
# Bumped when the binary layout changes, so a cached atlas.bin from an older
# fit is rejected by the reader rather than misread as the current shape.
FORMAT_VERSION = 1
MAGIC = b"CGAT"

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--in", dest="input", default=".atlas", help="export directory")
parser.add_argument("--out", dest="output", default=None, help="defaults to --in")
parser.add_argument("--neighbors", type=int, default=15)
parser.add_argument("--min-dist", type=float, default=0.1)
parser.add_argument(
    "--seed",
    type=int,
    default=42,
    help=(
        "Pass -1 to drop the seed. A fixed seed makes the layout reproducible "
        "but forces UMAP single-threaded, which is several times slower here; "
        "unseeded runs are parallel but land in a different rotation each time."
    ),
)
parser.add_argument(
    "--sample",
    type=int,
    default=0,
    help="Fit a random subset instead of the whole corpus, to try parameters quickly.",
)
args = parser.parse_args()

input_directory = Path(args.input)
output_directory = Path(args.output) if args.output else input_directory
output_directory.mkdir(parents=True, exist_ok=True)

vector_path = input_directory / "vectors.f32"
points_path = input_directory / "points.json"
if not vector_path.exists() or not points_path.exists():
    sys.exit(
        f"{vector_path} or {points_path} is missing. Run:\n"
        "  node --env-file=.env scripts/export-embedding-atlas.mjs"
    )

metadata = json.loads(points_path.read_text())
points = metadata["points"]

# "<f4" pins little-endian float32 regardless of the host, matching what the
# exporter wrote and what DataView reads in the browser.
vectors = np.fromfile(vector_path, dtype="<f4")
if vectors.size % DIMENSIONS:
    sys.exit(f"{vector_path} holds {vectors.size} floats, not a multiple of {DIMENSIONS}")
vectors = vectors.reshape(-1, DIMENSIONS)

if len(vectors) != len(points):
    sys.exit(
        f"{len(vectors)} vectors against {len(points)} metadata rows — the two "
        "files are from different exports. Re-run the exporter."
    )

if args.sample and args.sample < len(vectors):
    rng = np.random.default_rng(0 if args.seed < 0 else args.seed)
    keep = np.sort(rng.choice(len(vectors), args.sample, replace=False))
    vectors = vectors[keep]
    points = [points[index] for index in keep]
    print(f"Sampled {len(vectors):,} of {metadata['count']:,} points")

norms = np.linalg.norm(vectors, axis=1)
print(
    f"{len(vectors):,} x {DIMENSIONS} vectors, "
    f"norms {norms.min():.4f}–{norms.max():.4f} (bge-m3 emits unit vectors)"
)

# Imported here rather than at the top: umap pulls in numba, which spends a few
# seconds warming up, and the argument and file errors above should not have to
# wait for it.
import umap  # noqa: E402

reducer = umap.UMAP(
    n_components=3,
    metric="cosine",
    n_neighbors=args.neighbors,
    min_dist=args.min_dist,
    init="pca",
    random_state=None if args.seed < 0 else args.seed,
    verbose=True,
)

print(
    f"Fitting UMAP: n_neighbors={args.neighbors} min_dist={args.min_dist} "
    f"seed={'unseeded' if args.seed < 0 else args.seed}"
)
started = time.monotonic()
coordinates = reducer.fit_transform(vectors).astype("<f4")
print(f"Fitted in {time.monotonic() - started:.1f}s")

coordinates.tofile(output_directory / "coords.f32")

# Normalised so the renderer can frame the cloud without knowing anything about
# this fit. UMAP's output units are arbitrary — only relative distance carries
# meaning — so nothing is lost by rescaling, and the transform is recorded here
# either way.
#
# Centred on the median and scaled by a percentile of the radius, not by the
# bounding box. UMAP throws off small satellite clusters that sit far from the
# mass, and a bounding-box fit hands most of the volume to those outliers: the
# corpus arrives as a small clot low and to one side of an empty cube. The
# median holds the dense core at the origin, which is also what OrbitControls
# rotates about, and the percentile lets the few genuine outliers fall outside
# the unit cube rather than shrinking everything else to accommodate them.
centre = np.median(coordinates, axis=0)
radii = np.abs(coordinates - centre).max(axis=1)
extent = float(np.percentile(radii, 99))
normalised = ((coordinates - centre) / extent).astype("<f4")
print(
    f"Normalised about the median; {(radii > extent).sum():,} points "
    f"({(radii > extent).mean():.2%}) lie outside the unit cube"
)

resource_ids = np.array([point["resourceId"] for point in points], dtype="<u4")
levels = np.array([point["level"] for point in points], dtype="u1")

# Interpretive spread: how far a work's level III reading sits from its level II
# one — the distance between describing a picture and saying what it means.
#
# Measured in the original 1024 dimensions, deliberately, and not from the
# layout. The two readings of a work are each other's nearest neighbour by a
# wide margin (median cosine 0.145, against 0.33 for two works by the same
# artist and 0.51 for an unrelated pair), so UMAP fuses each pair into what is
# visually a single point — median separation 0.005 of a unit cube. Reading the
# spread off the projection would therefore report ~0 for every work and would
# be an artefact of n_neighbors, not a fact about the corpus.
#
# Quantised to a byte, with 0 reserved to mean "this work has only one reading,
# so it has no spread" — which is not the same statement as "its spread is zero"
# and must not be painted as though it were. Paired works occupy 1–255.
#
# The ramp is stretched over the data's own window rather than over [0, 0.5]:
# the distribution is tight (p1 to p99 spans roughly 0.10 to 0.24 of a possible
# 2.0), so a fixed ceiling would compress every work into a third of the ramp
# and the colour differences that carry the whole measure would be invisible.
# The window is recorded in the manifest, and the interface states it, so the
# stretch is disclosed rather than flattering.
SPREAD_FLOOR_PERCENTILE = 1
SPREAD_CEILING_PERCENTILE = 99

spreads = np.zeros(len(points), dtype="u1")
spread_floor = 0.0
spread_ceiling = 0.0
by_resource = {}
for index, resource in enumerate(resource_ids):
    by_resource.setdefault(int(resource), []).append(index)

paired_indices = [pair for pair in by_resource.values() if len(pair) == 2]
if paired_indices:
    left = np.array([pair[0] for pair in paired_indices])
    right = np.array([pair[1] for pair in paired_indices])
    # Unit vectors, so the dot product is the cosine and 1 - it is the distance.
    distances = 1 - np.einsum("ij,ij->i", vectors[left], vectors[right])
    spread_floor = float(np.percentile(distances, SPREAD_FLOOR_PERCENTILE))
    spread_ceiling = float(np.percentile(distances, SPREAD_CEILING_PERCENTILE))
    span = max(spread_ceiling - spread_floor, 1e-6)
    normalised_spread = np.clip((distances - spread_floor) / span, 0, 1)
    quantised = (1 + normalised_spread * 254).astype("u1")
    spreads[left] = quantised
    spreads[right] = quantised
    print(
        f"Interpretive spread over {len(paired_indices):,} paired works: "
        f"median {np.median(distances):.4f}, ramp stretched over "
        f"{spread_floor:.4f}–{spread_ceiling:.4f}; "
        f"{len(points) - 2 * len(paired_indices):,} points are single readings"
    )

# One flat buffer rather than three fetches. Each array is contiguous, and the
# manifest carries its byte offset, so the browser makes typed-array views over
# the one ArrayBuffer without copying any of it.
positions_bytes = normalised.tobytes()
resource_bytes = resource_ids.tobytes()
level_bytes = levels.tobytes()
spread_bytes = spreads.tobytes()

header = struct.pack("<4sIII", MAGIC, FORMAT_VERSION, len(points), 3)
atlas_path = output_directory / "atlas.bin"
with atlas_path.open("wb") as handle:
    handle.write(header)
    handle.write(positions_bytes)
    handle.write(resource_bytes)
    handle.write(level_bytes)
    handle.write(spread_bytes)

offset = len(header)
layout = {}
for name, payload, dtype in (
    ("positions", positions_bytes, "float32"),
    ("resourceIds", resource_bytes, "uint32"),
    ("levels", level_bytes, "uint8"),
    ("spreads", spread_bytes, "uint8"),
):
    layout[name] = {"offset": offset, "byteLength": len(payload), "dtype": dtype}
    offset += len(payload)

# Distinct works, and how many of them carry both a level II and a level III
# reading — those pairs are what the renderer can draw as segments.
unique_resources, counts = np.unique(resource_ids, return_counts=True)

manifest = {
    "formatVersion": FORMAT_VERSION,
    "model": metadata["model"],
    "count": len(points),
    "works": int(len(unique_resources)),
    "pairedWorks": int((counts == 2).sum()),
    "fit": {
        "algorithm": "umap",
        "nComponents": 3,
        "metric": "cosine",
        "nNeighbors": args.neighbors,
        "minDist": args.min_dist,
        "init": "pca",
        "seed": None if args.seed < 0 else args.seed,
        "sampled": bool(args.sample),
        "fittedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    },
    "normalisation": {"centre": centre.tolist(), "extent": extent},
    # Byte 0 means unpaired — a work with a single reading — and carries no
    # distance at all. Bytes 1–255 map back to a cosine distance of
    # spreadFloor + (b - 1) / 254 * (spreadCeiling - spreadFloor).
    "spreadFloor": spread_floor,
    "spreadCeiling": spread_ceiling,
    "layout": layout,
}
(output_directory / "atlas.json").write_text(json.dumps(manifest, indent="\t"))

# Labels stay out of atlas.bin: they are ~5MB of text against 1.5MB of geometry,
# and the map can paint and spin before a single one is needed.
labels = [
    {
        "r": point["resourceId"],
        "t": point["title"],
        "a": point["artist"],
        "y": point["notBefore"],
    }
    for point in points
]
(output_directory / "labels.json").write_text(json.dumps(labels, separators=(",", ":")))

print(
    f"Wrote {atlas_path} — {len(points):,} points, "
    f"{len(unique_resources):,} works, {int((counts == 2).sum()):,} with both levels, "
    f"{atlas_path.stat().st_size / 1024 / 1024:.2f} MB"
)
