"""Finds the atlas's regions and neighborhoods, and the words that tell them apart.

Runs after `scripts/umap-atlas.py` and reads what it wrote, so placing a name
on the map never means refitting the map:

    node --env-file=.env scripts/export-atlas-texts.mjs
    .venv-atlas/bin/python scripts/cluster-atlas.py --in .atlas
    node --env-file=.env scripts/name-atlas-clusters.mjs

Outputs, in the input directory:

    atlas-v2.bin    atlas.bin with two sections appended: each point's region
                    (uint8, 255 = none) and neighborhood (uint16, 65535 = none).
    atlas-v2.json   Its manifest. formatVersion 2; otherwise atlas.json's.
    clusters.json   Every cluster: id, size, the point its label is anchored
                    on, its most telling terms, and the works at its middle.
                    `name-atlas-clusters.mjs` names them from this and writes
                    the files the site serves.

Clustering is HDBSCAN on the 3D layout rather than on the 1,024-dimensional
vectors, so a region is a patch of the map the reader can see, not a group
scattered across it. It runs twice, at two sizes: regions are what the map
names from far out, neighborhoods what it names up close. "Leaf" selection
gives clusters of even size where the default merges the layout into two or
three blobs, and leaves many points as noise; those join the cluster of their
nearest clustered neighbour, so every point belongs somewhere, while each
cluster's terms come only from its core.

Terms are class-based TF-IDF over the reading bodies: frequent in this cluster,
rare in the others. Each reading's own artist and institution names are removed
from its text first. Without that, a cluster dominated by one painter is "described" by the
painter's surname, which says who made the works rather than what they are
about, and the map is meant to show the second.
"""

import argparse
import json
import re
from collections import Counter
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree
from sklearn.cluster import HDBSCAN
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, CountVectorizer

FORMAT_VERSION = 2
NOISE_U8 = 255
NOISE_U16 = 65535

# The vocabulary every reading shares because a model wrote all of them about
# pictures. They are everywhere, so TF-IDF would mostly discount them anyway;
# listing them keeps them from surfacing in a small cluster by chance.
BOILERPLATE = {
    "art", "artist", "artists", "artwork", "artworks", "work", "works", "piece",
    "painting", "paintings", "painted", "image", "images", "picture", "drawing",
    "print", "composition", "scene", "depicts", "depicted", "depicting",
    "depiction", "features", "featuring", "portrays", "portrayal", "portrayed",
    "suggests", "suggesting", "evokes", "evoking", "invites", "inviting",
    "viewer", "viewers", "reflects", "reflecting", "reflection", "highlights",
    "highlighting", "serves", "reminder", "poignant", "today", "contemporary",
    "context", "time", "times", "resonates", "resonate", "themes", "theme",
    "sense", "rich", "rendered", "rendering", "detail", "details", "elements",
    "element", "style", "visual", "use", "uses", "captures", "capturing",
    "conveys", "conveying", "creates", "creating", "offers", "presents",
    "presented", "emphasizes", "emphasizing", "underscores", "showcases",
    "showcasing", "intricate", "subtle", "deeper", "profound", "significance",
    "significant", "meaning", "meanings", "symbolic", "symbolizes",
    "symbolizing", "symbol", "symbols", "represents", "representing",
    "representation", "century", "centuries", "era", "period", "modern",
    "world", "life", "human", "experience", "experiences", "audience",
    "audiences", "foreground", "background", "left", "right", "center",
    "centre", "figure", "figures", "lines", "colors", "colours", "color",
    "colour", "tones", "palette", "light", "shadow", "shadows", "level",
    "iconographic", "iconological", "untitled", "titled", "title",
}
# The readings are English but quote titles in the collections' languages, so
# a cluster of German still lifes would otherwise be "described" by "mit".
TITLE_LANGUAGES = {
    "der", "die", "das", "den", "dem", "des", "und", "mit", "von", "vom", "zum",
    "zur", "aus", "bei", "nach", "auf", "ein", "eine", "einer", "eines", "im",
    "am", "an", "in", "van", "het", "een", "met", "op", "uit", "voor", "bij",
    "naar", "le", "la", "les", "du", "de", "des", "et", "sous", "sur", "dans",
    "avec", "il", "lo", "gli", "della", "delle", "dei", "del", "di", "da", "con",
    "el", "los", "las", "y",
}
STOP_WORDS = sorted(ENGLISH_STOP_WORDS | BOILERPLATE | TITLE_LANGUAGES)

parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
parser.add_argument("--in", dest="input", default=".atlas")
parser.add_argument("--region-size", type=int, default=700, help="HDBSCAN min_cluster_size for regions")
parser.add_argument("--hood-size", type=int, default=110, help="HDBSCAN min_cluster_size for neighborhoods")
parser.add_argument("--min-samples", type=int, default=10)
args = parser.parse_args()
directory = Path(args.input)

manifest = json.loads((directory / "atlas.json").read_text())
if manifest["formatVersion"] != 1:
    raise SystemExit(f"{directory / 'atlas.json'} is format {manifest['formatVersion']}; expected umap-atlas.py's format 1.")
buffer = (directory / "atlas.bin").read_bytes()


def view(name, dtype):
    section = manifest["layout"][name]
    return np.frombuffer(buffer, dtype=dtype, count=section["byteLength"] // np.dtype(dtype).itemsize, offset=section["offset"])


xyz = view("positions", "<f4").reshape(-1, 3)
resource_ids = view("resourceIds", "<u4")
points = json.loads((directory / "points.json").read_text())["points"]
texts_path = directory / "texts.json"
if not texts_path.exists():
    raise SystemExit(f"{texts_path} is missing. Run: node --env-file=.env scripts/export-atlas-texts.mjs")
bodies = json.loads(texts_path.read_text())
if len(points) != len(xyz):
    raise SystemExit(f"{len(points)} points against {len(xyz)} positions; atlas.bin and points.json are from different runs.")
print(f"{len(xyz):,} points")

# ---- the text each reading contributes, without its own artist's name ------
word = re.compile(r"[^\W\d_]{3,}", re.UNICODE)


def own_text(point):
    body = bodies.get(point["interpretationId"], "")
    # The institution too: "staatliche kunsthalle" says where a work hangs.
    names = {
        token.lower()
        for field in ("artist", "institution")
        for token in word.findall(point.get(field) or "")
    }
    if not names:
        return body
    return word.sub(lambda m: " " if m.group(0).lower() in names else m.group(0), body)


documents = [own_text(point) for point in points]
vectorizer = CountVectorizer(
    stop_words=STOP_WORDS,
    token_pattern=r"(?u)\b[^\W\d_]{3,}\b",
    ngram_range=(1, 2),
    min_df=15,
    max_df=0.25,
    lowercase=True,
)
counts = vectorizer.fit_transform(documents).tocsr()
vocabulary = np.array(vectorizer.get_feature_names_out())
print(f"{len(vocabulary):,} terms")


def describe(labels):
    """Each cluster's telling terms, anchor, size and middle works."""
    ids = sorted(set(labels.tolist()) - {-1})
    # Cluster × term counts, from the core members only.
    rows = np.array([ids.index(label) if label >= 0 else -1 for label in labels])
    core = rows >= 0
    from scipy.sparse import csr_matrix

    indicator = csr_matrix((np.ones(core.sum()), (rows[core], np.flatnonzero(core))), shape=(len(ids), len(labels)))
    per_cluster = (indicator @ counts).toarray()
    # c-TF-IDF: a term's share of this cluster's words, against how common it
    # is across all clusters' words.
    tf = per_cluster / np.maximum(per_cluster.sum(axis=1, keepdims=True), 1)
    average_words = per_cluster.sum() / len(ids)
    idf = np.log(1 + average_words / np.maximum(per_cluster.sum(axis=0), 1))
    score = tf * idf

    clusters = []
    for row, label in enumerate(ids):
        members = np.flatnonzero(labels == label)
        top = []
        for term_index in np.argsort(-score[row]):
            term = vocabulary[term_index]
            if per_cluster[row, term_index] < max(5, 0.02 * len(members)):
                continue
            # A unigram already said inside a chosen bigram, or a bigram whose
            # words are both already chosen, adds nothing.
            if any(term in chosen.split() or set(term.split()) <= set(chosen.split()) for chosen in top):
                continue
            top.append(term)
            if len(top) == 8:
                break
        mean = xyz[members].mean(axis=0)
        order = members[np.argsort(((xyz[members] - mean) ** 2).sum(axis=1))]
        # Anchored on the member nearest the mean, not the mean, which for a
        # curved cluster can fall in empty space.
        anchor = xyz[order[0]]
        examples, seen = [], set()
        for index in order:
            point = points[index]
            if point["resourceId"] in seen:
                continue
            seen.add(point["resourceId"])
            examples.append({
                "title": point.get("title") or "Untitled",
                "artist": point.get("artist"),
                "year": point.get("notBefore"),
                "excerpt": (bodies.get(point["interpretationId"]) or "")[:240],
            })
            if len(examples) == 8:
                break
        clusters.append({
            "id": int(label),
            "size": int(len(members)),
            "center": [round(float(v), 4) for v in anchor],
            "terms": top,
            "examples": examples,
        })
    return clusters


def assign_rest(labels):
    clustered = np.flatnonzero(labels >= 0)
    rest = np.flatnonzero(labels < 0)
    out = labels.copy()
    if len(rest) and len(clustered):
        _, nearest = cKDTree(xyz[clustered]).query(xyz[rest])
        out[rest] = labels[clustered[nearest]]
    return out


levels = {}
for level, size in [("regions", args.region_size), ("neighborhoods", args.hood_size)]:
    core = HDBSCAN(min_cluster_size=size, min_samples=args.min_samples, cluster_selection_method="leaf", copy=True).fit_predict(xyz)
    clusters = describe(core)
    labels = assign_rest(core)
    for cluster in clusters:
        cluster["size"] = int((labels == cluster["id"]).sum())
    levels[level] = (labels, clusters)
    print(f"{level}: {len(clusters)} clusters; {int((core < 0).sum()):,} points joined their nearest")

if len(levels["regions"][1]) >= NOISE_U8 or len(levels["neighborhoods"][1]) >= NOISE_U16:
    raise SystemExit("Too many clusters for the binary's id width; raise --region-size or --hood-size.")

# ---- atlas-v2.bin: v1's sections untouched, two appended -------------------
region_bytes = np.where(levels["regions"][0] < 0, NOISE_U8, levels["regions"][0]).astype("u1").tobytes()
hood_bytes = np.where(levels["neighborhoods"][0] < 0, NOISE_U16, levels["neighborhoods"][0]).astype("<u2").tobytes()
header = np.array([FORMAT_VERSION], dtype="<u4").tobytes()
# The header's second word is the format version (MAGIC, version, count, dims).
out = bytearray(buffer)
out[4:8] = header
layout = dict(manifest["layout"])
for name, payload, dtype in (("regions", region_bytes, "uint8"), ("neighborhoods", hood_bytes, "uint16")):
    out += b"\0" * ((-len(out)) % 4)  # typed-array views need aligned offsets
    layout[name] = {"offset": len(out), "byteLength": len(payload), "dtype": dtype}
    out += payload
(directory / "atlas-v2.bin").write_bytes(bytes(out))

(directory / "atlas-v2.json").write_text(json.dumps({
    **manifest,
    "formatVersion": FORMAT_VERSION,
    "clustering": {
        "algorithm": "hdbscan",
        "selection": "leaf",
        "minSamples": args.min_samples,
        "regionMinSize": args.region_size,
        "neighborhoodMinSize": args.hood_size,
        "on": "3d layout",
        "terms": "class-based tf-idf over reading bodies, own artist and institution removed",
    },
    "noise": {"uint8": NOISE_U8, "uint16": NOISE_U16},
    "layout": layout,
}, indent="\t"))
(directory / "clusters.json").write_text(json.dumps({level: clusters for level, (_, clusters) in levels.items()}, ensure_ascii=False, indent=1))
print(f"Wrote {directory / 'atlas-v2.bin'} ({len(out) / 1024 / 1024:.2f} MB), atlas-v2.json and clusters.json")
