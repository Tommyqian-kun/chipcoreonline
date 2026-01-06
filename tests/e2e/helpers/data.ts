import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';

/**
 * 数据处理辅助函数
 * 用于读取和准备测试数据
 */

/**
 * 读取文件内容
 */
export function readFile(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * 读取YAML文件
 */
export function readYamlFile(filePath: string): string {
  return readFile(filePath);
}

/**
 * 读取Verilog文件
 */
export function readVlogFile(filePath: string): string {
  return readFile(filePath);
}

/**
 * 读取Excel文件
 */
export async function readExcelFile(filePath: string): Promise<ExcelJS.Workbook> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Excel文件不存在: ${filePath}`);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  return workbook;
}

/**
 * 从Excel提取表格数据
 *
 * ⚠️【重要】只提取单元格的实际填写值（rowData），不提取下拉选项
 */
export async function extractTableDataFromExcel(
  excelPath: string,
  sheetName: string,
  tableName: string
): Promise<{ rows: any[] }> {
  const workbook = await readExcelFile(excelPath);
  const sheet = workbook.getWorksheet(sheetName);

  if (!sheet) {
    throw new Error(`Sheet不存在: ${sheetName}`);
  }

  const rows: any[] = [];
  let tableStartRow = -1;
  let headerRow = -1;

  // 查找表格标识符（例如：TMVAR）所在的行
  sheet.eachRow((row, rowNumber) => {
    const firstCell = row.getCell(1).text;
    if (firstCell === tableName) {
      tableStartRow = rowNumber;
      headerRow = rowNumber + 1; // 假设表头在标识符下一行
    }
  });

  if (tableStartRow === -1) {
    console.warn(`未找到表格: ${tableName} in Sheet: ${sheetName}`);
    return { rows: [] };
  }

  // 读取表头
  const headers: string[] = [];
  const headerRowObj = sheet.getRow(headerRow);
  headerRowObj.eachCell((cell, colNumber) => {
    headers[colNumber] = cell.text;
  });

  // 读取数据行（从表头下一行开始，直到遇到空行或新的表格标识符）
  let dataRowNumber = headerRow + 1;
  while (dataRowNumber <= sheet.rowCount) {
    const row = sheet.getRow(dataRowNumber);
    const rowData: any = {};
    let hasData = false;

    headers.forEach((header, colIndex) => {
      if (header) {
        const cellValue = row.getCell(colIndex + 1).text;
        if (cellValue) {
          rowData[header] = cellValue;
          hasData = true;
        }
      }
    });

    // 如果遇到新的表格标识符，停止读取
    const firstCell = row.getCell(1).text;
    if (firstCell && firstCell.match(/^[A-Z]+$/) && firstCell !== tableName) {
      break;
    }

    if (hasData) {
      rows.push(rowData);
    }

    dataRowNumber++;
  }

  return { rows };
}

/**
 * 为SDC工具注入测试数据
 *
 * ⚠️【重要】此函数只注入单元格的实际填写值（rowData）
 *            不会改变表格的列结构（columnsSchema）和下拉选项定义
 *
 * @param taskId 任务ID
 * @param excelPath 预填充的Excel文件路径
 */
export async function injectSdcTestData(
  request: any,
  taskId: string,
  excelPath: string
): Promise<void> {
  console.log(`📂 读取Excel文件: ${excelPath}`);

  // 检查文件是否存在
  if (!fs.existsSync(excelPath)) {
    throw new Error(`Excel文件不存在: ${excelPath}`);
  }

  // SDC工具的Sheet定义
  const sdcSheets = [
    { name: 'VarDef', tables: ['TMVAR'] },
    { name: 'ClkDef', tables: ['TMCLK'] },
    { name: 'IODly', tables: ['TMIODLY'] },
    { name: 'Exp', tables: ['TMIOEXP', 'TMINOUT', 'TMINTEXP', 'TMSTPGATE'] },
  ];

  const dirtySheetData: any[] = [];

  // 解析每个Sheet的数据
  for (const sheetDef of sdcSheets) {
    const tables: any[] = [];

    for (const tableName of sheetDef.tables) {
      try {
        const tableData = await extractTableDataFromExcel(
          excelPath,
          sheetDef.name,
          tableName
        );

        if (tableData.rows.length > 0) {
          tables.push({
            tableId: tableName,
            tableName: tableName,
            data: tableData.rows, // ⭐ 只包含 rowData
          });
          console.log(`✅ 提取表格数据: ${sheetDef.name}/${tableName} (${tableData.rows.length}行)`);
        }
      } catch (error) {
        console.warn(`⚠️ 跳过表格: ${sheetDef.name}/${tableName}`, error);
      }
    }

    if (tables.length > 0) {
      dirtySheetData.push({
        sheetName: sheetDef.name,
        sheetId: sheetDef.name,
        tables: tables,
      });
    }
  }

  // 调用DataSav API保存到数据库
  if (dirtySheetData.length > 0) {
    const response = await request.post('/api/v1/sdc-thrpages/data-sav', {
      data: {
        taskId: taskId,
        dirtySheetData: dirtySheetData,
      },
    });

    const result = await response.json();

    if (result.success) {
      console.log(`✅ 测试数据已注入数据库: ${result.message}`);
      console.log(`✅ 表格结构和下拉选项保持不变`);
    } else {
      throw new Error(`注入数据失败: ${result.error}`);
    }
  } else {
    console.log(`⚠️ Excel文件中没有找到有效数据`);
  }
}

/**
 * 为UPF工具注入测试数据
 *
 * ⚠️【重要】此函数只注入单元格的实际填写值（rowData）
 *            不会改变表格的列结构（columnsSchema）和下拉选项定义
 *
 * @param taskId 任务ID
 * @param excelPath 预填充的Excel文件路径
 */
export async function injectUpfTestData(
  request: any,
  taskId: string,
  excelPath: string
): Promise<void> {
  console.log(`📂 读取Excel文件: ${excelPath}`);

  // 检查文件是否存在
  if (!fs.existsSync(excelPath)) {
    throw new Error(`Excel文件不存在: ${excelPath}`);
  }

  // UPF工具的Sheet定义
  const upfSheets = [
    { name: 'VarDef', tables: ['PMVAR', 'PMCELL'] },
    { name: 'PDomain', tables: ['PMDOMAIN', 'PMNETWORK', 'PMBOUNDARY'] },
    { name: 'PStrategy', tables: ['PMISO', 'PMLS', 'PMPSW', 'PMRET'] },
    { name: 'PMode', tables: ['PMMODE'] },
  ];

  const dirtySheetData: any[] = [];

  // 解析每个Sheet的数据
  for (const sheetDef of upfSheets) {
    const tables: any[] = [];

    for (const tableName of sheetDef.tables) {
      try {
        const tableData = await extractTableDataFromExcel(
          excelPath,
          sheetDef.name,
          tableName
        );

        if (tableData.rows.length > 0) {
          tables.push({
            tableId: tableName,
            tableName: tableName,
            data: tableData.rows, // ⭐ 只包含 rowData
          });
          console.log(`✅ 提取表格数据: ${sheetDef.name}/${tableName} (${tableData.rows.length}行)`);
        }
      } catch (error) {
        console.warn(`⚠️ 跳过表格: ${sheetDef.name}/${tableName}`, error);
      }
    }

    if (tables.length > 0) {
      dirtySheetData.push({
        sheetName: sheetDef.name,
        sheetId: sheetDef.name,
        tables: tables,
      });
    }
  }

  // 调用DataSav API保存到数据库
  if (dirtySheetData.length > 0) {
    const response = await request.post('/api/v1/upf-thrpages/data-sav', {
      data: {
        taskId: taskId,
        dirtySheetData: dirtySheetData,
      },
    });

    const result = await response.json();

    if (result.success) {
      console.log(`✅ 测试数据已注入数据库: ${result.message}`);
      console.log(`✅ 表格结构和下拉选项保持不变`);
    } else {
      throw new Error(`注入数据失败: ${result.error}`);
    }
  } else {
    console.log(`⚠️ Excel文件中没有找到有效数据`);
  }
}

/**
 * 创建测试用户数据
 */
export function createTestUserData(index: number = 1) {
  return {
    email: `test${index}@example.com`,
    password: 'Test123456!',
    username: `testuser${index}`,
  };
}

/**
 * 创建测试任务数据
 */
export function createTestTaskData(toolType: 'sdcgen' | 'upfgen') {
  const baseData = {
    description: `自动化测试任务 - ${toolType}`,
  };

  if (toolType === 'sdcgen') {
    return {
      ...baseData,
      modName: 'test_module',
      isFlat: false,
    };
  } else {
    return {
      ...baseData,
      modName: 'test_module',
    };
  }
}

/**
 * 复制测试数据文件
 */
export function copyTestDataFile(
  sourcePath: string,
  targetPath: string
): void {
  const targetDir = path.dirname(targetPath);

  // 确保目标目录存在
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // 复制文件
  fs.copyFileSync(sourcePath, targetPath);
  console.log(`✅ 复制测试数据: ${sourcePath} -> ${targetPath}`);
}

/**
 * 获取测试数据文件路径
 */
export function getTestDataPath(...segments: string[]): string {
  return path.join(process.cwd(), 'test_data', 'upload_data', ...segments);
}

/**
 * 获取E2E测试fixture路径
 */
export function getFixturePath(...segments: string[]): string {
  return path.join(process.cwd(), 'tests', 'e2e', 'fixtures', ...segments);
}
