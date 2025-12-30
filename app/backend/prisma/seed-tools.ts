import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedTools() {
  console.log('开始添加工具数据...');

  // 使用upsert确保工具存在，如果已存在则跳过
  console.log('检查并创建SDC工具...');
  const sdcTool = await prisma.tool.upsert({
    where: { name: 'SDC Generator' },
    update: {}, // 如果存在则不更新
    create: {
      name: 'SDC Generator',
      description: 'SDC (Synopsys Design Constraints) 约束文件生成工具，用于时序约束和设计规则定义',
      toolType: 'sdcgen',
      version: '1.0.0',
      dockerImage: 'logiccore/sdc-generator:latest',
      isPublic: true,
      inputSchema: {
        type: 'object',
        properties: {
          clockFrequency: {
            type: 'number',
            description: '时钟频率 (MHz)',
            minimum: 1,
            maximum: 1000
          },
          setupTime: {
            type: 'number',
            description: '建立时间 (ns)',
            minimum: 0.1,
            maximum: 10
          },
          holdTime: {
            type: 'number',
            description: '保持时间 (ns)',
            minimum: 0.1,
            maximum: 10
          },
          inputDelay: {
            type: 'number',
            description: '输入延迟 (ns)',
            minimum: 0,
            maximum: 50
          },
          outputDelay: {
            type: 'number',
            description: '输出延迟 (ns)',
            minimum: 0,
            maximum: 50
          }
        },
        required: ['clockFrequency']
      },
      configTemplate: {
        defaultClock: 'clk',
        defaultReset: 'rst_n',
        timingMargin: 0.1,
        enableMultiCycle: false
      }
    }
  });

  // 使用upsert确保UPF工具存在
  console.log('检查并创建UPF工具...');
  const upfTool = await prisma.tool.upsert({
    where: { name: 'UPF Generator' },
    update: {}, // 如果存在则不更新
    create: {
      name: 'UPF Generator',
      description: 'UPF (Unified Power Format) 功耗管理文件生成工具，用于低功耗设计和功耗域管理',
      toolType: 'upfgen',
      version: '1.0.0',
      dockerImage: 'logiccore/upf-generator:latest',
      isPublic: true,
      inputSchema: {
        type: 'object',
        properties: {
          powerDomains: {
            type: 'array',
            description: '功耗域列表',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                voltage: { type: 'number', minimum: 0.5, maximum: 5.0 }
              }
            }
          },
          powerSwitches: {
            type: 'array',
            description: '电源开关列表',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                domain: { type: 'string' }
              }
            }
          },
          retentionStrategy: {
            type: 'string',
            enum: ['none', 'register', 'memory'],
            description: '保持策略'
          }
        },
        required: ['powerDomains']
      },
      configTemplate: {
        defaultVoltage: 1.2,
        enableRetention: true,
        powerGating: false,
        clockGating: true
      }
    }
  });

  console.log('工具数据创建完成:');
  console.log(`- SDC Generator: ${sdcTool.id}`);
  console.log(`- UPF Generator: ${upfTool.id}`);
}

async function main() {
  try {
    await seedTools();
  } catch (error) {
    console.error('种子数据创建失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 直接运行main函数
main().catch((error) => {
  console.error(error);
  process.exit(1);
});

export default main;
