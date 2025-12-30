import { prisma } from './database';

// 工具的输入 Schema 定义
const toolSchemas = {
  'sdc-generator': {
    type: 'object',
    properties: {
      clockPeriod: {
        type: 'number',
        title: '时钟周期 (ns)',
        description: '主时钟的周期，单位为纳秒',
        default: 10,
        minimum: 1,
        maximum: 1000
      },
      inputDelay: {
        type: 'number',
        title: '输入延迟 (ns)',
        description: '输入信号相对于时钟的延迟',
        default: 2,
        minimum: 0,
        maximum: 50
      },
      outputDelay: {
        type: 'number',
        title: '输出延迟 (ns)',
        description: '输出信号相对于时钟的延迟',
        default: 2,
        minimum: 0,
        maximum: 50
      },
      clockName: {
        type: 'string',
        title: '时钟名称',
        description: '主时钟的名称',
        default: 'clk'
      },
      resetAsync: {
        type: 'boolean',
        title: '异步复位',
        description: '是否使用异步复位',
        default: true
      }
    },
    required: ['clockPeriod', 'clockName']
  },

  'upf-generator': {
    type: 'object',
    properties: {
      modName: {
        type: 'string',
        title: '模块名称',
        description: '顶层模块的名称',
        minLength: 1,
        maxLength: 100
      },
      version: {
        type: 'string',
        title: 'UPF版本',
        description: 'UPF格式版本',
        enum: ['1.0', '2.0', '3.0'],
        default: '2.0'
      },
      isFlat: {
        type: 'boolean',
        title: '平坦化模式',
        description: '是否使用平坦化生成模式',
        default: false
      },
      powerDomains: {
        type: 'array',
        title: '功耗域列表',
        description: '设计中的功耗域定义',
        items: {
          type: 'string'
        },
        default: []
      },
      voltageAreas: {
        type: 'array',
        title: '电压区域',
        description: '不同电压等级的区域定义',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            voltage: { type: 'number' }
          }
        },
        default: []
      },
      powerSwitches: {
        type: 'boolean',
        title: '启用电源开关',
        description: '是否生成电源开关控制逻辑',
        default: true
      }
    },
    required: ['modName', 'version']
  },

  'clk-tree-generator': {
    type: 'object',
    properties: {
      sourceFreq: {
        type: 'number',
        title: '源时钟频率 (MHz)',
        description: '输入时钟源的频率',
        default: 100,
        minimum: 1,
        maximum: 1000
      },
      targetFreqs: {
        type: 'array',
        title: '目标频率列表',
        description: '需要生成的目标时钟频率',
        items: {
          type: 'number',
          minimum: 1,
          maximum: 1000
        },
        default: [50, 25, 12.5]
      },
      bufferType: {
        type: 'string',
        title: 'Buffer类型',
        description: '时钟缓冲器的类型',
        enum: ['BUFG', 'BUFH', 'BUFR'],
        default: 'BUFG'
      },
      enableSkewControl: {
        type: 'boolean',
        title: '启用偏斜控制',
        description: '是否启用时钟偏斜控制',
        default: false
      }
    },
    required: ['sourceFreq', 'targetFreqs']
  },
  
  'memory-generator': {
    type: 'object',
    properties: {
      memoryType: {
        type: 'string',
        title: 'Memory类型',
        description: '存储器的类型',
        enum: ['SPRAM', 'DPRAM', 'ROM'],
        default: 'SPRAM'
      },
      addressWidth: {
        type: 'number',
        title: '地址宽度',
        description: '地址总线的位宽',
        default: 8,
        minimum: 4,
        maximum: 32
      },
      dataWidth: {
        type: 'number',
        title: '数据宽度',
        description: '数据总线的位宽',
        default: 8,
        minimum: 1,
        maximum: 64
      },
      initPattern: {
        type: 'string',
        title: '初始化模式',
        description: '存储器的初始化数据模式',
        enum: ['zeros', 'ones', 'random', 'sequence', 'custom'],
        default: 'zeros'
      },
      customData: {
        type: 'string',
        title: '自定义数据',
        description: '自定义的初始化数据（十六进制格式）',
        default: ''
      }
    },
    required: ['memoryType', 'addressWidth', 'dataWidth', 'initPattern']
  }
};

export async function seedDatabase() {
  console.log('开始初始化数据库数据...');

  try {
    // 清理现有工具数据（可选）
    await prisma.tool.deleteMany();
    console.log('清理现有工具数据完成');

    // 创建工具数据
    const tools = [
      {
        name: 'sdc-generator',
        description: 'SDC约束文件生成器，自动生成时序约束文件，支持时钟定义、I/O延迟设置等功能',
        toolType: 'sdcgen',
        inputSchema: toolSchemas['sdc-generator'],
        dockerImage: 'logiccore/sdc-generator:latest',
        version: '1.0.0'
      },
      {
        name: 'upf-generator',
        description: 'UPF功耗管理文件生成器，智能生成功耗控制文件，支持多电压域和复杂功耗策略',
        toolType: 'upfgen',
        inputSchema: toolSchemas['upf-generator'],
        dockerImage: 'logiccore/upf-generator:latest',
        version: '1.0.0'
      },
      {
        name: 'clk-tree-generator',
        description: '时钟树电路生成器，根据时钟需求自动生成时钟分配网络和控制逻辑',
        toolType: 'clkgen',
        inputSchema: toolSchemas['clk-tree-generator'],
        dockerImage: 'logiccore/clk-tree-generator:latest',
        version: '1.0.0'
      },
      {
        name: 'memory-generator',
        description: 'Memory数据生成器，支持各种存储器类型的初始化数据生成和Verilog代码输出',
        toolType: 'memgen',
        inputSchema: toolSchemas['memory-generator'],
        dockerImage: 'logiccore/memory-generator:latest',
        version: '1.0.0'
      }
    ];

    for (const tool of tools) {
      await prisma.tool.create({
        data: tool
      });
      console.log(`创建工具: ${tool.name}`);
    }

    // 创建一些示例计划
    const plans = [
      {
        name: 'Basic Plan',
        description: '基础计划，适合个人用户和小型项目',
        priceMonth: 9.99,
        priceYear: 99.99,
        features: {
          toolRunsPerDay: 10,
          parallelTasks: 1,
          storageGB: 1,
          supportLevel: 'basic'
        }
      },
      {
        name: 'Pro Plan',
        description: '专业计划，适合中型团队和复杂项目',
        priceMonth: 29.99,
        priceYear: 299.99,
        features: {
          toolRunsPerDay: 50,
          parallelTasks: 3,
          storageGB: 10,
          supportLevel: 'priority'
        }
      },
      {
        name: 'Enterprise Plan',
        description: '企业计划，适合大型团队和商业项目',
        priceMonth: 99.99,
        priceYear: 999.99,
        features: {
          toolRunsPerDay: 200,
          parallelTasks: 10,
          storageGB: 100,
          supportLevel: 'dedicated'
        }
      }
    ];

    for (const plan of plans) {
      await prisma.plan.create({
        data: plan
      });
      console.log(`创建计划: ${plan.name}`);
    }

    console.log('数据库初始化完成！');
  } catch (error) {
    console.error('数据库初始化失败:', error);
    throw error;
  }
}

// 直接执行数据初始化
seedDatabase()
  .then(() => {
    console.log('数据初始化成功');
    process.exit(0);
  })
  .catch((error) => {
    console.error('数据初始化失败:', error);
    process.exit(1);
  });