import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useToolExecution, TaskStatus } from '../../hooks/useToolExecution';
import { useToolPageNavigation } from '@/hooks/useToolPageNavigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { Upload, Loader2, Download, FileText, HelpCircle, CheckCircle, AlertCircle } from 'lucide-react';
import { ToolSubmissionButton, ToolDownloadButton } from '@/components/common/ToolButtons';
import { EcsOnlyStatusIndicator } from '@/components/EcsOnlyStatusIndicator';
import { EnhancedFileUpload } from '@/components/common/EnhancedFileUpload';
import { validateFileContent } from '@/utils/fileValidation';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { ToolPageTaskHistoryButton } from '@/components/shared/TaskHistoryButton';
import TaskProgressBar from '@/components/shared/TaskProgressBar';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const sdcFormSchema = z.object({
  modName: z.string().min(1, "模块名称不能为空"),
  isFlat: z.boolean().default(false),
  hierYamlFile: z.any()
    .refine((file) => {
      if (typeof window === 'undefined') return true;
      return file instanceof File;
    }, "必须上传hier.yaml文件")
    .refine((file) => {
      if (typeof window === 'undefined') return true;
      if (!file) return false;
      return file.size <= MAX_FILE_SIZE;
    }, "文件大小不能超过5MB")
    .refine((file) => {
      if (typeof window === 'undefined') return true;
      if (!file) return false;
      return file.name.endsWith('.yaml') || file.name.endsWith('.yml');
    }, "只支持.yaml或.yml格式的文件"),
  vlogFile: z.any()
    .refine((file) => {
      if (typeof window === 'undefined') return true;
      return file instanceof File;
    }, "必须上传vlog.v文件")
    .refine((file) => {
      if (typeof window === 'undefined') return true;
      if (!file) return false;
      return file.size <= MAX_FILE_SIZE;
    }, "文件大小不能超过5MB")
    .refine((file) => {
      if (typeof window === 'undefined') return true;
      if (!file) return false;
      return file.name.endsWith('.v') || file.name.endsWith('.sv');
    }, "只支持.v或.sv格式的文件"),
  dcontFile: z.any()
    .refine((file) => {
      if (typeof window === 'undefined') return true;
      return file instanceof File;
    }, "必须上传dcont.xlsx文件")
    .refine((file) => {
      if (typeof window === 'undefined') return true;
      if (!file) return false;
      return file.size <= MAX_FILE_SIZE;
    }, "文件大小不能超过5MB")
    .refine((file) => {
      if (typeof window === 'undefined') return true;
      if (!file) return false;
      return file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    }, "只支持.xlsx或.xls格式的文件"),
});

type SdcFormValues = z.infer<typeof sdcFormSchema>;

// 文件上传组件
interface FileUploadSectionProps {
  title: string;
  field: any;
  onChange: (file: File | null) => void;
  accept: string;
  placeholder: string;
  form: any;
  name: string;
}

const FileUploadSection: React.FC<FileUploadSectionProps> = ({
  title,
  field,
  onChange,
  accept,
  placeholder,
  form,
  name
}) => {
  return (
    <div className="border-2 border-dashed border-orange-300 rounded-lg p-4">
      <div className="mb-2">
        <Label className="text-orange-600 font-semibold text-lg">{title}</Label>
      </div>
      <FormField
        control={form.control}
        name={name}
        render={({ field: { onChange: fieldOnChange, value, ...rest } }) => (
          <FormItem>
            <FormControl>
              <div>
                <Label
                  htmlFor={`${name}-upload`}
                  className={`flex items-center space-x-2 border-2 border-dashed rounded-lg p-4 cursor-pointer transition-colors ${
                    value ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-orange-500 hover:bg-orange-50'
                  }`}
                >
                  {value ? (
                    <FileText className="h-5 w-5 text-green-700" />
                  ) : (
                    <Upload className="h-5 w-5 text-gray-500" />
                  )}
                  <span className={value ? 'text-green-800' : 'text-gray-600'}>
                    {value?.name || placeholder}
                  </span>
                </Label>
                <Input
                  id={`${name}-upload`}
                  type="file"
                  className="hidden"
                  accept={accept}
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    fieldOnChange(file);
                    onChange(file);
                  }}
                  {...rest}
                />
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
};

const SdcGeneratorPage: React.FC = () => {
    const { taskStatus, submitTask, resetTask, handleDownload, setTaskStatus } = useToolExecution();
    const { handleGuidanceClick, handleTemplateDownload } = useToolPageNavigation(taskStatus);
    const navigate = useNavigate();
    const { toast } = useToast();
    const [modNameHistory, setModNameHistory] = useState<string[]>([]);
    const [moduleNameFromVlog, setModuleNameFromVlog] = useState<string | null>(null);
    const [currentModName, setCurrentModName] = useState<string>('');

    // 解析vlog文件中的模块名
    const parseModuleNameFromVlog = async (file: File): Promise<string | null> => {
        try {
            const text = await file.text();
            // 匹配 module 关键字后面的模块名
            const moduleMatch = text.match(/^\s*module\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/m);
            if (moduleMatch && moduleMatch[1]) {
                return moduleMatch[1].trim();
            }
            return null;
        } catch (error) {
            console.error('解析vlog文件失败:', error);
            return null;
        }
    };

    // 验证模块名是否匹配
    const validateModuleName = (inputModName: string, vlogModName: string | null): boolean => {
        if (!vlogModName) return false;
        return inputModName.trim() === vlogModName.trim();
    };

    // 文件验证状态管理
    const [fileValidationStates, setFileValidationStates] = useState({
        hierYaml: { isValid: false, error: '' },
        vlog: { isValid: false, error: '' },
        dcont: { isValid: false, error: '' }
    });

    // 加载ModName历史记录
    useEffect(() => {
        const history = localStorage.getItem('sdc_modname_history');
        if (history) {
            setModNameHistory(JSON.parse(history));
        }
    }, []);

    const form = useForm<SdcFormValues>({
        resolver: zodResolver(sdcFormSchema),
        defaultValues: {
            modName: '',
            isFlat: false,
            hierYamlFile: undefined,
            vlogFile: undefined,
            dcontFile: undefined,
        },
    });

    // 保存ModName到历史记录
    const saveModNameToHistory = (modName: string) => {
        if (modName && !modNameHistory.includes(modName)) {
            const newHistory = [modName, ...modNameHistory.slice(0, 9)]; // 保留最近10个
            setModNameHistory(newHistory);
            localStorage.setItem('sdc_modname_history', JSON.stringify(newHistory));
        }
    };

    // 文件验证状态更新处理
    const handleFileValidationChange = (fileType: 'hierYaml' | 'vlog' | 'dcont') =>
        (isValid: boolean, error?: string) => {
            setFileValidationStates(prev => ({
                ...prev,
                [fileType]: { isValid, error: error || '' }
            }));
        };

    // 检查所有文件是否验证通过
    const allFilesValid = fileValidationStates.hierYaml.isValid &&
                         fileValidationStates.vlog.isValid &&
                         fileValidationStates.dcont.isValid;

    // 文件内容检查函数
    const validateFileContent = async (file: File, expectedType: string): Promise<{ valid: boolean; error?: string }> => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target?.result as string;

                // 检查文件是否为空
                if (!content || content.trim().length === 0) {
                    resolve({ valid: false, error: `${file.name} 文件内容为空` });
                    return;
                }

                // 根据文件类型进行基本格式检查
                if (expectedType === 'yaml' && file.name.endsWith('.yaml')) {
                    // 检查YAML基本格式
                    if (!content.includes('pwr:') && !content.includes('hier:')) {
                        resolve({ valid: false, error: `${file.name} 不符合hier.yaml模板格式，缺少必要的pwr或hier字段` });
                        return;
                    }
                } else if (expectedType === 'verilog' && file.name.endsWith('.v')) {
                    // 检查Verilog基本格式 - 允许空文件
                    if (content.trim() !== '' && !content.includes('module')) {
                        resolve({ valid: false, error: `${file.name} 不符合Verilog格式，应包含module声明或为空文件` });
                        return;
                    }
                } else if (expectedType === 'excel' && file.name.endsWith('.xlsx')) {
                    // Excel文件基本检查（检查是否为二进制格式）
                    if (file.size < 100) {
                        resolve({ valid: false, error: `${file.name} 文件过小，可能不是有效的Excel文件` });
                        return;
                    }
                }

                resolve({ valid: true });
            };
            reader.onerror = () => {
                resolve({ valid: false, error: `无法读取文件 ${file.name}` });
            };

            // 对于Excel文件，不读取内容，只检查大小
            if (expectedType === 'excel') {
                resolve({ valid: true });
            } else {
                reader.readAsText(file);
            }
        });
    };

    const onSubmit = async (data: SdcFormValues) => {
        const { modName, isFlat, hierYamlFile, vlogFile, dcontFile } = data;

        try {
            // 设置检查状态
            setTaskStatus(prev => ({ ...prev, status: 'VALIDATING' }));



            // 1. 检查ModName
            if (!modName || modName.trim().length === 0) {
                throw new Error('ModName不能为空');
            }

            if (!/^[a-zA-Z0-9_]+$/.test(modName)) {
                throw new Error('ModName只能包含字母、数字和下划线');
            }

            // 2. 检查文件是否都已上传
            if (!hierYamlFile || !vlogFile || !dcontFile) {
                throw new Error('请上传所有必需的文件：hier.yaml、vlog.v、dcont.xlsx');
            }

            // 3. 检查文件验证状态（利用立即验证结果）
            if (!allFilesValid) {
                const invalidFiles = [];
                if (!fileValidationStates.hierYaml.isValid) {
                    invalidFiles.push(`hier.yaml (${fileValidationStates.hierYaml.error})`);
                }
                if (!fileValidationStates.vlog.isValid) {
                    invalidFiles.push(`vlog.v (${fileValidationStates.vlog.error})`);
                }
                if (!fileValidationStates.dcont.isValid) {
                    invalidFiles.push(`dcont.xlsx (${fileValidationStates.dcont.error})`);
                }

                throw new Error(`以下文件验证失败，请重新选择：\n${invalidFiles.join('\n')}`);
            }

            // 4. 验证模块名是否与vlog文件中的模块名匹配
            if (!validateModuleName(modName, moduleNameFromVlog)) {
                if (!moduleNameFromVlog) {
                    throw new Error('无法从vlog文件中解析出模块名，请检查文件格式是否正确');
                } else {
                    throw new Error(`模块名不匹配！\n输入的ModName: "${modName}"\nvlog文件中的模块名: "${moduleNameFromVlog}"\n请确保两者完全一致`);
                }
            }

            // 检查通过，显示成功提示
            toast({
                title: "✅ 输入检查通过！",
                description: "所有文件和参数验证成功，正在提交任务...",
                duration: 2000,
            });

            // 保存ModName到历史记录
            saveModNameToHistory(modName);

            // 准备多文件数组
            const inputFiles: File[] = [];
            if (hierYamlFile) inputFiles.push(hierYamlFile);
            if (vlogFile) inputFiles.push(vlogFile);
            if (dcontFile) inputFiles.push(dcontFile);

            // 修复：将parameters转换为JSON字符串，符合后端验证schema
            submitTask({
                toolId: 'sdc-generator',
                parameters: JSON.stringify({ modName, isFlat }),
                inputFiles: inputFiles,
            });

        } catch (error) {
            // 检查失败，显示错误提示
            toast({
                title: "❌ 输入检查失败",
                description: (error as Error).message,
                variant: "destructive",
                duration: 5000,
            });

            // 重置状态
            setTaskStatus(prev => ({ ...prev, status: 'IDLE' }));
        }
    };




    
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5 }}
            className="container mx-auto max-w-4xl p-4 sm:p-6 lg:p-8"
        >
            <div className="space-y-6">
                {/* SDC需求输入框 */}
                <div className="relative">
                    <Card className="border-2 border-orange-400 shadow-lg">
                        <CardHeader className="relative">
                            <CardTitle className="text-2xl md:text-3xl font-bold text-blue-600">
                                SDC需求输入：
                            </CardTitle>
                            <div className="absolute top-4 right-4 flex space-x-3">
                                <Button
                                    className="bg-white border-2 border-orange-600 text-orange-600 hover:bg-orange-50 font-bold text-lg px-6 py-2 rounded-lg shadow-md transform transition-all duration-200 hover:scale-105 hover:shadow-lg"
                                    onClick={() => handleGuidanceClick('sdc-generator')}
                                >
                                    Guidance
                                </Button>
                                <Button
                                    className="bg-white border-2 border-orange-600 text-orange-600 hover:bg-orange-50 font-bold text-lg px-6 py-2 rounded-lg shadow-md transform transition-all duration-200 hover:scale-105 hover:shadow-lg"
                                    onClick={() => handleTemplateDownload('sdc-generator')}
                                >
                                    <Download className="mr-2 h-4 w-4" />
                                    Template
                                </Button>
                            </div>
                        </CardHeader>
                    <CardContent>
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                                {/* ModName和IsFlat参数区域 */}
                                <div className="bg-gray-50 p-4 rounded-lg">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                                        {/* ModName输入 */}
                                        <FormField control={form.control} name="modName" render={({ field }) => {
                                            const [inputValue, setInputValue] = useState(field.value || '');
                                            const [showDropdown, setShowDropdown] = useState(false);

                                            // 过滤历史记录
                                            const filteredHistory = modNameHistory.filter(name =>
                                                name.toLowerCase().includes(inputValue.toLowerCase())
                                            );

                                            const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                                                const value = e.target.value;
                                                setInputValue(value);
                                                setCurrentModName(value);
                                                field.onChange(value);
                                                setShowDropdown(value.length > 0 && filteredHistory.length > 0);
                                            };

                                            const handleSelectHistory = (name: string) => {
                                                setInputValue(name);
                                                setCurrentModName(name); // 同步更新currentModName状态
                                                field.onChange(name);
                                                setShowDropdown(false);
                                            };

                                            return (
                                                <FormItem className="relative">
                                                    <FormLabel className="text-orange-600 font-semibold text-lg">ModName</FormLabel>
                                                    <FormControl>
                                                        <div className="relative">
                                                            <Input
                                                                placeholder="输入模块名称"
                                                                value={inputValue}
                                                                onChange={handleInputChange}
                                                                onFocus={() => setShowDropdown(inputValue.length > 0 && filteredHistory.length > 0)}
                                                                onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                                                                className="border-orange-300 focus:border-orange-500"
                                                            />
                                                            {showDropdown && filteredHistory.length > 0 && (
                                                                <div className="absolute top-full left-0 right-0 z-50 bg-white border border-orange-300 rounded-md shadow-lg max-h-40 overflow-y-auto">
                                                                    <div className="px-2 py-1 text-xs text-gray-500 border-b">历史记录</div>
                                                                    {filteredHistory.map((name, index) => (
                                                                        <div
                                                                            key={index}
                                                                            className="px-3 py-2 hover:bg-orange-50 cursor-pointer text-sm"
                                                                            onMouseDown={() => handleSelectHistory(name)}
                                                                        >
                                                                            {name}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            );
                                        }} />

                                        {/* IsFlat下拉框 - 禁用状态，默认False */}
                                        <FormField control={form.control} name="isFlat" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-orange-600 font-semibold text-lg">IsFlat</FormLabel>
                                                <FormControl>
                                                    <Select value={field.value ? "true" : "false"} disabled={true}>
                                                        <SelectTrigger className="border-orange-300 bg-gray-100 text-gray-500 w-1/3">
                                                            <SelectValue placeholder="选择模式" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="false">False</SelectItem>
                                                            <SelectItem value="true">True</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                    </div>
                                </div>

                                {/* 文件上传区域 - 使用增强的立即验证组件 */}
                                <div className="space-y-4">
                                    {/* hier.yaml上传 */}
                                    <FormField control={form.control} name="hierYamlFile" render={({ field }) => (
                                        <EnhancedFileUpload
                                            title="上传hier.yaml"
                                            name="hierYamlFile"
                                            accept=".yaml,.yml"
                                            placeholder="点击或拖拽上传(.yaml)"
                                            fileType="yaml"
                                            toolType="sdc"
                                            onFileChange={(file) => form.setValue('hierYamlFile', file)}
                                            onValidationChange={handleFileValidationChange('hierYaml')}
                                            field={field}
                                        />
                                    )} />

                                    {/* vlog.v上传 */}
                                    <FormField control={form.control} name="vlogFile" render={({ field }) => (
                                        <div>
                                            <EnhancedFileUpload
                                                title="上传vlog.v"
                                                name="vlogFile"
                                                accept=".v,.sv"
                                                placeholder="点击或拖拽上传(.v)"
                                                fileType="verilog"
                                                toolType="sdc"
                                                currentModName={currentModName}
                                                onModuleNameParsed={setModuleNameFromVlog}
                                                onFileChange={async (file) => {
                                                    form.setValue('vlogFile', file);
                                                    if (!file) {
                                                        setModuleNameFromVlog(null);
                                                    }
                                                }}
                                                onValidationChange={handleFileValidationChange('vlog')}
                                                field={field}
                                            />
                                            {/* 模块名不一致警告 */}
                                            {moduleNameFromVlog && currentModName && !validateModuleName(currentModName, moduleNameFromVlog) && (
                                                <div className="mt-2 p-3 bg-orange-50 border border-orange-300 rounded-md">
                                                    <p className="text-sm text-orange-700 font-medium">
                                                        ⚠️ ModName和vlog文件中的模块名不一致
                                                    </p>
                                                    <p className="text-xs text-orange-600 mt-1">
                                                        输入的ModName: "{currentModName}" | vlog文件中的模块名: "{moduleNameFromVlog}"
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )} />

                                    {/* dcont.xlsx上传 */}
                                    <FormField control={form.control} name="dcontFile" render={({ field }) => (
                                        <EnhancedFileUpload
                                            title="上传dcont.xlsx"
                                            name="dcontFile"
                                            accept=".xlsx,.xls"
                                            placeholder="点击或拖拽上传(.xlsx)"
                                            fileType="excel"
                                            toolType="sdc"
                                            onFileChange={(file) => form.setValue('dcontFile', file)}
                                            onValidationChange={handleFileValidationChange('dcont')}
                                            field={field}
                                        />
                                    )} />
                                </div>

                                {/* 提交按钮 - 使用公共组件 */}
                                <div className="flex justify-end mt-6">
                                    <ToolSubmissionButton
                                        taskStatus={taskStatus}
                                        isSubmitting={form.formState.isSubmitting}
                                        disabled={!allFilesValid}
                                    />
                                </div>
                            </form>
                        </Form>
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

                {/* SDC数据输出框 */}
                <Card className="border-2 border-orange-400 shadow-lg">
                    <CardHeader>
                        <CardTitle className="text-2xl md:text-3xl font-bold text-blue-600">
                            SDC数据输出：
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex justify-center">
                            <ToolDownloadButton
                                taskStatus={taskStatus}
                                onClick={() => handleDownload('result')}
                                fileName="sdc_result"
                            />
                        </div>

                        {/* 任务进度条显示 */}
                        {taskStatus.status !== 'IDLE' && (
                            <div className="mt-6">
                                <TaskProgressBar
                                    status={taskStatus.status}
                                    currentStep={taskStatus.currentStep}
                                    taskId={taskStatus.taskId}
                                    variant="default"
                                    progress={taskStatus.progress}
                                />
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </motion.div>
    );
};

const TaskStatusDisplay = ({ taskStatus, resetTask }: { taskStatus: TaskStatus, resetTask: () => void }) => {
    const { toast } = useToast();

    // 任务完成时显示通知
    useEffect(() => {
        if (taskStatus.status === 'COMPLETED' && taskStatus.resultUrl) {
            toast({
                title: "任务已经完成，请下载数据",
                description: "SDC文件生成完成，点击下载按钮获取结果",
                duration: 5000,
            });
        }
    }, [taskStatus.status, taskStatus.resultUrl, toast]);

    return (
        <div className="space-y-4">
            {/* ECS Only模式状态指示器 */}
            <EcsOnlyStatusIndicator
                status={taskStatus.status}
                downloadTimeRemaining={taskStatus.downloadTimeRemaining}
                isDownloadExpired={taskStatus.isDownloadExpired}
                deploymentMode={taskStatus.deploymentMode}
                progress={taskStatus.progress}
            />

            {taskStatus.status === 'VALIDATING' && (
                <div className="text-center bg-purple-50 p-4 rounded-lg border border-purple-200">
                    <Loader2 className="h-8 w-8 animate-spin text-purple-600 mx-auto" />
                    <p className="mt-2 text-purple-700 font-semibold text-lg">正在检查用户输入...</p>
                    <p className="text-sm text-purple-600 mt-1">验证文件格式和参数有效性</p>
                </div>
            )}

            {taskStatus.status === 'SUBMITTING' && (
                <div className="text-center bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
                    <p className="mt-2 text-blue-700 font-semibold text-lg">正在提交任务...</p>
                    <p className="text-sm text-blue-600 mt-1">请勿重复点击提交按钮</p>
                </div>
            )}

            {taskStatus.status === 'POLLING' && (
                <div className="text-center bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                    <Loader2 className="h-8 w-8 animate-spin text-yellow-600 mx-auto" />
                    <p className="mt-2 text-yellow-700 font-semibold text-lg">正在执行任务... {taskStatus.progress}%</p>
                    <p className="text-sm text-yellow-600 mt-1">SDC工具正在生成约束文件，请耐心等待</p>
                    {taskStatus.taskId && (
                        <p className="text-xs text-gray-500 mt-2">任务ID: {taskStatus.taskId}</p>
                    )}
                </div>
            )}

            {taskStatus.errorMessage && (
                <Alert variant="destructive">
                    <AlertTitle>任务失败</AlertTitle>
                    <AlertDescription>{taskStatus.errorMessage}</AlertDescription>
                </Alert>
            )}

            {taskStatus.status === 'COMPLETED' && (
                <Alert variant="default" className="border-green-500 bg-green-50 text-green-700">
                    <AlertTitle className="text-green-800 font-bold text-lg">🎉 任务成功完成！</AlertTitle>
                    <AlertDescription className="text-green-700 text-base">
                        SDC文件已生成完成，包含outputs、logs和rpts三个目录的完整数据。
                        <br />
                        <span className="font-semibold">请点击上方橙色的"Download Generated Results"按钮下载结果。</span>
                    </AlertDescription>
                </Alert>
            )}


        </div>
    );
};

export default SdcGeneratorPage; 