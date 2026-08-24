-- CreateTable
CREATE TABLE "UserDismissedAlert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "alertKey" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDismissedAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserDismissedAlert_userId_idx" ON "UserDismissedAlert"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserDismissedAlert_userId_alertKey_key" ON "UserDismissedAlert"("userId", "alertKey");

-- AddForeignKey
ALTER TABLE "UserDismissedAlert" ADD CONSTRAINT "UserDismissedAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
