-- CreateEnum
CREATE TYPE "CrashRoundStatus" AS ENUM ('BETTING', 'RUNNING', 'CRASHED');

-- CreateEnum
CREATE TYPE "CrashBetStatus" AS ENUM ('PLACED', 'CASHED_OUT', 'LOST');

-- AlterTable
ALTER TABLE "LedgerEntry" ADD COLUMN     "crashBetId" TEXT;

-- CreateTable
CREATE TABLE "CrashRound" (
    "id" TEXT NOT NULL,
    "serverSeed" TEXT NOT NULL,
    "serverSeedHash" TEXT NOT NULL,
    "status" "CrashRoundStatus" NOT NULL DEFAULT 'BETTING',
    "crashMultiplierBps" INTEGER,
    "bettingClosedAt" TIMESTAMP(3),
    "crashedAt" TIMESTAMP(3),
    "revealedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrashRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrashBet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "crashRoundId" TEXT NOT NULL,
    "wagerMicroUsd" BIGINT NOT NULL,
    "cashoutMultiplierBps" INTEGER,
    "status" "CrashBetStatus" NOT NULL DEFAULT 'PLACED',
    "payoutMicroUsd" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "CrashBet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrashRound_status_idx" ON "CrashRound"("status");

-- CreateIndex
CREATE INDEX "CrashBet_userId_createdAt_idx" ON "CrashBet"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CrashBet_crashRoundId_userId_key" ON "CrashBet"("crashRoundId", "userId");

-- CreateIndex
CREATE INDEX "LedgerEntry_crashBetId_idx" ON "LedgerEntry"("crashBetId");

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_crashBetId_fkey" FOREIGN KEY ("crashBetId") REFERENCES "CrashBet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrashBet" ADD CONSTRAINT "CrashBet_crashRoundId_fkey" FOREIGN KEY ("crashRoundId") REFERENCES "CrashRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
