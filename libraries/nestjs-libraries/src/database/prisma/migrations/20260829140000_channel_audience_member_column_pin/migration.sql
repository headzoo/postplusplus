-- Additive migration: durable board-column pins so hourly Hot/Cultivate
-- materialization and score/bot recomputes preserve manually moved members.
-- Deployment command must be confirmed by operators; do not run against
-- populated DB without review.

-- CreateTable
CREATE TABLE "ChannelAudienceMemberColumnPin" (
    "organizationId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "counterpartyExternalId" TEXT NOT NULL,
    "column" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,

    CONSTRAINT "ChannelAudienceMemberColumnPin_pkey" PRIMARY KEY ("organizationId","integrationId","counterpartyExternalId","column")
);

-- CreateIndex
CREATE INDEX "ChannelAudienceMemberColumnPin_organizationId_integrationId_column_idx" ON "ChannelAudienceMemberColumnPin"("organizationId", "integrationId", "column");

-- CreateIndex
CREATE INDEX "ChannelAudienceMemberColumnPin_integrationId_counterpartyExternalId_idx" ON "ChannelAudienceMemberColumnPin"("integrationId", "counterpartyExternalId");

-- CreateIndex
CREATE INDEX "ChannelAudienceMemberColumnPin_createdByUserId_idx" ON "ChannelAudienceMemberColumnPin"("createdByUserId");

-- CreateIndex
CREATE INDEX "ChannelAudienceMemberColumnPin_organizationId_idx" ON "ChannelAudienceMemberColumnPin"("organizationId");

-- AddForeignKey
ALTER TABLE "ChannelAudienceMemberColumnPin" ADD CONSTRAINT "ChannelAudienceMemberColumnPin_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelAudienceMemberColumnPin" ADD CONSTRAINT "ChannelAudienceMemberColumnPin_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelAudienceMemberColumnPin" ADD CONSTRAINT "ChannelAudienceMemberColumnPin_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelAudienceMemberColumnPin" ADD CONSTRAINT "ChannelAudienceMemberColumnPin_integrationId_counterpartyExternalId_fkey" FOREIGN KEY ("integrationId", "counterpartyExternalId") REFERENCES "ChannelAudienceMember"("integrationId", "externalId") ON DELETE RESTRICT ON UPDATE CASCADE;
