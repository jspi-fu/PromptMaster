// promptStorage.js – 统一版本化提示词存储管理器

import { generateUUID } from './utils.js';

export const PROMPT_STORAGE_VERSION = 2;
const STORAGE_KEY = 'prompts_storage';
const LEGACY_KEY = 'prompts';

// 内存缓存层：减少 chrome.storage 调用
const promptsCache = {
  data: null,
  timestamp: 0,
  TTL_MS: 3000
};

const invalidateCache = () => {
  promptsCache.data = null;
  promptsCache.timestamp = 0;
};

function storageGet(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}
function storageSet(obj) {
  return new Promise(resolve => chrome.storage.local.set(obj, resolve));
}

// 标准化单条提示词数据结构
function normalisePrompt(p = {}) {
  const out = {
    uuid: p.uuid || p.id || generateUUID(),
    title: typeof p.title === 'string' ? p.title : '',
    content: typeof p.content === 'string' ? p.content : '',
    createdAt: p.createdAt || new Date().toISOString()
  };
  if (p.updatedAt) out.updatedAt = p.updatedAt;
  // v2 字段——确保新属性存在且有安全默认值
  // tags：去重的字符串标签数组
  if (Array.isArray(p.tags)) {
    const seen = new Set();
    out.tags = p.tags
      .map(t => (typeof t === 'string' ? t.trim() : ''))
      .filter(t => t.length > 0 && !seen.has(t) && seen.add(t));
  } else {
    out.tags = [];
  }
  // folderId：字符串或 null
  out.folderId = typeof p.folderId === 'string' && p.folderId.length > 0 ? p.folderId : null;
  return out;
}
function normaliseArray(arr) {
  return Array.isArray(arr) ? arr.map(normalisePrompt) : [];
}

async function readRawStorage() {
  const data = await storageGet([STORAGE_KEY, LEGACY_KEY]);
  // 正常路径：已使用规范 key
  if (data[STORAGE_KEY] && Array.isArray(data[STORAGE_KEY].prompts)) {
    const store = data[STORAGE_KEY];
    // 版本不匹配时执行升级
    if (store.version !== PROMPT_STORAGE_VERSION) {
      // v2 升级：添加 folders 容器并标准化新字段
      const upgraded = {
        version: PROMPT_STORAGE_VERSION,
        prompts: normaliseArray(store.prompts),
        folders: Array.isArray(store.folders) ? normaliseFolderArray(store.folders) : []
      };
      await writeStore(upgraded);
      return upgraded;
    }
    // 确保 v2 存储中包含 folders 字段
    if (!Array.isArray(store.folders)) {
      store.folders = [];
      await writeStore({ version: PROMPT_STORAGE_VERSION, prompts: normaliseArray(store.prompts), folders: [] });
    }
    return { version: store.version, prompts: normaliseArray(store.prompts), folders: normaliseFolderArray(store.folders) };
  }
  // 旧版迁移：仅有裸数组
  if (Array.isArray(data[LEGACY_KEY])) {
    const migrated = {
      version: PROMPT_STORAGE_VERSION,
      prompts: normaliseArray(data[LEGACY_KEY]),
      folders: []
    };
    await writeStore(migrated);
    return migrated;
  }
  // 尚无存储数据
  return { version: PROMPT_STORAGE_VERSION, prompts: [], folders: [] };
}

// 底层写入器，写入完整存储对象（prompts + folders）
async function writeStore(storeObj) {
  const normalizedStore = {
    version: PROMPT_STORAGE_VERSION,
    prompts: normaliseArray(storeObj.prompts || []),
    folders: normaliseFolderArray(storeObj.folders || [])
  };
  await storageSet({
    [STORAGE_KEY]: normalizedStore,
    [LEGACY_KEY]: normalizedStore.prompts // 为旧代码路径保持镜像同步
  });
}

// 向后兼容写入器：仅接收 prompts 数组，保留现有 folders
async function writeStorage(prompts) {
  invalidateCache();
  const data = await storageGet([STORAGE_KEY]);
  const currentFolders = (data[STORAGE_KEY] && Array.isArray(data[STORAGE_KEY].folders)) ? data[STORAGE_KEY].folders : [];
  await writeStore({ prompts, folders: currentFolders });
}

function normaliseFolder(folder = {}) {
  return {
    id: typeof folder.id === 'string' && folder.id ? folder.id : generateUUID(),
    name: typeof folder.name === 'string' ? folder.name : '',
    parentId: typeof folder.parentId === 'string' && folder.parentId ? folder.parentId : null,
    createdAt: folder.createdAt || new Date().toISOString(),
    ...(folder.updatedAt ? { updatedAt: folder.updatedAt } : {})
  };
}
function normaliseFolderArray(folders) {
  return Array.isArray(folders) ? folders.map(normaliseFolder) : [];
}

export async function getPrompts() {
  const now = Date.now();
  if (promptsCache.data && (now - promptsCache.timestamp < promptsCache.TTL_MS)) {
    return promptsCache.data;
  }
  const { prompts } = await readRawStorage();
  promptsCache.data = prompts;
  promptsCache.timestamp = now;
  return prompts;
}

export async function setPrompts(prompts) {
  await writeStorage(prompts);
}

export async function savePrompt({ title, content, uuid, tags = [], folderId = null }) {
  if (!title || !content) throw new Error('Title & content are required');
  const prompts = await getPrompts();
  const prompt = normalisePrompt({ uuid, title, content, tags, folderId });
  prompts.push(prompt);
  await writeStorage(prompts);
  return { success: true, prompt };
}

export async function updatePrompt(uuid, partial) {
  const prompts = await getPrompts();
  const idx = prompts.findIndex(p => p.uuid === uuid);
  if (idx === -1) throw new Error('Prompt not found');
  prompts[idx] = normalisePrompt({ ...prompts[idx], ...partial, updatedAt: new Date().toISOString() });
  await writeStorage(prompts);
  return prompts[idx];
}

export async function deletePrompt(uuid) {
  const prompts = (await getPrompts()).filter(p => p.uuid !== uuid);
  await writeStorage(prompts);
  return true;
}

export async function mergePrompts(imported) {
  const base = await getPrompts();
  const map = new Map(base.map(p => [p.uuid, p]));
  imported.forEach(raw => {
    const p = normalisePrompt(raw);
    const existing = map.get(p.uuid);
    if (existing) {
      // 保留较新的记录（比较 updatedAt 或 createdAt）
      const oldDate = new Date(existing.updatedAt || existing.createdAt);
      const newDate = new Date(p.updatedAt || p.createdAt);
      if (newDate > oldDate) map.set(p.uuid, p);
    } else {
      map.set(p.uuid, p);
    }
  });
  const merged = Array.from(map.values());
  await writeStorage(merged);
  return merged;
}

// 文件夹 CRUD
export async function getFolders() {
  const { folders } = await readRawStorage();
  return folders;
}

export async function setFolders(folders) {
  const { prompts } = await readRawStorage();
  await writeStore({ version: PROMPT_STORAGE_VERSION, prompts, folders });
}

export async function saveFolder({ name, parentId = null, id }) {
  if (!name || typeof name !== 'string') throw new Error('Folder name is required');
  const folders = await getFolders();
  const folder = normaliseFolder({ id, name: name.trim(), parentId });
  folders.push(folder);
  await setFolders(folders);
  return folder;
}

export async function updateFolder(id, partial) {
  const folders = await getFolders();
  const idx = folders.findIndex(f => f.id === id);
  if (idx === -1) throw new Error('Folder not found');
  folders[idx] = normaliseFolder({ ...folders[idx], ...partial, updatedAt: new Date().toISOString() });
  await setFolders(folders);
  return folders[idx];
}

export async function deleteFolder(id) {
  const { prompts, folders } = await readRawStorage();
  const remainingFolders = folders.filter(f => f.id !== id);
  // 将属于已删除文件夹的提示词解除关联（不销毁数据）
  const updatedPrompts = prompts.map(p => (p.folderId === id ? { ...p, folderId: null } : p));
  await writeStore({ version: PROMPT_STORAGE_VERSION, prompts: updatedPrompts, folders: remainingFolders });
  return true;
}

// 提示词与文件夹关联辅助函数
export async function movePromptToFolder(promptUuid, folderId = null) {
  // folderId 为 null 表示从文件夹移除；非空时需确保目标文件夹存在
  if (folderId) {
    const folders = await getFolders();
    if (!folders.find(f => f.id === folderId)) throw new Error('Target folder does not exist');
  }
  return await updatePrompt(promptUuid, { folderId });
}

// 提示词标签辅助函数
export async function addTagToPrompt(promptUuid, tag) {
  const clean = typeof tag === 'string' ? tag.trim() : '';
  if (!clean) return await getPrompts();
  const prompts = await getPrompts();
  const idx = prompts.findIndex(p => p.uuid === promptUuid);
  if (idx === -1) throw new Error('Prompt not found');
  const set = new Set(prompts[idx].tags || []);
  set.add(clean);
  return await updatePrompt(promptUuid, { tags: Array.from(set) });
}

export async function removeTagFromPrompt(promptUuid, tag) {
  const prompts = await getPrompts();
  const idx = prompts.findIndex(p => p.uuid === promptUuid);
  if (idx === -1) throw new Error('Prompt not found');
  const next = (prompts[idx].tags || []).filter(t => t !== tag);
  return await updatePrompt(promptUuid, { tags: next });
}

export async function setTagsForPrompt(promptUuid, tags = []) {
  return await updatePrompt(promptUuid, { tags });
}

/**
 * 返回格式化的提示词 JSON 字符串。
 * 不执行 DOM 操作（因为 service worker 中没有 document），UI 层负责触发下载。
 */
export async function exportPromptsJSON() {
  return JSON.stringify(await getPrompts(), null, 2);
}

/**
 * 向后兼容——在有 document 的环境中直接下载。
 * service worker 应调用 exportPromptsJSON() 并通过消息传递给 UI 层。
 */
export async function exportPrompts() {
  const json = await exportPromptsJSON();
  if (typeof document === 'undefined') {
    console.warn('[PromptStorage] exportPrompts called in non-DOM context; use exportPromptsJSON() instead.');
    return json;
  }
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `prompts-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

export async function importPrompts(source) {
  // source 可以是 File、Array 或原始 JSON 字符串
  let imported;
  if (Array.isArray(source)) {
    imported = source;
  } else if (source instanceof File) {
    const text = await source.text();
    imported = JSON.parse(text);
  } else if (typeof source === 'string') {
    imported = JSON.parse(source);
  } else {
    throw new Error('Unsupported import source');
  }
  // 兼容旧版数组格式和新版包含 folders 的存储对象格式
  if (Array.isArray(imported)) {
    return await mergePrompts(imported);
  }
  if (imported && typeof imported === 'object') {
    const { prompts = [], folders = [] } = imported;
    const mergedPrompts = await mergePrompts(prompts);
    // 按 id 合并文件夹
    const currentFolders = await getFolders();
    const map = new Map(currentFolders.map(f => [f.id, f]));
    normaliseFolderArray(folders).forEach(f => { map.set(f.id, f); });
    await setFolders(Array.from(map.values()));
    return mergedPrompts;
  }
  throw new Error('Invalid JSON format – expected an array or store object');
}

// 变更监听便捷封装
export function onPromptsChanged(callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[STORAGE_KEY] || changes[LEGACY_KEY]) {
      getPrompts().then(callback);
    }
  });
} 