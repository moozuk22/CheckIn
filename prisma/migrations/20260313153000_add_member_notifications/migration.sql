-- CreateTable
CREATE TABLE "member_notifications" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "url" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "member_notifications_memberId_sentAt_idx" ON "member_notifications"("memberId", "sentAt");

-- AddForeignKey
ALTER TABLE "member_notifications" ADD CONSTRAINT "member_notifications_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
