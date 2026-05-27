export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * HTML 转义，防止 XSS
 * @param {string} s
 * @returns {string}
 */
export function escapeHTML(s) {
  return s.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

/**
 * 计算搜索匹配度评分
 * 权重：标题 > 标签 > 内容。精确/前缀匹配加分，位置靠前加分。
 *
 * @param {string} searchTerm  搜索关键词（已小写化）
 * @param {string} title       标题（小写）
 * @param {string} tags        标签（小写，空格分隔）
 * @param {string} content     内容（小写）
 * @returns {number} 匹配分数，不匹配返回 0
 */
export function computeMatchScore(searchTerm, title, tags, content) {
  if (!searchTerm) return 0;
  let score = 0;

  const titleIdx = title.indexOf(searchTerm);
  if (titleIdx !== -1) {
    let s = 100;
    if (titleIdx === 0) s *= 1.5;
    if (title === searchTerm) s *= 2;
    s *= Math.max(0.2, 1 - titleIdx / 100);
    score += s;
  }

  const tagsIdx = tags.indexOf(searchTerm);
  if (tagsIdx !== -1) {
    let s = 50;
    if (tagsIdx === 0 || tags[tagsIdx - 1] === ' ') s *= 1.3;
    s *= Math.max(0.3, 1 - tagsIdx / 100);
    score += s;
  }

  const contentIdx = content.indexOf(searchTerm);
  if (contentIdx !== -1) {
    let s = 10;
    s *= Math.max(0.5, 1 - contentIdx / 500);
    score += s;
  }

  return score;
}

/**
 * 生成搜索匹配预览 HTML 片段
 * 在标题匹配时不返回预览（标题本身已展示）
 * 优先匹配内容，其次匹配标签
 *
 * @param {string} searchTerm  搜索关键词（已小写化）
 * @param {string} titleLower  标题（小写）
 * @param {string} contentRaw  内容原文
 * @param {string} tagsRaw     标签原文（逗号分隔）
 * @returns {string} 高亮后的 HTML，无匹配时返回 ''
 */
export function buildSearchPreviewHtml(searchTerm, titleLower, contentRaw, tagsRaw) {
  if (!searchTerm) return '';
  if (titleLower?.includes(searchTerm)) return '';

  const MAX_SNIPPET = 80;
  let source = '';
  let matchIndex = -1;
  const contentLower = (contentRaw || '').toLowerCase();
  const tagsLower = (tagsRaw || '').toLowerCase();

  if (contentLower.includes(searchTerm)) {
    source = contentRaw;
    matchIndex = contentLower.indexOf(searchTerm);
  } else if (tagsLower.includes(searchTerm)) {
    source = tagsRaw;
    matchIndex = tagsLower.indexOf(searchTerm);
  }

  if (matchIndex < 0) return '';

  const halfLen = Math.floor((MAX_SNIPPET - searchTerm.length) / 2);
  let start = Math.max(0, matchIndex - halfLen);
  let end = Math.min(source.length, matchIndex + searchTerm.length + halfLen);
  let snippet = source.substring(start, end);
  if (start > 0) snippet = '...' + snippet;
  if (end < source.length) snippet = snippet + '...';

  const escaped = escapeHTML(snippet);
  const escTerm = escapeHTML(searchTerm);
  return escaped.replace(
    new RegExp(escTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
    m => `<mark>${m}</mark>`
  );
}

