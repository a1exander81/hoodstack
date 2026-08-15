-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LedgerEntryType" ADD VALUE 'WAGER';
ALTER TYPE "LedgerEntryType" ADD VALUE 'PAYOUT';

-- AlterTable
ALTER TABLE "LedgerEntry" ADD COLUMN     "gameRoundId" TEXT,
ALTER COLUMN "asset" DROP NOT NULL,
ALTER COLUMN "chainId" DROP NOT NULL,
ALTER COLUMN "txHash" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "LedgerEntry_gameRoundId_idx" ON "LedgerEntry"("gameRoundId");

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_gameRoundId_fkey" FOREIGN KEY ("gameRoundId") REFERENCES "GameRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
