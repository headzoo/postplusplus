ALTER TABLE "Integration"
ADD COLUMN "leadDiscoveryEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "leadDiscoveryDailyQuota" INTEGER NOT NULL DEFAULT 5;

ALTER TABLE "Integration"
ADD CONSTRAINT "Integration_leadDiscoveryDailyQuota_check"
CHECK ("leadDiscoveryDailyQuota" BETWEEN 1 AND 25);

ALTER TABLE "ChannelInteractionEvent"
ADD COLUMN "snapshotHydrationAttemptedAt" TIMESTAMP(3),
ADD COLUMN "snapshotHydrationTerminal" BOOLEAN NOT NULL DEFAULT false;
