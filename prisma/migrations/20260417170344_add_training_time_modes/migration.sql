-- AlterTable
ALTER TABLE "training_schedules" ADD COLUMN     "timeMode" TEXT NOT NULL DEFAULT 'single',
ADD COLUMN     "trainingDateTimes" JSONB,
ADD COLUMN     "trainingDates" TEXT[];
