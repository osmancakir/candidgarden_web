-- The Städel working area is gated behind a role rather than a hardcoded email
-- address, so access can be granted or revoked by touching one join row instead
-- of shipping a deploy. The role carries no permissions: it exists only so
-- `requireUserWithRole(request, 'researcher')` has something to match against.
INSERT INTO "Role" ("id", "name", "description", "createdAt", "updatedAt") VALUES
    ('cmf0staedelresearcher0001', 'researcher', 'Access to unlisted research working areas.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
