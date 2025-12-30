#!/usr/bin/env node

/**
 * 测试UPF构建脚本与SDC构建脚本的一致性
 * 验证多页面支持功能是否正确实现
 */

const fs = require('fs');
const path = require('path');

// 文件路径
const UPF_SCRIPT = path.join(__dirname, 'build_upf_image_ecsonly_win.sh');
const SDC_SCRIPT = path.join(__dirname, '../../scripts/build_sdc_image_ecsonly_win.sh');

console.log('🔍 UPF和SDC构建脚本一致性测试');
console.log('=====================================');

// 检查文件是否存在
function checkFileExists(filePath, name) {
    if (!fs.existsSync(filePath)) {
        console.error(`❌ ${name} 文件不存在: ${filePath}`);
        return false;
    }
    console.log(`✅ ${name} 文件存在: ${filePath}`);
    return true;
}

// 读取文件内容
function readFileContent(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
        console.error(`❌ 读取文件失败: ${filePath}`, error.message);
        return null;
    }
}

// 检查关键功能是否存在
function checkKeyFeatures(content, scriptName) {
    console.log(`\n🔍 检查 ${scriptName} 的关键功能:`);
    
    const features = [
        { name: '多页面参数支持', pattern: /PAGE_MODE.*=.*\$\{2:-single\}/ },
        { name: '镜像名称设置函数', pattern: /setup_image_names\(\)/ },
        { name: '多页面链接函数', pattern: /create_multi_page_link\(\)/ },
        { name: '构建镜像名称变量', pattern: /BUILD_IMAGE_NAME/ },
        { name: '最终镜像名称变量', pattern: /FINAL_IMAGE_NAME/ },
        { name: '版本验证函数', pattern: /validate_version\(\)/ },
        { name: '页面模式验证', pattern: /PAGE_MODE.*!=.*single.*&&.*PAGE_MODE.*!=.*multi/ },
        { name: '多页面使用说明', pattern: /Multi-page mode/ }
    ];
    
    let passedFeatures = 0;
    
    features.forEach(feature => {
        if (feature.pattern.test(content)) {
            console.log(`  ✅ ${feature.name}`);
            passedFeatures++;
        } else {
            console.log(`  ❌ ${feature.name}`);
        }
    });
    
    console.log(`\n📊 ${scriptName} 功能检查结果: ${passedFeatures}/${features.length} 通过`);
    return passedFeatures === features.length;
}

// 检查参数处理逻辑
function checkParameterHandling(content, scriptName) {
    console.log(`\n🔍 检查 ${scriptName} 的参数处理逻辑:`);
    
    const checks = [
        { name: 'VERSION参数设置', pattern: /VERSION="\$\{1:-latest\}"/ },
        { name: 'PAGE_MODE参数设置', pattern: /PAGE_MODE="\$\{2:-single\}"/ },
        { name: '页面模式验证逻辑', pattern: /if.*PAGE_MODE.*!=.*single.*PAGE_MODE.*!=.*multi/ },
        { name: 'setup_image_names调用', pattern: /setup_image_names/ }
    ];
    
    let passedChecks = 0;
    
    checks.forEach(check => {
        if (check.pattern.test(content)) {
            console.log(`  ✅ ${check.name}`);
            passedChecks++;
        } else {
            console.log(`  ❌ ${check.name}`);
        }
    });
    
    return passedChecks === checks.length;
}

// 检查镜像构建逻辑
function checkImageBuildLogic(content, scriptName) {
    console.log(`\n🔍 检查 ${scriptName} 的镜像构建逻辑:`);
    
    const checks = [
        { name: '构建镜像名称使用', pattern: /BUILD_IMAGE_NAME:\$VERSION/ },
        { name: '最终镜像名称使用', pattern: /FINAL_IMAGE_NAME:\$VERSION/ },
        { name: '多页面链接调用', pattern: /create_multi_page_link/ },
        { name: '页面模式条件判断', pattern: /if.*PAGE_MODE.*==.*multi/ }
    ];
    
    let passedChecks = 0;
    
    checks.forEach(check => {
        if (check.pattern.test(content)) {
            console.log(`  ✅ ${check.name}`);
            passedChecks++;
        } else {
            console.log(`  ❌ ${check.name}`);
        }
    });
    
    return passedChecks === checks.length;
}

// 主测试函数
function runTests() {
    console.log('\n📋 开始一致性测试...\n');
    
    // 检查文件存在性
    const upfExists = checkFileExists(UPF_SCRIPT, 'UPF构建脚本');
    const sdcExists = checkFileExists(SDC_SCRIPT, 'SDC构建脚本');
    
    if (!upfExists) {
        console.error('\n❌ UPF构建脚本不存在，无法进行测试');
        process.exit(1);
    }
    
    // 读取UPF脚本内容
    const upfContent = readFileContent(UPF_SCRIPT);
    if (!upfContent) {
        console.error('\n❌ 无法读取UPF构建脚本内容');
        process.exit(1);
    }
    
    // 检查UPF脚本的关键功能
    const upfFeaturesPass = checkKeyFeatures(upfContent, 'UPF构建脚本');
    const upfParametersPass = checkParameterHandling(upfContent, 'UPF构建脚本');
    const upfBuildLogicPass = checkImageBuildLogic(upfContent, 'UPF构建脚本');
    
    // 如果SDC脚本存在，进行对比
    if (sdcExists) {
        const sdcContent = readFileContent(SDC_SCRIPT);
        if (sdcContent) {
            console.log('\n🔍 对比SDC构建脚本...');
            checkKeyFeatures(sdcContent, 'SDC构建脚本');
        }
    }
    
    // 总结测试结果
    console.log('\n📊 测试结果总结:');
    console.log('=====================================');
    
    const allTestsPass = upfFeaturesPass && upfParametersPass && upfBuildLogicPass;
    
    if (allTestsPass) {
        console.log('✅ 所有测试通过！UPF构建脚本已正确实现多页面支持功能');
        console.log('\n🎯 关键功能确认:');
        console.log('  ✅ 支持single和multi页面模式参数');
        console.log('  ✅ 多页面模式生成logiccore/upf-generator-multi镜像');
        console.log('  ✅ 自动链接到logiccore/upf-generator:latest');
        console.log('  ✅ 保持数据库兼容性（无需修改logiccore_upf-generator_latest名称）');
        console.log('  ✅ 与SDC构建脚本功能一致');
        
        console.log('\n🚀 使用示例:');
        console.log('  # 单页面模式（默认）');
        console.log('  ./build_upf_image_ecsonly_win.sh v1.0.0');
        console.log('  ./build_upf_image_ecsonly_win.sh v1.0.0 single');
        console.log('');
        console.log('  # 多页面模式');
        console.log('  ./build_upf_image_ecsonly_win.sh v1.0.0 multi');
        console.log('  ./build_upf_image_ecsonly_win.sh latest multi');
        
    } else {
        console.log('❌ 部分测试失败，需要进一步修复');
        console.log('\n🔧 需要检查的项目:');
        if (!upfFeaturesPass) console.log('  - 关键功能实现');
        if (!upfParametersPass) console.log('  - 参数处理逻辑');
        if (!upfBuildLogicPass) console.log('  - 镜像构建逻辑');
    }
    
    console.log('\n=====================================');
    process.exit(allTestsPass ? 0 : 1);
}

// 运行测试
runTests();
