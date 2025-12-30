/**
 * SDC工具多页面交互 - 初始化页面
 * 复用SdcGeneratorPage.tsx的所有UI组件和逻辑，去掉dcont.xlsx上传和下载区域
 */

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Loader2, Download, FileText, HelpCircle, CheckCircle, AlertCircle } from 'lucide-react';
import { EnhancedFileUpload } from '@/components/common/EnhancedFileUpload';
import { validateFileContent } from '@/utils/fileValidation';
import { motion } from 'framer-motion';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { useToolPageNavigation } from '@/hooks/useToolPageNavigation';
import { ToolPageTaskHistoryButton } from '@/components/shared/TaskHistoryButton';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth.context';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// 表单验证schema - 去掉dcont.xlsx
const initializeFormSchema = z.object({
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
});

type InitializeFormValues = z.infer<typeof initializeFormSchema>;

const SdcGeneratorInitializeThrpages: React.FC = () => {
    const { taskId } = useParams<{ taskId: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const { toast } = useToast();
    const { isAuthenticated, loading: authLoading } = useAuth();
    const { handleGuidanceClick, handleTemplateDownload } = useToolPageNavigation({ status: 'IDLE' });

    // 状态管理
    const [modNameHistory, setModNameHistory] = useState<string[]>([]);
    const [currentModName, setCurrentModName] = useState('');
    const [moduleNameFromVlog, setModuleNameFromVlog] = useState<string | null>(null);
    const [fileValidationStates, setFileValidationStates] = useState({
        hierYaml: { isValid: false, error: '' },
        vlog: { isValid: false, error: '' }
    });
    const [taskStatus, setTaskStatus] = useState({ status: 'IDLE', currentStep: '' });

    // 初始化表单
    const form = useForm<InitializeFormValues>({
        resolver: zodResolver(initializeFormSchema),
        defaultValues: {
            modName: '',
            isFlat: false,
            hierYamlFile: undefined,
            vlogFile: undefined,
        },
    });

    // 从localStorage加载ModName历史记录
    useEffect(() => {
        const savedHistory = localStorage.getItem('sdc_modname_history');
        if (savedHistory) {
            try {
                setModNameHistory(JSON.parse(savedHistory));
            } catch (error) {
                console.warn('Failed to parse ModName history:', error);
            }
        }
    }, []);

    // 保存ModName到历史记录
    const saveModNameToHistory = (modName: string) => {
        if (modName && !modNameHistory.includes(modName)) {
            const newHistory = [modName, ...modNameHistory.slice(0, 9)]; // 保留最近10个
            setModNameHistory(newHistory);
            localStorage.setItem('sdc_modname_history', JSON.stringify(newHistory));
        }
    };

    // 文件验证状态更新处理
    const handleFileValidationChange = (fileType: 'hierYaml' | 'vlog') =>
        (isValid: boolean, error?: string) => {
            setFileValidationStates(prev => ({
                ...prev,
                [fileType]: { isValid, error: error || '' }
            }));
        };

    // 检查所有文件是否验证通过
    const allFilesValid = fileValidationStates.hierYaml.isValid && fileValidationStates.vlog.isValid;

    // 模块名验证函数
    const validateModuleName = (inputModName: string, vlogModName: string | null): boolean => {
        if (!vlogModName) return false;
        return inputModName.trim() === vlogModName.trim();
    };



    const onSubmit = async (data: InitializeFormValues) => {
        const { modName, isFlat, hierYamlFile, vlogFile } = data;

        try {
            // 检查用户是否已登录
            if (!isAuthenticated) {
                toast({
                    title: "❌ 需要登录",
                    description: "请先登录后再使用此功能",
                    duration: 3000,
                });
                navigate('/auth/login', { state: { from: location } });
                return;
            }

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
            if (!hierYamlFile || !vlogFile) {
                throw new Error('请上传所有必需的文件：hier.yaml、vlog.v');
            }

            // 3. 检查文件验证状态
            if (!allFilesValid) {
                const invalidFiles = [];
                if (!fileValidationStates.hierYaml.isValid) {
                    invalidFiles.push(`hier.yaml (${fileValidationStates.hierYaml.error})`);
                }
                if (!fileValidationStates.vlog.isValid) {
                    invalidFiles.push(`vlog.v (${fileValidationStates.vlog.error})`);
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
                description: "所有文件和参数验证成功，正在初始化任务...",
                duration: 2000,
            });

            // 保存ModName到历史记录
            saveModNameToHistory(modName);

            // 准备多文件数组
            const inputFiles: File[] = [];
            if (hierYamlFile) inputFiles.push(hierYamlFile);
            if (vlogFile) inputFiles.push(vlogFile);

            // 调用初始化API
            const formData = new FormData();
            formData.append('modName', modName);
            formData.append('isFlat', isFlat.toString());
            formData.append('hierYamlFile', hierYamlFile);
            formData.append('vlogFile', vlogFile);

            const response = await fetch('/api/v1/sdc-thrpages/initialize', {
                method: 'POST',
                credentials: 'include',
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || '初始化失败');
            }

            const result = await response.json();

            toast({
                title: "🎉 初始化成功！",
                description: "任务已创建，正在跳转到提交页面...",
                duration: 2000,
            });

            // 跳转到提交页面（默认显示VarDef sheet）
            setTimeout(() => {
                navigate(`/tools/sdc-generator/task/${result.taskId}`);
            }, 1000);

        } catch (error) {
            // 检查失败，显示错误提示
            toast({
                title: "❌ 初始化失败",
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
                                SDC需求输入I：
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
                                                    setCurrentModName(name);
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
                                    </div>

                                    {/* 初始化按钮 */}
                                    <div className="flex justify-end mt-6">
                                        <Button
                                            type="submit"
                                            disabled={!allFilesValid || taskStatus.status === 'VALIDATING'}
                                            className={`font-bold px-8 py-3 rounded-lg shadow-lg transition-all duration-300 transform ${
                                                !allFilesValid || taskStatus.status === 'VALIDATING'
                                                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                                                    : "bg-gradient-to-r from-blue-600 to-orange-500 hover:from-blue-700 hover:to-orange-600 text-white hover:scale-105"
                                            } disabled:transform-none`}
                                        >
                                            {taskStatus.status === 'VALIDATING' ? (
                                                <>
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                    Initializing...
                                                </>
                                            ) : (
                                                'Initialization'
                                            )}
                                        </Button>
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
            </div>
        </motion.div>
    );
};

export default SdcGeneratorInitializeThrpages;
