#!/bin/bash
# 测试代码修复脚本
# 修复API路由参数格式错误

echo "🔧 开始修复测试代码..."

# 修复SDC API测试中的路由格式
echo "修复 tests/integration/sdc-thrpages/sdc-api.test.ts..."
sed -i 's|/api/v1/sdc-thrpages/sheets?taskId=${taskId}|/api/v1/sdc-thrpages/${taskId}/sheets|g' \
  tests/integration/sdc-thrpages/sdc-api.test.ts

sed -i 's|/api/v1/sdc-thrpages/sheets?taskId=non-existent-task|/api/v1/sdc-thrpages/non-existent-task/sheets|g' \
  tests/integration/sdc-thrpages/sdc-api.test.ts

# 修复UPF API测试中的路由格式
echo "修复 tests/integration/upf-thrpages/upf-api.test.ts..."
sed -i 's|/api/v1/upf-thrpages/sheets?taskId=${taskId}|/api/v1/upf-thrpages/${taskId}/sheets|g' \
  tests/integration/upf-thrpages/upf-api.test.ts

sed -i 's|/api/v1/upf-thrpages/sheets?taskId=non-existent-task|/api/v1/upf-thrpages/non-existent-task/sheets|g' \
  tests/integration/upf-thrpages/upf-api.test.ts

# 修复E2E测试中的API路由
echo "修复 tests/e2e/sdc-tool.spec.ts..."
sed -i 's|/api/v1/sdc-thrpages/sheets?taskId=\${taskId}|/api/v1/sdc-thrpages/\${taskId}/sheets|g' \
  tests/e2e/sdc-tool.spec.ts

echo "✅ 修复完成！"
echo ""
echo "修复内容："
echo "1. API路由参数格式：sheets?taskId=xxx → sheets/{taskId}/"
echo "2. SDG和UPF测试的路由格式"
echo ""
echo "请检查修复结果并运行测试验证"
