-- CreateTable
CREATE TABLE IF NOT EXISTS "CalendarEarningsWatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'tracked',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarEarningsWatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CalendarEarningsWatch_userId_idx" ON "CalendarEarningsWatch"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CalendarEarningsWatch_userId_symbol_key" ON "CalendarEarningsWatch"("userId", "symbol");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'CalendarEarningsWatch_userId_fkey'
      AND conrelid = '"CalendarEarningsWatch"'::regclass
  ) THEN
    ALTER TABLE "CalendarEarningsWatch"
      ADD CONSTRAINT "CalendarEarningsWatch_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- RenameIndex
--
-- 202604120001_add_hot_path_indexes created these three indexes under
-- hand-written "_desc_idx" names, so replaying migration history (shadow
-- database, fresh self-host) produces those names while the schema expects
-- Prisma's default "_idx" names. Long-lived databases do not all carry the
-- legacy name: renaming unconditionally aborts the whole migration with
-- 42P01 ("relation ... does not exist") wherever the index is already named
-- "_idx", which then latches as P3009 and blocks every later deployment.
-- Rename only when there is something to rename, so both shapes converge.
ALTER INDEX IF EXISTS "CashTransaction_accountId_createdAt_desc_idx" RENAME TO "CashTransaction_accountId_createdAt_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "HoldingTransaction_holdingId_createdAt_desc_idx" RENAME TO "HoldingTransaction_holdingId_createdAt_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "NetWorthSnapshot_userId_date_desc_idx" RENAME TO "NetWorthSnapshot_userId_date_idx";
