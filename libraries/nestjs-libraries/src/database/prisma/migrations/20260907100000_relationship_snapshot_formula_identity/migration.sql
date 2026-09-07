-- Let rolling relationship-formula workers persist the same observation.
-- Create the wider unique index before dropping the old one so uniqueness is
-- continuously enforced throughout the migration.
CREATE UNIQUE INDEX "ChannelRelationshipGradeSnapshot_formula_identity_key"
ON "ChannelRelationshipGradeSnapshot"(
  "integrationId",
  "counterpartyExternalId",
  "snapshotAt",
  "formulaVersion"
);

DROP INDEX "ChannelRelationshipGradeSnapshot_integrationId_counterparty_key";

-- A worker from the previous release may still attempt to update the current
-- projection after v5 has landed. Preserve every relationship projection
-- field when that update would lower the stored formula version.
CREATE FUNCTION preserve_newer_relationship_projection()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."relationshipFormulaVersion" IS NOT NULL
     AND NEW."relationshipFormulaVersion" IS NOT NULL
     AND NEW."relationshipFormulaVersion" < OLD."relationshipFormulaVersion" THEN
    NEW."relationshipGrade" := OLD."relationshipGrade";
    NEW."relationshipEffortScore" := OLD."relationshipEffortScore";
    NEW."relationshipReciprocationScore" := OLD."relationshipReciprocationScore";
    NEW."relationshipNetGap" := OLD."relationshipNetGap";
    NEW."relationshipTriage" := OLD."relationshipTriage";
    NEW."relationshipFormulaVersion" := OLD."relationshipFormulaVersion";
    NEW."relationshipStrategyId" := OLD."relationshipStrategyId";
    NEW."relationshipStrategyVersion" := OLD."relationshipStrategyVersion";
    NEW."relationshipSnapshotAt" := OLD."relationshipSnapshotAt";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER preserve_newer_relationship_projection_trigger
BEFORE UPDATE OF "relationshipFormulaVersion"
ON "ChannelAudienceMember"
FOR EACH ROW
EXECUTE FUNCTION preserve_newer_relationship_projection();
