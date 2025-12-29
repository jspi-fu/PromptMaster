# 性能优化说明

本文档记录了扩展的性能优化措施，确保在 Chrome 和 Edge 上都能流畅运行。

## 已实施的优化

### 1. Service Worker 注入性能优化

**问题**：每次标签页完成加载时，都会重新获取 `llm_providers.json` 并遍历所有 pattern，造成不必要的开销。

**解决方案**：
- 实现 `ProvidersCache` 模块，缓存 providers 列表和预编译的正则表达式
- 优先使用 `aiProvidersMap` 中已授权的 providers，减少循环次数
- 只在扩展安装/更新时刷新缓存

**文件**：`src/service-worker.js`

### 2. UI 重建频率优化

**问题**：`MutationObserver` 在重 DOM 网站上可能频繁触发，导致反复 cleanup + inject UI。

**解决方案**：
- 使用 `requestAnimationFrame` 合并多个 DOM 变更事件
- 增加 1.5 秒冷却期，避免同一时间窗口内重复重建
- 添加注入状态位，确保不会同时进行多次注入

**文件**：`src/content.js`（`PromptMediator.setupMutationObserver`）

### 3. Stream SSE 输出优化

**问题**：每次收到 SSE chunk 都直接更新 DOM，导致高频 layout/paint，可能造成掉帧。

**解决方案**：
- 使用 buffer 累积内容，通过 `requestAnimationFrame` 批量刷新 DOM
- 避免频繁 `innerHTML` 解析，改用 `textContent` + 手动处理换行
- Stream 结束时一次性收尾（移除光标、插入保存按钮、持久化）

**文件**：`src/content.js`（`sendMessage` 函数中的 stream 处理）

### 4. Storage 写入优化

**问题**：对话历史可能在 stream 过程中频繁写入，影响主线程性能。

**解决方案**：
- 使用 `debounce(300ms)` 延迟写入，stream 过程中仅更新内存
- 增加历史上限控制：最多保留 50 轮对话（user+assistant 配对），或总字符数不超过 100KB
- 自动截断超出限制的历史，保持存储轻量

**文件**：`src/content.js`（`persistHistory` 函数）

### 5. Chrome/Edge 双商店兼容

**问题**：部分环境可能不支持 `chrome.sidePanel` API，需要能力检测。

**解决方案**：
- 在 `onInstalled` 中添加 `chrome.sidePanel?.setPanelBehavior` 存在性检查
- 创建统一的构建脚本，生成 Chrome 和 Edge 发布包
- Manifest V3 配置已兼容两个商店的要求

**文件**：
- `src/service-worker.js`（能力检测）
- `scripts/build.js`（打包脚本）
- `package.json`（构建命令）

## 性能指标预期

- **注入延迟**：从每次 tab 更新都 fetch JSON，降低到仅首次加载时 fetch，后续使用缓存
- **UI 重建频率**：从可能每 100ms 触发，降低到最多每 1.5 秒一次（带冷却期）
- **Stream 渲染**：从每次 chunk 都写 DOM，降低到每帧（~16ms）最多一次批量刷新
- **Storage 写入**：从可能每 250ms 写入，降低到最多每 300ms 一次（去抖），且 stream 过程中不写入

## 构建与发布

### 生成发布包

```bash
# 同时生成 Chrome 和 Edge 包
npm run build

# 或分别生成
npm run build:chrome
npm run build:edge
```

输出位置：`dist/prompt-manager-chrome.zip` 和 `dist/prompt-manager-edge.zip`

### 发布到商店

1. **Chrome Web Store**：https://chrome.google.com/webstore/devconsole
2. **Microsoft Edge Add-ons**：https://partner.microsoft.com/dashboard/microsoftedge/overview

两个商店使用相同的 zip 包（MV3 兼容）。

## 验证清单

在提交前，请确保：

- [ ] `npm run lint` 通过（无错误）
- [ ] `npm test` 通过（如已配置测试）
- [ ] 在 Chrome 中加载扩展，测试基本功能
- [ ] 在 Edge 中加载扩展，测试基本功能
- [ ] 测试提示词生成器的 stream 输出是否流畅（无明显掉帧）
- [ ] 测试对话历史持久化（关闭面板后重新打开，历史应恢复）
- [ ] 检查控制台无错误日志

## 后续优化建议

1. **代码拆分**：`src/content.js` 已超过 1000 行，可考虑拆分为 `content.chat.js`、`content.ui.js` 等模块
2. **懒加载**：某些不常用的功能（如设置页）可以延迟加载
3. **虚拟滚动**：如果提示词列表很长，可考虑实现虚拟滚动
4. **Web Workers**：将 SSE 解析移到 Web Worker（如果浏览器支持）

