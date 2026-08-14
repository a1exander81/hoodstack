-- CreateEnum
CREATE TYPE "GameKind" AS ENUM ('COINFLIP', 'CRASH', 'MINES', 'ROULETTE');

-- CreateTable
CREATE TABLE "SeedPair" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serverSeed" TEXT NOT NULL,
    "serverSeedHash" TEXT NOT NULL,
    "clientSeed" TEXT NOT NULL,
    "nonce" INTEGER NOT NULL DEFAULT 0,
    "revealedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeedPair_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameRound" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seedPairId" TEXT NOT NULL,
    "nonce" INTEGER NOT NULL,
    "game" "GameKind" NOT NULL,
    "outcome" JSONB NOT NULL,
    "wagerMicroUsd" BIGINT NOT NULL,
    "payoutMicroUsd" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameRound_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeedPair_userId_idx" ON "SeedPair"("userId");

-- At most one ACTIVE seed pair per user. Not expressible in Prisma
-- schema syntax, so it lives here as raw SQL and must survive any
-- future regeneration of this migration. Without it, two active pairs
-- can exist for one user and "which pair was this round under" stops
-- having a single answer -- which is the whole basis of a dispute.
CREATE UNIQUE INDEX "SeedPair_userId_active_key" ON "SeedPair"("userId") WHERE "revealedAt" IS NULL;

-- CreateIndex
CREATE INDEX "GameRound_userId_createdAt_idx" ON "GameRound"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GameRound_seedPairId_nonce_key" ON "GameRound"("seedPairId", "nonce");

-- AddForeignKey
ALTER TABLE "GameRound" ADD CONSTRAINT "GameRound_seedPairId_fkey" FOREIGN KEY ("seedPairId") REFERENCES "SeedPair"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
