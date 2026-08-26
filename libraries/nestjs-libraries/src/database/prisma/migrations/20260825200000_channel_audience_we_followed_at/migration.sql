-- Additive migration: track when the channel followed an audience member.
-- Deployment command must be confirmed by operators; do not run against populated DB without review.

ALTER TABLE "ChannelAudienceMember" ADD COLUMN "weFollowedAt" TIMESTAMP(3);

CREATE INDEX "ChannelAudienceMember_followed_keyset_idx" ON "ChannelAudienceMember"("integrationId", "membershipState", "weFollowedAt", "externalId");
