-- Semantic search over the Panofsky readings. `Interpretation.body` is English
-- prose about works whose titles, artists and institutions are overwhelmingly
-- German, so lexical search fails the moment a visitor types the language the
-- site is actually in. bge-m3 embeds both languages into one space — measured
-- 0.89 cosine between an English and a German phrasing of the same reading,
-- against 0.33 for an unrelated one — which is why the vector lives here rather
-- than a tsvector.
CREATE EXTENSION IF NOT EXISTS vector;

-- Kept out of "Interpretation" so the dossier's ordinary reads never carry a
-- 4 KB vector, and so a re-embedding under a different model is a truncate of
-- this table rather than a migration of that one.
CREATE TABLE "InterpretationEmbedding" (
    "interpretation_id" TEXT NOT NULL,
    -- Denormalised from "Interpretation" so the ANN scan can collapse to one
    -- hit per work without joining back across 108k rows mid-query.
    "resource_id" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    -- bge-m3, 1024 dimensions, L2-normalised by the model (‖v‖ = 1.000), so
    -- cosine distance and inner product rank identically.
    "embedding" vector(1024) NOT NULL,
    "model" TEXT NOT NULL,
    -- SHA-256 of the exact string handed to the model, model id included. An
    -- edited body or a changed metadata prefix changes the hash, which is how
    -- the backfill script knows to re-embed a row instead of skipping it.
    "input_hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterpretationEmbedding_pkey" PRIMARY KEY ("interpretation_id")
);

CREATE INDEX "InterpretationEmbedding_resource_id_idx" ON "InterpretationEmbedding"("resource_id");
CREATE INDEX "InterpretationEmbedding_level_idx" ON "InterpretationEmbedding"("level");

ALTER TABLE "InterpretationEmbedding"
    ADD CONSTRAINT "InterpretationEmbedding_interpretation_id_fkey"
    FOREIGN KEY ("interpretation_id") REFERENCES "Interpretation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InterpretationEmbedding"
    ADD CONSTRAINT "InterpretationEmbedding_resource_id_fkey"
    FOREIGN KEY ("resource_id") REFERENCES "Resource"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- The default 64MB spills an HNSW build of this size to disk. USERSET, so this
-- needs no elevated role on RDS, and it lapses with the session.
SET maintenance_work_mem = '512MB';

-- vector_cosine_ops to match the query operator in
-- `app/utils/semantic-search.server.ts`; an index built for one operator class
-- is simply not used by another, and the planner falls back to a seq scan
-- without saying so.
CREATE INDEX "InterpretationEmbedding_embedding_idx"
    ON "InterpretationEmbedding" USING hnsw ("embedding" vector_cosine_ops);
