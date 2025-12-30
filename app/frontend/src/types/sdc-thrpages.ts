/**
 * SDC工具多页面交互相关类型定义
 */

// Sheet的isDirty状态管理
export interface SheetDirtyState {
  VarDef: boolean;
  ClkDef: boolean;
  IODly: boolean;
  Exp: boolean;
}

// 总的isDirty状态
export interface GlobalDirtyState {
  isDirty: boolean; // 四个sheet的isDirty状态的逻辑或
  sheets: SheetDirtyState;
}

// 表格数据结构 - 与后端返回的数据结构保持一致
export interface TableData {
  table_id: string;
  table_name: string;
  columns: string[];
  rows: Array<{
    row_number: number;
    row_data: Record<string, any>;
    dropdown_data?: Record<string, {
      type: string;
      options: string[];
      formulae: string[];
    }>;
    validation_data?: Record<string, any>;
    data_id: string;
  }>;
}

// Sheet数据结构 - 与后端返回的数据结构保持一致
export interface SheetData {
  sheet_name: string;
  sheet_id: string;
  tables: TableData[];
}

// 数据验证结果
export interface ValidationResult {
  isConsistent: boolean;
  differences: any[];
  summary: {
    databaseRows: number;
    webRows: number;
  };
}

// API响应类型
export interface SaveDataResponse {
  success: boolean;
  message: string;
  data: {
    savedSheets: string[];
    validationResults: ValidationResult[];
  };
}

export interface CheckDataResponse {
  success: boolean;
  message: string;
  data: {
    taskId: string;
    validationResults: ValidationResult[];
  };
}

// 前端State管理
export interface SDCThrpagesState {
  taskId: string | null;
  currentSheet: string | null;
  dirtyState: GlobalDirtyState;
  sheetData: Record<string, SheetData>; // 前端State中的数据
  isLoading: boolean;
  error: string | null;
}

// 数据源类型
export type DataSource = 'database' | 'frontend-state';

// 渲染数据决策
export interface RenderDataDecision {
  source: DataSource;
  reason: string;
  shouldValidate: boolean;
}
