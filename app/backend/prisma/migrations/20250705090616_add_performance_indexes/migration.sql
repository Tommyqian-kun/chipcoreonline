-- AddPerformanceIndexes migration
-- 为提升查询性能添加复合索引

-- Order表索引优化
CREATE INDEX IF NOT EXISTS "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- Subscription表索引优化
CREATE INDEX IF NOT EXISTS "Subscription_status_endDate_idx" ON "Subscription"("status", "endDate");
CREATE INDEX IF NOT EXISTS "Subscription_userId_status_idx" ON "Subscription"("userId", "status");