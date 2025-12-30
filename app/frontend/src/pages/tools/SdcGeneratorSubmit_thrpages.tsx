/**
 * SDC工具多页面交互 - 提交页面
 * 左侧sheet按钮，右侧表格数据展示和编辑
 * 复用SdcGeneratorPage.tsx的布局风格，实现左右分栏设计
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ChevronLeft, ChevronRight, Plus, Minus } from 'lucide-react';
import { motion } from 'framer-motion';
import { useToast } from '@/hooks/use-toast';
import { ToolPageTaskHistoryButton } from '@/components/shared/TaskHistoryButton';
import { SheetDirtyState, SheetData } from '@/types/sdc-thrpages';
import { usePreventBackNavigation } from '@/hooks/usePreventBackNavigation';

// Sheet名称常量
const SHEET_NAMES = ['VarDef', 'ClkDef', 'IODly', 'Exp'] as const;
type SheetName = typeof SHEET_NAMES[number];



const SdcGeneratorSubmitThrpages: React.FC = () => {
    const { taskId, sheetName } = useParams<{ taskId: string; sheetName?: string }>();
    const navigate = useNavigate();
    const { toast } = useToast();

    // 防止浏览器返回导航，确保单向流程
    usePreventBackNavigation();

    // 状态管理 - 从URL参数获取当前sheet，默认为VarDef
    const [selectedSheet, setSelectedSheet] = useState<SheetName>(
        (sheetName && SHEET_NAMES.includes(sheetName as SheetName))
            ? (sheetName as SheetName)
            : 'VarDef'
    );
    const [loading, setLoading] = useState(false);
    const [taskStatus, setTaskStatus] = useState({ status: 'IDLE', currentStep: '' });

    // 数据库原始数据管理
    const [sheetDbData, setSheetDbData] = useState<Record<SheetName, SheetData | null>>({
        VarDef: null,
        ClkDef: null,
        IODly: null,
        Exp: null
    });

    // 每个sheet的前端State数据管理（用户修改的数据）
    const [sheetStateData, setSheetStateData] = useState<Record<SheetName, SheetData | null>>({
        VarDef: null,
        ClkDef: null,
        IODly: null,
        Exp: null
    });

    // isDirty状态管理 - 四个sheet各自的isDirty状态
    const [sheetDirtyState, setSheetDirtyState] = useState<SheetDirtyState>({
        VarDef: false,
        ClkDef: false,
        IODly: false,
        Exp: false
    });

    // 当前显示的sheet数据（根据isDirty状态决定来源）
    const currentSheetData = sheetDirtyState[selectedSheet]
        ? sheetStateData[selectedSheet]  // isDirty=true: 使用前端State数据
        : sheetDbData[selectedSheet];    // isDirty=false: 使用数据库数据

    // 调试信息 - 简化版本
    console.log('🔍 [DEBUG] 当前数据状态:', {
        selectedSheet,
        isDirty: sheetDirtyState[selectedSheet],
        hasDbData: !!sheetDbData[selectedSheet],
        hasStateData: !!sheetStateData[selectedSheet],
        hasCurrentData: !!currentSheetData,
        tablesCount: currentSheetData?.tables?.length || 0
    });

    // 总的isDirty状态（四个sheet的逻辑或）
    const globalIsDirty = sheetDirtyState.VarDef || sheetDirtyState.ClkDef ||
                         sheetDirtyState.IODly || sheetDirtyState.Exp;

    // DataChk按钮状态：none（未检查）、checking（检查中）、success（检查通过）、failed（检查失败）
    const [checkStatus, setCheckStatus] = useState<'none' | 'checking' | 'success' | 'failed'>('none');

    // 检查报告弹窗状态
    const [checkReportDialog, setCheckReportDialog] = useState<{
        open: boolean;
        content: string;
    }>({ open: false, content: '' });



    // 页面初始化状态
    const [isInitialized, setIsInitialized] = useState(false);

    // 分页状态管理（只对VarDef、ClkDef、IODly应用）
    const [currentPage, setCurrentPage] = useState<Record<string, number>>({});
    const ROWS_PER_PAGE = 50;
    const SHEETS_WITH_PAGINATION = ['VarDef', 'ClkDef', 'IODly'];

    // 悬浮状态管理（用于显示添加行按钮）
    const [hoveredTableInfo, setHoveredTableInfo] = useState<{
        tableIndex: number;
        rowIndex: number;
        leftButtonPos: { x: number; y: number };
        rightButtonPos: { x: number; y: number };
    } | null>(null);

    // 悬浮定时器管理
    const [hoverTimer, setHoverTimer] = useState<NodeJS.Timeout | null>(null);

    // 最后一次悬停的行信息（用于重新显示按钮）
    const [lastHoveredRowInfo, setLastHoveredRowInfo] = useState<{
        tableIndex: number;
        rowIndex: number;
        leftButtonPos: { x: number; y: number };
        rightButtonPos: { x: number; y: number };
    } | null>(null);

    // 单元格选择状态管理
    const [selectedCells, setSelectedCells] = useState<{
        sheetName: string;
        tableIndex: number;
        cells: { rowIndex: number; colIndex: number }[];
        isSelecting: boolean;
        selectionStart: { rowIndex: number; colIndex: number } | null;
        isDragging: boolean;
        dragStart: { rowIndex: number; colIndex: number } | null;
    }>({
        sheetName: '',
        tableIndex: -1,
        cells: [],
        isSelecting: false,
        selectionStart: null,
        isDragging: false,
        dragStart: null
    });

    // 统一的列双击处理函数
    const handleColumnDoubleClick = (e: React.MouseEvent, colIndex: number, columnName: string, rowsData: any[]) => {
        e.preventDefault();

        // 获取DOM表格和当前列元素
        const table = e.currentTarget.closest('table') as HTMLTableElement;
        const headerCell = table.querySelector(`thead th:nth-child(${colIndex + 1})`) as HTMLElement;

        if (!headerCell) return;

        const currentWidth = headerCell.offsetWidth;
        const MIN_WIDTH = 80;

        // 计算当前列所有单元格的最大内容宽度
        let maxContentWidth = MIN_WIDTH;

        // 1. 检查表头内容宽度
        const headerText = headerCell.textContent || '';
        const headerWidth = headerText.length * 8 + 24;
        maxContentWidth = Math.max(maxContentWidth, headerWidth);

        // 2. 检查所有数据行的内容宽度
        rowsData.forEach((rowData: any) => {
            if (rowData && rowData.row_data && rowData.row_data[columnName] !== undefined) {
                const cellValue = String(rowData.row_data[columnName] || '');
                const cellWidth = cellValue.length * 8 + 24;
                maxContentWidth = Math.max(maxContentWidth, cellWidth);
            }
        });

        // 3. 限制最大宽度
        maxContentWidth = Math.min(maxContentWidth, 300);

        // 4. 在最小宽度和内容最佳宽度之间切换
        let targetWidth;
        if (Math.abs(currentWidth - MIN_WIDTH) < 5) {
            // 当前是最小宽度，切换到内容最佳宽度
            targetWidth = maxContentWidth;
        } else {
            // 当前不是最小宽度，切换到最小宽度
            targetWidth = MIN_WIDTH;
        }

        // 5. 应用新宽度
        const widthDelta = targetWidth - currentWidth;

        // 应用到表头
        headerCell.style.width = `${targetWidth}px`;

        // 应用到所有数据行
        const allRows = Array.from(table.querySelectorAll('tbody tr')) as HTMLElement[];
        allRows.forEach(row => {
            const cells = Array.from(row.querySelectorAll('td')) as HTMLElement[];
            if (cells[colIndex]) {
                cells[colIndex].style.width = `${targetWidth}px`;
            }
        });

        // 调整表格总宽度
        const currentTableWidth = table.offsetWidth;
        const newTableWidth = currentTableWidth + widthDelta;
        const containerWidth = table.parentElement?.offsetWidth || 0;
        table.style.width = `${Math.max(newTableWidth, containerWidth)}px`;
    };

    // 统一的行双击处理函数
    const handleRowDoubleClick = (e: React.MouseEvent, rowIndex: number, rowData: any, tableData: any) => {
        e.preventDefault();

        // 获取DOM表格和当前行元素
        const table = e.currentTarget.closest('table') as HTMLTableElement;
        const currentRow = table.querySelector(`tbody tr:nth-child(${rowIndex + 1})`) as HTMLElement;

        if (!currentRow) return;

        const currentHeight = currentRow.offsetHeight;
        const MIN_HEIGHT = 40; // 最小行高

        // 计算当前行所有单元格的最大内容高度
        let maxContentHeight = MIN_HEIGHT;

        // 检查当前行所有单元格的内容高度
        if (rowData && rowData.row_data && tableData.columns) {
            tableData.columns.forEach((columnName: string) => {
                if (rowData.row_data[columnName] !== undefined) {
                    const cellValue = String(rowData.row_data[columnName] || '');
                    // 估算内容高度：每40个字符换行，每行约20px高度，加上padding
                    const lines = Math.ceil(cellValue.length / 40);
                    const cellHeight = lines * 20 + 16; // 20px per line + 16px padding
                    maxContentHeight = Math.max(maxContentHeight, cellHeight);
                }
            });
        }

        // 限制最大高度
        maxContentHeight = Math.min(maxContentHeight, 200);

        // 在最小高度和内容最佳高度之间切换
        let targetHeight;
        if (Math.abs(currentHeight - MIN_HEIGHT) < 5) {
            // 当前是最小高度，切换到内容最佳高度
            targetHeight = maxContentHeight;
        } else {
            // 当前不是最小高度，切换到最小高度
            targetHeight = MIN_HEIGHT;
        }

        // 应用新高度到当前行
        currentRow.style.height = `${targetHeight}px`;

        // 确保所有单元格也应用相同高度
        const cells = Array.from(currentRow.querySelectorAll('td')) as HTMLElement[];
        cells.forEach(cell => {
            cell.style.height = `${targetHeight}px`;
        });
    };

    // 全局点击事件：隐藏所有下拉列表
    useEffect(() => {
        const handleGlobalClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            // 如果点击的不是下拉相关元素，隐藏所有下拉
            if (!target.closest('.dropdown-container') && !target.closest('input[type="text"]')) {
                const allDropdowns = document.querySelectorAll('[id^="dropdown-"]');
                allDropdowns.forEach(dropdown => {
                    (dropdown as HTMLElement).style.display = 'none';
                });
            }
        };

        document.addEventListener('click', handleGlobalClick);
        return () => document.removeEventListener('click', handleGlobalClick);
    }, []);

    // 监听URL参数变化，同步selectedSheet状态
    useEffect(() => {
        if (sheetName && SHEET_NAMES.includes(sheetName as SheetName)) {
            const targetSheet = sheetName as SheetName;
            if (targetSheet !== selectedSheet) {
                setSelectedSheet(targetSheet);
            }
        }
    }, [sheetName]);

    // 初始化时选择对应的sheet
    useEffect(() => {
        const initializePage = async () => {
            if (taskId && !isInitialized) {
                console.log('🚀 [INIT] 开始页面初始化');
                setIsInitialized(true);
                // 使用URL参数中的sheet，如果没有则默认为VarDef
                const initialSheet = (sheetName && SHEET_NAMES.includes(sheetName as SheetName))
                    ? (sheetName as SheetName)
                    : 'VarDef';
                await handleSheetClick(initialSheet);
                console.log('✅ [INIT] 页面初始化完成');
            }
        };
        initializePage();
    }, [taskId, isInitialized]);

    // 数据交互验证函数（完整验证，确保数据一致性）
    const performDataValidation = async (sheetName: SheetName, dbData: SheetData) => {
        try {
            const startTime = performance.now();
            console.log(`🔍 [VALIDATION] 开始验证 ${sheetName} 数据一致性`);

            // 1. 验证数据库数据与网页端数据的一致性（完整验证）
            const webData = sheetStateData[sheetName];
            if (webData) {
                const isConsistent = validateDataConsistency(dbData, webData);
                const endTime = performance.now();
                console.log(`📊 [VALIDATION] 数据库 ↔ 网页端数据一致性:`, isConsistent ? '✅ 一致' : '❌ 不一致', `(${(endTime - startTime).toFixed(2)}ms)`);

                if (!isConsistent) {
                    console.warn(`⚠️ [VALIDATION] ${sheetName} 数据不一致，需要检查数据同步`);
                }
            } else {
                console.log(`📊 [VALIDATION] 无前端State数据，跳过对比验证`);
            }

            // 2. 验证Excel数据与数据库数据的一致性（如果有Excel数据）
            // TODO: 实现Excel数据验证逻辑
            console.log(`📋 [VALIDATION] Excel ↔ 数据库数据验证: 待实现`);

        } catch (error) {
            console.error(`❌ [VALIDATION] ${sheetName} 数据验证失败:`, error);
        }
    };



    // 完整数据一致性验证（仅在需要时使用）
    const validateDataConsistency = (data1: SheetData, data2: SheetData): boolean => {
        try {
            // 比较表格数量
            if (data1.tables.length !== data2.tables.length) {
                console.warn('⚠️ [VALIDATION] 表格数量不一致');
                return false;
            }

            // 比较每个表格的结构和数据
            for (let i = 0; i < data1.tables.length; i++) {
                const table1 = data1.tables[i];
                const table2 = data2.tables[i];

                // 比较表格名称
                if (table1.table_name !== table2.table_name) {
                    console.warn(`⚠️ [VALIDATION] 表格${i}名称不一致:`, table1.table_name, 'vs', table2.table_name);
                    return false;
                }

                // 比较列数量
                if (table1.columns.length !== table2.columns.length) {
                    console.warn(`⚠️ [VALIDATION] 表格${i}列数量不一致`);
                    return false;
                }

                // 比较行数量
                if (table1.rows.length !== table2.rows.length) {
                    console.warn(`⚠️ [VALIDATION] 表格${i}行数量不一致`);
                    return false;
                }
            }

            return true;
        } catch (error) {
            console.error('❌ [VALIDATION] 数据一致性验证出错:', error);
            return false;
        }
    };

    // 处理sheet按钮点击 - 根据isDirty状态决定数据来源
    const handleSheetClick = async (sheetName: SheetName) => {
        console.log(`🔄 [SHEET-CLICK] 点击sheet按钮:`, {
            sheetName,
            currentIsDirty: sheetDirtyState[sheetName],
            hasStateData: !!sheetStateData[sheetName]
        });

        // 更新URL路由
        navigate(`/tools/sdc-generator/task/${taskId}/${sheetName}`, { replace: true });

        // 根据isDirty状态决定数据来源
        if (sheetDirtyState[sheetName]) {
            // isDirty=true: 该sheet有未保存的更改，使用前端State数据
            console.log(`📋 [SHEET-CLICK] 使用前端State数据 (isDirty=true):`, sheetName);
            // 数据已经在sheetStateData中，直接切换
            setSelectedSheet(sheetName);
        } else {
            // isDirty=false: 该sheet无未保存更改，从数据库加载数据
            console.log(`📋 [SHEET-CLICK] 从数据库加载数据 (isDirty=false):`, sheetName);
            // 先加载数据，再切换sheet，确保数据加载完成后再渲染
            await loadSheetDataFromDatabase(sheetName);
            setSelectedSheet(sheetName);
        }
    };

    // 从数据库加载sheet数据
    const loadSheetDataFromDatabase = async (sheetName: SheetName) => {
        const totalStartTime = performance.now();
        console.log(`🔄 [DB-LOAD] 从数据库加载sheet数据:`, { taskId, sheetName });
        setLoading(true);
        try {
            const url = `/api/v1/sdc-thrpages/${taskId}/sheet/${sheetName}`;
            console.log(`📡 [DB-LOAD] 请求URL:`, url);

            // 网络请求性能监控
            const networkStartTime = performance.now();
            const response = await fetch(url, {
                credentials: 'include'
            });
            const networkEndTime = performance.now();

            console.log(`📡 [DB-LOAD] 响应状态:`, response.status, response.statusText, `网络耗时: ${(networkEndTime - networkStartTime).toFixed(2)}ms`);

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`❌ [DB-LOAD] 请求失败:`, { status: response.status, statusText: response.statusText, errorText });
                throw new Error(`获取sheet数据失败: ${response.status} ${response.statusText}`);
            }

            // JSON解析性能监控
            const parseStartTime = performance.now();
            const result = await response.json();
            const parseEndTime = performance.now();

            console.log(`✅ [DB-LOAD] 数据加载成功:`, {
                sheetName,
                parseTime: `${(parseEndTime - parseStartTime).toFixed(2)}ms`,
                dataStructure: {
                    sheet_name: result.data?.sheet_name,
                    tablesCount: result.data?.tables?.length,
                    tables: result.data?.tables?.map((t: any) => ({
                        name: t.table_name,
                        rowsCount: t.rows?.length,
                        columnsCount: t.columns?.length,
                        hasDropdownData: t.rows?.some((r: any) => r.dropdown_data) || false
                    }))
                }
            });

            // 验证数据结构
            if (!result.data || !result.data.tables || !Array.isArray(result.data.tables)) {
                console.error(`❌ [DB-LOAD] 数据结构无效:`, result);
                throw new Error('返回的数据结构无效');
            }

            // State更新性能监控
            const stateUpdateStartTime = performance.now();

            // 更新对应sheet的数据库数据
            setSheetDbData(prev => ({
                ...prev,
                [sheetName]: result.data
            }));

            // 如果该sheet还没有前端State数据，也初始化前端State数据
            setSheetStateData(prev => ({
                ...prev,
                [sheetName]: prev[sheetName] || result.data
            }));

            const stateUpdateEndTime = performance.now();
            console.log(`📊 [DB-LOAD] State更新耗时: ${(stateUpdateEndTime - stateUpdateStartTime).toFixed(2)}ms`);

            // 进行数据交互验证（必须执行，确保数据一致性）
            console.log(`🔍 [DATA-VALIDATION] 进行数据库 ↔ 网页端数据验证:`, sheetName);
            const validationStartTime = performance.now();
            await performDataValidation(sheetName, result.data);
            const validationEndTime = performance.now();
            console.log(`📊 [DATA-VALIDATION] 验证耗时: ${(validationEndTime - validationStartTime).toFixed(2)}ms`);

        } catch (error) {
            console.error('❌ [DB-LOAD] 加载sheet数据失败:', error);
            toast({
                title: "加载失败",
                description: `无法加载${sheetName}数据: ${error instanceof Error ? error.message : '未知错误'}`,
                variant: "destructive",
            });
        } finally {
            const totalEndTime = performance.now();
            console.log(`📊 [DB-LOAD] 总耗时: ${(totalEndTime - totalStartTime).toFixed(2)}ms`);
            setLoading(false);
        }
    };

    // 处理表格数据变化
    const handleTableDataChange = (tableIndex: number, rowIndex: number, columnKey: string, value: any) => {
        const currentData = currentSheetData;
        if (!currentData || !currentData.tables || !currentData.tables[tableIndex] || !currentData.tables[tableIndex].rows) {
            console.error('❌ [TABLE-CHANGE] 数据结构无效:', { currentData, tableIndex });
            return;
        }

        // 更新表格数据 - 注意新的数据结构
        const updatedSheetData = { ...currentData };
        const sortedRows = updatedSheetData.tables[tableIndex].rows.sort((a, b) => (a?.row_number || 0) - (b?.row_number || 0));

        // 确保我们更新的是正确的行（按排序后的索引）
        if (sortedRows[rowIndex]) {
            sortedRows[rowIndex] = {
                ...sortedRows[rowIndex],
                row_data: {
                    ...sortedRows[rowIndex].row_data,
                    [columnKey]: value
                },
                // 保持原有的下拉数据和验证数据不变
                dropdown_data: sortedRows[rowIndex].dropdown_data,
                validation_data: sortedRows[rowIndex].validation_data
            };
        }

        // 更新对应sheet的State数据
        setSheetStateData(prev => ({
            ...prev,
            [selectedSheet]: updatedSheetData
        }));

        // 设置当前sheet为dirty状态
        setSheetDirtyState(prev => ({
            ...prev,
            [selectedSheet]: true
        }));

        // 重置检查状态
        setCheckStatus('none');
    };

    // 添加全局事件监听器
    useEffect(() => {
        const handleMouseUp = () => {
            // 结束拖拽选择
            setSelectedCells(prev => ({
                ...prev,
                isDragging: false,
                dragStart: null
            }));
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            // Delete键删除选中单元格内容（仅当前表格）
            if (e.key === 'Delete' && selectedCells.cells.length > 0 && selectedCells.tableIndex >= 0 && selectedCells.sheetName === selectedSheet) {
                e.preventDefault();

                const tableIndex = selectedCells.tableIndex;

                // 验证表格索引有效性
                if (tableIndex >= 0 && currentSheetData?.tables?.[tableIndex]) {
                    const table = currentSheetData.tables[tableIndex];
                    const sortedRows = table.rows
                        .filter((row: any) => row != null)
                        .sort((a: any, b: any) => (a?.row_number || 0) - (b?.row_number || 0));

                    // 清空选中单元格的内容
                    selectedCells.cells.forEach(cell => {
                        const { rowIndex, colIndex } = cell;

                        if (sortedRows[rowIndex] && table.columns?.[colIndex]) {
                            const columnName = table.columns[colIndex];
                            handleTableDataChange(tableIndex, rowIndex, columnName, '');
                        }
                    });

                    console.log(`🗑️ [DELETE-CELLS] 在表格${tableIndex}中删除了 ${selectedCells.cells.length} 个单元格的内容`);
                }
            }
        };

        const handleMouseMove = (e: MouseEvent) => {
            // 检测鼠标是否在按钮区域内，如果是则重新显示按钮
            if (!hoveredTableInfo && lastHoveredRowInfo) {
                const mouseX = e.clientX;
                const mouseY = e.clientY;

                // 检查是否在左侧按钮区域（+按钮）
                const leftButtonArea = {
                    x: lastHoveredRowInfo.leftButtonPos.x - 20,
                    y: lastHoveredRowInfo.leftButtonPos.y - 20,
                    width: 40,
                    height: 40
                };

                // 检查是否在右侧按钮区域（-按钮）
                const rightButtonArea = {
                    x: lastHoveredRowInfo.rightButtonPos.x - 20,
                    y: lastHoveredRowInfo.rightButtonPos.y - 20,
                    width: 40,
                    height: 40
                };

                const inLeftArea = mouseX >= leftButtonArea.x && mouseX <= leftButtonArea.x + leftButtonArea.width &&
                                  mouseY >= leftButtonArea.y && mouseY <= leftButtonArea.y + leftButtonArea.height;

                const inRightArea = mouseX >= rightButtonArea.x && mouseX <= rightButtonArea.x + rightButtonArea.width &&
                                   mouseY >= rightButtonArea.y && mouseY <= rightButtonArea.y + rightButtonArea.height;

                if (inLeftArea || inRightArea) {
                    // 重新显示按钮
                    setHoveredTableInfo(lastHoveredRowInfo);
                    console.log('🔄 [BUTTON-RESHOW] 鼠标进入按钮区域，重新显示按钮');
                }
            }
        };

        document.addEventListener('mouseup', handleMouseUp);
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('mousemove', handleMouseMove);

        return () => {
            document.removeEventListener('mouseup', handleMouseUp);
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('mousemove', handleMouseMove);
        };
    }, [selectedCells, currentSheetData, hoveredTableInfo, lastHoveredRowInfo]);

    // 添加新行
    const handleAddRow = (tableIndex: number, afterRowIndex: number) => {
        console.log(`➕ [ADD-ROW] 添加新行:`, { tableIndex, afterRowIndex });

        const currentData = currentSheetData;
        if (!currentData || !currentData.tables || !currentData.tables[tableIndex]) {
            console.error('❌ [ADD-ROW] 数据结构无效:', { currentData, tableIndex });
            return;
        }

        // 创建新的sheet数据副本
        const updatedSheetData = JSON.parse(JSON.stringify(currentData));
        const table = updatedSheetData.tables[tableIndex];

        // 对行进行排序，确保与显示顺序一致
        const sortedRows = table.rows
            .filter((row: any) => row != null)
            .sort((a: any, b: any) => (a?.row_number || 0) - (b?.row_number || 0));

        // 创建新行数据
        const newRowNumber = sortedRows.length + 1;

        // 获取下拉数据模板（除VarDef外的sheet需要复制下拉数据）
        let dropdownDataTemplate = {};
        let validationDataTemplate = {};

        if (selectedSheet !== 'VarDef' && sortedRows.length > 0) {
            // 从现有行中找到有下拉数据的行作为模板
            const templateRow = sortedRows.find((row: any) => row.dropdown_data && Object.keys(row.dropdown_data).length > 0);
            if (templateRow) {
                dropdownDataTemplate = JSON.parse(JSON.stringify(templateRow.dropdown_data));
                validationDataTemplate = JSON.parse(JSON.stringify(templateRow.validation_data || {}));
                console.log(`📋 [ADD-ROW] 复制下拉数据模板 (${selectedSheet}):`, {
                    dropdownColumns: Object.keys(dropdownDataTemplate),
                    templateRowNumber: templateRow.row_number
                });
            }
        }

        const newRow: any = {
            row_number: newRowNumber,
            row_data: {},
            dropdown_data: dropdownDataTemplate,
            validation_data: validationDataTemplate,
            data_id: `new_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
        };

        // 初始化新行的所有列为空字符串
        if (table.columns && Array.isArray(table.columns)) {
            table.columns.forEach((column: string) => {
                newRow.row_data[column] = '';
            });
        }

        // 在排序后的数组中指定位置后插入新行
        sortedRows.splice(afterRowIndex + 1, 0, newRow);

        // 重新编号所有行
        for (let i = 0; i < sortedRows.length; i++) {
            sortedRows[i].row_number = i + 1;
        }

        // 将排序后的数组重新赋值给table.rows
        table.rows = sortedRows;

        // 更新对应sheet的State数据
        setSheetStateData(prev => ({
            ...prev,
            [selectedSheet]: updatedSheetData
        }));

        // 设置当前sheet为dirty状态
        setSheetDirtyState(prev => ({
            ...prev,
            [selectedSheet]: true
        }));

        // 重置检查状态
        setCheckStatus('none');

        console.log(`✅ [ADD-ROW] 新行添加完成:`, {
            tableIndex,
            afterRowIndex,
            newRowNumber,
            totalRowsAfter: sortedRows.length,
            hasDropdownData: Object.keys(dropdownDataTemplate).length > 0
        });
    };

    // 删除行
    const handleDeleteRow = (tableIndex: number, rowIndex: number) => {
        console.log(`🗑️ [DELETE-ROW] 删除行:`, { tableIndex, rowIndex });

        const currentData = currentSheetData;
        if (!currentData || !currentData.tables || !currentData.tables[tableIndex]) {
            console.error('❌ [DELETE-ROW] 数据结构无效:', { currentData, tableIndex });
            return;
        }

        // 创建新的sheet数据副本
        const updatedSheetData = JSON.parse(JSON.stringify(currentData));
        const table = updatedSheetData.tables[tableIndex];

        // 对行进行排序，确保与显示顺序一致
        const sortedRows = table.rows
            .filter((row: any) => row != null)
            .sort((a: any, b: any) => (a?.row_number || 0) - (b?.row_number || 0));

        // 检查是否至少保留一行
        if (sortedRows.length <= 1) {
            console.warn('⚠️ [DELETE-ROW] 无法删除最后一行');
            return;
        }

        // 删除指定行
        sortedRows.splice(rowIndex, 1);

        // 重新编号所有行
        for (let i = 0; i < sortedRows.length; i++) {
            sortedRows[i].row_number = i + 1;
        }

        // 将排序后的数组重新赋值给table.rows
        table.rows = sortedRows;

        // 更新对应sheet的State数据
        setSheetStateData(prev => ({
            ...prev,
            [selectedSheet]: updatedSheetData
        }));

        // 设置当前sheet为dirty状态
        setSheetDirtyState(prev => ({
            ...prev,
            [selectedSheet]: true
        }));

        // 重置检查状态
        setCheckStatus('none');

        console.log(`✅ [DELETE-ROW] 行删除完成:`, {
            tableIndex,
            deletedRowIndex: rowIndex,
            totalRowsAfter: sortedRows.length
        });
    };

    // DataSav按钮处理函数 - 保存所有isDirty=true的sheet数据到数据库
    const handleDataSav = async () => {
        console.log(`💾 [DATA-SAV] 开始保存数据:`, { taskId, globalIsDirty, sheetDirtyState });

        if (!taskId || !globalIsDirty) {
            console.warn(`⚠️ [DATA-SAV] 保存条件不满足:`, { taskId: !!taskId, globalIsDirty });
            return;
        }

        setLoading(true);
        try {
            // 构建需要保存的dirty sheet数据 - 保存所有isDirty=true的sheet
            const dirtySheetData = [];

            // 遍历所有sheet，找出isDirty=true的sheet
            for (const sheetName of ['VarDef', 'ClkDef', 'IODly', 'Exp'] as SheetName[]) {
                if (sheetDirtyState[sheetName] && sheetStateData[sheetName]) {
                    console.log(`📋 [DATA-SAV] 准备保存sheet:`, sheetName);
                    dirtySheetData.push({
                        sheetName: sheetName,
                        sheetId: `${taskId}_${sheetName}`,
                        tables: sheetStateData[sheetName]!.tables.map((table: any, index: number) => ({
                            tableId: `${taskId}_${sheetName}_${index}`,
                            tableName: table.table_name, // 修正字段名为tableName
                            data: table.rows // 修正字段名为data
                        }))
                    });
                }
            }

            console.log(`💾 [DATA-SAV] 将保存${dirtySheetData.length}个dirty sheet:`, dirtySheetData.map(s => s.sheetName));
            console.log(`📋 [DATA-SAV] 发送的数据结构:`, JSON.stringify(dirtySheetData, null, 2));

            const response = await fetch(`/api/v1/sdc-thrpages/data-sav`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    taskId,
                    dirtySheetData
                }),
            });

            const result = await response.json();
            console.log(`📡 [DATA-SAV] 服务器响应:`, { status: response.status, result });

            if (response.ok && result.success) {
                // 保存成功，更新数据库数据状态为最新保存的数据
                for (const sheetName of ['VarDef', 'ClkDef', 'IODly', 'Exp'] as SheetName[]) {
                    if (sheetDirtyState[sheetName] && sheetStateData[sheetName]) {
                        setSheetDbData(prev => ({
                            ...prev,
                            [sheetName]: sheetStateData[sheetName]
                        }));
                    }
                }

                // 重置所有isDirty状态
                setSheetDirtyState({
                    VarDef: false,
                    ClkDef: false,
                    IODly: false,
                    Exp: false
                });

                toast({
                    title: "保存成功",
                    description: "数据保存成功！",
                });
            } else {
                console.error(`❌ [DATA-SAV] 保存失败:`, { status: response.status, result });

                // 处理不同类型的错误响应
                let errorMessage = '未知错误';
                if (result.message === 'Validation failed') {
                    // 处理validation错误
                    const validationErrors = Object.entries(result.errors || {})
                        .map(([field, errors]) => `${field}: ${Array.isArray(errors) ? errors.join(', ') : errors}`)
                        .join('; ');
                    errorMessage = `数据验证失败: ${validationErrors}`;
                } else {
                    errorMessage = result.message || result.error || '保存失败';
                }

                toast({
                    title: "保存失败",
                    description: errorMessage,
                    variant: "destructive",
                });
            }
        } catch (error) {
            console.error('保存数据失败:', error);
            toast({
                title: "保存失败",
                description: "保存数据失败，请重试",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    // DataChk按钮处理函数 - 数据检查
    const handleDataChk = async () => {
        console.log(`🔍 [DATA-CHK] 开始数据检查:`, { taskId, globalIsDirty, checkStatus });

        if (!taskId || globalIsDirty) {
            console.warn(`⚠️ [DATA-CHK] 检查条件不满足:`, { taskId: !!taskId, globalIsDirty });
            return;
        }

        setCheckStatus('checking');
        setLoading(true);

        try {
            const response = await fetch(`/api/v1/sdc-thrpages/data-chk`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({ taskId }),
            });

            const result = await response.json();

            if (result.success) {
                // 根据报告中的错误/警告状态设置检查状态
                if (result.data?.isValid) {
                    setCheckStatus('success');
                    // 成功时显示绿色弹窗
                    toast({
                        title: "表格数据检查通过",
                        description: "数据检查成功，无错误和警告！",
                        className: "bg-green-50 border-green-200 text-green-800",
                        duration: 3000,
                    });
                    // 成功时不打开报告文件
                } else {
                    setCheckStatus('failed');

                    // 失败时显示黄色弹窗
                    toast({
                        title: "表格数据检查失败",
                        description: "请根据检查报告修复",
                        className: "bg-yellow-50 border-yellow-200 text-yellow-800",
                        duration: 5000,
                    });

                    // 只在失败时打开报告文件
                    if (result.data?.downloadUrl) {
                        console.log('打开报告下载链接:', result.data.downloadUrl);
                        window.open(result.data.downloadUrl, '_blank');
                    } else if (result.data?.reportPath) {
                        // 备用方案：提示用户手动打开
                        toast({
                            title: "请手动打开报告",
                            description: `报告文件位置：${result.data.reportPath}`,
                            duration: 10000,
                        });
                    }
                }
            } else {
                setCheckStatus('failed');
                toast({
                    title: "检查失败",
                    description: `数据检查失败：${result.message}`,
                    variant: "destructive",
                });
            }
        } catch (error) {
            console.error('数据检查失败:', error);
            setCheckStatus('failed');
            toast({
                title: "检查失败",
                description: "数据检查失败，请重试",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };



    // 提交处理 - 只有DataChk检查通过后才能提交
    const handleSubmission = async () => {
        console.log(`🚀 [SUBMISSION] 开始提交任务:`, { taskId, checkStatus, globalIsDirty });

        if (!taskId || checkStatus !== 'success') {
            console.warn(`⚠️ [SUBMISSION] 提交条件不满足:`, { taskId: !!taskId, checkStatus, required: 'success' });
            return;
        }

        setLoading(true);
        setTaskStatus({ status: 'SUBMITTING', currentStep: '正在提交任务...' });

        try {
            const response = await fetch(`/api/v1/sdc-thrpages/${taskId}/submit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
            });

            const result = await response.json();

            if (result.success) {
                setTaskStatus({ status: 'SUBMITTED', currentStep: '任务已提交' });
                toast({
                    title: "提交成功",
                    description: "任务提交成功！正在跳转到下载页面...",
                });

                // 跳转到下载页面
                setTimeout(() => {
                    navigate(`/tools/sdc-generator/task/${taskId}/download`);
                }, 1000);
            } else {
                setTaskStatus({ status: 'FAILED', currentStep: result.message || '提交失败' });
                toast({
                    title: "提交失败",
                    description: `提交失败：${result.message}`,
                    variant: "destructive",
                });
            }
        } catch (error) {
            console.error('提交任务失败:', error);
            setTaskStatus({ status: 'FAILED', currentStep: '网络错误' });
            toast({
                title: "提交失败",
                description: "提交任务失败，请重试",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };





    return (
        <>
            {/* 自定义滚动条样式 */}
            <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                    height: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: #f1f1f1;
                    border-radius: 3px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #c1c1c1;
                    border-radius: 3px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #a8a8a8;
                }
                .custom-scrollbar::-webkit-scrollbar-corner {
                    background: #f1f1f1;
                }
            `}</style>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.5 }}
                className="container mx-auto max-w-7xl p-4 sm:p-6 lg:p-8 relative"
            >
            {/* 固定定位的+圆圈按钮 */}
            {hoveredTableInfo && (
                console.log('🔍 [RENDER-DEBUG] 渲染悬浮按钮:', hoveredTableInfo),
                <>
                    {/* 左侧+按钮 */}
                    <div
                        className="fixed z-[9999] pointer-events-auto add-row-button"
                        style={{
                            left: `${hoveredTableInfo.leftButtonPos.x - 12}px`,
                            top: `${hoveredTableInfo.leftButtonPos.y - 12}px`,
                            visibility: 'visible',
                            display: 'block'
                        }}
                        onMouseEnter={() => {
                            // 鼠标进入按钮区域时保持显示，清除任何待执行的隐藏操作
                            if (hoverTimer) {
                                clearTimeout(hoverTimer);
                                setHoverTimer(null);
                            }
                        }}
                        onMouseLeave={() => {
                            // 鼠标离开按钮后立即隐藏，并清除最后悬停信息
                            setHoveredTableInfo(null);
                            setLastHoveredRowInfo(null);
                        }}
                    >
                        <button
                            onClick={() => {
                                console.log(`➕ [CLICK-LEFT] 添加新行:`, hoveredTableInfo);
                                handleAddRow(hoveredTableInfo.tableIndex, hoveredTableInfo.rowIndex);
                            }}
                            className="w-6 h-6 rounded-full border-2 border-blue-500 bg-white hover:bg-blue-50 flex items-center justify-center text-blue-500 hover:text-blue-600 transition-colors shadow-lg"
                            style={{ visibility: 'visible', display: 'flex' }}
                            title="在此行下方添加新行"
                        >
                            <Plus className="h-3 w-3" />
                        </button>
                    </div>

                    {/* 右侧-按钮（删除行） */}
                    <div
                        className="fixed z-[9999] pointer-events-auto add-row-button"
                        style={{
                            left: `${hoveredTableInfo.rightButtonPos.x - 12}px`,
                            top: `${hoveredTableInfo.rightButtonPos.y - 12}px`,
                            visibility: 'visible',
                            display: 'block'
                        }}
                        onMouseEnter={() => {
                            // 鼠标进入按钮区域时保持显示，清除任何待执行的隐藏操作
                            if (hoverTimer) {
                                clearTimeout(hoverTimer);
                                setHoverTimer(null);
                            }
                        }}
                        onMouseLeave={() => {
                            // 鼠标离开按钮后立即隐藏，并清除最后悬停信息
                            setHoveredTableInfo(null);
                            setLastHoveredRowInfo(null);
                        }}
                    >
                        <button
                            onClick={() => {
                                console.log(`🗑️ [CLICK-RIGHT] 删除当前行:`, hoveredTableInfo);
                                handleDeleteRow(hoveredTableInfo.tableIndex, hoveredTableInfo.rowIndex);
                            }}
                            className="w-6 h-6 rounded-full border-2 border-red-500 bg-white hover:bg-red-50 flex items-center justify-center text-red-500 hover:text-red-600 transition-colors shadow-lg"
                            style={{ visibility: 'visible', display: 'flex' }}
                            title="删除当前行"
                        >
                            <Minus className="h-3 w-3" />
                        </button>
                    </div>
                </>
            )}
            <div className="space-y-6">
                {/* 主要内容区域 */}
                <div className="relative">
                    <Card className="border-2 border-orange-400 shadow-lg min-h-[calc(100vh-12rem)]">
                        <CardHeader className="relative">
                            <CardTitle className="text-2xl md:text-3xl font-bold text-blue-600">
                                SDC需求输入II：
                            </CardTitle>
                            <div className="absolute top-4 right-4">
                                <Button
                                    onClick={handleSubmission}
                                    disabled={loading || checkStatus !== 'success' || taskStatus.status === 'SUBMITTING' || !isInitialized}
                                    className={`font-bold px-8 py-3 rounded-lg shadow-lg transition-all duration-300 transform hover:scale-105 disabled:transform-none ${
                                        checkStatus === 'success' && isInitialized
                                            ? 'bg-gradient-to-r from-blue-600 to-orange-500 hover:from-blue-700 hover:to-orange-600 text-white'
                                            : 'bg-gray-400 text-gray-600 cursor-not-allowed'
                                    }`}
                                >
                                    {taskStatus.status === 'SUBMITTING' ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            提交中...
                                        </>
                                    ) : (
                                        'Submission'
                                    )}
                                </Button>
                            </div>
                        </CardHeader>

                        {/* 分隔线 - 增加页面层次感 */}
                        <div className="border-t border-gray-200"></div>

                        <CardContent>
                            <div className="flex">
                                {/* 左侧Sheet按钮区域 - 固定宽度，可滚动 */}
                                <div className="w-32 pr-4 flex-shrink-0 relative">
                                    {/* 左右分隔线 - 调整位置避免与上方分隔线交叉 */}
                                    <div className="absolute right-0 top-8 bottom-0 w-px bg-gray-200"></div>
                                    <div className="sticky top-0 pt-8">
                                        {/* Sheet按钮区域 */}
                                        <div className="space-y-2">
                                            {SHEET_NAMES.map((sheetName) => (
                                                <Button
                                                    key={sheetName}
                                                    onClick={() => handleSheetClick(sheetName)}
                                                    variant={selectedSheet === sheetName ? "default" : "outline"}
                                                    className={`w-full text-center justify-center ${
                                                        selectedSheet === sheetName
                                                            ? "bg-blue-600 text-white"
                                                            : "hover:bg-gray-100"
                                                    }`}
                                                    disabled={loading}
                                                >
                                                    {sheetName}
                                                </Button>
                                            ))}
                                        </div>

                                        {/* DataSav和DataChk按钮区域 - 增加上边距与sheet按钮保持距离（三个按钮高度约120px） */}
                                        <div className="mt-[120px] space-y-2">
                                            <Button
                                                onClick={handleDataSav}
                                                disabled={loading || !globalIsDirty || !isInitialized}
                                                className={`w-full text-center justify-center ${
                                                    globalIsDirty && isInitialized
                                                        ? 'bg-gradient-to-r from-blue-600 to-orange-500 hover:from-blue-700 hover:to-orange-600 text-white'
                                                        : 'bg-gray-400 text-gray-600 cursor-not-allowed'
                                                }`}
                                            >
                                                DataSav
                                            </Button>

                                            <Button
                                                onClick={handleDataChk}
                                                disabled={loading || globalIsDirty || checkStatus === 'checking' || !isInitialized}
                                                className={`w-full text-center justify-center ${
                                                    checkStatus === 'success'
                                                        ? 'bg-green-600 hover:bg-green-700 text-white'
                                                        : !globalIsDirty && checkStatus !== 'checking' && isInitialized
                                                            ? 'bg-gradient-to-r from-blue-600 to-orange-500 hover:from-blue-700 hover:to-orange-600 text-white'
                                                            : 'bg-gray-400 text-gray-600 cursor-not-allowed'
                                                }`}
                                            >
                                                {checkStatus === 'checking' ? (
                                                    <>
                                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                        检查中
                                                    </>
                                                ) : (
                                                    'DataChk'
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                                {/* 右侧表格数据区域 - 可滚动，与VarDef按钮水平对齐，最多显示25行 */}
                                <div className="flex-1 pl-6 overflow-y-auto max-h-[calc(100vh-300px)] pt-8 pb-12 custom-scrollbar">
                                    {loading || !isInitialized ? (
                                        <div className="flex items-center justify-center h-full">
                                            <Loader2 className="h-8 w-8 animate-spin" />
                                            <span className="ml-2">{!isInitialized ? '初始化中...' : '加载中...'}</span>
                                        </div>
                                    ) : !currentSheetData ? (
                                        <div className="flex items-center justify-center h-full text-gray-500">
                                            <div className="text-center">
                                                <p>暂无数据</p>
                                                <p className="text-sm mt-2">请选择一个Sheet查看数据</p>
                                            </div>
                                        </div>
                                    ) : !currentSheetData.tables || !Array.isArray(currentSheetData.tables) ? (
                                        <div className="flex items-center justify-center h-full text-red-500">
                                            <div className="text-center">
                                                <p>数据结构错误</p>
                                                <p className="text-sm mt-2">表格数据格式不正确</p>
                                            </div>
                                        </div>
                                    ) : currentSheetData.tables.length === 0 ? (
                                        <div className="flex items-center justify-center h-full text-gray-500">
                                            <div className="text-center">
                                                <p>该Sheet暂无表格数据</p>
                                                <p className="text-sm mt-2">请检查数据是否已正确初始化</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-8">
                                            {/* 表格区域 */}
                                            {currentSheetData.tables.map((table, tableIndex) => {
                                                const needsPagination = SHEETS_WITH_PAGINATION.includes(selectedSheet);
                                                const tableKey = `${selectedSheet}_${tableIndex}`;
                                                const currentTablePage = currentPage[tableKey] || 1;

                                                // 处理表格数据
                                                const sortedRows = table.rows && Array.isArray(table.rows)
                                                    ? table.rows
                                                        .filter(row => row != null)
                                                        .sort((a, b) => (a?.row_number || 0) - (b?.row_number || 0))
                                                    : [];

                                                // 分页逻辑
                                                const totalRows = sortedRows.length;
                                                const totalPages = needsPagination ? Math.ceil(totalRows / ROWS_PER_PAGE) : 1;
                                                const startIndex = needsPagination ? (currentTablePage - 1) * ROWS_PER_PAGE : 0;
                                                const endIndex = needsPagination ? startIndex + ROWS_PER_PAGE : totalRows;
                                                const displayRows = sortedRows.slice(startIndex, endIndex);

                                                return (
                                                    <div key={tableIndex} className="border rounded-lg p-4 pb-16">
                                                        <div className="flex justify-between items-center mb-3 sticky top-0 bg-white z-10 py-2 -mx-4 px-4 border-b">
                                                            <h3 className="font-semibold text-lg text-orange-600">
                                                                {table.table_name}
                                                            </h3>
                                                            {needsPagination && totalPages > 1 && (
                                                                <div className="flex items-center space-x-2">
                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        onClick={() => setCurrentPage(prev => ({
                                                                            ...prev,
                                                                            [tableKey]: Math.max(1, currentTablePage - 1)
                                                                        }))}
                                                                        disabled={currentTablePage === 1}
                                                                    >
                                                                        <ChevronLeft className="h-4 w-4" />
                                                                    </Button>
                                                                    <span className="text-sm">
                                                                        第 {currentTablePage} 页，共 {totalPages} 页
                                                                    </span>
                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        onClick={() => setCurrentPage(prev => ({
                                                                            ...prev,
                                                                            [tableKey]: Math.min(totalPages, currentTablePage + 1)
                                                                        }))}
                                                                        disabled={currentTablePage === totalPages}
                                                                    >
                                                                        <ChevronRight className="h-4 w-4" />
                                                                    </Button>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="overflow-x-auto relative max-h-[600px] overflow-y-auto custom-scrollbar" style={{ paddingBottom: '40px' }}>
                                                            <table className="border-collapse border border-gray-300" style={{ tableLayout: 'fixed', minWidth: '100%' }}>
                                                                <thead className="sticky top-0 z-10">
                                                                    <tr className="bg-gray-50">
                                                                        {/* 行号列 */}
                                                                        <th
                                                                            className={`border border-gray-300 px-2 py-2 text-center font-medium bg-gray-100 sticky top-0 relative cursor-pointer ${
                                                                                selectedCells.sheetName === selectedSheet &&
                                                                                selectedCells.tableIndex === tableIndex &&
                                                                                selectedCells.cells.length > 0 &&
                                                                                selectedCells.cells.every(cell =>
                                                                                    selectedCells.cells.some(c => c.rowIndex === cell.rowIndex)
                                                                                )
                                                                                    ? 'bg-blue-200 border-blue-500'
                                                                                    : 'hover:bg-gray-200'
                                                                            }`}
                                                                            style={{ width: '50px', minWidth: '50px', maxWidth: '50px' }}
                                                                            onClick={(e) => {
                                                                                e.preventDefault();
                                                                                // 点击行号列标题可以全选所有行
                                                                                const allCells: { rowIndex: number; colIndex: number }[] = [];
                                                                                for (let r = 0; r < sortedRows.length; r++) {
                                                                                    for (let c = 0; c < (table.columns?.length || 0); c++) {
                                                                                        allCells.push({ rowIndex: r, colIndex: c });
                                                                                    }
                                                                                }
                                                                                setSelectedCells({
                                                                                    sheetName: selectedSheet,
                                                                                    tableIndex,
                                                                                    cells: allCells,
                                                                                    isSelecting: false,
                                                                                    selectionStart: null,
                                                                                    isDragging: false,
                                                                                    dragStart: null
                                                                                });
                                                                            }}
                                                                        >
                                                                            #
                                                                        </th>
                                                                        {table.columns && Array.isArray(table.columns) ? table.columns.map((column, colIndex) => (
                                                                            <th
                                                                                key={colIndex}
                                                                                className={`border border-gray-300 px-3 py-2 text-left font-medium bg-gray-50 sticky top-0 relative group cursor-pointer ${
                                                                                    selectedCells.sheetName === selectedSheet &&
                                                                                    selectedCells.tableIndex === tableIndex &&
                                                                                    selectedCells.cells.some(cell => cell.colIndex === colIndex)
                                                                                        ? 'bg-blue-200 border-blue-500'
                                                                                        : 'hover:bg-gray-100'
                                                                                }`}
                                                                                onClick={(e) => {
                                                                                    e.preventDefault();

                                                                                    // 点击表头选择整列
                                                                                    const allRowsInColumn: { rowIndex: number; colIndex: number }[] = [];
                                                                                    for (let r = 0; r < sortedRows.length; r++) {
                                                                                        allRowsInColumn.push({ rowIndex: r, colIndex });
                                                                                    }

                                                                                    if (e.ctrlKey || e.metaKey) {
                                                                                        // Ctrl+点击：添加整列到选择
                                                                                        setSelectedCells(prev => ({
                                                                                            ...prev,
                                                                                            sheetName: selectedSheet,
                                                                                            tableIndex,
                                                                                            cells: [...prev.cells, ...allRowsInColumn.filter(newCell =>
                                                                                                !prev.cells.some(existingCell =>
                                                                                                    existingCell.rowIndex === newCell.rowIndex &&
                                                                                                    existingCell.colIndex === newCell.colIndex
                                                                                                )
                                                                                            )]
                                                                                        }));
                                                                                    } else {
                                                                                        // 普通点击：选择整列
                                                                                        setSelectedCells({
                                                                                            sheetName: selectedSheet,
                                                                                            tableIndex,
                                                                                            cells: allRowsInColumn,
                                                                                            isSelecting: false,
                                                                                            selectionStart: null,
                                                                                            isDragging: false,
                                                                                            dragStart: null
                                                                                        });
                                                                                    }
                                                                                }}
                                                                                style={{
                                                                                    minWidth: '120px',
                                                                                    width: `${100 / table.columns.length}%`,
                                                                                    resize: 'horizontal',
                                                                                    overflow: 'hidden'
                                                                                }}
                                                                            >
                                                                                <div className="truncate" title={column}>
                                                                                    {column}
                                                                                </div>
                                                                                {/* 列宽调整手柄 */}
                                                                                <div
                                                                                    className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize bg-transparent hover:border-r-2 hover:border-blue-500 opacity-0 group-hover:opacity-100 transition-all duration-200 z-20"
                                                                                    onMouseDown={(e) => {
                                                                                        e.preventDefault();
                                                                                        const startX = e.clientX;
                                                                                        const thElement = e.currentTarget.parentElement as HTMLElement;
                                                                                        const table = thElement.closest('table') as HTMLTableElement;
                                                                                        const startWidth = thElement.offsetWidth;
                                                                                        const startTableWidth = table.offsetWidth;
                                                                                        // 由于增加了行号列，数据列的DOM索引需要+1
                                                                                        const currentColIndex = colIndex + 1;

                                                                                        // 获取所有数据行
                                                                                        const allRows = Array.from(table.querySelectorAll('tbody tr')) as HTMLElement[];

                                                                                        const handleMouseMove = (moveEvent: MouseEvent) => {
                                                                                            const deltaX = moveEvent.clientX - startX;
                                                                                            const newWidth = Math.max(80, startWidth + deltaX);
                                                                                            const widthDelta = newWidth - startWidth;

                                                                                            // 只调整当前列的宽度
                                                                                            thElement.style.width = `${newWidth}px`;

                                                                                            // 同步调整所有数据行中对应列的宽度
                                                                                            allRows.forEach(row => {
                                                                                                const cells = Array.from(row.querySelectorAll('td')) as HTMLElement[];
                                                                                                if (cells[currentColIndex]) {
                                                                                                    cells[currentColIndex].style.width = `${newWidth}px`;
                                                                                                }
                                                                                            });

                                                                                            // 动态调整表格总宽度，支持水平滚动
                                                                                            const newTableWidth = startTableWidth + widthDelta;
                                                                                            const containerWidth = table.parentElement?.offsetWidth || 0;
                                                                                            table.style.width = `${Math.max(newTableWidth, containerWidth)}px`;
                                                                                        };

                                                                                        const handleMouseUp = () => {
                                                                                            document.removeEventListener('mousemove', handleMouseMove);
                                                                                            document.removeEventListener('mouseup', handleMouseUp);
                                                                                        };

                                                                                        document.addEventListener('mousemove', handleMouseMove);
                                                                                        document.addEventListener('mouseup', handleMouseUp);
                                                                                    }}
                                                                                    onDoubleClick={(e) => {
                                                                                        // 由于增加了行号列，数据列的DOM索引需要+1
                                                                                        handleColumnDoubleClick(e, colIndex + 1, column, sortedRows);
                                                                                    }}
                                                                                />
                                                                            </th>
                                                                        )) : null}
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {displayRows.map((row, rowIndex) => {
                                                                        const actualRowIndex = startIndex + rowIndex;

                                                                        return (
                                                                            <tr
                                                                                key={row?.data_id || rowIndex}
                                                                                className="hover:bg-gray-50 relative group"
                                                                                onMouseEnter={(e) => {
                                                                                    // 清除之前的定时器
                                                                                    if (hoverTimer) {
                                                                                        clearTimeout(hoverTimer);
                                                                                        setHoverTimer(null);
                                                                                    }

                                                                                    // 计算+按钮位置
                                                                                    const tr = e.currentTarget;
                                                                                    const rect = tr.getBoundingClientRect();
                                                                                    const rowNumberCell = tr.querySelector('td:first-child'); // 行号列

                                                                                    if (rowNumberCell) {
                                                                                        const rowNumberRect = rowNumberCell.getBoundingClientRect();
                                                                                        const tableContainer = tr.closest('.overflow-x-auto') as HTMLElement;
                                                                                        const table = tr.closest('table') as HTMLElement;

                                                                                        // 计算+按钮位置：行号列右边列线上
                                                                                        const leftButtonX = rowNumberRect.right;

                                                                                        // 智能计算-按钮位置
                                                                                        let rightButtonX;

                                                                                        if (tableContainer && table) {
                                                                                            const containerRect = tableContainer.getBoundingClientRect();
                                                                                            const tableRect = table.getBoundingClientRect();

                                                                                            // 检查是否有水平滚动条
                                                                                            const hasHorizontalScroll = table.scrollWidth > tableContainer.clientWidth;

                                                                                            // 检查是否有垂直滚动条
                                                                                            const hasVerticalScroll = tableContainer.scrollHeight > tableContainer.clientHeight;

                                                                                            if (!hasHorizontalScroll) {
                                                                                                // 没有水平滚动条：放在表格最后一列右边
                                                                                                rightButtonX = tableRect.right;
                                                                                            } else if (hasVerticalScroll) {
                                                                                                // 有垂直滚动条：放在滚动条左边
                                                                                                rightButtonX = containerRect.right - 20; // 滚动条通常约20px宽
                                                                                            } else {
                                                                                                // 有水平滚动条但无垂直滚动条：放在容器右边
                                                                                                rightButtonX = containerRect.right;
                                                                                            }
                                                                                        } else {
                                                                                            // 备用方案：屏幕右边
                                                                                            rightButtonX = window.innerWidth - 30;
                                                                                        }

                                                                                        const buttonInfo = {
                                                                                            tableIndex,
                                                                                            rowIndex: actualRowIndex,
                                                                                            leftButtonPos: {
                                                                                                x: leftButtonX, // 行号列右边列线
                                                                                                y: rect.top + rect.height / 2
                                                                                            },
                                                                                            rightButtonPos: {
                                                                                                x: rightButtonX, // 智能位置
                                                                                                y: rect.top + rect.height / 2
                                                                                            }
                                                                                        };

                                                                                        console.log('🔍 [HOVER-DEBUG] 设置悬浮按钮:', buttonInfo);
                                                                                        setHoveredTableInfo(buttonInfo);
                                                                                        setLastHoveredRowInfo(buttonInfo);
                                                                                    }
                                                                                }}
                                                                                onMouseLeave={(e) => {
                                                                                    // 检查鼠标是否移动到按钮区域
                                                                                    const relatedTarget = e.relatedTarget as HTMLElement;
                                                                                    if (relatedTarget && (
                                                                                        relatedTarget.closest('.add-row-button') ||
                                                                                        relatedTarget.classList.contains('add-row-button')
                                                                                    )) {
                                                                                        // 如果移动到按钮，不隐藏
                                                                                        return;
                                                                                    }

                                                                                    // 设置2秒延迟隐藏（保留lastHoveredRowInfo用于重新显示）
                                                                                    const timer = setTimeout(() => {
                                                                                        setHoveredTableInfo(null);
                                                                                        setHoverTimer(null);
                                                                                        // 不清除lastHoveredRowInfo，保留用于重新显示
                                                                                    }, 2000);
                                                                                    setHoverTimer(timer);
                                                                                }}
                                                                            >
                                                                                {/* 行号单元格 */}
                                                                                <td
                                                                                    className={`border border-gray-300 px-2 py-2 text-center bg-gray-100 font-medium cursor-pointer ${
                                                                                        selectedCells.sheetName === selectedSheet &&
                                                                                        selectedCells.tableIndex === tableIndex &&
                                                                                        selectedCells.cells.some(cell => cell.rowIndex === actualRowIndex)
                                                                                            ? 'bg-blue-200 border-blue-500'
                                                                                            : 'hover:bg-gray-200'
                                                                                    }`}
                                                                                    style={{ width: '50px', minWidth: '50px', maxWidth: '50px' }}
                                                                                    onClick={(e) => {
                                                                                        e.preventDefault();

                                                                                        // 点击行号选择整行
                                                                                        const allCellsInRow: { rowIndex: number; colIndex: number }[] = [];
                                                                                        for (let c = 0; c < (table.columns?.length || 0); c++) {
                                                                                            allCellsInRow.push({ rowIndex: actualRowIndex, colIndex: c });
                                                                                        }

                                                                                        if (e.ctrlKey || e.metaKey) {
                                                                                            // Ctrl+点击：添加整行到选择
                                                                                            setSelectedCells(prev => ({
                                                                                                ...prev,
                                                                                                sheetName: selectedSheet,
                                                                                                tableIndex,
                                                                                                cells: [...prev.cells, ...allCellsInRow.filter(newCell =>
                                                                                                    !prev.cells.some(existingCell =>
                                                                                                        existingCell.rowIndex === newCell.rowIndex &&
                                                                                                        existingCell.colIndex === newCell.colIndex
                                                                                                    )
                                                                                                )]
                                                                                            }));
                                                                                        } else {
                                                                                            // 普通点击：选择整行
                                                                                            setSelectedCells({
                                                                                                sheetName: selectedSheet,
                                                                                                tableIndex,
                                                                                                cells: allCellsInRow,
                                                                                                isSelecting: false,
                                                                                                selectionStart: null,
                                                                                                isDragging: false,
                                                                                                dragStart: null
                                                                                            });
                                                                                        }
                                                                                    }}
                                                                                >
                                                                                    {actualRowIndex + 1}
                                                                                </td>

                                                                                {table.columns && Array.isArray(table.columns) ? table.columns.map((column, colIndex) => {
                                                                                    // 检查当前单元格是否有下拉数据
                                                                                    const dropdownData = row?.dropdown_data && row.dropdown_data[column];
                                                                                    const hasDropdown = dropdownData && dropdownData.options && dropdownData.options.length > 0;
                                                                                    const cellValue = (row?.row_data && row.row_data[column] !== undefined && row.row_data[column] !== null) ? row.row_data[column] : '';



                                                                                    // 调试：检查下拉数据状态
                                                                                    if (hasDropdown) {
                                                                                        console.log(`🔍 [DROPDOWN-DEBUG] 列${column}:`, {
                                                                                            cellValue,
                                                                                            dropdownOptions: dropdownData.options,
                                                                                            optionsCount: dropdownData.options.length,
                                                                                            rowNumber: row?.row_number
                                                                                        });
                                                                                    }

                                                                                    // 调试信息
                                                                                    if (hasDropdown && (cellValue !== undefined && cellValue !== null && cellValue !== '')) {
                                                                                        console.log(`🔍 [DROPDOWN-DEBUG] 单元格有数据和下拉:`, {
                                                                                            column,
                                                                                            cellValue,
                                                                                            dropdownOptions: dropdownData.options,
                                                                                            rowData: row?.row_data,
                                                                                            dropdownData: row?.dropdown_data
                                                                                        });
                                                                                    }

                                                                                    return (
                                                                                        <td
                                                                                            key={colIndex}
                                                                                            className={`border border-gray-300 px-3 py-2 relative group cursor-pointer ${
                                                                                                selectedCells.sheetName === selectedSheet &&
                                                                                                selectedCells.tableIndex === tableIndex &&
                                                                                                selectedCells.cells.some(cell => cell.rowIndex === actualRowIndex && cell.colIndex === colIndex)
                                                                                                    ? 'bg-blue-100 border-blue-500'
                                                                                                    : 'hover:bg-gray-50'
                                                                                            }`}
                                                                                            onMouseDown={(e) => {
                                                                                                // 只在选择操作时阻止默认行为，允许正常的输入框聚焦
                                                                                                if (e.ctrlKey || e.metaKey || e.shiftKey) {
                                                                                                    e.preventDefault();
                                                                                                }

                                                                                                // 如果点击的是不同表格，清除之前的选择状态
                                                                                                const currentTableId = `${selectedSheet}_${tableIndex}`;
                                                                                                const selectedTableId = `${selectedCells.sheetName}_${selectedCells.tableIndex}`;

                                                                                                if (selectedCells.tableIndex !== -1 && selectedTableId !== currentTableId) {
                                                                                                    setSelectedCells({
                                                                                                        sheetName: '',
                                                                                                        tableIndex: -1,
                                                                                                        cells: [],
                                                                                                        isSelecting: false,
                                                                                                        selectionStart: null,
                                                                                                        isDragging: false,
                                                                                                        dragStart: null
                                                                                                    });
                                                                                                }

                                                                                                if (e.ctrlKey || e.metaKey) {
                                                                                                    // Ctrl+点击：多选模式
                                                                                                    setSelectedCells(prev => {
                                                                                                        // 如果是不同的表格，重置选择状态
                                                                                                        const prevTableId = `${prev.sheetName}_${prev.tableIndex}`;
                                                                                                        const currentTableId = `${selectedSheet}_${tableIndex}`;

                                                                                                        if (prevTableId !== currentTableId) {
                                                                                                            return {
                                                                                                                sheetName: selectedSheet,
                                                                                                                tableIndex,
                                                                                                                cells: [{ rowIndex: actualRowIndex, colIndex }],
                                                                                                                isSelecting: false,
                                                                                                                selectionStart: { rowIndex: actualRowIndex, colIndex },
                                                                                                                isDragging: false,
                                                                                                                dragStart: null
                                                                                                            };
                                                                                                        }

                                                                                                        const cellExists = prev.cells.some(cell =>
                                                                                                            cell.rowIndex === actualRowIndex && cell.colIndex === colIndex
                                                                                                        );

                                                                                                        if (cellExists) {
                                                                                                            // 如果已选中，则取消选择
                                                                                                            return {
                                                                                                                ...prev,
                                                                                                                sheetName: selectedSheet,
                                                                                                                tableIndex,
                                                                                                                cells: prev.cells.filter(cell =>
                                                                                                                    !(cell.rowIndex === actualRowIndex && cell.colIndex === colIndex)
                                                                                                                )
                                                                                                            };
                                                                                                        } else {
                                                                                                            // 添加到选择列表
                                                                                                            return {
                                                                                                                ...prev,
                                                                                                                sheetName: selectedSheet,
                                                                                                                tableIndex,
                                                                                                                cells: [...prev.cells, { rowIndex: actualRowIndex, colIndex }]
                                                                                                            };
                                                                                                        }
                                                                                                    });
                                                                                                } else if (e.shiftKey && selectedCells.cells.length > 0 && selectedCells.sheetName === selectedSheet && selectedCells.tableIndex === tableIndex) {
                                                                                                    // Shift+点击：范围选择
                                                                                                    const lastSelected = selectedCells.cells[selectedCells.cells.length - 1];
                                                                                                    const startRow = Math.min(lastSelected.rowIndex, actualRowIndex);
                                                                                                    const endRow = Math.max(lastSelected.rowIndex, actualRowIndex);
                                                                                                    const startCol = Math.min(lastSelected.colIndex, colIndex);
                                                                                                    const endCol = Math.max(lastSelected.colIndex, colIndex);

                                                                                                    const rangeCells = [];
                                                                                                    for (let r = startRow; r <= endRow; r++) {
                                                                                                        for (let c = startCol; c <= endCol; c++) {
                                                                                                            rangeCells.push({ rowIndex: r, colIndex: c });
                                                                                                        }
                                                                                                    }

                                                                                                    setSelectedCells({
                                                                                                        sheetName: selectedSheet,
                                                                                                        tableIndex,
                                                                                                        cells: rangeCells,
                                                                                                        isSelecting: false,
                                                                                                        selectionStart: null,
                                                                                                        isDragging: false,
                                                                                                        dragStart: null
                                                                                                    });
                                                                                                } else {
                                                                                                    // 普通点击：重置为当前表格的选择状态
                                                                                                    setSelectedCells({
                                                                                                        sheetName: selectedSheet,
                                                                                                        tableIndex,
                                                                                                        cells: [{ rowIndex: actualRowIndex, colIndex }],
                                                                                                        isSelecting: false,
                                                                                                        selectionStart: { rowIndex: actualRowIndex, colIndex },
                                                                                                        isDragging: true,
                                                                                                        dragStart: { rowIndex: actualRowIndex, colIndex }
                                                                                                    });
                                                                                                }
                                                                                            }}
                                                                                            onMouseEnter={() => {
                                                                                                // 拖拽过程中更新选择区域（仅在同一表格内）
                                                                                                if (selectedCells.isDragging && selectedCells.dragStart && selectedCells.sheetName === selectedSheet && selectedCells.tableIndex === tableIndex) {
                                                                                                    const startRow = Math.min(selectedCells.dragStart.rowIndex, actualRowIndex);
                                                                                                    const endRow = Math.max(selectedCells.dragStart.rowIndex, actualRowIndex);
                                                                                                    const startCol = Math.min(selectedCells.dragStart.colIndex, colIndex);
                                                                                                    const endCol = Math.max(selectedCells.dragStart.colIndex, colIndex);

                                                                                                    const rangeCells: { rowIndex: number; colIndex: number }[] = [];
                                                                                                    for (let r = startRow; r <= endRow; r++) {
                                                                                                        for (let c = startCol; c <= endCol; c++) {
                                                                                                            rangeCells.push({ rowIndex: r, colIndex: c });
                                                                                                        }
                                                                                                    }

                                                                                                    setSelectedCells(prev => ({
                                                                                                        ...prev,
                                                                                                        cells: rangeCells
                                                                                                    }));
                                                                                                }
                                                                                            }}
                                                                                        >
                                                                                            {hasDropdown ? (
                                                                                                // 渲染可输入的下拉选择器
                                                                                                <div className="relative w-full dropdown-container">
                                                                                                    <textarea
                                                                                                        value={cellValue}
                                                                                                        onChange={(e) => {
                                                                                                            handleTableDataChange(tableIndex, actualRowIndex, column, e.target.value);
                                                                                                        }}
                                                                                                        onKeyDown={(e) => {
                                                                                                            // Alt+Enter 或 Shift+Enter 创建新行
                                                                                                            if ((e.altKey || e.shiftKey) && e.key === 'Enter') {
                                                                                                                e.preventDefault();
                                                                                                                const cursorPos = e.currentTarget.selectionStart;
                                                                                                                const textBefore = e.currentTarget.value.substring(0, cursorPos);
                                                                                                                const textAfter = e.currentTarget.value.substring(cursorPos);
                                                                                                                const newValue = textBefore + '\n' + textAfter;
                                                                                                                handleTableDataChange(tableIndex, actualRowIndex, column, newValue);

                                                                                                                // 设置光标位置到新行开始
                                                                                                                setTimeout(() => {
                                                                                                                    e.currentTarget.selectionStart = e.currentTarget.selectionEnd = cursorPos + 1;
                                                                                                                }, 0);
                                                                                                            }
                                                                                                        }}
                                                                                                        onFocus={() => {
                                                                                                            // 获得焦点时显示下拉选项
                                                                                                            const dropdown = document.getElementById(`dropdown-${tableIndex}-${actualRowIndex}-${colIndex}`);
                                                                                                            if (dropdown) dropdown.style.display = 'block';
                                                                                                        }}
                                                                                                        onBlur={() => {
                                                                                                            // 失去焦点时延迟隐藏下拉（给用户时间点击选项）
                                                                                                            setTimeout(() => {
                                                                                                                const dropdown = document.getElementById(`dropdown-${tableIndex}-${actualRowIndex}-${colIndex}`);
                                                                                                                if (dropdown) dropdown.style.display = 'none';
                                                                                                            }, 150);
                                                                                                        }}
                                                                                                        onClick={() => {
                                                                                                            // 点击时显示下拉选项
                                                                                                            const dropdown = document.getElementById(`dropdown-${tableIndex}-${actualRowIndex}-${colIndex}`);
                                                                                                            if (dropdown) dropdown.style.display = 'block';
                                                                                                        }}
                                                                                                        className="w-full border-none bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-2 py-1 resize-none overflow-hidden"
                                                                                                        rows={1}
                                                                                                        style={{
                                                                                                            minHeight: '32px',
                                                                                                            height: 'calc(100% - 8px)',
                                                                                                            whiteSpace: 'pre-wrap',
                                                                                                            wordWrap: 'break-word',
                                                                                                            margin: '4px',
                                                                                                            boxSizing: 'border-box'
                                                                                                        }}
                                                                                                        onInput={(e) => {
                                                                                                            // 自动调整高度
                                                                                                            const target = e.target as HTMLTextAreaElement;
                                                                                                            target.style.height = 'auto';
                                                                                                            target.style.height = target.scrollHeight + 'px';

                                                                                                            // 同时调整父行的高度
                                                                                                            const row = target.closest('tr') as HTMLElement;
                                                                                                            if (row) {
                                                                                                                row.style.height = 'auto';
                                                                                                                row.style.height = Math.max(40, target.scrollHeight + 16) + 'px';
                                                                                                            }
                                                                                                        }}
                                                                                                    />
                                                                                                    {/* 自定义下拉选项列表 */}
                                                                                                    <div
                                                                                                        id={`dropdown-${tableIndex}-${actualRowIndex}-${colIndex}`}
                                                                                                        className="absolute top-full left-0 bg-white border border-gray-300 rounded shadow-lg z-50 max-h-32 overflow-y-auto overflow-x-auto custom-scrollbar"
                                                                                                        style={{
                                                                                                            display: 'none',
                                                                                                            minWidth: '100%',
                                                                                                            maxWidth: '300px',
                                                                                                            whiteSpace: 'nowrap'
                                                                                                        }}
                                                                                                        onMouseLeave={() => {
                                                                                                            // 鼠标离开时隐藏下拉
                                                                                                            const dropdown = document.getElementById(`dropdown-${tableIndex}-${actualRowIndex}-${colIndex}`);
                                                                                                            if (dropdown) dropdown.style.display = 'none';
                                                                                                        }}
                                                                                                    >
                                                                                                        {dropdownData.options.map((option: string, optIndex: number) => (
                                                                                                            <div
                                                                                                                key={optIndex}
                                                                                                                className="px-2 py-1 hover:bg-blue-100 cursor-pointer text-sm whitespace-nowrap"
                                                                                                                style={{
                                                                                                                    minWidth: 'max-content',
                                                                                                                    display: 'block'
                                                                                                                }}
                                                                                                                onClick={() => {
                                                                                                                    handleTableDataChange(tableIndex, actualRowIndex, column, option);
                                                                                                                    // 选择后隐藏下拉
                                                                                                                    const dropdown = document.getElementById(`dropdown-${tableIndex}-${actualRowIndex}-${colIndex}`);
                                                                                                                    if (dropdown) dropdown.style.display = 'none';
                                                                                                                }}
                                                                                                                title={option} // 添加tooltip显示完整内容
                                                                                                            >
                                                                                                                {option}
                                                                                                            </div>
                                                                                                        ))}
                                                                                                    </div>
                                                                                                </div>
                                                                                            ) : (
                                                                                                // 渲染普通输入框
                                                                                                <textarea
                                                                                                    value={cellValue}
                                                                                                    onChange={(e) => {
                                                                                                        handleTableDataChange(tableIndex, actualRowIndex, column, e.target.value);
                                                                                                    }}
                                                                                                    onKeyDown={(e) => {
                                                                                                        // Alt+Enter 或 Shift+Enter 创建新行
                                                                                                        if ((e.altKey || e.shiftKey) && e.key === 'Enter') {
                                                                                                            e.preventDefault();
                                                                                                            const cursorPos = e.currentTarget.selectionStart;
                                                                                                            const textBefore = e.currentTarget.value.substring(0, cursorPos);
                                                                                                            const textAfter = e.currentTarget.value.substring(cursorPos);
                                                                                                            const newValue = textBefore + '\n' + textAfter;
                                                                                                            handleTableDataChange(tableIndex, actualRowIndex, column, newValue);

                                                                                                            // 设置光标位置到新行开始
                                                                                                            setTimeout(() => {
                                                                                                                e.currentTarget.selectionStart = e.currentTarget.selectionEnd = cursorPos + 1;
                                                                                                            }, 0);
                                                                                                        }
                                                                                                    }}
                                                                                                    className="w-full border-none bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-2 py-1 resize-none overflow-hidden"
                                                                                                    rows={1}
                                                                                                    style={{
                                                                                                        minHeight: '32px',
                                                                                                        height: 'calc(100% - 8px)',
                                                                                                        whiteSpace: 'pre-wrap',
                                                                                                        wordWrap: 'break-word',
                                                                                                        margin: '4px',
                                                                                                        boxSizing: 'border-box'
                                                                                                    }}
                                                                                                    onInput={(e) => {
                                                                                                        // 自动调整高度
                                                                                                        const target = e.target as HTMLTextAreaElement;
                                                                                                        target.style.height = 'auto';
                                                                                                        target.style.height = target.scrollHeight + 'px';

                                                                                                        // 同时调整父行的高度
                                                                                                        const row = target.closest('tr') as HTMLElement;
                                                                                                        if (row) {
                                                                                                            row.style.height = 'auto';
                                                                                                            row.style.height = Math.max(40, target.scrollHeight + 16) + 'px';
                                                                                                        }
                                                                                                    }}
                                                                                                />
                                                                                            )}

                                                                                            {/* 数据行中的列宽调整手柄 */}
                                                                                            <div
                                                                                                className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize bg-transparent hover:border-r-2 hover:border-blue-500 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10"
                                                                                                onMouseDown={(e) => {
                                                                                                    e.preventDefault();
                                                                                                    const startX = e.clientX;
                                                                                                    const tdElement = e.currentTarget.parentElement as HTMLElement;
                                                                                                    const table = tdElement.closest('table') as HTMLTableElement;
                                                                                                    // 由于增加了行号列，数据列的DOM索引需要+1
                                                                                                    const currentColIndex = colIndex + 1;

                                                                                                    // 获取表头中对应的th元素（考虑行号列）
                                                                                                    const headerCell = table.querySelector(`thead th:nth-child(${currentColIndex + 1})`) as HTMLElement;
                                                                                                    const startWidth = headerCell ? headerCell.offsetWidth : tdElement.offsetWidth;
                                                                                                    const startTableWidth = table.offsetWidth;

                                                                                                    // 获取所有数据行
                                                                                                    const allRows = Array.from(table.querySelectorAll('tbody tr')) as HTMLElement[];

                                                                                                    const handleMouseMove = (moveEvent: MouseEvent) => {
                                                                                                        const deltaX = moveEvent.clientX - startX;
                                                                                                        const newWidth = Math.max(80, startWidth + deltaX);
                                                                                                        const widthDelta = newWidth - startWidth;

                                                                                                        // 调整表头中对应列的宽度
                                                                                                        if (headerCell) {
                                                                                                            headerCell.style.width = `${newWidth}px`;
                                                                                                        }

                                                                                                        // 同步调整所有数据行中对应列的宽度
                                                                                                        allRows.forEach(row => {
                                                                                                            const cells = Array.from(row.querySelectorAll('td')) as HTMLElement[];
                                                                                                            if (cells[currentColIndex]) {
                                                                                                                cells[currentColIndex].style.width = `${newWidth}px`;
                                                                                                            }
                                                                                                        });

                                                                                                        // 动态调整表格总宽度，支持水平滚动
                                                                                                        const newTableWidth = startTableWidth + widthDelta;
                                                                                                        const containerWidth = table.parentElement?.offsetWidth || 0;
                                                                                                        table.style.width = `${Math.max(newTableWidth, containerWidth)}px`;
                                                                                                    };

                                                                                                    const handleMouseUp = () => {
                                                                                                        document.removeEventListener('mousemove', handleMouseMove);
                                                                                                        document.removeEventListener('mouseup', handleMouseUp);
                                                                                                    };

                                                                                                    document.addEventListener('mousemove', handleMouseMove);
                                                                                                    document.addEventListener('mouseup', handleMouseUp);
                                                                                                }}
                                                                                                onDoubleClick={(e) => {
                                                                                                    // 由于增加了行号列，数据列的DOM索引需要+1
                                                                                                    handleColumnDoubleClick(e, colIndex + 1, column, sortedRows);
                                                                                                }}
                                                                                            />
                                                                                        </td>
                                                                                    );
                                                                                }) : null}

                                                                                {/* 行高调整手柄 */}
                                                                                <div
                                                                                    className="absolute left-0 right-0 bottom-0 h-2 cursor-row-resize bg-transparent hover:border-b-2 hover:border-blue-500 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10"
                                                                                    onMouseDown={(e) => {
                                                                                        e.preventDefault();
                                                                                        const startY = e.clientY;
                                                                                        const trElement = e.currentTarget.parentElement as HTMLElement;
                                                                                        const startHeight = trElement.offsetHeight;

                                                                                        const handleMouseMove = (e: MouseEvent) => {
                                                                                            const deltaY = e.clientY - startY;
                                                                                            const newHeight = Math.max(40, startHeight + deltaY); // 最小高度40px

                                                                                            // 应用新高度到当前行
                                                                                            trElement.style.height = `${newHeight}px`;

                                                                                            // 应用到所有单元格
                                                                                            const cells = Array.from(trElement.querySelectorAll('td')) as HTMLElement[];
                                                                                            cells.forEach(cell => {
                                                                                                cell.style.height = `${newHeight}px`;

                                                                                                // 同步调整单元格内的输入框高度
                                                                                                const textarea = cell.querySelector('textarea') as HTMLTextAreaElement;
                                                                                                if (textarea) {
                                                                                                    textarea.style.height = `${Math.max(32, newHeight - 8)}px`;
                                                                                                }
                                                                                            });
                                                                                        };

                                                                                        const handleMouseUp = () => {
                                                                                            document.removeEventListener('mousemove', handleMouseMove);
                                                                                            document.removeEventListener('mouseup', handleMouseUp);
                                                                                        };

                                                                                        document.addEventListener('mousemove', handleMouseMove);
                                                                                        document.addEventListener('mouseup', handleMouseUp);
                                                                                    }}
                                                                                    onDoubleClick={(e) => {
                                                                                        handleRowDoubleClick(e, rowIndex, row, table);
                                                                                    }}
                                                                                />
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* 任务历史按钮和开始新任务按钮 - 绝对定位在Card外面的右侧 */}
                    <div className="absolute top-[1.25rem] -right-4 transform translate-x-full">
                        <div className="flex flex-col space-y-3">
                            <ToolPageTaskHistoryButton taskStatus={taskStatus} />
                            <Button
                                onClick={() => window.open('/tools', '_blank')}
                                className="bg-gradient-to-r from-blue-600 to-orange-500 hover:from-blue-700 hover:to-orange-600 text-white font-bold px-6 py-2 rounded-lg shadow-lg transition-all duration-300 transform hover:scale-105"
                            >
                                开始新任务
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>

        {/* 检查报告弹窗 */}
        {checkReportDialog.open && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg shadow-xl max-w-4xl max-h-[80vh] w-full mx-4 flex flex-col">
                    <div className="flex items-center justify-between p-6 border-b">
                        <h2 className="text-xl font-bold text-gray-900">数据检查报告</h2>
                        <button
                            onClick={() => setCheckReportDialog({ open: false, content: '' })}
                            className="text-gray-400 hover:text-gray-600 transition-colors"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    <div className="flex-1 overflow-auto p-6">
                        <pre className="whitespace-pre-wrap text-sm font-mono bg-gray-50 p-4 rounded border">
                            {checkReportDialog.content || '暂无检查报告内容'}
                        </pre>
                    </div>
                    <div className="flex justify-end p-6 border-t">
                        <button
                            onClick={() => setCheckReportDialog({ open: false, content: '' })}
                            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
                        >
                            关闭
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
};

export default SdcGeneratorSubmitThrpages;
