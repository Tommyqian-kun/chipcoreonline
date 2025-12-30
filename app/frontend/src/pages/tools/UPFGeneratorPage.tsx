"use client";

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2, FileText, Upload, CheckCircle, AlertCircle, Download } from 'lucide-react';
import { useToolExecution, ValidationConfig } from '@/hooks/useToolExecution';
import { useToolPageNavigation } from '@/hooks/useToolPageNavigation';
import { useToast } from '@/hooks/use-toast';
import { ToolSubmissionButton, ToolDownloadButton } from '@/components/common/ToolButtons';
import { EcsOnlyStatusIndicator } from '@/components/EcsOnlyStatusIndicator';
import { EnhancedFileUpload } from '@/components/common/EnhancedFileUpload';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ToolPageTaskHistoryButton } from '@/components/shared/TaskHistoryButton';
import TaskProgressBar from '@/components/shared/TaskProgressBar';

// UPF表单验证Schema
const upfFormSchema = z.object({
    modName: z.string().min(1, "模块名称不能为空"),
    version: z.string().min(1, "版本不能为空"),
    isFlat: z.boolean().default(false),
    hierYamlFile: z.instanceof(File).optional(),
    pvlogFile: z.instanceof(File).optional(),
    pobjTclFile: z.instanceof(File).optional(),
    pcontXlsxFile: z.instanceof(File).optional()
});

type UPFFormValues = z.infer<typeof upfFormSchema>;

// UPF工具验证配置
const upfValidationConfig: ValidationConfig = {
    modNameRequired: true,
    requiredFiles: [
        { fieldName: 'hierYamlFile', fileName: 'hier.yaml', fileType: 'yaml', required: true },
        { fieldName: 'pvlogFile', fileName: 'pvlog.v', fileType: 'verilog', required: true },
        { fieldName: 'pobjTclFile', fileName: 'pobj.tcl', fileType: 'tcl', required: true },
        { fieldName: 'pcontXlsxFile', fileName: 'pcont.xlsx', fileType: 'excel', required: true }
    ],
    maxFileSize: 5 * 1024 * 1024, // 5MB
};

// 文件上传组件接口
interface FileUploadSectionProps {
    title: string;
    field: any;
    onChange: (file: File | null) => void;
    accept: string;
    placeholder: string;
    form: any;
    name: string;
}

// 文件上传组件
const FileUploadSection: React.FC<FileUploadSectionProps> = ({
    title,
    field,
    onChange,
    accept,
    placeholder,
    form,
    name
}) => {
    const value = field;

    return (
        <div className="border-2 border-dashed border-orange-300 rounded-lg p-4">
            <div className="mb-2">
                <Label className="text-orange-600 font-semibold text-lg">{title}</Label>
            </div>
            <FormField control={form.control} name={name} render={({ field }) => (
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
                                <span className={value ? 'text-green-700 font-medium' : 'text-gray-500'}>
                                    {value ? value.name : placeholder}
                                </span>
                            </Label>
                            <input
                                id={`${name}-upload`}
                                type="file"
                                accept={accept}
                                className="hidden"
                                onChange={(e) => {
                                    const file = e.target.files?.[0] || null;
                                    onChange(file);
                                    field.onChange(file);
                                }}
                            />
                        </div>
                    </FormControl>
                    <FormMessage />
                </FormItem>
            )} />
        </div>
    );
};

export default function UPFGeneratorPage() {
    const navigate = useNavigate();
    const { taskStatus, submitTaskWithValidation, resetTask, handleDownload } = useToolExecution();
    const { handleGuidanceClick, handleTemplateDownload } = useToolPageNavigation(taskStatus);
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

    // UPF文件验证状态管理
    const [fileValidationStates, setFileValidationStates] = useState({
        hierYaml: { isValid: false, error: '' },
        pvlog: { isValid: false, error: '' },
        pobjTcl: { isValid: false, error: '' },
        pcontXlsx: { isValid: false, error: '' }
    });

    // 表单初始化
    const form = useForm<UPFFormValues>({
        resolver: zodResolver(upfFormSchema),
        defaultValues: {
            modName: '',
            version: '2.1', // 默认值为2.1
            isFlat: false,
            hierYamlFile: undefined,
            pvlogFile: undefined,
            pobjTclFile: undefined,
            pcontXlsxFile: undefined
        }
    });

    // 页面加载时获取历史记录
    useEffect(() => {
        const savedHistory = localStorage.getItem('upf_modname_history');
        if (savedHistory) {
            try {
                setModNameHistory(JSON.parse(savedHistory));
            } catch (error) {
                console.error('解析历史记录失败:', error);
            }
        }
    }, []);

    // 保存ModName到历史记录
    const saveModNameToHistory = (modName: string) => {
        if (!modName.trim()) return;

        const newHistory = [modName, ...modNameHistory.filter(name => name !== modName)].slice(0, 5);
        setModNameHistory(newHistory);
        localStorage.setItem('upf_modname_history', JSON.stringify(newHistory));
    };

    // UPF文件验证状态更新处理
    const handleFileValidationChange = (fileType: 'hierYaml' | 'pvlog' | 'pobjTcl' | 'pcontXlsx') =>
        (isValid: boolean, error?: string) => {
            setFileValidationStates(prev => ({
                ...prev,
                [fileType]: { isValid, error: error || '' }
            }));
        };

    // 检查所有UPF文件是否验证通过
    const allFilesValid = fileValidationStates.hierYaml.isValid &&
                         fileValidationStates.pvlog.isValid &&
                         fileValidationStates.pobjTcl.isValid &&
                         fileValidationStates.pcontXlsx.isValid;





    // 表单提交处理
    const onSubmit = async (data: UPFFormValues) => {
        console.log('UPF表单提交:', data);

        try {
            // 保存ModName到历史记录
            saveModNameToHistory(data.modName);

            // 1. 检查ModName
            if (!data.modName || data.modName.trim().length === 0) {
                throw new Error('ModName不能为空');
            }

            if (!/^[a-zA-Z0-9_]+$/.test(data.modName)) {
                throw new Error('ModName只能包含字母、数字和下划线');
            }

            // 2. 检查文件是否都已上传
            if (!data.hierYamlFile || !data.pvlogFile || !data.pobjTclFile || !data.pcontXlsxFile) {
                throw new Error('请上传所有必需的文件：hier.yaml、pvlog.v、pobj.tcl、pcont.xlsx');
            }

            // 3. 检查文件验证状态（利用立即验证结果）
            if (!allFilesValid) {
                const invalidFiles = [];
                if (!fileValidationStates.hierYaml.isValid) {
                    invalidFiles.push(`hier.yaml (${fileValidationStates.hierYaml.error})`);
                }
                if (!fileValidationStates.pvlog.isValid) {
                    invalidFiles.push(`pvlog.v (${fileValidationStates.pvlog.error})`);
                }
                if (!fileValidationStates.pobjTcl.isValid) {
                    invalidFiles.push(`pobj.tcl (${fileValidationStates.pobjTcl.error})`);
                }
                if (!fileValidationStates.pcontXlsx.isValid) {
                    invalidFiles.push(`pcont.xlsx (${fileValidationStates.pcontXlsx.error})`);
                }

                throw new Error(`以下文件验证失败，请重新选择：\n${invalidFiles.join('\n')}`);
            }

            // 4. 验证模块名是否与pvlog文件中的模块名匹配
            if (!validateModuleName(data.modName, moduleNameFromVlog)) {
                if (!moduleNameFromVlog) {
                    throw new Error('无法从pvlog文件中解析出模块名，请检查文件格式是否正确');
                } else {
                    throw new Error(`模块名不匹配！\n输入的ModName: "${data.modName}"\npvlog文件中的模块名: "${moduleNameFromVlog}"\n请确保两者完全一致`);
                }
            }

            // 准备文件数组
            const inputFiles: File[] = [];
            if (data.hierYamlFile) inputFiles.push(data.hierYamlFile);
            if (data.pvlogFile) inputFiles.push(data.pvlogFile);
            if (data.pobjTclFile) inputFiles.push(data.pobjTclFile);
            if (data.pcontXlsxFile) inputFiles.push(data.pcontXlsxFile);

            // 使用带验证的提交函数
            await submitTaskWithValidation(
                {
                    toolId: 'upf-generator',
                    parameters: {
                        modName: data.modName,
                        version: data.version,
                        isFlat: data.isFlat
                    },
                    inputFiles: inputFiles,
                },
                upfValidationConfig,
                data
            );

        } catch (error) {
            console.error('任务提交错误:', error);
            toast({
                title: "提交失败",
                description: error instanceof Error ? error.message : '未知错误',
                variant: "destructive",
            });
        }
    };



    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="container mx-auto max-w-4xl p-4 sm:p-6 lg:p-8"
        >
            <div className="space-y-6">
                {/* UPF需求输入框 */}
                <div className="relative">
                    <Card className="border-2 border-orange-400 shadow-lg">
                        <CardHeader className="relative">
                            <CardTitle className="text-2xl md:text-3xl font-bold text-blue-600">
                                UPF需求输入：
                            </CardTitle>
                            <div className="absolute top-4 right-4 flex space-x-3">
                                <Button
                                    className="bg-white border-2 border-orange-600 text-orange-600 hover:bg-orange-50 font-bold text-lg px-6 py-2 rounded-lg shadow-md transform transition-all duration-200 hover:scale-105 hover:shadow-lg"
                                    onClick={() => handleGuidanceClick('upf-generator')}
                                >
                                    Guidance
                                </Button>
                                <Button
                                    className="bg-white border-2 border-orange-600 text-orange-600 hover:bg-orange-50 font-bold text-lg px-6 py-2 rounded-lg shadow-md transform transition-all duration-200 hover:scale-105 hover:shadow-lg"
                                    onClick={() => handleTemplateDownload('upf-generator')}
                                >
                                    <Download className="mr-2 h-4 w-4" />
                                    Template
                                </Button>
                            </div>
                        </CardHeader>
                    <CardContent>
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                                {/* 参数设置区域 */}
                                <div className="bg-gray-50 p-4 rounded-lg">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                        {/* ModName输入 */}
                                        <FormField control={form.control} name="modName" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-orange-600 font-semibold text-lg">ModName</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        placeholder="输入模块名称"
                                                        {...field}
                                                        onChange={(e) => {
                                                            field.onChange(e);
                                                            setCurrentModName(e.target.value);
                                                        }}
                                                        className="border-orange-300 focus:border-orange-500"
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )} />

                                        {/* 水平布局的Version和IsFlat */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            {/* Version选择 - 禁用状态，默认2.1 */}
                                            <FormField control={form.control} name="version" render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-orange-600 font-semibold text-lg">Version</FormLabel>
                                                    <FormControl>
                                                        <Select onValueChange={field.onChange} value={field.value} disabled={true}>
                                                            <SelectTrigger className="border-orange-300 bg-gray-100 text-gray-500">
                                                                <SelectValue placeholder="选择版本" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="2.0">2.0</SelectItem>
                                                                <SelectItem value="2.1">2.1</SelectItem>
                                                                <SelectItem value="3.0">3.0</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )} />

                                            {/* IsFlat下拉框 - 禁用状态，默认False */}
                                            <FormField control={form.control} name="isFlat" render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-orange-600 font-semibold text-lg">IsFlat</FormLabel>
                                                    <FormControl>
                                                        <Select value={field.value ? "true" : "false"} disabled={true}>
                                                            <SelectTrigger className="border-orange-300 bg-gray-100 text-gray-500">
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
                                </div>

                                {/* UPF文件上传区域 - 使用增强的立即验证组件 */}
                                <div className="space-y-4">
                                    {/* hier.yaml上传 */}
                                    <FormField control={form.control} name="hierYamlFile" render={({ field }) => (
                                        <EnhancedFileUpload
                                            title="上传hier.yaml"
                                            name="hierYamlFile"
                                            accept=".yaml,.yml"
                                            placeholder="点击或拖拽上传(.yaml)"
                                            fileType="yaml"
                                            toolType="upf"
                                            onFileChange={(file) => form.setValue('hierYamlFile', file)}
                                            onValidationChange={handleFileValidationChange('hierYaml')}
                                            field={field}
                                        />
                                    )} />

                                    {/* pvlog.v上传 */}
                                    <FormField control={form.control} name="pvlogFile" render={({ field }) => (
                                        <div>
                                            <EnhancedFileUpload
                                                title="上传pvlog.v"
                                                name="pvlogFile"
                                                accept=".v,.sv"
                                                placeholder="点击或拖拽上传(.v)"
                                                fileType="verilog"
                                                toolType="upf"
                                                currentModName={currentModName}
                                                onModuleNameParsed={setModuleNameFromVlog}
                                                onFileChange={async (file) => {
                                                    form.setValue('pvlogFile', file);
                                                    if (!file) {
                                                        setModuleNameFromVlog(null);
                                                    }
                                                }}
                                                onValidationChange={handleFileValidationChange('pvlog')}
                                                field={field}
                                            />
                                            {/* 模块名不一致警告 */}
                                            {moduleNameFromVlog && currentModName && !validateModuleName(currentModName, moduleNameFromVlog) && (
                                                <div className="mt-2 p-3 bg-orange-50 border border-orange-300 rounded-md">
                                                    <p className="text-sm text-orange-700 font-medium">
                                                        ⚠️ ModName和pvlog文件中的模块名不一致
                                                    </p>
                                                    <p className="text-xs text-orange-600 mt-1">
                                                        输入的ModName: "{currentModName}" | pvlog文件中的模块名: "{moduleNameFromVlog}"
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )} />

                                    {/* pobj.tcl上传 */}
                                    <FormField control={form.control} name="pobjTclFile" render={({ field }) => (
                                        <EnhancedFileUpload
                                            title="上传pobj.tcl"
                                            name="pobjTclFile"
                                            accept=".tcl"
                                            placeholder="点击或拖拽上传(.tcl)"
                                            fileType="tcl"
                                            toolType="upf"
                                            onFileChange={(file) => form.setValue('pobjTclFile', file)}
                                            onValidationChange={handleFileValidationChange('pobjTcl')}
                                            field={field}
                                        />
                                    )} />

                                    {/* pcont.xlsx上传 */}
                                    <FormField control={form.control} name="pcontXlsxFile" render={({ field }) => (
                                        <EnhancedFileUpload
                                            title="上传pcont.xlsx"
                                            name="pcontXlsxFile"
                                            accept=".xlsx,.xls"
                                            placeholder="点击或拖拽上传(.xlsx)"
                                            fileType="excel"
                                            toolType="upf"
                                            onFileChange={(file) => form.setValue('pcontXlsxFile', file)}
                                            onValidationChange={handleFileValidationChange('pcontXlsx')}
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
                                        onClick={form.handleSubmit(onSubmit)}
                                    />
                                </div>
                            </form>
                        </Form>
                    </CardContent>
                </Card>
                    {/* 任务历史按钮和开始新任务按钮 - 绝对定位在Card外面的右侧，与Template按钮水平对齐 */}
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

                {/* UPF数据输出框 */}
                <Card className="border-2 border-orange-400 shadow-lg">
                    <CardHeader>
                        <CardTitle className="text-2xl md:text-3xl font-bold text-blue-600">
                            UPF数据输出：
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex justify-center">
                            <ToolDownloadButton
                                taskStatus={taskStatus}
                                onClick={() => handleDownload('result')}
                                fileName="upf_result"
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
}

// 任务状态显示组件
const TaskStatusDisplay = ({ taskStatus, resetTask }: { taskStatus: any, resetTask: () => void }) => {
    const { toast } = useToast();

    // 任务完成时显示通知
    React.useEffect(() => {
        if (taskStatus.status === 'COMPLETED' && taskStatus.resultUrl) {
            toast({
                title: "任务已经完成，请下载数据",
                description: "UPF文件生成完成，点击下载按钮获取结果",
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

            {/* 任务ID显示 */}
            {taskStatus.taskId && (
                <Alert variant="default" className="border-blue-500 bg-blue-50 text-blue-700">
                    <CheckCircle className="h-4 w-4" />
                    <AlertTitle className="text-blue-800 font-bold">任务已提交</AlertTitle>
                    <AlertDescription className="text-blue-700">
                        任务ID: <span className="font-mono">{taskStatus.taskId}</span>
                    </AlertDescription>
                </Alert>
            )}

            {/* 处理中状态 */}
            {taskStatus.status === 'POLLING' && (
                <Alert variant="default" className="border-yellow-500 bg-yellow-50 text-yellow-700">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <AlertTitle className="text-yellow-800 font-bold">⚙️ 正在处理任务...</AlertTitle>
                    <AlertDescription className="text-yellow-700">
                        UPF生成工具正在运行，请耐心等待。预计需要2-5分钟。
                    </AlertDescription>
                </Alert>
            )}

            {/* 失败状态 */}
            {taskStatus.status === 'FAILED' && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle className="font-bold">❌ 任务执行失败</AlertTitle>
                    <AlertDescription>
                        {taskStatus.errorMessage || '任务执行过程中发生错误，请检查输入参数和文件。'}
                    </AlertDescription>
                </Alert>
            )}

            {/* 完成状态 */}
            {taskStatus.status === 'COMPLETED' && (
                <Alert variant="default" className="border-green-500 bg-green-50 text-green-700">
                    <AlertTitle className="text-green-800 font-bold text-lg">🎉 任务成功完成！</AlertTitle>
                    <AlertDescription className="text-green-700 text-base">
                        UPF文件已生成完成，包含outputs、logs和rpts三个目录的完整数据。
                        <br />
                        <span className="font-semibold">请点击上方橙色的"Download Generated Results"按钮下载结果。</span>
                    </AlertDescription>
                </Alert>
            )}


        </div>
    );
};
