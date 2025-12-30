/**
 * UPF工具多页面交互入口页面
 * 基于SDC多页面工具，作为UPF多页面交互的入口
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

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// UPF表单验证schema - 4个文件
const upfFormSchema = z.object({
  modName: z.string().min(1, "模块名称不能为空"),
  version: z.string().default('2.1'),
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
  pvlogFile: z.any()
    .refine((file) => {
      if (typeof window === 'undefined') return true;
      return file instanceof File;
    }, "必须上传pvlog.v文件")
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
  pobjTclFile: z.any()
    .refine((file) => {
      if (typeof window === 'undefined') return true;
      return file instanceof File;
    }, "必须上传pobj.tcl文件")
    .refine((file) => {
      if (typeof window === 'undefined') return true;
      if (!file) return false;
      return file.size <= MAX_FILE_SIZE;
    }, "文件大小不能超过5MB")
    .refine((file) => {
      if (typeof window === 'undefined') return true;
      if (!file) return false;
      return file.name.endsWith('.tcl');
    }, "只支持.tcl格式的文件"),
  pcellYamlFile: z.any()
    .refine((file) => {
      if (typeof window === 'undefined') return true;
      return file instanceof File;
    }, "必须上传pcell.yaml文件")
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
});

type UpfFormValues = z.infer<typeof upfFormSchema>;

const UpfGeneratorPageThrpages: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { handleGuidanceClick, handleTemplateDownload } = useToolPageNavigation({ status: 'IDLE' });

  // 状态管理
  const [modNameHistory, setModNameHistory] = useState<string[]>([]);
  const [currentModName, setCurrentModName] = useState('');
  const [moduleNameFromVlog, setModuleNameFromVlog] = useState<string | null>(null);
  const [fileValidationStates, setFileValidationStates] = useState({
    hierYaml: { isValid: false, error: '' },
    pvlog: { isValid: false, error: '' },
    pobjTcl: { isValid: false, error: '' },
    pcellYaml: { isValid: false, error: '' }
  });
  const [taskStatus, setTaskStatus] = useState({ status: 'IDLE', currentStep: '' });

  // 初始化表单
  const form = useForm<UpfFormValues>({
    resolver: zodResolver(upfFormSchema),
    defaultValues: {
      modName: '',
      version: '2.1',
      isFlat: false,
      hierYamlFile: undefined,
      pvlogFile: undefined,
      pobjTclFile: undefined,
      pcellYamlFile: undefined,
    },
  });

  // 从localStorage加载ModName历史记录
  useEffect(() => {
    const savedHistory = localStorage.getItem('upf_modname_history');
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
      localStorage.setItem('upf_modname_history', JSON.stringify(newHistory));
    }
  };

  // 文件验证状态更新处理
  const handleFileValidationChange = (fileType: 'hierYaml' | 'pvlog' | 'pobjTcl' | 'pcellYaml') =>
    (isValid: boolean, error?: string) => {
      setFileValidationStates(prev => ({
        ...prev,
        [fileType]: { isValid, error: error || '' }
      }));
    };

  // 检查所有文件是否验证通过
  const allFilesValid = fileValidationStates.hierYaml.isValid &&
                       fileValidationStates.pvlog.isValid &&
                       fileValidationStates.pobjTcl.isValid &&
                       fileValidationStates.pcellYaml.isValid;

  // 模块名验证函数
  const validateModuleName = (inputModName: string, vlogModName: string | null): boolean => {
    if (!vlogModName) return false;
    return inputModName.trim() === vlogModName.trim();
  };

  // 多页面交互按钮处理
  const handleMultiPageInteraction = () => {
    // 跳转到多页面交互的初始化页面
    navigate('/tools/upf-generator/initialize');
  };

  // 表单提交处理（单页面模式，暂时保留但不实现）
  const onSubmit = async (data: UpfFormValues) => {
    toast({
      title: "提示",
      description: "请使用多页面交互模式进行UPF工具操作",
      duration: 3000,
    });
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
        {/* UPF工具主页面 */}
        <div className="relative">
          <Card className="border-2 border-orange-400 shadow-lg">
            <CardHeader className="relative">
              <CardTitle className="text-2xl md:text-3xl font-bold text-blue-600">
                UPF Generator
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
              {/* 多页面交互按钮 */}
              <div className="flex justify-center mb-8">
                <Button
                  onClick={handleMultiPageInteraction}
                  className="bg-gradient-to-r from-blue-600 to-orange-500 hover:from-blue-700 hover:to-orange-600 text-white font-bold text-xl px-12 py-4 rounded-lg shadow-lg transition-all duration-300 transform hover:scale-105"
                >
                  <Play className="mr-3 h-6 w-6" />
                  开始多页面交互
                </Button>
              </div>

              {/* 说明文字 */}
              <div className="text-center text-gray-600 mb-6">
                <p className="text-lg">UPF工具支持多页面交互模式</p>
                <p className="text-sm mt-2">点击上方按钮开始三步式工作流程：初始化 → 提交 → 下载</p>
              </div>

              {/* 工具特性说明 */}
              <div className="bg-gray-50 p-6 rounded-lg">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">UPF工具特性</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-start space-x-3">
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                    <div>
                      <p className="font-medium">多文件支持</p>
                      <p className="text-sm text-gray-600">支持hier.yaml、pvlog.v、pmobj.tcl、pcell.yaml四个文件</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                    <div>
                      <p className="font-medium">多页面交互</p>
                      <p className="text-sm text-gray-600">VarDef、PDomain、PStrategy、PMode四个配置页面</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                    <div>
                      <p className="font-medium">实时验证</p>
                      <p className="text-sm text-gray-600">文件上传和数据输入的实时验证</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                    <div>
                      <p className="font-medium">版本支持</p>
                      <p className="text-sm text-gray-600">支持UPF 2.1和3.0版本</p>
                    </div>
                  </div>
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
  );
};

export default UpfGeneratorPageThrpages;
