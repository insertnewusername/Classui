/**
 * Storage Utilities for Modern Classroom Extension
 * Provides unified API for chrome.storage.sync with automatic migration from localStorage
 */

// Storage keys used throughout the extension
const STORAGE_KEYS = {
  // Sidebar controls
  HIDE_TODO: 'hideTodo',
  HIDE_CALENDAR: 'hideCalendar',
  SIDEBAR_SIZE: 'sidebarSize',
  SIDEBAR_HEIGHT_ADJUST: 'sidebarHeightAdjust',
  CLASSIC_SIDEBAR: 'classicSidebar',
  
  // Layout
  LAYOUT_MODE: 'layoutMode',
  
  // Decoration
  DECORATION_SELECTED: 'decoration:selected',
  DECORATION_CUSTOM: 'decoration:custom',
  
  // Card backgrounds
  CARD_BACKGROUNDS: 'modernClassroom_card_backgrounds',
  IMAGE_PICKER_POS: 'modernClassroom_imagePicker_pos',
  
  // Tutorial and updates
  TUTORIAL_SEEN: 'modernClassroom_tutorialSeen',
  UPDATE_VERSION: 'modernClassroom_updateVersion',
  UPDATE_DISMISSED_VERSION: 'modernClassroom_updateDismissedVersion',
  
  // Notes
  FLOATING_NOTES: 'modernClassroom_floatingNotes',
  STARRED_ASSIGNMENTS: 'modernClassroom_starredAssignments',
  
  // Homebar/Streamside
  STREAMSIDE_ENABLED: 'streamsideEnabled',
  HOME_MINI_WIDGET: 'homeMiniWidget',
  FOLDERS: 'modernClassroom_folders',
  
  // Timetable
  TIMETABLE_CLASSES: 'mcTimetableClasses',
  TIMETABLE_CLASSES_SHARED: 'mcTimetableClassesShared',
  TIMETABLE_PERIODS: 'mcTimetablePeriods',
  TIMETABLE_PERIODS_SHARED: 'mcTimetablePeriodsShared',
  TIMETABLE_CURRENT_INDEX: 'mcTimetableCurrentIndex',
  TIMETABLE_VIEW_RANGE: 'mcTimetableViewRange',
  
  // Dark mode
  DARK_MODE: 'modernGoogleClassroomDarkMode',
  
  // Titles (from background.js)
  TITLES: 'titles'
};

/**
 * Get a value from chrome.storage.sync
 * @param {string} key - Storage key
 * @param {*} defaultValue - Default value if key doesn't exist
 * @returns {Promise<*>} The stored value or default
 */
async function storageGet(key, defaultValue = null) {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) {
    // Fallback to localStorage
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return defaultValue;
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    } catch {
      return defaultValue;
    }
  }

  return new Promise((resolve) => {
    chrome.storage.sync.get([key], (result) => {
      if (chrome.runtime.lastError) {
        console.warn('storageGet error:', chrome.runtime.lastError);
        // Fall back to localStorage on error
        try {
          const raw = localStorage.getItem(key);
          if (raw !== null) {
            try {
              resolve(JSON.parse(raw));
            } catch {
              resolve(raw);
            }
            return;
          }
        } catch (e) {
          console.warn('localStorage fallback failed:', e);
        }
        resolve(defaultValue);
        return;
      }
      
      // If chrome.storage.sync has the value, use it and sync to localStorage
      if (result[key] !== undefined) {
        const syncValue = result[key];
        
        // Write sync value to localStorage to keep them in sync
        try {
          const stringValue = typeof syncValue === 'string' ? syncValue : JSON.stringify(syncValue);
          localStorage.setItem(key, stringValue);
        } catch (e) {
          console.warn('Failed to sync value to localStorage:', e);
        }
        
        resolve(syncValue);
        return;
      }
      
      // Otherwise, try localStorage as fallback (for unpacked extensions)
      try {
        const raw = localStorage.getItem(key);
        if (raw !== null) {
          try {
            resolve(JSON.parse(raw));
          } catch {
            resolve(raw);
          }
          return;
        }
      } catch (e) {
        console.warn('localStorage fallback failed:', e);
      }
      
      resolve(defaultValue);
    });
  });
}

/**
 * Set a value in chrome.storage.sync
 * @param {string} key - Storage key
 * @param {*} value - Value to store
 * @returns {Promise<void>}
 */
async function storageSet(key, value) {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) {
    // Fallback to localStorage
    try {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      localStorage.setItem(key, stringValue);
    } catch (e) {
      console.warn('localStorage.setItem failed:', e);
    }
    return;
  }

  // Write to both chrome.storage.sync and localStorage for redundancy
  // This ensures data persists even for unpacked extensions across reinstalls
  return new Promise((resolve) => {
    // First, save to localStorage immediately (synchronous backup)
    try {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      localStorage.setItem(key, stringValue);
    } catch (e) {
      console.warn('localStorage.setItem failed:', e);
    }
    
    // Then save to chrome.storage.sync for cross-device sync
    chrome.storage.sync.set({ [key]: value }, () => {
      if (chrome.runtime.lastError) {
        // This may fail for unpacked extensions, but localStorage backup is already saved
        console.debug('chrome.storage.sync.set info:', chrome.runtime.lastError.message);
      }
      resolve();
    });
  });
}

/**
 * Remove a key from chrome.storage.sync
 * @param {string} key - Storage key to remove
 * @returns {Promise<void>}
 */
async function storageRemove(key) {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn('localStorage.removeItem failed:', e);
    }
    return;
  }

  return new Promise((resolve) => {
    chrome.storage.sync.remove(key, () => {
      if (chrome.runtime.lastError) {
        console.warn('storageRemove error:', chrome.runtime.lastError);
      }
      resolve();
    });
  });
}

/**
 * Get multiple values from chrome.storage.sync
 * @param {string[]} keys - Array of storage keys
 * @returns {Promise<Object>} Object with key-value pairs
 */
async function storageGetMultiple(keys) {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) {
    const result = {};
    keys.forEach(key => {
      try {
        const raw = localStorage.getItem(key);
        if (raw !== null) {
          try {
            result[key] = JSON.parse(raw);
          } catch {
            result[key] = raw;
          }
        }
      } catch {
        // ignore
      }
    });
    return result;
  }

  return new Promise((resolve) => {
    chrome.storage.sync.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        console.warn('storageGetMultiple error:', chrome.runtime.lastError);
        // Fall back to localStorage on error
        const fallbackResult = {};
        keys.forEach(key => {
          try {
            const raw = localStorage.getItem(key);
            if (raw !== null) {
              try {
                fallbackResult[key] = JSON.parse(raw);
              } catch {
                fallbackResult[key] = raw;
              }
            }
          } catch {
            // ignore
          }
        });
        resolve(fallbackResult);
        return;
      }
      
      // Merge chrome.storage.sync results with localStorage fallback for missing keys
      const mergedResult = result || {};
      keys.forEach(key => {
        if (mergedResult[key] === undefined) {
          try {
            const raw = localStorage.getItem(key);
            if (raw !== null) {
              try {
                mergedResult[key] = JSON.parse(raw);
              } catch {
                mergedResult[key] = raw;
              }
            }
          } catch {
            // ignore
          }
        }
      });
      resolve(mergedResult);
    });
  });
}

/**
 * Set multiple values in chrome.storage.sync
 * @param {Object} items - Object with key-value pairs to store
 * @returns {Promise<void>}
 */
async function storageSetMultiple(items) {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) {
    Object.entries(items).forEach(([key, value]) => {
      try {
        const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
        localStorage.setItem(key, stringValue);
      } catch (e) {
        console.warn('localStorage.setItem failed:', e);
      }
    });
    return;
  }

  // Write to both chrome.storage.sync and localStorage for redundancy
  return new Promise((resolve) => {
    // First, save to localStorage immediately
    Object.entries(items).forEach(([key, value]) => {
      try {
        const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
        localStorage.setItem(key, stringValue);
      } catch (e) {
        console.warn('localStorage.setItem failed:', e);
      }
    });
    
    // Then save to chrome.storage.sync
    chrome.storage.sync.set(items, () => {
      if (chrome.runtime.lastError) {
        console.debug('chrome.storage.sync.set info:', chrome.runtime.lastError.message);
      }
      resolve();
    });
  });
}

/**
 * Get boolean value from storage
 * @param {string} key - Storage key
 * @param {boolean} defaultValue - Default value
 * @returns {Promise<boolean>}
 */
async function storageGetBool(key, defaultValue = false) {
  const value = await storageGet(key, defaultValue);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === 'true';
  return !!value;
}

/**
 * Set boolean value in storage
 * @param {string} key - Storage key
 * @param {boolean} value - Boolean value to store
 * @returns {Promise<void>}
 */
async function storageSetBool(key, value) {
  return storageSet(key, !!value);
}

/**
 * Migrate a single key from localStorage to chrome.storage.sync
 * @param {string} key - Storage key to migrate
 * @returns {Promise<boolean>} True if migration occurred
 */
async function migrateKey(key) {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) {
    return false;
  }

  return new Promise((resolve) => {
    // Check if already exists in chrome.storage.sync
    chrome.storage.sync.get([key], (syncData) => {
      if (chrome.runtime.lastError) {
        resolve(false);
        return;
      }

      // If already in sync storage, skip
      if (syncData[key] !== undefined) {
        resolve(false);
        return;
      }

      // Try to get from localStorage
      try {
        const localValue = localStorage.getItem(key);
        if (localValue !== null) {
          let parsedValue;
          try {
            parsedValue = JSON.parse(localValue);
          } catch {
            parsedValue = localValue;
          }

          // Save to sync storage
          chrome.storage.sync.set({ [key]: parsedValue }, () => {
            if (chrome.runtime.lastError) {
              console.warn(`Failed to migrate ${key}:`, chrome.runtime.lastError);
              resolve(false);
            } else {
              console.log(`Migrated ${key} to cloud sync storage`);
              resolve(true);
            }
          });
        } else {
          resolve(false);
        }
      } catch (e) {
        console.warn(`Error reading ${key} from localStorage:`, e);
        resolve(false);
      }
    });
  });
}

/**
 * Migrate all known keys from localStorage to chrome.storage.sync
 * This runs on every extension load to ensure data is synced from localStorage if present
 * @returns {Promise<void>}
 */
async function migrateAllToSync() {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) {
    console.log('Chrome storage API not available, skipping migration');
    return;
  }

  console.log('Checking for settings in localStorage to migrate...');
  
  // Collect static keys from STORAGE_KEYS
  const staticKeys = Object.values(STORAGE_KEYS);
  
  // Also scan localStorage for dynamic keys (timetable periods, icon colors, etc.)
  const dynamicKeys = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key.startsWith('mcTimetableClasses_') ||  // Timetable periods for different indices
        key.startsWith('dnaIconColors:')          // Icon color customizations per site
      )) {
        dynamicKeys.push(key);
      }
    }
  } catch (e) {
    console.warn('Error scanning localStorage for dynamic keys:', e);
  }
  
  const allKeys = [...staticKeys, ...dynamicKeys];
  let migratedCount = 0;

  // Always attempt migration - this handles fresh installs and ensures data integrity
  for (const key of allKeys) {
    const migrated = await migrateKey(key);
    if (migrated) migratedCount++;
  }

  if (migratedCount > 0) {
    console.log(`Migrated ${migratedCount} settings to cloud sync storage.`);
  } else {
    console.log('No settings needed migration.');
  }
}

// Export functions for use in other modules
if (typeof window !== 'undefined') {
  window.storageGet = storageGet;
  window.storageSet = storageSet;
  window.storageRemove = storageRemove;
  window.storageGetMultiple = storageGetMultiple;
  window.storageSetMultiple = storageSetMultiple;
  window.storageGetBool = storageGetBool;
  window.storageSetBool = storageSetBool;
  window.migrateAllToSync = migrateAllToSync;
  window.STORAGE_KEYS = STORAGE_KEYS;
}
