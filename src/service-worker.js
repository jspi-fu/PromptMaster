import { getProviders } from './llm_providers.js';
import { getPrompts, onPromptsChanged, savePrompt } from './promptStorage.js';

// 提供商缓存，减少每个标签页的开销
// - 避免在每次标签页更新时获取/解析 llm_providers.json
// - 在 Service Worker 生命周期内将通配符模式预编译为 RegExp 一次
const ProvidersCache = (() => {
  /** @type {{ compiled: Array<{ originPattern: string, urlRegex: RegExp }> } | null} */
  let cache = null;
  /** @type {Promise<{ compiled: Array<{ originPattern: string, urlRegex: RegExp }> }> | null} */
  let loading = null;

  const wildcardToRegex = (originPattern) => {
    // 将 "*://example.com/*" 转换为安全的正则表达式
    const escaped = originPattern
      .replace(/[|\\{}()[\]^$+?.]/g, '\\$&') // 转义正则元字符（'*' 除外）
      .replace(/\*/g, '.*');
    return new RegExp(`^${escaped}`);
  };

  const loadCompiled = async () => {
    const { patternsArray } = await getProviders();
    const compiled = patternsArray.map(originPattern => ({
      originPattern,
      urlRegex: wildcardToRegex(originPattern)
    }));
    return { compiled };
  };

  const getCompiled = async () => {
    if (cache) return cache;
    if (loading) return loading;
    loading = (async () => {
      const next = await loadCompiled();
      cache = next;
      loading = null;
      return next;
    })();
    return loading;
  };

  const getAuthorizedCompiled = async () => {
    const { compiled } = await getCompiled();
    const { aiProvidersMap } = await chrome.storage.local.get('aiProvidersMap');
    if (!aiProvidersMap || typeof aiProvidersMap !== 'object') return compiled;

    const allowed = new Set();
    for (const info of Object.values(aiProvidersMap)) {
      if (info && info.hasPermission === 'Yes' && info.urlPattern) allowed.add(info.urlPattern);
    }
    if (allowed.size === 0) return compiled;
    return compiled.filter(item => allowed.has(item.originPattern));
  };

  const clear = () => { cache = null; loading = null; };

  return { getAuthorizedCompiled, clear };
})();

// 统一脚本注入函数，防止重复注入
// 注入前检查注入标记
async function injectScriptsIfNeeded(tabId, tabUrl) {
  // 跳过受限 URL 的注入
  if (!tabUrl || tabUrl.startsWith('chrome://') || tabUrl.startsWith('edge://') || tabUrl.startsWith('about:')) {
    return false;
  }

  try {
    // 通过检查标记判断脚本是否已注入
    const [{ result: isInjected }] = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => {
        // 检查所有标记以确保脚本已完全注入
        return (window.__promptManagerInjected === true ||
          window.__promptManagerContentInjected === true ||
          window.__promptManagerInputHandlerInjected === true);
      }
    });

    if (isInjected) {
      console.log(`Scripts already injected in tab ${tabId} (${tabUrl}), skipping...`);
      return false;
    }

    // 未注入时执行注入
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: [
        "inputBoxHandler.js",
        "content.styles.js",
        "content.shared.js",
        "marked.min.js",
        "content.js"
      ]
    });
    console.log(`Successfully injected scripts into tab ${tabId} (${tabUrl})`);
    return true;
  } catch (injectionError) {
    // 处理特定错误情况
    if (injectionError.message.includes('Cannot access') ||
      injectionError.message.includes('No matching window') ||
      injectionError.message.includes('tab was closed')) {
      // 忽略受限页面或已关闭标签页的错误
      return false;
    }
    // 记录其他注入错误
    console.error(`Failed to inject script into tab ${tabId} (${tabUrl}):`, injectionError);
    return false;
  }
}

chrome.runtime.onInstalled.addListener(function (details) {
  // Chrome/Edge 侧边栏能力检查（部分环境可能不支持）
  if (chrome.sidePanel && typeof chrome.sidePanel.setPanelBehavior === 'function') {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
  console.log('onInstalled', details);
  // 安装和更新时重建提供商映射（仅首次安装时打开 UI）
  const shouldRebuild = ['install', 'update'].includes(details.reason);
  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'permissions/permissions.html' });
  }
  if (shouldRebuild) {
    (async () => {
      try {
        const providersMap = await checkProviderPermissions();
        console.log('Providers Map:', providersMap);
        // 将提供商映射存储到本地存储
        await chrome.storage.local.set({ 'aiProvidersMap': providersMap });
        ProvidersCache.clear();
      } catch (error) {
        console.error('Error:', error);
      }
    })();
  }
});


chrome.permissions.onAdded.addListener(async (permissions) => {
  console.log('Permissions added:', permissions.origins);
  if (permissions.origins && permissions.origins.length > 0) {
    // 遍历新授权的源
    for (const origin of permissions.origins) {
      try {
        // 查找匹配新授权源的标签页
        const tabs = await chrome.tabs.query({ url: origin });
        console.log(`Found ${tabs.length} tabs matching ${origin}`);

        for (const tab of tabs) {
          // 使用统一注入函数防止重复注入
          await injectScriptsIfNeeded(tab.id, tab.url);
        }
      } catch (err) {
        console.error(`Failed to query tabs or inject script for origin ${origin}:`, err);
      }
    }
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // 标签页加载完成且有 URL 时注入脚本
  if (changeInfo.status === 'complete' && tab.url) {
    // 快速路径：仅在 http(s) 协议下尝试
    if (!tab.url.startsWith('http://') && !tab.url.startsWith('https://')) return;
    try {
      const compiled = await ProvidersCache.getAuthorizedCompiled();
      for (const { originPattern, urlRegex } of compiled) {
        if (!urlRegex.test(tab.url)) continue;
        const hasPermission = await chrome.permissions.contains({ origins: [originPattern] });
        if (!hasPermission) continue;

        console.log(`Attempting to inject scripts into updated tab ${tabId} (${tab.url}) matching ${originPattern}`);
        await injectScriptsIfNeeded(tabId, tab.url);
        break;
      }
    } catch (err) {
      // 避免记录 'chrome://extensions/' 等 URL 的错误
      if (tab.url && !tab.url.startsWith('chrome://')) {
        // 记录 getProviders 或权限检查过程中的错误
        console.error(`Error during tab update processing for ${tab.url}:`, err);
      }
    }
  }
});

async function checkProviderPermissions() {
  try {
    // 获取提供商列表（使用绝对扩展 URL 以确保可靠性）
    const response = await fetch(chrome.runtime.getURL('llm_providers.json'));
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const providersData = await response.json();

    // 规范化图标 URL。对于本地路径（如 "../icons/foo.png" 或 "icons/foo.png"），
    // 转换为绝对 chrome-extension:// URL，确保所有 UI 一致解析。
    const resolveIconUrl = (raw) => {
      if (!raw) return '';
      // 保留绝对/网络/data/chrome-extension URL 不变
      if (/^(https?:|data:|chrome-extension:)/.test(raw)) return raw;
      // 去除开头的 ./ 或 ../ 段，锚定到扩展根目录
      const normalized = raw.replace(/^(\.\.\/)+/, '').replace(/^\.\//, '');
      return chrome.runtime.getURL(normalized);
    };

    // 存储提供商权限状态和 URL 的对象
    const providersMap = {};

    // 遍历模式数组中的每个提供商对象
    for (const providerInfo of providersData.llm_providers) {
      const providerName = providerInfo.name;
      const urlPattern = providerInfo.pattern;
      const providerUrl = providerInfo.url;

      // 检查该提供商 URL 模式是否有对应权限
      const hasPermission = await chrome.permissions.contains({
        origins: [urlPattern]
      });

      // 将结果（权限状态和 URL）存储到 providersMap
      providersMap[providerName] = {
        hasPermission: hasPermission ? 'Yes' : 'No',
        urlPattern: urlPattern,
        url: providerUrl,
        iconUrl: resolveIconUrl(providerInfo.icon_url)
      };
    }

    return providersMap;
  } catch (error) {
    console.error('[PromptManager] Error checking permissions:', error);
    return {}; // 返回空对象以便调用方安全遍历
  }
}

// 辅助函数：通过统一管理器获取所有提示词（单一数据源）
async function getAllPrompts() {
  return await getPrompts();
}

// 创建右键菜单
async function createPromptContextMenu() {
  // 移除已有菜单以避免重复
  chrome.contextMenus.removeAll(() => {
    // 创建父级菜单
    chrome.contextMenus.create({
      id: 'open-prompt-manager',
      title: chrome.i18n.getMessage('openPromptMaster'),
      contexts: ['all']
    });
    // "保存为提示词"子菜单——仅在有文本选中时显示
    chrome.contextMenus.create({
      id: 'save-as-prompt',
      parentId: 'open-prompt-manager',
      title: chrome.i18n.getMessage('saveAsNewPrompt'),
      contexts: ['selection']
    });
    // "保存为提示词"与提示词列表之间的视觉分隔符
    // 仅在有选中文本时显示，与保存项的可见性保持一致
    chrome.contextMenus.create({
      id: 'save-separator',
      parentId: 'open-prompt-manager',
      type: 'separator',
      contexts: ['selection']
    });
    // 为每个提示词添加菜单项
    getAllPrompts().then(prompts => {
      prompts.forEach((prompt, idx) => {
        chrome.contextMenus.create({
          id: 'prompt-' + idx,
          parentId: 'open-prompt-manager',
          title: prompt.title || chrome.i18n.getMessage('promptNumber', [(idx + 1).toString()]),
          contexts: ['all']
        });
      });
    });
  });
}

// 安装或更新时创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
  createPromptContextMenu();
});

// 启动时也创建右键菜单（用于重新加载场景）
chrome.runtime.onStartup.addListener(() => {
  createPromptContextMenu();
  // 启动时刷新提供商映射，使图标变更和新增提供商无需重新安装即可生效
  (async () => {
    try {
      const providersMap = await checkProviderPermissions();
      await chrome.storage.local.set({ 'aiProvidersMap': providersMap });
    } catch (e) {
      console.error('Failed to refresh aiProvidersMap on startup:', e);
    }
  })();
});

// 监听提示词变化，通过统一 API 更新右键菜单
onPromptsChanged(() => {
  // 提示词变化时重新生成右键菜单
  createPromptContextMenu();
});

// 右键菜单项点击处理
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  // 处理"保存为提示词"：打开预填选中文本的小弹窗对话框
  if (info.menuItemId === 'save-as-prompt') {
    // 使用页面上下文中 Chrome 内置对话框：
    // - prompt() 用于获取标题
    // - alert() 用于标题为空时显示验证错误
    try {
      const selected = info.selectionText || '';
      // 使用页面内置的阻塞式 prompt 获取标题
      const [{ result: titleValue }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (msg) => {
          return window.prompt(msg, '');
        },
        args: [chrome.i18n.getMessage('enterPromptTitle')]
      });
      const title = (titleValue || '').trim();
      if (!title) {
        // 标题为空时显示错误提示
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (msg) => { window.alert(msg); },
          args: [chrome.i18n.getMessage('addTitleFirst')]
        });
        return;
      }
      // 使用统一存储 API 保存提示词
      await savePrompt({ title, content: selected });
      // 可选：发送轻量级通知
      chrome.notifications?.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: chrome.i18n.getMessage('promptSaved'),
        message: chrome.i18n.getMessage('savedTitle', [title])
      });
    } catch (err) {
      console.error('Failed to save prompt from selection:', err);
    }
    return;
  }
  if (info.menuItemId.startsWith('prompt-')) {
    // 提取提示词索引
    const idx = parseInt(info.menuItemId.replace('prompt-', ''), 10);
    const prompts = await getAllPrompts();
    if (prompts[idx]) {
      // 将提示词内容写入剪贴板
      try {
        await navigator.clipboard.writeText(prompts[idx].content);
        // 可选：显示通知
        chrome.notifications?.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: chrome.i18n.getMessage('promptCopied'),
          message: chrome.i18n.getMessage('copiedTitle', [prompts[idx].title])
        });
      } catch (err) {
        // 降级方案：剪贴板 API 失败时尝试通过标签页 API 复制
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (text) => navigator.clipboard.writeText(text),
          args: [prompts[idx].content]
        });
      }
    }
  }
});
