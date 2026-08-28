-- AlterTable
ALTER TABLE "ChannelInteractionEvent"
ADD COLUMN "postSnapshot" JSONB,
ADD COLUMN "snapshotVersion" INTEGER,
ADD COLUMN "snapshotCompleteness" TEXT;

-- CreateIndex
CREATE INDEX "ChannelInteractionEvent_inbox_keyset_idx"
ON "ChannelInteractionEvent"("organizationId", "direction", "eventAt", "id");
