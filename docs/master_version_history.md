# Master分支版本历史

本文档记录了 LogicCore 项目 master 分支的版本合并历史。

---

## 版本合并记录（按时间倒序）

| 合并编号 | 版本标识 | 合并日期 | 来源分支 | 主要内容 |
|---------|---------|----------|---------|---------|
| Merge-4 | v13 (cbef33c) | 2026-01-22 | dev (7e3ef37) | ECS-only 多页面风险修复与稳定性增强 |
| Merge-3 | v12 (0808fcb) | 2026-01-11 | dev (6059d4e) | 并发槽位泄露风险修复 |
| Merge-2 | - (5dacfe6) | 2026-01-07 | dev | P0/P1级别安全漏洞修复 |
| Merge-1 | v10 (initial) | 2026-01-06 | dev | 初始版本，测试框架引入 |

---

## 详细合并记录

### Merge-4: 版本 13 (2026-01-22)

**合并提交**: cbef33c

**合并信息**: 合并 dev 分支版本 13 (7e3ef37) 到 master

**来源提交**:
- 86adb52 - fix: ecs-only multipage risk fixes and stability
- 7e3ef37 - docs: update dev record for ecs-only multipage fixes

**核心改进**:

1. **Worker 会话线程安全与完成状态一致性**
   - 线程内创建 SQLAlchemy Session，避免跨线程复用
   - 完成/失败状态补写避免覆盖 EXECUTION_TIMEOUT
   - ECS Only finishedAt/startedAt 写入统一为 UTC naive

2. **队列可靠性与回补幂等保护**
   - BRPOPLPUSH 处理队列 + processing 队列回补
   - 回补前 DB 状态校验，仅在 PENDING/RUNNING 时回补

3. **状态补偿与恢复链路**
   - Worker API 重试失败后写入补偿队列
   - 后端定时补偿服务消费队列并更新任务状态
   - 兼容 finishedAt 字符串，避免补偿消费失败

4. **多页面数据一致性与事务保护**
   - Excel 解析、保存与脏数据写入改为事务化
   - 支持批量写入，减少中间异常导致的数据丢失

5. **任务超时与草稿清理**
   - 新增 DRAFT 超时清理（默认 24h），清理 temp/logs
   - 保持 jobs 清理策略不变

6. **ECS Only 权限与环境变量校验**
   - 增加 ECS_STRICT_PERMISSIONS 开关
   - 支付/OSS/阿里云配置按部署模式与支付开关条件校验

**变更统计**:
- 15 个文件修改
- 2 个新文件创建
- +1284 行, -382 行

**新增文件**:
- `app/backend/src/services/task-status-sync-queue.service.ts`
- `docs/ecsonly_multipage_risk_solution_gpt52_0120.md`

**修改文件**:
- `app/backend/src/config/env-validation.ts`
- `app/backend/src/controllers/upf_thrpages.controller.ts`
- `app/backend/src/index.ts`
- `app/backend/src/services/excel_thrpages.service.ts`
- `app/backend/src/services/subscription.service.ts`
- `app/backend/src/services/task-timeout.service.ts`
- `app/backend/src/workers/toolWorker.py`
- `app/backend/src/workers/toolsRefractor/api_client.py`
- `app/backend/src/workers/toolsRefractor/ecs_only_processor.py`
- `app/backend/src/workers/toolsRefractor/file_manager.py`
- `app/backend/src/workers/toolsRefractor/utils.py`
- `docs/dev_record.md`
- `docs/ecsonly_multipage_risk_improve_gpt52.md`

---

### Merge-3: 版本 12 (2026-01-11)

**合并提交**: 0808fcb

**合并信息**: 合并 dev 分支版本 12 (6059d4e) 到 master

**来源提交**:
- 6059d4e - fix: 修复并发槽位泄露风险并增强系统可靠性

**核心改进**:

1. **槽位释放统一使用重试机制**
   - 所有槽位释放点改用 releaseConcurrentSlotWithRetry 方法
   - 重试策略：指数退避（100ms, 200ms, 400ms）
   - 槽位释放成功率从 ~95% 提升到 ~99.9%

2. **Python Worker API调用添加重试机制**
   - Worker 通过内部 API 更新任务状态时的重试机制
   - 状态更新成功率从 ~90% 提升到 ~99%

3. **submitTask 使用原子入队操作**
   - Lua脚本确保检查、入队、更新活跃集合的原子性
   - 防止槽位泄露和队列溢出

4. **状态同步使用原子操作**
   - 服务重启后的状态恢复使用原子操作
   - 确保队列和活跃集合的一致性

**变更统计**:
- 8 个文件修改
- +1029 行, -90 行

---

### Merge-2: P0/P1安全修复 (2026-01-07)

**合并提交**: 5dacfe6

**合并信息**: 合并 dev 分支到 master

**来源提交**:
- c5b6803 - fix: 修复P0和P1级别安全漏洞及Redis架构问题

**核心改进**:

1. **P0级别安全漏洞修复**
   - 登录接口防暴力破解（限制每IP每15分钟5次）
   - 支付回调签名验证强化（RSA2 + AES-256-GCM）
   - 文件上传路径遍历防护
   - 敏感环境变量强制验证
   - 本地存储目录权限验证

2. **P1级别安全问题修复**
   - 并发控制槽位TTL计算修正
   - 添加定期健康检查（每15分钟）
   - 容器清理重试机制（重试3次）
   - 孤儿容器定期调度清理（每5分钟）

3. **Redis架构优化**
   - 统一连接池使用（17个服务文件）
   - KEYS命令替换为SCAN
   - 清理过时配置

**变更统计**:
- 25 个文件修改
- +5651 行, -128 行

---

### Merge-1: 初始版本与测试框架 (2026-01-06)

**合并提交**: (初始合并)

**合并信息**: 项目初始化和测试框架引入

**来源提交**:
- 058d5b5 - feat: 引入完整测试框架并修复关键bug (版本10)

**核心功能**:

1. **测试框架基础设施**
   - Vitest 单元测试框架
   - Playwright E2E 测试框架
   - 独立测试环境配置

2. **Excel多页面数据保存bug修复**
   - 修复dropdownData和validationData丢失问题
   - 保存前先保存原有数据
   - 优先使用前端值，无则保留原值

3. **测试覆盖范围**
   - 单元测试: 13个文件
   - 集成测试: 9个文件
   - E2E测试: 5个文件
   - 性能测试框架

**变更统计**:
- 58 个文件修改
- +23767 行, -260 行

---

## 版本演进总结

### 技术演进亮点

1. **并发能力**: 支持 16 个并发任务 (4 workers × 4 concurrent)
2. **安全性**: 修复 P0/P1 级别安全漏洞，强化认证和支付安全
3. **稳定性**: 多层防护机制，槽位泄露风险降低
4. **可靠性**: 原子操作、重试机制、状态补偿链路
5. **数据一致性**: 事务化处理，队列回补机制
6. **可测试性**: 完整的测试框架（单元、集成、E2E）

### 当前版本状态

- **Master 分支**: cbef33c (版本 13)
- **Dev 分支**: 7e3ef37 (版本 13)
- **项目版本**: v1.0.0
- **最后更新**: 2026-01-22

### 下一步计划

1. 配置 GitHub SSH 密钥并推送到远程仓库
2. 建立 CI/CD 流程集成测试
3. 定期从 dev 分支合并到 master
4. 监控系统稳定性指标

---

*文档创建时间: 2026-01-22*
*文档维护者: LogicCore Team*
