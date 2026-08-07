-- Gives every work a fixed random place, so the index can open on the archive
-- rather than on the alphabet.
--
-- The index is the homepage, and its default order was `title ASC`. That put
-- all 60 rows of the first page — every first page, every visit, since launch —
-- inside one series: "100 berühmte Ansichten von Edo", 120 sheets by Utagawa
-- Hiroshige, which lead the corpus for no better reason than starting with a
-- digit. Any other column has the same defect with a different series at the
-- head of it. Only an order with no meaning can avoid making one.
--
-- A stored column rather than `ORDER BY random()` or `ORDER BY md5(id::text ||
-- seed)`: both of those sort the whole corpus on every request, which the 1 GB
-- instance can do in ~50 ms and shouldn't have to do at all, and neither can be
-- paginated — a reader turning to page 2 would be dealt a fresh deck and shown
-- works they had already seen. One indexed column is a permutation that holds
-- still while it is being read.
--
-- DOUBLE PRECISION rather than an integer: this is a sort key and nothing else,
-- so its only requirements are that collisions are rare and that new works fall
-- somewhere in the middle rather than at the end.
ALTER TABLE "Resource" ADD COLUMN "shuffle" DOUBLE PRECISION NOT NULL DEFAULT random();

-- `random()` is volatile, so the ADD COLUMN above rewrites the table and deals
-- every existing row its own value; the default then deals every future one at
-- insert. Nothing in the application ever writes this column.

-- Without this the deal is worse than the alphabet: a sequential scan and a sort
-- of 54,497 rows per page turn. With it, "the next 60 from here" is an index
-- scan wherever "here" happens to fall.
CREATE INDEX "Resource_shuffle_idx" ON "Resource"("shuffle");
