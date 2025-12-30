import React, { useState, useCallback } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { FormControl, FormItem, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { validateFileContent, validateFileSize, FileValidationResult } from '@/utils/fileValidation';

export type ValidationStatus = 'idle' | 'validating' | 'valid' | 'invalid' | 'error';

export interface EnhancedFileUploadProps {
    title: string;
    name: string;
    accept: string;
    placeholder: string;
    fileType: 'yaml' | 'verilog' | 'excel' | 'tcl';
    maxSizeBytes?: number;
    required?: boolean;
    toolType?: 'sdc' | 'upf'; // 用于工具特定验证
    onFileChange: (file: File | null) => void;
    onValidationChange: (isValid: boolean, error?: string) => void;
    field: any; // react-hook-form field
    // 新增：用于ModName一致性检查
    currentModName?: string;
    onModuleNameParsed?: (moduleName: string | null) => void;
}

/**
 * 增强的文件上传组件 - 支持立即验证
 */
export const EnhancedFileUpload: React.FC<EnhancedFileUploadProps> = ({
    title,
    name,
    accept,
    placeholder,
    fileType,
    maxSizeBytes = 5 * 1024 * 1024, // 默认5MB
    required = true,
    toolType = 'sdc',
    onFileChange,
    onValidationChange,
    field,
    currentModName,
    onModuleNameParsed
}) => {
    const [validationStatus, setValidationStatus] = useState<ValidationStatus>('idle');
    const [validationError, setValidationError] = useState<string>('');
    const { toast } = useToast();
    const [parsedModuleName, setParsedModuleName] = useState<string | null>(null);

    /**
     * 解析Verilog文件中的模块名
     */
    const parseModuleNameFromVerilog = async (file: File): Promise<string | null> => {
        try {
            const text = await file.text();
            // 匹配 module 关键字后面的模块名
            const moduleMatch = text.match(/^\s*module\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/m);
            if (moduleMatch && moduleMatch[1]) {
                return moduleMatch[1].trim();
            }
            return null;
        } catch (error) {
            console.error('解析Verilog文件失败:', error);
            return null;
        }
    };

    /**
     * 验证模块名是否匹配
     */
    const validateModuleName = (inputModName: string, vlogModName: string | null): boolean => {
        if (!vlogModName) return false;
        return inputModName.trim() === vlogModName.trim();
    };

    /**
     * 执行立即文件验证
     */
    const validateFile = useCallback(async (file: File): Promise<boolean> => {
        setValidationStatus('validating');
        setValidationError('');

        try {
            // 1. 基础验证：文件大小
            const sizeValidation = validateFileSize(file, maxSizeBytes);
            if (!sizeValidation.valid) {
                setValidationStatus('invalid');
                setValidationError(sizeValidation.error || '文件大小验证失败');
                onValidationChange(false, sizeValidation.error);

                toast({
                    title: "文件验证失败",
                    description: sizeValidation.error,
                    variant: "destructive"
                });
                return false;
            }

            // 2. 内容验证：通用格式检查
            const contentValidation = await validateFileContent(file, fileType);
            if (!contentValidation.valid) {
                setValidationStatus('invalid');
                setValidationError(contentValidation.error || '文件内容验证失败');
                onValidationChange(false, contentValidation.error);

                toast({
                    title: "文件验证失败",
                    description: contentValidation.error,
                    variant: "destructive"
                });
                return false;
            }

            // 3. 工具特定验证
            const toolSpecificValidation = await validateToolSpecificContent(file, fileType, toolType);
            if (!toolSpecificValidation.valid) {
                setValidationStatus('invalid');
                setValidationError(toolSpecificValidation.error || '工具特定验证失败');
                onValidationChange(false, toolSpecificValidation.error);

                toast({
                    title: "文件验证失败",
                    description: toolSpecificValidation.error,
                    variant: "destructive"
                });
                return false;
            }

            // 验证通过
            setValidationStatus('valid');
            onValidationChange(true);

            toast({
                title: "✅ 文件验证通过",
                description: `${file.name} 格式正确`,
                duration: 2000
            });

            return true;

        } catch (error) {
            setValidationStatus('error');
            const errorMessage = error instanceof Error ? error.message : '文件验证过程中发生错误';
            setValidationError(errorMessage);
            onValidationChange(false, errorMessage);

            toast({
                title: "验证错误",
                description: errorMessage,
                variant: "destructive"
            });

            return false;
        }
    }, [fileType, maxSizeBytes, toolType, onValidationChange, toast]);

    /**
     * 工具特定内容验证
     */
    const validateToolSpecificContent = async (
        file: File,
        fileType: string,
        toolType: string
    ): Promise<FileValidationResult> => {
        const content = await file.text();

        if (toolType === 'sdc') {
            return validateSdcSpecificContent(file, fileType, content);
        } else if (toolType === 'upf') {
            return validateUpfSpecificContent(file, fileType, content);
        }

        return { valid: true };
    };

    /**
     * SDC工具特定验证
     */
    const validateSdcSpecificContent = async (
        file: File,
        fileType: string,
        content: string
    ): Promise<FileValidationResult> => {
        if (fileType === 'yaml' && file.name.toLowerCase().includes('hier')) {
            // SDC hier.yaml特定检查
            if (!content.includes('pwr:') && !content.includes('hier:')) {
                return {
                    valid: false,
                    error: 'SDC hier.yaml文件必须包含pwr或hier字段'
                };
            }
        }

        if (fileType === 'verilog') {
            // SDC Verilog特定检查

            // 1. 基础检查：必须包含module声明（文件已经不能为空）
            if (!content.includes('module')) {
                return {
                    valid: false,
                    error: 'SDC Verilog文件必须包含module声明'
                };
            }

            // 2. ModName一致性检查（必须检查）
            const moduleName = await parseModuleNameFromVerilog(file);
            if (onModuleNameParsed) {
                onModuleNameParsed(moduleName);
            }
            setParsedModuleName(moduleName);

            // 必须提供ModName
            if (!currentModName || currentModName.trim() === '') {
                return {
                    valid: false,
                    error: 'SDC vlog.v文件上传时，必须先输入ModName模块名称'
                };
            }

            // 检查模块名是否匹配
            if (!moduleName) {
                return {
                    valid: false,
                    error: 'SDC vlog.v文件中未找到有效的module声明'
                };
            }

            if (!validateModuleName(currentModName, moduleName)) {
                return {
                    valid: false,
                    error: `SDC vlog.v文件模块名与输入框模块名不一致！输入的ModName: "${currentModName}"，文件中的模块名: "${moduleName}"`
                };
            }
        }

        return { valid: true };
    };

    /**
     * UPF工具特定验证
     */
    const validateUpfSpecificContent = async (
        file: File,
        fileType: string,
        content: string
    ): Promise<FileValidationResult> => {
        if (fileType === 'yaml' && file.name.toLowerCase().includes('hier')) {
            // UPF hier.yaml检查 - 与SDC保持一致，检查pwr或hier字段
            if (!content.includes('pwr:') && !content.includes('hier:')) {
                return {
                    valid: false,
                    error: 'UPF hier.yaml文件必须包含pwr或hier字段'
                };
            }
        }

        if (fileType === 'verilog' && file.name.toLowerCase().includes('pvlog')) {
            // UPF pvlog.v检查 - 包含SDC的vlog.v检查项 + UPF特定检查

            // 1. 基础检查：必须包含module声明（文件已经不能为空）
            if (!content.includes('module')) {
                return {
                    valid: false,
                    error: 'UPF pvlog.v文件必须包含module声明'
                };
            }

            // 2. UPF特定检查：必须包含power port信息（VDD和VSS）
            const hasVDD = content.includes('VDD');
            const hasVSS = content.includes('VSS');

            if (!hasVDD || !hasVSS) {
                return {
                    valid: false,
                    error: 'UPF pvlog.v文件必须包含power port信息（VDD和VSS关键字）'
                };
            }

            // 3. ModName一致性检查（必须检查）
            const moduleName = await parseModuleNameFromVerilog(file);
            if (onModuleNameParsed) {
                onModuleNameParsed(moduleName);
            }
            setParsedModuleName(moduleName);

            // 必须提供ModName
            if (!currentModName || currentModName.trim() === '') {
                return {
                    valid: false,
                    error: 'UPF pvlog.v文件上传时，必须先输入ModName模块名称'
                };
            }

            // 检查模块名是否匹配
            if (!moduleName) {
                return {
                    valid: false,
                    error: 'UPF pvlog.v文件中未找到有效的module声明'
                };
            }

            if (!validateModuleName(currentModName, moduleName)) {
                return {
                    valid: false,
                    error: `UPF pvlog.v文件模块名与输入框模块名不一致！输入的ModName: "${currentModName}"，文件中的模块名: "${moduleName}"`
                };
            }
        }

        if (fileType === 'excel' && file.name.toLowerCase().includes('pcont')) {
            // UPF pcont.xlsx检查 - 包含SDC的dcont.xlsx检查项
            // 基本Excel文件检查（与SDC dcont.xlsx保持一致）
            if (file.size < 100) {
                return {
                    valid: false,
                    error: 'UPF pcont.xlsx文件过小，可能不是有效的Excel文件'
                };
            }
        }

        if (fileType === 'tcl' && file.name.toLowerCase().includes('pobj')) {
            // UPF TCL基本语法检查 - 只检查基本TCL语法，不检查UPF特定命令
            // 检查是否包含基本的TCL命令（set变量设置等）
            const basicTclPatterns = [
                /^\s*set\s+\w+/m,           // set 变量名
                /^\s*#/m,                   // 注释行
                /^\s*\w+\s*=/m,             // 变量赋值
                /^\s*\w+\s+\w+/m            // 基本命令格式
            ];

            const hasValidTclContent = basicTclPatterns.some(pattern => pattern.test(content));

            if (!hasValidTclContent) {
                return {
                    valid: false,
                    error: 'TCL文件格式不正确，应包含有效的TCL语法（如set变量设置等）'
                };
            }
        }

        return { valid: true };
    };

    /**
     * 文件选择处理
     */
    const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0] || null;

        if (file) {
            // 立即验证文件
            const isValid = await validateFile(file);
            if (isValid) {
                onFileChange(file);
            } else {
                // 验证失败，清除文件选择
                event.target.value = '';
                onFileChange(null);
            }
        } else {
            // 文件被清除
            setValidationStatus('idle');
            setValidationError('');
            onValidationChange(false);
            onFileChange(null);
        }
    }, [validateFile, onFileChange, onValidationChange]);

    /**
     * 获取状态图标
     */
    const getStatusIcon = () => {
        switch (validationStatus) {
            case 'validating':
                return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
            case 'valid':
                return <CheckCircle className="h-5 w-5 text-green-600" />;
            case 'invalid':
            case 'error':
                return <AlertCircle className="h-5 w-5 text-red-600" />;
            default:
                return field?.value ?
                    <FileText className="h-5 w-5 text-green-700" /> :
                    <Upload className="h-5 w-5 text-gray-500" />;
        }
    };

    /**
     * 获取状态样式
     */
    const getStatusStyle = () => {
        switch (validationStatus) {
            case 'validating':
                return 'border-blue-500 bg-blue-50';
            case 'valid':
                return 'border-green-500 bg-green-50';
            case 'invalid':
            case 'error':
                return 'border-red-500 bg-red-50';
            default:
                return field?.value ?
                    'border-green-500 bg-green-50' :
                    'border-gray-300 hover:border-orange-500 hover:bg-orange-50';
        }
    };

    /**
     * 获取状态文本
     */
    const getStatusText = () => {
        if (validationError) {
            return validationError;
        }

        switch (validationStatus) {
            case 'validating':
                return '正在验证文件...';
            case 'valid':
                return `${field?.value?.name || ''} - 验证通过`;
            case 'invalid':
                return '文件验证失败';
            case 'error':
                return '验证过程出错';
            default:
                return field?.value?.name || placeholder;
        }
    };

    return (
        <div className="border-2 border-dashed border-orange-300 rounded-lg p-4">
            <div className="mb-2">
                <Label className="text-orange-600 font-semibold text-lg">
                    {title}
                    {required && <span className="text-red-500 ml-1">*</span>}
                </Label>
            </div>

            <FormItem>
                <FormControl>
                    <div>
                        <Label
                            htmlFor={`${name}-upload`}
                            className={`flex items-center space-x-2 border-2 border-dashed rounded-lg p-4 cursor-pointer transition-colors ${getStatusStyle()}`}
                        >
                            {getStatusIcon()}
                            <span className={
                                validationStatus === 'valid' ? 'text-green-800' :
                                validationStatus === 'invalid' || validationStatus === 'error' ? 'text-red-800' :
                                validationStatus === 'validating' ? 'text-blue-800' :
                                field?.value ? 'text-green-800' : 'text-gray-600'
                            }>
                                {getStatusText()}
                            </span>
                        </Label>
                        <Input
                            id={`${name}-upload`}
                            type="file"
                            className="hidden"
                            accept={accept}
                            onChange={handleFileChange}
                        />
                    </div>
                </FormControl>
                <FormMessage />

                {/* 验证状态提示 */}
                {validationStatus === 'validating' && (
                    <div className="text-sm text-blue-600 mt-2">
                        正在验证文件内容和格式...
                    </div>
                )}

                {validationStatus === 'valid' && (
                    <div className="text-sm text-green-600 mt-2">
                        ✅ 文件验证通过，格式正确
                    </div>
                )}

                {(validationStatus === 'invalid' || validationStatus === 'error') && validationError && (
                    <div className="text-sm text-red-600 mt-2">
                        ❌ {validationError}
                    </div>
                )}
            </FormItem>
        </div>
    );
};
