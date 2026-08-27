-- Additive conversion ledger, attribution, evaluation, and support persistence.

CREATE TYPE "ConversionSource" AS ENUM ('API', 'WEBHOOK', 'DERIVED');
CREATE TYPE "ConversionAttributionMethod" AS ENUM ('CLICK_ID', 'UTM', 'NONE');
CREATE TYPE "ConversionJobKind" AS ENUM ('INTERACTION', 'MEMBERSHIP_TRANSITION', 'INFERRED_RESOLUTION');
CREATE TYPE "ConversionJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETE', 'FAILED');

ALTER TABLE "ChannelInteractionEvent" ADD COLUMN "conversationExternalId" TEXT;

CREATE TABLE "ConversionClickAttribution" (
    "id" TEXT NOT NULL,
    "clickId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "sourcePostItemId" TEXT NOT NULL,
    "destinationHash" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "strategyVersion" INTEGER NOT NULL,
    "utmFingerprint" TEXT,
    "utmSnapshot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConversionClickAttribution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversionSupportCase" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "externalCaseKey" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "strategyVersion" INTEGER NOT NULL,
    "actorExternalId" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "lastInboundAt" TIMESTAMP(3),
    "firstOutboundAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolutionSource" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConversionSupportCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversionEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "strategyVersion" INTEGER NOT NULL,
    "conversionType" TEXT NOT NULL,
    "source" "ConversionSource" NOT NULL,
    "sourceEventId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "actorExternalId" TEXT,
    "clickAttributionId" TEXT,
    "interactionEventId" TEXT,
    "supportCaseId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attributionWindowStart" TIMESTAMP(3),
    "attributionWindowEnd" TIMESTAMP(3),
    "attributionMethod" "ConversionAttributionMethod" NOT NULL DEFAULT 'NONE',
    "value" DECIMAL(18,4),
    "dimensions" JSONB,
    "metadata" JSONB,
    CONSTRAINT "ConversionEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversionEvaluationJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "strategyVersion" INTEGER NOT NULL,
    "kind" "ConversionJobKind" NOT NULL,
    "status" "ConversionJobStatus" NOT NULL DEFAULT 'PENDING',
    "dedupeKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "eventAt" TIMESTAMP(3) NOT NULL,
    "availableAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "claimToken" TEXT,
    "completedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConversionEvaluationJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversionDerivationState" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "strategyVersion" INTEGER NOT NULL,
    "conversionType" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "lastEmittedAt" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3),
    "state" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConversionDerivationState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversionWebhookCredential" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "lastFour" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversionWebhookCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConversionClickAttribution_clickId_key" ON "ConversionClickAttribution"("clickId");
CREATE INDEX "ConversionClickAttribution_organizationId_integrationId_utmFingerprint_createdAt_idx" ON "ConversionClickAttribution"("organizationId", "integrationId", "utmFingerprint", "createdAt");
CREATE INDEX "ConversionClickAttribution_integrationId_expiresAt_idx" ON "ConversionClickAttribution"("integrationId", "expiresAt");
CREATE UNIQUE INDEX "ConversionSupportCase_integrationId_externalCaseKey_key" ON "ConversionSupportCase"("integrationId", "externalCaseKey");
CREATE INDEX "ConversionSupportCase_organizationId_integrationId_resolvedAt_idx" ON "ConversionSupportCase"("organizationId", "integrationId", "resolvedAt");
CREATE INDEX "ConversionSupportCase_integrationId_actorExternalId_updatedAt_idx" ON "ConversionSupportCase"("integrationId", "actorExternalId", "updatedAt");
CREATE UNIQUE INDEX "ConversionEvent_integrationId_dedupeKey_key" ON "ConversionEvent"("integrationId", "dedupeKey");
CREATE INDEX "ConversionEvent_organizationId_occurredAt_idx" ON "ConversionEvent"("organizationId", "occurredAt");
CREATE INDEX "ConversionEvent_integrationId_occurredAt_idx" ON "ConversionEvent"("integrationId", "occurredAt");
CREATE INDEX "ConversionEvent_integrationId_strategyId_strategyVersion_conversionType_occurredAt_idx" ON "ConversionEvent"("integrationId", "strategyId", "strategyVersion", "conversionType", "occurredAt");
CREATE INDEX "ConversionEvent_integrationId_actorExternalId_occurredAt_idx" ON "ConversionEvent"("integrationId", "actorExternalId", "occurredAt");
CREATE INDEX "ConversionEvent_clickAttributionId_idx" ON "ConversionEvent"("clickAttributionId");
CREATE INDEX "ConversionEvent_interactionEventId_idx" ON "ConversionEvent"("interactionEventId");
CREATE INDEX "ConversionEvent_supportCaseId_idx" ON "ConversionEvent"("supportCaseId");
CREATE UNIQUE INDEX "ConversionEvaluationJob_integrationId_dedupeKey_key" ON "ConversionEvaluationJob"("integrationId", "dedupeKey");
CREATE INDEX "ConversionEvaluationJob_status_availableAt_idx" ON "ConversionEvaluationJob"("status", "availableAt");
CREATE INDEX "ConversionEvaluationJob_status_claimedAt_idx" ON "ConversionEvaluationJob"("status", "claimedAt");
CREATE INDEX "ConversionEvaluationJob_organizationId_integrationId_status_availableAt_idx" ON "ConversionEvaluationJob"("organizationId", "integrationId", "status", "availableAt");
CREATE UNIQUE INDEX "ConversionDerivationState_integrationId_strategyId_strategyVersion_conversionType_subjectKey_key" ON "ConversionDerivationState"("integrationId", "strategyId", "strategyVersion", "conversionType", "subjectKey");
CREATE INDEX "ConversionDerivationState_organizationId_integrationId_idx" ON "ConversionDerivationState"("organizationId", "integrationId");
CREATE UNIQUE INDEX "ConversionWebhookCredential_integrationId_key" ON "ConversionWebhookCredential"("integrationId");
CREATE INDEX "ConversionWebhookCredential_organizationId_idx" ON "ConversionWebhookCredential"("organizationId");
CREATE INDEX "ChannelInteractionEvent_integrationId_conversationExternalId_eventAt_idx" ON "ChannelInteractionEvent"("integrationId", "conversationExternalId", "eventAt");

ALTER TABLE "ConversionClickAttribution" ADD CONSTRAINT "ConversionClickAttribution_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConversionClickAttribution" ADD CONSTRAINT "ConversionClickAttribution_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConversionSupportCase" ADD CONSTRAINT "ConversionSupportCase_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConversionSupportCase" ADD CONSTRAINT "ConversionSupportCase_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConversionEvent" ADD CONSTRAINT "ConversionEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConversionEvent" ADD CONSTRAINT "ConversionEvent_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConversionEvent" ADD CONSTRAINT "ConversionEvent_clickAttributionId_fkey" FOREIGN KEY ("clickAttributionId") REFERENCES "ConversionClickAttribution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConversionEvent" ADD CONSTRAINT "ConversionEvent_interactionEventId_fkey" FOREIGN KEY ("interactionEventId") REFERENCES "ChannelInteractionEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConversionEvent" ADD CONSTRAINT "ConversionEvent_supportCaseId_fkey" FOREIGN KEY ("supportCaseId") REFERENCES "ConversionSupportCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConversionEvaluationJob" ADD CONSTRAINT "ConversionEvaluationJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConversionEvaluationJob" ADD CONSTRAINT "ConversionEvaluationJob_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConversionDerivationState" ADD CONSTRAINT "ConversionDerivationState_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConversionDerivationState" ADD CONSTRAINT "ConversionDerivationState_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConversionWebhookCredential" ADD CONSTRAINT "ConversionWebhookCredential_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConversionWebhookCredential" ADD CONSTRAINT "ConversionWebhookCredential_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
