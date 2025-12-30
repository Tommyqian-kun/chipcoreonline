/**
 * 工具类型配置管理
 * 统一管理所有支持的工具类型，支持动态扩展
 */

export interface ToolTypeConfig {
  /** 工具类型标识符 */
  type: string;
  /** 工具类型显示名称 */
  displayName: string;
  /** 工具类型描述 */
  description: string;
  /** 支持的文件扩展名 */
  supportedExtensions: string[];
  /** 必需的输入文件 */
  requiredFiles: string[];
  /** 可选的输入文件 */
  optionalFiles?: string[];
  /** 最大文件大小限制 (MB) */
  maxFileSize: number;
  /** 工具特定的目录结构 */
  directories: {
    input: string;
    output: string;
    logs: string;
    reports?: string;
    temp?: string;
  };
  /** 工具特定的环境变量 */
  environmentVariables?: Record<string, string>;
  /** 是否启用 */
  enabled: boolean;
}

/**
 * 预定义的工具类型配置
 */
export const TOOL_TYPE_CONFIGS: Record<string, ToolTypeConfig> = {
  sdcgen: {
    type: 'sdcgen',
    displayName: 'SDC Generator',
    description: 'Synopsys Design Constraints 约束文件生成工具',
    supportedExtensions: ['.yaml', '.yml', '.v', '.xlsx', '.xls'],
    requiredFiles: ['hier.yaml', 'vlog.v', 'dcont.xlsx'],
    optionalFiles: ['custom.tcl'],
    maxFileSize: 5, // 5MB
    directories: {
      input: 'inputs',
      output: 'outputs',
      logs: 'logs',
      reports: 'rpts'
    },
    environmentVariables: {
      'SDC_MODE': 'generate',
      'SDC_VERSION': '1.0'
    },
    enabled: true
  },
  
  upfgen: {
    type: 'upfgen',
    displayName: 'UPF Generator',
    description: 'Unified Power Format 功耗约束文件生成工具',
    supportedExtensions: ['.yaml', '.yml', '.v', '.tcl', '.xlsx', '.xls'],
    requiredFiles: ['hier.yaml', 'pvlog.v', 'pobj.tcl', 'pcont.xlsx'],
    optionalFiles: ['power.tcl'],
    maxFileSize: 5, // 5MB
    directories: {
      input: 'inputs',
      output: 'outputs',
      logs: 'logs',
      reports: 'rpts'
    },
    environmentVariables: {
      'UPF_MODE': 'generate',
      'UPF_VERSION': '1.0'
    },
    enabled: true
  },

  memgen: {
    type: 'memgen',
    displayName: 'Memory Generator',
    description: '内存数据生成工具',
    supportedExtensions: ['.yaml', '.yml', '.json', '.txt'],
    requiredFiles: ['config.yaml'],
    optionalFiles: ['template.txt'],
    maxFileSize: 10, // 10MB
    directories: {
      input: 'inputs',
      output: 'outputs',
      logs: 'logs'
    },
    environmentVariables: {
      'MEMORY_MODE': 'generate',
      'MEMORY_VERSION': '1.0'
    },
    enabled: true
  },

  clkgen: {
    type: 'clkgen',
    displayName: 'Clock Tree Generator',
    description: '时钟树生成工具',
    supportedExtensions: ['.yaml', '.yml', '.v', '.sv', '.tcl'],
    requiredFiles: ['clk_spec.yaml', 'design.v'],
    optionalFiles: ['constraints.tcl', 'config.yaml'],
    maxFileSize: 8, // 8MB
    directories: {
      input: 'inputs',
      output: 'outputs',
      logs: 'logs',
      reports: 'rpts'
    },
    environmentVariables: {
      'CLKGEN_MODE': 'generate',
      'CLKGEN_VERSION': '1.0'
    },
    enabled: true
  }
};

/**
 * 工具类型管理服务
 */
export class ToolTypeManager {
  private static instance: ToolTypeManager;
  private toolTypes: Map<string, ToolTypeConfig> = new Map();

  private constructor() {
    // 初始化预定义的工具类型
    Object.values(TOOL_TYPE_CONFIGS).forEach(config => {
      this.toolTypes.set(config.type, config);
    });
  }

  public static getInstance(): ToolTypeManager {
    if (!ToolTypeManager.instance) {
      ToolTypeManager.instance = new ToolTypeManager();
    }
    return ToolTypeManager.instance;
  }

  /**
   * 获取所有启用的工具类型
   */
  public getEnabledToolTypes(): ToolTypeConfig[] {
    return Array.from(this.toolTypes.values()).filter(config => config.enabled);
  }

  /**
   * 根据类型获取工具配置
   */
  public getToolTypeConfig(type: string): ToolTypeConfig | undefined {
    return this.toolTypes.get(type);
  }

  /**
   * 检查工具类型是否支持
   */
  public isToolTypeSupported(type: string): boolean {
    const config = this.toolTypes.get(type);
    return config !== undefined && config.enabled;
  }

  /**
   * 动态注册新的工具类型
   */
  public registerToolType(config: ToolTypeConfig): void {
    this.toolTypes.set(config.type, config);
  }

  /**
   * 获取所有工具类型名称
   */
  public getAllToolTypeNames(): string[] {
    return Array.from(this.toolTypes.keys());
  }

  /**
   * 根据工具ID推断工具类型（优化版本：增强映射一致性）
   */
  public inferToolTypeFromToolId(toolId: string): string | null {
    const lowerToolId = toolId.toLowerCase();

    // 精确的前端名称到工具类型映射（与ToolMappingService保持一致）
    const frontendNameToTypeMap: Record<string, string> = {
      'sdc-generator': 'sdcgen',
      'upf-generator': 'upfgen',
      'clk-tree-generator': 'clkgen',
      'memory-generator': 'memgen'
    };

    // 首先检查精确匹配
    if (frontendNameToTypeMap[lowerToolId]) {
      return frontendNameToTypeMap[lowerToolId];
    }

    // 然后进行模式匹配
    if (lowerToolId.includes('sdc')) return 'sdcgen';
    if (lowerToolId.includes('upf')) return 'upfgen';
    if (lowerToolId.includes('clk') || lowerToolId.includes('clock')) return 'clkgen';
    if (lowerToolId.includes('memory') || lowerToolId.includes('mem')) return 'memgen';

    // 备用：检查是否直接包含工具类型名称
    for (const type of this.getAllToolTypeNames()) {
      if (lowerToolId.includes(type.toLowerCase())) {
        return type;
      }
    }

    return null;
  }

  /**
   * 验证文件是否符合工具类型要求
   */
  public validateFilesForToolType(type: string, fileNames: string[]): {
    valid: boolean;
    missingFiles: string[];
    invalidFiles: string[];
  } {
    const config = this.getToolTypeConfig(type);
    if (!config) {
      return { valid: false, missingFiles: [], invalidFiles: ['Unknown tool type'] };
    }

    const missingFiles: string[] = [];
    const invalidFiles: string[] = [];

    // 检查必需文件
    config.requiredFiles.forEach(requiredFile => {
      if (!fileNames.includes(requiredFile)) {
        missingFiles.push(requiredFile);
      }
    });

    // 检查文件扩展名
    fileNames.forEach(fileName => {
      const extension = fileName.substring(fileName.lastIndexOf('.'));
      if (!config.supportedExtensions.includes(extension)) {
        invalidFiles.push(fileName);
      }
    });

    return {
      valid: missingFiles.length === 0 && invalidFiles.length === 0,
      missingFiles,
      invalidFiles
    };
  }
}

// 导出单例实例
export const toolTypeManager = ToolTypeManager.getInstance();
