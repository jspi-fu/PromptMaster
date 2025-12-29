#!/usr/bin/env node
/**
 * 构建脚本：为 Chrome Web Store 和 Microsoft Edge Add-ons 生成发布包
 * 
 * 用法：
 *   node scripts/build.js        # 同时生成 Chrome 和 Edge 包
 *   node scripts/build.js chrome # 仅生成 Chrome 包
 *   node scripts/build.js edge   # 仅生成 Edge 包
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SRC_DIR = path.join(__dirname, '..', 'src');
const DIST_DIR = path.join(__dirname, '..', 'dist');
const TARGET = process.argv[2] || 'both';

// COMMENT: 需要排除的文件/目录（开发时使用，不应包含在发布包中）
const EXCLUDE_PATTERNS = [
  '**/.DS_Store',
  '**/Thumbs.db',
  '**/*.map',
  '**/node_modules/**',
  '**/.git/**',
  '**/tests/**',
  '**/test/**',
  '**/*.test.js',
  '**/README.md',
  '**/CHANGELOG.md',
  '**/MODIFICATION_GUIDE.md',
  '**/DOCUMENTATION.md',
  '**/EXTENDING_PLATFORMS.md',
  '**/TESTING.md',
  '**/eslint.config.js',
  '**/package.json',
  '**/package-lock.json',
  '**/.gitignore',
  '**/.cursorignore'
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function copyDir(src, dest, excludePatterns = []) {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    // COMMENT: 简单排除检查（不实现完整 glob 匹配）
    const shouldExclude = excludePatterns.some(pattern => {
      const normalized = pattern.replace(/\*\*/g, '').replace(/\*/g, '');
      return entry.name.includes(normalized) || srcPath.includes(normalized);
    });
    
    if (shouldExclude) continue;
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, excludePatterns);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function createZip(sourceDir, zipPath) {
  const zipName = path.basename(zipPath, '.zip');
  const parentDir = path.dirname(zipPath);
  
  // COMMENT: 使用系统 zip 命令（Windows 需要安装 7-Zip 或使用 PowerShell，macOS/Linux 通常自带）
  try {
    if (process.platform === 'win32') {
      // COMMENT: Windows: 尝试使用 PowerShell Compress-Archive
      execSync(
        `powershell -Command "Compress-Archive -Path '${sourceDir}\\*' -DestinationPath '${zipPath}' -Force"`,
        { stdio: 'inherit' }
      );
    } else {
      // COMMENT: macOS/Linux: 使用 zip 命令
      const cwd = path.dirname(sourceDir);
      const dirName = path.basename(sourceDir);
      execSync(`cd "${cwd}" && zip -r "${zipPath}" "${dirName}" -x "*.DS_Store" "*.map"`, {
        stdio: 'inherit'
      });
    }
    console.log(`✅ 已创建: ${zipPath}`);
  } catch (error) {
    console.error(`❌ 创建 zip 失败: ${error.message}`);
    console.error('提示: Windows 用户请确保已安装 PowerShell 或 7-Zip');
    process.exit(1);
  }
}

function build(target) {
  console.log(`\n📦 开始构建 ${target === 'both' ? 'Chrome 和 Edge' : target.toUpperCase()} 发布包...\n`);
  
  ensureDir(DIST_DIR);
  
  const targets = target === 'both' ? ['chrome', 'edge'] : [target];
  
  for (const t of targets) {
    const buildDir = path.join(DIST_DIR, t);
    const zipPath = path.join(DIST_DIR, `prompt-manager-${t}.zip`);
    
    // COMMENT: 清理旧构建
    if (fs.existsSync(buildDir)) {
      fs.rmSync(buildDir, { recursive: true, force: true });
    }
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }
    
    console.log(`📂 复制文件到 ${t} 构建目录...`);
    copyDir(SRC_DIR, buildDir, EXCLUDE_PATTERNS);
    
    // COMMENT: Chrome 和 Edge 使用相同的 manifest（MV3 兼容）
    // 如果需要差异化配置，可以在这里修改 manifest.json
    console.log(`📝 检查 manifest.json...`);
    const manifestPath = path.join(buildDir, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      console.log(`   版本: ${manifest.version}`);
      console.log(`   名称: ${manifest.name}`);
    }
    
    console.log(`🗜️  创建 zip 包...`);
    createZip(buildDir, zipPath);
    
    // COMMENT: 显示文件大小
    const stats = fs.statSync(zipPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`   大小: ${sizeMB} MB\n`);
  }
  
  console.log('✅ 构建完成！');
  console.log(`\n发布包位置:`);
  targets.forEach(t => {
    console.log(`   - dist/prompt-manager-${t}.zip`);
  });
  console.log('\n下一步:');
  console.log('  1. Chrome Web Store: https://chrome.google.com/webstore/devconsole');
  console.log('  2. Edge Add-ons: https://partner.microsoft.com/dashboard/microsoftedge/overview');
}

// COMMENT: 运行构建
build(TARGET);

