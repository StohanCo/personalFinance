-- Account snapshots with daily upsert trigger support.
CREATE TABLE "AccountSnapshot" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "snapshotDate" DATE NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "name" TEXT NOT NULL,
  "type" "AccountType" NOT NULL,
  "currency" TEXT NOT NULL,
  "balance" DECIMAL(18,2) NOT NULL,
  "creditLimit" DECIMAL(18,2),
  "apr" DECIMAL(6,3),
  "color" TEXT NOT NULL,
  "notes" TEXT,
  "isArchived" BOOLEAN NOT NULL,
  CONSTRAINT "AccountSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountSnapshot_accountId_snapshotDate_key" ON "AccountSnapshot"("accountId", "snapshotDate");
CREATE INDEX "AccountSnapshot_userId_snapshotDate_idx" ON "AccountSnapshot"("userId", "snapshotDate");

ALTER TABLE "AccountSnapshot"
  ADD CONSTRAINT "AccountSnapshot_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AccountSnapshot"
  ADD CONSTRAINT "AccountSnapshot_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION snapshot_single_account_daily()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  day_key DATE := CURRENT_DATE;
BEGIN
  INSERT INTO "AccountSnapshot" (
    "id",
    "userId",
    "accountId",
    "snapshotDate",
    "capturedAt",
    "name",
    "type",
    "currency",
    "balance",
    "creditLimit",
    "apr",
    "color",
    "notes",
    "isArchived"
  )
  VALUES (
    CONCAT(NEW."id", '-', TO_CHAR(day_key, 'YYYYMMDD')),
    NEW."userId",
    NEW."id",
    day_key,
    NOW(),
    NEW."name",
    NEW."type",
    NEW."currency",
    NEW."balance",
    NEW."creditLimit",
    NEW."apr",
    NEW."color",
    NEW."notes",
    NEW."isArchived"
  )
  ON CONFLICT ("accountId", "snapshotDate") DO UPDATE
  SET
    "capturedAt" = NOW(),
    "name" = EXCLUDED."name",
    "type" = EXCLUDED."type",
    "currency" = EXCLUDED."currency",
    "balance" = EXCLUDED."balance",
    "creditLimit" = EXCLUDED."creditLimit",
    "apr" = EXCLUDED."apr",
    "color" = EXCLUDED."color",
    "notes" = EXCLUDED."notes",
    "isArchived" = EXCLUDED."isArchived";

  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_account_daily_snapshot
AFTER INSERT OR UPDATE OF "name", "type", "currency", "balance", "creditLimit", "apr", "color", "notes", "isArchived"
ON "Account"
FOR EACH ROW
EXECUTE FUNCTION snapshot_single_account_daily();

CREATE OR REPLACE FUNCTION snapshot_all_accounts_for_today()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  inserted_rows INTEGER := 0;
  day_key DATE := CURRENT_DATE;
BEGIN
  INSERT INTO "AccountSnapshot" (
    "id",
    "userId",
    "accountId",
    "snapshotDate",
    "capturedAt",
    "name",
    "type",
    "currency",
    "balance",
    "creditLimit",
    "apr",
    "color",
    "notes",
    "isArchived"
  )
  SELECT
    CONCAT(a."id", '-', TO_CHAR(day_key, 'YYYYMMDD')),
    a."userId",
    a."id",
    day_key,
    NOW(),
    a."name",
    a."type",
    a."currency",
    a."balance",
    a."creditLimit",
    a."apr",
    a."color",
    a."notes",
    a."isArchived"
  FROM "Account" a
  ON CONFLICT ("accountId", "snapshotDate") DO UPDATE
  SET
    "capturedAt" = NOW(),
    "name" = EXCLUDED."name",
    "type" = EXCLUDED."type",
    "currency" = EXCLUDED."currency",
    "balance" = EXCLUDED."balance",
    "creditLimit" = EXCLUDED."creditLimit",
    "apr" = EXCLUDED."apr",
    "color" = EXCLUDED."color",
    "notes" = EXCLUDED."notes",
    "isArchived" = EXCLUDED."isArchived";

  GET DIAGNOSTICS inserted_rows = ROW_COUNT;
  RETURN inserted_rows;
END;
$$;
