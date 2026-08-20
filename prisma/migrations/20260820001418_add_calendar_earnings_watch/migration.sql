-- CreateTable
CREATE TABLE "CalendarEarningsWatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'tracked',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarEarningsWatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarEarningsWatch_userId_idx" ON "CalendarEarningsWatch"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEarningsWatch_userId_symbol_key" ON "CalendarEarningsWatch"("userId", "symbol");

-- AddForeignKey
ALTER TABLE "CalendarEarningsWatch" ADD CONSTRAINT "CalendarEarningsWatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "CashTransaction_accountId_createdAt_desc_idx" RENAME TO "CashTransaction_accountId_createdAt_idx";

-- RenameIndex
ALTER INDEX "HoldingTransaction_holdingId_createdAt_desc_idx" RENAME TO "HoldingTransaction_holdingId_createdAt_idx";

-- RenameIndex
ALTER INDEX "NetWorthSnapshot_userId_date_desc_idx" RENAME TO "NetWorthSnapshot_userId_date_idx";
