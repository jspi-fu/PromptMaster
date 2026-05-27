import { importPrompts } from '../promptStorage.js';
import { t, initI18n } from '../i18n.js';

/**
 * 显示 toast 提示通知
 */
function showToast(message, duration = 3000) {
  const existing = document.querySelector('.pm-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'pm-toast';
  toast.textContent = message;
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '24px',
    left: '50%',
    transform: 'translateX(-50%) translateY(20px)',
    backgroundColor: '#fff',
    color: '#333',
    padding: '10px 20px',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    fontSize: '14px',
    zIndex: '2147483647',
    opacity: '0',
    transition: 'opacity 0.3s ease, transform 0.3s ease',
    pointerEvents: 'none',
    maxWidth: '90vw',
    textAlign: 'center'
  });
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

document.addEventListener('DOMContentLoaded', function () {
  initI18n();

  const permissionGrantedContainer = document.getElementById('permission-granted');
  const requestPermissionContainer = document.getElementById('request-permission');
  const getStartedBtnContainer = document.getElementById('get-started-btn-container');
  // 一键授权/撤销所有权限的控件
  const grantAllBtn = document.getElementById('grant-all-permissions');
  const removeAllBtn = document.getElementById('remove-all-permissions');

  if (!permissionGrantedContainer || !requestPermissionContainer) {
    console.error('Required container elements (#permission-granted or #request-permission) not found.');
    return;
  }

  function updateGetStartedButton(allowedProviders) {
    if (allowedProviders.length > 0 && getStartedBtnContainer) {
      // 优先使用内存中已有的 URL，避免额外请求和子目录路径问题
      let firstAllowedUrl = null;

      for (const allowed of allowedProviders) {
        if (allowed.providerInfo && allowed.providerInfo.url) {
          firstAllowedUrl = allowed.providerInfo.url;
          break;
        }
      }

      // 回退：若内存中无 URL，则从 JSON 文件获取以保持向后兼容
      const ensureUrlPromise = firstAllowedUrl
        ? Promise.resolve(firstAllowedUrl)
        : fetch(chrome.runtime.getURL('/llm_providers.json'))
          .then(response => response.json())
          .then(data => {
            const llmList = data.llm_providers || [];
            for (const allowed of allowedProviders) {
              const match = llmList.find(llm => llm.name === allowed.key);
              if (match && match.url) {
                return match.url;
              }
            }
            return null;
          });

      ensureUrlPromise.then(resolvedUrl => {
        if (resolvedUrl) {
          getStartedBtnContainer.innerHTML = `
            <div style="display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 16px; margin-top: 1.5rem;">
              <button id="get-started-best-practices-btn" class="custom-button" style="height: 46px; padding: 0 1.5rem; border-radius: 8px; font-size: 1rem; display: inline-flex; align-items: center; justify-content: center; gap: 8px; border: none; cursor: pointer; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; box-shadow: 0 4px 6px rgba(0,0,0,0.1); transition: transform 0.1s;">
                <img src="../icons/icon-button.png" alt="Icon" width="20" height="20" style="object-fit: cover; filter: brightness(0) invert(1);">
                <span style="font-weight: 500;">${t('startFromBestPractice')}</span>
              </button>
            </div>`;

          document.getElementById('get-started-best-practices-btn').addEventListener('click', async () => {
            try {
              const importUrl = chrome.runtime.getURL('/default-prompts.json');
              const response = await fetch(importUrl);
              if (response.ok) {
                const text = await response.json();
                await importPrompts(text);
                console.log('Successfully imported default prompts.');
              } else {
                console.warn('Failed to fetch default prompts:', response.status);
              }
            } catch (e) {
              console.error('Error importing default prompts:', e);
            }
            window.open(resolvedUrl, '_blank');
          });
        }
      });

    } else if (getStartedBtnContainer) {
      // 无已授权平台时显示引导标题，至少选择一个 LLM 后才会显示按钮
      getStartedBtnContainer.innerHTML = `<h3 class="custom-onboarding-title">${t('selectAIAssistants')}</h3>`;
    }
  }

  async function populateProviders(providersMap) {
    console.log('Populating UI with providers map:', providersMap);

    permissionGrantedContainer.innerHTML = '';
    requestPermissionContainer.innerHTML = '';

    const allowedProviders = [];

    let providersOrder = [];
    try {
      const response = await fetch(chrome.runtime.getURL('llm_providers.json'));
      if (response.ok) {
        const data = await response.json();
        providersOrder = (data.llm_providers || []).map(p => p.name);
      }
    } catch (error) {
      console.error('Failed to load llm_providers.json for ordering:', error);
    }

    const providersToDisplay = providersOrder.length > 0
      ? providersOrder.map(name => [name, providersMap[name]]).filter(([_, info]) => info)
      : Object.entries(providersMap);

    for (const [key, providerInfo] of providersToDisplay) {
      const iconUrl = providerInfo.iconUrl;
      const isAllowed = providerInfo.hasPermission === "Yes";

      // 已授权的平台：点击直接打开官网；未授权的平台：点击请求权限
      const elementHTML = isAllowed
        ? `<a id="perm-${key}" class="custom-button"
               aria-current="true" href="${providerInfo.url}" target="_blank" rel="noopener">
              <img src="${iconUrl}" alt="${key} icon" width="32" height="32" class="custom-rounded-circle">
              <span class="custom-mb-0">${key}</span>
            </a>`
        : `<a id="perm-${key}" class="custom-button"
               aria-current="true" href="#" data-provider="${key}" data-url-pattern="${providerInfo.urlPattern}">
              <img src="${iconUrl}" alt="${key} icon" width="32" height="32" class="custom-rounded-circle">
              <span class="custom-mb-0">${key}</span>
            </a>`;

      let targetContainer;
      let needsClickListener = false;

      if (providerInfo.hasPermission == "Yes") {
        targetContainer = permissionGrantedContainer;
        allowedProviders.push({ key, providerInfo });
      } else {
        targetContainer = requestPermissionContainer;
        needsClickListener = true;
      }

      targetContainer.insertAdjacentHTML('beforeend', elementHTML);

      if (needsClickListener) {
        const element = document.getElementById(`perm-${key}`);
        if (element) {
          const handleProviderClick = function (event) {
            event.preventDefault();

            const providerKey = this.dataset.provider;
            const originPattern = this.dataset.urlPattern;

            chrome.permissions.request({ origins: [originPattern] }, (granted) => {
              if (granted) {
                providersMap[providerKey].hasPermission = "Yes";
                chrome.storage.local.set({ aiProvidersMap: providersMap });
              } else {
                showToast(t('permissionDenied'));
              }
            });
          };
          element.addEventListener('click', handleProviderClick);
        }
      }
    }

    // 无已授权平台时隐藏"已授权"区域，保持界面整洁
    const allowedSectionContainer = permissionGrantedContainer.closest('.custom-container-mt5');
    if (allowedSectionContainer) {
      allowedSectionContainer.style.display = allowedProviders.length > 0 ? '' : 'none';
    }

    updateGetStartedButton(allowedProviders);
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.aiProvidersMap && changes.aiProvidersMap.newValue) {
      populateProviders(changes.aiProvidersMap.newValue);
    }
  });

  chrome.storage.local.get(['aiProvidersMap'], function (result) {
    if (result.aiProvidersMap) {
      const providersMap = result.aiProvidersMap;
      console.log('Retrieved providersMap from storage:', providersMap);

      populateProviders(providersMap);

    } else {
      console.log('No providersMap found in storage.');
      requestPermissionContainer.innerHTML = '<p>No provider data found in storage.</p>';
    }
  });

  // 一键授权：请求所有可选来源权限并更新 providers map
  if (grantAllBtn) {
    grantAllBtn.addEventListener('click', async () => {
      try {
        const response = await fetch(chrome.runtime.getURL('/llm_providers.json'));
        const data = await response.json();
        const llmList = data.llm_providers || [];

        const allPatterns = llmList
          .map(provider => provider.pattern)
          .filter(Boolean);

        if (allPatterns.length === 0) {
          showToast(t('noProviderPatterns'));
          return;
        }

        chrome.permissions.request({ origins: allPatterns }, async (granted) => {
          if (granted) {
            chrome.storage.local.get(['aiProvidersMap'], (res) => {
              const currentMap = res && res.aiProvidersMap ? res.aiProvidersMap : {};
              const updated = {};

              for (const provider of llmList) {
                const key = provider.name;
                if (currentMap[key]) {
                  updated[key] = {
                    ...currentMap[key],
                    hasPermission: 'Yes'
                  };
                } else {
                  updated[key] = {
                    hasPermission: 'Yes',
                    urlPattern: provider.pattern,
                    url: provider.url,
                    iconUrl: provider.icon_url || ''
                  };
                }
              }

              for (const [key, val] of Object.entries(currentMap)) {
                if (!updated[key]) {
                  updated[key] = val;
                }
              }

              chrome.storage.local.set({ aiProvidersMap: updated });
            });
          } else {
            showToast(t('permissionDenied'));
          }
        });
      } catch (error) {
        console.error('Failed to grant all permissions:', error);
        showToast(t('permissionError', [error.message]));
      }
    });
  }

  // 一键撤销：撤销所有可选来源权限并重置 providers map
  if (removeAllBtn) {
    removeAllBtn.addEventListener('click', () => {
      chrome.storage.local.get(['aiProvidersMap'], (res) => {
        const currentMap = res && res.aiProvidersMap ? res.aiProvidersMap : {};
        const allPatterns = Array.from(new Set(
          Object.values(currentMap)
            .map(v => v && v.urlPattern)
            .filter(Boolean)
        ));
        try {
          chrome.permissions.remove({ origins: allPatterns }, (removed) => {
            const updated = {};
            for (const [key, val] of Object.entries(currentMap)) {
              updated[key] = {
                ...val,
                hasPermission: 'No'
              };
            }
            chrome.storage.local.set({ aiProvidersMap: updated });
          });
        } catch (e) {
          // 出错时仍将状态重置为 "No"，用户可重新授权
          const updated = {};
          for (const [key, val] of Object.entries(currentMap)) {
            updated[key] = {
              ...val,
              hasPermission: 'No'
            };
          }
          chrome.storage.local.set({ aiProvidersMap: updated });
        }
      });
    });
  }

  const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (isDarkMode) {
    const headerIcon = document.getElementById('header-icon');
    if (headerIcon) {
      headerIcon.classList.add('dark-mode-icon');
    }
  }
});