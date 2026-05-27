// 使用 IIFE 包裹脚本，防止重复执行
(function() {
  'use strict';
  
  // 开头即检查注入标记，已注入则直接退出
  if (window.__promptManagerInputHandlerInjected) {
    return;
  }
  window.__promptManagerInputHandlerInjected = true;

/**
 * 输入框检测与交互处理类
 */
class InputBoxHandler {
  // 缓存 providers 数据，避免每次 getInputBox 都 fetch
  static _providersCache = null;

  static async _getProviders() {
    if (InputBoxHandler._providersCache) return InputBoxHandler._providersCache;
    try {
      const response = await fetch(chrome.runtime.getURL('llm_providers.json'));
      if (response.ok) {
        const data = await response.json();
        InputBoxHandler._providersCache = data.llm_providers || [];
      }
    } catch (error) {
      console.error('Failed to load llm_providers.json:', error);
      InputBoxHandler._providersCache = [];
    }
    return InputBoxHandler._providersCache;
  }

  /**
   * 检测并获取受支持网站的输入框
   * @returns {HTMLElement|null} 输入框元素，未找到时返回 null
   */
  static async getInputBox() {
    const providers = await InputBoxHandler._getProviders();

    for (const provider of providers) {
      if (provider.pattern) {
        const pattern = provider.pattern.replace(/\*/g, '.*');
        const regex = new RegExp(pattern, 'i');
        if (regex.test(window.location.href)) {
          if (provider.element_selector) {
            const inputBox = document.querySelector(provider.element_selector);
            if (inputBox) {
              console.log(`Input box found: ${provider.name}`);
              return inputBox;
            }
          }
        }
      }
    }

    console.error('Input box not found on this page.');
    return null;
  }

  /**
   * 等待输入框在 DOM 中出现
   * @returns {Promise<HTMLElement>} 解析为输入框元素
   */
  static waitForInputBox() {
    return new Promise((resolve, reject) => {
      const checkExist = setInterval(async () => {
        const inputBox = await InputBoxHandler.getInputBox();
        if (inputBox) {
          clearInterval(checkExist);
          resolve(inputBox);
        }
      }, 500); // 每 500ms 检查一次

      // 10 秒后超时
      setTimeout(() => {
        clearInterval(checkExist);
        reject('Input box not found after 10 seconds.');
      }, 10000);
    });
  }

  /**
   * 向富文本编辑器插入纯文本，优先保留换行。
   * @param {HTMLElement} inputBox
   * @param {string} textToInsert
   * @returns {boolean}
   */
  static tryInsertRichText(inputBox, textToInsert) {
    const hasLineBreak = textToInsert.includes('\n');
    let inserted = false;

    if (hasLineBreak) {
      try {
        const dataTransfer = new DataTransfer();
        dataTransfer.setData('text/plain', textToInsert);
        const pasteEvent = new ClipboardEvent('paste', {
          clipboardData: dataTransfer,
          bubbles: true,
          cancelable: true,
        });
        inputBox.dispatchEvent(pasteEvent);
        inserted = true;
      } catch (_) {}
    }

    if (!inserted) {
      try {
        inserted = document.execCommand('insertText', false, textToInsert);
      } catch (_) {}
    }

    if (!inserted) {
      try {
        inputBox.dispatchEvent(new InputEvent('beforeinput', {
          inputType: hasLineBreak ? 'insertFromPaste' : 'insertText',
          data: textToInsert,
          bubbles: true,
          cancelable: true,
        }));
        inputBox.dispatchEvent(new Event('input', { bubbles: true }));
        inserted = true;
      } catch (_) {}
    }

    return inserted;
  }

  /**
   * 富文本插入失败时，退回到 innerText，避免换行被 textContent 吞掉。
   * @param {HTMLElement} inputBox
   * @param {string} textToInsert
   * @param {boolean} appendMode
   */
  static fallbackInsertRichText(inputBox, textToInsert, appendMode) {
    const existingText = appendMode ? (inputBox.innerText || '') : '';
    inputBox.innerText = existingText + textToInsert;
    inputBox.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /**
   * 通用富文本编辑器插入逻辑（CodeMirror/Slate/ProseMirror 等）
   * @param {HTMLElement} inputBox
   * @param {string} textToInsert
   * @param {boolean} disableOverwrite
   */
  static _insertIntoRichEditor(inputBox, textToInsert, disableOverwrite) {
    if (!disableOverwrite) {
      inputBox.innerHTML = '';
    }
    inputBox.focus();
    const inserted = InputBoxHandler.tryInsertRichText(inputBox, textToInsert);
    if (!inserted) {
      InputBoxHandler.fallbackInsertRichText(inputBox, textToInsert, disableOverwrite);
    }
    const endRange = document.createRange();
    endRange.selectNodeContents(inputBox);
    endRange.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(endRange);
    inputBox.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * 将提示词插入到检测到的输入框中
   * @param {HTMLElement} inputBox - 输入框元素
   * @param {string} content - 要插入的提示词内容
   * @param {HTMLElement} promptList - 插入后需要隐藏的提示词列表元素
   */
  static async insertPrompt(inputBox, content, promptList) {
    if (!inputBox || !content || !promptList) {
      console.error('Missing required parameters for insertPrompt', { inputBox, content, promptList });
      return;
    }
    inputBox.focus();
    try {
      console.log('Inserting prompt:', { content, inputBox, promptList });
      // 读取追加/覆盖模式设置
      const disableOverwrite = await new Promise(resolve => {
        chrome.storage.local.get('disableOverwrite', data => {
          // 默认开启”追加模式”；仅当用户显式设置为 false 时才关闭
          if (chrome.runtime?.lastError) { resolve(true); return; }
          if (data && Object.prototype.hasOwnProperty.call(data, 'disableOverwrite')) {
            resolve(Boolean(data.disableOverwrite));
            return;
          }
          resolve(true);
        });
      });

      if (inputBox.contentEditable === 'true') {
        // 处理富文本编辑器（如 Perplexity 使用 Lexical 的 #ask-input）
        // Lexical 忽略直接 DOM 操作，但响应 execCommand/InputEvents
        const isLexicalEditor = inputBox.getAttribute('data-lexical-editor') === 'true'
          || !!inputBox.closest('[data-lexical-editor=”true”]')
          || inputBox.id === 'ask-input';

        if (isLexicalEditor) {
          // 根据追加/覆盖偏好设置光标位置
          const selection = window.getSelection();
          const range = document.createRange();
          if (disableOverwrite) {
            range.selectNodeContents(inputBox);
            range.collapse(false);
          } else {
            range.selectNodeContents(inputBox);
          }
          selection.removeAllRanges();
          selection.addRange(range);

          if (!disableOverwrite) {
            document.execCommand('delete', false, null);
          }

          const textToInsert = content + '  ';
          const inserted = InputBoxHandler.tryInsertRichText(inputBox, textToInsert);
          if (!inserted) {
            InputBoxHandler.fallbackInsertRichText(inputBox, textToInsert, disableOverwrite);
          }

          const endRange = document.createRange();
          endRange.selectNodeContents(inputBox);
          endRange.collapse(false);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(endRange);

          inputBox.dispatchEvent(new Event('change', { bubbles: true }));
          PromptUIManager.hidePromptList(promptList);
          return;
        }

        // CodeMirror / Slate / ProseMirror 共用统一插入逻辑
        const isSharedRichEditor =
          // CodeMirror
          (inputBox.classList && (inputBox.classList.contains('cm-content') || inputBox.classList.contains('cm-lineWrapping'))) ||
          (typeof inputBox.closest === 'function' && (!!inputBox.closest('.cm-content') || !!inputBox.closest('.cm-lineWrapping'))) ||
          // Slate
          (inputBox.hasAttribute && (inputBox.hasAttribute('data-slate-node') || inputBox.hasAttribute('data-slate-editor'))) ||
          (typeof inputBox.closest === 'function' && (!!inputBox.closest('[data-slate-node]') || !!inputBox.closest('[data-slate-editor]'))) ||
          // ProseMirror/Tiptap
          (inputBox.classList && inputBox.classList.contains('ProseMirror')) ||
          (typeof inputBox.closest === 'function' && !!inputBox.closest('.ProseMirror'));

        if (isSharedRichEditor) {
          InputBoxHandler._insertIntoRichEditor(inputBox, content + '  ', disableOverwrite);
          PromptUIManager.hidePromptList(promptList);
          return;
        }

        // 默认 contentEditable 处理（非 Lexical 编辑器）
        if (disableOverwrite) {
          // 追加模式 — 在末尾添加内容，不清除已有文本
          const endRange = document.createRange();
          endRange.selectNodeContents(inputBox);
          endRange.collapse(false);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(endRange);

          if (content.includes('\n')) {
            const lines = content.split('\n');
            lines.forEach((line, index) => {
              const p = document.createElement('p');
              if (line.trim()) {
                p.textContent = line;
              } else {
                p.appendChild(document.createElement('br'));
              }
              inputBox.appendChild(p);
            });
          } else {
            const lastNode = inputBox.lastChild;
            const needsSpace = lastNode && lastNode.nodeType === Node.TEXT_NODE && !lastNode.textContent.endsWith(' ');
            const prefix = needsSpace ? ' ' : '';
            inputBox.appendChild(document.createTextNode(prefix + content));
          }
        } else {
          // 覆盖模式 — 替换内容并模拟粘贴以提高兼容性
          inputBox.innerHTML = '';

          const dataTransfer = new DataTransfer();
          dataTransfer.setData('text/plain', content);
          const pasteEvent = new ClipboardEvent('paste', {
            clipboardData: dataTransfer,
            bubbles: true,
            cancelable: true,
          });
          inputBox.dispatchEvent(pasteEvent);

          // 粘贴事件未完美处理换行时的回退逻辑
          if (content.includes('\n')) {
            const lines = content.split('\n');
            inputBox.innerHTML = '';
            lines.forEach((line, index) => {
              if (line.trim()) {
                const p = document.createElement('p');
                p.textContent = line;
                inputBox.appendChild(p);
              } else if (index < lines.length - 1) {
                const p = document.createElement('p');
                const br = document.createElement('br');
                p.appendChild(br);
                inputBox.appendChild(p);
              }
            });
          } else {
            // 单行提示词，确保内容已设置
            inputBox.textContent = content;
          }
        }

        // 末尾添加两个空格
        inputBox.appendChild(document.createTextNode('  '));

        // 将光标移至内容末尾
        const range = document.createRange();
        range.selectNodeContents(inputBox);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        // 触发 input 事件通知应用内容变更
        inputBox.dispatchEvent(new Event('input', { bubbles: true }));

        // 最终回退：若仍为空则设置 innerText
        if (!inputBox.textContent || inputBox.textContent.trim() === '') {
          inputBox.innerText = content + '  ';
          inputBox.dispatchEvent(new Event('input', { bubbles: true }));
        }
      } else if (inputBox.tagName.toLowerCase() === 'textarea') {
        // textarea：覆盖或追加
        if (disableOverwrite) {
          const existing = inputBox.value || '';
          const needsSpace = existing && !/\s$/.test(existing);
          const spacer = needsSpace ? ' ' : '';
          inputBox.value = existing + spacer + content + '  ';
        } else {
          inputBox.value = content + '  ';
        }
        inputBox.dispatchEvent(new Event('input', { bubbles: true }));
        inputBox.dispatchEvent(new Event('change', { bubbles: true }));
        inputBox.style.height = 'auto';
        inputBox.style.height = `${inputBox.scrollHeight}px`;
      } else {
        console.error('Unknown input box type.', { inputBox });
        return;
      }
      PromptUIManager.hidePromptList(promptList);
    } catch (error) {
      console.error('Error inserting prompt:', error, { content, inputBox, promptList });
    }
  }

  /**
   * 获取输入框中的内容
   * @param {HTMLElement} inputBox - 输入框元素
   * @returns {string} 输入框的内容
   */
  static getInputContent(inputBox) {
    if (inputBox.contentEditable === 'true') {
      return inputBox.innerText;
    } else if (inputBox.tagName.toLowerCase() === 'textarea') {
      return inputBox.value;
    }
    return '';
  }
}

window.InputBoxHandler = InputBoxHandler;

})();
