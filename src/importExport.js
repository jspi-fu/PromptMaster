// importExport.js

// COMMENT: Use unified prompt storage; remove dependency on prompts.js
import { exportPromptsJSON, importPrompts as storageImportPrompts } from './promptStorage.js';

// Export prompts from local storage as JSON
export async function exportPrompts() {
  const json = await exportPromptsJSON();
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

// Import prompts from a JSON file and merge with local prompts
export function importPrompts(file) {
  // COMMENT: Delegate to unified manager; callers should re-render via onPromptsChanged
  storageImportPrompts(file).catch(err => console.error('[PromptManager] Import failed:', err));
}
