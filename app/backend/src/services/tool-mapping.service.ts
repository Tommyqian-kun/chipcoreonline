/**
 * 工具映射服务
 * 处理前端工具名称与数据库工具ID的映射关系
 * 优化版本：增强类型安全、性能缓存和错误处理
 */

import { prisma } from '../utils/database';
import { toolTypeManager } from '../config/tool-types.config';
import { UnifiedToolConfigManager, getToolTypeByFrontendName } from '../config/unified-tool.config';
import logger from '../config/logger';

// 类型安全的工具映射接口
export interface ToolMapping {
  frontendName: string;
  databaseId: string;
  toolType: string;
  displayName: string;
}

// 工具映射查询结果接口
export interface ToolMappingQueryResult {
  success: boolean;
  data?: ToolMapping;
  error?: string;
}

// 批量查询结果接口
export interface BatchMappingResult {
  success: boolean;
  mappings: ToolMapping[];
  errors: string[];
}

export class ToolMappingService {
  private static toolMappings: Map<string, ToolMapping> = new Map();
  private static reverseMapping: Map<string, ToolMapping> = new Map(); // 数据库ID到映射的反向索引
  private static typeMapping: Map<string, ToolMapping[]> = new Map(); // 工具类型到映射列表的索引
  private static initialized = false;
  private static lastInitTime = 0;
  private static readonly CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

  /**
   * 初始化工具映射（优化版本：支持缓存刷新和多重索引）
   */
  static async initialize(): Promise<void> {
    const now = Date.now();

    // 检查缓存是否仍然有效
    if (this.initialized && (now - this.lastInitTime) < this.CACHE_TTL) {
      return;
    }

    try {
      logger.info('Initializing tool mappings...');

      // 清空现有映射
      this.toolMappings.clear();
      this.reverseMapping.clear();
      this.typeMapping.clear();

      // 从数据库获取所有工具
      const tools = await prisma.tool.findMany({
        where: { isPublic: true },
        select: {
          id: true,
          name: true,
          toolType: true,
          description: true
        }
      });

      // 创建映射关系和索引
      for (const tool of tools) {
        // 使用数据库中的工具类型，如果没有则推断
        const toolType = (tool as any).toolType || toolTypeManager.inferToolTypeFromToolId(tool.name) || 'sdcgen';
        const frontendName = this.generateFrontendName(tool.name, toolType);

        const mapping: ToolMapping = {
          frontendName,
          databaseId: tool.id,
          toolType: toolType,
          displayName: tool.name
        };

        // 构建主映射
        this.toolMappings.set(frontendName, mapping);

        // 构建反向映射（数据库ID -> 映射）
        this.reverseMapping.set(tool.id, mapping);

        // 构建类型映射（工具类型 -> 映射列表）
        if (!this.typeMapping.has(toolType)) {
          this.typeMapping.set(toolType, []);
        }
        this.typeMapping.get(toolType)!.push(mapping);
      }

      this.initialized = true;
      this.lastInitTime = now;

      logger.info(`✅ Tool mappings initialized: ${this.toolMappings.size} tools, ${this.typeMapping.size} types`);
    } catch (error) {
      logger.error('❌ Failed to initialize tool mappings:', error);
      this.initialized = false;
      throw error;
    }
  }

  /**
   * 根据前端工具名称获取数据库工具ID（优化版本：增强错误处理）
   */
  static async getToolIdByFrontendName(frontendName: string): Promise<string | null> {
    try {
      await this.initialize();
      const mapping = this.toolMappings.get(frontendName);

      if (mapping) {
        logger.debug(`Tool mapping found: ${frontendName} -> ${mapping.databaseId}`);
        return mapping.databaseId;
      }

      logger.warn(`No mapping found for frontend name: ${frontendName}`);
      return null;
    } catch (error) {
      logger.error(`Error getting tool ID for frontend name ${frontendName}:`, error);
      return null;
    }
  }

  /**
   * 根据数据库工具ID获取工具类型（优化版本：使用反向索引）
   */
  static async getToolTypeByDatabaseId(databaseId: string): Promise<string | null> {
    try {
      await this.initialize();
      const mapping = this.reverseMapping.get(databaseId);

      if (mapping) {
        logger.debug(`Tool type found: ${databaseId} -> ${mapping.toolType}`);
        return mapping.toolType;
      }

      logger.warn(`No mapping found for database ID: ${databaseId}`);
      return null;
    } catch (error) {
      logger.error(`Error getting tool type for database ID ${databaseId}:`, error);
      return null;
    }
  }

  /**
   * 获取所有工具映射
   */
  static async getAllMappings(): Promise<ToolMapping[]> {
    await this.initialize();
    return Array.from(this.toolMappings.values());
  }

  /**
   * 验证前端工具名称是否有效
   */
  static async isValidFrontendName(frontendName: string): Promise<boolean> {
    await this.initialize();
    return this.toolMappings.has(frontendName);
  }



  /**
   * 根据工具名称和类型生成前端名称（优化版本：使用统一配置）
   */
  private static generateFrontendName(toolName: string, toolType: string): string {
    // 首先尝试从统一配置获取标准前端名称
    const standardFrontendName = UnifiedToolConfigManager.getFrontendNameByToolType(toolType);
    if (standardFrontendName) {
      logger.debug(`Using standard frontend name for ${toolType}: ${standardFrontendName}`);
      return standardFrontendName;
    }

    // 如果不是标准工具类型，使用动态生成逻辑
    logger.warn(`No standard mapping found for tool type: ${toolType}, using dynamic generation`);

    // 标准化工具名称格式
    const baseName = toolName.toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');

    // 动态生成前端名称
    if (!baseName.includes(toolType)) {
      return `${toolType}-${baseName}`;
    }

    return baseName;
  }

  /**
   * 刷新工具映射（优化版本：清理所有缓存）
   */
  static async refresh(): Promise<void> {
    logger.info('Refreshing tool mappings...');
    this.initialized = false;
    this.lastInitTime = 0;
    this.toolMappings.clear();
    this.reverseMapping.clear();
    this.typeMapping.clear();
    await this.initialize();
  }

  /**
   * 获取映射统计信息（新增方法）
   */
  static async getMappingStats(): Promise<{
    totalTools: number;
    toolTypes: string[];
    typeDistribution: Record<string, number>;
    lastUpdated: Date;
  }> {
    await this.initialize();

    const typeDistribution: Record<string, number> = {};
    for (const [type, mappings] of this.typeMapping.entries()) {
      typeDistribution[type] = mappings.length;
    }

    return {
      totalTools: this.toolMappings.size,
      toolTypes: Array.from(this.typeMapping.keys()),
      typeDistribution,
      lastUpdated: new Date(this.lastInitTime)
    };
  }

  /**
   * 检查映射是否需要刷新（新增方法）
   */
  static shouldRefresh(): boolean {
    const now = Date.now();
    return !this.initialized || (now - this.lastInitTime) >= this.CACHE_TTL;
  }

  /**
   * 根据工具类型获取所有工具（优化版本：使用类型索引）
   */
  static async getToolsByType(toolType: string): Promise<ToolMapping[]> {
    try {
      await this.initialize();
      const mappings = this.typeMapping.get(toolType) || [];

      logger.debug(`Found ${mappings.length} tools for type: ${toolType}`);
      return [...mappings]; // 返回副本以防止外部修改
    } catch (error) {
      logger.error(`Error getting tools by type ${toolType}:`, error);
      return [];
    }
  }

  /**
   * 批量获取工具映射（新增方法）
   */
  static async getToolMappingsByFrontendNames(frontendNames: string[]): Promise<BatchMappingResult> {
    try {
      await this.initialize();
      const mappings: ToolMapping[] = [];
      const errors: string[] = [];

      for (const name of frontendNames) {
        const mapping = this.toolMappings.get(name);
        if (mapping) {
          mappings.push(mapping);
        } else {
          errors.push(`No mapping found for: ${name}`);
        }
      }

      return {
        success: errors.length === 0,
        mappings,
        errors
      };
    } catch (error) {
      logger.error('Error in batch tool mapping query:', error);
      return {
        success: false,
        mappings: [],
        errors: [`Batch query failed: ${(error as Error).message}`]
      };
    }
  }

  /**
   * 验证工具类型和前端名称的一致性（优化版本：使用统一配置验证）
   */
  static async validateToolConsistency(): Promise<{
    valid: boolean;
    issues: string[];
  }> {
    await this.initialize();
    const issues: string[] = [];

    // 首先验证统一配置本身的一致性
    const configValidation = UnifiedToolConfigManager.validateMappingConsistency();
    if (!configValidation.valid) {
      issues.push(...configValidation.issues.map(issue => `Config: ${issue}`));
    }

    // 验证数据库映射与统一配置的一致性
    for (const mapping of this.toolMappings.values()) {
      // 检查工具类型是否支持
      if (!toolTypeManager.isToolTypeSupported(mapping.toolType)) {
        issues.push(`Tool ${mapping.frontendName} has unsupported type: ${mapping.toolType}`);
      }

      // 检查是否符合标准映射
      const expectedFrontendName = UnifiedToolConfigManager.getFrontendNameByToolType(mapping.toolType);
      if (expectedFrontendName && expectedFrontendName !== mapping.frontendName) {
        issues.push(`Tool ${mapping.frontendName} should be named ${expectedFrontendName} for type ${mapping.toolType}`);
      }

      // 检查反向映射一致性
      const expectedToolType = getToolTypeByFrontendName(mapping.frontendName);
      if (expectedToolType && expectedToolType !== mapping.toolType) {
        issues.push(`Tool ${mapping.frontendName} should have type ${expectedToolType}, but has ${mapping.toolType}`);
      }
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }
}

// 导出便捷函数
export const getToolIdByName = ToolMappingService.getToolIdByFrontendName;
export const getToolTypeById = ToolMappingService.getToolTypeByDatabaseId;
export const validateToolName = ToolMappingService.isValidFrontendName;
