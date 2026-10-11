ALTER TABLE "Notifications"
ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "Notifications_organizationId_idempotencyKey_key"
ON "Notifications"("organizationId", "idempotencyKey");
