-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "rawUrl" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "failureReason" TEXT,
    "rawText" TEXT,
    "transcript" TEXT,
    "pdfPath" TEXT,
    "summary" TEXT,
    "keyFacts" TEXT,
    "tags" TEXT,
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "episodeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Item_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Episode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'daily',
    "script" TEXT NOT NULL,
    "audioPath" TEXT NOT NULL,
    "durationSec" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Item_url_key" ON "Item"("url");
