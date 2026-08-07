-- Gives works a reconciled holder alongside the string the cataloguer typed.
--
-- `Institution` has existed and been empty since the legacy import, because
-- there was nothing to key a row on: the archive records its holders as free
-- text on the work, 4,181 distinct spellings of them. Reconciling those strings
-- against Wikidata produced 956 identified institutions, so the table can now
-- be filled with one row per institution rather than one per spelling — the
-- Rijksmuseum is named four ways in this archive and is Q190804 every time.
--
-- `Resource.institution` stays exactly as it is. It is what the archive filter
-- and the work page read today, and for the ~10,500 works whose holder could
-- not be reconciled it remains the only record of where the thing is. The new
-- column sits beside it and is null wherever the reconciliation had no answer,
-- which means "not reconciled" and never "no holder".
ALTER TABLE "Resource" ADD COLUMN "institution_id" INTEGER;

-- `wikiDataId` becomes the natural key for the table. The import is keyed on it
-- and re-runnable, and the constraint is what makes a second run update the row
-- it created the first time instead of adding a rival for the same museum.
-- Plain rather than partial: Postgres already counts nulls as distinct in a
-- unique index, so any number of rows may be unreconciled while a real QID may
-- appear on only one — and a partial index here would drift from the plain one
-- Prisma's `@unique` expects.
CREATE UNIQUE INDEX "Institution_wikiDataId_key" ON "Institution"("wikiDataId");

-- Every read is "this institution's works".
CREATE INDEX "Resource_institution_id_idx" ON "Resource"("institution_id");

-- SET NULL rather than CASCADE: removing an institution from the register must
-- not remove the works from the archive. They fall back to the string, which is
-- where they were before this migration.
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
