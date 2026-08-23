-- Persist the selected per-channel strategy. Historical grade projections keep
-- nullable identity columns so existing grades remain available but stale.
ALTER TABLE "Integration"
  ADD COLUMN "strategyId" TEXT,
  ADD COLUMN "strategyVersion" INTEGER;

UPDATE "Integration"
SET
  "strategyId" = 'grow_audience',
  "strategyVersion" = 1
WHERE "strategyId" IS NULL OR "strategyVersion" IS NULL;

ALTER TABLE "Integration"
  ALTER COLUMN "strategyId" SET NOT NULL,
  ALTER COLUMN "strategyId" SET DEFAULT 'grow_audience',
  ALTER COLUMN "strategyVersion" SET NOT NULL,
  ALTER COLUMN "strategyVersion" SET DEFAULT 1;

ALTER TABLE "ChannelAudienceMember"
  ADD COLUMN "relationshipStrategyId" TEXT,
  ADD COLUMN "relationshipStrategyVersion" INTEGER;

ALTER TABLE "ChannelRelationshipGradeSnapshot"
  ADD COLUMN "relationshipStrategyId" TEXT,
  ADD COLUMN "relationshipStrategyVersion" INTEGER;

DROP INDEX IF EXISTS "ChannelAudienceMember_rel_formula_due_idx";
CREATE INDEX "ChannelAudienceMember_rel_formula_due_idx"
  ON "ChannelAudienceMember"(
    "integrationId",
    "membershipState",
    "relationshipFormulaVersion",
    "relationshipStrategyId",
    "relationshipStrategyVersion",
    "relationshipSnapshotAt"
  );
