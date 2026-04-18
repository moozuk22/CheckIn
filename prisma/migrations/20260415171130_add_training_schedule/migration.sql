-- CreateTable
CREATE TABLE "training_schedules" (
    "id" TEXT NOT NULL,
    "trainingWeekdays" INTEGER[],
    "trainingTime" TEXT,
    "trainingWindowDays" INTEGER NOT NULL DEFAULT 30,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_opt_outs" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "trainingDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_opt_outs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "training_opt_outs_trainingDate_idx" ON "training_opt_outs"("trainingDate");

-- CreateIndex
CREATE UNIQUE INDEX "training_opt_outs_memberId_trainingDate_key" ON "training_opt_outs"("memberId", "trainingDate");

-- AddForeignKey
ALTER TABLE "training_opt_outs" ADD CONSTRAINT "training_opt_outs_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
