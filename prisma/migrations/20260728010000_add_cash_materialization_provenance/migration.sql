-- Keep recurring-cash provenance after its source rule is deleted, and record
-- the real posting instant for all rows created after this migration.
ALTER TABLE "CashTransaction"
  ADD COLUMN "materializedAt" TIMESTAMPTZ(3),
  ADD COLUMN "materializedAtEstimated" BOOLEAN NOT NULL DEFAULT false;

-- Legacy materialization overwrote CashTransaction.createdAt with the
-- occurrence-day midnight. For still-linked rows, the later of that value and
-- the rule's creation time is the best recoverable lower bound:
--   * a rule created after its first occurrence identifies an immediate
--     backfill that could not have posted before the rule existed;
--   * older scheduled/catch-up rows retain the occurrence-day estimate.
--
-- Mark every recovered timestamp as estimated so analysis never presents it
-- as an exact posting instant. Rows whose rule was already deleted have
-- recurringId = NULL (ON DELETE SET NULL) and are indistinguishable from
-- manual occurrence-dated rows, so this migration intentionally leaves them
-- unclassified rather than guessing.
UPDATE "CashTransaction" AS cash
SET
  "materializedAt" =
    GREATEST(cash."createdAt", rule."createdAt") AT TIME ZONE 'UTC',
  "materializedAtEstimated" = true
FROM "RecurringCashTransaction" AS rule
WHERE cash."recurringId" = rule."id";

-- Analysis floors exact generated rows by account and posting instant.
CREATE INDEX "CashTransaction_accountId_materializedAt_idx"
  ON "CashTransaction"("accountId", "materializedAt");
