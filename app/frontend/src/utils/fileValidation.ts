/**
 * 文件验证工具函数
 * 提供各种文件类型的验证功能
 */

export interface FileValidationResult {
    valid: boolean;
    error?: string;
}

/**
 * 验证YAML文件内容
 */
export const validateYamlFile = async (file: File): Promise<FileValidationResult> => {
    try {
        const content = await file.text();
        
        // 基本YAML格式检查 - 文件必须有内容
        if (!content.trim()) {
            return { valid: false, error: 'YAML文件不能为空，必须包含有效内容' };
        }

        // 检查是否包含基本的YAML结构
        if (!content.includes(':')) {
            return { valid: false, error: 'YAML文件格式不正确，缺少键值对结构' };
        }

        // 检查文件扩展名
        if (!file.name.toLowerCase().endsWith('.yaml') && !file.name.toLowerCase().endsWith('.yml')) {
            return { valid: false, error: 'YAML文件必须以.yaml或.yml结尾' };
        }

        return { valid: true };
    } catch (error) {
        return { valid: false, error: 'YAML文件读取失败' };
    }
};

/**
 * 验证Verilog文件内容
 */
export const validateVerilogFile = async (file: File): Promise<FileValidationResult> => {
    try {
        const content = await file.text();
        
        // 基本Verilog格式检查 - 文件必须有内容
        if (!content.trim()) {
            return { valid: false, error: 'Verilog文件不能为空，必须包含有效内容' };
        }

        // 检查是否包含module关键字
        if (!content.includes('module')) {
            return { valid: false, error: 'Verilog文件必须包含module定义' };
        }

        // 检查文件扩展名
        if (!file.name.toLowerCase().endsWith('.v') && !file.name.toLowerCase().endsWith('.sv')) {
            return { valid: false, error: 'Verilog文件必须以.v或.sv结尾' };
        }

        return { valid: true };
    } catch (error) {
        return { valid: false, error: 'Verilog文件读取失败' };
    }
};

/**
 * 验证Excel文件
 */
export const validateExcelFile = async (file: File): Promise<FileValidationResult> => {
    try {
        // 检查文件扩展名
        const fileName = file.name.toLowerCase();
        if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
            return { valid: false, error: 'Excel文件必须以.xlsx或.xls结尾' };
        }

        // 检查文件大小（Excel文件必须有内容）
        if (file.size === 0) {
            return { valid: false, error: 'Excel文件不能为空，必须包含有效内容' };
        }

        // 基本的Excel文件头检查
        const buffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(buffer);
        
        // 检查Excel文件的魔数
        if (fileName.endsWith('.xlsx')) {
            // XLSX文件是ZIP格式，检查ZIP魔数
            if (uint8Array[0] !== 0x50 || uint8Array[1] !== 0x4B) {
                return { valid: false, error: 'XLSX文件格式不正确' };
            }
        }

        return { valid: true };
    } catch (error) {
        return { valid: false, error: 'Excel文件验证失败' };
    }
};

/**
 * 验证TCL文件内容
 */
export const validateTclFile = async (file: File): Promise<FileValidationResult> => {
    try {
        const content = await file.text();
        
        // 基本TCL格式检查 - 文件必须有内容
        if (!content.trim()) {
            return { valid: false, error: 'TCL文件不能为空，必须包含有效内容' };
        }

        // 检查文件扩展名
        if (!file.name.toLowerCase().endsWith('.tcl')) {
            return { valid: false, error: 'TCL文件必须以.tcl结尾' };
        }

        // 基本的TCL语法检查（检查是否包含常见的TCL命令）
        const tclKeywords = ['set', 'proc', 'if', 'for', 'while', 'puts', 'source'];
        const hasValidContent = tclKeywords.some(keyword => 
            content.toLowerCase().includes(keyword)
        );

        if (!hasValidContent) {
            return { valid: false, error: 'TCL文件内容格式不正确，缺少有效的TCL命令' };
        }

        return { valid: true };
    } catch (error) {
        return { valid: false, error: 'TCL文件读取失败' };
    }
};

/**
 * 通用文件验证函数
 */
export const validateFileContent = async (
    file: File, 
    fileType: 'yaml' | 'verilog' | 'excel' | 'tcl'
): Promise<FileValidationResult> => {
    switch (fileType) {
        case 'yaml':
            return validateYamlFile(file);
        case 'verilog':
            return validateVerilogFile(file);
        case 'excel':
            return validateExcelFile(file);
        case 'tcl':
            return validateTclFile(file);
        default:
            return { valid: false, error: '不支持的文件类型' };
    }
};

/**
 * 验证文件大小
 */
export const validateFileSize = (file: File, maxSizeBytes: number): FileValidationResult => {
    if (file.size > maxSizeBytes) {
        const maxSizeMB = Math.round(maxSizeBytes / 1024 / 1024);
        return { 
            valid: false, 
            error: `文件大小不能超过${maxSizeMB}MB，当前文件大小：${Math.round(file.size / 1024 / 1024 * 100) / 100}MB` 
        };
    }
    return { valid: true };
};

/**
 * 验证文件名
 */
export const validateFileName = (file: File, expectedName?: string): FileValidationResult => {
    if (expectedName && file.name !== expectedName) {
        return { 
            valid: false, 
            error: `文件名必须为${expectedName}，当前文件名：${file.name}` 
        };
    }
    
    // 检查文件名是否包含非法字符
    const invalidChars = /[<>:"/\\|?*]/;
    if (invalidChars.test(file.name)) {
        return { 
            valid: false, 
            error: '文件名包含非法字符，请使用字母、数字、下划线和点' 
        };
    }
    
    return { valid: true };
};
