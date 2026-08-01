-- Enable vector similarity search. Amazon RDS for PostgreSQL provides this
-- extension; the local pgvector image in compose.yaml provides it as well.
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ownerId" TEXT NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteImage" (
    "id" TEXT NOT NULL,
    "altText" TEXT,
    "objectKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "noteId" TEXT NOT NULL,

    CONSTRAINT "NoteImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserImage" (
    "id" TEXT NOT NULL,
    "altText" TEXT,
    "objectKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "UserImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Password" (
    "hash" TEXT NOT NULL,
    "userId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "expirationDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "access" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "digits" INTEGER NOT NULL,
    "period" INTEGER NOT NULL,
    "charSet" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Connection" (
    "id" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Passkey" (
    "id" TEXT NOT NULL,
    "aaguid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "userId" TEXT NOT NULL,
    "webauthnUserId" TEXT NOT NULL,
    "counter" BIGINT NOT NULL,
    "deviceType" TEXT NOT NULL,
    "backedUp" BOOLEAN NOT NULL,
    "transports" TEXT,

    CONSTRAINT "Passkey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PermissionToRole" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PermissionToRole_AB_pkey" PRIMARY KEY ("A", "B")
);

-- CreateTable
CREATE TABLE "_RoleToUser" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_RoleToUser_AB_pkey" PRIMARY KEY ("A", "B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "Note_ownerId_idx" ON "Note"("ownerId");

-- CreateIndex
CREATE INDEX "Note_ownerId_updatedAt_idx" ON "Note"("ownerId", "updatedAt");

-- CreateIndex
CREATE INDEX "NoteImage_noteId_idx" ON "NoteImage"("noteId");

-- CreateIndex
CREATE UNIQUE INDEX "UserImage_userId_key" ON "UserImage"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Password_userId_key" ON "Password"("userId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_action_entity_access_key" ON "Permission"("action", "entity", "access");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Verification_target_type_key" ON "Verification"("target", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Connection_providerName_providerId_key" ON "Connection"("providerName", "providerId");

-- CreateIndex
CREATE INDEX "Passkey_userId_idx" ON "Passkey"("userId");

-- CreateIndex
CREATE INDEX "_PermissionToRole_B_index" ON "_PermissionToRole"("B");

-- CreateIndex
CREATE INDEX "_RoleToUser_B_index" ON "_RoleToUser"("B");

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteImage" ADD CONSTRAINT "NoteImage_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserImage" ADD CONSTRAINT "UserImage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Password" ADD CONSTRAINT "Password_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Passkey" ADD CONSTRAINT "Passkey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PermissionToRole" ADD CONSTRAINT "_PermissionToRole_A_fkey" FOREIGN KEY ("A") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PermissionToRole" ADD CONSTRAINT "_PermissionToRole_B_fkey" FOREIGN KEY ("B") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RoleToUser" ADD CONSTRAINT "_RoleToUser_A_fkey" FOREIGN KEY ("A") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RoleToUser" ADD CONSTRAINT "_RoleToUser_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the authorization data required by signup and permission checks.
INSERT INTO "Permission" ("id", "action", "entity", "access", "description", "createdAt", "updatedAt") VALUES
    ('clnf2zvli0000pcou3zzzzome', 'create', 'user', 'own', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('clnf2zvll0001pcouly1310ku', 'create', 'user', 'any', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('clnf2zvll0002pcouka7348re', 'read', 'user', 'own', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('clnf2zvlm0003pcouea4dee51', 'read', 'user', 'any', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('clnf2zvlm0004pcou2guvolx5', 'update', 'user', 'own', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('clnf2zvln0005pcoun78ps5ap', 'update', 'user', 'any', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('clnf2zvlo0006pcouyoptc5jp', 'delete', 'user', 'own', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('clnf2zvlo0007pcouw1yzoyam', 'delete', 'user', 'any', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('clnf2zvlp0008pcou9r0fhbm8', 'create', 'note', 'own', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('clnf2zvlp0009pcouj3qib9q9', 'create', 'note', 'any', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('clnf2zvlq000apcouxnspejs9', 'read', 'note', 'own', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('clnf2zvlr000bpcouf4cg3x72', 'read', 'note', 'any', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('clnf2zvlr000cpcouy1vp6oeg', 'update', 'note', 'own', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('clnf2zvls000dpcouvzwjjzrq', 'update', 'note', 'any', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('clnf2zvls000epcou4ts5ui8f', 'delete', 'note', 'own', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('clnf2zvlt000fpcouk29jbmxn', 'delete', 'note', 'any', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "Role" ("id", "name", "description", "createdAt", "updatedAt") VALUES
    ('clnf2zvlw000gpcour6dyyuh6', 'admin', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('clnf2zvlx000hpcou5dfrbegs', 'user', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "_PermissionToRole" ("A", "B") VALUES
    ('clnf2zvll0001pcouly1310ku', 'clnf2zvlw000gpcour6dyyuh6'),
    ('clnf2zvlm0003pcouea4dee51', 'clnf2zvlw000gpcour6dyyuh6'),
    ('clnf2zvln0005pcoun78ps5ap', 'clnf2zvlw000gpcour6dyyuh6'),
    ('clnf2zvlo0007pcouw1yzoyam', 'clnf2zvlw000gpcour6dyyuh6'),
    ('clnf2zvlp0009pcouj3qib9q9', 'clnf2zvlw000gpcour6dyyuh6'),
    ('clnf2zvlr000bpcouf4cg3x72', 'clnf2zvlw000gpcour6dyyuh6'),
    ('clnf2zvls000dpcouvzwjjzrq', 'clnf2zvlw000gpcour6dyyuh6'),
    ('clnf2zvlt000fpcouk29jbmxn', 'clnf2zvlw000gpcour6dyyuh6'),
    ('clnf2zvli0000pcou3zzzzome', 'clnf2zvlx000hpcou5dfrbegs'),
    ('clnf2zvll0002pcouka7348re', 'clnf2zvlx000hpcou5dfrbegs'),
    ('clnf2zvlm0004pcou2guvolx5', 'clnf2zvlx000hpcou5dfrbegs'),
    ('clnf2zvlo0006pcouyoptc5jp', 'clnf2zvlx000hpcou5dfrbegs'),
    ('clnf2zvlp0008pcou9r0fhbm8', 'clnf2zvlx000hpcou5dfrbegs'),
    ('clnf2zvlq000apcouxnspejs9', 'clnf2zvlx000hpcou5dfrbegs'),
    ('clnf2zvlr000cpcouy1vp6oeg', 'clnf2zvlx000hpcou5dfrbegs'),
    ('clnf2zvls000epcou4ts5ui8f', 'clnf2zvlx000hpcou5dfrbegs');
