// content.styles.js
// 从 content.js 中提取样式并合并全局常量，不改变原有行为
// 常量和样式注入器通过全局挂载，无需修改权限或 manifest
(function () {
  'use strict';

  if (window.__promptManagerStylesInjected) {
    return;
  }
  window.__promptManagerStylesInjected = true;
  window.__promptManagerInjected = true; // 旧版兼容标记

  /* 合并自 content.constants.js 的全局常量 */
  // 使用 var 和 window 挂载，确保后续注入的脚本可以访问这些值
  var THEME_COLORS = window.THEME_COLORS || {
    primary: '#3A6EA5', primaryGradientStart: '#3A6EA5', primaryGradientEnd: '#5788B3',
    hoverPrimary: '#4B88C7', darkBackground: '#0F0F0F', lightBackground: '#F7FAFC',
    darkBorder: '#2A2A2A', lightBorder: '#E2E8F0',
    darkShadow: '0 4px 20px rgba(0,0,0,0.5)', lightShadow: '0 4px 20px rgba(0,0,0,0.15)',
    inputDarkBorder: '1px solid #3A3A3A', inputLightBorder: '1px solid #CBD5E0',
    inputDarkBg: '#1A1A1A', inputLightBg: '#FFFFFF',
    inputDarkText: '#E8E8E8', inputLightText: '#2D3748'
  };
  window.THEME_COLORS = THEME_COLORS;

  var UI_STYLES = window.UI_STYLES || {
    getPromptButtonContainerStyle: pos => ({
      position: 'fixed', zIndex: '9999',
      bottom: `${pos.y}px`, right: `${pos.x}px`,
      width: '40px', height: '40px',
      userSelect: 'none',
    }),
    hotCornerActiveZone: {
      position: 'fixed',
      bottom: '0',
      right: '0',
      width: '60px',
      height: '60px',
      zIndex: '9998',
      backgroundColor: 'transparent'
    }
  };
  window.UI_STYLES = UI_STYLES;

  var PROMPT_CLOSE_DELAY = typeof window.PROMPT_CLOSE_DELAY === 'number' ? window.PROMPT_CLOSE_DELAY : 10000;
  window.PROMPT_CLOSE_DELAY = PROMPT_CLOSE_DELAY;

  var SELECTORS = window.SELECTORS || {
    ROOT: 'opm-root',
    PROMPT_BUTTON_CONTAINER: 'opm-prompt-button-container',
    PROMPT_BUTTON: 'opm-prompt-button',
    PROMPT_LIST: 'opm-prompt-list',
    PANEL_CONTENT: 'opm-panel-content',
    PROMPT_SEARCH_INPUT: 'opm-prompt-search-input',
    PROMPT_ITEMS_CONTAINER: 'opm-prompt-items-container',
    ONBOARDING_POPUP: 'opm-onboarding-popup',
    HOT_CORNER_CONTAINER: 'opm-hot-corner-container',
    HOT_CORNER_INDICATOR: 'opm-hot-corner-indicator',
    INFO_CONTENT: 'opm-info-content',
    CHAT_CONTENT: 'opm-chat-content'
  };
  window.SELECTORS = SELECTORS;

  // 函数挂载到全局（依赖上方定义的常量）
  var injectGlobalStyles = window.injectGlobalStyles || function injectGlobalStyles() {
    const styleEl = document.createElement('style');
    styleEl.textContent = `
    /* 全局 CSS 变量，供弹窗等不在 #opm-root 内的元素使用 */
    :root {
      /* 主题色 */
      --primary: ${THEME_COLORS.primary};
      --primary-gradient-start: ${THEME_COLORS.primaryGradientStart};
      --primary-gradient-end: ${THEME_COLORS.primaryGradientEnd};
      --hover-primary: ${THEME_COLORS.hoverPrimary};
      /* 主色透明度变体 */
      --primary-alpha-hover: rgba(54, 116, 181, 0.08);
      --primary-alpha-focus: rgba(54, 116, 181, 0.12);
      --primary-alpha-active: rgba(54, 116, 181, 0.25);
      /* 背景色 */
      --light-bg: ${THEME_COLORS.lightBackground};
      --dark-bg: ${THEME_COLORS.darkBackground};
      --light-surface: #f1f5f9;
      --light-surface-alt: #f8fafc;
      --dark-surface: #1e293b;
      --dark-surface-alt: #334155;
      --light-card-bg: #ffffff;
      --dark-card-bg: #1A1A1A;
      --light-hover-bg: #e2e8f0;
      --dark-hover-bg: #252525;
      --code-light-bg: #f6f8fa;
      --code-dark-bg: #161b22;
      /* 边框 */
      --light-border: ${THEME_COLORS.lightBorder};
      --dark-border: ${THEME_COLORS.darkBorder};
      /* 阴影 */
      --light-shadow: ${THEME_COLORS.lightShadow};
      --dark-shadow: ${THEME_COLORS.darkShadow};
      /* 文字色 */
      --light-text: #1e293b;
      --light-text-secondary: #64748b;
      --light-text-tertiary: #94a3b8;
      --dark-text: ${THEME_COLORS.inputDarkText};
      --dark-text-secondary: #888888;
      --dark-text-tertiary: #AAAAAA;
      /* 输入框 */
      --input-light-border: ${THEME_COLORS.inputLightBorder};
      --input-dark-border: ${THEME_COLORS.inputDarkBorder};
      --input-light-bg: ${THEME_COLORS.inputLightBg};
      --input-dark-bg: ${THEME_COLORS.inputDarkBg};
      --input-light-text: ${THEME_COLORS.inputLightText};
      --input-dark-text: ${THEME_COLORS.inputDarkText};
      --dark-input-border: #3A3A3A;
      /* 标签 */
      --tag-selected-bg: #E6F0FF;
      --tag-selected-border: #BBD3FF;
      /* 搜索高亮 */
      --search-highlight: rgba(250, 204, 21, 0.35);
      --search-highlight-dark: rgba(59, 130, 246, 0.5);
    }
    #${SELECTORS.ROOT} {
      --transition-speed: 0.3s;
      --border-radius: 8px;
      --font-family: 'Roboto', sans-serif;
    }
    
    /* 用户偏好——滚动条永久隐藏（仅保留滚动功能，不显示任何滑动栏） */
    #${SELECTORS.ROOT} .opm-scrollable {
      scrollbar-width: none !important; /* Firefox */
      -ms-overflow-style: none !important; /* IE/旧 Edge */
      scrollbar-color: transparent transparent !important;
    }
    #${SELECTORS.ROOT} .opm-scrollable::-webkit-scrollbar {
      width: 0 !important;
      height: 0 !important;
      background: transparent !important;
    }
    
    /* 聊天输入框滚动条永久隐藏（用户输入区域不显示任何滚动条） */
    #${SELECTORS.ROOT} #opm-chat-input {
      scrollbar-width: none; /* Firefox */
      -ms-overflow-style: none; /* IE/旧 Edge */
    }
    #${SELECTORS.ROOT} #opm-chat-input::-webkit-scrollbar {
      width: 0;
      height: 0;
      background: transparent;
    }

    /* 聊天设置弹窗不在 ROOT 内，单独隐藏其滚动条（仍可滚动） */
    .opm-chat-settings-content {
      scrollbar-width: none;
      -ms-overflow-style: none;
      scrollbar-color: transparent transparent;
    }
    .opm-chat-settings-content::-webkit-scrollbar {
      width: 0;
      height: 0;
      background: transparent;
    }
    /* 横向标签栏激活时使用较短的滚动条 */
    #${SELECTORS.ROOT} .opm-tags-filter-bar.opm-scroll-active::-webkit-scrollbar {
      height: 8px;
    }
    
    #${SELECTORS.ROOT}, #${SELECTORS.ROOT} * { font-family: var(--font-family); }
    #${SELECTORS.ROOT} .opm-prompt-button {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      border: none;
      outline: none;
      cursor: pointer;
      background: linear-gradient(135deg, var(--primary-gradient-start), var(--primary-gradient-end));
      background-size: cover;
      box-shadow: var(--light-shadow);
      transition: transform var(--transition-speed) ease, box-shadow var(--transition-speed) ease;
      background-position: center;
      background-repeat: no-repeat;
      position: relative;
    }
    
    #${SELECTORS.ROOT} .opm-toggle-switch {
      position: relative;
      width: 40px;
      height: 20px;
      border-radius: 10px;
      cursor: pointer;
      transition: background-color var(--transition-speed) ease;
    }
    
    #${SELECTORS.ROOT} .opm-toggle-switch.opm-light {
      background-color: var(--light-text-tertiary);
    }

    #${SELECTORS.ROOT} .opm-toggle-switch.opm-dark {
      background-color: var(--dark-text-secondary);
    }
    
    #${SELECTORS.ROOT} .opm-toggle-switch.active.opm-light {
      background-color: var(--primary);
    }
    
    #${SELECTORS.ROOT} .opm-toggle-switch.active.opm-dark {
      background-color: var(--primary);
    }
    
    #${SELECTORS.ROOT} .opm-toggle-switch::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background-color: #fff;
      transition: transform var(--transition-speed) ease;
    }
    
    #${SELECTORS.ROOT} .opm-toggle-switch.active::after {
      transform: translateX(20px);
    }
    
    /* 设置页”?” 悬浮提示（tooltip 使用 title 原生提示） */
    #${SELECTORS.ROOT} .opm-toggle-label-wrap {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    #${SELECTORS.ROOT} .opm-help-tip {
      width: 16px;
      height: 16px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
      line-height: 1;
      cursor: help;
      user-select: none;
      color: ${THEME_COLORS.primary};
      border: 1px solid ${THEME_COLORS.primary}55;
      background: rgba(54, 116, 181, 0.08);
    }
    #${SELECTORS.ROOT}.opm-dark .opm-help-tip {
      background: rgba(54, 116, 181, 0.18);
      border-color: ${THEME_COLORS.primary}80;
    }
    
    #${SELECTORS.ROOT} .opm-prompt-button::after {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-image: url('${chrome.runtime.getURL('icons/icon-button.png')}');
      background-size: 50%;
      background-position: center;
      background-repeat: no-repeat;
    }
    #${SELECTORS.ROOT} .opm-prompt-button:hover {
      transform: scale(1.05);
      box-shadow: var(--dark-shadow);
    }
    #${SELECTORS.ROOT} .opm-prompt-list {
      position: absolute;
      bottom: 50px;
      right: 0;
      padding: 10px;
      border-radius: var(--border-radius);
      display: none;
      width: 280px;
      z-index: 10000;
      opacity: 0;
      transform: translateY(10px) scale(0.98);
      will-change: transform, opacity;
      transition: opacity 0.15s ease, transform 0.2s ease;
      backdrop-filter: blur(12px);
      /* 限制面板高度，内部列表独立滚动，滚动必须在列表项容器内而非整个面板 */
      display: flex;
      flex-direction: column;
      min-height: 450px;
      max-height: 450px;
      overflow: hidden;
      text-align: left;
    }
    #${SELECTORS.ROOT} #${SELECTORS.PANEL_CONTENT} {
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden; /* 滚动仅限于列表项容器 */
      position: relative; /* 作为底部菜单的绝对定位锚点 */
      padding-bottom: 10px;
      display: flex;
      flex-direction: column;
      padding-bottom: 48px; /* 增大预留空间，避免与底部菜单重叠 */
    }
    #${SELECTORS.ROOT} .opm-prompt-list.opm-visible {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    #${SELECTORS.ROOT} .opm-prompt-list.opm-light {
      background-color: var(--light-bg);
      border: 1px solid var(--light-border);
      box-shadow: var(--light-shadow);
    }
    #${SELECTORS.ROOT} .opm-prompt-list.opm-dark {
      background-color: var(--dark-bg);
      border: 1px solid var(--dark-border);
      box-shadow: var(--dark-shadow);
    }
    /* 高度模式：固定（非列表视图）vs 自适应（列表视图） */
    #${SELECTORS.ROOT} .opm-prompt-list.opm-fixed-400 {
      min-height: 400px;
      max-height: 400px;
    }
    #${SELECTORS.ROOT} .opm-prompt-list.opm-variable {
      height: auto;
      min-height: 0;
      max-height: 400px;
    }
    #${SELECTORS.ROOT} .opm-prompt-list-items {
      max-height: 350px;
      overflow-y: auto;
      margin-bottom: 8px;
      padding-top: 4px;
      padding-bottom: 24px; /* 额外间距，避免最后一项被底部菜单遮挡 */
      flex: 1 1 auto; /* 列表项占据可用空间并内部滚动 */
      display: flex;
      flex-direction: column;
    }
    #${SELECTORS.ROOT} .opm-prompt-list-items.opm-light {
      background-color: var(--light-bg);
    }
    #${SELECTORS.ROOT} .opm-prompt-list-items.opm-dark {
      background-color: var(--dark-bg);
    }
    /* 标签筛选栏（仅列表视图） */
    #${SELECTORS.ROOT} .opm-tags-filter-bar {
      display: flex;
      flex-direction: row;
      align-items: flex-start; /* 展开时允许高度增长 */
      gap: 0; /* 间距由外层容器控制 */
      padding: 6px 4px 6px 8px; /* 右侧内边距稍减，为按钮留位 */
      border-bottom: 1px solid rgba(0,0,0,0.08);
      min-height: 34px;
      box-sizing: border-box;
      flex: none;
      width: 100%;
    }
    #${SELECTORS.ROOT} .opm-tags-wrapper {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 6px;
      overflow-x: auto;
      overflow-y: hidden;
      white-space: nowrap;
      flex: 1; /* Take all available width */
      scrollbar-width: none; /* 隐藏滚动条保持简洁 */
      padding-bottom: 2px; /* 防止滚动条遮挡内容 */
    }
    #${SELECTORS.ROOT} .opm-tags-wrapper::-webkit-scrollbar {
      display: none;
    }
    #${SELECTORS.ROOT} .opm-tags-filter-bar.opm-expanded .opm-tags-wrapper {
      flex-wrap: wrap;
      overflow-x: visible;
      white-space: normal;
      height: auto;
      padding-right: 4px; /* 与按钮的间距 */
    }
    #${SELECTORS.ROOT} .opm-tags-expand-btn {
      flex: 0 0 auto;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      cursor: pointer;
      color: inherit;
      border-radius: 4px;
      margin-left: 2px;
      padding: 0;
      opacity: 0.6;
      transition: background-color 0.2s, opacity 0.2s;
    }
    #${SELECTORS.ROOT} .opm-tags-expand-btn:hover {
      background-color: rgba(0,0,0,0.05);
      opacity: 1;
    }
    #${SELECTORS.ROOT}.opm-dark .opm-tags-expand-btn {
      color: var(--input-dark-text);
    }
    #${SELECTORS.ROOT}.opm-dark .opm-tags-expand-btn:hover {
      background-color: rgba(255,255,255,0.1);
    }
    #${SELECTORS.ROOT} .opm-tags-expand-btn {
      color: var(--input-light-text);
    }
    #${SELECTORS.ROOT}.opm-dark .opm-tags-filter-bar { border-bottom-color: rgba(255,255,255,0.12); }
    #${SELECTORS.ROOT} .opm-tag-pill-filter {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 4px 10px;
      border-radius: 9999px;
      border: 1px solid var(--light-border);
      font-size: 13px;
      cursor: pointer;
      flex: 0 0 auto;
      user-select: none;
      background-color: var(--light-card-bg);
      color: var(--input-light-text);
    }
    #${SELECTORS.ROOT}.opm-dark .opm-tag-pill-filter {
      border-color: var(--dark-border);
      background-color: var(--dark-card-bg);
      color: var(--input-dark-text);
    }
    /* 标签胶囊选中状态 */
    #${SELECTORS.ROOT} .opm-tag-pill-filter[aria-pressed="true"] {
      background-color: var(--tag-selected-bg);
      border-color: var(--tag-selected-border);
    }
    #${SELECTORS.ROOT}.opm-dark .opm-tag-pill-filter[aria-pressed="true"] {
      background-color: var(--dark-hover-bg);
      border-color: var(--primary);
    }
    /* 通用容器文字颜色 */
    #${SELECTORS.ROOT} .opm-form-container.opm-light { color: var(--input-light-text); }
    #${SELECTORS.ROOT} .opm-form-container.opm-dark { color: var(--input-dark-text); }
    /* 仅提示词创建表单使用紧凑间距 */
    #${SELECTORS.ROOT} .opm-create-form { gap: 4px !important; }
    /* 文本域在表单中自动扩展 */
    #${SELECTORS.ROOT} .opm-form-container {
      display: flex;
      flex-direction: column;
      min-height: 0; /* 允许子元素在受限父容器内弹性伸缩 */
      flex: 1 1 auto; /* 填充面板剩余高度 */
      overflow-y: auto; /* 内容超出时表单可滚动 */
      padding-bottom: 0px;
    }
    #${SELECTORS.ROOT} .opm-form-container .opm-textarea-field {
      flex: 1 1 auto;
      min-height: 0;
      resize: vertical;
    }
    #${SELECTORS.ROOT} .opm-prompt-list-item.opm-light { color: var(--input-light-text); }
    #${SELECTORS.ROOT} .opm-prompt-list-item.opm-dark { color: var(--input-dark-text); }
    /* 社区链接颜色跟随主题自动切换 */
    #${SELECTORS.ROOT} .opm-community-title {
      font-weight: bold;
      font-size: 13px;
      margin-top: 10px;
      opacity: 0.85;
    }
    #${SELECTORS.ROOT} .opm-community-title.opm-light,
    #${SELECTORS.ROOT} .opm-community-link.opm-light {
      color: var(--input-light-text);
    }
    #${SELECTORS.ROOT} .opm-community-title.opm-dark,
    #${SELECTORS.ROOT} .opm-community-link.opm-dark {
      color: var(--input-dark-text);
    }
    #${SELECTORS.ROOT} .opm-community-link {
      display: flex;
      align-items: center;
      gap: 8px;
      text-decoration: none;
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 13px;
      font-weight: 500;
      transition: background-color 0.2s ease, border-color 0.2s ease;
    }
    #${SELECTORS.ROOT} .opm-community-link.opm-light {
      border: 1px solid rgba(0,0,0,0.05);
      background-color: rgba(15, 23, 42, 0.03);
    }
    #${SELECTORS.ROOT} .opm-community-link.opm-dark {
      border: 1px solid rgba(255,255,255,0.12);
      background-color: rgba(255,255,255,0.03);
    }
    #${SELECTORS.ROOT} .opm-community-link.opm-light:hover {
      background-color: rgba(54, 116, 181, 0.1);
      border-color: rgba(54, 116, 181, 0.25);
    }
    #${SELECTORS.ROOT} .opm-community-link.opm-dark:hover {
      background-color: rgba(255,255,255,0.08);
      border-color: rgba(255,255,255,0.2);
    }
    #${SELECTORS.ROOT} .opm-prompt-list-item {
      border-radius: var(--border-radius);
      font-size: 14px;
      cursor: pointer;
      transition: background-color 0.15s ease, transform 0.15s ease;
      will-change: transform;
      display: flex;
      align-items: center;
      padding: 6px 12px;
      text-align: left;
    }
    #${SELECTORS.ROOT} .opm-prompt-list-item.opm-light:hover {
      background-color: var(--light-hover-bg);
      transform: translateY(-2px);
    }
    #${SELECTORS.ROOT} .opm-prompt-list-item.opm-dark:hover {
      background-color: var(--dark-surface);
      transform: translateY(-2px);
    }
    /* 搜索匹配预览样式 */
    #${SELECTORS.ROOT} .opm-search-preview {
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
      line-height: 1.4;
      margin-top: 1px;
    }
    #${SELECTORS.ROOT} .opm-search-preview.opm-light {
      color: var(--light-text-tertiary);
    }
    #${SELECTORS.ROOT} .opm-search-preview.opm-dark {
      color: var(--light-text-secondary);
    }
    #${SELECTORS.ROOT} .opm-search-preview mark {
      background-color: var(--search-highlight);
      color: inherit;
      padding: 0;
      border-radius: 2px;
    }
    #${SELECTORS.ROOT} .opm-search-preview.opm-dark mark {
      background-color: var(--search-highlight-dark);
      color: #ffffff;
    }

    /* Prompt hover preview panel */
    .opm-preview-panel {
      position: absolute;
      z-index: 2147483647;
      overflow-y: auto;
      padding: 10px 12px;
      border-radius: var(--border-radius, 8px);
      font-size: 13px;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15), 0 2px 8px rgba(0, 0, 0, 0.08);
      animation: opm-preview-fadein 0.15s ease-out;
      pointer-events: auto;
      text-align: left;
      backdrop-filter: blur(12px);
    }
    .opm-preview-panel.opm-light {
      background-color: var(--light-card-bg);
      color: var(--light-text);
      border: 1px solid var(--light-border);
    }
    .opm-preview-panel.opm-dark {
      background-color: #000000;
      color: var(--light-border);
      border: 1px solid var(--dark-surface-alt);
    }
    .opm-preview-panel::-webkit-scrollbar {
      width: 5px;
    }
    .opm-preview-panel::-webkit-scrollbar-thumb {
      background: rgba(0, 0, 0, 0.15);
      border-radius: 3px;
    }
    .opm-preview-panel.opm-dark::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.15);
    }
    .opm-preview-panel mark {
      background-color: var(--search-highlight);
      color: inherit;
      padding: 0;
      border-radius: 2px;
    }
    .opm-preview-panel.opm-dark mark {
      background-color: var(--search-highlight-dark);
    }
    @keyframes opm-preview-fadein {
      from { opacity: 0; transform: translateX(-4px); }
      to { opacity: 1; transform: translateX(0); }
    }

    /* Drag-and-drop placeholder to displace items during reordering */
    #${SELECTORS.ROOT} .opm-drop-placeholder {
      border: 1px dashed var(--light-border);
      background-color: ${THEME_COLORS.primary}14;
      border-radius: var(--border-radius);
      margin: 6px 0;
    }
    #${SELECTORS.ROOT}.opm-dark .opm-drop-placeholder {
      border: 1px dashed var(--dark-border);
      background-color: ${THEME_COLORS.primary}26;
    }
    /* Bottom menu styling: stick to bottom of the container */
    #${SELECTORS.ROOT} .opm-bottom-menu {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 10px;
      border-top: 1px solid var(--light-border);
      flex: none;
      z-index: 1;
      background: transparent;
    }
    #${SELECTORS.ROOT} .opm-bottom-menu.opm-light {
      background-color: var(--light-bg);
    }
    #${SELECTORS.ROOT} .opm-bottom-menu.opm-dark {
      background-color: var(--dark-bg);
      border-top: 1px solid var(--dark-border);
    }
    /* Search input styling */
    #${SELECTORS.ROOT} .opm-prompt-list .opm-search-input {
      width: 100%;
      padding: 8px;
      font-size: 14px;
      border-radius: 4px;
      box-sizing: border-box;
      height: 32px;
      line-height: 20px;
      outline: none;
      transition: border-color var(--transition-speed) ease, box-shadow var(--transition-speed) ease;
      display: none; /* initially hidden until Prompt Manager list opens */
    }
    #${SELECTORS.ROOT} .opm-prompt-list .opm-search-input.opm-light {
      border: var(--input-light-border);
      background-color: var(--input-light-bg);
      color: var(--input-light-text);
    }
    #${SELECTORS.ROOT} .opm-prompt-list .opm-search-input.opm-dark {
      border: var(--input-dark-border);
      background-color: var(--input-dark-bg);
      color: var(--input-dark-text);
    }
    /* Form fields styling */
    #${SELECTORS.ROOT} .opm-input-field, #${SELECTORS.ROOT} .opm-textarea-field {
      width: 100%;
      padding: 8px;
      border-radius: 6px;
      box-sizing: border-box;
      font-size: 14px;
      font-family: var(--font-family);
      color: var(--input-text);
      margin-bottom: 4px;
    }
    #${SELECTORS.ROOT} .opm-input-field.opm-light {
      border: var(--input-light-border);
      background-color: var(--input-light-bg);
      color: var(--input-light-text);
    }
    #${SELECTORS.ROOT} .opm-input-field.opm-dark {
      border: var(--input-dark-border);
      background-color: var(--input-dark-bg);
      color: var(--input-dark-text);
    }
    #${SELECTORS.ROOT} .opm-textarea-field.opm-light {
      border: var(--input-light-border);
      background-color: var(--input-light-bg);
      color: var(--input-light-text);
      min-height: 120px;
      resize: vertical;
    }
    #${SELECTORS.ROOT} .opm-textarea-field.opm-dark {
      border: var(--input-dark-border);
      background-color: var(--input-dark-bg);
      color: var(--input-dark-text);
      min-height: 120px;
      resize: vertical;
    }
    /* Button styling */
    #${SELECTORS.ROOT} .opm-button {
      padding: 10px;
      width: 100%;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      transition: background-color var(--transition-speed) ease;
      color: #fff;
    }
    #${SELECTORS.ROOT} .opm-button.opm-light {
      background-color: var(--primary);
    }
    #${SELECTORS.ROOT} .opm-button.opm-dark {
      background-color: var(--hover-primary);
    }
    #${SELECTORS.ROOT} .opm-button:hover {
      opacity: 0.9;
    }
    /* Icon button styling */
    #${SELECTORS.ROOT} .opm-icon-button {
      width: 28px;
      height: 28px;
      padding: 6px;
      background-color: transparent;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color var(--transition-speed) ease;
    }
    #${SELECTORS.ROOT} .opm-icon-button:hover {
      background-color: rgba(0, 0, 0, 0.1);
    }
    
    /* 暗色模式下底部菜单图标强制白色显示 */
    #${SELECTORS.ROOT}.opm-dark .opm-bottom-menu .opm-icon-button img {
      /* 高对比度反转，无饱和度；亮色模式保持不变 */
      filter: invert(100%) saturate(0%) brightness(115%) contrast(100%) !important;
    }
    /* Focus style for search input only (avoid styling tag inputs inside forms) */
    #${SELECTORS.ROOT} #${SELECTORS.PROMPT_LIST} .opm-search-input:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 2px rgba(90, 103, 216, 0.3);
      outline: none;
    }
    /* Keyboard navigation styling */
    #${SELECTORS.ROOT} .opm-prompt-list-item.opm-keyboard-selected {
      background-color: var(--dark-bg);
      transform: translateY(-2px);
    }
    #${SELECTORS.ROOT} .opm-prompt-list-item.opm-light.opm-keyboard-selected {
      background-color: var(--light-hover-bg);
      transform: translateY(-2px);
    }
    #${SELECTORS.ROOT} .opm-prompt-list-item.opm-dark.opm-keyboard-selected {
      background-color: var(--dark-surface);
      transform: translateY(-2px);
    }
    #${SELECTORS.ROOT}:not(.opm-edit-mode-active) .opm-edit-only {
      display: none !important;
    }
    #${SELECTORS.ROOT}.opm-edit-mode-active .opm-edit-only {
      display: flex;
    }
    #${SELECTORS.ROOT}:not(.opm-edit-mode-active) .opm-drag-handle {
      cursor: default !important;
    }
    /* Ensure prompt list stays visible during keyboard navigation */
    #${SELECTORS.ROOT} .opm-prompt-list.opm-visible:focus-within {
      display: block;
      opacity: 1;
      transform: translateY(0);
    }
    /* Tags input and pills */
    #${SELECTORS.ROOT} .opm-tag-row {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-wrap: nowrap; /* 保持单行 */
      overflow-x: auto;  /* 横向滚动而非换行 */
      min-height: 32px;
      padding: 4px 6px;
      border-radius: 6px;
      position: relative; /* 允许建议列表绝对定位 */
    }
    #${SELECTORS.ROOT} .opm-tag-row.opm-light { border: var(--input-light-border); background-color: var(--input-light-bg); }
    #${SELECTORS.ROOT} .opm-tag-row.opm-dark { border: var(--input-dark-border); background-color: var(--input-dark-bg); }
    #${SELECTORS.ROOT} .opm-tags-container { display: flex; gap: 2px; flex-wrap: nowrap; align-items: center; }
    /* Settings tag management: allow wrapping to multiple lines */
    #${SELECTORS.ROOT} .opm-tags-mgmt-container {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
    }
    #${SELECTORS.ROOT} .opm-tag-input {
      flex: 0 0 auto; /* 不伸展，保持单行 */
      min-width: 120px;
      border: none;
      outline: none;
      background: transparent;
      color: inherit;
      font-size: 13px;
      padding: 2px 4px;
    }
    #${SELECTORS.ROOT} .opm-tag-pill {
      display: inline-flex;
      align-items: center;
      padding: 1px 6px;
      border-radius: 999px;
      font-size: 12px;
      background-color: ${THEME_COLORS.primary}22;
      color: inherit;
      white-space: nowrap;
      line-height: 1;
      flex: 0 0 auto;
    }
    #${SELECTORS.ROOT} .opm-tag-pill.opm-light { border: 1px solid var(--light-border); }
    #${SELECTORS.ROOT} .opm-tag-pill.opm-dark { border: 1px solid var(--dark-border); }
    #${SELECTORS.ROOT} .opm-tag-remove {
      margin-left: 6px;
      border: none;
      background: transparent;
      color: inherit;
      cursor: pointer;
      font-size: 14px;
      line-height: 1;
      padding: 0 2px;
    }

    /* Tag suggestions dropdown */
    #${SELECTORS.ROOT} .opm-tag-suggestions {
      /* positioning and z-index are set inline by JS to avoid stacking/overflow issues */
      max-height: 160px;
      overflow-y: auto;
      border-radius: 6px;
      box-shadow: var(--light-shadow);
      padding: 4px;
    }
    #${SELECTORS.ROOT} .opm-tag-suggestions.opm-light { background-color: var(--light-bg); border: 1px solid var(--light-border); }
    #${SELECTORS.ROOT} .opm-tag-suggestions.opm-dark { background-color: var(--dark-bg); border: 1px solid var(--dark-border); box-shadow: var(--dark-shadow); }

    #${SELECTORS.ROOT} .opm-tag-suggestions.opm-light .opm-tag-suggestion-item { color: #000; }
    #${SELECTORS.ROOT} .opm-tag-suggestions.opm-dark .opm-tag-suggestion-item { color: var(--input-dark-text); }

    #${SELECTORS.ROOT} .opm-tag-suggestion-item {
      padding: 6px 8px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      margin: 2px 0;
    }
    #${SELECTORS.ROOT} .opm-tag-suggestion-item:hover,
    #${SELECTORS.ROOT} .opm-tag-suggestion-item.active {
      background-color: ${THEME_COLORS.primary}22;
    }

    /* Remove focus border/shadow on inputs inside create/edit forms only */
    #${SELECTORS.ROOT} .opm-form-container .opm-input-field.opm-light:focus,
    #${SELECTORS.ROOT} .opm-form-container .opm-textarea-field.opm-light:focus {
      border: var(--input-light-border);
      box-shadow: none;
      outline: none;
    }
    #${SELECTORS.ROOT} .opm-form-container .opm-input-field.opm-dark:focus,
    #${SELECTORS.ROOT} .opm-form-container .opm-textarea-field.opm-dark:focus {
      border: var(--input-dark-border);
      box-shadow: none;
      outline: none;
    }
    #${SELECTORS.ROOT} .opm-form-container .opm-tag-input:focus {
      border: none;
      box-shadow: none;
      outline: none;
    }
    /* Onboarding animation */
    @keyframes opm-onboarding-bounce {
      0%, 100% { transform: translateX(-50%) translateY(0); }
      50% { transform: translateX(-50%) translateY(-5px); }
    }
    /* Responsive styles for onboarding popup */
    @media (max-width: 768px) {
      #${SELECTORS.ROOT} #${SELECTORS.ONBOARDING_POPUP} {
        font-size: 12px;
        padding: 6px 10px;
      }
    }
    /* Hot corner styling */
    #${SELECTORS.ROOT} #${SELECTORS.HOT_CORNER_INDICATOR} {
      opacity: 0.7;
      transition: opacity 0.3s ease, border-width 0.3s ease, border-color 0.3s ease;
    }
    #${SELECTORS.ROOT} #${SELECTORS.HOT_CORNER_CONTAINER}:hover #${SELECTORS.HOT_CORNER_INDICATOR} {
      opacity: 1;
    }
    
    /* Chat interface styles */
    #${SELECTORS.ROOT} .opm-chat-container {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    #${SELECTORS.ROOT} .opm-chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-height: 0;
    }
    #${SELECTORS.ROOT} .opm-chat-message {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 10px 14px;
      max-width: 88%;
      animation: fadeIn 0.2s ease-out;
      font-size: 13px;
      position: relative;
      line-height: 1.5;
    }
    #${SELECTORS.ROOT} .opm-chat-message.opm-chat-user {
      align-self: flex-end;
      background-color: var(--primary);
      color: #fff;
      border-radius: 18px 18px 2px 18px;
    }
    #${SELECTORS.ROOT}.opm-dark .opm-chat-message.opm-chat-user {
      background-color: var(--primary);
    }
    #${SELECTORS.ROOT} .opm-chat-message.opm-chat-assistant {
      align-self: flex-start;
      background-color: var(--light-surface);
      color: var(--light-text);
      border-radius: 18px 18px 18px 2px;
      border: 1px solid var(--light-border);
    }
    #${SELECTORS.ROOT}.opm-dark .opm-chat-message.opm-chat-assistant {
      background-color: var(--dark-card-bg);
      color: var(--input-dark-text);
      border-color: var(--dark-border);
    }

    /* Save prompt icon on assistant messages */
    #${SELECTORS.ROOT} .opm-chat-save-prompt {
      position: absolute;
      top: -10px;
      right: -10px;
      width: 24px;
      height: 24px;
      background-color: var(--light-card-bg);
      border: 1px solid var(--light-border);
      border-radius: 50%;
      display: none;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
      z-index: 10;
      transition: transform 0.1s ease;
    }
    #${SELECTORS.ROOT}.opm-dark .opm-chat-save-prompt {
      background-color: var(--dark-card-bg);
      border-color: var(--dark-border);
    }
    #${SELECTORS.ROOT} .opm-chat-message.opm-chat-assistant:hover .opm-chat-save-prompt {
      display: flex;
    }
    #${SELECTORS.ROOT} .opm-chat-save-prompt:hover {
      transform: scale(1.1);
      background-color: var(--light-surface-alt);
    }
    #${SELECTORS.ROOT}.opm-dark .opm-chat-save-prompt:hover {
      background-color: var(--dark-hover-bg);
    }

    /* Markdown rendered content styles */
    #${SELECTORS.ROOT} .opm-chat-content p {
      margin: 0 0 8px 0;
    }
    #${SELECTORS.ROOT} .opm-chat-content p:last-child {
      margin-bottom: 0;
    }
    #${SELECTORS.ROOT} .opm-chat-content code {
      background-color: rgba(0, 0, 0, 0.06);
      padding: 1px 4px;
      border-radius: 4px;
      font-size: 12px;
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    }
    #${SELECTORS.ROOT}.opm-dark .opm-chat-content code {
      background-color: rgba(255, 255, 255, 0.1);
    }
    #${SELECTORS.ROOT} .opm-chat-content pre {
      background-color: var(--code-light-bg);
      border-radius: 8px;
      padding: 10px 12px;
      margin: 8px 0;
      overflow-x: auto;
      font-size: 12px;
      line-height: 1.45;
    }
    #${SELECTORS.ROOT}.opm-dark .opm-chat-content pre {
      background-color: var(--code-dark-bg);
    }
    #${SELECTORS.ROOT} .opm-chat-content pre code {
      background: none;
      padding: 0;
      border-radius: 0;
      font-size: inherit;
    }
    #${SELECTORS.ROOT} .opm-chat-content ul,
    #${SELECTORS.ROOT} .opm-chat-content ol {
      margin: 4px 0;
      padding-left: 20px;
    }
    #${SELECTORS.ROOT} .opm-chat-content li {
      margin: 2px 0;
    }
    #${SELECTORS.ROOT} .opm-chat-content blockquote {
      border-left: 3px solid var(--primary);
      margin: 8px 0;
      padding: 4px 12px;
      color: var(--light-text-secondary);
      background-color: rgba(0, 0, 0, 0.02);
      border-radius: 0 6px 6px 0;
    }
    #${SELECTORS.ROOT}.opm-dark .opm-chat-content blockquote {
      color: var(--light-text-tertiary);
      background-color: rgba(255, 255, 255, 0.03);
    }
    #${SELECTORS.ROOT} .opm-chat-content h1,
    #${SELECTORS.ROOT} .opm-chat-content h2,
    #${SELECTORS.ROOT} .opm-chat-content h3,
    #${SELECTORS.ROOT} .opm-chat-content h4,
    #${SELECTORS.ROOT} .opm-chat-content h5,
    #${SELECTORS.ROOT} .opm-chat-content h6 {
      margin: 12px 0 4px 0;
      font-weight: 600;
      line-height: 1.3;
    }
    #${SELECTORS.ROOT} .opm-chat-content h1:first-child,
    #${SELECTORS.ROOT} .opm-chat-content h2:first-child,
    #${SELECTORS.ROOT} .opm-chat-content h3:first-child,
    #${SELECTORS.ROOT} .opm-chat-content h4:first-child,
    #${SELECTORS.ROOT} .opm-chat-content h5:first-child,
    #${SELECTORS.ROOT} .opm-chat-content h6:first-child {
      margin-top: 0;
    }
    #${SELECTORS.ROOT} .opm-chat-content h1 { font-size: 1.3em; }
    #${SELECTORS.ROOT} .opm-chat-content h2 { font-size: 1.2em; }
    #${SELECTORS.ROOT} .opm-chat-content h3 { font-size: 1.1em; }
    #${SELECTORS.ROOT} .opm-chat-content table {
      border-collapse: collapse;
      margin: 8px 0;
      font-size: 12px;
      width: 100%;
    }
    #${SELECTORS.ROOT} .opm-chat-content th,
    #${SELECTORS.ROOT} .opm-chat-content td {
      border: 1px solid var(--light-border);
      padding: 6px 10px;
      text-align: left;
    }
    #${SELECTORS.ROOT}.opm-dark .opm-chat-content th,
    #${SELECTORS.ROOT}.opm-dark .opm-chat-content td {
      border-color: var(--dark-border);
    }
    #${SELECTORS.ROOT} .opm-chat-content th {
      background-color: var(--light-surface-alt);
      font-weight: 600;
    }
    #${SELECTORS.ROOT}.opm-dark .opm-chat-content th {
      background-color: rgba(255, 255, 255, 0.05);
    }
    #${SELECTORS.ROOT} .opm-chat-content hr {
      border: none;
      border-top: 1px solid var(--light-border);
      margin: 12px 0;
    }
    #${SELECTORS.ROOT}.opm-dark .opm-chat-content hr {
      border-top-color: var(--dark-border);
    }
    #${SELECTORS.ROOT} .opm-chat-content a {
      color: var(--primary);
      text-decoration: none;
    }
    #${SELECTORS.ROOT} .opm-chat-content a:hover {
      text-decoration: underline;
    }
    #${SELECTORS.ROOT} .opm-chat-content img {
      max-width: 100%;
      border-radius: 6px;
    }

    #${SELECTORS.ROOT} .opm-chat-input-area {
      padding: 10px 12px;
      border-top: 1px solid var(--light-border);
      display: flex;
      gap: 8px;
      align-items: flex-end;
      background-color: rgba(255, 255, 255, 0.5);
      backdrop-filter: blur(4px);
    }
    #${SELECTORS.ROOT}.opm-dark .opm-chat-input-area {
      border-top-color: var(--dark-border);
      background-color: rgba(15, 15, 15, 0.8);
    }
    #${SELECTORS.ROOT} .opm-chat-input {
      flex: 1;
      padding: 8px 12px;
      border-radius: 10px;
      border: 1px solid var(--light-border);
      background-color: var(--input-light-bg);
      color: var(--input-light-text);
      font-size: 13px;
      resize: none;
      outline: none;
      max-height: 80px;
      overflow-y: auto;
      transition: border-color 0.2s ease;
    }
    #${SELECTORS.ROOT} .opm-chat-input:focus {
      border-color: var(--primary);
    }
    #${SELECTORS.ROOT}.opm-dark .opm-chat-input {
      border-color: var(--dark-border);
      background-color: var(--input-dark-bg);
      color: var(--input-dark-text);
    }
    
    /* Shadcn-style Modal - 使用全局选择器，因为弹窗不在 #opm-root 内 */
    .opm-chat-settings-content {
      border-radius: 12px;
      border: 1px solid var(--light-border);
      background-color: var(--light-card-bg);
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    }
    .opm-chat-settings-content.opm-dark {
      border-color: var(--dark-border);
      background-color: var(--dark-bg);
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
    }
    .opm-chat-settings-header {
      padding: 16px 20px;
      border-bottom: 1px solid var(--light-surface);
    }
    .opm-chat-settings-header.opm-dark {
      border-bottom-color: var(--dark-border);
    }
    .opm-chat-settings-title {
      font-size: 18px;
      font-weight: 600;
      color: var(--light-text);
    }
    .opm-chat-settings-title.opm-dark {
      color: var(--input-dark-text);
    }
    .opm-chat-settings-desc {
      font-size: 13px;
      color: var(--light-text-secondary);
      margin-top: 4px;
    }
    .opm-chat-settings-desc.opm-dark {
      color: var(--dark-text-secondary);
    }
    .opm-chat-settings-body {
      padding: 20px;
    }
    .opm-chat-settings-footer {
      padding: 16px 20px;
      border-top: 1px solid var(--light-surface);
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .opm-chat-settings-footer.opm-dark {
      border-top-color: var(--dark-border);
    }
    .opm-chat-settings-field {
      margin-bottom: 16px;
    }
    .opm-chat-settings-label {
      font-size: 13px;
      font-weight: 500;
      color: var(--dark-surface-alt);
      margin-bottom: 6px;
      display: block;
    }
    .opm-chat-settings-label.opm-dark {
      color: var(--dark-text-tertiary);
    }
    .opm-chat-settings-input {
      width: 100%;
      padding: 8px 12px;
      border-radius: 6px;
      border: 1px solid var(--light-border);
      font-size: 13px;
      transition: all 0.2s ease;
      background-color: var(--light-card-bg);
      color: var(--light-text);
    }
    .opm-chat-settings-input:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 2px rgba(54, 116, 181, 0.1);
    }
    .opm-chat-settings-input.opm-dark {
      background-color: var(--dark-card-bg);
      border-color: var(--dark-input-border);
      color: var(--input-dark-text);
    }
    .opm-chat-settings-input.opm-dark:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 2px rgba(54, 116, 181, 0.2);
    }
    .opm-chat-settings-btn {
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      border: 1px solid transparent;
    }
    .opm-chat-settings-btn-primary {
      background-color: var(--light-text);
      color: #fff;
    }
    .opm-chat-settings-btn-primary:hover {
      background-color: var(--dark-surface);
    }
    .opm-chat-settings-btn-primary.opm-dark {
      background-color: var(--input-dark-text);
      color: var(--dark-bg);
    }
    .opm-chat-settings-btn-primary.opm-dark:hover {
      background-color: var(--light-card-bg);
    }
    .opm-chat-settings-btn-outline {
      background-color: var(--light-card-bg);
      border-color: var(--light-border);
      color: var(--light-text);
    }
    .opm-chat-settings-btn-outline:hover {
      background-color: var(--light-surface-alt);
    }
    .opm-chat-settings-btn-outline.opm-dark {
      background-color: transparent;
      border-color: var(--dark-input-border);
      color: var(--input-dark-text);
    }
    .opm-chat-settings-btn-outline.opm-dark:hover {
      background-color: var(--dark-card-bg);
    }
    .opm-chat-settings-help.opm-dark {
      color: var(--dark-text-secondary);
    }
    .opm-chat-settings-test-btn.opm-dark {
      color: var(--dark-text-secondary);
    }
    .opm-chat-settings-test-btn.opm-light {
      color: var(--light-text-secondary);
    }
  `;
    document.head.appendChild(styleEl);
  };

  // 保留 content.js 中的引导调用，此处不自动调用以避免重复注入
  window.injectGlobalStyles = injectGlobalStyles;

})(); // End of IIFE wrapper


