-- AlterTable
ALTER TABLE "training_opt_outs" ADD COLUMN     "reasonCode" TEXT,
ADD COLUMN     "reasonText" TEXT;

-- CreateTable
CREATE TABLE "training_notes" (
    "id" TEXT NOT NULL,
    "trainingDate" DATE NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "training_notes_trainingDate_key" ON "training_notes"("trainingDate");
