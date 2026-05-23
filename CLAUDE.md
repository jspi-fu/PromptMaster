# CLAUDE.md

## 语言
与用户对话、撰写文档的语言为中文。

## 项目概述

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

PromptMaster（提示词大师）是一个 Chrome/Edge 浏览器扩展（Manifest V3），用于跨 24 个 AI 平台管理和插入提示词。原生 JavaScript，无框架依赖。

## 常用命令

```bash
# 开发
npm run lint              # ESLint 检查 src/
npm run lint:fix          # ESLint 自动修复

# 测试（需要真实浏览器，headless: false）
npm test                  # 运行所有测试
npm run debug             # 调试模式运行测试

# 构建
npm run build             # 同时生成 Chrome 和 Edge zip
npm run build:chrome      # 仅 Chrome Web Store 包
npm run build:edge        # 仅 Edge Add-ons 包
npm run build:prod        # 复制 manifest.prod.json 到 manifest.json
```

## 架构

### 脚本注入链（Service Worker -> 内容脚本）

Service Worker (`service-worker.js`) 检测到匹配 AI 平台 URL 时，通过 `chrome.scripting.executeScript` 按顺序注入：

1. `inputBoxHandler.js` — 输入框检测与文本插入
2. `content.styles.js` — CSS 注入 + 主题常量
3. `content.shared.js` — TagService/TagUI/PromptUI/PanelRouter
4. `content.js` — 主应用（存储管理、键盘快捷键、变量处理、CHAT 视图）

使用 `window.__promptManager*Injected` 标记防止重复注入。

### 存储层

`promptStorage.js` 是统一数据源，版本化存储（v2）。数据结构：`{ version, prompts[], folders[] }`。通过 `chrome.runtime.getURL` + 动态 `import()` 在内容脚本中加载。保持旧版 `prompts` 键镜像以兼容。

### UI 架构

全部原生 DOM 操作，无虚拟 DOM。`PanelRouter.mount(view)` 实现视图路由（LIST/CREATE/EDIT/SETTINGS/HELP/CHAT/VARIABLE_INPUT）。主题通过 CSS 变量 + `opm-light`/`opm-dark` 类名切换。

### 模块通信

- 内容脚本各层通过 `window` 全局对象通信（`window.PromptUIManager`、`window.PromptStorageManager`、`window.PanelRouter`）
- Service Worker 与内容脚本通过 `chrome.storage` 变更监听通信

### 双 UI 模式

- **浮动模式**：注入到 AI 平台页面的浮动按钮/热角 + 弹出面板
- **侧边栏模式**：`src/sidepanel/` 中的独立应用

两者共享 `promptStorage.js`，通过 `onPromptsChanged` 保持同步。

### 提示词生成器（CHAT 视图）

位于 `content.js`，调用 OpenAI 兼容接口（`stream: true`）。用户配置存储在 `chrome.storage.local`（`chatApiKey`、`chatBaseUrl`、`chatModelName`）。

## 关键文件

| 文件 | 职责 |
|------|------|
| `src/service-worker.js` | 后台协调器：脚本注入、权限管理、上下文菜单、侧边栏 |
| `src/content.js` | 主应用：UI 管理、键盘快捷键、变量处理、CHAT 视图 |
| `src/content.shared.js` | 共享 UI：TagService、TagUI、PromptUI、PanelRouter |
| `src/content.styles.js` | 样式层：CSS 注入、主题常量 |
| `src/inputBoxHandler.js` | 输入框检测与文本插入（支持 Lexical/CodeMirror/Slate/ProseMirror 等编辑器） |
| `src/promptStorage.js` | 统一版本化存储 API（v2） |
| `src/llm_providers.json` | 24 个 AI 平台配置（name、pattern、element_selector） |
| `src/sidepanel/sidepanel.js` | 侧边栏应用逻辑 |
| `src/permissions/permissions.js` | 权限管理器 |

## 代码风格

- 2 空格缩进，单引号，分号，Unix 换行
- ESLint flat config（`eslint.config.js`），ECMAScript 2022 + ES Modules
- 国际化使用 `chrome.i18n` API，翻译文件在 `src/_locales/`
- 变量语法：`#variable#` 双井号包裹

## 添加新 AI 平台

编辑 `src/llm_providers.json`，添加 `name`、`pattern`（URL 通配符）、`url`、`icon_url`、`element_selector`。详见 `docs/EXTENDING_PLATFORMS.md`。

## 测试

端到端测试使用 Jest + Puppeteer，加载真实扩展到浏览器。测试文件在 `tests/` 目录。
