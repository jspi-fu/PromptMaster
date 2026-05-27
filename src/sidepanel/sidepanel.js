// sidepanel.js

// COMMENT: Use unified prompt storage for all prompt operations
import * as PromptStorage from '../promptStorage.js';
import { exportPrompts, importPrompts } from '../promptStorage.js';
import { initI18n, t } from '../i18n.js';
import { buildSearchPreviewHtml, computeMatchScore } from '../utils.js';

// COMMENT: Track forced dark mode state to sync with floating mode
let isDarkModeForced = false;

// COMMENT: Apply dark mode class to document based on forced setting or system preference
function applyTheme() {
  const shouldBeDark = isDarkModeForced || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('force-dark', shouldBeDark);
}

// COMMENT: Load dark mode preference from storage
async function loadThemePreference() {
  try {
    const result = await chrome.storage.local.get(['forceDarkMode']);
    isDarkModeForced = result.forceDarkMode === true;
    applyTheme();
  } catch (err) {
    console.warn('[PromptManager] Failed to load theme preference:', err);
  }
}

// COMMENT: Helper to check if any provider permissions are granted
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

// COMMENT: Track folded state of the "Available" group (collapsed by default)
let llmsAvailableCollapsed = true;
// COMMENT: Track folded state of Prompt Management (collapsed by default)
let pmCollapsed = true;

// COMMENT: Smoothly open/close a collapsible element without auto-scrolling the view
function setCollapsibleOpen(collapsibleEl, open) {
  if (!collapsibleEl) return;
  const scrollEl = document.scrollingElement || document.documentElement || document.body;
  const prevScrollTop = scrollEl.scrollTop;
  const targetHeight = collapsibleEl.scrollHeight;
  if (open) {
    // Ensure transition starts from 0 -> height
    collapsibleEl.classList.add('open');
    collapsibleEl.style.maxHeight = '0px';
    // Force reflow then expand to content height
    // eslint-disable-next-line no-unused-expressions
    collapsibleEl.offsetHeight;
    collapsibleEl.style.maxHeight = `${targetHeight}px`;
  } else {
    // Collapse from current height -> 0
    const currentMax = getComputedStyle(collapsibleEl).maxHeight;
    if (currentMax === 'none') {
      collapsibleEl.style.maxHeight = `${targetHeight}px`;
      // eslint-disable-next-line no-unused-expressions
      collapsibleEl.offsetHeight;
    }
    collapsibleEl.style.maxHeight = '0px';
    collapsibleEl.classList.remove('open');
  }
  // Restore scroll so view does not auto-shift
  queueMicrotask(() => {
    try {
      scrollEl.scrollTop = prevScrollTop;
    } catch (e) {
      window.scrollTo({ top: prevScrollTop, behavior: 'auto' });
    }
  });
  // After transition ends and panel is open, set to 'none' so dynamic content is accommodated
  const onEnd = (e) => {
    if (e.propertyName !== 'max-height') return;
    collapsibleEl.removeEventListener('transitionend', onEnd);
    if (collapsibleEl.classList.contains('open')) {
      collapsibleEl.style.maxHeight = 'none';
    }
  };
  collapsibleEl.addEventListener('transitionend', onEnd);
}

// COMMENT: Build a providers map from storage or compute a fallback by reading llm_providers.json and checking current permissions
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

// COMMENT: Render the LLMs section with "Activated" and "Available" pills, reflecting storage status and permissions behavior
async function renderLLMsSection() {
  const section = document.getElementById('llms-section');
  const activeWrap = document.getElementById('llms-activated');
  const availableWrap = document.getElementById('llms-available');
  const availableToggle = document.getElementById('llms-available-toggle');
  // COMMENT: Group wrappers for conditional display logic
  const shortcutsGroup = activeWrap ? activeWrap.closest('.llms-group') : null;
  const availableGroup = availableWrap ? availableWrap.closest('.llms-group') : null;
  if (!section || !activeWrap || !availableWrap) return;

  // Clear previous contents
  activeWrap.innerHTML = '';
  availableWrap.innerHTML = '';

  const providersMap = await getProvidersMapOrFallback();
  if (!providersMap || Object.keys(providersMap).length === 0) {
    // Nothing to show; leave containers empty
    return;
  }

  // Split into active vs available
  const entries = Object.entries(providersMap);
  const active = entries.filter(([, v]) => v && v.hasPermission === 'Yes');
  const inactive = entries.filter(([, v]) => !v || v.hasPermission !== 'Yes');

  // Helper to create an icon-only element (anchor) with favicon only
  const createPill = ({ name, iconUrl, url, urlPattern, active }) => {
    const a = document.createElement('a');
    a.className = `llm-pill icon-only ${active ? 'active' : 'inactive'}`;
    a.setAttribute('data-provider', name);
    a.setAttribute('data-url-pattern', urlPattern || '');
    a.setAttribute('title', active ? t('openProvider', name) : t('activateProvider', name));
    // Active pills open their provider page
    if (active && url) {
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
    } else {
      a.href = '#';
    }

    // Icon
    const img = document.createElement('img');
    img.src = iconUrl || '';
    img.alt = `${name} icon`;
    img.width = 20;
    img.height = 20;
    img.className = 'llm-pill-icon';
    a.appendChild(img);

    if (!active) {
      // Request permission on click for inactive pills
      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        const pattern = a.getAttribute('data-url-pattern');
        if (!pattern) return;
        chrome.permissions.request({ origins: [pattern] }, (granted) => {
          if (granted) {
            // Update storage map so both this UI and the permissions page stay in sync
            // Read, mutate, and write the aiProvidersMap
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

  // Render active
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

  // Render inactive
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

  // COMMENT: Apply folded state to Available group; collapsed by default
  // Special rule: if Shortcuts is empty, hide it and force Available open
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

// COMMENT: Toggle visibility between permissions shortcut and prompt list based on granted permissions
async function renderPermissionsGate() {
  const shortcut = document.getElementById('permissions-shortcut');
  const promptList = document.getElementById('prompt-list');
  const emptyState = document.getElementById('empty-state');
  if (!shortcut || !promptList) return;
  const allowed = await hasAnyGrantedProviderPermission();
  if (allowed) {
    // Hide shortcut, show list normally
    shortcut.style.display = 'none';
    promptList.style.display = 'block';
    if (emptyState && promptList.children.length === 0) {
      emptyState.style.display = 'block';
    }
  } else {
    // Show shortcut, hide list and empty state
    shortcut.style.display = 'block';
    promptList.style.display = 'none';
    if (emptyState) emptyState.style.display = 'none';
  }
}

// COMMENT: 创建搜索匹配预览元素，展示匹配的片段并高亮关键词
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

// COMMENT: Hover preview panel management for sidepanel
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

    // Fixed size, left of the list with gap
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

// COMMENT: 创建单个提示词列表项
function createPromptItem(prompt, index, searchTerm) {
  const li = document.createElement('li');
  // COMMENT: 标题+预览的纵向容器
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

  // COMMENT: 搜索模式下显示匹配内容预览
  const preview = createSearchMatchPreview(searchTerm, prompt);
  if (preview) {
    textWrap.appendChild(preview);
  }
  li.appendChild(textWrap);

  // COMMENT: Copy button (revealed on hover)
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

  // COMMENT: Edit button (revealed on hover)
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
    // COMMENT: Populate the form for editing
    document.getElementById('prompt-title').value = prompt.title;
    document.getElementById('prompt-content').value = prompt.content;
    document.getElementById('prompt-index').value = index;

    // Load tags
    currentTags = prompt.tags ? [...prompt.tags] : [];
    renderTags();

    document.getElementById('submit-button').innerHTML = `<img src="../icons/add-icon.png" alt="${t('add')}" style="margin-right: 5px" /><span>${t('updatePrompt')}</span>`;
    document.getElementById('cancel-edit-button').style.display = 'inline';
  });
  li.appendChild(editBtn);

  // COMMENT: Delete button (revealed on hover)
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

  // COMMENT: Hover interactions for action buttons and preview
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

// COMMENT: 使用 lucide 图标库创建 SVG 图标
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

// COMMENT: 当前浏览的标签路径（空数组表示根目录）
let currentTagPath = [];
// COMMENT: 当前侧边栏搜索词
let currentSearchTerm = '';
// COMMENT: 缓存最新提示词，便于搜索时直接重绘
let latestPrompts = [];

// COMMENT: 模块级标签状态，提升至此以便 createPromptItem 内的编辑按钮可访问
let currentTags = [];

// COMMENT: 渲染已添加的标签 pill，操作 DOM 中的 tags-display 容器
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

// COMMENT: 创建“无搜索结果”提示项
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

// COMMENT: 关键词检索同时匹配标题、内容和标签
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

// COMMENT: Render the list of prompts in the sidepanel UI
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

  // COMMENT: 按标签分组
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

  // COMMENT: 如果当前在标签文件夹内部
  if (currentTagPath.length > 0) {
    const currentTag = currentTagPath[currentTagPath.length - 1];

    // COMMENT: 返回上一级按钮
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

    // COMMENT: 显示当前标签名称
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

    // COMMENT: 渲染该标签下的提示词
    const items = tagged.get(currentTag) || [];
    items.forEach(({ prompt, index }) => {
      promptList.appendChild(createPromptItem(prompt, index));
    });

    return;
  }

  // COMMENT: 根目录：先渲染无标签的提示词
  untagged.forEach(({ prompt, index }) => {
    promptList.appendChild(createPromptItem(prompt, index));
  });

  // COMMENT: 再渲染标签文件夹
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

// COMMENT: Load prompts from storage and render them
async function loadPrompts() {
  latestPrompts = await PromptStorage.getPrompts();
  displayPrompts(latestPrompts);
}

document.addEventListener('DOMContentLoaded', () => {
  // COMMENT: Initialize i18n for static elements
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
  // COMMENT: Info banner elements for close/dismiss behavior
  const infoBanner = document.getElementById('info-banner');
  const infoBannerClose = document.getElementById('info-banner-close');
  
  // COMMENT: 标签相关 DOM 引用（currentTags 与 renderTags 已提升至模块级）
  const tagsContainer = document.getElementById('tags-container');
  const tagInput = document.getElementById('tag-input');

  // COMMENT: 添加标签（去重、去空白）
  function addTag(tagName) {
    const trimmedTag = tagName.trim();
    if (trimmedTag && !currentTags.includes(trimmedTag)) {
      currentTags.push(trimmedTag);
      renderTags();
    }
  }

  // COMMENT: 清空所有标签
  function clearTags() {
    currentTags = [];
    renderTags();
  }

  // Tag input event listeners
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

    // Click on tags container to focus input
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

  // Load prompts and display
  loadPrompts();
  // COMMENT: Evaluate permissions gate on load
  renderPermissionsGate();
  // COMMENT: Render LLMs section on load
  renderLLMsSection();
  // COMMENT: Load and apply theme preference
  loadThemePreference();

  // COMMENT: Wire Available subheading toggle (fold/unfold)
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
    // Ensure default collapsed state reflected in DOM
    setCollapsibleOpen(availableWrap, false);
    availableToggle.setAttribute('aria-expanded', 'false');
  }

  // COMMENT: Wire Prompt Management toggle (fold/unfold), collapsed by default
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
    // Ensure default collapsed state reflected in DOM
    setCollapsibleOpen(pmControls, false);
    pmToggle.setAttribute('aria-expanded', 'false');
  }

  // COMMENT: Refresh UI whenever prompts change in storage
  PromptStorage.onPromptsChanged(loadPrompts);

  // COMMENT: React to permissions updates live (permissions page writes aiProvidersMap)
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.aiProvidersMap) {
        renderPermissionsGate();
        // COMMENT: Also refresh the LLMs section so pills reflect new activation status
        renderLLMsSection();
      }
      // COMMENT: React to theme changes from floating mode
      if (area === 'local' && changes.forceDarkMode) {
        isDarkModeForced = changes.forceDarkMode.newValue === true;
        applyTheme();
      }
    });
  } catch (err) {
    // Ignore if not available
  }

  // Decide whether to show the info banner based on a storage-backed toggle.
  // Default is hidden unless `spm_show_info_banner` is true and the user has not dismissed it.
  if (infoBanner) {
    infoBanner.style.display = 'none'; // default: hidden
  }
  try {
    chrome.storage?.local?.get(['spm_show_info_banner'], (res) => {
      const shouldShow = res && res.spm_show_info_banner === true;
      // Respect prior dismissal stored in localStorage
      const dismissed = (() => {
        try { return localStorage.getItem('spm_info_banner_dismissed') === 'true'; } catch (e) { return false; }
      })();
      if (shouldShow && !dismissed && infoBanner) {
        infoBanner.style.display = '';
      }
    });
  } catch (err) {
    // If storage read fails, keep banner hidden unless already visible by markup
    try {
      const dismissed = localStorage.getItem('spm_info_banner_dismissed') === 'true';
      if (dismissed && infoBanner) infoBanner.style.display = 'none';
    } catch (e) { }
  }

  // Close banner and persist choice
  if (infoBannerClose) {
    infoBannerClose.addEventListener('click', () => {
      if (infoBanner) infoBanner.style.display = 'none';
      try {
        localStorage.setItem('spm_info_banner_dismissed', 'true');
        // Turning off the storage toggle ensures it will not show again
        // until explicitly re-enabled by setting `spm_show_info_banner` to true.
        chrome.storage?.local?.set({ spm_show_info_banner: false });
      } catch (err) {
        // Ignore storage errors
      }
    });
  }

  // Add or update prompt
  form.addEventListener('submit', event => {
    event.preventDefault();
    const title = titleInput.value.trim();
    const content = contentInput.value;
    const tags = [...currentTags];

    if (promptIndexInput.value === '') {
      // COMMENT: Add new prompt via unified manager
      PromptStorage.savePrompt({ title, content, tags }).catch(console.error);
    } else {
      // COMMENT: Update existing prompt by mapping index to uuid via unified manager
      const index = parseInt(promptIndexInput.value, 10);
      PromptStorage.getPrompts().then(prompts => {
        if (index >= 0 && index < prompts.length) {
          const uuid = prompts[index].uuid;
          return PromptStorage.updatePrompt(uuid, { title, content, tags });
        }
      }).catch(console.error);
    }

    // Reset form
    titleInput.value = '';
    contentInput.value = '';
    promptIndexInput.value = '';
    clearTags();
    submitButton.innerHTML = `<img src="../icons/add-icon.png" alt="${t('add')}" style="margin-right: 5px" /><span>${t('savePrompt')}</span>`;
    cancelEditButton.style.display = 'none';
  });

  // Cancel edit
  cancelEditButton.addEventListener('click', () => {
    // Reset form
    titleInput.value = '';
    contentInput.value = '';
    promptIndexInput.value = '';
    clearTags();
    submitButton.innerHTML = `<img src="../icons/add-icon.png" alt="${t('add')}" style="margin-right: 5px" /><span>${t('addPrompt')}</span>`;
    cancelEditButton.style.display = 'none';
  });

  // Export prompts
  exportBtn.addEventListener('click', exportPrompts);

  // Import prompts
  importBtn.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', event => {
    const file = event.target.files[0];
    if (file) importPrompts(file).catch(err => console.error('[PromptManager] Import failed:', err));
  });
});
