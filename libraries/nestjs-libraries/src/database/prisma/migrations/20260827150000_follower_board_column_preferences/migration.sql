-- CreateTable
CREATE TABLE "FollowerBoardColumnPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "columnKey" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowerBoardColumnPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FollowerBoardColumnPreference_userId_organizationId_idx" ON "FollowerBoardColumnPreference"("userId", "organizationId");

-- CreateIndex
CREATE INDEX "FollowerBoardColumnPreference_organizationId_integrationId_idx" ON "FollowerBoardColumnPreference"("organizationId", "integrationId");

-- CreateIndex
CREATE INDEX "FollowerBoardColumnPreference_integrationId_idx" ON "FollowerBoardColumnPreference"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "FollowerBoardColumnPreference_userId_organizationId_integrationId_columnKey_key" ON "FollowerBoardColumnPreference"("userId", "organizationId", "integrationId", "columnKey");

-- AddForeignKey
ALTER TABLE "FollowerBoardColumnPreference" ADD CONSTRAINT "FollowerBoardColumnPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowerBoardColumnPreference" ADD CONSTRAINT "FollowerBoardColumnPreference_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowerBoardColumnPreference" ADD CONSTRAINT "FollowerBoardColumnPreference_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
