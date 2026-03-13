-- AlterTable
ALTER TABLE "member_notifications"
ADD COLUMN "readAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "member_notifications_memberId_readAt_idx" ON "member_notifications"("memberId", "readAt");
