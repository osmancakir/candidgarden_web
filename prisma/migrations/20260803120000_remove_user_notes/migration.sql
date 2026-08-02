-- Remove the discontinued user-notes feature and its authorization records.
DELETE FROM "Permission" WHERE "entity" = 'note';

DROP TABLE "NoteImage";
DROP TABLE "Note";
