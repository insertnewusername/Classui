// Background script handles all storage requests

function getFromArea(area, key) {
  return new Promise((resolve) => {
    if (!area) {
      resolve({});
      return;
    }
    area.get(key, (data) => {
      if (chrome.runtime?.lastError) {
        resolve({});
        return;
      }
      resolve(data || {});
    });
  });
}

function setToArea(area, payload) {
  return new Promise((resolve) => {
    if (!area) {
      resolve(false);
      return;
    }
    area.set(payload, () => {
      resolve(!chrome.runtime?.lastError);
    });
  });
}

async function getFromStorage(key, defaultValue = null) {
  const syncData = await getFromArea(chrome.storage?.sync, key);
  if (Object.prototype.hasOwnProperty.call(syncData, key)) {
    return syncData[key];
  }

  const localData = await getFromArea(chrome.storage?.local, key);
  if (Object.prototype.hasOwnProperty.call(localData, key)) {
    return localData[key];
  }

  return defaultValue;
}

async function setInStorage(key, value) {
  const payload = { [key]: value };
  await Promise.all([
    setToArea(chrome.storage?.sync, payload),
    setToArea(chrome.storage?.local, payload)
  ]);
}

async function getTitlesData() {
  const syncData = await getFromArea(chrome.storage?.sync, 'titles');
  if (syncData && syncData.titles && typeof syncData.titles === 'object') {
    return syncData.titles;
  }
  const localData = await getFromArea(chrome.storage?.local, 'titles');
  return (localData && localData.titles && typeof localData.titles === 'object') ? localData.titles : {};
}

async function setTitlesData(titles) {
  const payload = { titles };
  await Promise.all([
    setToArea(chrome.storage?.sync, payload),
    setToArea(chrome.storage?.local, payload)
  ]);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'getTitles') {
    getTitlesData()
      .then((titles) => sendResponse({ titles }))
      .catch(() => sendResponse({ titles: {} }));
    return true;
  }

  if (msg.action === 'setTitle' && msg.courseId) {
    getTitlesData()
      .then(async (titles) => {
        titles[msg.courseId] = msg.newTitle;
        await setTitlesData(titles);
        sendResponse({ success: true, titles });
      })
      .catch(() => sendResponse({ success: false }));
    return true;
  }

  if (msg.action === 'checkForExtensionUpdate') {
    runImmediateUpdateCheck()
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({
        success: false,
        status: 'error',
        error: error?.message || 'Unknown update error'
      }));
    return true;
  }

  if (msg.action === 'applyUpdate') {
    try {
      const pendingTabId = sender?.tab?.id;
      (async () => {
        if (Number.isInteger(pendingTabId) && pendingTabId > 0) {
          const existingTabIds = await getPendingReloadTabIds();
          if (!existingTabIds.includes(pendingTabId)) {
            await setPendingReloadTabIds([...existingTabIds, pendingTabId]);
          }
        }

        if (chrome.runtime && typeof chrome.runtime.reload === 'function') {
          sendResponse({ success: true });
          setTimeout(() => {
            chrome.runtime.reload();
          }, 0);
        } else {
          sendResponse({ success: false, error: 'reload unsupported' });
        }
      })().catch((e) => {
        sendResponse({ success: false, error: e?.message || 'reload failed' });
      });
    } catch (e) {
      sendResponse({ success: false, error: e?.message || 'reload failed' });
    }
    return true;
  }
});

const UPDATE_AVAILABLE_KEY = 'modernClassroom_updateAvailable';
const UPDATE_PENDING_VERSION_KEY = 'modernClassroom_updatePendingVersion';
const UPDATE_PREVIOUS_VERSION_KEY = 'modernClassroom_previousVersion';
const UPDATE_RELOAD_TAB_IDS_KEY = 'modernClassroom_pendingUpdateReloadTabIds';

async function getPendingReloadTabIds() {
  const data = await getFromArea(chrome.storage?.local, UPDATE_RELOAD_TAB_IDS_KEY);
  return Array.isArray(data?.[UPDATE_RELOAD_TAB_IDS_KEY]) ? data[UPDATE_RELOAD_TAB_IDS_KEY] : [];
}

async function setPendingReloadTabIds(tabIds) {
  const uniqueTabIds = Array.from(new Set((Array.isArray(tabIds) ? tabIds : [])
    .map((tabId) => Number(tabId))
    .filter((tabId) => Number.isInteger(tabId) && tabId > 0)));

  await setToArea(chrome.storage?.local, { [UPDATE_RELOAD_TAB_IDS_KEY]: uniqueTabIds });
}

async function clearPendingReloadTabIds() {
  await setToArea(chrome.storage?.local, { [UPDATE_RELOAD_TAB_IDS_KEY]: [] });
}

function requestRuntimeUpdateCheck() {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.runtime || typeof chrome.runtime.requestUpdateCheck !== 'function') {
      resolve({ status: 'unsupported' });
      return;
    }

    try {
      const maybePromise = chrome.runtime.requestUpdateCheck((status, details) => {
        if (chrome.runtime?.lastError) {
          resolve({
            status: 'error',
            error: chrome.runtime.lastError.message || 'Unknown update error'
          });
          return;
        }

        resolve({ status, details: details || null });
      });

      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise
          .then((status) => resolve({ status, details: null }))
          .catch((error) => resolve({
            status: 'error',
            error: error?.message || 'Unknown update error'
          }));
      }
    } catch (error) {
      resolve({
        status: 'error',
        error: error?.message || 'Unknown update error'
      });
    }
  });
}

async function runImmediateUpdateCheck() {
  const result = await requestRuntimeUpdateCheck();

  if (result.status === 'update_available') {
    return { success: true, status: 'update_available' };
  }

  if (result.status === 'no_update') {
    return { success: true, status: 'no_update' };
  }

  if (result.status === 'throttled') {
    return { success: true, status: 'throttled' };
  }

  return {
    success: false,
    status: result.status || 'error',
    error: result.error || null
  };
}

async function notifyTabsAboutUpdate() {
  const currentVersion = chrome.runtime?.getManifest?.().version || null;

  await Promise.all([
    setInStorage(UPDATE_AVAILABLE_KEY, true),
    setInStorage(UPDATE_PENDING_VERSION_KEY, currentVersion)
  ]);

  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      chrome.tabs.sendMessage(tab.id, { action: 'updateAvailable', version: currentVersion }).catch(() => {
        // Tab might not be accessible, that's okay
      });
    });
  });
}

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onInstalled) {
  chrome.runtime.onInstalled.addListener((details) => {
    const currentVersion = chrome.runtime?.getManifest?.().version || null;
    const updates = [
      setInStorage(UPDATE_AVAILABLE_KEY, false),
      setInStorage(UPDATE_PENDING_VERSION_KEY, null)
    ];

    if (details.reason === 'update') {
      updates.push(setInStorage(UPDATE_PREVIOUS_VERSION_KEY, details.previousVersion || null));
    } else if (details.reason === 'install') {
      updates.push(setInStorage(UPDATE_PREVIOUS_VERSION_KEY, null));
    }

    updates.push(setInStorage('modernClassroom_installedVersion', currentVersion));
    Promise.all(updates)
      .then(async () => {
        const tabIds = await getPendingReloadTabIds();
        await clearPendingReloadTabIds();

        if (details.reason === 'update') {
          tabIds.forEach((tabId) => {
            if (!Number.isInteger(tabId) || tabId <= 0) return;
            chrome.tabs.reload(tabId, () => {});
          });
        }
      })
      .catch(() => {});
  });
}

// UPDATE CHECKER - Check for extension updates from Chrome servers
function checkForUpdates() {
  runImmediateUpdateCheck()
    .then((result) => {
      if (result.status === 'update_available') {
        console.log('Modern Classroom update available');
        // Notify tabs so content scripts can prompt the user to apply the update
        try { notifyTabsAboutUpdate().catch(() => {}); } catch (_) {}
      }
    })
    .catch(() => {
      // Silent fail - update checking is optional
    });
}

// Listen for when an update is actually ready to install
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onUpdateAvailable) {
  chrome.runtime.onUpdateAvailable.addListener(() => {
    console.log('Modern Classroom update is ready to install');
    notifyTabsAboutUpdate().catch(() => {});
  });
}

// Check for updates when service worker starts
checkForUpdates();

// Check for updates periodically (every hour)
setInterval(() => {
  checkForUpdates();
}, 60 * 60 * 1000);