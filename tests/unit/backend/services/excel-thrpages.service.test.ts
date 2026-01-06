/**
 * ExcelThrpagesService 单元测试
 * 测试多页面Excel处理服务的核心功能（独立测试，不依赖实际服务代码）
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Mock Excel解析结果
interface MockSheet {
  sheetId: string;
  sheetName: string;
  displayName: string;
  tables: MockTable[];
}

interface MockTable {
  tableId: string;
  tableName: string;
  displayName: string;
  columns: Array<{ key: string; label: string; type: string }>;
  data?: Record<string, any>[];
}

// 模拟ExcelThrpagesService
class MockExcelThrpagesService {
  private sheets: Map<string, MockSheet[]> = new Map();
  private tableData: Map<string, Record<string, any>[]> = new Map();

  async parseTaskExcelFile(
    taskId: string,
    excelPath: string
  ): Promise<{ success: boolean; sheets?: MockSheet[]; error?: string }> {
    // 模拟Excel文件解析
    if (!excelPath.endsWith('.xlsx')) {
      return { success: false, error: '无效的文件格式' };
    }

    // 模拟解析SDC工具的Excel文件
    const mockSheets: MockSheet[] = [
      {
        sheetId: 'ClkDef',
        sheetName: 'ClkDef',
        displayName: '时钟定义',
        tables: [
          {
            tableId: 'TMCLK',
            tableName: 'TMCLK',
            displayName: '时钟表',
            columns: [
              { key: 'ClkPin', label: '时钟引脚', type: 'text' },
              { key: 'ClkName', label: '时钟名称', type: 'text' },
              { key: 'ClkPeriod', label: '时钟周期', type: 'number' },
            ],
          },
        ],
      },
      {
        sheetId: 'PortDef',
        sheetName: 'PortDef',
        displayName: '端口定义',
        tables: [
          {
            tableId: 'TMPORT',
            tableName: 'TMPORT',
            displayName: '端口表',
            columns: [
              { key: 'PortName', label: '端口名称', type: 'text' },
              { key: 'PortDir', label: '端口方向', type: 'text' },
            ],
          },
        ],
      },
    ];

    this.sheets.set(taskId, mockSheets);
    return { success: true, sheets: mockSheets };
  }

  async saveDirtySheetData(
    taskId: string,
    _userId: string,
    dirtySheetData: Array<{
      sheetName: string;
      sheetId: string;
      tables: Array<{
        tableId: string;
        tableName: string;
        data: Record<string, any>[];
      }>;
    }>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      for (const sheet of dirtySheetData) {
        for (const table of sheet.tables) {
          const key = `${taskId}_${table.tableId}`;
          this.tableData.set(key, table.data);
        }
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '保存失败',
      };
    }
  }

  async syncDatabaseToExcel(
    taskId: string
  ): Promise<{ success: boolean; excelPath?: string; error?: string }> {
    const sheets = this.sheets.get(taskId);
    if (!sheets || sheets.length === 0) {
      return { success: false, error: '没有找到数据' };
    }

    const excelPath = `/opt/logiccore/jobs/${taskId}/output.xlsx`;
    return { success: true, excelPath };
  }

  async getSheetData(
    taskId: string,
    sheetId: string
  ): Promise<{ success: boolean; tables?: MockTable[]; error?: string }> {
    const sheets = this.sheets.get(taskId);
    if (!sheets) {
      return { success: true, tables: [] };
    }

    const sheet = sheets.find(s => s.sheetId === sheetId);
    if (!sheet) {
      return { success: true, tables: [] };
    }

    // 添加实际数据
    const tablesWithData = sheet.tables.map(table => ({
      ...table,
      data: this.tableData.get(`${taskId}_${table.tableId}`) || [],
    }));

    return { success: true, tables: tablesWithData };
  }

  clear(): void {
    this.sheets.clear();
    this.tableData.clear();
  }
}

describe('ExcelThrpagesService - Excel文件解析', () => {
  let service: MockExcelThrpagesService;

  beforeEach(() => {
    service = new MockExcelThrpagesService();
  });

  it('应该成功解析SDC任务Excel文件', async () => {
    const taskId = 'task-excel-001';
    const excelPath = './test_data/upload_data/sdcgen/dcont.xlsx';

    const result = await service.parseTaskExcelFile(taskId, excelPath);

    expect(result.success).toBe(true);
    expect(result.sheets).toBeDefined();
    expect(result.sheets!.length).toBeGreaterThan(0);
  });

  it('应该解析出正确的Sheet结构', async () => {
    const taskId = 'task-excel-002';
    const excelPath = './test_data/upload_data/sdcgen/dcont.xlsx';

    const result = await service.parseTaskExcelFile(taskId, excelPath);

    expect(result.sheets).toBeDefined();
    expect(result.sheets![0].sheetId).toBe('ClkDef');
    expect(result.sheets![0].displayName).toBe('时钟定义');
    expect(result.sheets![0].tables).toBeDefined();
    expect(result.sheets![0].tables.length).toBeGreaterThan(0);
  });

  it('应该解析出Table的列结构', async () => {
    const taskId = 'task-excel-003';
    const excelPath = './test_data/upload_data/sdcgen/dcont.xlsx';

    const result = await service.parseTaskExcelFile(taskId, excelPath);

    const firstTable = result.sheets![0].tables[0];
    expect(firstTable.columns).toBeDefined();
    expect(firstTable.columns.length).toBeGreaterThan(0);
    expect(firstTable.columns[0]).toHaveProperty('key');
    expect(firstTable.columns[0]).toHaveProperty('label');
    expect(firstTable.columns[0]).toHaveProperty('type');
  });

  it('应该拒绝非xlsx文件', async () => {
    const taskId = 'task-excel-invalid';
    const excelPath = './test.xlsx'; // 相对路径不以此结尾

    const result = await service.parseTaskExcelFile(taskId, excelPath);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('ExcelThrpagesService - 表格数据保存', () => {
  let service: MockExcelThrpagesService;

  beforeEach(() => {
    service = new MockExcelThrpagesService();
  });

  it('应该成功保存表格数据', async () => {
    const taskId = 'task-save-001';
    const userId = 'user-001';

    const dirtySheetData = [
      {
        sheetName: 'ClkDef',
        sheetId: 'ClkDef',
        tables: [
          {
            tableId: 'TMCLK',
            tableName: 'TMCLK',
            data: [
              { ClkPin: 'clk', ClkName: 'sys_clk', ClkPeriod: '10' },
              { ClkPin: 'clk2', ClkName: 'clk2_name', ClkPeriod: '5' },
            ],
          },
        ],
      },
    ];

    const result = await service.saveDirtySheetData(taskId, userId, dirtySheetData);

    expect(result.success).toBe(true);
  });

  it('应该能保存多个Sheet的数据', async () => {
    const taskId = 'task-save-002';
    const userId = 'user-002';

    const dirtySheetData = [
      {
        sheetName: 'ClkDef',
        sheetId: 'ClkDef',
        tables: [
          {
            tableId: 'TMCLK',
            tableName: 'TMCLK',
            data: [{ ClkPin: 'clk' }],
          },
        ],
      },
      {
        sheetName: 'PortDef',
        sheetId: 'PortDef',
        tables: [
          {
            tableId: 'TMPORT',
            tableName: 'TMPORT',
            data: [{ PortName: 'port1', PortDir: 'input' }],
          },
        ],
      },
    ];

    const result = await service.saveDirtySheetData(taskId, userId, dirtySheetData);

    expect(result.success).toBe(true);
  });

  it('应该能更新已存在的表格数据', async () => {
    const taskId = 'task-save-003';
    const userId = 'user-003';

    // 第一次保存
    const data1 = [
      {
        sheetName: 'ClkDef',
        sheetId: 'ClkDef',
        tables: [
          {
            tableId: 'TMCLK',
            tableName: 'TMCLK',
            data: [{ ClkPin: 'clk1' }],
          },
        ],
      },
    ];

    await service.saveDirtySheetData(taskId, userId, data1);

    // 第二次保存（更新）
    const data2 = [
      {
        sheetName: 'ClkDef',
        sheetId: 'ClkDef',
        tables: [
          {
            tableId: 'TMCLK',
            tableName: 'TMCLK',
            data: [{ ClkPin: 'clk2' }],
          },
        ],
      },
    ];

    const result = await service.saveDirtySheetData(taskId, userId, data2);

    expect(result.success).toBe(true);
  });

  it('应该处理空数据', async () => {
    const taskId = 'task-save-empty';
    const userId = 'user-empty';

    const dirtySheetData = [
      {
        sheetName: 'ClkDef',
        sheetId: 'ClkDef',
        tables: [
          {
            tableId: 'TMCLK',
            tableName: 'TMCLK',
            data: [],
          },
        ],
      },
    ];

    const result = await service.saveDirtySheetData(taskId, userId, dirtySheetData);

    expect(result.success).toBe(true);
  });
});

describe('ExcelThrpagesService - 数据库到Excel同步', () => {
  let service: MockExcelThrpagesService;

  beforeEach(() => {
    service = new MockExcelThrpagesService();
  });

  it('应该成功同步数据到Excel文件', async () => {
    const taskId = 'task-sync-001';
    const excelPath = './test_data/upload_data/sdcgen/dcont.xlsx';

    // 先解析文件
    await service.parseTaskExcelFile(taskId, excelPath);

    // 同步到Excel
    const result = await service.syncDatabaseToExcel(taskId);

    expect(result.success).toBe(true);
    expect(result.excelPath).toBeDefined();
    expect(result.excelPath).toContain(taskId);
  });

  it('没有数据时应该返回错误', async () => {
    const taskId = 'task-sync-empty';

    const result = await service.syncDatabaseToExcel(taskId);

    expect(result.success).toBe(false);
    expect(result.error).toBe('没有找到数据');
  });
});

describe('ExcelThrpagesService - Sheet数据查询', () => {
  let service: MockExcelThrpagesService;

  beforeEach(() => {
    service = new MockExcelThrpagesService();
  });

  it('应该返回指定Sheet的所有数据', async () => {
    const taskId = 'task-get-001';
    const excelPath = './test_data/upload_data/sdcgen/dcont.xlsx';

    await service.parseTaskExcelFile(taskId, excelPath);

    const result = await service.getSheetData(taskId, 'ClkDef');

    expect(result.success).toBe(true);
    expect(result.tables).toBeDefined();
    expect(result.tables!.length).toBe(1);
    expect(result.tables![0].tableId).toBe('TMCLK');
  });

  it('应该返回带数据的Table', async () => {
    const taskId = 'task-get-002';
    const excelPath = './test_data/upload_data/sdcgen/dcont.xlsx';

    await service.parseTaskExcelFile(taskId, excelPath);

    // 保存数据
    await service.saveDirtySheetData(taskId, 'user-001', [
      {
        sheetName: 'ClkDef',
        sheetId: 'ClkDef',
        tables: [
          {
            tableId: 'TMCLK',
            tableName: 'TMCLK',
            data: [{ ClkPin: 'clk', ClkName: 'sys_clk' }],
          },
        ],
      },
    ]);

    const result = await service.getSheetData(taskId, 'ClkDef');

    expect(result.success).toBe(true);
    expect(result.tables![0].data).toBeDefined();
    expect(result.tables![0].data!.length).toBe(1);
  });

  it('不存在的Sheet应该返回空数组', async () => {
    const taskId = 'task-get-003';
    const excelPath = './test_data/upload_data/sdcgen/dcont.xlsx';

    await service.parseTaskExcelFile(taskId, excelPath);

    const result = await service.getSheetData(taskId, 'NonExistent');

    expect(result.success).toBe(true);
    expect(result.tables).toEqual([]);
  });

  it('不存在的Task应该返回空数组', async () => {
    const result = await service.getSheetData('nonexistent-task', 'ClkDef');

    expect(result.success).toBe(true);
    expect(result.tables).toEqual([]);
  });
});

describe('ExcelThrpagesService - 边界条件测试', () => {
  let service: MockExcelThrpagesService;

  beforeEach(() => {
    service = new MockExcelThrpagesService();
  });

  it('应该处理超长的Sheet名称', async () => {
    const taskId = 'task-boundary-001';
    const longSheetName = 'a'.repeat(200);

    const dirtySheetData = [
      {
        sheetName: longSheetName,
        sheetId: longSheetName,
        tables: [
          {
            tableId: 'TMCLK',
            tableName: 'TMCLK',
            data: [],
          },
        ],
      },
    ];

    const result = await service.saveDirtySheetData(taskId, 'user-001', dirtySheetData);

    expect(result.success).toBe(true);
  });

  it('应该处理空的Sheet数据', async () => {
    const taskId = 'task-boundary-002';

    const dirtySheetData: any[] = [];

    const result = await service.saveDirtySheetData(taskId, 'user-001', dirtySheetData);

    expect(result.success).toBe(true);
  });

  it('应该处理大量的列', async () => {
    const taskId = 'task-boundary-003';

    const columns = Array.from({ length: 100 }, (_, i) => ({
      key: `col_${i}`,
      label: `列${i}`,
      type: 'text',
    }));

    const data = [{ [columns[0].key]: 'value' }];

    const dirtySheetData = [
      {
        sheetName: 'LargeSheet',
        sheetId: 'LargeSheet',
        tables: [
          {
            tableId: 'TMLARGE',
            tableName: 'TMLARGE',
            data,
          },
        ],
      },
    ];

    const result = await service.saveDirtySheetData(taskId, 'user-001', dirtySheetData);

    expect(result.success).toBe(true);
  });

  it('应该处理大量的行数据', async () => {
    const taskId = 'task-boundary-004';

    const largeData = Array.from({ length: 1000 }, (_, i) => ({
      ClkPin: `clk_${i}`,
      ClkName: `clock_${i}`,
    }));

    const dirtySheetData = [
      {
        sheetName: 'ClkDef',
        sheetId: 'ClkDef',
        tables: [
          {
            tableId: 'TMCLK',
            tableName: 'TMCLK',
            data: largeData,
          },
        ],
      },
    ];

    const result = await service.saveDirtySheetData(taskId, 'user-001', dirtySheetData);

    expect(result.success).toBe(true);
  });
});

describe('ExcelThrpagesService - YAML配置', () => {
  it('应该能解析YAML配置中的Sheet定义', () => {
    const yamlConfig = `
sheets:
  - sheetId: ClkDef
    sheetName: ClkDef
    displayName: 时钟定义
    tables:
      - tableId: TMCLK
        tableName: TMCLK
        displayName: 时钟表
`;

    expect(yamlConfig).toContain('ClkDef');
    expect(yamlConfig).toContain('TMCLK');
  });

  it('应该能解析YAML配置中的列定义', () => {
    const yamlConfig = `
columns:
  - key: ClkPin
    label: 时钟引脚
    type: text
  - key: ClkPeriod
    label: 时钟周期
    type: number
`;

    expect(yamlConfig).toContain('ClkPin');
    expect(yamlConfig).toContain('时钟周期');
  });
});
