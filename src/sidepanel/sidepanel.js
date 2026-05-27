// sidepanel.js

// 使用统一的提示词存储进行所有提示词操作
import * as PromptStorage from '../promptStorage.js';
import { exportPrompts, importPrompts } from '../promptStorage.js';
import { initI18n, t } from '../i18n.js';
import { buildSearchPreviewHtml, computeMatchScore } from '../utils.js';

// 跟踪强制暗黑模式状态，与浮动模式同步
let isDarkModeForced = false;

// 根据强制设置或系统偏好为文档应用暗黑模式类
function applyTheme() {
  const shouldBeDark = isDarkModeForced || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('force-dark', shouldBeDark);
}

// 从存储中加载暗黑模式偏好
async function loadThemePreference() {
  try {
    const result = await chrome.storage.local.get(['forceDarkMode']);
    isDarkModeForced = result.forceDarkMode === true;
    applyTheme();
  } catch (err) {
    console.warn('[PromptManager] Failed to load theme preference:', err);
  }
}

// 检查是否有已授权的提供商权限
async function hasAnyGrantedProviderPermission() {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get(['aiProvidersMap'], result => {
        if (!result || !result.aiProvidersMap) {
          resolve(false);
          return;
        }
        const providersMap = result.aiProvidersMap;
        const anyGranted = Object.values(providersMap).some(p => p && p.hasPermission === 'Yes');
        resolve(anyGranted);
      });
    } catch (err) {
      resolve(false);
    }
  });
}

// 跟踪"可用"分组的折叠状态（默认折叠）
let llmsAvailableCollapsed = true;
// 跟踪提示词管理的折叠状态（默认折叠）
let pmCollapsed = true;

// 平滑展开/折叠可折叠元素，不自动滚动视图
function setCollapsibleOpen(collapsibleEl, open) {
  if (!collapsibleEl) return;
  const scrollEl = document.scrollingElement || document.documentElement || document.body;
  const prevScrollTop = scrollEl.scrollTop;
  const targetHeight = collapsibleEl.scrollHeight;
  if (open) {
    // 确保过渡从 0 开始
    collapsibleEl.classList.add('open');
    collapsibleEl.style.maxHeight = '0px';
    // 强制重排后展开到内容高度
    // eslint-disable-next-line no-unused-expressions
    collapsibleEl.offsetHeight;
    collapsibleEl.style.maxHeight = `${targetHeight}px`;
  } else {
    // 从当前高度折叠到 0
    const currentMax = getComputedStyle(collapsibleEl).maxHeight;
    if (currentMax === 'none') {
      collapsibleEl.style.maxHeight = `${targetHeight}px`;
      // eslint-disable-next-line no-unused-expressions
      collapsibleEl.offsetHeight;
    }
    collapsibleEl.style.maxHeight = '0px';
    collapsibleEl.classList.remove('open');
  }
  // 恢复滚动位置，避免视图自动跳动
  queueMicrotask(() => {
    try {
      scrollEl.scrollTop = prevScrollTop;
    } catch (e) {
      window.scrollTo({ top: prevScrollTop, behavior: 'auto' });
    }
  });
  // 过渡结束后将 maxHeight 设为 none，以适应动态内容
  const onEnd = (e) => {
    if (e.propertyName !== 'max-height') return;
    collapsibleEl.removeEventListener('transitionend', onEnd);
    if (collapsibleEl.classList.contains('open')) {
      collapsibleEl.style.maxHeight = 'none';
    }
  };
  collapsibleEl.addEventListener('transitionend', onEnd);
}

// 从存储构建提供商映射，或回退读取 llm_providers.json 并检查权限
async function getProvidersMapOrFallback() {
  // 优先从 storage 读取（由 service worker 维护）
  const stored = await new Promise(resolve => {
    chrome.storage.local.get(['aiProvidersMap'], resolve);
  });
  if (stored?.aiProvidersMap && Object.keys(stored.aiProvidersMap).length > 0) {
    return stored.aiProvidersMap;
  }
  // 回退：从 llm_providers.json 计算
  try {
    const response = await fetch(chrome.runtime.getURL('llm_providers.json'));
    const data = await response.json();
    const list = Array.isArray(data?.llm_providers) ? data.llm_providers : [];
    const computedEntries = await Promise.all(list.map(async (p) => {
      let permitted = false;
      try {
        permitted = await chrome.permissions.contains({ origins: [p.pattern] });
      } catch (_) {}
      return [p.name, {
        hasPermission: permitted ? 'Yes' : 'No',
        urlPattern: p.pattern,
        url: p.url,
        iconUrl: p.icon_url
      }];
    }));
    return Object.fromEntries(computedEntries);
  } catch (_) {
    return {};
  }
}

// 渲染 LLM 区域，包含"已激活"和"可用"标签，反映存储状态和权限状态
async function renderLLMsSection() {
  const section = document.getElementById('llms-section');
  const activeWrap = document.getElementById('llms-activated');
  const availableWrap = document.getElementById('llms-available');
  const availableToggle = document.getElementById('llms-available-toggle');
  // 分组容器，用于条件显示逻辑
  const shortcutsGroup = activeWrap ? activeWrap.closest('.llms-group') : null;
  const availableGroup = availableWrap ? availableWrap.closest('.llms-group') : null;
  if (!section || !activeWrap || !availableWrap) return;

  // 清空已有内容
  activeWrap.innerHTML = '';
  availableWrap.innerHTML = '';

  const providersMap = await getProvidersMapOrFallback();
  if (!providersMap || Object.keys(providersMap).length === 0) {
    // 无数据可展示
    return;
  }

  // 分为已激活和可选两组
  const entries = Object.entries(providersMap);
  const active = entries.filter(([, v]) => v && v.hasPermission === 'Yes');
  const inactive = entries.filter(([, v]) => !v || v.hasPermission !== 'Yes');

  // 创建仅图标的锚点元素
  const createPill = ({ name, iconUrl, url, urlPattern, active }) => {
    const a = document.createElement('a');
    a.className = `llm-pill icon-only ${active ? 'active' : 'inactive'}`;
    a.setAttribute('data-provider', name);
    a.setAttribute('data-url-pattern', urlPattern || '');
    a.setAttribute('title', active ? t('openProvider', name) : t('activateProvider', name));
    // 已激活的图标点击后打开对应平台页面
    if (active && url) {
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
    } else {
      a.href = '#';
    }

    // 图标
    const img = document.createElement('img');
    img.src = iconUrl || '';
    img.alt = `${name} icon`;
    img.width = 20;
    img.height = 20;
    img.className = 'llm-pill-icon';
    a.appendChild(img);

    if (!active) {
      // 点击未激活标签时请求权限
      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        const pattern = a.getAttribute('data-url-pattern');
        if (!pattern) return;
        chrome.permissions.request({ origins: [pattern] }, (granted) => {
          if (granted) {
            // 更新存储映射以保持 UI 与权限页面同步
            // 读取、修改、写入 aiProvidersMap
            chrome.storage.local.get(['aiProvidersMap'], (res) => {
              const map = res && res.aiProvidersMap ? res.aiProvidersMap : providersMap;
              if (!map[name]) {
                map[name] = { hasPermission: 'Yes', urlPattern: pattern, url, iconUrl };
              } else {
                map[name].hasPermission = 'Yes';
                map[name].urlPattern = pattern || map[name].urlPattern;
                map[name].url = url || map[name].url;
                map[name].iconUrl = iconUrl || map[name].iconUrl;
              }
              chrome.storage.local.set({ aiProvidersMap: map });
            });
          }
        });
      });
    }

    return a;
  };

  // 渲染已激活项
  active
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([name, info]) => {
      activeWrap.appendChild(createPill({
        name,
        iconUrl: info.iconUrl,
        url: info.url,
        urlPattern: info.urlPattern,
        active: true
      }));
    });

  // 渲染未激活项
  inactive
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([name, info]) => {
      availableWrap.appendChild(createPill({
        name,
        iconUrl: info?.iconUrl,
        url: info?.url,
        urlPattern: info?.urlPattern,
        active: false
      }));
    });

  // 应用折叠状态到"可用"分组；默认折叠
  // 特殊规则：如果快捷方式为空则隐藏并强制展开可用列表
  const hasActive = active.length > 0;
  if (!hasActive) {
    if (shortcutsGroup) shortcutsGroup.style.display = 'none';
    if (availableGroup) availableGroup.style.display = '';
    llmsAvailableCollapsed = false;
    setCollapsibleOpen(availableWrap, true);
    if (availableToggle) availableToggle.setAttribute('aria-expanded', 'true');
  } else {
    if (shortcutsGroup) shortcutsGroup.style.display = '';
    setCollapsibleOpen(availableWrap, !llmsAvailableCollapsed);
    if (availableToggle) {
      availableToggle.setAttribute('aria-expanded', llmsAvailableCollapsed ? 'false' : 'true');
    }
  }
}

// 根据已授权权限切换权限快捷方式和提示词列表之间的显示
async function renderPermissionsGate() {
  const shortcut = document.getElementById('permissions-shortcut');
  const promptList = document.getElementById('prompt-list');
  const emptyState = document.getElementById('empty-state');
  if (!shortcut || !promptList) return;
  const allowed = await hasAnyGrantedProviderPermission();
  if (allowed) {
    // 隐藏快捷方式，正常显示列表
    shortcut.style.display = 'none';
    promptList.style.display = 'block';
    if (emptyState && promptList.children.length === 0) {
      emptyState.style.display = 'block';
    }
  } else {
    // 显示快捷方式，隐藏列表和空状态
    shortcut.style.display = 'block';
    promptList.style.display = 'none';
    if (emptyState) emptyState.style.display = 'none';
  }
}

// 创建搜索匹配预览元素，展示匹配的片段并高亮关键词
// 核心逻辑复用 utils.js 的 buildSearchPreviewHtml
function createSearchMatchPreview(searchTerm, prompt) {
  const normalizedTerm = (searchTerm || '').trim().toLowerCase();
  if (!normalizedTerm) return null;

  const title = String(prompt?.title || '').toLowerCase();
  const content = String(prompt?.content || '');
  const tags = Array.isArray(prompt?.tags) ? prompt.tags.join(', ') : '';

  const html = buildSearchPreviewHtml(normalizedTerm, title, content, tags);
  if (!html) return null;

  const preview = document.createElement('div');
  preview.className = 'search-match-preview';
  preview.innerHTML = html;
  return preview;
}

// 侧边栏的悬停预览面板管理
let _previewTimer = null;
let _previewPanel = null;
let _previewSourceItem = null;
let _previewHideTimer = null;

function showPreviewPanel(li, content) {
  hidePreviewPanel();
  if (!content) return;

  _previewSourceItem = li;
  _previewTimer = setTimeout(() => {
    const isDark = document.documentElement.classList.contains('force-dark');
    const panel = document.createElement('div');
    panel.className = `preview-panel ${isDark ? 'dark' : 'light'}`;
    panel.textContent = content;
    panel.style.whiteSpace = 'pre-wrap';

    document.body.appendChild(panel);
    _previewPanel = panel;

    // 固定尺寸，位于列表左侧并留有间距
    const panelW = 350;
    const panelH = window.innerHeight - 16;
    const gap = 14;
    panel.style.width = panelW + 'px';
    panel.style.height = panelH + 'px';
    panel.style.top = '8px';

    const listEl = document.getElementById('prompt-list');
    const listRect = listEl ? listEl.getBoundingClientRect() : null;
    const refLeft = listRect ? listRect.left : li.getBoundingClientRect().left;

    if (refLeft >= panelW + gap + 4) {
      panel.style.left = (refLeft - panelW - gap) + 'px';
    } else {
      const refRight = listRect ? listRect.right : li.getBoundingClientRect().right;
      panel.style.left = (refRight + gap) + 'px';
    }

    panel.addEventListener('mouseenter', () => {
      if (_previewHideTimer) {
        clearTimeout(_previewHideTimer);
        _previewHideTimer = null;
      }
    });
    panel.addEventListener('mouseleave', () => {
      delayedHidePreviewPanel();
    });

    panel.addEventListener('click', (e) => {
      e.stopPropagation();
      hidePreviewPanel();
    });
  }, 500);
}

function delayedHidePreviewPanel() {
  if (_previewHideTimer) clearTimeout(_previewHideTimer);
  _previewHideTimer = setTimeout(() => {
    _previewHideTimer = null;
    removePreviewPanel();
  }, 100);
}

function removePreviewPanel() {
  if (_previewTimer) {
    clearTimeout(_previewTimer);
    _previewTimer = null;
  }
  if (_previewPanel) {
    _previewPanel.remove();
    _previewPanel = null;
  }
  _previewSourceItem = null;
}

function hidePreviewPanel() {
  if (_previewHideTimer) {
    clearTimeout(_previewHideTimer);
    _previewHideTimer = null;
  }
  removePreviewPanel();
}

function onPreviewSourceItemEnter() {
  if (_previewHideTimer) {
    clearTimeout(_previewHideTimer);
    _previewHideTimer = null;
  }
}

// 创建单个提示词列表项
function createPromptItem(prompt, index, searchTerm) {
  const li = document.createElement('li');
  // 标题+预览的纵向容器
  const textWrap = document.createElement('div');
  textWrap.style.flex = '1';
  textWrap.style.minWidth = '0';
  const titleSpan = document.createElement('span');
  titleSpan.textContent = prompt.title;
  titleSpan.style.margin = '2px';
  titleSpan.style.padding = '3px';
  titleSpan.style.verticalAlign = 'middle';
  titleSpan.style.display = 'inline-block';
  textWrap.appendChild(titleSpan);

  // 搜索模式下显示匹配内容预览
  const preview = createSearchMatchPreview(searchTerm, prompt);
  if (preview) {
    textWrap.appendChild(preview);
  }
  li.appendChild(textWrap);

  // 复制按钮（悬停时显示）
  const copyBtn = document.createElement('button');
  const copyImg = document.createElement('img');
  copyImg.src = '../icons/copy.png';
  copyImg.alt = 'Copy';
  copyImg.title = t('copyToClipboard');
  copyImg.width = 14;
  copyImg.height = 14;
  copyImg.style.verticalAlign = 'middle';
  copyBtn.style.display = 'none';
  copyBtn.style.backgroundColor = '#ffffff00';
  copyBtn.appendChild(copyImg);
  copyBtn.addEventListener('click', async () => {
    await navigator.clipboard.writeText(prompt.content);
  });
  li.appendChild(copyBtn);

  // 编辑按钮（悬停时显示）
  const editBtn = document.createElement('button');
  const editImg = document.createElement('img');
  editImg.src = '../icons/edit-icon.png';
  editImg.alt = 'Edit';
  editImg.title = t('edit');
  editImg.width = 14;
  editImg.height = 14;
  editImg.style.verticalAlign = 'middle';
  editBtn.style.display = 'none';
  editBtn.style.backgroundColor = '#ffffff00';
  editBtn.appendChild(editImg);
  editBtn.addEventListener('click', () => {
    hidePreviewPanel();
    // 填充编辑表单
    document.getElementById('prompt-title').value = prompt.title;
    document.getElementById('prompt-content').value = prompt.content;
    document.getElementById('prompt-index').value = index;

    // 加载标签
    currentTags = prompt.tags ? [...prompt.tags] : [];
    renderTags();

    document.getElementById('submit-button').innerHTML = `<img src="../icons/add-icon.png" alt="${t('add')}" style="margin-right: 5px" /><span>${t('updatePrompt')}</span>`;
    document.getElementById('cancel-edit-button').style.display = 'inline';
  });
  li.appendChild(editBtn);

  // 删除按钮（悬停时显示）
  const delBtn = document.createElement('button');
  const delImg = document.createElement('img');
  delImg.src = '../icons/delete.svg';
  delImg.alt = 'Delete';
  delImg.title = t('delete');
  delImg.width = 18;
  delImg.height = 18;
  delImg.style.verticalAlign = 'middle';
  delBtn.style.display = 'none';
  delBtn.style.backgroundColor = '#ffffff00';
  delBtn.appendChild(delImg);
  delBtn.addEventListener('click', async () => {
    if (!window.confirm(t('confirmDelete'))) return;
    const current = await PromptStorage.getPrompts();
    if (index < 0 || index >= current.length) return;
    await PromptStorage.deletePrompt(current[index].uuid);
  });
  li.appendChild(delBtn);

  // 操作按钮和预览的悬停交互
  li.addEventListener('mouseenter', () => {
    copyBtn.style.display = 'inline-block';
    editBtn.style.display = 'inline-block';
    delBtn.style.display = 'inline-block';
    onPreviewSourceItemEnter();
    showPreviewPanel(li, prompt.content);
  });
  li.addEventListener('mouseleave', () => {
    copyBtn.style.display = 'none';
    editBtn.style.display = 'none';
    delBtn.style.display = 'none';
    delayedHidePreviewPanel();
  });

  return li;
}

// 使用 lucide 图标库创建 SVG 图标
function createLucideIcon(name, size = 16) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.style.flexShrink = '0';

  const paths = {
    folder: [
      { d: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z' }
    ],
    'arrow-left': [
      { d: 'm12 19-7-7 7-7' },
      { d: 'M19 12H5' }
    ],
    'chevron-right': [
      { d: 'm9 18 6-6-6-6' }
    ]
  };

  const iconPaths = paths[name] || [];
  iconPaths.forEach(p => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', p.d);
    svg.appendChild(path);
  });

  return svg;
}

// 当前浏览的标签路径（空数组表示根目录）
let currentTagPath = [];
// 当前侧边栏搜索词
let currentSearchTerm = '';
// 缓存最新提示词，便于搜索时直接重绘
let latestPrompts = [];

// 模块级标签状态，提升至此以便 createPromptItem 内的编辑按钮可访问
let currentTags = [];

// 渲染已添加的标签 pill，操作 DOM 中的 tags-display 容器
function renderTags() {
  const tagsDisplay = document.getElementById('tags-display');
  if (!tagsDisplay) return;
  tagsDisplay.innerHTML = '';
  currentTags.forEach((tag, index) => {
    const tagPill = document.createElement('span');
    tagPill.className = 'tag-pill';

    const tagText = document.createElement('span');
    tagText.textContent = tag;
    tagPill.appendChild(tagText);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'tag-remove';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      currentTags.splice(index, 1);
      renderTags();
    });
    tagPill.appendChild(removeBtn);

    tagsDisplay.appendChild(tagPill);
  });
}

// 创建”无搜索结果”提示项
function createNoResultsItem() {
  const li = document.createElement('li');
  li.style.justifyContent = 'flex-start';
  li.style.backgroundColor = 'transparent';
  li.style.padding = '6px 0';
  li.style.borderRadius = '0';
  li.style.color = 'var(--light-text-secondary, #64748b)';
  li.style.fontSize = '13px';
  li.textContent = t('noSearchResults');
  return li;
}

// 关键词检索同时匹配标题、内容和标签
function matchesPromptSearch(prompt, searchTerm) {
  const normalizedTerm = (searchTerm || '').trim().toLowerCase();
  if (!normalizedTerm) return true;

  const title = String(prompt?.title || '').toLowerCase();
  const content = String(prompt?.content || '').toLowerCase();
  const tags = Array.isArray(prompt?.tags)
    ? prompt.tags.map(tag => String(tag).toLowerCase()).join(' ')
    : '';

  return title.includes(normalizedTerm)
    || content.includes(normalizedTerm)
    || tags.includes(normalizedTerm);
}

// 在侧边栏 UI 中渲染提示词列表
function displayPrompts(prompts) {
  const promptList = document.getElementById('prompt-list');
  const emptyState = document.getElementById('empty-state');
  const shortcut = document.getElementById('permissions-shortcut');
  const visiblePrompts = Array.isArray(prompts)
    ? prompts.filter(prompt => matchesPromptSearch(prompt, currentSearchTerm))
    : [];
  promptList.innerHTML = '';
  if (!Array.isArray(prompts) || prompts.length === 0) {
    const shortcutVisible = shortcut && shortcut.style.display !== 'none';
    if (emptyState) emptyState.style.display = shortcutVisible ? 'none' : 'block';
    return;
  }
  if (emptyState) emptyState.style.display = 'none';

  if (currentSearchTerm.trim()) {
    if (visiblePrompts.length === 0) {
      promptList.appendChild(createNoResultsItem());
      return;
    }
    const term = currentSearchTerm.trim().toLowerCase();
    visiblePrompts.sort((a, b) => {
      const scoreA = computeMatchScore(term, (a.title || '').toLowerCase(), (Array.isArray(a.tags) ? a.tags.map(t => String(t).toLowerCase()).join(' ') : ''), (a.content || '').toLowerCase());
      const scoreB = computeMatchScore(term, (b.title || '').toLowerCase(), (Array.isArray(b.tags) ? b.tags.map(t => String(t).toLowerCase()).join(' ') : ''), (b.content || '').toLowerCase());
      return scoreB - scoreA;
    });
    visiblePrompts.forEach(prompt => {
      const index = prompts.findIndex(item => item?.uuid === prompt?.uuid);
      if (index !== -1) {
        promptList.appendChild(createPromptItem(prompt, index, currentSearchTerm));
      }
    });
    return;
  }

  // 按标签分组
  const tagged = new Map();
  const untagged = [];

  prompts.forEach((prompt, index) => {
    const tags = prompt.tags;
    if (Array.isArray(tags) && tags.length > 0) {
      tags.forEach(tag => {
        if (!tagged.has(tag)) {
          tagged.set(tag, []);
        }
        tagged.get(tag).push({ prompt, index });
      });
    } else {
      untagged.push({ prompt, index });
    }
  });

  // 如果当前在标签文件夹内部
  if (currentTagPath.length > 0) {
    const currentTag = currentTagPath[currentTagPath.length - 1];

    // 返回上一级按钮
    const backItem = document.createElement('li');
    backItem.className = 'tag-back-item';
    backItem.style.cursor = 'pointer';
    backItem.style.backgroundColor = 'transparent';
    backItem.style.padding = '6px 0';
    backItem.style.marginBottom = '4px';
    backItem.style.borderRadius = '0';
    backItem.style.color = 'var(--primary)';
    backItem.style.fontWeight = '500';
    backItem.style.fontSize = '13px';
    backItem.style.display = 'flex';
    backItem.style.alignItems = 'center';
    backItem.style.gap = '6px';

    const backIcon = createLucideIcon('arrow-left', 16);
    backItem.appendChild(backIcon);

    const backLabel = document.createElement('span');
    backLabel.textContent = t('back') || '返回';
    backLabel.style.flexGrow = '1';
    backItem.appendChild(backLabel);

    backItem.addEventListener('click', () => {
      currentTagPath.pop();
      displayPrompts(prompts);
    });

    promptList.appendChild(backItem);

    // 显示当前标签名称
    const tagTitle = document.createElement('li');
    tagTitle.style.backgroundColor = 'transparent';
    tagTitle.style.padding = '2px 0 6px';
    tagTitle.style.borderRadius = '0';
    tagTitle.style.color = 'var(--primary)';
    tagTitle.style.fontWeight = '600';
    tagTitle.style.fontSize = '14px';
    tagTitle.style.display = 'flex';
    tagTitle.style.alignItems = 'center';
    tagTitle.style.gap = '6px';

    const folderIcon = createLucideIcon('folder', 18);
    tagTitle.appendChild(folderIcon);

    const tagName = document.createElement('span');
    tagName.textContent = currentTag;
    tagTitle.appendChild(tagName);

    promptList.appendChild(tagTitle);

    // 渲染该标签下的提示词
    const items = tagged.get(currentTag) || [];
    items.forEach(({ prompt, index }) => {
      promptList.appendChild(createPromptItem(prompt, index));
    });

    return;
  }

  // 根目录：先渲染无标签的提示词
  untagged.forEach(({ prompt, index }) => {
    promptList.appendChild(createPromptItem(prompt, index));
  });

  // 再渲染标签文件夹
  const sortedTags = Array.from(tagged.keys()).sort((a, b) => a.localeCompare(b));
  sortedTags.forEach(tag => {
    const tagFolder = document.createElement('li');
    tagFolder.className = 'tag-folder-item';
    tagFolder.style.cursor = 'pointer';
    tagFolder.style.backgroundColor = 'transparent';
    tagFolder.style.padding = '6px 0';
    tagFolder.style.marginTop = '4px';
    tagFolder.style.borderRadius = '0';
    tagFolder.style.color = 'var(--primary)';
    tagFolder.style.fontWeight = '600';
    tagFolder.style.fontSize = '13px';
    tagFolder.style.display = 'flex';
    tagFolder.style.alignItems = 'center';
    tagFolder.style.gap = '6px';

    const folderIcon = createLucideIcon('folder', 16);
    tagFolder.appendChild(folderIcon);

    const tagLabel = document.createElement('span');
    tagLabel.textContent = tag;
    tagLabel.style.flexGrow = '1';
    tagLabel.style.textAlign = 'left';
    tagFolder.appendChild(tagLabel);

    const arrowIcon = createLucideIcon('chevron-right', 16);
    arrowIcon.style.opacity = '0.6';
    tagFolder.appendChild(arrowIcon);

    tagFolder.addEventListener('click', () => {
      currentTagPath.push(tag);
      displayPrompts(prompts);
    });

    promptList.appendChild(tagFolder);
  });
}

// 从存储加载提示词并渲染
async function loadPrompts() {
  latestPrompts = await PromptStorage.getPrompts();
  displayPrompts(latestPrompts);
}

document.addEventListener('DOMContentLoaded', () => {
  // 初始化静态元素的国际化
  initI18n();

  const form = document.getElementById('prompt-form');
  const titleInput = document.getElementById('prompt-title');
  const contentInput = document.getElementById('prompt-content');
  const promptIndexInput = document.getElementById('prompt-index');
  const submitButton = document.getElementById('submit-button');
  const cancelEditButton = document.getElementById('cancel-edit-button');
  const exportBtn = document.getElementById('export-btn');
  const importBtn = document.getElementById('import-btn');
  const importFile = document.getElementById('import-file');
  const promptSearchInput = document.getElementById('prompt-search');
  // 信息横幅的关闭/隐藏相关元素
  const infoBanner = document.getElementById('info-banner');
  const infoBannerClose = document.getElementById('info-banner-close');
  
  // 标签相关 DOM 引用（currentTags 与 renderTags 已提升至模块级）
  const tagsContainer = document.getElementById('tags-container');
  const tagInput = document.getElementById('tag-input');

  // 添加标签（去重、去空白）
  function addTag(tagName) {
    const trimmedTag = tagName.trim();
    if (trimmedTag && !currentTags.includes(trimmedTag)) {
      currentTags.push(trimmedTag);
      renderTags();
    }
  }

  // 清空所有标签
  function clearTags() {
    currentTags = [];
    renderTags();
  }

  // 标签输入事件监听
  if (tagInput) {
    tagInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addTag(tagInput.value);
        tagInput.value = '';
      } else if (e.key === 'Backspace' && tagInput.value === '') {
        e.preventDefault();
        if (currentTags.length > 0) {
          currentTags.pop();
          renderTags();
        }
      }
    });

    tagInput.addEventListener('blur', () => {
      if (tagInput.value) {
        addTag(tagInput.value);
        tagInput.value = '';
      }
    });

    // 点击标签容器聚焦输入框
    tagsContainer.addEventListener('click', (e) => {
      if (e.target !== tagInput && !e.target.classList.contains('tag-remove')) {
        tagInput.focus();
      }
    });
  }

  if (promptSearchInput) {
    promptSearchInput.addEventListener('input', (event) => {
      currentSearchTerm = event.target.value || '';
      displayPrompts(latestPrompts);
    });
  }

  // 加载提示词并显示
  loadPrompts();
  // 加载时评估权限门控
  renderPermissionsGate();
  // 加载时渲染 LLM 区域
  renderLLMsSection();
  // 加载并应用主题偏好
  loadThemePreference();

  // 绑定"可用"子标题的折叠/展开切换
  const availableToggle = document.getElementById('llms-available-toggle');
  const availableWrap = document.getElementById('llms-available');
  if (availableToggle && availableWrap) {
    const toggle = (ev) => {
      if (ev && ev.type === 'keydown') {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        ev.preventDefault();
      }
      llmsAvailableCollapsed = !llmsAvailableCollapsed;
      setCollapsibleOpen(availableWrap, !llmsAvailableCollapsed);
      availableToggle.setAttribute('aria-expanded', llmsAvailableCollapsed ? 'false' : 'true');
    };
    availableToggle.addEventListener('click', toggle);
    availableToggle.addEventListener('keydown', toggle);
    // 确保默认折叠状态在 DOM 中正确反映
    setCollapsibleOpen(availableWrap, false);
    availableToggle.setAttribute('aria-expanded', 'false');
  }

  // 绑定提示词管理的折叠/展开切换，默认折叠
  const pmToggle = document.getElementById('pm-toggle');
  const pmControls = document.getElementById('pm-controls');
  if (pmToggle && pmControls) {
    const togglePM = (ev) => {
      if (ev && ev.type === 'keydown') {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        ev.preventDefault();
      }
      pmCollapsed = !pmCollapsed;
      setCollapsibleOpen(pmControls, !pmCollapsed);
      pmToggle.setAttribute('aria-expanded', pmCollapsed ? 'false' : 'true');
    };
    pmToggle.addEventListener('click', togglePM);
    pmToggle.addEventListener('keydown', togglePM);
    // 确保默认折叠状态在 DOM 中正确反映
    setCollapsibleOpen(pmControls, false);
    pmToggle.setAttribute('aria-expanded', 'false');
  }

  // 存储中提示词变化时刷新 UI
  PromptStorage.onPromptsChanged(loadPrompts);

  // 实时响应权限更新（权限页面写入 aiProvidersMap）
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.aiProvidersMap) {
        renderPermissionsGate();
        // 同时刷新 LLM 区域以反映新的激活状态
        renderLLMsSection();
      }
      // 响应浮动模式的主题变更
      if (area === 'local' && changes.forceDarkMode) {
        isDarkModeForced = changes.forceDarkMode.newValue === true;
        applyTheme();
      }
    });
  } catch (err) {
    // 忽略不可用的情况
  }

  // 根据存储开关决定是否显示信息横幅
  // 默认隐藏，除非 `spm_show_info_banner` 为 true 且用户未关闭过
  if (infoBanner) {
    infoBanner.style.display = 'none'; // 默认隐藏
  }
  try {
    chrome.storage?.local?.get(['spm_show_info_banner'], (res) => {
      const shouldShow = res && res.spm_show_info_banner === true;
      // 尊重 localStorage 中的先前关闭记录
      const dismissed = (() => {
        try { return localStorage.getItem('spm_info_banner_dismissed') === 'true'; } catch (e) { return false; }
      })();
      if (shouldShow && !dismissed && infoBanner) {
        infoBanner.style.display = '';
      }
    });
  } catch (err) {
    // 存储读取失败时保持横幅隐藏，除非已在标记中可见
    try {
      const dismissed = localStorage.getItem('spm_info_banner_dismissed') === 'true';
      if (dismissed && infoBanner) infoBanner.style.display = 'none';
    } catch (e) { }
  }

  // 关闭横幅并持久化选择
  if (infoBannerClose) {
    infoBannerClose.addEventListener('click', () => {
      if (infoBanner) infoBanner.style.display = 'none';
      try {
        localStorage.setItem('spm_info_banner_dismissed', 'true');
        // 关闭存储开关以防止再次显示
        // 直到显式将 `spm_show_info_banner` 设为 true 重新启用
        chrome.storage?.local?.set({ spm_show_info_banner: false });
      } catch (err) {
        // 忽略存储错误
      }
    });
  }

  // 添加或更新提示词
  form.addEventListener('submit', event => {
    event.preventDefault();
    const title = titleInput.value.trim();
    const content = contentInput.value;
    const tags = [...currentTags];

    if (promptIndexInput.value === '') {
      // 通过统一管理器添加新提示词
      PromptStorage.savePrompt({ title, content, tags }).catch(console.error);
    } else {
      // 通过统一管理器将索引映射为 uuid 来更新已有提示词
      const index = parseInt(promptIndexInput.value, 10);
      PromptStorage.getPrompts().then(prompts => {
        if (index >= 0 && index < prompts.length) {
          const uuid = prompts[index].uuid;
          return PromptStorage.updatePrompt(uuid, { title, content, tags });
        }
      }).catch(console.error);
    }

    // 重置表单
    titleInput.value = '';
    contentInput.value = '';
    promptIndexInput.value = '';
    clearTags();
    submitButton.innerHTML = `<img src="../icons/add-icon.png" alt="${t('add')}" style="margin-right: 5px" /><span>${t('savePrompt')}</span>`;
    cancelEditButton.style.display = 'none';
  });

  // 取消编辑
  cancelEditButton.addEventListener('click', () => {
    // 重置表单
    titleInput.value = '';
    contentInput.value = '';
    promptIndexInput.value = '';
    clearTags();
    submitButton.innerHTML = `<img src="../icons/add-icon.png" alt="${t('add')}" style="margin-right: 5px" /><span>${t('addPrompt')}</span>`;
    cancelEditButton.style.display = 'none';
  });

  // 导出提示词
  exportBtn.addEventListener('click', exportPrompts);

  // 导入提示词
  importBtn.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', event => {
    const file = event.target.files[0];
    if (file) importPrompts(file).catch(err => console.error('[PromptManager] Import failed:', err));
  });
});
