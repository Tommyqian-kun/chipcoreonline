-- CreateEnum
CREATE TYPE "DownloadStatus" AS ENUM ('NOT_DOWNLOADED', 'AVAILABLE', 'DOWNLOADED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TimeoutType" AS ENUM ('NONE', 'QUEUE_TIMEOUT', 'EXECUTION_TIMEOUT');

-- AlterEnum
ALTER TYPE "TaskStatus" ADD VALUE 'QUEUE_TIMEOUT';
ALTER TYPE "TaskStatus" ADD VALUE 'EXECUTION_TIMEOUT';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "downloadStatus" "DownloadStatus" NOT NULL DEFAULT 'NOT_DOWNLOADED';
ALTER TABLE "Task" ADD COLUMN     "downloadedAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN     "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Task" ADD COLUMN     "timeoutAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN     "timeoutType" "TimeoutType" DEFAULT 'NONE';

-- CreateIndex
CREATE INDEX "Task_downloadStatus_idx" ON "Task"("downloadStatus");

-- CreateIndex
CREATE INDEX "Task_timeoutType_idx" ON "Task"("timeoutType");

-- CreateIndex
CREATE INDEX "Task_queuedAt_idx" ON "Task"("queuedAt");

-- Update existing records with default values
UPDATE "Task" SET "queuedAt" = "createdAt" WHERE "queuedAt" IS NULL;
UPDATE "Task" SET "timeoutType" = 'NONE' WHERE "timeoutType" IS NULL;