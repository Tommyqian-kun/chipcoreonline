-- 添加taskId字段到tables表
ALTER TABLE "tables" ADD COLUMN "task_id" TEXT;
ALTER TABLE "tables" ADD COLUMN "is_template" BOOLEAN DEFAULT false;

-- 创建索引
CREATE INDEX "tables_task_id_idx" ON "tables"("task_id");

-- 更新现有数据为模板
UPDATE "tables" SET "is_template" = true WHERE "task_id" IS NULL;

-- 修改唯一约束
ALTER TABLE "tables" DROP CONSTRAINT "tables_sheet_id_table_name_key";
ALTER TABLE "tables" ADD CONSTRAINT "tables_sheet_id_table_name_task_id_key"
  UNIQUE ("sheet_id", "table_name", "task_id");
