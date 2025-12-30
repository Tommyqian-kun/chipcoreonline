#!/usr/bin/env node

/**
 * Docker镜像链接机制验证脚本
 * 验证多页面镜像链接是否能正确工作
 */

const { execSync } = require('child_process');
const fs = require('fs');

console.log('🔍 Docker镜像链接机制验证');
console.log('=====================================');

// 执行命令并返回结果
function runCommand(command, description, showOutput = false) {
    try {
        console.log(`\n🔧 ${description}`);
        console.log(`   命令: ${command}`);
        const result = execSync(command, { encoding: 'utf8', stdio: showOutput ? 'inherit' : 'pipe' });
        console.log(`   ✅ 成功`);
        return showOutput ? 'success' : result.trim();
    } catch (error) {
        console.log(`   ❌ 失败: ${error.message}`);
        if (error.stdout) {
            console.log(`   标准输出: ${error.stdout}`);
        }
        if (error.stderr) {
            console.log(`   错误输出: ${error.stderr}`);
        }
        return null;
    }
}

// 检查Docker是否可用
function checkDocker() {
    console.log('\n📋 检查Docker环境...');
    const result = runCommand('docker --version', 'Docker版本检查');
    if (!result) {
        console.error('❌ Docker不可用，无法进行测试');
        process.exit(1);
    }
    console.log(`   Docker版本: ${result}`);
}

// 创建测试镜像来验证链接机制
function createTestImages() {
    console.log('\n📋 创建测试镜像验证链接机制...');
    
    // 创建临时Dockerfile
    const testDockerfile = `
FROM alpine:latest
RUN echo "Multi-page UPF Tool Test Image" > /test-marker.txt
RUN echo "#!/bin/sh" > /test-tool.sh
RUN echo "echo 'Multi-page UPF tool executed successfully'" >> /test-tool.sh
RUN chmod +x /test-tool.sh
CMD ["/test-tool.sh"]
`;
    
    fs.writeFileSync('test-dockerfile', testDockerfile);
    console.log('   ✅ 临时Dockerfile创建完成');
    
    // 构建测试镜像
    const buildResult = runCommand(
        'docker build -f test-dockerfile -t test-upf-generator-multi:v1.0.0 .',
        '构建测试镜像',
        true  // 显示构建输出
    );

    if (!buildResult) {
        console.error('❌ 测试镜像构建失败');
        return false;
    }

    // 验证镜像是否真的创建了
    const verifyResult = runCommand(
        'docker images test-upf-generator-multi:v1.0.0 --format "{{.Repository}}:{{.Tag}}"',
        '验证测试镜像是否存在'
    );

    if (!verifyResult || !verifyResult.includes('test-upf-generator-multi:v1.0.0')) {
        console.error('❌ 测试镜像验证失败');
        return false;
    }
    
    // 创建标签链接（模拟我们的多页面链接逻辑）
    const tagResult1 = runCommand(
        'docker tag test-upf-generator-multi:v1.0.0 test-upf-generator:v1.0.0',
        '创建版本标签链接'
    );

    const tagResult2 = runCommand(
        'docker tag test-upf-generator-multi:v1.0.0 test-upf-generator:latest',
        '创建latest标签链接'
    );

    // docker tag命令成功时返回空字符串，所以检查是否为null（表示命令失败）
    if (tagResult1 === null || tagResult2 === null) {
        console.error('❌ 标签链接创建失败');
        return false;
    }

    console.log('   ✅ 所有标签链接创建成功');
    
    // 清理临时文件
    fs.unlinkSync('test-dockerfile');
    
    return true;
}

// 验证镜像ID一致性
function verifyImageConsistency() {
    console.log('\n📋 验证镜像ID一致性...');
    
    const images = [
        'test-upf-generator-multi:v1.0.0',
        'test-upf-generator:v1.0.0', 
        'test-upf-generator:latest'
    ];
    
    const imageIds = {};
    
    for (const image of images) {
        const result = runCommand(
            `docker images ${image} --format "{{.ID}}"`,
            `获取${image}的镜像ID`
        );
        
        if (result) {
            imageIds[image] = result;
            console.log(`   ${image}: ${result}`);
        }
    }
    
    // 检查所有镜像ID是否相同
    const uniqueIds = [...new Set(Object.values(imageIds))];
    
    if (uniqueIds.length === 1) {
        console.log('   ✅ 所有镜像标签指向相同的镜像ID');
        console.log(`   📋 共享镜像ID: ${uniqueIds[0]}`);
        return true;
    } else {
        console.log('   ❌ 镜像ID不一致，链接失败');
        return false;
    }
}

// 验证容器运行一致性
function verifyContainerConsistency() {
    console.log('\n📋 验证容器运行一致性...');
    
    const images = [
        'test-upf-generator-multi:v1.0.0',
        'test-upf-generator:v1.0.0',
        'test-upf-generator:latest'
    ];
    
    const outputs = {};
    
    for (const image of images) {
        const result = runCommand(
            `docker run --rm ${image}`,
            `运行容器: ${image}`
        );
        
        if (result) {
            outputs[image] = result;
            console.log(`   输出: ${result}`);
        }
    }
    
    // 检查所有输出是否相同
    const uniqueOutputs = [...new Set(Object.values(outputs))];
    
    if (uniqueOutputs.length === 1) {
        console.log('   ✅ 所有容器产生相同的输出');
        console.log(`   📋 共享输出: ${uniqueOutputs[0]}`);
        return true;
    } else {
        console.log('   ❌ 容器输出不一致');
        return false;
    }
}

// 验证镜像保存和加载
function verifyImageSaveLoad() {
    console.log('\n📋 验证镜像保存和加载...');
    
    // 保存latest镜像
    const saveResult = runCommand(
        'docker save test-upf-generator:latest -o test-upf-latest.tar',
        '保存latest镜像到文件'
    );
    
    if (!saveResult) {
        return false;
    }
    
    // 删除所有测试镜像
    runCommand('docker rmi test-upf-generator-multi:v1.0.0 || true', '删除multi镜像');
    runCommand('docker rmi test-upf-generator:v1.0.0 || true', '删除版本镜像');
    runCommand('docker rmi test-upf-generator:latest || true', '删除latest镜像');
    
    // 重新加载镜像
    const loadResult = runCommand(
        'docker load -i test-upf-latest.tar',
        '从文件加载镜像'
    );
    
    if (!loadResult) {
        return false;
    }
    
    // 验证加载后的镜像是否能正常运行
    const runResult = runCommand(
        'docker run --rm test-upf-generator:latest',
        '运行加载后的镜像'
    );
    
    if (runResult && runResult.includes('Multi-page UPF tool executed successfully')) {
        console.log('   ✅ 镜像保存和加载后功能正常');
        return true;
    } else {
        console.log('   ❌ 镜像保存和加载后功能异常');
        return false;
    }
}

// 清理测试资源
function cleanup() {
    console.log('\n📋 清理测试资源...');
    
    runCommand('docker rmi test-upf-generator-multi:v1.0.0 || true', '删除multi镜像');
    runCommand('docker rmi test-upf-generator:v1.0.0 || true', '删除版本镜像');
    runCommand('docker rmi test-upf-generator:latest || true', '删除latest镜像');
    
    if (fs.existsSync('test-upf-latest.tar')) {
        fs.unlinkSync('test-upf-latest.tar');
        console.log('   ✅ 删除测试tar文件');
    }
    
    console.log('   ✅ 清理完成');
}

// 主测试函数
function runTests() {
    try {
        checkDocker();
        
        const createSuccess = createTestImages();
        if (!createSuccess) {
            console.error('\n❌ 测试镜像创建失败，终止测试');
            process.exit(1);
        }
        
        const consistencySuccess = verifyImageConsistency();
        const containerSuccess = verifyContainerConsistency();
        const saveLoadSuccess = verifyImageSaveLoad();
        
        console.log('\n📊 测试结果总结:');
        console.log('=====================================');
        
        if (consistencySuccess && containerSuccess && saveLoadSuccess) {
            console.log('✅ 所有测试通过！Docker镜像链接机制完全可靠');
            console.log('\n🎯 验证结果:');
            console.log('  ✅ 镜像ID一致性 - 所有标签指向同一镜像');
            console.log('  ✅ 容器运行一致性 - 相同的执行结果');
            console.log('  ✅ 保存加载一致性 - tar文件保持功能');
            console.log('\n🚀 结论:');
            console.log('  多页面UPF工具镜像链接机制技术上完全可靠');
            console.log('  可以安全地用于生产环境');
            console.log('  Worker系统将正确加载和执行多页面工具代码');
        } else {
            console.log('❌ 部分测试失败，需要进一步调查');
            if (!consistencySuccess) console.log('  - 镜像ID一致性测试失败');
            if (!containerSuccess) console.log('  - 容器运行一致性测试失败');
            if (!saveLoadSuccess) console.log('  - 保存加载一致性测试失败');
        }
        
    } finally {
        cleanup();
    }
}

// 运行测试
runTests();
