export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * COMMENT: HTML 转义，防止 XSS。
 * @param {string} s
 * @returns {string}
 */
export function escapeHTML(s) {
  return s.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

/**
 * COMMENT: 生成搜索匹配预览 HTML 片段。
 * 在标题匹配时不返回预览（标题本身已展示）。
 * 优先匹配内容，其次匹配标签。
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

