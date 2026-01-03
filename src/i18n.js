/**
 * i18n.js - 国际化工具模块
 * 封装 chrome.i18n.getMessage() 调用，提供统一的国际化接口
 */

/**
 * 获取本地化消息
 * @param {string} key - 消息键名
 * @param {string|string[]} [substitutions] - 替换占位符的值
 * @returns {string} 本地化后的消息，若未找到则返回键名
 */
export function t(key, substitutions) {
    const message = chrome.i18n.getMessage(key, substitutions);
    return message || key;
}

/**
 * 初始化 HTML 页面中的国际化元素
 * 支持以下 data 属性：
 * - data-i18n: 替换元素的 textContent
 * - data-i18n-placeholder: 替换 input/textarea 的 placeholder
 * - data-i18n-title: 替换元素的 title 属性
 * - data-i18n-alt: 替换 img 的 alt 属性
 * - data-i18n-html: 替换元素的 innerHTML（谨慎使用）
 */
export function initI18n() {
    // 处理 textContent
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key) {
            el.textContent = t(key);
        }
    });

    // 处理 placeholder
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (key) {
            el.placeholder = t(key);
        }
    });

    // 处理 title
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (key) {
            el.title = t(key);
        }
    });

    // 处理 alt
    document.querySelectorAll('[data-i18n-alt]').forEach(el => {
        const key = el.getAttribute('data-i18n-alt');
        if (key) {
            el.alt = t(key);
        }
    });

    // 处理 innerHTML（谨慎使用，仅用于包含链接等复杂内容的元素）
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
        const key = el.getAttribute('data-i18n-html');
        if (key) {
            el.innerHTML = t(key);
        }
    });

    // 设置 html lang 属性
    const uiLang = chrome.i18n.getUILanguage();
    document.documentElement.lang = uiLang.startsWith('zh') ? 'zh-CN' : 'en';
}

/**
 * 获取当前 UI 语言
 * @returns {string} 当前语言代码，如 'zh-CN' 或 'en'
 */
export function getUILanguage() {
    return chrome.i18n.getUILanguage();
}

/**
 * 检查当前是否为中文环境
 * @returns {boolean}
 */
export function isChineseLocale() {
    return chrome.i18n.getUILanguage().startsWith('zh');
}
