// Apply archived classes visibility on page load based on saved state
(function applyArchivedClassesState() {
  const ARCHIVED_SELECTOR = '[aria-label="Archived classes"], [aria-label="Archived Classes"], [aria-label="Clases archivadas"], [aria-label="Classes archivées"], [aria-label="Archivierte Kurse"], [aria-label="Aulas arquivadas"], [aria-label="Classi archiviate"], [aria-label="Gearchiveerde klassen"], [aria-label="Архивные классы"], [aria-label="已归档的课程"], [aria-label="已封存的課程"], [aria-label="アーカイブされたクラス"], [aria-label="보관된 클래스"]';

  function applyArchivedState(hidden) {
    const archivedElement = document.querySelector(ARCHIVED_SELECTOR);
    if (!archivedElement) return;

    archivedElement.style.display = hidden ? 'none' : '';
    try {
      if (hidden) document.body.classList.add('archived-hidden');
      else document.body.classList.remove('archived-hidden');
    } catch (e) {}
  }

  (function checkAndApplyArchivedState(retries = 0) {
    let hidden = false;
    try {
      const raw = localStorage.getItem('hideArchived');
      hidden = raw === 'true' || raw === true;
    } catch (e) {}

    if (document.querySelector(ARCHIVED_SELECTOR)) {
      applyArchivedState(hidden);
      return;
    }
  })();

  if (typeof MutationObserver === 'function' && document.documentElement) {
    const observer = new MutationObserver((mutations) => {
      let shouldApply = false;
      let hidden = false;

      try {
        const raw = localStorage.getItem('hideArchived');
        hidden = raw === 'true' || raw === true;
      } catch (e) {}

      if (!hidden) return;

      for (const mutation of mutations) {
        if (mutation.type !== 'childList') continue;
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches(ARCHIVED_SELECTOR) || node.querySelector(ARCHIVED_SELECTOR)) {
            shouldApply = true;
            break;
          }
        }
        if (shouldApply) break;
      }

      if (shouldApply) applyArchivedState(true);
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();

// Optionally expand all sidebar items when hovering over the sidebar container.
(function setupSidebarHoverExpandPreference() {
  const SIDEBAR_HOVER_EXPAND_KEY = 'sidebarExpandAllHover';

  function applySidebarHoverExpand(enabled) {
    const apply = () => {
      if (!document.body) return;
      document.body.classList.toggle('sidebar-expand-all-hover', !!enabled);
    };

    if (document.body) apply();
    else document.addEventListener('DOMContentLoaded', apply, { once: true });
  }

  let localValue = false;
  try {
    const raw = localStorage.getItem(SIDEBAR_HOVER_EXPAND_KEY);
    localValue = raw === 'true' || raw === true;
  } catch (_) {}
  applySidebarHoverExpand(localValue);

  if (typeof storageGet === 'function') {
    storageGet(SIDEBAR_HOVER_EXPAND_KEY, localValue).then(syncValue => {
      applySidebarHoverExpand(!!syncValue);
    }).catch(() => {});
  }

  window.addEventListener('mgc-sidebar-hover-expand-changed', (event) => {
    const enabled = !!(event && event.detail && event.detail.enabled);
    applySidebarHoverExpand(enabled);
  });
})();

// Keep .aBPWdf width in sync with the live .rknsod width in selected sidebar modes.
(function syncSidebarWrapperWidthToShell() {
  const WIDTH_VAR = '--mgc-sidebar-shell-width';
  const TARGET_WRAPPER_SELECTOR = '#yDmH0d > div:nth-child(3) > div.ZYus1c > div.lATaOd > div';

  function shouldSync() {
    return !!document.body && (
      document.body.classList.contains('classic-sidebar') ||
      document.body.classList.contains('sidebar-expand-all-hover')
    );
  }

  function updateWidth() {
    if (!document.documentElement) return;

    const targetWrapper = document.querySelector(TARGET_WRAPPER_SELECTOR);

    if (!shouldSync()) {
      document.documentElement.style.removeProperty(WIDTH_VAR);
      if (targetWrapper) {
        targetWrapper.style.removeProperty('width');
        targetWrapper.style.removeProperty('flex');
      }
      return;
    }

    const shell = document.querySelector('.rknsod');
    if (!shell) return;
    const rect = shell.getBoundingClientRect();
    const width = Math.max(0, Math.round(rect.width));
    if (width > 0) {
      document.documentElement.style.setProperty(WIDTH_VAR, `${width}px`);
      if (targetWrapper) {
        targetWrapper.style.setProperty('width', `${width}px`, 'important');
        targetWrapper.style.setProperty('flex', 'none', 'important');
      }
    }
  }

  const debouncedUpdate = (() => {
    let timer;
    return () => {
      clearTimeout(timer);
      timer = setTimeout(updateWidth, 40);
    };
  })();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      updateWidth();
      setTimeout(updateWidth, 120);
      setTimeout(updateWidth, 400);
    }, { once: true });
  } else {
    updateWidth();
    setTimeout(updateWidth, 120);
    setTimeout(updateWidth, 400);
  }

  window.addEventListener('resize', debouncedUpdate);
  window.addEventListener('mgc-sidebar-hover-expand-changed', debouncedUpdate);

  try {
    const observer = new MutationObserver(debouncedUpdate);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });
  } catch (_) {}
})();

// Replace native Classroom sidebar SVG icons with packaged extension icons.
(function replaceNativeSettingsIcon() {
  const SIDEBAR_NEW_ICONS_KEY = 'sidebarUseNewIcons';
  const SETTINGS_PATH_PREFIX = 'M13.85 22.25h-3.7';
  const HOME_PATH_PREFIX = 'M12 3L4 9v12h16V9l-8-6';
  const TODO_PATH_PREFIX = 'M20,3H4C2.9,3,2,3.9,2,5v14c0,1.1,0.9,2,2,2h16c1.1,0,2-0.9,2-2V5';
  const ARCHIVE_PATH_PREFIX = 'M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55';
  const CALENDAR_PATH_PREFIX = 'M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20';
  const REPLACEMENT_ICON_SIZE = '20px';
  const SETTINGS_ICON_SIZE = '22px';
  const settingsIconUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
    ? chrome.runtime.getURL('Icons/newsettings.svg')
    : 'Icons/newsettings.svg';
  const homeIconUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
    ? chrome.runtime.getURL('Icons/newhome.svg')
    : 'Icons/newhome.svg';
  const todoIconUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
    ? chrome.runtime.getURL('Icons/newtodo.svg')
    : 'Icons/newtodo.svg';
  const archiveIconUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
    ? chrome.runtime.getURL('Icons/newarchive.svg')
    : 'Icons/newarchive.svg';
  const calendarIconUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
    ? chrome.runtime.getURL('Icons/newcalendar.svg')
    : 'Icons/newcalendar.svg';
  let useNewSidebarIcons = true;
  let replaceScheduled = false;

  function setIconMode(enabled) {
    useNewSidebarIcons = !!enabled;
    try {
      if (document.body) document.body.classList.toggle('mgc-use-new-sidebar-icons', useNewSidebarIcons);
    } catch (_) {}
  }

  function createSvgFromMarkup(markup) {
    try {
      const template = document.createElement('template');
      template.innerHTML = markup.trim();
      const svg = template.content.firstElementChild;
      return svg instanceof SVGElement ? svg : null;
    } catch (_) {
      return null;
    }
  }

  function isTargetSettingsSvg(svg) {
    if (!(svg instanceof SVGElement)) return false;
    const path = svg.querySelector('path');
    const circle = svg.querySelector('circle[cx="12"][cy="12"][r="3.5"]');
    if (!path || !circle) return false;
    const d = path.getAttribute('d') || '';
    return d.startsWith(SETTINGS_PATH_PREFIX);
  }

  function isTargetHomeSvg(svg) {
    if (!(svg instanceof SVGElement)) return false;
    const path = svg.querySelector('path');
    if (!path || svg.querySelector('circle')) return false;
    const d = path.getAttribute('d') || '';
    return d.startsWith(HOME_PATH_PREFIX);
  }

  function isTargetTodoSvg(svg) {
    if (!(svg instanceof SVGElement)) return false;
    const path = svg.querySelector('path');
    const polygon = svg.querySelector('polygon');
    const d = path ? (path.getAttribute('d') || '') : '';
    if (!path || !polygon) return false;
    return d.startsWith(TODO_PATH_PREFIX);
  }

  function isTargetArchiveSvg(svg) {
    if (!(svg instanceof SVGElement)) return false;
    const path = svg.querySelector('path');
    if (!path || svg.querySelector('circle') || svg.querySelector('polygon')) return false;
    const d = path.getAttribute('d') || '';
    return d.startsWith(ARCHIVE_PATH_PREFIX);
  }

  function isTargetCalendarSvg(svg) {
    if (!(svg instanceof SVGElement)) return false;
    const path = svg.querySelector('path');
    if (!path || svg.querySelector('circle') || svg.querySelector('polygon')) return false;
    const d = path.getAttribute('d') || '';
    return d.startsWith(CALENDAR_PATH_PREFIX);
  }

  function replaceMatchingIcons() {
    if (!useNewSidebarIcons) {
      const replacedIcons = document.querySelectorAll(
        '.mgc-settings-icon-replacement, .mgc-home-icon-replacement, .mgc-todo-icon-replacement, .mgc-archive-icon-replacement, .mgc-calendar-icon-replacement'
      );
      replacedIcons.forEach(img => {
        const originalSvg = img.getAttribute('data-mgc-original-svg');
        if (!originalSvg) return;
        const svg = createSvgFromMarkup(originalSvg);
        if (svg) img.replaceWith(svg);
      });
      return;
    }

    const svgs = document.querySelectorAll('svg.NMm5M, svg[class*="NMm5M"]');
    svgs.forEach(svg => {
      let iconUrl = '';
      let replacementClass = '';
      let iconSize = REPLACEMENT_ICON_SIZE;

      if (isTargetSettingsSvg(svg)) {
        iconUrl = settingsIconUrl;
        replacementClass = 'mgc-settings-icon-replacement';
        iconSize = SETTINGS_ICON_SIZE;
      } else if (isTargetHomeSvg(svg)) {
        iconUrl = homeIconUrl;
        replacementClass = 'mgc-home-icon-replacement';
      } else if (isTargetTodoSvg(svg)) {
        iconUrl = todoIconUrl;
        replacementClass = 'mgc-todo-icon-replacement';
      } else if (isTargetArchiveSvg(svg)) {
        iconUrl = archiveIconUrl;
        replacementClass = 'mgc-archive-icon-replacement';
      } else if (isTargetCalendarSvg(svg)) {
        iconUrl = calendarIconUrl;
        replacementClass = 'mgc-calendar-icon-replacement';
      } else {
        return;
      }

      const img = document.createElement('img');
      img.className = replacementClass;
      img.src = iconUrl;
      img.alt = '';
      img.setAttribute('aria-hidden', 'true');
      img.style.width = iconSize;
      img.style.height = iconSize;
      img.style.display = 'block';
      img.style.pointerEvents = 'none';
      img.setAttribute('data-mgc-original-svg', svg.outerHTML);

      svg.replaceWith(img);
    });
  }

  function scheduleReplaceMatchingIcons() {
    if (replaceScheduled) return;
    replaceScheduled = true;
    const run = () => {
      replaceScheduled = false;
      replaceMatchingIcons();
    };

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(run);
      return;
    }

    setTimeout(run, 16);
  }

  function nodeHasSidebarIcon(node) {
    if (!(node instanceof Element)) return false;
    if (node.matches('svg.NMm5M, svg[class*="NMm5M"]')) return true;
    return !!node.querySelector('svg.NMm5M, svg[class*="NMm5M"]');
  }

  // Load saved icon mode from localStorage immediately, then sync storage in background.
  try {
    const raw = localStorage.getItem(SIDEBAR_NEW_ICONS_KEY);
    if (raw !== null) setIconMode(raw !== 'false');
    else setIconMode(true);
  } catch (_) {
    setIconMode(true);
  }

  if (typeof storageGet === 'function') {
    storageGet(SIDEBAR_NEW_ICONS_KEY, true).then(syncValue => {
      setIconMode(!!syncValue);
      scheduleReplaceMatchingIcons();
    }).catch(() => {});
  }

  window.addEventListener('mgc-sidebar-icon-style-changed', (event) => {
    const enabled = !!(event && event.detail && event.detail.useNewIcons);
    setIconMode(enabled);
    scheduleReplaceMatchingIcons();
  });

  scheduleReplaceMatchingIcons();

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== 'childList') continue;
      for (const node of mutation.addedNodes) {
        if (nodeHasSidebarIcon(node)) {
          scheduleReplaceMatchingIcons();
          return;
        }
      }
    }
  });

  if (document.documentElement) {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();

function setupToggle(inputId, selector, storageKey, cssClass) {
  const toggle = document.querySelector(inputId);
  if (!toggle) return;

  const applyState = (hidden) => {
    const target = document.querySelector(selector);
    if (target) target.style.display = hidden ? 'none' : '';
    toggle.checked = !hidden;
    if (cssClass) document.body.classList.toggle(cssClass, hidden);
  };

  const readLocalHidden = () => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw === 'true' || raw === true;
    } catch (_) {
      return false;
    }
  };

  let hidden = readLocalHidden();
  applyState(hidden);

  if (typeof storageGet === 'function') {
    storageGet(storageKey, false).then(syncHidden => {
      const normalized = !!syncHidden;
      if (normalized === hidden) return;
      hidden = normalized;
      applyState(hidden);
    }).catch(() => {});
  }

  if (typeof MutationObserver === 'function' && document.documentElement) {
    const observer = new MutationObserver((mutations) => {
      if (!hidden) return;

      for (const mutation of mutations) {
        if (mutation.type !== 'childList') continue;
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches(selector) || node.querySelector(selector)) {
            applyState(hidden);
            return;
          }
        }
      }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  toggle.addEventListener('change', () => {
    hidden = !toggle.checked;
    applyState(hidden);
    if (typeof storageSet === 'function') {
      storageSet(storageKey, hidden);
    } else {
      try { localStorage.setItem(storageKey, hidden ? 'true' : 'false'); } catch (_) {}
    }
  });
}

function setupToggleButton(buttonId, selector, storageKey, cssClass) {
  const button = document.querySelector(buttonId);
  const target = document.querySelector(selector);
  if (!button || !target) return;

  const applyState = (hidden) => {
    target.style.display = hidden ? 'none' : '';
    button.classList.toggle('active', !hidden);
    if (cssClass) document.body.classList.toggle(cssClass, hidden);
  };

  const readLocalHidden = () => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw === 'true' || raw === true;
    } catch (_) {
      return false;
    }
  };

  let hidden = readLocalHidden();
  applyState(hidden);

  if (typeof storageGet === 'function') {
    storageGet(storageKey, false).then(syncHidden => {
      const normalized = !!syncHidden;
      if (normalized === hidden) return;
      hidden = normalized;
      applyState(hidden);
    }).catch(() => {});
  }

  button.addEventListener('click', () => {
    hidden = button.classList.contains('active');
    applyState(hidden);
    if (typeof storageSet === 'function') {
      storageSet(storageKey, hidden);
    } else {
      try { localStorage.setItem(storageKey, hidden ? 'true' : 'false'); } catch (_) {}
    }
  });
}

const PREF_KEYS = ['hideTodo', 'hideCalendar', 'sidebarSize', 'sidebarHeightAdjust'];
let prefsSyncLoaded = false;

function applySavedPreferences(prefSource) {

  // Read from localStorage synchronously for immediate application
  let todoHidden = false;
  let calHidden = false;
  let sidebarSize = null;
  let sidebarHeightAdjust = 312;
  
  if (prefSource) {
    todoHidden = !!prefSource.hideTodo;
    calHidden = !!prefSource.hideCalendar;
    if (prefSource.sidebarSize !== null && prefSource.sidebarSize !== undefined) {
      sidebarSize = parseInt(prefSource.sidebarSize, 10);
    }
    sidebarHeightAdjust = parseInt(prefSource.sidebarHeightAdjust, 10);
    if (!Number.isFinite(sidebarHeightAdjust)) sidebarHeightAdjust = 312;
  } else {
    try {
      const todoRaw = localStorage.getItem('hideTodo');
      todoHidden = todoRaw === 'true' || todoRaw === true;
      const calRaw = localStorage.getItem('hideCalendar');
      calHidden = calRaw === 'true' || calRaw === true;
      const sizeRaw = localStorage.getItem('sidebarSize');
      if (sizeRaw !== null) sidebarSize = parseInt(sizeRaw, 10);
      const heightRaw = localStorage.getItem('sidebarHeightAdjust');
      if (heightRaw !== null) sidebarHeightAdjust = parseInt(heightRaw, 10);
      if (!Number.isFinite(sidebarHeightAdjust)) sidebarHeightAdjust = 312;
    } catch (_) {}
  }

  try {
    if (typeof window !== 'undefined' && Number.isFinite(window.__mgcSidebarHeightAdjust)) {
      sidebarHeightAdjust = window.__mgcSidebarHeightAdjust;
    }
  } catch (_) {}

  const todo = document.querySelector('[aria-label="To-do"], [aria-label="To do"]');
  const calendar = document.querySelector('[aria-label="Calendar"]');

  if (todo) todo.style.display = todoHidden ? 'none' : '';
  if (calendar) calendar.style.display = calHidden ? 'none' : '';
  
  try {
    if (calHidden) {
      document.body.classList.add('calendar-hidden');
    } else {
      document.body.classList.remove('calendar-hidden');
    }
    try {
      if (sidebarSize !== null) {
        document.body.classList.remove('sbsmallest','sbsmall','sbmedium');
        if (sidebarSize === 0) document.body.classList.add('sbsmallest');
        else if (sidebarSize === 1) document.body.classList.add('sbsmall');
        else if (sidebarSize === 2) document.body.classList.add('sbmedium');
      }
    } catch (_) {}

    // Apply sidebar height adjustment
    try {
      const adjustedValue = 624 - sidebarHeightAdjust;
      document.documentElement.style.setProperty('--enrolled-height-adjust', adjustedValue + 'px');
      if (document.body) document.body.style.setProperty('--enrolled-height-adjust', adjustedValue + 'px');
    } catch (_) {}
  } catch (_) {}
  
}

function loadSyncPreferencesOnce() {
  if (prefsSyncLoaded || (typeof storageGetMultiple !== 'function' && typeof storageGet !== 'function')) return;
  prefsSyncLoaded = true;

  const loadSyncValues = (typeof storageGetMultiple === 'function')
    ? storageGetMultiple(PREF_KEYS)
    : Promise.all([
        storageGet('hideTodo', false),
        storageGet('hideCalendar', false),
        storageGet('sidebarSize', null),
        storageGet('sidebarHeightAdjust', 312)
      ]).then(([hideTodo, hideCalendar, sidebarSize, sidebarHeightAdjust]) => ({
        hideTodo,
        hideCalendar,
        sidebarSize,
        sidebarHeightAdjust
      }));

  loadSyncValues.then(values => {
    applySavedPreferences(values);
  }).catch(() => {
    prefsSyncLoaded = false;
  });
}

// Debounce utility
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Debounced version of applySavedPreferences
const debouncedApplySavedPreferences = debounce(applySavedPreferences, 150);

// Only observe the main container for settings panel insertion
function observeSettingsPanel() {
    const container = document.body;
    if (!container) return;
    let panelInserted = false;
    const todoSelector = '[aria-label="To-do"], [aria-label="To do"]';
    const calendarSelector = '[aria-label="Calendar"]';
  const panelSelector = '.mSaSG.pEwOBc.Aopndd, .mSaSG.pEwOBc';
    const observer = new MutationObserver((mutations, obs) => {
        let shouldApply = false;
        for (const mutation of mutations) {
            if (mutation.type !== 'childList') continue;
            for (const node of mutation.addedNodes) {
                if (!(node instanceof Element)) continue;
                if (!shouldApply && (
                  node.matches(todoSelector) ||
                  node.matches(calendarSelector) ||
                  node.querySelector(todoSelector) ||
                  node.querySelector(calendarSelector)
                )) {
                  shouldApply = true;
                }
                if (!panelInserted && (
                  node.matches(panelSelector) ||
                  node.querySelector(panelSelector)
                )) {
                  let inserted = false;
                  try {
                    if (typeof insertCustomSettingsPanel === 'function') {
                      inserted = !!insertCustomSettingsPanel();
                    }
                  } catch (_) {
                    inserted = false;
                  }
                  if (inserted) {
                    panelInserted = true;
                    obs.disconnect();
                    break;
                  }
                }
            }
            if (panelInserted) break;
        }
        if (shouldApply) debouncedApplySavedPreferences();
    });
    observer.observe(container, { childList: true, subtree: true });
}

// Only run force apply for a short period
function initSidebarControls() {
  applySavedPreferences();
  loadSyncPreferencesOnce();
  observeSettingsPanel();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSidebarControls, { once: true });
} else {
  initSidebarControls();
}


