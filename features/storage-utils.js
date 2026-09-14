/**
 * Storage Utilities for Modern Classroom Extension
 * Keeps settings local to the browser while syncing a single portable JSON snapshot
 * to Chrome Sync using a write-through model.
 */

const STORAGE_KEYS = {
  HIDE_TODO: 'hideTodo',
  HIDE_CALENDAR: 'hideCalendar',
  HIDE_GEMINI: 'hideGemini',
  SIDEBAR_SIZE: 'sidebarSize',
  SIDEBAR_HEIGHT_ADJUST: 'sidebarHeightAdjust',
  CLASSIC_SIDEBAR: 'classicSidebar',
  LAYOUT_MODE: 'layoutMode',
  DECORATION_SELECTED: 'decoration:selected',
  DECORATION_CUSTOM: 'decoration:custom',
  DECORATION_INVERT: 'decoration:invert',
  CARD_BACKGROUNDS: 'modernClassroom_card_backgrounds',
  IMAGE_PICKER_POS: 'modernClassroom_imagePicker_pos',
  TUTORIAL_SEEN: 'modernClassroom_tutorialSeen',
  UPDATE_VERSION: 'modernClassroom_updateVersion',
  UPDATE_DISMISSED_VERSION: 'modernClassroom_updateDismissedVersion',
  FLOATING_NOTES: 'modernClassroom_floatingNotes',
  STARRED_ASSIGNMENTS: 'modernClassroom_starredAssignments',
  STREAMSIDE_ENABLED: 'streamsideEnabled',
  HOME_MINI_WIDGET: 'homeMiniWidget',
  HOME_WIDGET_WIDTH: 'homeWidgetWidth',
  HOME_WIDGET_WIDTH_MODE: 'homeWidgetWidthMode',
  FOLDERS: 'modernClassroom_folders',
  TIMETABLE_CLASSES: 'mcTimetableClasses',
  TIMETABLE_CLASSES_SHARED: 'mcTimetableClassesShared',
  TIMETABLE_PERIODS: 'mcTimetablePeriods',
  TIMETABLE_PERIODS_SHARED: 'mcTimetablePeriodsShared',
  TIMETABLE_CURRENT_INDEX: 'mcTimetableCurrentIndex',
  TIMETABLE_VIEW_RANGE: 'mcTimetableViewRange',
  DARK_MODE: 'modernGoogleClassroomDarkMode',
  TITLES: 'titles'
};

const CLOUD_STATE_KEY = 'modernClassroom_cloudState_v1';
const CLOUD_STATE_MANIFEST_KEY = 'modernClassroom_cloudState_v1_manifest';
const CLOUD_STATE_CHUNK_PREFIX = 'modernClassroom_cloudState_v1_chunk_';
const CLOUD_STATE_CHUNK_SIZE = 7000;
const CLOUD_STATE_LAST_APPLIED_KEY = 'modernClassroom_cloudState_lastAppliedAt';
const CLOUD_STATE_LAST_SYNCED_KEY = 'modernClassroom_cloudState_lastSyncedAt';
const EXCLUDED_SYNC_KEYS = new Set([
  'customIcons',
  'decoration:custom',
  CLOUD_STATE_KEY,
  CLOUD_STATE_LAST_APPLIED_KEY,
  CLOUD_STATE_LAST_SYNCED_KEY
]);
let cloudWriteChain = Promise.resolve();
let portableImportInProgress = false;
let cloudHydrationPromise = null;

function safeJsonParse(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function readLocalStorageValue(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return undefined;
    return safeJsonParse(raw);
  } catch {
    return undefined;
  }
}

function writeLocalStorageValue(key, value) {
  if (!key || EXCLUDED_SYNC_KEYS.has(key)) return false;
  try {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    localStorage.setItem(key, stringValue);
    return true;
  } catch (e) {
    console.warn('localStorage.setItem failed:', e);
    return false;
  }
}

function queueCloudWrite() {
  if (typeof window === 'undefined') return;
  if (window.__modernClassroomCloudWriteTimer) return;
  window.__modernClassroomCloudWriteTimer = setTimeout(async () => {
    window.__modernClassroomCloudWriteTimer = null;
    try {
      await writeCloudStateSnapshot();
    } catch (_) {}
  }, 0);
}

function collectSyncSnapshot() {
  const snapshot = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || EXCLUDED_SYNC_KEYS.has(key)) continue;
    const value = readLocalStorageValue(key);
    if (typeof value !== 'undefined') {
      snapshot[key] = value;
    }
  }
  return snapshot;
}

function readChromeStorageArea(area) {
  if (typeof chrome === 'undefined' || !chrome.storage?.[area]) return Promise.resolve({});
  return new Promise((resolve) => {
    chrome.storage[area].get(null, (items) => resolve(items || {}));
  });
}

function portableTextHash(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return (hash >>> 0).toString(36);
}

function splitCloudState(serialized) {
  const encoder = new TextEncoder();
  const chunks = [];
  let current = '';
  let currentBytes = 0;

  for (const character of serialized) {
    const characterBytes = encoder.encode(character).length;
    if (current && currentBytes + characterBytes > CLOUD_STATE_CHUNK_SIZE) {
      chunks.push(current);
      current = '';
      currentBytes = 0;
    }
    current += character;
    currentBytes += characterBytes;
  }

  if (current) chunks.push(current);
  return chunks;
}

function addPortableClassAliases(snapshot) {
  if (typeof document === 'undefined' || typeof location === 'undefined') return;
  const baseKey = `dnaIconColors:${location.origin}`;
  const maps = [snapshot[baseKey], snapshot[`${baseKey}:icons`]];
  if (!maps.some((map) => map && typeof map === 'object' && !Array.isArray(map))) return;

  document.querySelectorAll('.kWQ5wd').forEach((icon) => {
    const anchor = icon.closest('a[href]');
    if (!anchor) return;
    const label = String(anchor.getAttribute('aria-label') || anchor.textContent || '').replace(/\s+/g, ' ').trim();
    if (!label) return;
    const courseMatch = anchor.href.match(/\/c\/([^/?#]+)/);
    if (!courseMatch) return;
    const labelKey = `class-label:${portableTextHash(label.toLowerCase())}`;

    maps.forEach((map) => {
      if (!map || typeof map !== 'object' || Array.isArray(map) || map[labelKey]) return;
      const matchingKey = Object.keys(map).find((key) => {
        if (!key.startsWith('course:') && !key.startsWith('href:')) return false;
        const savedCourse = key.startsWith('course:') ? key.slice(7) : key.slice(5).match(/\/c\/([^/?#]+)/)?.[1];
        return savedCourse === courseMatch[1];
      });
      if (matchingKey && map[matchingKey]) map[labelKey] = map[matchingKey];
    });
  });
}

async function buildPortableExportPayload() {
  const [chromeLocal, chromeSync] = await Promise.all([
    readChromeStorageArea('local'),
    readChromeStorageArea('sync')
  ]);
  const localStorageSnapshot = collectSyncSnapshot();
  const customIcons = readLocalStorageValue('customIcons');
  if (typeof customIcons !== 'undefined') localStorageSnapshot.customIcons = customIcons;
  addPortableClassAliases(localStorageSnapshot);

  return {
    format: 'modern-classroom-customisations',
    version: 2,
    exportedAt: new Date().toISOString(),
    localStorage: localStorageSnapshot,
    chromeStorage: {
      local: chromeLocal,
      sync: chromeSync
    }
  };
}

async function applyPortableExportPayload(payload) {
  if (!payload || payload.format !== 'modern-classroom-customisations' ||
      ![1, 2].includes(payload.version)) {
    return false;
  }

  portableImportInProgress = true;
  try {
    const data = payload.version === 1 ? payload.data : payload.localStorage;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;

    Object.entries(data).forEach(([key, value]) => {
      if (!key || EXCLUDED_SYNC_KEYS.has(key)) return;
      try {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      } catch (_) {}
    });

    if (Object.prototype.hasOwnProperty.call(data, 'customIcons')) {
      try { localStorage.setItem('customIcons', JSON.stringify(data.customIcons)); } catch (_) {}
    }

    let customDecoration;
    if (payload.version === 1 && Object.prototype.hasOwnProperty.call(data, 'decoration:custom')) {
      customDecoration = data['decoration:custom'];
    } else if (payload.version === 2 && payload.chromeStorage?.local &&
        Object.prototype.hasOwnProperty.call(payload.chromeStorage.local, 'decoration:custom')) {
      customDecoration = payload.chromeStorage.local['decoration:custom'];
    }

    if (typeof customDecoration !== 'undefined' && typeof chrome !== 'undefined' && chrome.storage?.local) {
      await new Promise((resolve) => {
        if (typeof customDecoration === 'string' && customDecoration) {
          chrome.storage.local.set({ 'decoration:custom': customDecoration }, resolve);
        } else {
          chrome.storage.local.remove('decoration:custom', resolve);
        }
      });
    }

    await writeCloudStateSnapshot();
    try {
      localStorage.setItem(CLOUD_STATE_LAST_APPLIED_KEY, JSON.stringify(new Date().toISOString()));
    } catch (_) {}
    return true;
  } finally {
    portableImportInProgress = false;
  }
}

async function readRemoteCloudState() {
  if (!chrome?.storage?.sync) return null;
  return new Promise((resolve) => {
    chrome.storage.sync.get([CLOUD_STATE_KEY, CLOUD_STATE_MANIFEST_KEY], (items) => {
      if (chrome.runtime?.lastError || !items) {
        resolve(null);
        return;
      }

      const manifest = items[CLOUD_STATE_MANIFEST_KEY];
      if (manifest && Number.isInteger(manifest.chunkCount) && manifest.chunkCount > 0) {
        const chunkKeys = Array.from(
          { length: manifest.chunkCount },
          (_, index) => `${CLOUD_STATE_CHUNK_PREFIX}${index}`
        );
        chrome.storage.sync.get(chunkKeys, (chunks) => {
          if (chrome.runtime?.lastError || !chunks) {
            resolve(null);
            return;
          }

          const serialized = chunkKeys.map((key) => chunks[key]).join('');
          try {
            const parsed = JSON.parse(serialized);
            resolve(parsed && parsed.data ? parsed : null);
          } catch {
            resolve(null);
          }
        });
        return;
      }

      try {
        const parsed = JSON.parse(items[CLOUD_STATE_KEY]);
        resolve(parsed && parsed.data ? parsed : null);
      } catch {
        resolve(null);
      }
    });
  });
}

async function readRemoteCloudValue(key, defaultValue = undefined) {
  const state = await readRemoteCloudState();
  if (!state || typeof state !== 'object' || !state.data || typeof state.data !== 'object') {
    return defaultValue;
  }

  if (Object.prototype.hasOwnProperty.call(state.data, key)) {
    return state.data[key];
  }

  return defaultValue;
}

async function writeCloudStateSnapshotNow() {
  if (!chrome?.storage?.sync) return false;

  const snapshot = collectSyncSnapshot();
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: snapshot
  };

  const guarded = !!window && !!window.__modernClassroomCloudSyncGuard;
  if (!guarded) {
    window.__modernClassroomCloudSyncGuard = true;
  }

  try {
    const serialized = JSON.stringify(payload);
    const chunks = splitCloudState(serialized);

    const chunkPayload = {};
    chunks.forEach((chunk, index) => {
      chunkPayload[`${CLOUD_STATE_CHUNK_PREFIX}${index}`] = chunk;
    });

    const ok = await new Promise((resolve) => {
      chrome.storage.sync.get(CLOUD_STATE_MANIFEST_KEY, (existingItems) => {
        const existingManifest = existingItems?.[CLOUD_STATE_MANIFEST_KEY];
        chrome.storage.sync.set(chunkPayload, () => {
          if (chrome.runtime?.lastError) {
            resolve(false);
            return;
          }

          chrome.storage.sync.set({
            [CLOUD_STATE_MANIFEST_KEY]: {
              version: 1,
              chunkCount: chunks.length,
              exportedAt: payload.exportedAt
            }
          }, () => {
            if (chrome.runtime?.lastError) {
              resolve(false);
              return;
            }

            const staleChunkKeys = [];
            if (Number.isInteger(existingManifest?.chunkCount)) {
              for (let index = chunks.length; index < existingManifest.chunkCount; index += 1) {
                staleChunkKeys.push(`${CLOUD_STATE_CHUNK_PREFIX}${index}`);
              }
            }
            staleChunkKeys.push(CLOUD_STATE_KEY);
            if (staleChunkKeys.length) {
              chrome.storage.sync.remove(staleChunkKeys, () => resolve(!chrome.runtime?.lastError));
            } else {
              resolve(true);
            }
          });
        });
      });
    });

    if (ok) {
      try {
        localStorage.setItem(CLOUD_STATE_LAST_SYNCED_KEY, JSON.stringify(payload.exportedAt));
      } catch (_) {}
    }

    return ok;
  } finally {
    if (!guarded) {
      delete window.__modernClassroomCloudSyncGuard;
    }
  }
}

function writeCloudStateSnapshot() {
  const write = cloudWriteChain
    .catch(() => {})
    .then(() => writeCloudStateSnapshotNow());
  cloudWriteChain = write;
  return write;
}

function applyCloudPayload(payload) {
  if (!payload || typeof payload !== 'object' || !payload.data || typeof payload.data !== 'object') {
    return false;
  }

  let changed = false;
  Object.entries(payload.data).forEach(([key, value]) => {
    if (!key || EXCLUDED_SYNC_KEYS.has(key)) return;
    const current = readLocalStorageValue(key);
    if (JSON.stringify(current) !== JSON.stringify(value)) {
      if (writeLocalStorageValue(key, value)) {
        changed = true;
      }
    }
  });

  const keysToRemove = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || EXCLUDED_SYNC_KEYS.has(key)) continue;
    if (!Object.prototype.hasOwnProperty.call(payload.data, key)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => {
    try {
      localStorage.removeItem(key);
      changed = true;
    } catch (_) {}
  });

  if (payload.exportedAt) {
    try {
      localStorage.setItem(CLOUD_STATE_LAST_APPLIED_KEY, JSON.stringify(payload.exportedAt));
    } catch (_) {}
  }

  return changed;
}

async function hydrateFromCloudState() {
  if (portableImportInProgress) return false;
  if (cloudHydrationPromise) return cloudHydrationPromise;

  cloudHydrationPromise = (async () => {
    const state = await readRemoteCloudState();
    if (portableImportInProgress) return false;
    if (!state || typeof state !== 'object' || !state.data || typeof state.data !== 'object') {
      return false;
    }

    const lastAppliedRaw = localStorage.getItem(CLOUD_STATE_LAST_APPLIED_KEY);
    const lastApplied = lastAppliedRaw ? safeJsonParse(lastAppliedRaw) : null;
    const thisExportAt = state.exportedAt || null;

    if (thisExportAt && lastApplied && new Date(thisExportAt).getTime() <= new Date(lastApplied).getTime()) {
      return false;
    }

    return applyCloudPayload(state);
  })();

  try {
    return await cloudHydrationPromise;
  } finally {
    cloudHydrationPromise = null;
  }
}

async function storageGet(key, defaultValue = null) {
  try {
    const localValue = readLocalStorageValue(key);
    if (typeof localValue !== 'undefined') return localValue;
  } catch {}

  const remoteValue = await readRemoteCloudValue(key, undefined);
  if (typeof remoteValue !== 'undefined') return remoteValue;

  return defaultValue;
}

async function storageSet(key, value) {
  if (!key || EXCLUDED_SYNC_KEYS.has(key)) return;
  const didWrite = writeLocalStorageValue(key, value);
  if (didWrite) {
    queueCloudWrite();
  }
}

async function storageRemove(key) {
  if (!key || EXCLUDED_SYNC_KEYS.has(key)) return;
  try {
    localStorage.removeItem(key);
    queueCloudWrite();
  } catch (e) {
    console.warn('localStorage.removeItem failed:', e);
  }
}

async function storageGetMultiple(keys) {
  const result = {};
  for (const key of keys) {
    const value = await storageGet(key, undefined);
    if (typeof value !== 'undefined') {
      result[key] = value;
    }
  }
  return result;
}

async function storageSetMultiple(items) {
  const entries = Object.entries(items || {});
  for (const [key, value] of entries) {
    await storageSet(key, value);
  }
}

async function storageGetBool(key, defaultValue = false) {
  const value = await storageGet(key, defaultValue);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === 'true';
  return !!value;
}

async function storageSetBool(key, value) {
  return storageSet(key, !!value);
}

if (typeof Storage !== 'undefined') {
  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;

  Storage.prototype.setItem = function patchedSetItem(key, value) {
    const isLocalTarget = this === localStorage && typeof key === 'string';
    const result = originalSetItem.call(this, key, value);
    if (isLocalTarget && !EXCLUDED_SYNC_KEYS.has(key) && !window.__modernClassroomCloudSyncGuard) {
      queueCloudWrite();
    }
    return result;
  };

  Storage.prototype.removeItem = function patchedRemoveItem(key) {
    const isLocalTarget = this === localStorage && typeof key === 'string';
    const result = originalRemoveItem.call(this, key);
    if (isLocalTarget && !EXCLUDED_SYNC_KEYS.has(key) && !window.__modernClassroomCloudSyncGuard) {
      queueCloudWrite();
    }
    return result;
  };
}

if (typeof window !== 'undefined') {
  window.storageGet = storageGet;
  window.storageSet = storageSet;
  window.storageRemove = storageRemove;
  window.storageGetMultiple = storageGetMultiple;
  window.storageSetMultiple = storageSetMultiple;
  window.storageGetBool = storageGetBool;
  window.storageSetBool = storageSetBool;
  window.STORAGE_KEYS = STORAGE_KEYS;
  window.hydrateFromCloudState = hydrateFromCloudState;
  window.writeCloudStateSnapshot = writeCloudStateSnapshot;
  window.applyCloudPayload = applyCloudPayload;
  window.buildPortableExportPayload = buildPortableExportPayload;
  window.applyPortableExportPayload = applyPortableExportPayload;

  const initialCloudHydration = hydrateFromCloudState().catch(() => false);
  window.__modernClassroomInitialCloudHydration = initialCloudHydration;

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => initialCloudHydration, { once: true });
  }
}
