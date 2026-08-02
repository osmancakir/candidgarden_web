-- CreateTable
CREATE TABLE "Artist" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "wikiDataId" TEXT,

    CONSTRAINT "Artist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" SERIAL NOT NULL,
    "artist_id" INTEGER,
    "title" TEXT,
    "title_en" TEXT,
    "not_before" INTEGER,
    "not_after" INTEGER,
    "location" TEXT,
    "institution" TEXT,
    "path" TEXT,
    "objectKey" TEXT,
    "wikiDataId" TEXT,
    "highlight" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Institution" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "wikiDataId" TEXT,
    "imageUrl" TEXT,
    "objectKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Institution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WikiDataVerification" (
    "id" SERIAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "artistId" INTEGER,
    "resourceId" INTEGER,
    "institutionId" INTEGER,

    CONSTRAINT "WikiDataVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Relation" (
    "id" SERIAL NOT NULL,
    "resource_id_1" INTEGER NOT NULL,
    "resource_id_2" INTEGER NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "Relation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "category" TEXT,
    "safety" TEXT,
    "human" INTEGER NOT NULL DEFAULT 0,
    "ai_gpt_4o" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tagging" (
    "id" SERIAL NOT NULL,
    "resource_id" INTEGER NOT NULL,
    "tag_id" TEXT NOT NULL,
    "frequency" INTEGER NOT NULL,

    CONSTRAINT "Tagging_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "resourceId" INTEGER NOT NULL,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Music" (
    "id" SERIAL NOT NULL,
    "source" TEXT NOT NULL,
    "track_name" TEXT NOT NULL,
    "artist_name" TEXT NOT NULL,
    "album" TEXT NOT NULL,
    "isrc" TEXT NOT NULL,
    "spotify_id" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "genre" TEXT NOT NULL,
    "release_year" INTEGER NOT NULL,
    "youtube_url" TEXT NOT NULL DEFAULT '',
    "highlight" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Music_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Confession" (
    "id" SERIAL NOT NULL,
    "confession" TEXT NOT NULL,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "musicExp" TEXT,
    "artExp" TEXT,
    "mood" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "score" INTEGER,

    CONSTRAINT "Confession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfessionMusic" (
    "id" SERIAL NOT NULL,
    "confessionId" INTEGER NOT NULL,
    "musicId" INTEGER NOT NULL,

    CONSTRAINT "ConfessionMusic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfessionArt" (
    "id" SERIAL NOT NULL,
    "confessionId" INTEGER NOT NULL,
    "artId" INTEGER NOT NULL,

    CONSTRAINT "ConfessionArt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" SERIAL NOT NULL,
    "confessionId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PdfDownload" (
    "id" SERIAL NOT NULL,
    "fileName" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "country" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PdfDownload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchSubmission" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "query" TEXT NOT NULL,

    CONSTRAINT "SearchSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Artist_name_idx" ON "Artist"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Resource_objectKey_key" ON "Resource"("objectKey");

-- CreateIndex
CREATE INDEX "Resource_artist_id_idx" ON "Resource"("artist_id");

-- CreateIndex
CREATE INDEX "Resource_highlight_idx" ON "Resource"("highlight");

-- CreateIndex
CREATE INDEX "Resource_title_location_idx" ON "Resource"("title", "location");

-- CreateIndex
CREATE UNIQUE INDEX "Institution_objectKey_key" ON "Institution"("objectKey");

-- CreateIndex
CREATE INDEX "Institution_name_idx" ON "Institution"("name");

-- CreateIndex
CREATE UNIQUE INDEX "WikiDataVerification_artistId_key" ON "WikiDataVerification"("artistId");

-- CreateIndex
CREATE UNIQUE INDEX "WikiDataVerification_resourceId_key" ON "WikiDataVerification"("resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "WikiDataVerification_institutionId_key" ON "WikiDataVerification"("institutionId");

-- CreateIndex
CREATE INDEX "Relation_resource_id_1_resource_id_2_type_idx" ON "Relation"("resource_id_1", "resource_id_2", "type");

-- CreateIndex
CREATE INDEX "Tag_name_language_idx" ON "Tag"("name", "language");

-- CreateIndex
CREATE INDEX "Tag_category_safety_idx" ON "Tag"("category", "safety");

-- CreateIndex
CREATE INDEX "Tagging_resource_id_tag_id_idx" ON "Tagging"("resource_id", "tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_userId_resourceId_key" ON "Favorite"("userId", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Music_isrc_key" ON "Music"("isrc");

-- CreateIndex
CREATE UNIQUE INDEX "Music_spotify_id_key" ON "Music"("spotify_id");

-- CreateIndex
CREATE INDEX "Music_highlight_idx" ON "Music"("highlight");

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiDataVerification" ADD CONSTRAINT "WikiDataVerification_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiDataVerification" ADD CONSTRAINT "WikiDataVerification_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiDataVerification" ADD CONSTRAINT "WikiDataVerification_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiDataVerification" ADD CONSTRAINT "WikiDataVerification_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relation" ADD CONSTRAINT "Relation_resource_id_1_fkey" FOREIGN KEY ("resource_id_1") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relation" ADD CONSTRAINT "Relation_resource_id_2_fkey" FOREIGN KEY ("resource_id_2") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tagging" ADD CONSTRAINT "Tagging_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tagging" ADD CONSTRAINT "Tagging_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfessionMusic" ADD CONSTRAINT "ConfessionMusic_confessionId_fkey" FOREIGN KEY ("confessionId") REFERENCES "Confession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfessionMusic" ADD CONSTRAINT "ConfessionMusic_musicId_fkey" FOREIGN KEY ("musicId") REFERENCES "Music"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfessionArt" ADD CONSTRAINT "ConfessionArt_confessionId_fkey" FOREIGN KEY ("confessionId") REFERENCES "Confession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfessionArt" ADD CONSTRAINT "ConfessionArt_artId_fkey" FOREIGN KEY ("artId") REFERENCES "Resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_confessionId_fkey" FOREIGN KEY ("confessionId") REFERENCES "Confession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
