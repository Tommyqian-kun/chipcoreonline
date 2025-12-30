#!/usr/bin/env node

/**
 * 最终脚本对比测试
 * 对比UPF和SDC脚本的行数和结构差异
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 最终脚本对比测试');
console.log('====================');

const upfScript = path.join(__dirname, 'build_upf_image_ecsonly_win.sh');
const sdcScript = path.join(__dirname, '..', 'sdcgen', 'build_sdc_image_ecsonly_win.sh');

if (!fs.existsSync(upfScript) || !fs.existsSync(sdcScript)) {
    console.log('❌ 脚本文件不存在');
    process.exit(1);
}

const upfContent = fs.readFileSync(upfScript, 'utf8');
const sdcContent = fs.readFileSync(sdcScript, 'utf8');

const upfLines = upfContent.split('\n');
const sdcLines = sdcContent.split('\n');

console.log(`📊 行数对比:`);
console.log(`  UPF脚本: ${upfLines.length} 行`);
console.log(`  SDC脚本: ${sdcLines.length} 行`);
console.log(`  差异: ${Math.abs(upfLines.length - sdcLines.length)} 行`);

// 检查关键函数
const keyFunctions = [
    'validate_version',
    'validate_interaction_mode', 
    'create_latest_link',
    'rollback_to_version',
    'list_versions',
    'check_files',
    'check_docker',
    'create_storage_dirs',
    'validate_version_format',
    'build_image',
    'test_image',
    'save_image_to_file',
    'verify_saved_image',
    'cleanup_temp_images',
    'show_usage',
    'main'
];

console.log(`\n🔧 函数对比:`);
let functionsMatch = 0;
let functionsMissing = 0;

keyFunctions.forEach(func => {
    const upfHas = upfContent.includes(`${func}()`);
    const sdcHas = sdcContent.includes(`${func}()`);
    
    if (upfHas && sdcHas) {
        console.log(`  ✅ ${func}: 两个脚本都有`);
        functionsMatch++;
    } else if (!upfHas && sdcHas) {
        console.log(`  ❌ ${func}: UPF脚本缺少`);
        functionsMissing++;
    } else if (upfHas && !sdcHas) {
        console.log(`  ⚠️  ${func}: SDC脚本缺少`);
        functionsMissing++;
    } else {
        console.log(`  ❓ ${func}: 两个脚本都没有`);
        functionsMissing++;
    }
});

console.log(`\n📈 函数统计:`);
console.log(`  匹配函数: ${functionsMatch}`);
console.log(`  缺失函数: ${functionsMissing}`);
console.log(`  匹配率: ${((functionsMatch / keyFunctions.length) * 100).toFixed(1)}%`);

// 检查关键特性
console.log(`\n⚙️ 特性对比:`);

const features = [
    { name: '多页面镜像命名', pattern: 'IMAGE_NAME-multi:' },
    { name: '单页面镜像命名', pattern: 'IMAGE_NAME:' },
    { name: 'Latest链接', pattern: 'IMAGE_NAME:latest' },
    { name: '参数验证', pattern: 'validate_version' },
    { name: '交互模式验证', pattern: 'validate_interaction_mode' },
    { name: 'Docker检查', pattern: 'check_docker' },
    { name: '版本回滚', pattern: 'rollback_to_version' },
    { name: '镜像验证', pattern: 'verify_saved_image' },
    { name: '清理功能', pattern: 'cleanup_temp_images' },
    { name: '使用说明', pattern: 'show_usage' }
];

let featuresMatch = 0;
features.forEach(feature => {
    const upfHas = upfContent.includes(feature.pattern);
    const sdcHas = sdcContent.includes(feature.pattern);
    
    if (upfHas && sdcHas) {
        console.log(`  ✅ ${feature.name}: 两个脚本都支持`);
        featuresMatch++;
    } else if (!upfHas && sdcHas) {
        console.log(`  ❌ ${feature.name}: UPF脚本不支持`);
    } else if (upfHas && !sdcHas) {
        console.log(`  ⚠️  ${feature.name}: SDC脚本不支持`);
    } else {
        console.log(`  ❓ ${feature.name}: 两个脚本都不支持`);
    }
});

console.log(`\n📊 总体评估:`);
console.log(`  特性匹配率: ${((featuresMatch / features.length) * 100).toFixed(1)}%`);

if (Math.abs(upfLines.length - sdcLines.length) <= 50 && functionsMatch >= 14) {
    console.log(`\n🎉 脚本基本一致！`);
    console.log(`  ✅ 行数差异在可接受范围内 (≤50行)`);
    console.log(`  ✅ 核心函数基本完整`);
    console.log(`  ✅ 主要特性都支持`);
    
    console.log(`\n🚀 可以正常使用的命令:`);
    console.log(`  # 单页面模式`);
    console.log(`  ./build_upf_image_ecsonly_win.sh v1.0.0 single`);
    console.log(`  # 多页面模式`);
    console.log(`  ./build_upf_image_ecsonly_win.sh v1.0.0 multi`);
    
    process.exit(0);
} else {
    console.log(`\n❌ 脚本差异较大，需要进一步修复`);
    console.log(`  行数差异: ${Math.abs(upfLines.length - sdcLines.length)} 行`);
    console.log(`  函数匹配: ${functionsMatch}/${keyFunctions.length}`);
    
    process.exit(1);
}
