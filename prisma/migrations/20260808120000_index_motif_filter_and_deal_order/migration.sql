-- Three indexes: two the motif filter has always needed, and one the deal
-- shipped without.
--
-- Measured against production, `?motif=man` cost 11.9 s where the unfiltered
-- index cost 0.9 s. Six of those in flight was enough to saturate the instance,
-- and every route sharing it — including the ones that filter nothing — then
-- timed out at the Worker and returned 500. The archive was down for the
-- ordinary reason a small database goes down: not the query anyone was watching,
-- but the cheap-looking one behind every motif chip on the page.

-- 1. Taggings by tag.
--
-- "Which works carry this motif" reads "Tagging" by "tag_id", and the only index
-- on the table is ("resource_id", "tag_id"). A composite b-tree cannot be
-- entered from its second column, so that question has always been answered by a
-- sequential scan of 5,805,481 rows — 276 MB of heap and ~4.5 s of read I/O per
-- request, through a 90 MB buffer pool that it evicts on the way past. That last
-- part is why the damage was never confined to the pages that asked for it.
CREATE INDEX "Tagging_tag_id_idx" ON "Tagging"("tag_id");

-- 2. Tags by name, case-insensitively.
--
-- The filter matches a motif name with Prisma's `mode: 'insensitive'`, which
-- compiles to ILIKE, and no b-tree answers ILIKE — so finding the three rows a
-- motif names scanned all 513,159 tags. Trigrams are the index that can, and
-- pg_trgm supports ILIKE directly, so the query keeps its meaning rather than
-- trading it for speed.
--
-- Which matters, because the case-insensitivity is load-bearing rather than
-- incidental: 3,541 of the corpus's distinct tag names differ from another only
-- by case. An exact match would not be the same query made faster, it would be a
-- different and quietly smaller set of works.
--
-- Pinned to "public" for the same reason the vector extension is — see
-- 20260803180000_add_interpretation_embeddings. The vitest workers migrate into
-- per-worker schemas of one shared database, and an unqualified CREATE EXTENSION
-- lands the operator class in whichever worker won the race, after which
-- IF NOT EXISTS silently no-ops for the others.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

CREATE INDEX "Tag_name_trgm_idx" ON "Tag" USING gin ("name" public.gin_trgm_ops);

-- 3. The deal, indexed the way it is actually read.
--
-- "Resource_shuffle_idx" covers ("shuffle"), but the deal orders by
-- ("shuffle", "id") — the tie-break that keeps a paginated ring from showing one
-- work twice and another never. Postgres can lead with the narrower index and
-- finish with an incremental sort, which is cheap at the head of the permutation
-- and stops being cheap where the deal actually reads: `dealOffset` cuts
-- anywhere in 54,497 rows, so a deep cut is the common case rather than the edge
-- one. At a deep cut the planner abandons the index for a sequential scan and an
-- external merge sort that spills past the 4 MB work_mem onto disk.
--
-- Created before the old one is dropped, so no request in the window between
-- them is left without an index to read the permutation by.
CREATE INDEX "Resource_shuffle_id_idx" ON "Resource"("shuffle", "id");

DROP INDEX "Resource_shuffle_idx";

-- "shuffle" arrived by table rewrite and has never been sampled — it has no row
-- in pg_stats at all, so every plan touching it has been estimating blind.
ANALYZE "Resource";
