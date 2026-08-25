-- Additive migration: authoritative hourly Hot pick batches and ranked picks.
-- Deployment command must be confirmed by operators; do not run against populated DB without review.

-- CreateTable
CREATE TABLE "ChannelAudienceHotPickBatch" (
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

    CONSTRAINT "ChannelAudienceHotPickBatch_pkey" PRIMARY KEY ("organizationId","integrationId","hour")
);

-- CreateTable
CREATE TABLE "ChannelAudienceHotPick" (
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

    CONSTRAINT "ChannelAudienceHotPick_pkey" PRIMARY KEY ("organizationId","integrationId","hour","counterpartyExternalId")
);

-- CreateIndex
CREATE INDEX "ChannelAudienceHotPickBatch_integrationId_hour_idx" ON "ChannelAudienceHotPickBatch"("integrationId", "hour");

-- CreateIndex
CREATE INDEX "ChannelAudienceHotPickBatch_organizationId_idx" ON "ChannelAudienceHotPickBatch"("organizationId");

-- CreateIndex
CREATE INDEX "ChannelAudienceHotPick_integrationId_hour_finalRank_idx" ON "ChannelAudienceHotPick"("integrationId", "hour", "finalRank");

-- CreateIndex
CREATE INDEX "ChannelAudienceHotPick_organizationId_integrationId_hour_idx" ON "ChannelAudienceHotPick"("organizationId", "integrationId", "hour");

-- CreateIndex
CREATE INDEX "ChannelAudienceHotPick_organizationId_idx" ON "ChannelAudienceHotPick"("organizationId");

-- AddForeignKey
ALTER TABLE "ChannelAudienceHotPickBatch" ADD CONSTRAINT "ChannelAudienceHotPickBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelAudienceHotPickBatch" ADD CONSTRAINT "ChannelAudienceHotPickBatch_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelAudienceHotPick" ADD CONSTRAINT "ChannelAudienceHotPick_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelAudienceHotPick" ADD CONSTRAINT "ChannelAudienceHotPick_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelAudienceHotPick" ADD CONSTRAINT "ChannelAudienceHotPick_batch_fkey" FOREIGN KEY ("organizationId", "integrationId", "hour") REFERENCES "ChannelAudienceHotPickBatch"("organizationId", "integrationId", "hour") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelAudienceHotPick" ADD CONSTRAINT "ChannelAudienceHotPick_integrationId_counterpartyExternalId_fkey" FOREIGN KEY ("integrationId", "counterpartyExternalId") REFERENCES "ChannelAudienceMember"("integrationId", "externalId") ON DELETE RESTRICT ON UPDATE CASCADE;
