# 任务失败处理机制分析与设计

## 1. 现有系统流程梳理

### 1.1 工具执行系统流程
```
用户提交任务 → 参数验证 → 数据库创建任务记录 → Redis队列入队 → Worker获取任务 → 
容器启动 → 工具执行 → 结果打包 → 状态更新 → 资源清理
```

### 1.2 失败可能发生的阶段
1. **提交阶段**：参数验证失败、权限检查失败
2. **队列阶段**：Redis连接失败、队列满
3. **Worker阶段**：Worker进程崩溃、资源不足
4. **容器阶段**：容器启动失败、容器执行超时、容器异常退出
5. **工具执行阶段**：工具逻辑错误、输入文件格式错误、内存不足
6. **结果处理阶段**：文件打包失败、上传失败

## 2. 现有失败处理机制分析

### 2.1 自动重试机制 (task-retry.service.ts)
**功能**：
- 最大重试次数：3次
- 重试条件：检查temp目录是否有未完成数据
- 重试操作：重置任务状态为PENDING，重新入队

**触发时机**：
- 系统启动时检查未完成任务
- 定期检查卡住的任务

**问题分析**：
- 只检查temp目录存在性，不够精确
- 没有区分失败类型，所有失败都尝试重试
- 重试间隔固定，没有指数退避

### 2.2 状态监控机制 (task-state-manager.service.ts)
**功能**：
- 检测卡住任务（超时未更新）
- 检测孤儿任务（不在队列中）
- 检测不一致任务（状态与实际不符）
- 检测容器状态异常

**处理方式**：
- 直接标记为FAILED
- 清理相关资源

### 2.3 Worker级别处理 (toolWorker.py)
**功能**：
- 捕获容器执行异常
- 保留失败时的执行步骤和进度
- 通过API更新数据库状态

**问题分析**：
- 异常处理比较粗糙，没有细分错误类型
- 缺少详细的错误信息记录

### 2.4 前端失败显示 (TaskHistoryTable.tsx, useToolExecution.ts)
**功能**：
- 显示失败状态徽章
- 显示错误消息
- Toast通知用户
- 保留失败时的进度

**缺失功能**：
- 没有重新提交按钮
- 没有错误详情查看
- 没有失败原因分类显示

## 3. 生产应用场景需求分析

### 3.1 用户体验需求
1. **明确的失败原因**：用户需要知道为什么失败
2. **可操作的解决方案**：告诉用户如何修复问题
3. **便捷的重试机制**：一键重新提交，保留原有参数
4. **进度保留**：显示任务失败时的实际执行进度

### 3.2 系统稳定性需求
1. **智能重试**：根据失败类型决定是否重试
2. **资源保护**：避免无限重试消耗系统资源
3. **状态一致性**：确保数据库、Redis、文件系统状态一致
4. **监控告警**：系统性失败需要及时通知管理员

### 3.3 业务连续性需求
1. **快速恢复**：临时性失败应该自动恢复
2. **降级处理**：部分功能失败时提供备选方案
3. **数据保护**：失败任务的输入数据应该保留
4. **审计追踪**：失败原因和处理过程需要记录

## 4. 失败类型分类与处理策略

### 4.1 可重试失败 (Retryable Failures)
**类型**：
- 网络超时
- 临时资源不足
- Redis连接失败
- 容器启动失败（资源原因）

**处理策略**：
- 自动重试，指数退避
- 最大重试次数：3次
- 重试间隔：1分钟、2分钟、5分钟

### 4.2 不可重试失败 (Non-retryable Failures)
**类型**：
- 参数验证失败
- 权限不足
- 输入文件格式错误
- 工具逻辑错误

**处理策略**：
- 直接标记为FAILED
- 提供详细错误信息
- 建议用户修改参数后重新提交

### 4.3 系统性失败 (System Failures)
**类型**：
- Worker进程崩溃
- 数据库连接失败
- 存储系统故障

**处理策略**：
- 暂停新任务提交
- 通知管理员
- 提供系统状态页面

## 5. 建议的改进方案

### 5.1 增强错误分类和记录
```typescript
interface TaskFailure {
  taskId: string;
  failureType: 'RETRYABLE' | 'NON_RETRYABLE' | 'SYSTEM';
  failureCategory: string; // 'VALIDATION' | 'RESOURCE' | 'EXECUTION' | 'NETWORK'
  errorCode: string;
  errorMessage: string;
  errorDetails: any;
  failedAt: Date;
  failedStep: string;
  retryable: boolean;
  suggestedAction: string;
}
```

### 5.2 智能重试机制
- 根据失败类型决定重试策略
- 指数退避算法
- 重试次数限制
- 重试条件检查

### 5.3 用户友好的失败处理
- 失败原因分类显示
- 建议的解决方案
- 一键重新提交功能
- 参数修改建议

### 5.4 管理员工具增强
- 失败任务统计和分析
- 批量重试功能
- 系统健康监控
- 失败模式识别

## 6. 实施优先级

### 高优先级
1. 增强错误信息记录和分类
2. 实现用户重新提交功能
3. 改进前端失败状态显示

### 中优先级
1. 智能重试机制优化
2. 管理员工具增强
3. 系统监控改进

### 低优先级
1. 失败模式分析
2. 预测性故障检测
3. 自动化运维工具

## 7. 技术实现要点

### 7.1 数据库设计
- 增加TaskFailure表记录详细失败信息
- 任务表增加failureReason、suggestedAction字段
- 增加失败统计视图

### 7.2 API设计
- 重新提交任务API
- 失败详情查询API
- 批量重试API

### 7.3 前端组件
- 失败详情对话框
- 重新提交按钮
- 错误分类显示
- 解决建议提示

### 7.4 监控和告警
- 失败率监控
- 异常模式检测
- 实时告警机制
- 性能指标追踪

## 8. 现有代码问题分析

### 8.1 task-retry.service.ts 问题
**问题1**：重试条件过于简单
```typescript
// 现有逻辑：只检查temp目录存在性
const hasIncompleteData = await this.checkIncompleteTaskData(task.id);
```
**改进建议**：应该检查具体的失败原因和任务状态

**问题2**：没有重试间隔控制
```typescript
// 现有逻辑：立即重试
await this.retryTask(task);
```
**改进建议**：实现指数退避算法

### 8.2 toolWorker.py 问题
**问题1**：错误信息不够详细
```python
# 现有逻辑：通用错误消息
'errorMessage': 'Task execution failed'
```
**改进建议**：记录具体的错误类型和上下文

**问题2**：没有错误分类
```python
# 现有逻辑：所有错误都标记为FAILED
task.status = 'FAILED'
```
**改进建议**：根据错误类型设置不同的状态

### 8.3 前端显示问题
**问题1**：缺少重新提交功能
- TaskHistoryTable.tsx 只显示状态，没有操作按钮
- 用户无法直接重新提交失败的任务

**问题2**：错误信息显示不友好
- 只显示技术性错误消息
- 没有用户友好的解决建议

## 9. 具体实现方案

### 9.1 数据库Schema扩展
```sql
-- 任务失败详情表
CREATE TABLE task_failures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id),
    failure_type VARCHAR(20) NOT NULL, -- 'RETRYABLE', 'NON_RETRYABLE', 'SYSTEM'
    failure_category VARCHAR(50) NOT NULL, -- 'VALIDATION', 'RESOURCE', 'EXECUTION'
    error_code VARCHAR(50),
    error_message TEXT,
    error_details JSONB,
    failed_at TIMESTAMP NOT NULL,
    failed_step VARCHAR(50),
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    next_retry_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 任务表扩展
ALTER TABLE tasks ADD COLUMN failure_reason VARCHAR(100);
ALTER TABLE tasks ADD COLUMN suggested_action TEXT;
ALTER TABLE tasks ADD COLUMN is_retryable BOOLEAN DEFAULT true;
```

### 9.2 API接口设计
```typescript
// 重新提交任务
POST /api/v1/tasks/{taskId}/resubmit
{
  "preserveParameters": true,
  "modifiedParameters"?: object
}

// 获取失败详情
GET /api/v1/tasks/{taskId}/failure-details
Response: {
  "failureType": string,
  "errorMessage": string,
  "suggestedAction": string,
  "retryable": boolean,
  "failureHistory": TaskFailure[]
}

// 批量重试（管理员）
POST /api/v1/admin/tasks/batch-retry
{
  "taskIds": string[],
  "force": boolean
}
```

### 9.3 前端组件设计
```tsx
// 失败任务操作按钮
const FailedTaskActions: React.FC<{task: Task}> = ({task}) => {
  return (
    <div className="flex space-x-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => showFailureDetails(task.id)}
      >
        查看详情
      </Button>
      {task.isRetryable && (
        <Button
          variant="default"
          size="sm"
          onClick={() => resubmitTask(task.id)}
        >
          重新提交
        </Button>
      )}
    </div>
  );
};

// 失败详情对话框
const FailureDetailsDialog: React.FC = () => {
  return (
    <Dialog>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>任务失败详情</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>失败原因</Label>
            <p className="text-sm text-gray-600">{failureReason}</p>
          </div>
          <div>
            <Label>建议操作</Label>
            <p className="text-sm text-blue-600">{suggestedAction}</p>
          </div>
          <div>
            <Label>错误详情</Label>
            <pre className="text-xs bg-gray-100 p-2 rounded">
              {errorDetails}
            </pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
```

## 10. 实施计划

### 阶段1：基础改进（1-2周）
1. 扩展数据库Schema
2. 改进错误信息记录
3. 实现基础的重新提交功能

### 阶段2：智能重试（2-3周）
1. 实现错误分类逻辑
2. 优化重试机制
3. 添加重试间隔控制

### 阶段3：用户体验优化（1-2周）
1. 完善前端失败状态显示
2. 实现失败详情对话框
3. 添加解决建议提示

### 阶段4：管理工具增强（1-2周）
1. 失败统计和分析
2. 批量操作功能
3. 监控和告警机制

## 11. 风险评估

### 技术风险
- 数据库Schema变更可能影响现有功能
- 重试机制可能导致资源消耗增加
- 前端组件变更可能影响用户体验

### 业务风险
- 自动重试可能掩盖系统性问题
- 用户重新提交可能导致重复计费
- 失败率统计可能暴露系统问题

### 缓解措施
- 分阶段实施，逐步验证
- 完善测试覆盖
- 监控系统性能指标
- 建立回滚机制
