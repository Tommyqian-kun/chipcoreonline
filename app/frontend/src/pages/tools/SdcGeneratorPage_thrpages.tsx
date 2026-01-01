/**
 * SDC工具多页面交互入口页面
 * 完全复用单页面的所有功能，作为多页面交互的入口
 */

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useToolPageNavigation } from '@/hooks/useToolPageNavigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { Upload, Loader2, Download, FileText, HelpCircle, CheckCircle, AlertCircle, Play } from 'lucide-react';
import { ToolPageTaskHistoryButton } from '@/components/shared/TaskHistoryButton';
import { EnhancedFileUpload } from '@/components/common/EnhancedFileUpload';
import { validateFileContent } from '@/utils/fileValidation';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { useMutation } from '@tanstack/react-query';
import api from '@/services/api';

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
      return file.name.endsWith('.v');
    }, "只支持.v格式的文件")
});

type SdcFormValues = z.infer<typeof sdcFormSchema>;

interface InitializeTaskResponse {
  success: boolean;
  message: string;
  taskId: string;
  data: {
    taskId: string;
    modName: string;
    isFlat: boolean;
    status: string;
    createdAt: string;
  };
}

const SdcGeneratorPageThrpages: React.FC = () => {
  const { handleGuidanceClick, handleTemplateDownload } = useToolPageNavigation({ status: 'IDLE' });
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // 复用单页面的状态管理
  const [modNameHistory, setModNameHistory] = useState<string[]>([]);
  const [moduleNameFromVlog, setModuleNameFromVlog] = useState<string | null>(null);
  const [currentModName, setCurrentModName] = useState<string>('');
  const [fileValidationStates, setFileValidationStates] = useState({
    hierYaml: { isValid: false, error: '' },
    vlog: { isValid: false, error: '' }
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
      vlogFile: undefined
    }
  });

  // 解析vlog文件中的模块名
  const parseModuleNameFromVlog = async (file: File): Promise<string | null> => {
    try {
      const text = await file.text();
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

  // 保存ModName到历史记录
  const saveModNameToHistory = (modName: string) => {
    const newHistory = [modName, ...modNameHistory.filter(name => name !== modName)].slice(0, 10);
    setModNameHistory(newHistory);
    localStorage.setItem('sdc_modname_history', JSON.stringify(newHistory));
  };

  // 文件验证状态处理
  const handleFileValidationChange = (fileType: 'hierYaml' | 'vlog') => (isValid: boolean, error?: string) => {
    setFileValidationStates(prev => ({
      ...prev,
      [fileType]: { isValid, error }
    }));
  };

  // 初始化任务的API调用
  const initializeTaskMutation = useMutation<InitializeTaskResponse, Error, SdcFormValues>({
    mutationFn: async (data) => {
      const formData = new FormData();
      formData.append('modName', data.modName);
      formData.append('isFlat', data.isFlat.toString());
      formData.append('hierYamlFile', data.hierYamlFile);
      formData.append('vlogFile', data.vlogFile);

      // 使用项目统一的api实例，正确配置baseURL和credentials
      // api拦截器会自动处理FormData的Content-Type
      const response = await api.post('/sdc-thrpages/initialize', formData);

      return response.data;
    },
    onSuccess: (data) => {
      toast({
        title: "✅ 任务初始化成功！",
        description: "正在跳转到提交页面...",
        duration: 2000,
      });
      
      // 跳转到提交页面
      setTimeout(() => {
        navigate(`/tools/sdc-generator/submit/${data.taskId}`);
      }, 1000);
    },
    onError: (error) => {
      toast({
        title: "❌ 初始化失败",
        description: error.message || '初始化失败',
        variant: "destructive",
        duration: 5000,
      });
    }
  });

  // 处理初始化提交
  const onSubmit = async (data: SdcFormValues) => {
    try {
      const { modName, isFlat, hierYamlFile, vlogFile } = data;

      // 1. 检查所有必需字段
      if (!modName || !hierYamlFile || !vlogFile) {
        throw new Error('请填写完整的表单信息');
      }

      // 2. 解析vlog文件中的模块名
      const parsedModName = await parseModuleNameFromVlog(vlogFile);
      setModuleNameFromVlog(parsedModName);

      // 3. 检查文件验证状态
      const allFilesValid = fileValidationStates.hierYaml.isValid && fileValidationStates.vlog.isValid;
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
      if (!validateModuleName(modName, parsedModName)) {
        if (!parsedModName) {
          throw new Error('无法从vlog文件中解析出模块名，请检查文件格式是否正确');
        } else {
          throw new Error(`模块名不匹配！\n输入的ModName: "${modName}"\nvlog文件中的模块名: "${parsedModName}"\n请确保两者完全一致`);
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

      // 提交初始化任务
      initializeTaskMutation.mutate(data);

    } catch (error) {
      // 检查失败，显示错误提示
      toast({
        title: "❌ 输入检查失败",
        description: (error as Error).message,
        variant: "destructive",
        duration: 5000,
      });
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
                SDC需求输入（多页面交互）：
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

                  {/* 文件上传区域 */}
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
                      <EnhancedFileUpload
                        title="上传vlog.v"
                        name="vlogFile"
                        accept=".v"
                        placeholder="点击或拖拽上传(.v)"
                        fileType="verilog"
                        toolType="sdc"
                        onFileChange={(file) => form.setValue('vlogFile', file)}
                        onValidationChange={handleFileValidationChange('vlog')}
                        field={field}
                      />
                    )} />
                  </div>

                  {/* 操作按钮区域 */}
                  <div className="flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0 sm:space-x-4 pt-6">
                    {/* 左侧：任务历史按钮 */}
                    <div className="flex space-x-4">
                      <ToolPageTaskHistoryButton />
                    </div>

                    {/* 右侧：初始化按钮 */}
                    <div className="flex space-x-4">
                      <Button
                        type="submit"
                        disabled={initializeTaskMutation.isPending}
                        className="bg-gradient-to-r from-blue-500 to-orange-500 hover:from-blue-600 hover:to-orange-600 text-white font-bold text-lg px-8 py-3 rounded-lg shadow-md transform transition-all duration-200 hover:scale-105 hover:shadow-lg"
                      >
                        {initializeTaskMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            初始化中...
                          </>
                        ) : (
                          <>
                            <Play className="mr-2 h-5 w-5" />
                            Initialization
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
};

export default SdcGeneratorPageThrpages;
