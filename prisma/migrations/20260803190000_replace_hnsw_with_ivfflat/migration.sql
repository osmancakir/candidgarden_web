-- Replaces the HNSW index on "InterpretationEmbedding" with IVFFlat.
--
-- HNSW is the better index in the abstract and was the right first choice. It
-- is the wrong one for the instance this database actually runs on:
--
--   shared_buffers        92 MB
--   effective_cache_size 378 MB   (a ~1 GB instance)
--   raw vectors          368 MB   (89,800 x 1024 x 4 bytes)
--
-- HNSW walks a graph, reading a different node's vector at every hop, so a
-- single query touches a few hundred locations scattered across all 368 MB.
-- With a working set four times the cache that is random I/O on every hop, and
-- it never warms up because each query evicts what the last one loaded. The
-- same arithmetic made writes untenable: inserts held 165 rows/s until the
-- graph outgrew cache at ~11k rows, then fell to 14 rows/s, and a build could
-- only fit ~47k tuples in 256 MB of maintenance_work_mem before the remainder
-- went through the on-disk path at ~6 tuples/s — a two-hour CREATE INDEX.
--
-- IVFFlat clusters the vectors and reads only the probed lists, so a query
-- touches roughly `probes / lists` of the data. At the settings below that is
-- ~11%, or ~40 MB, which fits in cache. Recall is lower than HNSW at equal
-- speed; on this hardware the comparison is not against HNSW but against a
-- sequential scan of all 368 MB, which is what the table has today.
--
-- If the instance is ever scaled so that 368 MB fits comfortably in
-- shared_buffers, HNSW becomes the better choice again and this should be
-- revisited.
DROP INDEX IF EXISTS "InterpretationEmbedding_embedding_idx";

-- Modest, and serial: 512 MB cannot be allocated here at all, and parallel
-- workers take maintenance_work_mem as one shared segment, which fails outright
-- with "could not resize shared memory segment" (SQLSTATE 53200).
SET maintenance_work_mem = '128MB';
SET max_parallel_maintenance_workers = 0;

-- lists = rows / 1000, which is pgvector's guidance up to 1M rows (89,800 rows
-- -> ~90, rounded to 100). Unlike HNSW, an IVFFlat index must be built on
-- populated data: it k-means the existing vectors to place its centroids, so
-- building it on an empty table produces an index that never returns anything
-- useful. Both databases are loaded before this runs.
--
-- vector_cosine_ops to match the `<=>` operator in
-- `app/utils/semantic-search.server.ts`; an index built for one operator class
-- is simply not used by another, and the planner falls back to a seq scan
-- without saying so.
CREATE INDEX "InterpretationEmbedding_embedding_idx"
    ON "InterpretationEmbedding" USING ivfflat ("embedding" public.vector_cosine_ops)
    WITH (lists = 100);
