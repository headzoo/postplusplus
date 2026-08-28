-- CreateIndex
CREATE INDEX "ChannelAudienceMember_lead_created_keyset_idx" ON "ChannelAudienceMember"("integrationId", "membershipState", "createdAt", "externalId");
