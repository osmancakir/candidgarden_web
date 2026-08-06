-- A drift verdict records what a work did to a reader, which is a different kind
-- of fact from anything else in this database: not a claim about the picture,
-- but a claim about the person looking. It is kept apart from `Favorite` for
-- that reason — a favourite is a bookmark a signed-in reader curates and returns
-- to; a verdict is one datum in a sample, including the negative and the
-- indifferent ones, and is worthless if the reader is free to keep only the
-- flattering half.
--
-- The three verdicts are PULL, PUSH and REST — a force the work exerted rather
-- than a rating the reader awarded it. "Like" would invite someone to report the
-- opinion they think they ought to hold; a pull is something that either
-- happened in front of a picture or did not, which is the only kind of fact this
-- table is any good at holding. `verdict` is TEXT rather than an enum so the
-- vocabulary can move without a type migration.
--
-- `drift_id` is one run of the drift, not a login — `Session` in this schema is
-- the latter, so the column says which of the two it is.
CREATE TABLE "DriftVerdict" (
    "id" TEXT NOT NULL,
    "drift_id" TEXT NOT NULL,
    "user_id" TEXT,
    "resource_id" INTEGER NOT NULL,
    "verdict" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'SPREAD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriftVerdict_pkey" PRIMARY KEY ("id")
);

-- One verdict per work per drift. The route upserts on this pair, so a reader
-- who swipes the same card twice revises the verdict rather than weighting it
-- twice.
CREATE UNIQUE INDEX "DriftVerdict_drift_id_resource_id_key" ON "DriftVerdict"("drift_id", "resource_id");

-- Every read the drift performs is "this drift's verdicts, in order".
CREATE INDEX "DriftVerdict_drift_id_createdAt_idx" ON "DriftVerdict"("drift_id", "createdAt");

-- For claiming anonymous drifts onto an account.
CREATE INDEX "DriftVerdict_user_id_idx" ON "DriftVerdict"("user_id");

ALTER TABLE "DriftVerdict" ADD CONSTRAINT "DriftVerdict_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL rather than CASCADE: deleting an account removes the person from the
-- drift, not the drift from the record.
ALTER TABLE "DriftVerdict" ADD CONSTRAINT "DriftVerdict_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
