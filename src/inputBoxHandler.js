// inputBoxHandler.js
// This script handles input box detection and interactions on supported websites.

// COMMENT: Wrap entire script in IIFE to prevent duplicate execution
(function() {
  'use strict';
  
  // COMMENT: Check injection marker at the very beginning - if already injected, exit immediately
  if (window.__promptManagerInputHandlerInjected) {
    return;
  }
  window.__promptManagerInputHandlerInjected = true;

/**
 * Class to handle input box detection and interactions on supported websites.
 */
class InputBoxHandler {
  // COMMENT: 缓存 providers 数据，避免每次 getInputBox 都 fetch
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
   * Detects and retrieves the input box from supported websites.
   * @returns {HTMLElement|null} The input box element or null if not found.
   */
  static async getInputBox() {
    const providers = await InputBoxHandler._getProviders();

    // Dynamic matching using llm_providers.json
    for (const provider of providers) {
      if (provider.pattern) {
        // Convert pattern to a URL matching format
        const pattern = provider.pattern.replace(/\*/g, '.*');
        const regex = new RegExp(pattern, 'i');
        if (regex.test(window.location.href)) {
          if (provider.element_selector) {
            const inputBox = document.querySelector(provider.element_selector);
            if (inputBox) {
              console.log(`Input box found: ${provider.name}`);
              return inputBox;
            }
          } else {
            // If no element_selector is provided, we'll fall back to the old logic
            // This maintains backward compatibility for providers without selectors
          }
        }
      }
    }

    // If no input box is found, log an error
    console.error('Input box not found on this page.');
    return null;
  }

  /**
   * Waits for the input box to be available in the DOM.
   * @returns {Promise<HTMLElement>} Resolves with the input box element.
   */
  static waitForInputBox() {
    return new Promise((resolve, reject) => {
      const checkExist = setInterval(async () => {
        const inputBox = await InputBoxHandler.getInputBox();
        if (inputBox) {
          clearInterval(checkExist);
          resolve(inputBox);
        }
      }, 500); // Check every 500ms

      // Timeout after 10 seconds
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
   * COMMENT: 通用富文本编辑器插入逻辑（CodeMirror/Slate/ProseMirror 等）
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
   * Inserts a prompt into the detected input box.
   * @param {HTMLElement} inputBox - The input box element.
   * @param {string} content - The prompt content to insert.
   * @param {HTMLElement} promptList - The prompt list element to hide after insertion.
   */
  static async insertPrompt(inputBox, content, promptList) {
    if (!inputBox || !content || !promptList) {
      console.error('Missing required parameters for insertPrompt', { inputBox, content, promptList });
      return;
    }
    inputBox.focus();
    try {
      console.log('Inserting prompt:', { content, inputBox, promptList });
      // COMMENT: Read setting that controls append vs overwrite behavior
      const disableOverwrite = await new Promise(resolve => {
        chrome.storage.local.get('disableOverwrite', data => {
          // COMMENT: 默认开启”追加模式”；仅当用户显式设置为 false 时才关闭
          if (chrome.runtime?.lastError) { resolve(true); return; }
          if (data && Object.prototype.hasOwnProperty.call(data, 'disableOverwrite')) {
            resolve(Boolean(data.disableOverwrite));
            return;
          }
          resolve(true);
        });
      });

      if (inputBox.contentEditable === 'true') {
        // COMMENT: Handle rich editors (e.g., Perplexity uses Lexical under #ask-input)
        // COMMENT: Lexical ignores direct DOM mutations but responds to execCommand/InputEvents
        const isLexicalEditor = inputBox.getAttribute('data-lexical-editor') === 'true'
          || !!inputBox.closest('[data-lexical-editor=”true”]')
          || inputBox.id === 'ask-input';

        if (isLexicalEditor) {
          // COMMENT: Normalize caret based on append/overwrite preference
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

        // COMMENT: CodeMirror / Slate / ProseMirror 共用统一插入逻辑
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

        // COMMENT: Default contentEditable handling (non-Lexical editors)
        if (disableOverwrite) {
          // COMMENT: Append mode — add content at the end without clearing existing text
          // Ensure caret is at the end before appending
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
          // COMMENT: Overwrite mode — replace content and simulate a paste for better compatibility
          inputBox.innerHTML = '';

          const dataTransfer = new DataTransfer();
          dataTransfer.setData('text/plain', content);
          const pasteEvent = new ClipboardEvent('paste', {
            clipboardData: dataTransfer,
            bubbles: true,
            cancelable: true,
          });
          inputBox.dispatchEvent(pasteEvent);

          // Fallback for line breaks if paste event doesn't handle them perfectly
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
            // For single-line prompts, ensure content is set
            inputBox.textContent = content;
          }
        }

        // Add two spaces at the end
        inputBox.appendChild(document.createTextNode('  '));

        // Move cursor to the end of the content
        const range = document.createRange();
        range.selectNodeContents(inputBox);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        // Trigger input event to notify the application of the change
        inputBox.dispatchEvent(new Event('input', { bubbles: true }));

        // Final fallback: if still empty, set innerText
        if (!inputBox.textContent || inputBox.textContent.trim() === '') {
          inputBox.innerText = content + '  ';
          inputBox.dispatchEvent(new Event('input', { bubbles: true }));
        }
      } else if (inputBox.tagName.toLowerCase() === 'textarea') {
        // COMMENT: For textareas, either overwrite or append
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
   * Retrieves the content from the input box.
   * @param {HTMLElement} inputBox - The input box element.
   * @returns {string} The content of the input box.
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

// Make class available globally
window.InputBoxHandler = InputBoxHandler;

})(); // End of IIFE wrapper
