-- Add clonedFromId self-relation to Transaction so the "Copy transaction"
-- action can keep traceability to the source row. ON DELETE SET NULL means
-- deleting the original does not cascade and break the clone's history.

ALTER TABLE "Transaction"
  ADD COLUMN "clonedFromId" TEXT;

ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_clonedFromId_fkey"
  FOREIGN KEY ("clonedFromId") REFERENCES "Transaction"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Transaction_clonedFromId_idx"
  ON "Transaction"("clonedFromId");
