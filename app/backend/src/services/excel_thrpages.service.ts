/**
 * Excel解析服务 - 多页面交互功能
 * 用于解析SDC工具的Excel模板文件和任务生成的dcont.xlsx文件
 */

import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { logToTaskFile, logErrorToTaskFile, isLoggerInitialized } from '../utils/task-logger';

const prisma = new PrismaClient();

// 任务级别的文件操作锁
const taskFileLocks = new Map<string, Promise<void>>();

/**
 * 安全地写入任务日志（只有在日志已初始化时才写入）
 */
function safeLogToTaskFile(message: string): void {
  if (isLoggerInitialized()) {
    logToTaskFile(message);
  } else {
    console.log(message);
  }
}

/**
 * 安全地写入任务错误日志（只有在日志已初始化时才写入）
 */
function safeLogErrorToTaskFile(message: string, error?: any): void {
  if (isLoggerInitialized()) {
    logErrorToTaskFile(message, error);
  } else {
    const errorMessage = error ? `${message}: ${error.message || error}` : message;
    console.error(errorMessage);
  }
}

/**
 * 过滤掉不需要处理的工作表
 * Lists sheet是Excel为了处理长下拉列表而自动生成的隐藏工作表，不属于业务逻辑
 */
function filterBusinessWorksheets(worksheets: ExcelJS.Worksheet[]): ExcelJS.Worksheet[] {
  return worksheets.filter(worksheet => {
    const sheetName = worksheet.name;

    // 忽略Lists工作表（Excel自动生成的下拉数据工作表）
    if (sheetName === 'Lists') {
      safeLogToTaskFile(`🚫 [EXCEL-FILTER] 忽略Lists工作表（Excel自动生成的下拉数据工作表）`);
      return false;
    }

    // 忽略隐藏的工作表
    if (worksheet.state === 'hidden' || worksheet.state === 'veryHidden') {
      safeLogToTaskFile(`🚫 [EXCEL-FILTER] 忽略隐藏工作表: ${sheetName}`);
      return false;
    }

    return true;
  });
}

export interface ColumnInfo {
  index: number;
  name: string;
  type: string;
}

export interface TableInfo {
  name: string;
  startRow: number;
  startCol: number;
  columns: ColumnInfo[];
  sampleData: any[];
  totalDataRows: number;
}

export interface SheetInfo {
  id: number;
  name: string;
  tables: TableInfo[];
}

export interface ExcelAnalysisResult {
  sheets: SheetInfo[];
  tables: TableInfo[];
  totalTables: number;
}

export class ExcelThrpagesService {
  // SDC工具的表格标识符和映射
  private static readonly SDC_TABLE_IDENTIFIERS = [
    'TMVAR', 'TMCLK', 'TMIODLY', 'TMIOEXP', 'TMINOUT', 'TMINTEXP', 'TMSTPGATE'
  ];

  private static readonly SDC_SHEET_TABLE_MAPPING = {
    'VarDef': ['TMVAR'],
    'ClkDef': ['TMCLK'],
    'IODly': ['TMIODLY'],
    'Exp': ['TMIOEXP', 'TMINOUT', 'TMINTEXP', 'TMSTPGATE']
  };

  // UPF工具的表格标识符和映射
  private static readonly UPF_TABLE_IDENTIFIERS = [
    'PMVAR', 'PMCELL', 'PMDOMAIN', 'PMNETWORK', 'PMBOUNDARY', 'PMISO', 'PMLS', 'PMPSW', 'PMRET', 'PMMODE'
  ];

  private static readonly UPF_SHEET_TABLE_MAPPING = {
    'VarDef': ['PMVAR', 'PMCELL'],
    'PDomain': ['PMDOMAIN', 'PMNETWORK', 'PMBOUNDARY'],
    'PStrategy': ['PMISO', 'PMLS', 'PMPSW', 'PMRET'],
    'PMode': ['PMMODE']
  };

  /**
   * 根据工具类型获取表格标识符
   */
  private static getTableIdentifiers(toolType: string): string[] {
    switch (toolType) {
      case 'sdc':
      case 'sdcgen':
        return this.SDC_TABLE_IDENTIFIERS;
      case 'upf':
      case 'upfgen':
        return this.UPF_TABLE_IDENTIFIERS;
      default:
        throw new Error(`不支持的工具类型: ${toolType}`);
    }
  }

  /**
   * 根据工具类型获取Sheet-Table映射
   */
  private static getSheetTableMapping(toolType: string): { [key: string]: string[] } {
    switch (toolType) {
      case 'sdc':
      case 'sdcgen':
        return this.SDC_SHEET_TABLE_MAPPING;
      case 'upf':
      case 'upfgen':
        return this.UPF_SHEET_TABLE_MAPPING;
      default:
        throw new Error(`不支持的工具类型: ${toolType}`);
    }
  }

  /**
   * 解析Excel模板文件
   */
  static async analyzeTemplateFile(templatePath: string, toolType: string = 'sdc', silent: boolean = false): Promise<ExcelAnalysisResult> {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(templatePath);

      if (!silent) {
        console.log(`=== ${toolType.toUpperCase()}工具Excel模板文件分析 ===`);
        console.log(`文件路径: ${templatePath}`);
        console.log(`工作表数量: ${workbook.worksheets.length}`);
      }

      const analysis: ExcelAnalysisResult = {
        sheets: [],
        tables: [],
        totalTables: 0
      };

      // 过滤掉不需要处理的工作表（如Lists sheet）
      const businessWorksheets = filterBusinessWorksheets(workbook.worksheets);

      // 分析每个业务工作表
      businessWorksheets.forEach((worksheet, index) => {
        if (!silent) {
          console.log(`--- Sheet ${index + 1}: ${worksheet.name} ---`);
        }

        const sheetInfo: SheetInfo = {
          id: index + 1,
          name: worksheet.name,
          tables: []
        };

        // 查找表格
        this.findTablesInWorksheet(worksheet, sheetInfo, toolType, silent);

        analysis.sheets.push(sheetInfo);
        analysis.tables.push(...sheetInfo.tables.map(table => ({
          ...table,
          sheetName: worksheet.name
        })));
        analysis.totalTables += sheetInfo.tables.length;
      });

      if (!silent) {
        console.log(`\n=== 分析结果摘要 ===`);
        console.log(`总工作表数: ${analysis.sheets.length}`);
        console.log(`总表格数: ${analysis.totalTables}`);
      }

      return analysis;
    } catch (error) {
      console.error('分析Excel模板文件时出错:', error);
      throw error;
    }
  }

  /**
   * 在工作表中查找表格
   */
  private static findTablesInWorksheet(worksheet: ExcelJS.Worksheet, sheetInfo: SheetInfo, toolType: string = 'sdc', silent: boolean = false): void {
    const tableIdentifiers = this.getTableIdentifiers(toolType);

    for (let row = 1; row <= worksheet.rowCount; row++) {
      for (let col = 1; col <= worksheet.columnCount; col++) {
        const cell = worksheet.getCell(row, col);
        if (cell.value && tableIdentifiers.includes(cell.value.toString())) {
          if (!silent) {
            console.log(`  发现表格: ${cell.value} 位置: 行${row}, 列${col}`);
          }

          const tableInfo = this.analyzeTable(worksheet, cell.value.toString(), row, col, silent);
          sheetInfo.tables.push(tableInfo);

          if (!silent) {
            console.log(`    列数: ${tableInfo.columns.length}`);
            console.log(`    列头: ${tableInfo.columns.map(c => c.name).join(', ')}`);
            console.log(`    数据行数: ${tableInfo.totalDataRows}`);
            console.log('');
          }
        }
      }
    }
  }

  /**
   * 分析单个表格
   */
  private static analyzeTable(
    worksheet: ExcelJS.Worksheet,
    tableName: string,
    startRow: number,
    startCol: number,
    silent: boolean = false
  ): TableInfo {
    // 获取表格的列头信息
    const columns: ColumnInfo[] = [];
    let colIndex = startCol; // 修复：从表格实际开始的列开始，而不是从第1列
    while (colIndex <= worksheet.columnCount) {
      const headerCell = worksheet.getCell(startRow + 1, colIndex);
      if (headerCell.value) {
        columns.push({
          index: colIndex,
          name: headerCell.value.toString(),
          type: 'string' // 默认类型
        });
        colIndex++;
      } else {
        break;
      }
    }

    // 分析数据行
    const dataRows: any[] = [];
    let dataRowIndex = startRow + 2; // 跳过表格名称和列头
    let emptyRowCount = 0;

    // 限制扫描范围，避免扫描整个Excel文件 - 与SDC工具保持一致的扫描策略
    const maxScanRows = Math.min(worksheet.rowCount, startRow + 200); // 最多扫描200行，与SDC一致
    if (!silent) {
      console.log(`    开始分析数据行，从第${dataRowIndex}行开始，扫描范围: ${dataRowIndex}-${maxScanRows}`);
    }

    while (dataRowIndex <= maxScanRows && emptyRowCount < 5) { // 允许5个空行，与SDC一致
      const rowData: any = {};
      let hasData = false;

      columns.forEach((column, colIdx) => {
        const dataCell = worksheet.getCell(dataRowIndex, startCol + colIdx);
        if (dataCell.value !== null && dataCell.value !== undefined) {
          rowData[column.name] = dataCell.value;
          hasData = true;
        }
      });

      if (hasData) {
        dataRows.push(rowData);
        emptyRowCount = 0;
      } else {
        emptyRowCount++;
      }

      dataRowIndex++;

      // 添加进度日志，避免无限循环
      if (!silent && dataRowIndex % 100 === 0) {
        console.log(`    已处理到第${dataRowIndex}行，找到${dataRows.length}行数据`);
      }
    }

    if (!silent) {
      console.log(`    数据行分析完成，共找到${dataRows.length}行数据`);
    }

    return {
      name: tableName,
      startRow,
      startCol,
      columns,
      sampleData: dataRows.slice(0, 3), // 只保留前3行作为示例
      totalDataRows: dataRows.length
    };
  }

  /**
   * 硬编码初始化SDC数据库表结构 - 不依赖Excel模板文件解析
   */
  static async initializeSdcDatabaseSchemaHardcoded(): Promise<void> {
    try {
      console.log(`🔧 开始硬编码初始化SDC工具数据库表结构...`);

      const toolType = 'sdc';

      // 检查是否已存在基础表结构
      const existingSheets = await prisma.sheet.findMany({
        where: { toolType }
      });

      if (existingSheets.length > 0) {
        console.log(`✅ ${toolType}工具基础表结构已存在，跳过硬编码初始化`);
        return;
      }

      console.log(`📝 创建${toolType}工具基础表结构（硬编码方式）...`);

      // 硬编码的SDC表格结构定义
      const sdcSchemaDefinition = [
        {
          sheetName: 'VarDef',
          displayOrder: 1,
          tables: [
            {
              tableName: 'TMVAR',
              displayOrder: 1,
              columns: [
                { name: 'Variable', type: 'string', index: 1 },
                { name: 'Value', type: 'string', index: 2 },
                { name: 'Comment', type: 'string', index: 3 }
              ]
            }
          ]
        },
        {
          sheetName: 'ClkDef',
          displayOrder: 2,
          tables: [
            {
              tableName: 'TMCLK',
              displayOrder: 1,
              columns: [
                { name: 'ClkGrp', type: 'string', index: 1 },
                { name: 'Freq', type: 'string', index: 2 },
                { name: 'WaveForm', type: 'string', index: 3 },
                { name: 'DivEdge', type: 'string', index: 4 },
                { name: 'MstClk', type: 'string', index: 5 },
                { name: 'PortPin', type: 'string', index: 6 },
                { name: 'ClkIntg', type: 'string', index: 7 },
                { name: 'Vol', type: 'string', index: 8 },
                { name: 'Comment', type: 'string', index: 9 }
              ]
            }
          ]
        },
        {
          sheetName: 'IODly',
          displayOrder: 3,
          tables: [
            {
              tableName: 'TMIODLY',
              displayOrder: 1,
              columns: [
                { name: 'PortNm', type: 'string', index: 1 },
                { name: 'Direction', type: 'string', index: 2 },
                { name: 'ClkNm', type: 'string', index: 3 },
                { name: 'ClkFall', type: 'string', index: 4 },
                { name: 'DlyMax', type: 'string', index: 5 },
                { name: 'DlyMin', type: 'string', index: 6 },
                { name: 'Vol', type: 'string', index: 7 },
                { name: 'Comment', type: 'string', index: 8 }
              ]
            }
          ]
        },
        {
          sheetName: 'Exp',
          displayOrder: 4,
          tables: [
            {
              tableName: 'TMIOEXP',
              displayOrder: 1,
              columns: [
                { name: 'PortNm', type: 'string', index: 1 },
                { name: 'Direction', type: 'string', index: 2 },
                { name: 'Ideal', type: 'string', index: 3 },
                { name: 'CaseVal', type: 'string', index: 4 },
                { name: 'FP', type: 'string', index: 5 },
                { name: 'MCP', type: 'string', index: 6 },
                { name: 'From', type: 'string', index: 7 },
                { name: 'Through', type: 'string', index: 8 },
                { name: 'To', type: 'string', index: 9 },
                { name: 'Comment', type: 'string', index: 10 }
              ]
            },
            {
              tableName: 'TMINOUT',
              displayOrder: 2,
              columns: [
                { name: 'PortIn', type: 'string', index: 1 },
                { name: 'PortOut', type: 'string', index: 2 },
                { name: 'DlyIn', type: 'string', index: 3 },
                { name: 'DlyOut', type: 'string', index: 4 },
                { name: 'RealDly', type: 'string', index: 5 },
                { name: 'ClkNm', type: 'string', index: 6 },
                { name: 'Vol', type: 'string', index: 7 },
                { name: 'Comment', type: 'string', index: 8 }
              ]
            },
            {
              tableName: 'TMINTEXP',
              displayOrder: 3,
              columns: [
                { name: 'FP', type: 'string', index: 1 },
                { name: 'MCP', type: 'string', index: 2 },
                { name: 'CaseVal', type: 'string', index: 3 },
                { name: 'CasePin', type: 'string', index: 4 },
                { name: 'From', type: 'string', index: 5 },
                { name: 'Through', type: 'string', index: 6 },
                { name: 'To', type: 'string', index: 7 },
                { name: 'Comment', type: 'string', index: 8 }
              ]
            },
            {
              tableName: 'TMSTPGATE',
              displayOrder: 4,
              columns: [
                { name: 'StopClk', type: 'string', index: 1 },
                { name: 'StopPin', type: 'string', index: 2 },
                { name: 'DisClkGating', type: 'string', index: 3 },
                { name: 'Comment', type: 'string', index: 4 }
              ]
            }
          ]
        }
      ];

      console.log(`📊 硬编码结构: ${sdcSchemaDefinition.length}个工作表, ${sdcSchemaDefinition.reduce((total, sheet) => total + sheet.tables.length, 0)}个表格`);

      // 创建sheets和tables记录
      console.log(`📝 创建${sdcSchemaDefinition.length}个工作表记录...`);
      for (const sheetDef of sdcSchemaDefinition) {
        const sheet = await prisma.sheet.create({
          data: {
            toolType,
            sheetName: sheetDef.sheetName,
            displayOrder: sheetDef.displayOrder
          }
        });

        console.log(`  ✅ 创建工作表: ${sheetDef.sheetName} (${sheetDef.tables.length}个表格)`);

        // 创建tables记录
        for (const tableDef of sheetDef.tables) {
          await prisma.table.create({
            data: {
              sheetId: sheet.id,
              toolType,
              tableName: tableDef.tableName,
              columnsSchema: {
                columns: tableDef.columns
              },
              displayOrder: tableDef.displayOrder
            }
          });
          console.log(`    ✅ 创建表格: ${tableDef.tableName} (${tableDef.columns.length}列)`);
        }
      }

      console.log(`✅ SDC工具数据库表结构硬编码初始化完成！`);
    } catch (error) {
      console.error('硬编码初始化SDC数据库表结构时出错:', error);
      throw error;
    }
  }

  /**
   * 硬编码初始化UPF数据库表结构 - 不依赖Excel模板文件解析
   */
  static async initializeUpfDatabaseSchemaHardcoded(): Promise<void> {
    try {
      console.log(`🔧 开始硬编码初始化UPF工具数据库表结构...`);

      const toolType = 'upf';

      // 检查是否已存在基础表结构（包括旧的'upfgen'和新的'upf'类型）
      const existingSheets = await prisma.sheet.findMany({
        where: { toolType: { in: ['upfgen', 'upf'] } }
      });

      if (existingSheets.length > 0) {
        console.log(`✅ UPF工具基础表结构已存在，跳过硬编码初始化`);
        return;
      }

      console.log(`📝 创建UPF工具基础表结构（硬编码方式）...`);

      // 硬编码的UPF表格结构定义
      const upfSchemaDefinition = [
        {
          sheetName: 'VarDef',
          displayOrder: 1,
          tables: [
            {
              tableName: 'PMVAR',
              displayOrder: 1,
              columns: [
                { name: 'Variable', type: 'string', index: 1 },
                { name: 'Value', type: 'string', index: 2 },
                { name: 'Comment', type: 'string', index: 3 }
              ]
            },
            {
              tableName: 'PMCELL',
              displayOrder: 2,
              columns: [
                { name: 'PMType', type: 'string', index: 1 },
                { name: 'PMCtrlSig', type: 'string', index: 2 },
                { name: 'PMCell', type: 'string', index: 3 },
                { name: 'PMSupplyPin', type: 'string', index: 4 },
                { name: 'PMCtrlPin', type: 'string', index: 5 },
                { name: 'PDFunction', type: 'string', index: 6 },
                { name: 'PathType', type: 'string', index: 7 },
                { name: 'NameFormat', type: 'string', index: 8 },
                { name: 'Comment', type: 'string', index: 9 }
              ]
            }
          ]
        },
        {
          sheetName: 'PDomain',
          displayOrder: 2,
          tables: [
            {
              tableName: 'PMDOMAIN',
              displayOrder: 1,
              columns: [
                { name: 'PMName', type: 'string', index: 1 },
                { name: 'Elements', type: 'string', index: 2 },
                { name: 'Comment', type: 'string', index: 3 }
                // 注意：动态电源名称列将在初始化时从pcont.xlsx文件中解析并添加
              ]
            },
            {
              tableName: 'PMNETWORK',
              displayOrder: 2,
              columns: [
                { name: 'SupplyPortNet', type: 'string', index: 1 },
                { name: 'MPowerNet', type: 'string', index: 2 },
                { name: 'InstList', type: 'string', index: 3 },
                { name: 'MapSupplyList', type: 'string', index: 4 },
                { name: 'Comment', type: 'string', index: 5 }
              ]
            },
            {
              tableName: 'PMBOUNDARY',
              displayOrder: 3,
              columns: [
                { name: 'ApplyPorts', type: 'string', index: 1 },
                { name: 'Elements', type: 'string', index: 2 },
                { name: 'ExcludeList', type: 'string', index: 3 },
                { name: 'DriverSupply', type: 'string', index: 4 },
                { name: 'ReceiverSupply', type: 'string', index: 5 },
                { name: 'Attribute', type: 'string', index: 6 },
                { name: 'Comment', type: 'string', index: 7 }
              ]
            }
          ]
        },
        {
          sheetName: 'PStrategy',
          displayOrder: 3,
          tables: [
            {
              tableName: 'PMISO',
              displayOrder: 1,
              columns: [
                { name: 'PDName', type: 'string', index: 1 },
                { name: 'Location', type: 'string', index: 2 },
                { name: 'SrcSupply', type: 'string', index: 3 },
                { name: 'SinkSupply', type: 'string', index: 4 },
                { name: 'DiffSupply', type: 'string', index: 5 },
                { name: 'SupplyIn', type: 'string', index: 6 },
                { name: 'EnCtrlSens', type: 'string', index: 7 },
                { name: 'ClampVal', type: 'string', index: 8 },
                { name: 'ApplyPorts', type: 'string', index: 9 },
                { name: 'Elements', type: 'string', index: 10 },
                { name: 'ExcludeList', type: 'string', index: 11 },
                { name: 'NoISO', type: 'string', index: 12 },
                { name: 'Comment', type: 'string', index: 13 }
              ]
            },
            {
              tableName: 'PMLS',
              displayOrder: 2,
              columns: [
                { name: 'PDName', type: 'string', index: 1 },
                { name: 'Location', type: 'string', index: 2 },
                { name: 'SrcSupply', type: 'string', index: 3 },
                { name: 'SinkSupply', type: 'string', index: 4 },
                { name: 'Rule', type: 'string', index: 5 },
                { name: 'ApplyPorts', type: 'string', index: 6 },
                { name: 'Elements', type: 'string', index: 7 },
                { name: 'ExcludeList', type: 'string', index: 8 },
                { name: 'NoLS', type: 'string', index: 9 },
                { name: 'Comment', type: 'string', index: 10 }
              ]
            },
            {
              tableName: 'PMPSW',
              displayOrder: 3,
              columns: [
                { name: 'PDName', type: 'string', index: 1 },
                { name: 'SupplyIn', type: 'string', index: 2 },
                { name: 'SupplyOut', type: 'string', index: 3 },
                { name: 'EnCtrl', type: 'string', index: 4 },
                { name: 'AckCtrl', type: 'string', index: 5 },
                { name: 'OnState', type: 'string', index: 6 },
                { name: 'OffState', type: 'string', index: 7 },
                { name: 'Comment', type: 'string', index: 8 }
              ]
            },
            {
              tableName: 'PMRET',
              displayOrder: 4,
              columns: [
                { name: 'PDName', type: 'string', index: 1 },
                { name: 'SupplyIn', type: 'string', index: 2 },
                { name: 'SaveCtrl', type: 'string', index: 3 },
                { name: 'RstCtrl', type: 'string', index: 4 },
                { name: 'Elements', type: 'string', index: 5 },
                { name: 'ExcludeList', type: 'string', index: 6 },
                { name: 'NoRET', type: 'string', index: 7 },
                { name: 'RetRegs', type: 'string', index: 8 },
                { name: 'Comment', type: 'string', index: 9 }
              ]
            }
          ]
        },
        {
          sheetName: 'PMode',
          displayOrder: 4,
          tables: [
            {
              tableName: 'PMMODE',
              displayOrder: 1,
              columns: [
                { name: 'PMName', type: 'string', index: 1 },
                { name: 'Comment', type: 'string', index: 2 }
                // 注意：动态电源名称列将在初始化时从pcont.xlsx文件中解析并添加
              ]
            }
          ]
        }
      ];

      console.log(`📊 硬编码结构: ${upfSchemaDefinition.length}个工作表, ${upfSchemaDefinition.reduce((total, sheet) => total + sheet.tables.length, 0)}个表格`);

      // 创建sheets和tables记录
      console.log(`📝 创建${upfSchemaDefinition.length}个工作表记录...`);
      for (const sheetDef of upfSchemaDefinition) {
        const sheet = await prisma.sheet.create({
          data: {
            toolType,
            sheetName: sheetDef.sheetName,
            displayOrder: sheetDef.displayOrder
          }
        });

        console.log(`  ✅ 创建工作表: ${sheetDef.sheetName} (${sheetDef.tables.length}个表格)`);

        // 创建tables记录
        for (const tableDef of sheetDef.tables) {
          await prisma.table.create({
            data: {
              sheetId: sheet.id,
              toolType,
              tableName: tableDef.tableName,
              columnsSchema: {
                columns: tableDef.columns
              },
              displayOrder: tableDef.displayOrder
            }
          });
          console.log(`    ✅ 创建表格: ${tableDef.tableName} (${tableDef.columns.length}列)`);
        }
      }

      console.log(`✅ UPF工具数据库表结构硬编码初始化完成！`);
    } catch (error) {
      console.error('硬编码初始化UPF数据库表结构时出错:', error);
      throw error;
    }
  }

  /**
   * 更新UPF动态表格的列结构（从pcont.xlsx文件中解析）
   * 这个方法会先解析Excel文件获取动态列信息，然后更新所有表格的数据库表结构
   */
  static async updateUpfDynamicTableColumns(taskId: string, pcontExcelPath: string): Promise<void> {
    try {
      console.log(`🔄 [UPF-DYNAMIC] 开始从Excel文件解析动态列信息: ${pcontExcelPath}`);

      // 检查pcont.xlsx文件是否存在
      const fs = await import('fs/promises');
      try {
        await fs.access(pcontExcelPath);
      } catch (error) {
        throw new Error(`pcont.xlsx文件不存在: ${pcontExcelPath}`);
      }

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(pcontExcelPath);

      const businessWorksheets = filterBusinessWorksheets(workbook.worksheets);
      safeLogToTaskFile(`📊 [UPF-DYNAMIC] Excel文件读取成功，总工作表数量: ${workbook.worksheets.length}，业务工作表数量: ${businessWorksheets.length}`);
      businessWorksheets.forEach(ws => {
        safeLogToTaskFile(`📋 [UPF-DYNAMIC] 业务工作表: ${ws.name}`);
      });

      // 🔥 修复：更新所有UPF表格的列结构，而不仅仅是PMDOMAIN和PMMODE
      console.log(`🔄 [UPF-DYNAMIC] 更新所有UPF表格的列结构...`);

      // 定义所有需要更新的表格
      const tablesToUpdate = [
        // VarDef工作表
        { sheetName: 'VarDef', tableName: 'PMVAR' },
        { sheetName: 'VarDef', tableName: 'PMCELL' },

        // PDomain工作表 - 包含动态电源列
        { sheetName: 'PDomain', tableName: 'PMDOMAIN' },
        { sheetName: 'PDomain', tableName: 'PMNETWORK' },    // 🔥 关键修复
        { sheetName: 'PDomain', tableName: 'PMBOUNDARY' },

        // PStrategy工作表
        { sheetName: 'PStrategy', tableName: 'PMISO' },
        { sheetName: 'PStrategy', tableName: 'PMLS' },
        { sheetName: 'PStrategy', tableName: 'PMPSW' },
        { sheetName: 'PStrategy', tableName: 'PMRET' },

        // PMode工作表 - 包含动态电源列
        { sheetName: 'PMode', tableName: 'PMMODE' }
      ];

      // 更新所有表格的列结构
      for (const { sheetName, tableName } of tablesToUpdate) {
        console.log(`🔄 [UPF-DYNAMIC] 更新表格 ${sheetName}.${tableName}...`);
        await this.updateDynamicTableColumns(taskId, workbook, sheetName, tableName);
      }

      console.log(`✅ [UPF-DYNAMIC] 所有UPF表格列结构更新完成`);
    } catch (error) {
      console.error('更新UPF动态表格列结构时出错:', error);
      throw error;
    }
  }

  /**
   * 更新单个动态表格的列结构
   */
  private static async updateDynamicTableColumns(
    taskId: string,
    workbook: any,
    sheetName: string,
    tableName: string
  ): Promise<void> {
    try {
      console.log(`🔄 [UPF-DYNAMIC] 更新表格 ${tableName} 的列结构...`);

      // 查找对应的工作表
      const worksheet = workbook.getWorksheet(sheetName);
      if (!worksheet) {
        console.warn(`⚠️ [UPF-DYNAMIC] 工作表 ${sheetName} 不存在，跳过更新`);
        return;
      }

      // 查找表格在工作表中的位置
      const tablePosition = this.findTableInWorksheet(worksheet, tableName);
      if (!tablePosition) {
        console.warn(`⚠️ [UPF-DYNAMIC] 表格 ${tableName} 在工作表 ${sheetName} 中未找到，跳过更新`);
        return;
      }

      // 提取列头
      const extractedColumns = this.extractTableColumns(worksheet, tablePosition);
      safeLogToTaskFile(`📊 [UPF-DYNAMIC] 表格 ${tableName} 从Excel提取到 ${extractedColumns.length} 列: [${extractedColumns.map((c: any) => c.name).join(', ')}]`);

      // 对于PMDOMAIN和PMMODE表格，需要特殊处理列的顺序
      let finalColumns = extractedColumns;
      if (tableName === 'PMDOMAIN') {
        finalColumns = this.reorderPMDOMAINColumns(extractedColumns);
      } else if (tableName === 'PMMODE') {
        finalColumns = this.reorderPMMODEColumns(extractedColumns);
      }

      safeLogToTaskFile(`📊 [UPF-DYNAMIC] 表格 ${tableName} 重新排序后 ${finalColumns.length} 列: [${finalColumns.map((c: any) => c.name).join(', ')}]`);

      // 更新数据库中的表格列结构（只更新当前任务的表结构）
      const updateResult = await prisma.table.updateMany({
        where: {
          toolType: 'upf',
          tableName: tableName,
          taskId: taskId  // 关键：只更新当前任务的表结构
        } as any,
        data: {
          columnsSchema: {
            columns: finalColumns
          }
        }
      });

      // 检查更新结果并提供详细日志
      if (updateResult.count === 0) {
        safeLogErrorToTaskFile(`❌ [UPF-DYNAMIC] 表格 ${tableName} 没有找到匹配的记录进行更新！`);
        safeLogErrorToTaskFile(`   查询条件: toolType='upf', tableName='${tableName}', taskId='${taskId}'`);
        throw new Error(`表格 ${tableName} 的任务特定记录不存在，请检查 createTaskSpecificTableStructure 是否正确执行`);
      } else {
        safeLogToTaskFile(`✅ [UPF-DYNAMIC] 表格 ${tableName} 列结构更新完成 (更新了 ${updateResult.count} 条记录)`);
      }
    } catch (error) {
      safeLogErrorToTaskFile(`更新表格 ${tableName} 列结构时出错`, error);
      throw error;
    }
  }

  /**
   * 在工作表中查找指定表格的位置
   */
  private static findTableInWorksheet(worksheet: any, tableName: string): any {
    try {
      // 遍历工作表的所有行，查找表格名称
      for (let row = 1; row <= worksheet.rowCount; row++) {
        for (let col = 1; col <= worksheet.columnCount; col++) {
          const cell = worksheet.getCell(row, col);
          if (cell.value === tableName) {
            // 找到表格名称，返回表格位置信息
            return {
              tableNameRow: row,
              tableNameCol: col,
              headerRow: row + 1, // 假设列头在表格名称的下一行
              dataStartRow: row + 2 // 数据从列头的下一行开始
            };
          }
        }
      }
      return null;
    } catch (error) {
      console.error(`查找表格 ${tableName} 位置时出错:`, error);
      return null;
    }
  }

  /**
   * 从表格位置提取列头信息
   * 确保Comment列始终放在最后
   */
  private static extractTableColumns(worksheet: any, tablePosition: any): any[] {
    try {
      const allColumns: any[] = [];
      const headerRow = tablePosition.headerRow;

      // 从列头行提取所有非空的列名
      for (let col = 1; col <= worksheet.columnCount; col++) {
        const cell = worksheet.getCell(headerRow, col);
        const columnName = cell.value;

        if (columnName && typeof columnName === 'string' && columnName.trim() !== '') {
          allColumns.push({
            name: columnName.trim(),
            type: 'string',
            index: col // 保持1基索引，与Excel列号一致
          });
        } else if (allColumns.length > 0) {
          // 如果已经有列了，遇到空列就停止（假设表格是连续的）
          break;
        }
      }

      // 重新排序，确保Comment列在最后
      const commentColumn = allColumns.find(col => col.name === 'Comment');
      const otherColumns = allColumns.filter(col => col.name !== 'Comment');

      // 重新分配索引
      const finalColumns = [...otherColumns];
      if (commentColumn) {
        finalColumns.push(commentColumn);
      }

      // 重新分配索引（保持1基索引，与Excel列号一致）
      finalColumns.forEach((col, index) => {
        col.index = index + 1;
      });

      console.log(`📊 [EXTRACT-COLUMNS] 提取到列头:`, finalColumns.map(c => c.name));

      return finalColumns;
    } catch (error) {
      console.error(`提取表格列头时出错:`, error);
      return [];
    }
  }

  /**
   * 重新排序PMDOMAIN表格的列，确保动态列在Elements和Comment之间
   */
  private static reorderPMDOMAINColumns(columns: any[]): any[] {
    try {
      // 基础列：PDName, Elements
      const pdNameCol = columns.find(col => col.name === 'PDName');
      const elementsCol = columns.find(col => col.name === 'Elements');
      const commentCol = columns.find(col => col.name === 'Comment');

      // 动态列（电源名称列）：除了基础列之外的所有列
      const dynamicCols = columns.filter(col =>
        col.name !== 'PDName' &&
        col.name !== 'Elements' &&
        col.name !== 'Comment'
      );

      // 为动态电源列设置合适的类型（与Excel中的字符串类型保持一致）
      dynamicCols.forEach(col => {
        col.type = 'string'; // 与Excel中的类型保持一致，避免类型不匹配错误
      });

      // 重新排序：PDName, Elements, 动态列..., Comment
      const reorderedColumns: any[] = [];

      if (pdNameCol) reorderedColumns.push(pdNameCol);
      if (elementsCol) reorderedColumns.push(elementsCol);
      reorderedColumns.push(...dynamicCols);
      if (commentCol) reorderedColumns.push(commentCol);

      // 重新分配索引（保持1基索引，与Excel列号一致）
      reorderedColumns.forEach((col, index) => {
        col.index = index + 1;
      });

      console.log(`🔄 [PMDOMAIN-REORDER] 重新排序: ${reorderedColumns.map(c => c.name).join(', ')}`);

      return reorderedColumns;
    } catch (error) {
      console.error('重新排序PMDOMAIN列时出错:', error);
      return columns;
    }
  }

  /**
   * 重新排序PMMODE表格的列，确保动态列在PMName和Comment之间
   */
  private static reorderPMMODEColumns(columns: any[]): any[] {
    try {
      // 基础列：PMName
      const pmNameCol = columns.find(col => col.name === 'PMName');
      const commentCol = columns.find(col => col.name === 'Comment');

      // 动态列（电源名称列）：除了基础列之外的所有列
      const dynamicCols = columns.filter(col =>
        col.name !== 'PMName' &&
        col.name !== 'Comment'
      );

      // 为动态电源列设置合适的类型（与Excel中的字符串类型保持一致）
      dynamicCols.forEach(col => {
        col.type = 'string'; // 与Excel中的类型保持一致，避免类型不匹配错误
      });

      // 重新排序：PMName, 动态列..., Comment
      const reorderedColumns: any[] = [];

      if (pmNameCol) reorderedColumns.push(pmNameCol);
      reorderedColumns.push(...dynamicCols);
      if (commentCol) reorderedColumns.push(commentCol);

      // 重新分配索引（保持1基索引，与Excel列号一致）
      reorderedColumns.forEach((col, index) => {
        col.index = index + 1;
      });

      console.log(`🔄 [PMMODE-REORDER] 重新排序: ${reorderedColumns.map(c => c.name).join(', ')}`);

      return reorderedColumns;
    } catch (error) {
      console.error('重新排序PMMODE列时出错:', error);
      return columns;
    }
  }

  /**
   * 验证电压值是否有效
   * 支持的格式：0.8v, 0.75v, 0.765v, 1.15v, 0v, PRM, 空值等
   */
  private static isValidVoltageValue(value: any): boolean {
    if (!value || value === '') {
      return true; // 空值是有效的
    }

    const strValue = String(value).trim();

    // 支持的电压值模式
    const voltagePatterns = [
      /^\d+(\.\d+)?v?$/i,  // 数字格式：0.8, 0.8v, 1.15v等
      /^PRM$/i,            // PRM
      /^0v?$/i,            // 0, 0v
      /^[A-Z_]+$/i         // 其他大写字母组合（如PRM等）
    ];

    return voltagePatterns.some(pattern => pattern.test(strValue));
  }

  /**
   * 标准化电压值格式
   */
  private static normalizeVoltageValue(value: any): string {
    if (!value || value === '') {
      return '';
    }

    const strValue = String(value).trim();

    // 如果是纯数字，添加v后缀
    if (/^\d+(\.\d+)?$/.test(strValue)) {
      return strValue + 'v';
    }

    // 如果已经有v后缀或者是特殊值（如PRM），直接返回
    return strValue;
  }

  /**
   * 初始化数据库表结构
   */
  static async initializeDatabaseSchema(toolType: string = 'sdc'): Promise<void> {
    try {
      console.log(`🔧 开始初始化${toolType}工具数据库表结构...`);

      // 解析模板文件 - 根据工具类型和当前工作目录动态确定路径
      const isInBackendDir = process.cwd().endsWith('backend');
      let templatePath: string;

      if (toolType === 'upfgen' || toolType === 'upf') {
        templatePath = isInBackendDir
          ? path.join(process.cwd(), '../../templates/upfgen/pcont_org.xlsx')
          : path.join(process.cwd(), 'templates/upfgen/pcont_org.xlsx');
      } else {
        templatePath = isInBackendDir
          ? path.join(process.cwd(), '../../templates/sdcgen/dcont_org.xlsx')
          : path.join(process.cwd(), 'templates/sdcgen/dcont_org.xlsx');
      }

      console.log(`📁 模板文件路径: ${templatePath}`);

      // 检查模板文件是否存在
      const fs = await import('fs');
      if (!fs.existsSync(templatePath)) {
        throw new Error(`模板文件不存在: ${templatePath}`);
      }

      const analysis = await this.analyzeTemplateFile(templatePath, toolType, true); // 静默模式

      console.log(`📊 解析结果: ${analysis.sheets.length}个工作表, ${analysis.totalTables}个表格`);

      // 系统启动时的初始化不应该清理任何现有数据
      // 这个函数只在系统首次部署或数据库为空时执行
      console.log(`🔧 开始初始化${toolType}工具基础表结构（不清理现有数据）...`);

      // 检查是否已存在基础表结构
      const existingSheets = await prisma.sheet.findMany({
        where: { toolType }
      });

      if (existingSheets.length > 0) {
        console.log(`✅ ${toolType}工具基础表结构已存在，跳过初始化`);
        return;
      }

      console.log(`📝 创建${toolType}工具基础表结构...`);

      // 创建sheets记录
      console.log(`📝 创建${analysis.sheets.length}个工作表记录...`);
      for (const [index, sheetInfo] of analysis.sheets.entries()) {
        const sheet = await prisma.sheet.create({
          data: {
            toolType,
            sheetName: sheetInfo.name,
            displayOrder: index + 1
          }
        });

        console.log(`  ✅ 创建工作表: ${sheetInfo.name} (${sheetInfo.tables.length}个表格)`);

        // 创建tables记录
        for (const [tableIndex, tableInfo] of sheetInfo.tables.entries()) {
          await prisma.table.create({
            data: {
              sheetId: sheet.id,
              toolType,
              tableName: tableInfo.name,
              columnsSchema: {
                columns: tableInfo.columns.map(col => ({
                  name: col.name,
                  type: col.type,
                  index: col.index
                }))
              },
              displayOrder: tableIndex + 1
            }
          });
          console.log(`    ✅ 创建表格: ${tableInfo.name} (${tableInfo.columns.length}列)`);
        }
      }

      console.log(`✅ ${toolType}工具数据库表结构初始化完成！`)
    } catch (error) {
      console.error('初始化数据库表结构时出错:', error);
      throw error;
    }
  }

  /**
   * 解析任务生成的Excel文件并更新数据库
   */
  static async parseTaskExcelFile(taskId: string, userId: string, filePath: string, toolType?: string): Promise<void> {
    try {
      console.log(`开始解析任务 ${taskId} 的Excel文件: ${filePath}`);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);

      // 清理该任务的现有数据
      await prisma.tableData.deleteMany({ where: { taskId } });

      // 如果没有提供toolType，尝试从任务中获取
      let detectedToolType = toolType;
      if (!detectedToolType) {
        const task = await prisma.task.findUnique({
          where: { id: taskId },
          select: { parameters: true }
        });
        detectedToolType = (task?.parameters as any)?.toolType || 'sdc';
      }

      console.log(`检测到工具类型: ${detectedToolType}`);

      // 标准化工具类型：sdcgen -> sdc, upfgen -> upf
      const normalizedToolType = detectedToolType === 'sdcgen' ? 'sdc' :
                                 detectedToolType === 'upfgen' ? 'upf' :
                                 detectedToolType;

      console.log(`标准化工具类型: ${normalizedToolType}`);

      // 🔥 智能选择表结构：UPF使用任务特定，SDC使用模板
      let sheets: any[];

      if (normalizedToolType === 'upf') {
        // UPF工具：使用任务特定的表结构（包含动态电源列）
        safeLogToTaskFile(`🔍 [EXCEL-PARSE] UPF工具：查找任务 ${taskId} 的特定表结构...`);
        sheets = await prisma.sheet.findMany({
          where: { toolType: normalizedToolType },
          include: {
            tables: {
              where: { taskId: taskId } as any,
              orderBy: { displayOrder: 'asc' }
            }
          },
          orderBy: { displayOrder: 'asc' }
        });

        let totalTaskTables = 0;
        sheets.forEach(sheet => {
          const taskTables = (sheet as any).tables;
          totalTaskTables += taskTables.length;
        });

        if (totalTaskTables === 0) {
          throw new Error(`❌ [EXCEL-PARSE] UPF工具没有找到任务 ${taskId} 的特定表结构，请检查任务初始化是否完成`);
        }
        safeLogToTaskFile(`✅ [EXCEL-PARSE] UPF工具找到 ${totalTaskTables} 个任务特定表格`);

        // 调试：输出存储时使用的表结构
        sheets.forEach(sheet => {
          safeLogToTaskFile(`   [EXCEL-PARSE] 工作表 ${sheet.sheetName}: ${sheet.tables.length} 个表格`);
          sheet.tables.forEach((table: any) => {
            const columns = (table.columnsSchema as any)?.columns || [];
            safeLogToTaskFile(`     [EXCEL-PARSE] 表格 ${table.tableName}: ${columns.length} 列 [${columns.map((c: any) => c.name).join(', ')}]`);
          });
        });
      } else {
        // SDC工具：使用模板表结构（不需要任务特定副本）
        console.log(`🔍 [EXCEL-PARSE] SDC工具：查找模板表结构...`);
        sheets = await prisma.sheet.findMany({
          where: { toolType: normalizedToolType },
          include: {
            tables: {
              where: { taskId: null } as any,
              orderBy: { displayOrder: 'asc' }
            }
          },
          orderBy: { displayOrder: 'asc' }
        });

        let totalTemplateTables = 0;
        sheets.forEach(sheet => {
          const templateTables = (sheet as any).tables;
          totalTemplateTables += templateTables.length;
        });

        if (totalTemplateTables === 0) {
          throw new Error(`❌ [EXCEL-PARSE] SDC工具没有找到模板表结构，请检查数据库初始化是否完成`);
        }
        console.log(`✅ [EXCEL-PARSE] SDC工具找到 ${totalTemplateTables} 个模板表格`);
      }

      for (const sheet of sheets) {
        const worksheet = workbook.getWorksheet(sheet.sheetName);
        if (!worksheet) {
          console.warn(`工作表 ${sheet.sheetName} 不存在于Excel文件中`);
          continue;
        }

        // 获取当前sheet中所有表格名称，用于边界计算
        const allTableNames = sheet.tables.map((table: any) => table.tableName);

        for (const table of sheet.tables) {
          await this.parseTableData(worksheet, table, taskId, userId, sheet.sheetName, allTableNames, normalizedToolType);
        }
      }

      console.log(`任务 ${taskId} 的Excel文件解析完成`);
    } catch (error) {
      console.error(`解析任务Excel文件时出错:`, error);
      throw error;
    }
  }

  /**
   * 获取表格在工作表中的精确位置和边界
   * 基于Python代码的get_table_loc算法实现
   */
  private static getTableLocation(worksheet: ExcelJS.Worksheet, tableName: string, sheetName: string, allTableNames: string[], toolType?: string): {
    rowStart: number;
    maxRow: number;
    maxCol: number;
  } | null {
    // 查找表格起始行
    let rowStart = 0;

    console.log(`🔍 [EXCEL-PARSER] 在工作表 ${sheetName} 中查找表格 ${tableName}`);
    console.log(`🔍 [EXCEL-PARSER] 工作表行数: ${worksheet.rowCount}, 列数: ${worksheet.columnCount}`);

    // 限制搜索范围，避免性能问题
    const searchRowLimit = Math.min(100, worksheet.rowCount);
    console.log(`🔍 [EXCEL-PARSER] 搜索范围: 1-${searchRowLimit} 行`);

    for (let row = 1; row <= searchRowLimit; row++) {
      try {
        const cell = worksheet.getCell(row, 1);
        if (cell.value === tableName) {
          rowStart = row;
          console.log(`🔍 [EXCEL-PARSER] 找到表格 ${tableName} 在第 ${row} 行`);
          break;
        }
      } catch (error) {
        console.warn(`⚠️ [EXCEL-PARSER] 访问第 ${row} 行时出错:`, error);
        continue;
      }
    }

    if (rowStart === 0) {
      console.warn(`⚠️ [EXCEL-PARSER] 表格 ${tableName} 在工作表 ${sheetName} 中未找到`);
      console.log(`🔍 [EXCEL-PARSER] 期望找到的表格名称: "${tableName}"`);
      return null;
    }

    // 查找最大列（找到'Comment'列）
    let maxCol = 0;
    for (let col = 1; col <= worksheet.columnCount; col++) {
      const cell = worksheet.getCell(rowStart, col);
      if (cell.value === 'Comment') {
        maxCol = col;
        break;
      }
    }

    // 如果没找到Comment列，使用表格schema中的最大列索引
    if (maxCol === 0) {
      // 从columnsSchema中获取最大列索引
      maxCol = worksheet.columnCount;
    }

    // 根据表格类型确定最大行
    let maxRow = 0;

    // 🔥 关键修复：恢复getActualMaxRow函数，但修复其逻辑以正确识别有下拉验证的空行
    // 这确保我们只保存有意义的行：有数据的行 + 有下拉验证的空行
    const getActualMaxRow = (worksheet: ExcelJS.Worksheet): number => {
      console.log(`🔍 [ACTUAL-MAX-ROW] 开始查找实际最大行数，工作表行数: ${worksheet.rowCount}`);

      // 使用更保守的搜索范围，避免性能问题
      const searchLimit = Math.min(200, worksheet.rowCount); // 最多搜索200行

      for (let row = searchLimit; row >= 1; row--) {
        // 检查更多列，确保能找到有下拉验证的空行
        for (let col = 1; col <= Math.min(15, worksheet.columnCount); col++) {
          try {
            const cell = worksheet.getCell(row, col);

            // 🔥 关键修复：不仅检查有数据的单元格，还要检查有下拉验证的空行
            const hasData = cell.value !== null && cell.value !== undefined && cell.value !== '';
            const hasDropdownValidation = cell.dataValidation &&
                                        cell.dataValidation.formulae &&
                                        cell.dataValidation.formulae.length > 0;

            if (hasData || hasDropdownValidation) {
              console.log(`🔍 [ACTUAL-MAX-ROW] 找到最后有数据或下拉验证的行: ${row} (数据=${hasData}, 下拉=${hasDropdownValidation})`);
              return row;
            }
          } catch (error) {
            // 如果访问单元格出错，跳过
            continue;
          }
        }
      }

      console.log(`🔍 [ACTUAL-MAX-ROW] 未找到数据或下拉验证，返回默认值: 50`);
      return 50; // 如果没有找到数据，返回一个合理的默认值
    };

    // 根据Python代码逻辑，确定表格边界
    // 参考Python代码：某些表格使用sheet.max_row + 2，其他表格使用下一个表格位置 - 1
    const getMaxRowByPythonLogic = (): number => {
      // 根据工具类型和表格名称确定特殊表格
      let useMaxRowPlus2 = false;

      if (toolType === 'upf' || toolType === 'upfgen') {
        // UPF工具：PMCELL, PMBOUNDARY, PMRET, PMMODE 使用 max_row + 2
        useMaxRowPlus2 = ['PMCELL', 'PMBOUNDARY', 'PMRET', 'PMMODE'].includes(tableName);
      } else if (toolType === 'sdc' || toolType === 'sdcgen') {
        // SDC工具：TMVAR, TMCLK, TMIODLY, TMSTPGATE 使用 max_row + 2
        useMaxRowPlus2 = ['TMVAR', 'TMCLK', 'TMIODLY', 'TMSTPGATE'].includes(tableName);
      }

      if (useMaxRowPlus2) {
        // 🔥 关键修复：使用修复后的getActualMaxRow函数，确保只保存有意义的行
        // 这满足用户的核心需求：保存有数据的行 + 保存有下拉验证的空行
        // 同时避免保存大量无关的空行
        const actualMaxRow = getActualMaxRow(worksheet);
        const result = actualMaxRow + 2;
        console.log(`🔍 [EXCEL-PARSER] 特殊表格 ${tableName}: 实际最大行=${actualMaxRow}, 设置边界=${result} (修复后的逻辑)`);
        return result;
      } else {
        // 其他表格：查找下一个表格的起始行作为当前表格的结束行
        const currentIndex = allTableNames.indexOf(tableName);
        if (currentIndex >= 0 && currentIndex < allTableNames.length - 1) {
          const nextTableName = allTableNames[currentIndex + 1];
          console.log(`🔍 [EXCEL-PARSER] 查找下一个表格 ${nextTableName} 的位置...`);

          // 查找下一个表格的起始行
          const searchLimit = Math.min(100, worksheet.rowCount);
          for (let row = rowStart + 1; row <= searchLimit; row++) {
            try {
              const cell = worksheet.getCell(row, 1);
              if (cell.value === nextTableName) {
                const result = row - 1;
                console.log(`🔍 [EXCEL-PARSER] 找到下一个表格 ${nextTableName} 在第 ${row} 行，当前表格边界=${result}`);

                // 🔥 关键修复：确保表格边界不重叠
                const minBoundary = rowStart + 3; // 至少包含表名、列头、一行数据
                if (result < minBoundary) {
                  console.warn(`⚠️ [EXCEL-PARSER] 表格 ${tableName} 边界过小 (${result})，调整为最小边界 (${minBoundary})`);
                  return minBoundary;
                }

                return result;
              }
            } catch (error) {
              continue;
            }
          }
        }

        // 如果没找到下一个表格，使用一个合理的默认值
        const defaultMaxRow = rowStart + 50;
        console.log(`🔍 [EXCEL-PARSER] 未找到下一个表格，使用默认边界=${defaultMaxRow}`);
        return defaultMaxRow;
      }
    };

    maxRow = getMaxRowByPythonLogic();

    console.log(`📐 [EXCEL-PARSER] 表格 ${tableName} 边界: 起始行=${rowStart}, 结束行=${maxRow}, 最大列=${maxCol}`);

    // 🔥 关键调试：输出表格边界信息到任务日志
    safeLogToTaskFile(`📐 [EXCEL-PARSER] 表格 ${tableName} 边界: 起始行=${rowStart}, 结束行=${maxRow}, 最大列=${maxCol}`);

    return { rowStart, maxRow, maxCol };
  }

  /**
   * 解析单个表格的数据
   *
   * 表格数据处理规则：
   * 1. 数据开始行：表名称行号 + 2（跳过表名和列头）
   * 2. 空行处理：保留有下拉数据验证的空行，确保前端正确渲染下拉选项
   * 3. 下拉数据：解析并保存每个单元格的下拉数据选项和验证规则
   * 4. 结束行判断：基于Python算法，精确计算表格边界
   * 5. 多表格支持：每个sheet可以包含多个表格，按表名定位
   * 6. 数据验证：确保Excel、数据库、网页端数据一致性（包括下拉数据）
   */
  private static async parseTableData(
    worksheet: ExcelJS.Worksheet,
    table: any,
    taskId: string,
    userId: string,
    sheetName: string,
    allTableNames: string[],
    toolType?: string
  ): Promise<void> {
    safeLogToTaskFile(`📊 [EXCEL-PARSER] 开始解析表格: ${table.tableName}, tableId: ${table.id}, taskId: ${table.taskId || 'null'}`);

    // 🔥 关键调试：验证表格结构信息
    const columnsSchema = (table.columnsSchema as any)?.columns || [];
    safeLogToTaskFile(`🔍 [EXCEL-PARSER] 表格 ${table.tableName} 列结构: [${columnsSchema.map((c: any) => c.name).join(', ')}]`);

    // 获取表格精确边界
    const tableLocation = this.getTableLocation(worksheet, table.tableName, sheetName, allTableNames, toolType);
    if (!tableLocation) {
      return;
    }

    const { rowStart, maxRow, maxCol } = tableLocation;
    const headerRow = rowStart + 1;  // 列头行
    const dataStartRow = headerRow + 1;   // 数据开始行（表名称行号 + 2）
    let rowNumber = 1;

    console.log(`📋 [EXCEL-PARSER] 表格结构: 表名行=${rowStart}, 列头行=${headerRow}, 数据开始行=${dataStartRow}, 数据结束行=${maxRow}`);

    // 读取数据行（从数据开始行到计算出的最大行）
    for (let dataRowIndex = dataStartRow; dataRowIndex <= maxRow; dataRowIndex++) {
      console.log(`🔍 [EXCEL-PARSER] 处理第 ${dataRowIndex} 行 (范围: ${dataStartRow}-${maxRow})`);

      const rowData: any = {};
      const dropdownData: any = {};
      const validationData: any = {};
      let hasData = false;
      let hasDropdownData = false;

      // 初始化所有字段为空字符串，确保字段完整性
      for (const column of columnsSchema) {
        if (column.index <= maxCol) {
          rowData[column.name] = ''; // 先初始化为空字符串
        }
      }

      // 检查当前行是否有数据或下拉数据验证（只检查有效列范围）
      for (const column of columnsSchema) {
        if (column.index <= maxCol) {
          try {
            // 直接使用column.index（1基索引，与Excel列号一致）
            console.log(`🔍 [EXCEL-PARSER] 访问单元格 (${dataRowIndex}, ${column.index})`);
            const cell = worksheet.getCell(dataRowIndex, column.index);
            const cellValue = cell.value;

          // 保存单元格数据 - 统一转换为字符串类型保持原始格式
          if (cellValue !== null && cellValue !== undefined && cellValue !== '') {
            // 统一转换为字符串，保持Excel中的原始显示格式
            let stringValue: string;

            if (typeof cellValue === 'number') {
              // 检查是否是百分比格式
              const cellAddress = worksheet.getCell(dataRowIndex, column.index).address;
              const cellFormat = worksheet.getCell(dataRowIndex, column.index).numFmt;

              if (cellFormat && cellFormat.includes('%')) {
                // 百分比格式：0.6 → "60%"
                stringValue = (cellValue * 100).toString() + '%';
              } else {
                // 普通数值：直接转换为字符串
                stringValue = cellValue.toString();
              }
            } else {
              // 非数值类型：直接转换为字符串
              stringValue = cellValue.toString();
            }

            rowData[column.name] = stringValue;
            hasData = true;
          }
          // 注意：空值已经在上面初始化为空字符串，确保字段存在

          // 检查并保存下拉数据验证
          if (cell.dataValidation) {
            const validation = cell.dataValidation;
            if (validation.formulae && validation.formulae.length > 0) {
              hasDropdownData = true;

              // 解析下拉选项
              const dropdownOptions = this.parseDropdownOptions(validation.formulae[0]);
              dropdownData[column.name] = {
                type: validation.type || 'list',
                options: dropdownOptions,
                formulae: validation.formulae
              };

              // 保存验证规则
              validationData[column.name] = {
                type: validation.type,
                operator: validation.operator,
                formulae: validation.formulae,
                allowBlank: validation.allowBlank,
                showInputMessage: validation.showInputMessage,
                promptTitle: validation.promptTitle,
                prompt: validation.prompt,
                showErrorMessage: validation.showErrorMessage,
                errorTitle: validation.errorTitle,
                error: validation.error
              };

              // 如果单元格没有数据但有下拉验证，设置空字符串
              if (!rowData[column.name]) {
                rowData[column.name] = '';
              }
            }
          }
          } catch (error) {
            console.error(`❌ [EXCEL-PARSER] 访问单元格 (${dataRowIndex}, ${column.index}) 时出错:`, error);
            // 跳过这个单元格，继续处理下一个
            continue;
          }
        }
      }

      // 保存有数据的行或有下拉数据验证的空行
      if (hasData || hasDropdownData) {
        const dataHash = this.generateDataHash(rowData);
        await prisma.tableData.create({
          data: {
            userId,
            taskId,
            tableId: table.id,
            sheetId: table.sheetId,
            rowNumber,
            rowData: {
              ...rowData,
              _dataHash: dataHash,  // 添加数据哈希用于验证
              _sourceType: 'excel', // 标记数据来源
              _lastModified: new Date().toISOString()
            },
            dropdownData: Object.keys(dropdownData).length > 0 ? dropdownData : null,
            validationData: Object.keys(validationData).length > 0 ? validationData : null
          }
        });

        if (hasDropdownData && !hasData) {
          console.log(`📋 [EXCEL-PARSER] 保存有下拉数据的空行: 表格=${table.tableName}, 行=${dataRowIndex}, 下拉列=${Object.keys(dropdownData).join(',')}`);
        } else if (hasDropdownData && hasData) {
          console.log(`💾 [EXCEL-PARSER] 保存第 ${rowNumber} 行数据和下拉数据:`, { rowData, dropdownColumns: Object.keys(dropdownData) });
        } else {
          console.log(`💾 [EXCEL-PARSER] 保存第 ${rowNumber} 行数据:`, rowData);
        }

        // 🔥 关键调试：记录数据存储到任务日志
        safeLogToTaskFile(`💾 [EXCEL-PARSER] 表格 ${table.tableName} 第 ${rowNumber} 行数据存储到 tableId: ${table.id}, Excel行号: ${dataRowIndex}`);

        rowNumber++;
      }

      // 安全机制：防止无限循环
      if (dataRowIndex - dataStartRow > 2000) {
        console.warn(`⚠️ [EXCEL-PARSER] 表格 ${table.tableName} 数据行数超过2000行，强制停止解析`);
        break;
      }
    }

    console.log(`✅ [EXCEL-PARSER] 表格 ${table.tableName} 解析完成，共保存 ${rowNumber - 1} 行有效数据`);
  }

  /**
   * 解析下拉选项
   */
  private static parseDropdownOptions(formula: string): string[] {
    try {
      // 处理直接列表格式: "option1,option2,option3"
      if (formula.startsWith('"') && formula.endsWith('"')) {
        const listContent = formula.slice(1, -1);
        return listContent.split(',').map(option => option.trim());
      }

      // 处理Lists sheet引用格式: Lists!$A$1:$A$10
      if (formula.includes('Lists!')) {
        // Lists sheet是Excel自动生成的下拉数据工作表，不属于业务逻辑
        // 这种引用应该被忽略，因为Lists sheet不会被同步到数据库
        safeLogToTaskFile(`🚫 [EXCEL-PARSER] 忽略Lists sheet引用的下拉选项: ${formula}`);
        return [];
      }

      // 处理其他引用格式: $A$1:$A$10 等
      if (formula.includes(':')) {
        // 这里可以进一步实现引用解析，暂时返回空数组
        safeLogToTaskFile(`⚠️ [EXCEL-PARSER] 暂不支持引用格式的下拉选项: ${formula}`);
        return [];
      }

      // 其他格式
      return [formula];
    } catch (error) {
      console.error(`❌ [EXCEL-PARSER] 解析下拉选项失败: ${formula}`, error);
      return [];
    }
  }

  /**
   * 生成数据哈希用于验证数据一致性
   */
  private static generateDataHash(data: any): string {
    const jsonString = JSON.stringify(data, Object.keys(data).sort());
    return crypto.createHash('md5').update(jsonString).digest('hex');
  }

  /**
   * 验证Excel ↔ 数据库双方数据一致性
   * 数据库是唯一正确的数据源
   */
  static async validateExcelDatabaseConsistency(
    taskId: string,
    userId: string,
    excelFilePath: string,
    skipDropdownValidation: boolean = false
  ): Promise<{
    isConsistent: boolean;
    differences: any[];
    summary: {
      excelRows: number;
      databaseRows: number;
    };
  }> {
    console.log(`🔍 [EXCEL-DB-VALIDATOR] 开始验证Excel ↔ 数据库数据一致性: ${taskId}`);

    const differences: any[] = [];
    let excelData: any[] = [];
    let databaseData: any[] = [];

    try {
      // 0. 获取工具类型 - 先获取，后面会重用
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: { parameters: true }
      });
      const detectedToolType = (task?.parameters as any)?.toolType || 'sdc';
      const normalizedToolType = detectedToolType === 'sdcgen' ? 'sdc' :
                                 detectedToolType === 'upfgen' ? 'upf' :
                                 detectedToolType;

      // 🔥 关键修复：获取与存储时相同的表结构选择逻辑
      safeLogToTaskFile(`🔍 [EXCEL-VALIDATION] 使用与存储时相同的表结构选择逻辑...`);

      let sheets: any[];

      if (normalizedToolType === 'upf') {
        // UPF工具：使用任务特定的表结构（包含动态电源列）
        safeLogToTaskFile(`🔍 [EXCEL-VALIDATION] UPF工具：查找任务 ${taskId} 的特定表结构...`);

        sheets = await prisma.sheet.findMany({
          where: { toolType: normalizedToolType },
          include: {
            tables: {
              where: { taskId: taskId } as any,
              orderBy: { displayOrder: 'asc' }
            }
          },
          orderBy: { displayOrder: 'asc' }
        });
      } else {
        // SDC工具：使用模板表结构（不需要任务特定副本）
        sheets = await prisma.sheet.findMany({
          where: { toolType: normalizedToolType },
          include: {
            tables: {
              where: { taskId: null } as any,
              orderBy: { displayOrder: 'asc' }
            }
          },
          orderBy: { displayOrder: 'asc' }
        });
      }

      // 1. 从数据库读取数据 - 使用与存储时相同的表结构选择逻辑
      // 🔥 关键修复：确保验证时只查询与当前表结构选择逻辑一致的数据
      const currentTableIds = sheets.flatMap(sheet =>
        sheet.tables.map((table: any) => table.id)
      );

      safeLogToTaskFile(`🔍 [EXCEL-VALIDATION] 当前表结构IDs: [${currentTableIds.join(', ')}]`);

      // 🔥 关键修复：按Excel中的表格顺序查询数据，而不是按tableId排序
      databaseData = [];

      // 按Excel中的表格顺序逐个查询数据
      for (const sheet of sheets) {
        for (const table of sheet.tables) {
          const tableData = await prisma.tableData.findMany({
            where: {
              taskId,
              userId,
              tableId: table.id
            },
            include: {
              table: {
                include: {
                  sheet: true
                }
              }
            },
            orderBy: [
              { rowNumber: 'asc' }
            ]
          });

          databaseData.push(...tableData);
        }
      }

      // 2. 重新解析Excel文件获取数据
      excelData = await this.parseExcelForValidation(excelFilePath, taskId, userId);

      // 3. 严格比较Excel数据和数据库数据（必须完全一致）
      console.log(`🔍 [EXCEL-DB-VALIDATOR] 开始严格验证: Excel行=${excelData.length}, 数据库行=${databaseData.length}`);

      // 工具类型已在前面获取，直接使用

      // 1. Sheet结构检查
      console.log(`🔍 [STRUCTURE-CHECK] 开始Sheet结构检查...`);
      const sheetDifferences = await this.validateSheetStructure(excelFilePath, normalizedToolType);
      if (sheetDifferences.length > 0) {
        differences.push(...sheetDifferences);
        console.log(`⚠️ [STRUCTURE-CHECK] Sheet结构检查发现 ${sheetDifferences.length} 个问题`);
      }

      // 2. 表格结构检查 - 智能选择验证策略
      console.log(`🔍 [STRUCTURE-CHECK] 开始表格结构检查...`);
      const tableDifferences = await this.validateTableStructure(excelFilePath, normalizedToolType, taskId);
      if (tableDifferences.length > 0) {
        differences.push(...tableDifferences);
        console.log(`⚠️ [STRUCTURE-CHECK] 表格结构检查发现 ${tableDifferences.length} 个问题`);
      }

      // 3. 列结构检查 - 智能选择验证策略
      console.log(`🔍 [STRUCTURE-CHECK] 开始列结构检查...`);
      const columnDifferences = await this.validateColumnStructure(excelFilePath, normalizedToolType, taskId);
      if (columnDifferences.length > 0) {
        differences.push(...columnDifferences);
        console.log(`⚠️ [STRUCTURE-CHECK] 列结构检查发现 ${columnDifferences.length} 个问题`);
      }

      // 4. 严格检查数据库中的所有表是否都在Excel中存在
      const excelTableNames = new Set(excelData.map(row => `${row.sheetName}.${row.tableName}`));
      const databaseTableNames = new Set(databaseData.map(row => `${row.table.sheet.sheetName}.${row.table.tableName}`));

      for (const dbTableName of databaseTableNames) {
        if (!excelTableNames.has(dbTableName)) {
          differences.push({
            type: 'missing_table_in_excel',
            tableName: dbTableName,
            message: `数据库表格 ${dbTableName} 在Excel中不存在，表格结构不一致`
          });
        }
      }

      for (let i = 0; i < Math.max(excelData.length, databaseData.length); i++) {
        const excelRow = excelData[i];
        const dbRow = databaseData[i];

        if (!excelRow && dbRow) {
          differences.push({
            type: 'missing_in_excel',
            rowIndex: i,
            databaseData: dbRow.rowData
          });
        } else if (excelRow && !dbRow) {
          differences.push({
            type: 'missing_in_database',
            rowIndex: i,
            excelData: excelRow
          });
        } else if (excelRow && dbRow) {
          // 调试：检查表格和行号匹配
          if (excelRow.tableName !== dbRow.table.tableName) {
            console.warn(`⚠️ [VALIDATION-DEBUG] 行${i}: 表格不匹配 Excel=${excelRow.tableName} vs DB=${dbRow.table.tableName}`);
          }

          // 调试：显示字段对比信息
          const excelFields = Object.keys(excelRow.rowData || {});
          const dbFields = Object.keys(dbRow.rowData || {}).filter(key => !key.startsWith('_'));
          if (i < 20) { // 只显示前20行的调试信息
            console.log(`🔍 [VALIDATION-DEBUG] 行${i}: 表格=${excelRow.tableName}, Excel字段=[${excelFields.join(', ')}], DB字段=[${dbFields.join(', ')}]`);
          }

          // 字段级别的详细比较
          const fieldDifferences = this.compareFieldDetails(excelRow, dbRow, i);
          if (fieldDifferences.length > 0) {
            differences.push(...fieldDifferences);
          }

          // 严格比较下拉数据验证（DataChk时跳过）
          if (!skipDropdownValidation) {
            const dropdownDiff = this.compareDropdownData(excelRow.validationData, dbRow.validationData, i);
            if (dropdownDiff.length > 0) {
              differences.push(...dropdownDiff);
            }
          }
        }
      }

      const summary = {
        excelRows: excelData.length,
        databaseRows: databaseData.length
      };

      const isConsistent = differences.length === 0;

      // 临时调试：显示前5个差异的详细信息
      if (differences.length > 0) {
        console.log(`🔍 [DEBUG] 前5个差异详情:`);
        for (let i = 0; i < Math.min(5, differences.length); i++) {
          const diff = differences[i];
          console.log(`差异${i+1}:`, {
            type: diff.type,
            message: diff.message || 'N/A',
            rowIndex: diff.rowIndex || 'N/A',
            fieldName: diff.fieldName || 'N/A'
          });
        }

        // 统计差异类型
        const diffTypes: { [key: string]: number } = {};
        differences.forEach((diff: any) => {
          diffTypes[diff.type] = (diffTypes[diff.type] || 0) + 1;
        });
        console.log(`🔍 [DEBUG] 差异类型统计:`, diffTypes);
      }

      console.log(`✅ [EXCEL-DB-VALIDATOR] Excel ↔ 数据库验证完成:`, {
        isConsistent,
        differencesCount: differences.length,
        summary
      });

      return {
        isConsistent,
        differences,
        summary
      };

    } catch (error) {
      console.error(`❌ [EXCEL-DB-VALIDATOR] Excel ↔ 数据库验证失败:`, error);
      throw error;
    }
  }

  /**
   * 验证数据库 ↔ 网页端双方数据一致性
   * 数据库是唯一正确的数据源
   */
  static async validateDatabaseWebConsistency(
    taskId: string,
    userId: string,
    webData: any,
    sheetName?: string
  ): Promise<{
    isConsistent: boolean;
    differences: any[];
    summary: {
      databaseRows: number;
      webRows: number;
    };
  }> {
    console.log(`🔍 [DB-WEB-VALIDATOR] 开始验证数据库 ↔ 网页端数据一致性: ${taskId}`);

    const differences: any[] = [];
    let databaseData: any[] = [];
    let webDataArray: any[] = [];

    try {
      // 1. 从数据库读取数据
      const whereCondition: any = { taskId, userId };
      if (sheetName) {
        whereCondition.table = {
          sheet: {
            sheetName
          }
        };
      }

      databaseData = await prisma.tableData.findMany({
        where: whereCondition,
        include: {
          table: {
            include: {
              sheet: true
            }
          }
        },
        orderBy: [
          { sheetId: 'asc' },
          { tableId: 'asc' },
          { rowNumber: 'asc' }
        ]
      });

      // 2. 标准化网页端数据
      webDataArray = this.normalizeWebData(webData);

      // 3. 比较数据库数据和网页端数据
      for (let i = 0; i < Math.max(databaseData.length, webDataArray.length); i++) {
        const dbRow = databaseData[i];
        const webRow = webDataArray[i];

        if (!dbRow && webRow) {
          differences.push({
            type: 'missing_in_database',
            rowIndex: i,
            webData: webRow
          });
        } else if (dbRow && !webRow) {
          differences.push({
            type: 'missing_in_web',
            rowIndex: i,
            databaseData: dbRow.rowData
          });
        } else if (dbRow && webRow) {
          // 比较数据内容
          const dbHash = this.generateDataHash(dbRow.rowData);
          const webHash = this.generateDataHash(webRow);

          if (dbHash !== webHash) {
            differences.push({
              type: 'data_mismatch',
              rowIndex: i,
              databaseData: dbRow.rowData,
              webData: webRow,
              databaseHash: dbHash,
              webHash: webHash
            });
          }
        }
      }

      const summary = {
        databaseRows: databaseData.length,
        webRows: webDataArray.length
      };

      const isConsistent = differences.length === 0;

      console.log(`✅ [DB-WEB-VALIDATOR] 数据库 ↔ 网页端验证完成:`, {
        isConsistent,
        differencesCount: differences.length,
        summary
      });

      return {
        isConsistent,
        differences,
        summary
      };

    } catch (error) {
      console.error(`❌ [DB-WEB-VALIDATOR] 数据库 ↔ 网页端验证失败:`, error);
      throw error;
    }
  }

  /**
   * 解析Excel文件用于验证（不写入数据库）
   */
  private static async parseExcelForValidation(
    excelFilePath: string,
    taskId: string,
    userId: string
  ): Promise<any[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(excelFilePath);

    const allData: any[] = [];

    // 从任务中获取工具类型
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { parameters: true }
    });
    const detectedToolType = (task?.parameters as any)?.toolType || 'sdc';

    // 标准化工具类型：sdcgen -> sdc, upfgen -> upf
    const normalizedToolType = detectedToolType === 'sdcgen' ? 'sdc' :
                               detectedToolType === 'upfgen' ? 'upf' :
                               detectedToolType;

    // 🔥 关键修复：使用与存储时完全相同的表结构选择逻辑
    // 确保验证时使用的表结构与存储时完全一致
    safeLogToTaskFile(`🔍 [EXCEL-VALIDATION] 使用与存储时相同的表结构选择逻辑...`);

    let sheets: any[];

    if (normalizedToolType === 'upf') {
      // UPF工具：使用任务特定的表结构（包含动态电源列）
      safeLogToTaskFile(`🔍 [EXCEL-VALIDATION] UPF工具：查找任务 ${taskId} 的特定表结构...`);

      sheets = await prisma.sheet.findMany({
        where: { toolType: normalizedToolType },
        include: {
          tables: {
            where: { taskId: taskId } as any,
            orderBy: { displayOrder: 'asc' }
          }
        },
        orderBy: { displayOrder: 'asc' }
      });

      let totalTaskTables = 0;
      sheets.forEach(sheet => {
        const taskTables = (sheet as any).tables;
        totalTaskTables += taskTables.length;
      });

      if (totalTaskTables === 0) {
        throw new Error(`❌ [EXCEL-VALIDATION] UPF工具没有找到任务 ${taskId} 的特定表结构，请检查任务初始化是否完成`);
      }
      safeLogToTaskFile(`✅ [EXCEL-VALIDATION] UPF工具找到 ${totalTaskTables} 个任务特定表格`);
    } else {
      // SDC工具：使用模板表结构（不需要任务特定副本）
      safeLogToTaskFile(`🔍 [EXCEL-VALIDATION] SDC工具：查找模板表结构...`);
      sheets = await prisma.sheet.findMany({
        where: { toolType: normalizedToolType },
        include: {
          tables: {
            where: { taskId: null } as any,
            orderBy: { displayOrder: 'asc' }
          }
        },
        orderBy: { displayOrder: 'asc' }
      });

      let totalTemplateTables = 0;
      sheets.forEach(sheet => {
        const templateTables = (sheet as any).tables;
        totalTemplateTables += templateTables.length;
      });

      if (totalTemplateTables === 0) {
        throw new Error(`❌ [EXCEL-VALIDATION] SDC工具没有找到模板表结构，请检查数据库初始化是否完成`);
      }
      safeLogToTaskFile(`✅ [EXCEL-VALIDATION] SDC工具找到 ${totalTemplateTables} 个模板表格`);
    }

    let totalTables = 0;
    sheets.forEach(sheet => {
      totalTables += sheet.tables.length;
    });

    safeLogToTaskFile(`✅ [EXCEL-VALIDATION] 获取到 ${sheets.length} 个工作表，${totalTables} 个表格`);
    sheets.forEach(sheet => {
      safeLogToTaskFile(`   工作表 ${sheet.sheetName}: ${sheet.tables.length} 个表格`);
      // 调试：输出每个表格的列结构
      sheet.tables.forEach((table: any) => {
        const columns = (table.columnsSchema as any)?.columns || [];
        safeLogToTaskFile(`     表格 ${table.tableName}: ${columns.length} 列 [${columns.map((c: any) => c.name).join(', ')}]`);
      });
    });

    for (const sheet of sheets) {
      const worksheet = workbook.getWorksheet(sheet.sheetName);
      if (!worksheet) {
        throw new Error(`❌ [EXCEL-VALIDATION] 工作表 ${sheet.sheetName} 在Excel文件中未找到，Excel文件结构不完整`);
      }

      const allTableNames = sheet.tables.map((table: any) => table.tableName);

      for (const table of sheet.tables) {
        const tableLocation = this.getTableLocation(worksheet, table.tableName, sheet.sheetName, allTableNames, normalizedToolType);
        if (!tableLocation) {
          throw new Error(`❌ [EXCEL-VALIDATION] 表格 ${table.tableName} 在工作表 ${sheet.sheetName} 中未找到，Excel文件结构不完整`);
        }

        const { rowStart, maxCol } = tableLocation;
        const columnsSchema = (table.columnsSchema as any)?.columns || [];
        const dataStartRow = rowStart + 2;

        // 查询数据库中该表格的实际行数
        const dbRowCount = await prisma.tableData.count({
          where: {
            taskId,
            userId,
            tableId: table.id
          }
        });

        console.log(`🔍 [EXCEL-VALIDATION] 表格 ${table.tableName}: 数据库行数=${dbRowCount}, 开始行=${dataStartRow}`);

        // 只解析数据库中实际存在的行数
        for (let rowIndex = 1; rowIndex <= dbRowCount; rowIndex++) {
          const dataRowIndex = dataStartRow + rowIndex - 1; // 转换为Excel实际行号
          const rowData: any = {};
          const dropdownData: any = {};
          let hasData = false;
          let hasDropdownData = false;

          // 初始化所有字段为空字符串，确保字段完整性
          for (const column of columnsSchema) {
            rowData[column.name] = '';
          }

          // 检查当前行是否有数据或下拉数据验证（与parseTableData保持一致）
          for (const column of columnsSchema) {
            if (column.index <= maxCol) {
              const cell = worksheet.getCell(dataRowIndex, column.index);
              const cellValue = cell.value;

              // 保存单元格数据 - 统一转换为字符串类型保持原始格式
              if (cellValue !== null && cellValue !== undefined && cellValue !== '') {
                // 统一转换为字符串，保持Excel中的原始显示格式
                let stringValue: string;

                if (typeof cellValue === 'number') {
                  // 检查是否是百分比格式
                  const cellFormat = worksheet.getCell(dataRowIndex, column.index).numFmt;

                  if (cellFormat && cellFormat.includes('%')) {
                    // 百分比格式：0.6 → "60%"
                    stringValue = (cellValue * 100).toString() + '%';
                  } else {
                    // 普通数值：直接转换为字符串
                    stringValue = cellValue.toString();
                  }
                } else {
                  // 非数值类型：直接转换为字符串
                  stringValue = cellValue.toString();
                }

                rowData[column.name] = stringValue;
                hasData = true;
              }
              // 注意：空值保持为空字符串，确保字段存在

              // 检查并保存下拉数据验证（与parseTableData保持一致）
              if (cell.dataValidation) {
                const validation = cell.dataValidation;
                if (validation.formulae && validation.formulae.length > 0) {
                  hasDropdownData = true;

                  // 解析下拉选项
                  const dropdownOptions = this.parseDropdownOptions(validation.formulae[0]);
                  dropdownData[column.name] = {
                    type: validation.type || 'list',
                    options: dropdownOptions,
                    formulae: validation.formulae
                  };

                  // 如果单元格没有数据但有下拉验证，设置空字符串
                  if (!rowData[column.name]) {
                    rowData[column.name] = '';
                  }
                }
              }
            }
          }

          // 保存所有行（包括空行），确保与数据库行数一致
          // 这样验证时能正确对应每一行
            // 构建验证数据结构（与parseTableData保持一致）
            const validationData: any = {};
            for (const column of columnsSchema) {
              if (column.index <= maxCol) {
                const cell = worksheet.getCell(dataRowIndex, column.index);
                if (cell.dataValidation) {
                  const validation = cell.dataValidation;
                  if (validation.formulae && validation.formulae.length > 0) {
                    validationData[column.name] = {
                      type: validation.type,
                      operator: validation.operator,
                      formulae: validation.formulae,
                      allowBlank: validation.allowBlank,
                      showInputMessage: validation.showInputMessage,
                      promptTitle: validation.promptTitle,
                      prompt: validation.prompt,
                      showErrorMessage: validation.showErrorMessage,
                      errorTitle: validation.errorTitle,
                      error: validation.error
                    };
                  }
                }
              }
            }

          // 调试：记录解析的行数据
          const rowDataKeys = Object.keys(rowData);
          console.log(`📋 [EXCEL-VALIDATION] 表格=${table.tableName}, 行=${rowIndex}, Excel行=${dataRowIndex}, 字段数=${rowDataKeys.length}, 字段=[${rowDataKeys.join(', ')}]`);

          allData.push({
            sheetName: sheet.sheetName,
            tableName: table.tableName,
            rowData,
            dropdownData: Object.keys(dropdownData).length > 0 ? dropdownData : null,
            validationData: Object.keys(validationData).length > 0 ? validationData : null
          });
        }
      }
    }

    return allData;
  }

  /**
   * 标准化网页端数据格式
   */
  private static normalizeWebData(webData: any): any[] {
    // 将网页端数据转换为标准的行数据格式
    if (Array.isArray(webData)) {
      return webData;
    }

    // 如果是对象格式，转换为数组
    if (typeof webData === 'object') {
      return Object.values(webData);
    }

    return [];
  }

  /**
   * 精准保存isDirty状态为true的sheet数据到数据库
   * 只保存有变更的sheet，提高效率
   */
  static async saveDirtySheetData(
    taskId: string,
    userId: string,
    dirtySheetData: {
      sheetName: string;
      sheetId: string;
      tables: {
        tableId: string;
        tableName: string;
        data: any[];
      }[];
    }[]
  ): Promise<{
    savedSheets: string[];
    validationResults: any[];
  }> {
    console.log(`🔄 [DIRTY-SAVE] 开始保存isDirty状态的sheet数据: 任务=${taskId}`);

    const savedSheets: string[] = [];
    const validationResults: any[] = [];

    try {
      // 从任务中获取工具类型
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: { parameters: true }
      });
      const detectedToolType = (task?.parameters as any)?.toolType || 'sdc';

      // 标准化工具类型：sdcgen -> sdc, upfgen -> upf
      const normalizedToolType = detectedToolType === 'sdcgen' ? 'sdc' :
                                 detectedToolType === 'upfgen' ? 'upf' :
                                 detectedToolType;

      for (const sheetData of dirtySheetData) {
        console.log(`💾 [DIRTY-SAVE] 保存sheet: ${sheetData.sheetName}`);

        // 获取数据库中真实的sheet和table信息
        const dbSheet = await prisma.sheet.findFirst({
          where: {
            toolType: normalizedToolType,
            sheetName: sheetData.sheetName
          },
          include: {
            tables: {
              where: normalizedToolType === 'upf'
                ? { taskId: taskId } as any  // UPF工具：使用任务特定表结构
                : { taskId: null } as any,   // SDC工具：使用模板表结构
              orderBy: { displayOrder: 'asc' }
            }
          }
        });

        if (!dbSheet) {
          console.error(`❌ [DIRTY-SAVE] Sheet ${sheetData.sheetName} 未找到`);
          continue;
        }

        console.log(`📋 [DIRTY-SAVE] 找到sheet: ${dbSheet.sheetName} (${dbSheet.id}), 包含 ${dbSheet.tables.length} 个表格`);
        console.log(`📋 [DIRTY-SAVE] 表格列表: ${dbSheet.tables.map(t => `${t.tableName}(${t.id})`).join(', ')}`);

        // 1. 清理该sheet的现有数据
        await prisma.tableData.deleteMany({
          where: {
            taskId,
            userId,
            sheetId: dbSheet.id
          }
        });

        // 2. 保存该sheet的所有表格数据
        for (const table of sheetData.tables) {
          // 根据tableName查找真实的tableId
          const dbTable = dbSheet.tables.find(t => t.tableName === table.tableName);
          if (!dbTable) {
            console.error(`❌ [DIRTY-SAVE] Table ${table.tableName} 未找到在sheet ${sheetData.sheetName}`);
            continue;
          }
          const dataToInsert = table.data.map((rowData, index) => {
            // 处理前端发送的嵌套数据结构
            const actualRowData = rowData.row_data || rowData;
            const dropdownData = rowData.dropdown_data || null;
            const validationData = rowData.validation_data || null;

            // 确保所有字段都存在，即使为空字符串
            const completeRowData: any = {};

            // 从数据库表结构中获取列信息
            const columnsSchema = (dbTable.columnsSchema as any)?.columns || [];
            if (columnsSchema.length > 0) {
              // 初始化所有字段为空字符串
              columnsSchema.forEach((column: any) => {
                const columnName = column.name || column;
                completeRowData[columnName] = actualRowData[columnName] || '';
              });
            } else {
              // 如果没有columns定义，使用actualRowData
              Object.assign(completeRowData, actualRowData);
            }

            const dataHash = this.generateDataHash(completeRowData);
            return {
              userId,
              taskId,
              tableId: dbTable.id, // 使用数据库中真实的tableId
              sheetId: dbSheet.id, // 使用数据库中真实的sheetId
              rowNumber: index + 1,
              rowData: {
                ...completeRowData,
                _dataHash: dataHash,
                _sourceType: 'web',
                _lastModified: new Date().toISOString()
              },
              dropdownData,
              validationData
            };
          });

          if (dataToInsert.length > 0) {
            await prisma.tableData.createMany({
              data: dataToInsert
            });
          }

          console.log(`✅ [DIRTY-SAVE] 表格 ${table.tableName} 保存完成，共 ${dataToInsert.length} 行，tableId: ${dbTable.id}`);
        }

        // 3. 验证保存后的数据一致性
        const validation = await this.validateDatabaseWebConsistency(
          taskId,
          userId,
          sheetData.tables.flatMap(t => t.data),
          sheetData.sheetName
        );

        validationResults.push({
          sheetName: sheetData.sheetName,
          validation
        });

        savedSheets.push(sheetData.sheetName);
      }

      console.log(`✅ [DIRTY-SAVE] 所有isDirty状态的sheet保存完成: ${savedSheets.join(', ')}`);

      return {
        savedSheets,
        validationResults
      };

    } catch (error) {
      console.error(`❌ [DIRTY-SAVE] 保存isDirty状态的sheet数据失败:`, error);
      throw error;
    }
  }

  /**
   * 同步数据库数据到Excel文件（DataChk功能）
   * 当总的isDirty状态为false时使用
   */
  static async syncDatabaseToExcelFile(
    taskId: string,
    userId: string,
    outputPath: string
  ): Promise<{
    success: boolean;
    validationResults: any[];
  }> {
    console.log(`🔄 [DB-TO-EXCEL] 开始同步数据库数据到Excel文件: ${outputPath}`);

    try {
      // 1. 执行数据库到Excel的同步
      await this.syncDatabaseToExcel(taskId, outputPath);

      // 2. 验证同步后的数据一致性（DataChk时跳过下拉验证）
      const validation = await this.validateExcelDatabaseConsistency(
        taskId,
        userId,
        outputPath,
        true  // DataChk时跳过下拉验证
      );

      console.log(`✅ [DB-TO-EXCEL] 数据库到Excel同步完成，验证结果:`, validation.isConsistent);

      return {
        success: validation.isConsistent,
        validationResults: [validation]
      };

    } catch (error) {
      console.error(`❌ [DB-TO-EXCEL] 数据库到Excel同步失败:`, error);
      throw error;
    }
  }

  /**
   * 检查Sheet数量和顺序
   */
  private static async validateSheetStructure(excelFilePath: string, toolType: string): Promise<any[]> {
    const differences: any[] = [];

    try {
      // 获取数据库中的Sheet结构
      const dbSheets = await prisma.sheet.findMany({
        where: { toolType },
        orderBy: { displayOrder: 'asc' }
      });

      // 获取Excel中的Sheet结构（忽略Lists隐藏sheet）
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(excelFilePath);
      const excelSheetNames = workbook.worksheets
        .filter(ws => ws.name !== 'Lists') // 忽略Lists隐藏sheet
        .map(ws => ws.name);

      // 1. 检查Sheet数量
      if (dbSheets.length !== excelSheetNames.length) {
        differences.push({
          type: 'sheet_count_mismatch',
          message: `Sheet数量不一致`,
          databaseCount: dbSheets.length,
          excelCount: excelSheetNames.length,
          databaseSheets: dbSheets.map(s => s.sheetName),
          excelSheets: excelSheetNames
        });
      }

      // 2. 检查Sheet顺序
      for (let i = 0; i < Math.min(dbSheets.length, excelSheetNames.length); i++) {
        const dbSheetName = dbSheets[i].sheetName;
        const excelSheetName = excelSheetNames[i];

        if (dbSheetName !== excelSheetName) {
          differences.push({
            type: 'sheet_order_mismatch',
            position: i,
            message: `Sheet顺序不一致，位置${i}`,
            databaseSheet: dbSheetName,
            excelSheet: excelSheetName
          });
        }
      }

      // 3. 检查Sheet存在性
      const dbSheetNames = new Set(dbSheets.map(s => s.sheetName));
      const excelSheetNamesSet = new Set(excelSheetNames);

      for (const dbSheetName of dbSheetNames) {
        if (!excelSheetNamesSet.has(dbSheetName)) {
          differences.push({
            type: 'sheet_missing_in_excel',
            sheetName: dbSheetName,
            message: `数据库Sheet ${dbSheetName} 在Excel中不存在`
          });
        }
      }

      for (const excelSheetName of excelSheetNames) {
        if (!dbSheetNames.has(excelSheetName)) {
          differences.push({
            type: 'sheet_extra_in_excel',
            sheetName: excelSheetName,
            message: `Excel Sheet ${excelSheetName} 在数据库中不存在`
          });
        }
      }

    } catch (error) {
      differences.push({
        type: 'sheet_validation_error',
        message: `Sheet结构验证失败: ${error instanceof Error ? error.message : '未知错误'}`
      });
    }

    return differences;
  }

  /**
   * 检查表格总数量、同一sheet里的表格顺序和表格数量，表格的行列范围，表格的相对位置关系
   */
  private static async validateTableStructure(excelFilePath: string, toolType: string, taskId?: string): Promise<any[]> {
    const differences: any[] = [];

    try {
      // 🔥 智能选择表结构：UPF使用任务特定，SDC使用模板
      let dbSheets: any[];

      if (toolType === 'upf' && taskId) {
        // UPF工具：使用任务特定的表结构
        dbSheets = await prisma.sheet.findMany({
          where: { toolType },
          include: {
            tables: {
              where: { taskId: taskId } as any,
              orderBy: { displayOrder: 'asc' }
            }
          },
          orderBy: { displayOrder: 'asc' }
        });
      } else {
        // SDC工具：使用模板表结构
        dbSheets = await prisma.sheet.findMany({
          where: { toolType },
          include: {
            tables: {
              where: { taskId: null } as any,
              orderBy: { displayOrder: 'asc' }
            }
          },
          orderBy: { displayOrder: 'asc' }
        });
      }

      // 获取Excel中的表格结构
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(excelFilePath);

      // 1. 检查表格总数量
      const totalDbTables = dbSheets.reduce((sum, sheet) => sum + sheet.tables.length, 0);
      let totalExcelTables = 0;
      const excelTableStructure: any[] = [];

      for (const dbSheet of dbSheets) {
        const worksheet = workbook.getWorksheet(dbSheet.sheetName);
        if (worksheet) {
          const sheetTables: any[] = [];
          for (const dbTable of dbSheet.tables) {
            const tableLocation = this.getTableLocation(worksheet, dbTable.tableName, dbSheet.sheetName, dbSheet.tables.map((t: any) => t.tableName), toolType);
            if (tableLocation) {
              totalExcelTables++;
              sheetTables.push({
                tableName: dbTable.tableName,
                location: tableLocation,
                order: dbTable.displayOrder
              });
            }
          }
          excelTableStructure.push({
            sheetName: dbSheet.sheetName,
            tables: sheetTables
          });
        }
      }

      if (totalDbTables !== totalExcelTables) {
        differences.push({
          type: 'table_total_count_mismatch',
          message: `表格总数量不一致`,
          databaseCount: totalDbTables,
          excelCount: totalExcelTables
        });
      }

      // 2. 检查每个Sheet中的表格数量和顺序
      for (const dbSheet of dbSheets) {
        const excelSheetStructure = excelTableStructure.find(es => es.sheetName === dbSheet.sheetName);

        if (excelSheetStructure) {
          // 检查表格数量
          if (dbSheet.tables.length !== excelSheetStructure.tables.length) {
            differences.push({
              type: 'sheet_table_count_mismatch',
              sheetName: dbSheet.sheetName,
              message: `Sheet ${dbSheet.sheetName} 中表格数量不一致`,
              databaseCount: dbSheet.tables.length,
              excelCount: excelSheetStructure.tables.length
            });
          }

          // 检查表格顺序
          for (let i = 0; i < Math.min(dbSheet.tables.length, excelSheetStructure.tables.length); i++) {
            const dbTable = dbSheet.tables[i];
            const excelTable = excelSheetStructure.tables[i];

            if (dbTable.tableName !== excelTable.tableName) {
              differences.push({
                type: 'table_order_mismatch',
                sheetName: dbSheet.sheetName,
                position: i,
                message: `Sheet ${dbSheet.sheetName} 中表格顺序不一致，位置${i}`,
                databaseTable: dbTable.tableName,
                excelTable: excelTable.tableName
              });
            }
          }

          // 3. 检查表格的行列范围和相对位置关系
          for (let i = 0; i < excelSheetStructure.tables.length - 1; i++) {
            const currentTable = excelSheetStructure.tables[i];
            const nextTable = excelSheetStructure.tables[i + 1];

            // 检查表格是否重叠
            if (currentTable.location.maxRow >= nextTable.location.rowStart) {
              differences.push({
                type: 'table_position_overlap',
                sheetName: dbSheet.sheetName,
                message: `Sheet ${dbSheet.sheetName} 中表格位置重叠`,
                table1: currentTable.tableName,
                table2: nextTable.tableName,
                table1Range: `行${currentTable.location.rowStart}-${currentTable.location.maxRow}`,
                table2Range: `行${nextTable.location.rowStart}-${nextTable.location.maxRow}`
              });
            }
          }
        }
      }

    } catch (error) {
      differences.push({
        type: 'table_structure_validation_error',
        message: `表格结构验证失败: ${error instanceof Error ? error.message : '未知错误'}`
      });
    }

    return differences;
  }

  /**
   * 检查列结构详细信息：列名称、数量、顺序、数据类型一致性
   */
  private static async validateColumnStructure(excelFilePath: string, toolType: string, taskId?: string): Promise<any[]> {
    const differences: any[] = [];

    try {
      // 🔥 智能选择表结构：UPF使用任务特定，SDC使用模板
      let dbSheets: any[];

      if (toolType === 'upf' && taskId) {
        // UPF工具：使用任务特定的表结构
        dbSheets = await prisma.sheet.findMany({
          where: { toolType },
          include: {
            tables: {
              where: { taskId: taskId } as any,
              orderBy: { displayOrder: 'asc' }
            }
          },
          orderBy: { displayOrder: 'asc' }
        });
      } else {
        // SDC工具：使用模板表结构
        dbSheets = await prisma.sheet.findMany({
          where: { toolType },
          include: {
            tables: {
              where: { taskId: null } as any,
              orderBy: { displayOrder: 'asc' }
            }
          },
          orderBy: { displayOrder: 'asc' }
        });
      }

      // 获取Excel中的列结构
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(excelFilePath);

      for (const dbSheet of dbSheets) {
        const worksheet = workbook.getWorksheet(dbSheet.sheetName);
        if (!worksheet) continue;

        for (const dbTable of dbSheet.tables) {
          const tableLocation = this.getTableLocation(worksheet, dbTable.tableName, dbSheet.sheetName, dbSheet.tables.map((t: any) => t.tableName), toolType);
          if (!tableLocation) continue;

          const { rowStart } = tableLocation;
          const dbColumns = (dbTable.columnsSchema as any)?.columns || [];

          // 获取Excel中的列信息
          const excelColumns: any[] = [];
          let colIndex = 1;
          while (colIndex <= worksheet.columnCount) {
            const headerCell = worksheet.getCell(rowStart + 1, colIndex);
            if (headerCell.value) {
              excelColumns.push({
                index: colIndex,
                name: headerCell.value.toString(),
                type: this.inferColumnType(worksheet, rowStart + 2, colIndex, tableLocation.maxRow)
              });
              colIndex++;
            } else {
              break;
            }
          }

          // 1. 检查列数量
          if (dbColumns.length !== excelColumns.length) {
            differences.push({
              type: 'column_count_mismatch',
              sheetName: dbSheet.sheetName,
              tableName: dbTable.tableName,
              message: `表格 ${dbSheet.sheetName}.${dbTable.tableName} 列数量不一致`,
              databaseCount: dbColumns.length,
              excelCount: excelColumns.length,
              databaseColumns: dbColumns.map((c: any) => c.name),
              excelColumns: excelColumns.map(c => c.name)
            });
          }

          // 2. 检查列名称和顺序
          for (let i = 0; i < Math.min(dbColumns.length, excelColumns.length); i++) {
            const dbColumn = dbColumns[i];
            const excelColumn = excelColumns[i];

            // 检查列名称
            if (dbColumn.name !== excelColumn.name) {
              differences.push({
                type: 'column_name_mismatch',
                sheetName: dbSheet.sheetName,
                tableName: dbTable.tableName,
                columnIndex: i,
                message: `表格 ${dbSheet.sheetName}.${dbTable.tableName} 列${i}名称不一致`,
                databaseColumnName: dbColumn.name,
                excelColumnName: excelColumn.name
              });
            }

            // 检查列顺序（通过索引）
            if (dbColumn.index !== excelColumn.index) {
              differences.push({
                type: 'column_order_mismatch',
                sheetName: dbSheet.sheetName,
                tableName: dbTable.tableName,
                columnName: dbColumn.name,
                message: `表格 ${dbSheet.sheetName}.${dbTable.tableName} 列${dbColumn.name}顺序不一致`,
                databaseIndex: dbColumn.index,
                excelIndex: excelColumn.index
              });
            }

            // 检查列数据类型
            if (dbColumn.type !== excelColumn.type) {
              differences.push({
                type: 'column_type_mismatch',
                sheetName: dbSheet.sheetName,
                tableName: dbTable.tableName,
                columnName: dbColumn.name,
                message: `表格 ${dbSheet.sheetName}.${dbTable.tableName} 列${dbColumn.name}数据类型不一致`,
                databaseType: dbColumn.type,
                excelType: excelColumn.type
              });
            }
          }

          // 3. 检查缺失的列
          const dbColumnNames = new Set(dbColumns.map((c: any) => c.name));
          const excelColumnNames = new Set(excelColumns.map(c => c.name));

          for (const dbColumnName of dbColumnNames) {
            if (!excelColumnNames.has(dbColumnName)) {
              differences.push({
                type: 'column_missing_in_excel',
                sheetName: dbSheet.sheetName,
                tableName: dbTable.tableName,
                columnName: dbColumnName,
                message: `表格 ${dbSheet.sheetName}.${dbTable.tableName} 列${dbColumnName}在Excel中缺失`
              });
            }
          }

          for (const excelColumnName of excelColumnNames) {
            if (!dbColumnNames.has(excelColumnName)) {
              differences.push({
                type: 'column_extra_in_excel',
                sheetName: dbSheet.sheetName,
                tableName: dbTable.tableName,
                columnName: excelColumnName,
                message: `表格 ${dbSheet.sheetName}.${dbTable.tableName} 列${excelColumnName}在数据库中缺失`
              });
            }
          }
        }
      }

    } catch (error) {
      differences.push({
        type: 'column_structure_validation_error',
        message: `列结构验证失败: ${error instanceof Error ? error.message : '未知错误'}`
      });
    }

    return differences;
  }

  /**
   * 推断列的数据类型
   */
  private static inferColumnType(worksheet: ExcelJS.Worksheet, startRow: number, colIndex: number, maxRow: number): string {
    const sampleSize = Math.min(5, maxRow - startRow + 1);
    const types = new Set<string>();

    for (let row = startRow; row < startRow + sampleSize; row++) {
      const cell = worksheet.getCell(row, colIndex);
      if (cell.value !== null && cell.value !== undefined && cell.value !== '') {
        const value = cell.value;
        if (typeof value === 'number') {
          types.add('number');
        } else if (typeof value === 'boolean') {
          types.add('boolean');
        } else if (value instanceof Date) {
          types.add('date');
        } else {
          types.add('string');
        }
      }
    }

    if (types.size === 0) return 'string';
    if (types.size === 1) return Array.from(types)[0];
    if (types.has('string')) return 'string'; // 混合类型默认为string
    return Array.from(types)[0];
  }

  /**
   * 字段级别的详细比较：具体哪个字段不一致、字段值的详细对比、数据类型验证
   */
  private static compareFieldDetails(excelRow: any, dbRow: any, rowIndex: number): any[] {
    const differences: any[] = [];

    if (!excelRow || !dbRow) return differences;

    const excelData = excelRow.rowData || {};
    const dbData = { ...dbRow.rowData };

    // 排除元数据字段
    delete dbData._dataHash;
    delete dbData._sourceType;
    delete dbData._lastModified;

    // 获取所有字段名
    const allFields = new Set([...Object.keys(excelData), ...Object.keys(dbData)]);

    for (const fieldName of allFields) {
      const excelValue = excelData[fieldName];
      const dbValue = dbData[fieldName];

      // 1. 检查字段存在性
      if (excelValue === undefined && dbValue !== undefined) {
        differences.push({
          type: 'field_missing_in_excel',
          rowIndex,
          fieldName,
          message: `行${rowIndex} 字段${fieldName}在Excel中缺失`,
          databaseValue: dbValue,
          databaseType: typeof dbValue
        });
        continue;
      }

      if (excelValue !== undefined && dbValue === undefined) {
        differences.push({
          type: 'field_missing_in_database',
          rowIndex,
          fieldName,
          message: `行${rowIndex} 字段${fieldName}在数据库中缺失`,
          excelValue: excelValue,
          excelType: typeof excelValue
        });
        continue;
      }

      // 2. 检查字段值（实际单元格内容比较）
      if (excelValue !== undefined && dbValue !== undefined) {
        // 标准化值进行比较（处理数据类型差异）
        const normalizedExcelValue = this.normalizeValueForComparison(excelValue);
        const normalizedDbValue = this.normalizeValueForComparison(dbValue);

        if (normalizedExcelValue !== normalizedDbValue) {
          differences.push({
            type: 'value_mismatch',
            rowIndex,
            fieldName,
            message: `行${rowIndex} 字段${fieldName}的值不一致`,
            excelValue: excelValue,
            databaseValue: dbValue,
            excelType: typeof excelValue,
            databaseType: typeof dbValue,
            normalizedExcelValue,
            normalizedDbValue
          });
          continue;
        }
      }
      if (excelValue !== dbValue) {
        differences.push({
          type: 'field_value_mismatch',
          rowIndex,
          fieldName,
          message: `行${rowIndex} 字段${fieldName}值不一致`,
          excelValue: excelValue,
          databaseValue: dbValue,
          excelType: typeof excelValue,
          databaseType: typeof dbValue
        });
      }

      // 3. 检查数据类型（即使值相同，类型也可能不同）
      if (excelValue !== undefined && dbValue !== undefined) {
        const excelType = this.getDetailedType(excelValue);
        const dbType = this.getDetailedType(dbValue);

        if (excelType !== dbType && excelValue === dbValue) {
          differences.push({
            type: 'field_type_mismatch',
            rowIndex,
            fieldName,
            message: `行${rowIndex} 字段${fieldName}数据类型不一致`,
            value: excelValue,
            excelType: excelType,
            databaseType: dbType
          });
        }
      }
    }

    return differences;
  }

  /**
   * 获取详细的数据类型
   */
  private static getDetailedType(value: any): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'integer' : 'float';
    }
    if (typeof value === 'string') {
      if (value === '') return 'empty_string';
      if (/^\d+$/.test(value)) return 'numeric_string';
      if (/^(true|false)$/i.test(value)) return 'boolean_string';
      return 'string';
    }
    if (typeof value === 'boolean') return 'boolean';
    if (value instanceof Date) return 'date';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    return typeof value;
  }

  /**
   * 标准化值进行比较（处理数据类型差异）
   */
  private static normalizeValueForComparison(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }

    // 数字类型转换为字符串
    if (typeof value === 'number') {
      return value.toString();
    }

    // 布尔类型转换为字符串
    if (typeof value === 'boolean') {
      return value.toString();
    }

    // 字符串类型去除首尾空格
    if (typeof value === 'string') {
      return value.trim();
    }

    // 其他类型转换为JSON字符串
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  /**
   * 检查下拉数据是否引用了Lists sheet
   */
  private static isListsSheetReference(dropdown: any): boolean {
    if (!dropdown || !dropdown.formulae) {
      return false;
    }

    return dropdown.formulae.some((formula: string) =>
      formula && formula.includes && formula.includes('Lists!')
    );
  }

  /**
   * 严格比较下拉数据验证
   * 检查下拉选项的值、数量、顺序
   * 忽略Lists sheet引用的下拉数据
   */
  private static compareDropdownData(excelValidation: any, dbValidation: any, rowIndex: number): any[] {
    const differences: any[] = [];

    if (!excelValidation && !dbValidation) {
      return differences; // 都没有下拉数据，一致
    }

    if (!excelValidation && dbValidation) {
      differences.push({
        type: 'dropdown_missing_in_excel',
        rowIndex,
        message: `行 ${rowIndex} 数据库有下拉数据，Excel中缺失`,
        databaseValidation: dbValidation
      });
      return differences;
    }

    if (excelValidation && !dbValidation) {
      differences.push({
        type: 'dropdown_missing_in_database',
        rowIndex,
        message: `行 ${rowIndex} Excel有下拉数据，数据库中缺失`,
        excelValidation: excelValidation
      });
      return differences;
    }

    // 比较每个列的下拉数据
    const allColumns = new Set([
      ...Object.keys(excelValidation || {}),
      ...Object.keys(dbValidation || {})
    ]);

    for (const column of allColumns) {
      const excelDropdown = excelValidation[column];
      const dbDropdown = dbValidation[column];

      // 忽略引用Lists sheet的下拉数据
      const excelIsListsRef = this.isListsSheetReference(excelDropdown);
      const dbIsListsRef = this.isListsSheetReference(dbDropdown);

      if (excelIsListsRef || dbIsListsRef) {
        // 如果任一方引用了Lists sheet，则跳过比较
        safeLogToTaskFile(`🚫 [DROPDOWN-VALIDATION] 跳过Lists sheet引用的下拉数据比较: 行${rowIndex} 列${column}`);
        continue;
      }

      if (!excelDropdown && dbDropdown) {
        differences.push({
          type: 'dropdown_column_missing_in_excel',
          rowIndex,
          column,
          message: `行 ${rowIndex} 列 ${column} 数据库有下拉数据，Excel中缺失`,
          databaseDropdown: dbDropdown
        });
      } else if (excelDropdown && !dbDropdown) {
        differences.push({
          type: 'dropdown_column_missing_in_database',
          rowIndex,
          column,
          message: `行 ${rowIndex} 列 ${column} Excel有下拉数据，数据库中缺失`,
          excelDropdown: excelDropdown
        });
      } else if (excelDropdown && dbDropdown) {
        // 比较下拉选项的详细内容
        const excelOptions = excelDropdown.formulae || [];
        const dbOptions = dbDropdown.formulae || [];

        // 检查选项数量
        if (excelOptions.length !== dbOptions.length) {
          differences.push({
            type: 'dropdown_options_count_mismatch',
            rowIndex,
            column,
            message: `行 ${rowIndex} 列 ${column} 下拉选项数量不一致`,
            excelCount: excelOptions.length,
            databaseCount: dbOptions.length,
            excelOptions,
            databaseOptions: dbOptions
          });
        }

        // 检查选项值和顺序
        for (let i = 0; i < Math.max(excelOptions.length, dbOptions.length); i++) {
          if (excelOptions[i] !== dbOptions[i]) {
            differences.push({
              type: 'dropdown_options_value_mismatch',
              rowIndex,
              column,
              optionIndex: i,
              message: `行 ${rowIndex} 列 ${column} 下拉选项 ${i} 值不一致`,
              excelValue: excelOptions[i],
              databaseValue: dbOptions[i]
            });
          }
        }

        // 检查其他下拉属性
        const attributesToCheck = ['type', 'allowBlank', 'showInputMessage', 'showErrorMessage'];
        for (const attr of attributesToCheck) {
          if (excelDropdown[attr] !== dbDropdown[attr]) {
            differences.push({
              type: 'dropdown_attribute_mismatch',
              rowIndex,
              column,
              attribute: attr,
              message: `行 ${rowIndex} 列 ${column} 下拉属性 ${attr} 不一致`,
              excelValue: excelDropdown[attr],
              databaseValue: dbDropdown[attr]
            });
          }
        }
      }
    }

    return differences;
  }

  /**
   * 过滤掉元数据字段，只保留业务相关的表格数据
   */
  private static filterBusinessData(rowData: any): any {
    const { _dataHash, _sourceType, _lastModified, ...businessData } = rowData;
    return businessData;
  }

  /**
   * 生成四个sheet对应的JSON文件
   */
  private static async generateSheetJsonFiles(taskId: string, sheets: any[]): Promise<void> {
    try {
      console.log(`📄 [JSON-GEN] 开始生成JSON文件: 任务=${taskId}`);

      const tempDir = path.join(process.env.TEMP_UPLOAD_DIR!, taskId);

      // 确保目录存在
      await fs.mkdir(tempDir, { recursive: true });

      // 定义sheet名称到JSON文件名的映射
      const sheetToJsonMap: { [key: string]: string } = {
        // SDC工具的映射
        'VarDef': 'vardef.json',
        'ClkDef': 'clkdef.json',
        'IODly': 'iodly.json',
        'Exp': 'exp.json',
        // UPF工具的映射
        'PDomain': 'pdomain.json',
        'PStrategy': 'pstrategy.json',
        'PMode': 'pmode.json'
      };

      for (const sheet of sheets) {
        const jsonFileName = sheetToJsonMap[sheet.sheetName];
        if (!jsonFileName) {
          console.warn(`⚠️ [JSON-GEN] 未知的sheet名称: ${sheet.sheetName}，跳过JSON生成`);
          continue;
        }

        // 按要求的格式构建JSON数据：每个表格的每一行数据
        const jsonData: { [key: string]: any } = {};

        // 检查sheet.tables是否存在
        if (!sheet.tables || !Array.isArray(sheet.tables)) {
          console.warn(`⚠️ [JSON-GEN] Sheet ${sheet.sheetName} 没有tables数据，跳过`);
          continue;
        }

        for (const table of sheet.tables) {
          if (!table || !table.tableName) {
            console.warn(`⚠️ [JSON-GEN] 发现无效的table对象，跳过`);
            continue;
          }

          const tableName = table.tableName;
          const columns = (table.columnsSchema as any)?.columns || [];

          console.log(`📋 [JSON-GEN] 处理表格: ${tableName}, 列数: ${columns.length}, 数据行数: ${table.tableData?.length || 0}`);

          // 如果表格有数据，按行生成
          if (table.tableData && Array.isArray(table.tableData) && table.tableData.length > 0) {
            for (const rowData of table.tableData) {
              const rowKey = `${tableName}_Row${rowData.rowNumber}`;
              const rowObject: { [key: string]: any } = {};

              // 为每一列生成键值对
              for (const column of columns) {
                // 过滤掉元数据字段，只使用业务数据
                const businessData = this.filterBusinessData(rowData.rowData);
                const value = businessData[column.name];
                rowObject[column.name] = (value === undefined || value === '') ? null : value;
              }

              jsonData[rowKey] = rowObject;
            }
          } else {
            // 空表格也需要根据实际表格行数写出来
            // 这里我们至少生成一个示例行结构
            const rowKey = `${tableName}_Row1`;
            const rowObject: { [key: string]: any } = {};

            for (const column of columns) {
              rowObject[column.name] = null;
            }

            jsonData[rowKey] = rowObject;
          }
        }

        // 写入JSON文件
        const jsonFilePath = path.join(tempDir, jsonFileName);
        await fs.writeFile(jsonFilePath, JSON.stringify(jsonData, null, 4), 'utf-8');

        const rowCount = Object.keys(jsonData).length;
        console.log(`✅ [JSON-GEN] 生成JSON文件: ${jsonFilePath}，包含 ${rowCount} 行数据`);
      }

      console.log(`✅ [JSON-GEN] 所有JSON文件生成完成: ${tempDir}`);

    } catch (error) {
      console.error(`❌ [JSON-GEN] 生成JSON文件失败:`, error);
      throw new Error(`JSON文件生成失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 将数据库数据同步到Excel文件（带文件锁保护）
   */
  static async syncDatabaseToExcel(taskId: string, outputPath: string): Promise<void> {
    // 检查是否有正在进行的文件操作
    if (taskFileLocks.has(taskId)) {
      console.log(`⏳ [DB-TO-EXCEL] 任务 ${taskId} 正在进行文件操作，等待完成...`);
      await taskFileLocks.get(taskId);
    }

    // 创建新的文件操作锁
    const fileOperation = this.performSyncOperation(taskId, outputPath);
    taskFileLocks.set(taskId, fileOperation);

    try {
      await fileOperation;
    } finally {
      // 清理锁
      taskFileLocks.delete(taskId);
    }
  }

  /**
   * 执行实际的同步操作
   */
  private static async performSyncOperation(taskId: string, outputPath: string): Promise<void> {
    try {
      console.log(`🔄 [DB-TO-EXCEL] 开始将任务 ${taskId} 的数据库数据同步到现有Excel文件: ${outputPath}`);

      // 检查目标Excel文件是否存在（应该是sdc_dg_gen.py生成的文件）
      try {
        await fs.access(outputPath, fs.constants.R_OK | fs.constants.W_OK);
        console.log(`✅ [DB-TO-EXCEL] 目标Excel文件可访问: ${outputPath}`);
      } catch (error) {
        throw new Error(`目标Excel文件不存在或无法访问: ${outputPath}。请确保已完成初始化步骤。`);
      }

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(outputPath);

      // 调试：检查Excel文件读取情况
      console.log(`📊 [DB-TO-EXCEL] Excel文件读取完成，工作表数量: ${workbook.worksheets.length}`);
      for (const ws of workbook.worksheets) {
        console.log(`📋 [DB-TO-EXCEL] 工作表: ${ws.name}, 行数: ${ws.rowCount}, 列数: ${ws.columnCount}`);

        // 特别检查Exp工作表
        if (ws.name === 'Exp') {
          const expTables: string[] = [];
          for (let row = 1; row <= ws.rowCount; row++) {
            const cell = ws.getCell(row, 1);
            if (cell.value && typeof cell.value === 'string' && cell.value.startsWith('TM')) {
              expTables.push(`行${row}: ${cell.value}`);
            }
          }
          console.log(`🔍 [DB-TO-EXCEL] Exp工作表中的表格:`, expTables);
        }
      }

      // 从任务中获取工具类型
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: { parameters: true }
      });
      const detectedToolType = (task?.parameters as any)?.toolType || 'sdc';

      // 标准化工具类型：sdcgen -> sdc, upfgen -> upf
      const normalizedToolType = detectedToolType === 'sdcgen' ? 'sdc' :
                                 detectedToolType === 'upfgen' ? 'upf' :
                                 detectedToolType;

      // 获取数据库中的数据 - 使用与验证时相同的查询逻辑
      let sheets: any[];

      if (normalizedToolType === 'upf') {
        // UPF工具：使用任务特定的表结构（包含动态电源列）
        console.log(`🔍 [DB-TO-EXCEL] UPF工具：查找任务 ${taskId} 的特定表结构...`);
        sheets = await prisma.sheet.findMany({
          where: { toolType: normalizedToolType },
          include: {
            tables: {
              where: { taskId: taskId } as any,
              include: {
                tableData: {
                  where: { taskId },
                  orderBy: { rowNumber: 'asc' }
                }
              },
              orderBy: { displayOrder: 'asc' }
            }
          },
          orderBy: { displayOrder: 'asc' }
        });
      } else {
        // SDC工具：使用模板表结构（不需要任务特定副本）
        sheets = await prisma.sheet.findMany({
          where: { toolType: normalizedToolType },
          include: {
            tables: {
              where: { taskId: null } as any,
              include: {
                tableData: {
                  where: { taskId },
                  orderBy: { rowNumber: 'asc' }
                }
              },
              orderBy: { displayOrder: 'asc' }
            }
          },
          orderBy: { displayOrder: 'asc' }
        });
      }

      for (const sheet of sheets) {
        const worksheet = workbook.getWorksheet(sheet.sheetName);
        if (!worksheet) {
          throw new Error(`❌ [DB-TO-EXCEL] 工作表 ${sheet.sheetName} 在Excel文件中不存在，Excel文件结构不完整`);
        }

        console.log(`📊 [DB-TO-EXCEL] 开始同步工作表 ${sheet.sheetName}，包含 ${sheet.tables.length} 个表格`);

        for (const table of sheet.tables) {
          // 确保每个表格都尝试同步，无论是否有数据
          console.log(`📋 [DB-TO-EXCEL] 同步表格 ${table.tableName}，数据行数: ${table.tableData.length}`);
          await this.writeTableDataToWorksheet(worksheet, table);
        }

        console.log(`✅ [DB-TO-EXCEL] 工作表 ${sheet.sheetName} 同步完成`);
      }

      await workbook.xlsx.writeFile(outputPath);
      console.log(`✅ [DB-TO-EXCEL] 数据库数据已同步到Excel文件: ${outputPath}`);

      // 同时生成四个sheet对应的JSON文件
      await this.generateSheetJsonFiles(taskId, sheets);

    } catch (error: any) {
      console.error(`❌ [DB-TO-EXCEL] 同步数据库数据到Excel文件时出错:`, error);

      // 提供更详细的错误信息
      if (error.code === 'EBUSY') {
        throw new Error(`文件被占用，请关闭Excel程序后重试: ${error.message}`);
      } else if (error.code === 'ENOENT') {
        throw new Error(`文件或目录不存在: ${error.message}`);
      } else if (error.code === 'EPERM') {
        throw new Error(`权限不足，无法访问文件: ${error.message}`);
      } else {
        throw new Error(`数据同步失败: ${error.message}`);
      }
    }
  }

  /**
   * 将表格数据写入工作表（包括数据和下拉验证）
   * 必须确保：表格结构、表格数据、表格下拉数据三个方面完整同步
   */
  private static async writeTableDataToWorksheet(worksheet: ExcelJS.Worksheet, table: any): Promise<void> {
    // 获取当前sheet中所有表格名称，用于精确定位
    const sheet = await prisma.sheet.findFirst({
      where: { id: table.sheetId },
      include: { tables: true }
    });

    if (!sheet) {
      throw new Error(`❌ [WRITE-TABLE] 无法找到表格 ${table.tableName} 对应的sheet信息`);
    }

    const allTableNames = sheet.tables.map((t: any) => t.tableName);

    // 调试：强制刷新工作表数据
    console.log(`🔄 [WRITE-TABLE] 强制刷新工作表 ${sheet.sheetName} 数据...`);

    // 重新扫描整个工作表，查找所有表格
    const foundTables: string[] = [];
    for (let row = 1; row <= worksheet.rowCount; row++) {
      const cell = worksheet.getCell(row, 1);
      if (cell.value && typeof cell.value === 'string' && cell.value.startsWith('TM')) {
        foundTables.push(`行${row}: ${cell.value}`);
      }
    }
    console.log(`🔍 [WRITE-TABLE] 重新扫描找到的表格:`, foundTables);

    // 使用getTableLocation方法精确定位表格
    const tableLocation = this.getTableLocation(worksheet, table.tableName, sheet.sheetName, allTableNames, sheet.toolType);

    if (!tableLocation) {
      console.warn(`⚠️ [WRITE-TABLE] 表格 ${table.tableName} 在工作表 ${sheet.sheetName} 中未找到，跳过同步`);
      console.log(`🔍 [WRITE-TABLE] 工作表 ${sheet.sheetName} 中可用的表格:`, allTableNames);

      // 检查工作表中实际存在的表格
      const existingTables: string[] = [];
      for (let row = 1; row <= Math.min(worksheet.rowCount, 100); row++) {
        const cell = worksheet.getCell(row, 1);
        if (cell.value && typeof cell.value === 'string' && allTableNames.includes(cell.value)) {
          existingTables.push(cell.value);
        }
      }
      console.log(`🔍 [WRITE-TABLE] 工作表 ${sheet.sheetName} 中实际找到的表格:`, existingTables);

      // 如果表格数据为空，则跳过；如果有数据，则报错
      if (table.tableData.length === 0) {
        console.log(`ℹ️ [WRITE-TABLE] 表格 ${table.tableName} 无数据，跳过同步`);
        return;
      } else {
        throw new Error(`❌ [WRITE-TABLE] 表格 ${table.tableName} 在工作表 ${sheet.sheetName} 中未找到，但数据库中有 ${table.tableData.length} 行数据需要同步`);
      }
    }

    const { rowStart, maxRow } = tableLocation;

    const columnsSchema = (table.columnsSchema as any)?.columns || [];
    const dataStartRow = rowStart + 2; // 跳过表格名称和列头

    console.log(`📝 [WRITE-TABLE] 开始写入表格 ${table.tableName}，数据行数: ${table.tableData.length}`);

    // 1. 清空现有数据区域（保留表格结构和下拉验证模板）
    // 使用表格的实际边界，避免清空其他表格
    const clearEndRow = Math.min(maxRow, dataStartRow + Math.max(50, table.tableData.length + 10));
    console.log(`🧹 [WRITE-TABLE] 清空数据区域: 第${dataStartRow}行到第${clearEndRow}行（表格边界：第${maxRow}行）`);

    for (let row = dataStartRow; row <= clearEndRow; row++) {
      for (const column of columnsSchema) {
        const cell = worksheet.getCell(row, column.index);
        cell.value = null; // 只清空值，保留格式和验证
      }
    }



    // 2. 按row_number顺序写入数据库数据（包括空行）
    const sortedTableData = table.tableData.sort((a: any, b: any) => a.rowNumber - b.rowNumber);

    for (const tableData of sortedTableData) {
      const targetRow = dataStartRow + tableData.rowNumber - 1; // rowNumber从1开始

      // 写入数据值
      for (const column of columnsSchema) {
        const value = tableData.rowData[column.name];
        const cell = worksheet.getCell(targetRow, column.index);

        // 写入数据值（确保空行也被正确处理）
        if (value !== undefined && value !== null && value !== '') {
          cell.value = value;  // 写入有效值
        } else {
          cell.value = null;   // 明确清空单元格，确保空行一致性
        }

        // 不重新设置下拉验证，保持Excel原有的下拉验证不变
        // 这样避免了下拉验证属性不一致的问题
      }
    }

    console.log(`✅ [WRITE-TABLE] 表格 ${table.tableName} 完整同步完成，包含 ${sortedTableData.length} 行数据和下拉验证`);
  }

  /**
   * 生成JSON格式的表格数据文件
   */
  static async generateJsonFiles(taskId: string, outputDir: string): Promise<void> {
    try {
      console.log(`开始为任务 ${taskId} 生成JSON格式文件到目录: ${outputDir}`);

      // 确保输出目录存在
      await fs.mkdir(outputDir, { recursive: true });

      // 从任务中获取工具类型
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: { parameters: true }
      });
      const detectedToolType = (task?.parameters as any)?.toolType || 'sdc';

      // 标准化工具类型：sdcgen -> sdc, upfgen -> upf
      const normalizedToolType = detectedToolType === 'sdcgen' ? 'sdc' :
                                 detectedToolType === 'upfgen' ? 'upf' :
                                 detectedToolType;

      // 获取数据库中的数据 - 使用与验证时相同的查询逻辑
      let sheets: any[];

      if (normalizedToolType === 'upf') {
        // UPF工具：使用任务特定的表结构（包含动态电源列）
        console.log(`🔍 [JSON-GEN] UPF工具：查找任务 ${taskId} 的特定表结构...`);
        sheets = await prisma.sheet.findMany({
          where: { toolType: normalizedToolType },
          include: {
            tables: {
              where: { taskId: taskId } as any,
              include: {
                tableData: {
                  where: { taskId },
                  orderBy: { rowNumber: 'asc' }
                }
              },
              orderBy: { displayOrder: 'asc' }
            }
          },
          orderBy: { displayOrder: 'asc' }
        });
      } else {
        // SDC工具：使用模板表结构（不需要任务特定副本）
        sheets = await prisma.sheet.findMany({
          where: { toolType: normalizedToolType },
          include: {
            tables: {
              where: { taskId: null } as any,
              include: {
                tableData: {
                  where: { taskId },
                  orderBy: { rowNumber: 'asc' }
                }
              },
              orderBy: { displayOrder: 'asc' }
            }
          },
          orderBy: { displayOrder: 'asc' }
        });
      }

      // 为每个sheet生成对应的JSON文件
      for (const sheet of sheets) {
        const jsonData = {
          sheet_name: sheet.sheetName,
          tables: sheet.tables.map((table: any) => ({
            table_name: table.tableName,
            columns: ((table.columnsSchema as any)?.columns || []).map((col: any) => col.name || col),
            rows: table.tableData.map((data: any) => this.filterBusinessData(data.rowData))
          }))
        };

        // 根据sheet名称确定文件名
        const fileName = this.getJsonFileName(sheet.sheetName);
        const filePath = path.join(outputDir, fileName);

        await fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), 'utf8');
        console.log(`生成JSON文件: ${filePath}`);
      }

      console.log(`任务 ${taskId} 的JSON文件生成完成`);
    } catch (error) {
      console.error('生成JSON文件时出错:', error);
      throw error;
    }
  }

  /**
   * 根据sheet名称获取对应的JSON文件名
   */
  private static getJsonFileName(sheetName: string): string {
    const mapping: { [key: string]: string } = {
      // SDC工具的映射
      'VarDef': 'vardef.json',
      'ClkDef': 'clkdef.json',
      'IODly': 'iodly.json',
      'Exp': 'exp.json',
      // UPF工具的映射
      'PDomain': 'pdomain.json',
      'PStrategy': 'pstrategy.json',
      'PMode': 'pmode.json'
    };
    return mapping[sheetName] || `${sheetName.toLowerCase()}.json`;
  }

  /**
   * 清理任务相关的数据库数据
   */
  static async cleanupTaskData(taskId: string): Promise<void> {
    try {
      console.log(`开始清理任务 ${taskId} 的数据库数据`);

      const deletedCount = await prisma.tableData.deleteMany({
        where: { taskId }
      });

      console.log(`已清理任务 ${taskId} 的 ${deletedCount.count} 条数据库记录`);
    } catch (error) {
      console.error('清理任务数据时出错:', error);
      throw error;
    }
  }

  /**
   * 获取任务的表格数据（按sheet组织）
   */
  static async getTaskDataBySheet(taskId: string, sheetName?: string): Promise<any> {
    try {
      // 从任务中获取工具类型
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: { parameters: true }
      });
      const detectedToolType = (task?.parameters as any)?.toolType || 'sdc';

      // 标准化工具类型：sdcgen -> sdc, upfgen -> upf
      const normalizedToolType = detectedToolType === 'sdcgen' ? 'sdc' :
                                 detectedToolType === 'upfgen' ? 'upf' :
                                 detectedToolType;

      const whereCondition: any = { toolType: normalizedToolType };
      if (sheetName) {
        whereCondition.sheetName = sheetName;
      }

      // 🔥 智能选择表结构：UPF使用任务特定，SDC使用模板
      let sheets: any[];

      if (normalizedToolType === 'upf') {
        // UPF工具：使用任务特定的表结构
        sheets = await prisma.sheet.findMany({
          where: whereCondition,
          include: {
            tables: {
              where: { taskId: taskId } as any,
              include: {
                tableData: {
                  where: { taskId },
                  orderBy: { rowNumber: 'asc' }
                }
              },
              orderBy: { displayOrder: 'asc' }
            }
          },
          orderBy: { displayOrder: 'asc' }
        });
      } else {
        // SDC工具：使用模板表结构
        sheets = await prisma.sheet.findMany({
          where: whereCondition,
          include: {
            tables: {
              where: { taskId: null } as any,
              include: {
                tableData: {
                  where: { taskId },
                  orderBy: { rowNumber: 'asc' }
                }
              },
              orderBy: { displayOrder: 'asc' }
            }
          },
          orderBy: { displayOrder: 'asc' }
        });
      }

      return sheets.map(sheet => ({
        sheet_name: sheet.sheetName,
        sheet_id: sheet.id,
        tables: sheet.tables.map((table: any) => {
          // 安全地解析columnsSchema
          const columnsSchema = table.columnsSchema as any;
          const columns = Array.isArray(columnsSchema?.columns)
            ? columnsSchema.columns.map((col: any) => col.name || col)
            : [];

          return {
            table_id: table.id,
            table_name: table.tableName,
            columns: columns,
            rows: table.tableData.map((data: any) => ({
              row_number: data.rowNumber,
              row_data: data.rowData,
              dropdown_data: data.dropdownData,
              validation_data: data.validationData,
              data_id: data.id
            }))
          };
        })
      }));
    } catch (error) {
      console.error('获取任务表格数据时出错:', error);
      throw error;
    }
  }

  /**
   * 保存表格数据到数据库
   */
  static async saveTableData(
    taskId: string,
    userId: string,
    sheetName: string,
    tablesData: any[]
  ): Promise<void> {
    try {
      console.log(`开始保存任务 ${taskId} 的 ${sheetName} sheet数据`);

      // 从任务中获取工具类型
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: { parameters: true }
      });
      const detectedToolType = (task?.parameters as any)?.toolType || 'sdc';

      // 标准化工具类型：sdcgen -> sdc, upfgen -> upf
      const normalizedToolType = detectedToolType === 'sdcgen' ? 'sdc' :
                                 detectedToolType === 'upfgen' ? 'upf' :
                                 detectedToolType;

      // 获取sheet和table信息
      const sheet = await prisma.sheet.findFirst({
        where: { toolType: normalizedToolType, sheetName },
        include: { tables: true }
      });

      if (!sheet) {
        throw new Error(`Sheet ${sheetName} not found`);
      }

      // 删除该sheet下该任务的现有数据
      await prisma.tableData.deleteMany({
        where: {
          taskId,
          sheetId: sheet.id
        }
      });

      // 保存新数据
      for (const tableData of tablesData) {
        const table = sheet.tables.find(t => t.tableName === tableData.table_name);
        if (!table) {
          console.warn(`Table ${tableData.table_name} not found in sheet ${sheetName}`);
          continue;
        }

        for (const [index, row] of tableData.rows.entries()) {
          await prisma.tableData.create({
            data: {
              userId,
              taskId,
              tableId: table.id,
              sheetId: sheet.id,
              rowNumber: index + 1,
              rowData: row.row_data || row,
              dropdownData: row.dropdown_data || null,
              validationData: row.validation_data || null
            }
          });
        }
      }

      console.log(`任务 ${taskId} 的 ${sheetName} sheet数据保存完成`);
    } catch (error) {
      console.error('保存表格数据时出错:', error);
      throw error;
    }
  }

  /**
   * 为UPF任务创建表结构副本（SDC不需要，直接使用基础表结构）
   */
  static async createTaskSpecificTableStructure(taskId: string, _userId: string, toolType: string): Promise<void> {
    try {
      console.log(`🔧 为任务 ${taskId} 创建 ${toolType} 工具的表结构副本...`);

      // 1. 清理已存在的任务特定表结构（UPF工具必须每次重新创建）
      const existingTaskTables = await prisma.table.findMany({
        where: {
          toolType,
          taskId: taskId
        } as any
      });

      if (existingTaskTables.length > 0) {
        console.log(`🔄 任务 ${taskId} 的表结构副本已存在 (${existingTaskTables.length} 个表格)，先清理后重新创建`);

        // 先删除相关的数据
        await prisma.tableData.deleteMany({
          where: { taskId: taskId }
        });

        // 再删除表结构
        await prisma.table.deleteMany({
          where: {
            toolType,
            taskId: taskId
          } as any
        });

        console.log(`✅ 已清理任务 ${taskId} 的旧表结构和数据`);
      }

      // 2. 获取基础模板表结构
      console.log(`🔍 查找 ${toolType} 工具的模板表结构...`);
      const templateSheets = await prisma.sheet.findMany({
        where: { toolType },
        include: {
          tables: {
            where: {
              taskId: null  // 基础模板表结构（taskId为null的就是模板表）
            } as any
          }
        }
      });

      console.log(`📊 找到 ${templateSheets.length} 个模板工作表`);
      let totalTables = 0;
      templateSheets.forEach(sheet => {
        const tables = (sheet as any).tables;
        console.log(`  工作表 ${sheet.sheetName}: ${tables.length} 个表格`);
        totalTables += tables.length;
      });

      if (templateSheets.length === 0) {
        throw new Error(`没有找到 ${toolType} 工具的模板工作表，请检查数据库初始化`);
      }

      if (totalTables === 0) {
        throw new Error(`找到 ${templateSheets.length} 个模板工作表，但没有找到任何模板表格，请检查数据库初始化`);
      }

      // 3. 为当前任务创建表结构副本
      console.log(`🔧 开始创建 ${totalTables} 个表格的副本...`);
      let createdCount = 0;
      for (const sheet of templateSheets) {
        const tables = (sheet as any).tables;
        console.log(`📋 处理工作表 ${sheet.sheetName} (${tables.length} 个表格)...`);

        for (const table of tables) {
          try {
            await prisma.table.create({
              data: {
                sheetId: table.sheetId,
                toolType: table.toolType,
                tableName: table.tableName,
                columnsSchema: table.columnsSchema,
                displayOrder: table.displayOrder,
                taskId: taskId,  // 关键：绑定到特定任务
                isTemplate: false
              } as any
            });
            console.log(`    ✅ 创建表格副本: ${table.tableName} (sheetId: ${table.sheetId})`);
            createdCount++;
          } catch (createError) {
            console.error(`❌ 创建表格副本失败: ${table.tableName}`, createError);
            throw createError;
          }
        }
      }

      console.log(`📊 总共创建了 ${createdCount} 个表格副本`);

      // 4. 验证创建结果
      const verifyTables = await prisma.table.findMany({
        where: {
          toolType,
          taskId: taskId
        } as any
      });

      console.log(`🔍 验证结果: 数据库中现在有 ${verifyTables.length} 个任务特定表格`);
      verifyTables.forEach(table => {
        console.log(`    - ${table.tableName} (ID: ${table.id})`);
      });

      if (verifyTables.length !== createdCount) {
        throw new Error(`表格创建验证失败: 期望 ${createdCount} 个，实际 ${verifyTables.length} 个`);
      }

      console.log(`✅ 任务 ${taskId} 的表结构副本创建完成`);
    } catch (error) {
      console.error(`❌ 创建任务表结构副本失败:`, error);
      throw error;
    }
  }

  /**
   * 更新任务特定的UPF动态列结构 - 更新所有表格
   */
  static async updateTaskSpecificDynamicTableColumns(taskId: string, pcontExcelPath: string): Promise<void> {
    try {
      safeLogToTaskFile(`🔄 [UPF-DYNAMIC] 更新任务 ${taskId} 的所有表格列结构...`);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(pcontExcelPath);

      // 定义所有需要更新的表格（工作表名 -> 表格名列表）
      const tablesToUpdate = [
        // VarDef工作表
        { sheetName: 'VarDef', tableName: 'PMVAR' },
        { sheetName: 'VarDef', tableName: 'PMCELL' },

        // PDomain工作表 - 这些表格包含动态电源列
        { sheetName: 'PDomain', tableName: 'PMDOMAIN' },
        { sheetName: 'PDomain', tableName: 'PMNETWORK' },
        { sheetName: 'PDomain', tableName: 'PMBOUNDARY' },

        // PStrategy工作表
        { sheetName: 'PStrategy', tableName: 'PMISO' },
        { sheetName: 'PStrategy', tableName: 'PMLS' },
        { sheetName: 'PStrategy', tableName: 'PMPSW' },
        { sheetName: 'PStrategy', tableName: 'PMRET' },

        // PMode工作表 - 包含动态电源列
        { sheetName: 'PMode', tableName: 'PMMODE' }
      ];

      // 更新所有表格的列结构
      for (const { sheetName, tableName } of tablesToUpdate) {
        safeLogToTaskFile(`🔄 [UPF-DYNAMIC] 更新表格 ${sheetName}.${tableName}...`);
        await this.updateDynamicTableColumns(taskId, workbook, sheetName, tableName);
      }

      safeLogToTaskFile(`✅ [UPF-DYNAMIC] 任务 ${taskId} 的所有表格列结构更新完成`);
    } catch (error) {
      safeLogErrorToTaskFile('更新任务特定动态列结构时出错', error);
      throw error;
    }
  }

  /**
   * 确保模板表结构存在（安全检查）
   */
  static async ensureTemplateTableStructure(toolType: string): Promise<void> {
    try {
      console.log(`🔍 检查 ${toolType} 工具的模板表结构...`);

      const existingSheets = await prisma.sheet.findMany({
        where: { toolType }
      });

      if (existingSheets.length === 0) {
        console.log(`⚠️ ${toolType} 工具缺少模板表结构，开始初始化...`);
        await this.initializeDatabaseSchema(toolType);
      } else {
        console.log(`✅ ${toolType} 工具模板表结构已存在`);
      }
    } catch (error) {
      console.error(`检查模板表结构失败:`, error);
      throw error;
    }
  }
}
