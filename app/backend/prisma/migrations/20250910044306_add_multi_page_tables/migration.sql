-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "cleanedAt" TIMESTAMP(3),
ADD COLUMN     "containerStartedAt" TIMESTAMP(3),
ADD COLUMN     "currentStep" TEXT,
ADD COLUMN     "downloadTimeRemaining" INTEGER,
ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "maxRetries" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "originalTaskId" TEXT,
ADD COLUMN     "progress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stepStartedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Tool" ALTER COLUMN "toolType" SET DEFAULT 'sdcgen';

-- CreateTable
CREATE TABLE "sheets" (
    "id" TEXT NOT NULL,
    "tool_type" TEXT NOT NULL,
    "sheet_name" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tables" (
    "id" TEXT NOT NULL,
    "sheet_id" TEXT NOT NULL,
    "tool_type" TEXT NOT NULL,
    "table_name" TEXT NOT NULL,
    "columns_schema" JSONB NOT NULL,
    "display_order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "table_data" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "table_id" TEXT NOT NULL,
    "sheet_id" TEXT NOT NULL,
    "row_number" INTEGER NOT NULL,
    "row_data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "table_data_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sheets_tool_type_idx" ON "sheets"("tool_type");

-- CreateIndex
CREATE UNIQUE INDEX "sheets_tool_type_sheet_name_key" ON "sheets"("tool_type", "sheet_name");

-- CreateIndex
CREATE INDEX "tables_tool_type_idx" ON "tables"("tool_type");

-- CreateIndex
CREATE INDEX "tables_sheet_id_idx" ON "tables"("sheet_id");

-- CreateIndex
CREATE UNIQUE INDEX "tables_sheet_id_table_name_key" ON "tables"("sheet_id", "table_name");

-- CreateIndex
CREATE INDEX "table_data_user_id_task_id_idx" ON "table_data"("user_id", "task_id");

-- CreateIndex
CREATE INDEX "table_data_task_id_idx" ON "table_data"("task_id");

-- CreateIndex
CREATE INDEX "table_data_table_id_idx" ON "table_data"("table_id");

-- CreateIndex
CREATE INDEX "table_data_sheet_id_idx" ON "table_data"("sheet_id");

-- CreateIndex
CREATE UNIQUE INDEX "table_data_task_id_table_id_row_number_key" ON "table_data"("task_id", "table_id", "row_number");

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_sheet_id_fkey" FOREIGN KEY ("sheet_id") REFERENCES "sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_data" ADD CONSTRAINT "table_data_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_data" ADD CONSTRAINT "table_data_sheet_id_fkey" FOREIGN KEY ("sheet_id") REFERENCES "sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
