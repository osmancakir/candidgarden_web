-- Levels II and III of the Panofsky descent had no backing store: everything on
-- a dossier was derived from Tagging, and an iconographic or iconological
-- reading is a claim rather than an aggregate. This table holds those claims,
-- one per work per level, with their provenance attached so machine-drafted
-- prose is never rendered as though a curator wrote it.
CREATE TABLE "Interpretation" (
    "id" TEXT NOT NULL,
    "resource_id" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'EDITORIAL',
    "authorId" TEXT,
    "citation" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Interpretation_pkey" PRIMARY KEY ("id")
);

-- One published reading per level per work; a later editorial pass supersedes
-- the imported row in place rather than accumulating duplicates beside it.
CREATE UNIQUE INDEX "Interpretation_resource_id_level_key" ON "Interpretation"("resource_id", "level");

-- The dossier loader's only access pattern: published rows for one work.
CREATE INDEX "Interpretation_resource_id_level_publishedAt_idx" ON "Interpretation"("resource_id", "level", "publishedAt");

ALTER TABLE "Interpretation" ADD CONSTRAINT "Interpretation_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Interpretation" ADD CONSTRAINT "Interpretation_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
