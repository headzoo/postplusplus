-- Stamp interacting / added leads as NOT_FOLLOWER after a completed follower
-- sync so a later follow-back can emit follower_gained conversions. Also
-- backfill conversion ledger rows for people already followed from the board
-- who followed back under grow_audience / community_retention.
-- Deployment command must be confirmed by operators; do not run against populated DB without review.

-- A. Existing lead-qualified UNKNOWN members → NOT_FOLLOWER (only after sync)
UPDATE "ChannelAudienceMember" AS member
SET "membershipState" = 'NOT_FOLLOWER'
WHERE member."membershipState" = 'UNKNOWN'
  AND EXISTS (
    SELECT 1
    FROM "ChannelFollowerSyncState" sync
    WHERE sync."integrationId" = member."integrationId"
      AND sync."organizationId" = member."organizationId"
      AND sync."completedAt" IS NOT NULL
  )
  AND (
    member."inboundInteractionCount" > 0
    OR EXISTS (
      SELECT 1
      FROM "ChannelAudienceLeadBridge" bridge
      WHERE bridge."organizationId" = member."organizationId"
        AND bridge."integrationId" = member."integrationId"
        AND bridge."leadExternalId" = member."externalId"
    )
    OR EXISTS (
      SELECT 1
      FROM "ChannelAudienceLeadFitFeedback" feedback
      WHERE feedback."organizationId" = member."organizationId"
        AND feedback."integrationId" = member."integrationId"
        AND feedback."counterpartyExternalId" = member."externalId"
        AND feedback."source" = 'lead_add'
        AND feedback."verdict" = 'accepted'
    )
  );

-- B. Conservative historical fill: you followed them from the board and they
-- are now FOLLOWER under a follower-transition strategy.
INSERT INTO "ConversionEvent" (
    "id",
    "organizationId",
    "integrationId",
    "strategyId",
    "strategyVersion",
    "conversionType",
    "source",
    "sourceEventId",
    "dedupeKey",
    "actorExternalId",
    "occurredAt",
    "ingestedAt",
    "attributionMethod",
    "dimensions"
)
SELECT
    md5(
      member."organizationId"
      || ':'
      || member."integrationId"
      || ':backfill:lead-followed:'
      || member."externalId"
    ),
    member."organizationId",
    member."integrationId",
    integration."strategyId",
    integration."strategyVersion",
    'follower_gained',
    'DERIVED',
    'backfill:lead-followed:' || member."externalId",
    'membership-transition:backfill:lead-followed:' || member."externalId",
    member."externalId",
    COALESCE(member."followedAt", member."weFollowedAt"),
    CURRENT_TIMESTAMP,
    'NONE',
    '{"fromState":"NOT_FOLLOWER","toState":"FOLLOWER"}'::jsonb
FROM "ChannelAudienceMember" AS member
INNER JOIN "Integration" AS integration
  ON integration."id" = member."integrationId"
 AND integration."organizationId" = member."organizationId"
WHERE member."membershipState" = 'FOLLOWER'
  AND member."weFollowedAt" IS NOT NULL
  AND integration."strategyId" IN ('grow_audience', 'community_retention')
  AND NOT EXISTS (
    SELECT 1
    FROM "ConversionEvent" existing
    WHERE existing."integrationId" = member."integrationId"
      AND existing."actorExternalId" = member."externalId"
      AND existing."conversionType" = 'follower_gained'
  )
ON CONFLICT ("integrationId", "dedupeKey") DO NOTHING;
