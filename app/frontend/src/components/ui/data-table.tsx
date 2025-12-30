/**
 * 增强的数据表格组件
 * 用于SDC工具多页面交互的表格编辑
 * 支持分页、添加行、删除行等功能
 */

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';

interface Column {
  accessorKey: string;
  header: string;
  cell?: (props: { getValue: () => any; row: { index: number }; column: { id: string } }) => React.ReactNode;
}

interface DataTableProps {
  data: any[];
  columns: Column[];
  onDataChange?: (newData: any[]) => void;
  pageSize?: number; // 每页显示行数，默认50
}

export const DataTable: React.FC<DataTableProps> = ({
  data,
  columns,
  onDataChange,
  pageSize = 50
}) => {
  const [localData, setLocalData] = useState(data);
  const [currentPage, setCurrentPage] = useState(1);
  const [hoveredRowIndex, setHoveredRowIndex] = useState<number | null>(null);

  // 同步外部数据变化
  useEffect(() => {
    setLocalData(data);
  }, [data]);

  // 分页计算
  const totalPages = Math.ceil(localData.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const currentPageData = localData.slice(startIndex, endIndex);

  // 更新本地数据并通知父组件
  const updateData = (newData: any[]) => {
    setLocalData(newData);
    onDataChange?.(newData);
  };

  // 添加新行
  const addRow = () => {
    const newRow: any = {};
    columns.forEach(col => {
      newRow[col.accessorKey] = '';
    });
    const newData = [...localData, newRow];
    updateData(newData);

    // 如果新行在当前页面之外，跳转到最后一页
    const newTotalPages = Math.ceil(newData.length / pageSize);
    if (newTotalPages > currentPage) {
      setCurrentPage(newTotalPages);
    }
  };

  // 在指定位置添加新行
  const addRowAt = (index: number) => {
    const newRow: any = {};
    columns.forEach(col => {
      newRow[col.accessorKey] = '';
    });
    const newData = [...localData];
    newData.splice(index + 1, 0, newRow);
    updateData(newData);
  };

  // 删除行
  const deleteRow = (globalIndex: number) => {
    const newData = localData.filter((_, i) => i !== globalIndex);
    updateData(newData);

    // 如果删除后当前页没有数据，回到上一页
    const newTotalPages = Math.ceil(newData.length / pageSize);
    if (currentPage > newTotalPages && newTotalPages > 0) {
      setCurrentPage(newTotalPages);
    }
  };

  // 更新单元格值
  const updateCell = (globalRowIndex: number, columnKey: string, value: any) => {
    const newData = [...localData];
    newData[globalRowIndex] = {
      ...newData[globalRowIndex],
      [columnKey]: value
    };
    updateData(newData);
  };

  return (
    <div className="space-y-4">
      {/* 分页信息 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500">
            显示第 {startIndex + 1}-{Math.min(endIndex, localData.length)} 行，共 {localData.length} 行
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              第 {currentPage} 页，共 {totalPages} 页
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* 表格 */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            {/* 表头 */}
            <thead className="bg-gray-50">
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.accessorKey}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-900 border-b"
                  >
                    {column.header}
                  </th>
                ))}
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-900 border-b w-20">
                  操作
                </th>
              </tr>
            </thead>

            {/* 表体 */}
            <tbody className="divide-y divide-gray-200">
              {currentPageData.map((row, pageRowIndex) => {
                const globalRowIndex = startIndex + pageRowIndex;
                return (
                  <tr
                    key={globalRowIndex}
                    className="hover:bg-gray-50 group"
                    onMouseEnter={() => setHoveredRowIndex(globalRowIndex)}
                    onMouseLeave={() => setHoveredRowIndex(null)}
                  >
                    {columns.map((column) => (
                      <td key={column.accessorKey} className="px-4 py-3 border-b relative">
                        {column.cell ? (
                          column.cell({
                            getValue: () => row[column.accessorKey],
                            row: { index: globalRowIndex },
                            column: { id: column.accessorKey }
                          })
                        ) : (
                          <Input
                            value={row[column.accessorKey] || ''}
                            onChange={(e) => updateCell(globalRowIndex, column.accessorKey, e.target.value)}
                            className="w-full border-0 bg-transparent focus:ring-1 focus:ring-blue-500"
                          />
                        )}
                      </td>
                    ))}
                    <td className="px-4 py-3 border-b">
                      <div className="flex items-center space-x-1">
                        {/* 添加行按钮（鼠标悬浮显示） */}
                        {hoveredRowIndex === globalRowIndex && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => addRowAt(globalRowIndex)}
                            className="text-green-500 hover:text-green-700 hover:bg-green-50"
                            title="在此行后添加新行"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        )}
                        {/* 删除行按钮 */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteRow(globalRowIndex)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          title="删除此行"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {/* 空状态 */}
              {localData.length === 0 && (
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    暂无数据，点击下方按钮添加行
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 底部操作栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            variant="outline"
            size="sm"
            onClick={addRow}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            添加行
          </Button>
          <div className="text-sm text-gray-500">
            共 {localData.length} 行数据
          </div>
        </div>

        {/* 分页控制（底部） */}
        {totalPages > 1 && (
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
            >
              首页
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              上一页
            </Button>
            <span className="text-sm px-2">
              {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              下一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
            >
              末页
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
