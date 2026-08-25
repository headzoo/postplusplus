-- Hourly Cultivate materialization batches and picks (replaces daily day-keyed picks).
-- Legacy daily cultivate rows cannot be converted to hour buckets and are cleared.

DELETE FROM "ChannelAudienceCultivatePick";

DROP TABLE "ChannelAudienceCultivatePick";

CREATE TABLE "ChannelAudienceCultivatePickBatch" (
    "organizationId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "hour" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "strategyVersion" INTEGER NOT NULL,
    "materializationVersion" INTEGER NOT NULL,
    "candidateCount" INTEGER NOT NULL,
    "pickCount" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'rules',
    "completedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelAudienceCultivatePickBatch_pkey" PRIMARY KEY ("organizationId","integrationId","hour")
);

CREATE TABLE "ChannelAudienceCultivatePick" (
    "organizationId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "hour" TEXT NOT NULL,
    "counterpartyExternalId" TEXT NOT NULL,
    "rulesRank" INTEGER NOT NULL,
    "finalRank" INTEGER NOT NULL,
    "rulesReason" TEXT NOT NULL,
    "aiRank" INTEGER,
    "aiReason" TEXT,
    "suggestedAction" TEXT,
    "source" TEXT NOT NULL DEFAULT 'rules',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelAudienceCultivatePick_pkey" PRIMARY KEY ("organizationId","integrationId","hour","counterpartyExternalId")
);

CREATE INDEX "ChannelAudienceCultivatePickBatch_integrationId_hour_idx" ON "ChannelAudienceCultivatePickBatch"("integrationId", "hour");

CREATE INDEX "ChannelAudienceCultivatePickBatch_organizationId_idx" ON "ChannelAudienceCultivatePickBatch"("organizationId");

CREATE INDEX "ChannelAudienceCultivatePick_integrationId_hour_finalRank_idx" ON "ChannelAudienceCultivatePick"("integrationId", "hour", "finalRank");

CREATE INDEX "ChannelAudienceCultivatePick_organizationId_integrationId_hour_idx" ON "ChannelAudienceCultivatePick"("organizationId", "integrationId", "hour");

CREATE INDEX "ChannelAudienceCultivatePick_organizationId_idx" ON "ChannelAudienceCultivatePick"("organizationId");

ALTER TABLE "ChannelAudienceCultivatePickBatch" ADD CONSTRAINT "ChannelAudienceCultivatePickBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ChannelAudienceCultivatePickBatch" ADD CONSTRAINT "ChannelAudienceCultivatePickBatch_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ChannelAudienceCultivatePick" ADD CONSTRAINT "ChannelAudienceCultivatePick_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ChannelAudienceCultivatePick" ADD CONSTRAINT "ChannelAudienceCultivatePick_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ChannelAudienceCultivatePick" ADD CONSTRAINT "ChannelAudienceCultivatePick_batch_fkey" FOREIGN KEY ("organizationId", "integrationId", "hour") REFERENCES "ChannelAudienceCultivatePickBatch"("organizationId", "integrationId", "hour") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ChannelAudienceCultivatePick" ADD CONSTRAINT "ChannelAudienceCultivatePick_integrationId_counterpartyExte_fkey" FOREIGN KEY ("integrationId", "counterpartyExternalId") REFERENCES "ChannelAudienceMember"("integrationId", "externalId") ON DELETE RESTRICT ON UPDATE CASCADE;
