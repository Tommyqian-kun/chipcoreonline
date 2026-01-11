/**
 * 测试数据准备工具
 * 用于生成测试用的模拟数据
 */

import { describe, it, expect } from 'vitest';

// ============== 任务数据生成器 ==============

interface MockTask {
  id: string;
  userId: string;
  toolId: string;
  status: string;
  modName?: string;
  isFlat?: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

class TaskDataBuilder {
  private task: Partial<MockTask> = {
    status: 'pending',
    createdAt: new Date(),
  };

  withId(id: string): TaskDataBuilder {
    this.task.id = id;
    return this;
  }

  withUserId(userId: string): TaskDataBuilder {
    this.task.userId = userId;
    return this;
  }

  withToolId(toolId: string): TaskDataBuilder {
    this.task.toolId = toolId;
    return this;
  }

  withStatus(status: string): TaskDataBuilder {
    this.task.status = status;
    return this;
  }

  withModName(modName: string): TaskDataBuilder {
    this.task.modName = modName;
    return this;
  }

  withIsFlat(isFlat: boolean): TaskDataBuilder {
    this.task.isFlat = isFlat;
    return this;
  }

  build(): MockTask {
    return {
      id: this.task.id || `task-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      userId: this.task.userId || 'user-123',
      toolId: this.task.toolId || 'sdc-gen',
      status: this.task.status || 'pending',
      modName: this.task.modName,
      isFlat: this.task.isFlat,
      createdAt: this.task.createdAt || new Date(),
      updatedAt: this.task.updatedAt,
    };
  }
}

// ============== 用户数据生成器 ==============

interface MockUser {
  id: string;
  email: string;
  username: string;
  password?: string;
  isVerified: boolean;
  createdAt: Date;
}

class UserDataBuilder {
  private user: Partial<MockUser> = {
    isVerified: false,
    createdAt: new Date(),
  };

  withId(id: string): UserDataBuilder {
    this.user.id = id;
    return this;
  }

  withEmail(email: string): UserDataBuilder {
    this.user.email = email;
    return this;
  }

  withUsername(username: string): UserDataBuilder {
    this.user.username = username;
    return this;
  }

  withPassword(password: string): UserDataBuilder {
    this.user.password = password;
    return this;
  }

  withVerified(isVerified: boolean): UserDataBuilder {
    this.user.isVerified = isVerified;
    return this;
  }

  build(): MockUser {
    return {
      id: this.user.id || `user-${Date.now()}`,
      email: this.user.email || 'test@example.com',
      username: this.user.username || 'testuser',
      password: this.user.password,
      isVerified: this.user.isVerified,
      createdAt: this.user.createdAt || new Date(),
    };
  }
}

// ============== Excel数据生成器 ==============

interface MockSheetData {
  sheetName: string;
  sheetId: string;
  displayName: string;
  tables: MockTableData[];
}

interface MockTableData {
  tableId: string;
  tableName: string;
  displayName: string;
  columns: Array<{ key: string; label: string; type: string }>;
  data: Record<string, any>[];
}

class ExcelDataBuilder {
  private sheets: MockSheetData[] = [];

  addSheet(sheetData: MockSheetData): ExcelDataBuilder {
    this.sheets.push(sheetData);
    return this;
  }

  addClkDefSheet(): ExcelDataBuilder {
    this.sheets.push({
      sheetName: 'ClkDef',
      sheetId: 'ClkDef',
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
          data: [],
        },
      ],
    });
    return this;
  }

  addPortDefSheet(): ExcelDataBuilder {
    this.sheets.push({
      sheetName: 'PortDef',
      sheetId: 'PortDef',
      displayName: '端口定义',
      tables: [
        {
          tableId: 'TMPORT',
          tableName: 'TMPORT',
          displayName: '端口表',
          columns: [
            { key: 'PortName', label: '端口名称', type: 'text' },
            { key: 'PortDir', label: '端口方向', type: 'text' },
            { key: 'PortWidth', label: '端口位宽', type: 'number' },
          ],
          data: [],
        },
      ],
    });
    return this;
  }

  withTableData(tableId: string, data: Record<string, any>[]): ExcelDataBuilder {
    for (const sheet of this.sheets) {
      for (const table of sheet.tables) {
        if (table.tableId === tableId) {
          table.data = data;
          return this;
        }
      }
    }
    return this;
  }

  build(): MockSheetData[] {
    return this.sheets;
  }
}

// ============== 随机数据生成器 ==============

class RandomDataGenerator {
  private static chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  static string(length = 10): string {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += this.chars.charAt(Math.floor(Math.random() * this.chars.length));
    }
    return result;
  }

  static email(): string {
    const username = this.string(8);
    const domains = ['example.com', 'test.org', 'demo.net', 'mail.co'];
    const domain = domains[Math.floor(Math.random() * domains.length)];
    return `${username}@${domain}`;
  }

  static number(min = 0, max = 1000): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  static boolean(): boolean {
    return Math.random() < 0.5;
  }

  static date(daysAgo = 0): Date {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date;
  }

  static choice<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }

  static array<T>(generator: () => T, length: number): T[] {
    return Array.from({ length }, () => generator());
  }
}

// ============== 测试数据工厂 ==============

class TestDataFactory {
  static createTask(overrides?: Partial<MockTask>): MockTask {
    return new TaskDataBuilder()
      .withId(overrides?.id || RandomDataGenerator.string(10))
      .withUserId(overrides?.userId || 'user-123')
      .withToolId(overrides?.toolId || RandomDataGenerator.choice(['sdc-gen', 'upf-gen']))
      .withStatus(overrides?.status || RandomDataGenerator.choice(['pending', 'queued', 'running', 'completed', 'failed']))
      .build();
  }

  static createTasks(count: number, overrides?: Partial<MockTask>): MockTask[] {
    return RandomDataGenerator.array(() => this.createTask(overrides), count);
  }

  static createUser(overrides?: Partial<MockUser>): MockUser {
    return new UserDataBuilder()
      .withId(overrides?.id || RandomDataGenerator.string(10))
      .withEmail(overrides?.email || RandomDataGenerator.email())
      .withUsername(overrides?.username || RandomDataGenerator.string(8))
      .withVerified(overrides?.isVerified ?? RandomDataGenerator.boolean())
      .build();
  }

  static createUsers(count: number, overrides?: Partial<MockUser>): MockUser[] {
    return RandomDataGenerator.array(() => this.createUser(overrides), count);
  }

  static createExcelData(): MockSheetData[] {
    return new ExcelDataBuilder()
      .addClkDefSheet()
      .addPortDefSheet()
      .build();
  }
}

// ============== 测试套件 ==============

describe('TaskDataBuilder - 任务数据构建', () => {
  it('应该创建基本的任务', () => {
    const task = new TaskDataBuilder().build();

    expect(task.id).toBeDefined();
    expect(task.userId).toBe('user-123');
    expect(task.toolId).toBe('sdc-gen');
    expect(task.status).toBe('pending');
  });

  it('应该使用自定义ID', () => {
    const task = new TaskDataBuilder()
      .withId('custom-task-001')
      .build();

    expect(task.id).toBe('custom-task-001');
  });

  it('应该支持链式调用', () => {
    const task = new TaskDataBuilder()
      .withId('task-001')
      .withUserId('user-456')
      .withToolId('upf-gen')
      .withStatus('running')
      .withModName('test_module')
      .withIsFlat(true)
      .build();

    expect(task.id).toBe('task-001');
    expect(task.userId).toBe('user-456');
    expect(task.toolId).toBe('upf-gen');
    expect(task.status).toBe('running');
    expect(task.modName).toBe('test_module');
    expect(task.isFlat).toBe(true);
  });

  it('应该创建多个不同的任务', () => {
    const tasks = [
      new TaskDataBuilder().withId('task-001').build(),
      new TaskDataBuilder().withId('task-002').build(),
      new TaskDataBuilder().withId('task-003').build(),
    ];

    expect(tasks[0].id).toBe('task-001');
    expect(tasks[1].id).toBe('task-002');
    expect(tasks[2].id).toBe('task-003');
  });
});

describe('UserDataBuilder - 用户数据构建', () => {
  it('应该创建基本的用户', () => {
    const user = new UserDataBuilder().build();

    expect(user.id).toBeDefined();
    expect(user.email).toBe('test@example.com');
    expect(user.username).toBe('testuser');
    expect(user.isVerified).toBe(false);
  });

  it('应该支持链式调用', () => {
    const user = new UserDataBuilder()
      .withId('user-001')
      .withEmail('test@example.com')
      .withUsername('testuser')
      .withPassword('Password123')
      .withVerified(true)
      .build();

    expect(user.id).toBe('user-001');
    expect(user.email).toBe('test@example.com');
    expect(user.username).toBe('testuser');
    expect(user.password).toBe('Password123');
    expect(user.isVerified).toBe(true);
  });
});

describe('ExcelDataBuilder - Excel数据构建', () => {
  it('应该创建基本的Excel数据', () => {
    const excelData = new ExcelDataBuilder()
      .addClkDefSheet()
      .build();

    expect(excelData).toHaveLength(1);
    expect(excelData[0].sheetId).toBe('ClkDef');
    expect(excelData[0].tables).toHaveLength(1);
  });

  it('应该创建多页Excel数据', () => {
    const excelData = new ExcelDataBuilder()
      .addClkDefSheet()
      .addPortDefSheet()
      .build();

    expect(excelData).toHaveLength(2);
    expect(excelData[0].sheetId).toBe('ClkDef');
    expect(excelData[1].sheetId).toBe('PortDef');
  });

  it('应该为表格添加数据', () => {
    const tableData = [
      { ClkPin: 'clk', ClkName: 'sys_clk', ClkPeriod: '10' },
      { ClkPin: 'clk2', ClkName: 'clk2', ClkPeriod: '5' },
    ];

    const excelData = new ExcelDataBuilder()
      .addClkDefSheet()
      .withTableData('TMCLK', tableData)
      .build();

    const table = excelData[0].tables[0];
    expect(table.data).toEqual(tableData);
  });
});

describe('RandomDataGenerator - 随机数据生成', () => {
  it('应该生成指定长度的字符串', () => {
    const str1 = RandomDataGenerator.string(10);
    const str2 = RandomDataGenerator.string(20);

    expect(str1).toHaveLength(10);
    expect(str2).toHaveLength(20);
    expect(str1).not.toBe(str2);
  });

  it('应该生成有效的邮箱地址', () => {
    const email1 = RandomDataGenerator.email();
    const email2 = RandomDataGenerator.email();

    expect(email1).toContain('@');
    expect(email1).toContain('.');
    expect(email1).not.toBe(email2);
  });

  it('应该生成指定范围内的数字', () => {
    const num1 = RandomDataGenerator.number(1, 10);
    const num2 = RandomDataGenerator.number(100, 200);

    expect(num1).toBeGreaterThanOrEqual(1);
    expect(num1).toBeLessThanOrEqual(10);
    expect(num2).toBeGreaterThanOrEqual(100);
    expect(num2).toBeLessThanOrEqual(200);
  });

  it('应该生成随机布尔值', () => {
    const bools = Array.from({ length: 100 }, () => RandomDataGenerator.boolean());
    const trueCount = bools.filter(b => b).length;

    expect(trueCount).toBeGreaterThan(0);
    expect(trueCount).toBeLessThan(100);
  });

  it('应该从数组中随机选择', () => {
    const array = ['a', 'b', 'c', 'd', 'e'];
    const choice = RandomDataGenerator.choice(array);

    expect(array).toContain(choice);
  });

  it('应该生成随机数组', () => {
    const array = RandomDataGenerator.array(() => RandomDataGenerator.number(1, 100), 10);

    expect(array).toHaveLength(10);
    array.forEach(item => {
      expect(item).toBeGreaterThanOrEqual(1);
      expect(item).toBeLessThanOrEqual(100);
    });
  });

  it('应该生成过去的日期', () => {
    const date1 = RandomDataGenerator.date(0);
    const date7 = RandomDataGenerator.date(7);

    const now = new Date();
    const oneDay = 24 * 60 * 60 * 1000;

    expect(date1.getTime()).toBeLessThanOrEqual(now.getTime());
    expect(date7.getTime()).toBeLessThanOrEqual(now.getTime() - 7 * oneDay);
  });
});

describe('TestDataFactory - 测试数据工厂', () => {
  it('应该创建单个任务', () => {
    const task = TestDataFactory.createTask();

    expect(task.id).toBeDefined();
    expect(task.userId).toBeDefined();
    expect(task.toolId).toBeDefined();
    expect(task.status).toBeDefined();
  });

  it('应该创建多个任务', () => {
    const tasks = TestDataFactory.createTasks(10);

    expect(tasks).toHaveLength(10);
    const ids = new Set(tasks.map(t => t.id));
    expect(ids.size).toBe(10); // 所有ID都唯一
  });

  it('应该支持自定义覆盖', () => {
    const task = TestDataFactory.createTask({
      status: 'completed',
      toolId: 'upf-gen',
    });

    expect(task.status).toBe('completed');
    expect(task.toolId).toBe('upf-gen');
  });

  it('应该创建单个用户', () => {
    const user = TestDataFactory.createUser();

    expect(user.id).toBeDefined();
    expect(user.email).toBeDefined();
    expect(user.username).toBeDefined();
  });

  it('应该创建多个用户', () => {
    const users = TestDataFactory.createUsers(5);

    expect(users).toHaveLength(5);
    const emails = new Set(users.map(u => u.email));
    expect(emails.size).toBe(5); // 所有邮箱都唯一
  });

  it('应该创建Excel数据', () => {
    const excelData = TestDataFactory.createExcelData();

    expect(excelData).toHaveLength(2);
    expect(excelData[0].tables).toBeDefined();
    expect(excelData[1].tables).toBeDefined();
  });
});

// ============== 导出工厂实例 ==============

export {
  TaskDataBuilder,
  UserDataBuilder,
  ExcelDataBuilder,
  RandomDataGenerator,
  TestDataFactory,
};

export type {
  MockTask,
  MockUser,
  MockSheetData,
  MockTableData,
};
