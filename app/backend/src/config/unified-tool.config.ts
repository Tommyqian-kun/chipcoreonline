/**
 * 统一工具配置
 * 定义前端工具名称与后端工具类型的标准映射关系
 * 确保前后端配置的一致性
 */

// 工具名称映射类型定义
export interface ToolNameMapping {
  frontendName: string;
  toolType: string;
  displayName: string;
  description: string;
  routePath: string;
}

// 标准工具映射配置（单一数据源）
export const STANDARD_TOOL_MAPPINGS: Record<string, ToolNameMapping> = {
  'sdc-generator': {
    frontendName: 'sdc-generator',
    toolType: 'sdcgen',
    displayName: 'SDC Generator',
    description: 'Synopsys Design Constraints 约束文件生成工具',
    routePath: '/tools/sdc-generator'
  },
  'upf-generator': {
    frontendName: 'upf-generator',
    toolType: 'upfgen',
    displayName: 'UPF Generator',
    description: 'Unified Power Format 功耗约束文件生成工具',
    routePath: '/tools/upf-generator'
  },
  'clk-tree-generator': {
    frontendName: 'clk-tree-generator',
    toolType: 'clkgen',
    displayName: 'Clock Tree Generator',
    description: '时钟树生成工具',
    routePath: '/tools/clk-tree-generator'
  },
  'memory-generator': {
    frontendName: 'memory-generator',
    toolType: 'memgen',
    displayName: 'Memory Generator',
    description: '内存数据生成工具',
    routePath: '/tools/memory-generator'
  }
} as const;

// 类型安全的工具名称和类型
export type StandardFrontendName = keyof typeof STANDARD_TOOL_MAPPINGS;
export type StandardToolType = typeof STANDARD_TOOL_MAPPINGS[StandardFrontendName]['toolType'];

/**
 * 统一工具配置管理器
 */
export class UnifiedToolConfigManager {
  /**
   * 根据前端名称获取工具类型
   */
  static getToolTypeByFrontendName(frontendName: string): string | null {
    const mapping = STANDARD_TOOL_MAPPINGS[frontendName];
    return mapping?.toolType || null;
  }

  /**
   * 根据工具类型获取前端名称
   */
  static getFrontendNameByToolType(toolType: string): string | null {
    for (const [frontendName, mapping] of Object.entries(STANDARD_TOOL_MAPPINGS)) {
      if (mapping.toolType === toolType) {
        return frontendName;
      }
    }
    return null;
  }

  /**
   * 获取所有标准前端名称
   */
  static getAllFrontendNames(): string[] {
    return Object.keys(STANDARD_TOOL_MAPPINGS);
  }

  /**
   * 获取所有标准工具类型
   */
  static getAllToolTypes(): string[] {
    return Object.values(STANDARD_TOOL_MAPPINGS).map(m => m.toolType);
  }

  /**
   * 验证前端名称是否为标准名称
   */
  static isStandardFrontendName(frontendName: string): boolean {
    return frontendName in STANDARD_TOOL_MAPPINGS;
  }

  /**
   * 验证工具类型是否为标准类型
   */
  static isStandardToolType(toolType: string): boolean {
    return Object.values(STANDARD_TOOL_MAPPINGS).some(m => m.toolType === toolType);
  }

  /**
   * 获取完整的工具映射信息
   */
  static getToolMapping(frontendName: string): ToolNameMapping | null {
    return STANDARD_TOOL_MAPPINGS[frontendName] || null;
  }

  /**
   * 获取所有工具映射
   */
  static getAllMappings(): ToolNameMapping[] {
    return Object.values(STANDARD_TOOL_MAPPINGS);
  }

  /**
   * 验证映射一致性
   */
  static validateMappingConsistency(): {
    valid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // 检查是否有重复的工具类型
    const toolTypes = this.getAllToolTypes();
    const uniqueToolTypes = new Set(toolTypes);
    if (toolTypes.length !== uniqueToolTypes.size) {
      issues.push('Duplicate tool types found in mappings');
    }

    // 检查前端名称格式
    for (const [frontendName, mapping] of Object.entries(STANDARD_TOOL_MAPPINGS)) {
      if (!frontendName.includes('-')) {
        issues.push(`Frontend name should contain hyphen: ${frontendName}`);
      }
      
      if (mapping.frontendName !== frontendName) {
        issues.push(`Inconsistent frontend name: ${frontendName} vs ${mapping.frontendName}`);
      }
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }
}

// 导出便捷函数
export const getToolTypeByFrontendName = UnifiedToolConfigManager.getToolTypeByFrontendName;
export const getFrontendNameByToolType = UnifiedToolConfigManager.getFrontendNameByToolType;
export const isStandardFrontendName = UnifiedToolConfigManager.isStandardFrontendName;
export const isStandardToolType = UnifiedToolConfigManager.isStandardToolType;
