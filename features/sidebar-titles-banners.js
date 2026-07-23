const editingCourseIds = new Set();
let contextActive = true;

window.addEventListener("beforeunload", () => { contextActive = false; });

// Prevent noisy errors about the extension context being invalidated (harmless when extension reloads/unloads)
window.addEventListener("unhandledrejection", (e) => {
  if (e.reason?.message?.includes("Extension context invalidated")) e.preventDefault();
});
window.addEventListener("error", (e) => {
  if (e?.message?.includes?.("Extension context invalidated")) e.preventDefault();
});

// Safe wrapper for messaging the background script; avoids throwing when extension context is gone
function sendMessageSafe(message, callback) {
  if (!contextActive || !chrome?.runtime?.sendMessage) {
    if (callback) callback(null);
    return;
  }

  try {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        // Ignore known benign error thrown when extension reloads/unloads
        if (chrome.runtime.lastError.message?.includes("Extension context invalidated")) {
          if (callback) callback(null);
          return;
        }
        // For other runtime errors, swallow for now (or enable logging for debugging)
        if (callback) callback(null);
        return;
      }

      if (!response && callback) return callback({ titles: {} });
      if (callback) callback(response);
    });
  } catch (err) {
    if (err?.message?.includes("Extension context invalidated")) {
      if (callback) callback(null);
      return;
    }
    throw err;
  }
}

function getTitles(callback) {
  if (typeof storageGet === 'function') {
    storageGet('titles', {})
      .then((titles) => callback({ titles: (titles && typeof titles === 'object') ? titles : {} }))
      .catch(() => {
        sendMessageSafe({ action: "getTitles" }, (response) => {
          if (!response) return callback({ titles: {} });
          callback(response);
        });
      });
    return;
  }

  sendMessageSafe({ action: "getTitles" }, (response) => {
    if (!response) return callback({ titles: {} });
    callback(response);
  });
}

function setTitle(courseId, newTitle) {
  if (typeof storageGet === 'function' && typeof storageSet === 'function') {
    (async () => {
      const titles = await storageGet('titles', {});
      const nextTitles = (titles && typeof titles === 'object') ? { ...titles } : {};
      nextTitles[courseId] = newTitle;
      await storageSet('titles', nextTitles);
    })().catch(() => {
      sendMessageSafe({ action: "setTitle", courseId, newTitle }, () => {});
    });
    return;
  }

  sendMessageSafe({ action: "setTitle", courseId, newTitle }, () => {});
}

// ---- Cache titles in memory and pre-populate from localStorage ----
let cachedTitles = {};

// 🔥 Immediately load from localStorage (synchronous)
try {
  const raw = localStorage.getItem('titles');
  if (raw) {
    const localTitles = JSON.parse(raw);
    if (localTitles && typeof localTitles === 'object') {
      cachedTitles = localTitles;
    }
  }
} catch (_) {}

function getCachedTitles(callback) {
  getTitles(({ titles = {} }) => {
    cachedTitles = titles;
    if (callback) callback(titles);
  });
}

function applySidebarCourseTextColor(sidebarLink, color) {
    if (!sidebarLink || !color || color === 'none') return;

    const titleDiv = sidebarLink.querySelector('.GRvzhf.YVvGBb') || sidebarLink.querySelector('.XL4gNd.YVvGBb');
    if (titleDiv) {
        titleDiv.style.color = color;
    }

    const teacherDiv = sidebarLink.querySelector('.mefVYc.YVvGBb');
    if (teacherDiv) {
        teacherDiv.style.color = color;
    }
}

function updateSidebarTitle(courseId, newTitle) {
  cachedTitles[courseId] = newTitle;
  
  const sidebarLinks = document.querySelectorAll(`a[data-id="${courseId}"]`);
  sidebarLinks.forEach(sidebarLink => {
    const titleDiv = sidebarLink?.querySelector(".GRvzhf.YVvGBb") || sidebarLink?.querySelector('.XL4gNd.YVvGBb');
    if (!titleDiv) return;

    if (titleDiv.textContent !== newTitle) {
      titleDiv.textContent = newTitle;
      sidebarLink.setAttribute("aria-label", newTitle);
    }

    // Restore color for this title
    const iconElement = sidebarLink?.querySelector('.kWQ5wd');
    if (iconElement) {
      const style = getComputedStyle(iconElement);
      const color = style.getPropertyValue('--dna-icon-color').trim();
            applySidebarCourseTextColor(sidebarLink, color);
    }
  });

  // Keep course-page header title in sync with the same custom title.
  updateCoursePageHeaderTitleForActiveCourse(courseId);
}

function updateCoursePageHeaderTitleForActiveCourse(activeCourseId) {
  let courseId = activeCourseId || getActiveSidebarCourseId();
  if (!courseId) return;

  // Prefer numeric course id from active sidebar link when available.
  const activeSidebarLink = document.querySelector('a.uTwgne[aria-current="page"], a.uTwgne[aria-current="true"]');
  if (activeSidebarLink?.dataset?.id) courseId = activeSidebarLink.dataset.id;
  // Only apply header renames on real course pages: /c/ID or /u/N/c/ID
  const pathname = window.location?.pathname || '';
  if (!pathname.match(/^\/(?:u\/\d+\/)?c\/[A-Za-z0-9_-]+/)) return;

  let customTitle = cachedTitles[courseId];
  if (!customTitle) {
    // Fallback: use whichever course id was applied to the header background.
    const bgCourseId = document.querySelector('[data-mgc-bg-course]')?.getAttribute('data-mgc-bg-course');
    if (bgCourseId && cachedTitles[bgCourseId]) {
      courseId = bgCourseId;
      customTitle = cachedTitles[courseId];
    }
  }

  // Only target the primary title (#UGb2Qe), not secondary text labels
  const headerNodes = document.querySelectorAll(
    'h1.tNGpbb, .T4tcpe .tNGpbb, #UGb2Qe'
  );
  if (!headerNodes.length) return;

  headerNodes.forEach((node) => {
    if (!node || !(node instanceof HTMLElement)) return;

    const currentText = (node.textContent || '').trim();
    if (!node.dataset.mgcOriginalTitle && currentText) {
      node.dataset.mgcOriginalTitle = currentText;
    }

    if (customTitle) {
      if (currentText !== customTitle) node.textContent = customTitle;
      return;
    }

    const original = node.dataset.mgcOriginalTitle;
    if (original && currentText !== original) node.textContent = original;
  });
}

let sidebarRestoreTimeout;

// Aggressively restore custom names in sidebar
const sidebarTitleObserver = new MutationObserver((mutations) => {
  clearTimeout(sidebarRestoreTimeout);
  
  sidebarRestoreTimeout = setTimeout(() => {
    Object.entries(cachedTitles).forEach(([courseId, customTitle]) => {
      if (!customTitle || editingCourseIds.has(courseId)) return;
      
      document.querySelectorAll(`a[data-id="${courseId}"]`).forEach(sidebarLink => {
        const titleDiv = sidebarLink?.querySelector(".GRvzhf.YVvGBb") || sidebarLink?.querySelector('.XL4gNd.YVvGBb');
        if (titleDiv && titleDiv.textContent !== customTitle) {
          titleDiv.textContent = customTitle;
          sidebarLink.setAttribute("aria-label", customTitle);
        }

        // Also restore color for this title
        const iconElement = sidebarLink?.querySelector('.kWQ5wd');
        if (iconElement && titleDiv) {
          const style = getComputedStyle(iconElement);
          const color = style.getPropertyValue('--dna-icon-color').trim();
                    applySidebarCourseTextColor(sidebarLink, color);
        }
      });
    });
  }, 10);
});

// Start observing sidebar for any title text changes
if (document.body) {
  sidebarTitleObserver.observe(document.body, {
    characterData: true,
    subtree: true,
    childList: true
  });
}

// ---- Helper: Apply titles to the DOM (synchronous) ----
function applyTitlesToDOM(titles) {
    if (!titles || typeof titles !== 'object') return;

    // Update course page header (if on a class page)
    updateCoursePageHeaderTitleForActiveCourse();

    // Update classroom home cards (widgets on the homepage)
    document.querySelectorAll("li[data-course-id]").forEach(card => {
        const courseId = card.dataset.courseId;
        if (!courseId || editingCourseIds.has(courseId)) return;
        const titleNode = card.querySelector(".ScpeUc");
        if (!titleNode) return;
        if (titles[courseId]) {
            titleNode.textContent = titles[courseId];
        }
    });

    // Update sidebar links
    Object.entries(titles).forEach(([courseId, title]) => {
        if (title) {
            updateSidebarTitle(courseId, title);
        }
    });
}

// ---- Modified restoreTitles with synchronous fast-pass ----
function restoreTitles() {
    // ===== 1. Apply from cache (already pre-populated from localStorage) =====
    if (Object.keys(cachedTitles).length > 0) {
        applyTitlesToDOM(cachedTitles);
    }

    // ===== 2. Async refresh (sync with cloud) =====
    snapshotCardBackgroundDefaultsFromDom();

    getTitles(({ titles = {} }) => {
        // Merge or overwrite cache with cloud data
        cachedTitles = titles;
        applyTitlesToDOM(titles);
    });

    // ---- The rest: add edit buttons, image pickers, etc. ----
    document.querySelectorAll("li[data-course-id]").forEach(card => {
        const courseId = card.dataset.courseId;
        if (!courseId || editingCourseIds.has(courseId)) return;

        const titleNode = card.querySelector(".ScpeUc");
        if (!titleNode) return;

        const container = card.querySelector(".SZ0kZe");
        if (!container || container.querySelector(".my-extension-edit")) return;

        const editBtn = document.createElement("div");
        editBtn.className = "my-extension-edit";
        editBtn.setAttribute("role", "button");
        editBtn.setAttribute("tabindex", "0");
        editBtn.style.cssText = "display:inline-block;";

        const img = document.createElement("img");
        img.src = chrome.runtime.getURL("Icons/Rename.svg");
        img.alt = "Edit";
        img.style.cssText = "width:24px;height:24px;";
        editBtn.appendChild(img);

        container.appendChild(editBtn);

        // Image picker button
        const imageBtn = document.createElement("div");
        imageBtn.className = "my-extension-image";
        imageBtn.setAttribute("role", "button");
        imageBtn.setAttribute("tabindex", "0");
        imageBtn.style.cssText = "display:inline-block;margin-left:6px;";
        const imageIcon = document.createElement("img");
        imageIcon.src = chrome.runtime.getURL("Icons/editwidgimg.svg");
        imageIcon.alt = "Change background";
        imageIcon.style.cssText = "width:24px;height:24px;";
        imageBtn.appendChild(imageIcon);
        container.appendChild(imageBtn);

        // Apply persisted background if present (uses cached storage)
        try {
            const savedUrl = getSavedBackgroundForCourse(courseId);
            const bgDiv = card.querySelector('.OjOEXb');
            if (savedUrl && bgDiv) {
                bgDiv.style.setProperty('background-image', `url("${savedUrl}")`, 'important');
                bgDiv.style.setProperty('background-size', 'cover', 'important');
                bgDiv.style.setProperty('background-position', 'center center', 'important');
                bgDiv.style.setProperty('background-repeat', 'no-repeat', 'important');
            }
        } catch (e) {}
    });

    // Apply persisted backgrounds for all existing cards (covers ones where buttons already existed)
    Promise.all([refreshCardBackgroundsFromStorage(), refreshCardIconColorsFromStorage()]).then(() => {
        document.querySelectorAll('li[data-course-id]').forEach(card => {
            try {
                const courseId = card.dataset.courseId;
                const url = getSavedBackgroundForCourse(courseId);
                if (url) {
                    const bgDiv = card.querySelector('.OjOEXb');
                    if (bgDiv) {
                        bgDiv.style.setProperty('background-image', `url("${url}")`, 'important');
                        bgDiv.style.setProperty('background-size', 'cover', 'important');
                        bgDiv.style.setProperty('background-position', 'center center', 'important');
                        bgDiv.style.setProperty('background-repeat', 'no-repeat', 'important');
                    }
                }
                
                // Apply saved card icon color
                const iconColor = getCardIconColorForCourse(courseId);
                if (iconColor) {
                    applyCardIconColor(card, courseId, iconColor);
                    const colorSwatch = card.querySelector('.my-extension-color-picker [style*="background"]');
                    if (colorSwatch) {
                        colorSwatch.style.backgroundColor = iconColor;
                    }
                }
            } catch (e) {}
        });
        try { updateHeaderBackgroundForActiveCourse(); } catch (e) {}
    });

    // Update sidebar from titles (already done in applyTitlesToDOM, but keep for safety)
    Object.entries(cachedTitles).forEach(([courseId, title]) => {
        if (title) {
            updateSidebarTitle(courseId, title);
        }
    });
}

function focusIfVisible(el) {
  if (!el.offsetParent) return; 
  el.focus();
  el.select?.();
}

document.body.addEventListener("click", (e) => {
  const editBtn = e.target.closest(".my-extension-edit");
  if (!editBtn) return;

  const card = editBtn.closest("li[data-course-id]");
  if (!card) return;

  const courseId = card.dataset.courseId;
  if (!courseId || editingCourseIds.has(courseId)) return;

  const titleNode = card.querySelector(".ScpeUc");
  if (!titleNode) return;

  editingCourseIds.add(courseId);
  const currentText = titleNode.textContent.trim();

  const input = document.createElement("input");
  input.type = "text";
  input.value = currentText;
  input.style.cssText = `width:90%;font:${window.getComputedStyle(titleNode).font};`;

  titleNode.textContent = "";
  titleNode.appendChild(input);

  setTimeout(() => focusIfVisible(input), 50);

  const save = () => {
    const newTitle = input.value.trim() || currentText;

    setTitle(courseId, newTitle);

    titleNode.textContent = newTitle;
    editingCourseIds.delete(courseId);
    updateSidebarTitle(courseId, newTitle);
  };

  input.addEventListener("blur", save);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") input.blur();
    if (e.key === "Escape") {
      titleNode.textContent = currentText;
      editingCourseIds.delete(courseId);
    }
  });
});

// Image picker popup management
let __currentImagePicker = null;
let __imagePickerThumbObserver = null;
let __imagePickerCloseTimer = null;
const MGC_RECENT_CUSTOM_BANNERS_KEY = 'modernClassroom_recent_custom_banners';
const MGC_RECENT_CUSTOM_BANNERS_LIMIT = 6;
function perfLog(msg) { try { if (window.__mgcPerf) console.log('[mgc-perf]', msg); } catch(e) {} }
function closeImagePicker() {
  if (__imagePickerCloseTimer) {
    window.clearTimeout(__imagePickerCloseTimer);
    __imagePickerCloseTimer = null;
  }

  const pickersToClose = [];
  if (__currentImagePicker) {
    pickersToClose.push(__currentImagePicker);
    __currentImagePicker = null;
  }
  try {
    document.querySelectorAll('.image-picker-popup').forEach((picker) => {
      if (!pickersToClose.includes(picker)) {
        pickersToClose.push(picker);
      }
    });
  } catch (e) {}

  if (pickersToClose.length > 0) {
    pickersToClose.forEach((pickerToClose) => {
      try {
        pickerToClose.classList.add('image-picker-popup-closing');
        pickerToClose.style.pointerEvents = 'none';
      } catch (e) {}
    });

    __imagePickerCloseTimer = window.setTimeout(() => {
      pickersToClose.forEach((pickerToClose) => {
        try { pickerToClose.remove(); } catch (e) {}
      });
      __imagePickerCloseTimer = null;
    }, 240);
  }

  try {
    document.body.classList.remove('mc-image-picker-fixed-active');
    document.documentElement.style.removeProperty('--mc-image-picker-fixed-width');
  } catch (e) {}

  // Clean up any global handlers left around
  try {
    if (window.__imagePickerDocClickHandler) {
      document.removeEventListener('click', window.__imagePickerDocClickHandler, true);
      window.__imagePickerDocClickHandler = null;
    }
    if (window.__imagePickerKeyHandler) {
      document.removeEventListener('keydown', window.__imagePickerKeyHandler);
      window.__imagePickerKeyHandler = null;
    }
    if (__imagePickerThumbObserver) {
      __imagePickerThumbObserver.disconnect();
      __imagePickerThumbObserver = null;
    }
  } catch (e) {}
}

// Helper: detect built-in theme URLs
function isBuiltInThemeUrl(url) {
  return (typeof url === 'string') && url.startsWith('https://www.gstatic.com/classroom/themes/');
}

function getRecentCustomBannerUrls() {
  try {
    const raw = JSON.parse(localStorage.getItem(MGC_RECENT_CUSTOM_BANNERS_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .map((value) => String(value || '').trim())
      .filter((value, index, arr) => value && /^https?:\/\//i.test(value) && arr.indexOf(value) === index)
      .slice(0, MGC_RECENT_CUSTOM_BANNERS_LIMIT);
  } catch (e) {
    return [];
  }
}

function saveRecentCustomBannerUrl(url) {
  const normalized = String(url || '').trim();
  if (!/^https?:\/\//i.test(normalized)) return;
  try {
    const next = [
      normalized,
      ...getRecentCustomBannerUrls().filter((value) => value !== normalized)
    ].slice(0, MGC_RECENT_CUSTOM_BANNERS_LIMIT);
    localStorage.setItem(MGC_RECENT_CUSTOM_BANNERS_KEY, JSON.stringify(next));
  } catch (e) {}
}

let cachedCardBackgroundDefaults = {};

function snapshotCardBackgroundDefaultsFromDom() {
  try {
    document.querySelectorAll('li[data-course-id]').forEach((card) => {
      const courseId = card?.dataset?.courseId;
      if (!courseId || cachedCardBackgroundDefaults[courseId]) return;

      const bgDiv = card.querySelector('.OjOEXb');
      if (!bgDiv) return;

      const bg = bgDiv.style.backgroundImage || getComputedStyle(bgDiv).backgroundImage;
      const url = extractUrlFromCss(bg);
      if (url) {
        cachedCardBackgroundDefaults[courseId] = url;
      }
    });
  } catch (e) {}
}

function getDefaultBackgroundForCourse(courseId) {
  return courseId ? cachedCardBackgroundDefaults[courseId] || null : null;
}

// Color picker popup management
let __currentColorPicker = null;
let __currentColorPickerTrigger = null;
let __colorPickerDocClickHandler = null;

function closeColorPicker() {
  if (__currentColorPicker) {
    __currentColorPicker.remove();
    __currentColorPicker = null;
  }
  if (__colorPickerDocClickHandler) {
    document.removeEventListener('click', __colorPickerDocClickHandler, true);
    __colorPickerDocClickHandler = null;
  }
  __currentColorPickerTrigger = null;
}

document.body.addEventListener('click', (e) => {
  const colorBtn = e.target.closest('.my-extension-icon-color-picker');
  if (!colorBtn) return;

  if (__currentColorPicker && __currentColorPickerTrigger === colorBtn) {
    closeColorPicker();
    return;
  }

  closeColorPicker();

  // Check if on home page (inside a card)
  const card = colorBtn.closest('li[data-course-id]');
  if (card) {
    openColorPickerForCard(card, colorBtn);
    return;
  }

  // Check if on classroom page (inside a banner)
  const banner = colorBtn.closest('.PFLqgc.KFl4Z, .vFkiub.KFl4Z, .PFLqgc.PagUde, .vFkiub.PagUde, .qyN25');
  if (banner) {
    openColorPickerForClassroomPage(banner, colorBtn);
    return;
  }
});

function openColorPickerForClassroomPage(banner, triggerBtn) {
  closeColorPicker();

  const isDarkMode = document.body.classList.contains('dark-mode') || document.body.classList.contains('dark');

  const courseId = getActiveSidebarCourseId();
  if (!courseId) return;

  const currentColor = getCardIconColorForCourse(courseId) || '#9aa0a6';

  const popup = document.createElement('div');
  popup.className = 'card-icon-color-picker-popup';
  popup.style.cssText = `
    position: fixed;
    background: ${isDarkMode ? '#212126' : 'white'};
    border: 1px solid ${isDarkMode ? 'rgba(43, 45, 63, 0.421)' : '#ddd'};
    border-radius: 20px;
    padding: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    z-index: 10000;
    color: ${isDarkMode ? '#ddd' : 'inherit'};
    min-width: 280px;
  `;

  // Title
  const title = document.createElement('div');
  title.textContent = 'Classroom Colour';
  title.style.cssText = `font-weight: 600; font-size: 13px; margin-bottom: 12px; color: ${isDarkMode ? '#ddd' : '#333'};`;
  popup.appendChild(title);

  // SV Box (Saturation/Value)
  const svWrapper = document.createElement('div');
  svWrapper.className = 'home-sv-wrapper';
  
  const svCanvas = document.createElement('canvas');
  svCanvas.className = 'home-sv-canvas';
  svCanvas.width = 280;
  svCanvas.height = 120;
  
  const svMarker = document.createElement('div');
  svMarker.className = 'home-sv-marker';
  
  svWrapper.appendChild(svCanvas);
  svWrapper.appendChild(svMarker);
  popup.appendChild(svWrapper);

  // Hue Slider
  const hueSlider = document.createElement('input');
  hueSlider.type = 'range';
  hueSlider.min = '0';
  hueSlider.max = '360';
  hueSlider.className = 'home-hue-slider';
  popup.appendChild(hueSlider);
  
  // Hex Input
  const hexInput = document.createElement('input');
  hexInput.type = 'text';
  hexInput.className = 'home-hex-input';
  hexInput.placeholder = '#RRGGBB';
  popup.appendChild(hexInput);

  // State
  let currentH = 0;
  let currentS = 1;
  let currentV = 1;

  // Helper functions
  function hsvToRgb(h, s, v) {
    const c = v * s;
    const hh = (h / 60) % 6;
    const x = c * (1 - Math.abs((hh % 2) - 1));
    let r1=0, g1=0, b1=0;
    if (0 <= hh && hh < 1) { r1=c; g1=x; b1=0; }
    else if (1 <= hh && hh < 2) { r1=x; g1=c; b1=0; }
    else if (2 <= hh && hh < 3) { r1=0; g1=c; b1=x; }
    else if (3 <= hh && hh < 4) { r1=0; g1=x; b1=c; }
    else if (4 <= hh && hh < 5) { r1=x; g1=0; b1=c; }
    else { r1=c; g1=0; b1=x; }
    const m = v - c;
    return { 
      r: Math.round((r1+m)*255), 
      g: Math.round((g1+m)*255), 
      b: Math.round((b1+m)*255) 
    };
  }

  function rgbToHex(r, g, b) {
    const toHex = (n) => {
      const hex = Math.max(0, Math.min(255, n)).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  function hexToHsv(hex) {
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
      r = parseInt(hex[1] + hex[1], 16);
      g = parseInt(hex[2] + hex[2], 16);
      b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) {
      r = parseInt(hex.slice(1, 3), 16);
      g = parseInt(hex.slice(3, 5), 16);
      b = parseInt(hex.slice(5, 7), 16);
    }
    
    const r1=r/255, g1=g/255, b1=b/255;
    const max=Math.max(r1,g1,b1), min=Math.min(r1,g1,b1);
    const d=max-min;
    let h=0;
    if (d===0) h=0;
    else if (max===r1) h=((g1-b1)/d)%6;
    else if (max===g1) h=(b1-r1)/d+2;
    else h=(r1-g1)/d+4;
    h=Math.round(h*60); if (h<0) h+=360;
    const s=max===0?0:d/max;
    const v=max;
    return { h, s, v };
  }

  // Initialize from current color
  const { h, s, v } = hexToHsv(currentColor);
  currentH = h;
  currentS = s;
  currentV = v;
  
  hueSlider.value = currentH;
  hexInput.value = currentColor;

  // Drawing and updating functions
  function drawSvBox() {
    const ctx = svCanvas.getContext('2d');
    const width = svCanvas.width;
    const height = svCanvas.height;
    
    ctx.clearRect(0, 0, width, height);
    
    // Fill with current Hue
    ctx.fillStyle = `hsl(${currentH}, 100%, 50%)`;
    ctx.fillRect(0, 0, width, height);
    
    // White gradient (Left to Right)
    const whiteGrad = ctx.createLinearGradient(0, 0, width, 0);
    whiteGrad.addColorStop(0, 'rgba(255,255,255,1)');
    whiteGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = whiteGrad;
    ctx.fillRect(0, 0, width, height);
    
    // Black gradient (Top to Bottom)
    const blackGrad = ctx.createLinearGradient(0, 0, 0, height);
    blackGrad.addColorStop(0, 'rgba(0,0,0,0)');
    blackGrad.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = blackGrad;
    ctx.fillRect(0, 0, width, height);
  }

  function updateMarkerPosition() {
    const width = svCanvas.offsetWidth || 280;
    const height = svCanvas.offsetHeight || 120;
    
    const x = currentS * width;
    const y = (1 - currentV) * height;
    svMarker.style.left = `${x}px`;
    svMarker.style.top = `${y}px`;
  }

  function updateColorFromHsv() {
    const { r, g, b } = hsvToRgb(currentH, currentS, currentV);
    const hex = rgbToHex(r, g, b);
    
    // Update hex input
    if (document.activeElement !== hexInput) {
      hexInput.value = hex;
    }
    
    // Save color
    setCardIconColorForCourse(courseId, hex);

    applyMgcCourseIconColor(document, hex);
    
    // Update swatch
    const swatch = triggerBtn.querySelector('div');
    if (swatch) swatch.style.backgroundColor = hex;
  }

  // Event Listeners
  hueSlider.addEventListener('input', (e) => {
    currentH = Number(e.target.value);
    drawSvBox();
    updateColorFromHsv();
  });

  let isDraggingSv = false;
  
  function handleSvInput(clientX, clientY) {
    const rect = svCanvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    let x = clientX - rect.left;
    let y = clientY - rect.top;
    
    // Clamp
    x = Math.max(0, Math.min(rect.width, x));
    y = Math.max(0, Math.min(rect.height, y));
    
    currentS = x / rect.width;
    currentV = 1 - (y / rect.height);
    
    updateMarkerPosition();
    updateColorFromHsv();
  }

  svWrapper.addEventListener('mousedown', (e) => {
    isDraggingSv = true;
    handleSvInput(e.clientX, e.clientY);
  });
  
  const mouseMoveHandler = (e) => {
    if (isDraggingSv) {
      handleSvInput(e.clientX, e.clientY);
    }
  };
  
  const mouseUpHandler = () => {
    isDraggingSv = false;
  };
  
  window.addEventListener('mousemove', mouseMoveHandler);
  window.addEventListener('mouseup', mouseUpHandler);

  hexInput.addEventListener('change', (e) => {
    let hex = e.target.value.trim();
    if (!hex.startsWith('#')) hex = '#' + hex;
    if (/^#([0-9A-F]{3}){1,2}$/i.test(hex)) {
      const hsv = hexToHsv(hex);
      currentH = hsv.h;
      currentS = hsv.s;
      currentV = hsv.v;
      hueSlider.value = currentH;
      drawSvBox();
      updateMarkerPosition();
      updateColorFromHsv();
    }
  });


  document.body.appendChild(popup);
  __currentColorPicker = popup;
  __currentColorPickerTrigger = triggerBtn;

  // Initial draw - do it immediately for correct display
  drawSvBox();
  updateMarkerPosition();
  
  // Backup draw in case canvas wasn't ready
  setTimeout(() => {
    drawSvBox();
    updateMarkerPosition();
  }, 50);

  // Position popup (anchor to bottom left of trigger button)
  requestAnimationFrame(() => {
    const rect = triggerBtn.getBoundingClientRect();
    let left = rect.left;
    let top = rect.bottom + 4;

    // Keep within viewport
    if (left + popup.offsetWidth > window.innerWidth - 8) {
      left = window.innerWidth - popup.offsetWidth - 8;
    }
    if (top + popup.offsetHeight > window.innerHeight - 8) {
      top = rect.top - popup.offsetHeight - 4;
    }

    popup.style.left = left - 10 + 'px';
    popup.style.top = top + 10 + 'px';
  });

  // Close on outside click
  setTimeout(() => {
    if (__colorPickerDocClickHandler) {
      document.removeEventListener('click', __colorPickerDocClickHandler, true);
      __colorPickerDocClickHandler = null;
    }

    __colorPickerDocClickHandler = (ev) => {
      if (!popup.contains(ev.target) && !triggerBtn.contains(ev.target)) {
        window.removeEventListener('mousemove', mouseMoveHandler);
        window.removeEventListener('mouseup', mouseUpHandler);
        closeColorPicker();
      }
    };
    document.addEventListener('click', __colorPickerDocClickHandler, true);
  }, 0);

}

function openColorPickerForCard(card, triggerBtn) {
  closeColorPicker();

  const isDarkMode = document.body.classList.contains('dark-mode') || document.body.classList.contains('dark');

  const courseId = card.dataset.courseId;
  if (!courseId) return;

  const currentColor = getCardIconColorForCourse(courseId) || '#9aa0a6';

  const popup = document.createElement('div');
  popup.className = 'card-icon-color-picker-popup';
  popup.style.cssText = `
    position: fixed;
    background: ${isDarkMode ? '#212126' : 'white'};
    border: 1px solid ${isDarkMode ? 'rgba(43, 45, 63, 0.421)' : '#ddd'};
    border-radius: 20px;
    padding: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    z-index: 10000;
    color: ${isDarkMode ? '#ddd' : 'inherit'};
    min-width: 280px;
  `;

  // Title
  const title = document.createElement('div');
  title.textContent = 'Classroom Colour';
  title.style.cssText = `font-weight: 600; font-size: 13px; margin-bottom: 12px; color: ${isDarkMode ? '#ddd' : '#333'};`;
  popup.appendChild(title);

  // SV Box (Saturation/Value)
  const svWrapper = document.createElement('div');
  svWrapper.className = 'home-sv-wrapper';
  
  const svCanvas = document.createElement('canvas');
  svCanvas.className = 'home-sv-canvas';
  svCanvas.width = 280;
  svCanvas.height = 120;
  
  const svMarker = document.createElement('div');
  svMarker.className = 'home-sv-marker';
  
  svWrapper.appendChild(svCanvas);
  svWrapper.appendChild(svMarker);
  popup.appendChild(svWrapper);

  // Hue Slider
  const hueSlider = document.createElement('input');
  hueSlider.type = 'range';
  hueSlider.min = '0';
  hueSlider.max = '360';
  hueSlider.className = 'home-hue-slider';
  popup.appendChild(hueSlider);
  
  // Hex Input
  const hexInput = document.createElement('input');
  hexInput.type = 'text';
  hexInput.className = 'home-hex-input';
  hexInput.placeholder = '#RRGGBB';
  popup.appendChild(hexInput);

  // State
  let currentH = 0;
  let currentS = 1;
  let currentV = 1;

  // Helper functions
  function hsvToRgb(h, s, v) {
    const c = v * s;
    const hh = (h / 60) % 6;
    const x = c * (1 - Math.abs((hh % 2) - 1));
    let r1=0, g1=0, b1=0;
    if (0 <= hh && hh < 1) { r1=c; g1=x; b1=0; }
    else if (1 <= hh && hh < 2) { r1=x; g1=c; b1=0; }
    else if (2 <= hh && hh < 3) { r1=0; g1=c; b1=x; }
    else if (3 <= hh && hh < 4) { r1=0; g1=x; b1=c; }
    else if (4 <= hh && hh < 5) { r1=x; g1=0; b1=c; }
    else { r1=c; g1=0; b1=x; }
    const m = v - c;
    return { 
      r: Math.round((r1+m)*255), 
      g: Math.round((g1+m)*255), 
      b: Math.round((b1+m)*255) 
    };
  }

  function rgbToHex(r, g, b) {
    const toHex = (n) => {
      const hex = Math.max(0, Math.min(255, n)).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  function hexToHsv(hex) {
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
      r = parseInt(hex[1] + hex[1], 16);
      g = parseInt(hex[2] + hex[2], 16);
      b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) {
      r = parseInt(hex.slice(1, 3), 16);
      g = parseInt(hex.slice(3, 5), 16);
      b = parseInt(hex.slice(5, 7), 16);
    }
    
    const r1=r/255, g1=g/255, b1=b/255;
    const max=Math.max(r1,g1,b1), min=Math.min(r1,g1,b1);
    const d=max-min;
    let h=0;
    if (d===0) h=0;
    else if (max===r1) h=((g1-b1)/d)%6;
    else if (max===g1) h=(b1-r1)/d+2;
    else h=(r1-g1)/d+4;
    h=Math.round(h*60); if (h<0) h+=360;
    const s=max===0?0:d/max;
    const v=max;
    return { h, s, v };
  }

  // Initialize from current color
  const { h, s, v } = hexToHsv(currentColor);
  currentH = h;
  currentS = s;
  currentV = v;
  
  hueSlider.value = currentH;
  hexInput.value = currentColor;

  // Drawing and updating functions
  function drawSvBox() {
    const ctx = svCanvas.getContext('2d');
    const width = svCanvas.width;
    const height = svCanvas.height;
    
    ctx.clearRect(0, 0, width, height);
    
    // Fill with current Hue
    ctx.fillStyle = `hsl(${currentH}, 100%, 50%)`;
    ctx.fillRect(0, 0, width, height);
    
    // White gradient (Left to Right)
    const whiteGrad = ctx.createLinearGradient(0, 0, width, 0);
    whiteGrad.addColorStop(0, 'rgba(255,255,255,1)');
    whiteGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = whiteGrad;
    ctx.fillRect(0, 0, width, height);
    
    // Black gradient (Top to Bottom)
    const blackGrad = ctx.createLinearGradient(0, 0, 0, height);
    blackGrad.addColorStop(0, 'rgba(0,0,0,0)');
    blackGrad.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = blackGrad;
    ctx.fillRect(0, 0, width, height);
  }

  function updateMarkerPosition() {
    const width = svCanvas.offsetWidth || 280;
    const height = svCanvas.offsetHeight || 120;
    
    const x = currentS * width;
    const y = (1 - currentV) * height;
    svMarker.style.left = `${x}px`;
    svMarker.style.top = `${y}px`;
  }

  function updateColorFromHsv() {
    const { r, g, b } = hsvToRgb(currentH, currentS, currentV);
    const hex = rgbToHex(r, g, b);
    
    // Update hex input
    if (document.activeElement !== hexInput) {
      hexInput.value = hex;
    }
    
    // Save color
    setCardIconColorForCourse(courseId, hex);
    applyCardIconColor(card, courseId, hex);
    
    // Update swatch
    const swatch = triggerBtn.querySelector('div');
    if (swatch) swatch.style.backgroundColor = hex;
  }

  // Event Listeners
  hueSlider.addEventListener('input', (e) => {
    currentH = Number(e.target.value);
    drawSvBox();
    updateColorFromHsv();
  });

  let isDraggingSv = false;
  
  function handleSvInput(clientX, clientY) {
    const rect = svCanvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    let x = clientX - rect.left;
    let y = clientY - rect.top;
    
    // Clamp
    x = Math.max(0, Math.min(rect.width, x));
    y = Math.max(0, Math.min(rect.height, y));
    
    currentS = x / rect.width;
    currentV = 1 - (y / rect.height);
    
    updateMarkerPosition();
    updateColorFromHsv();
  }

  svWrapper.addEventListener('mousedown', (e) => {
    isDraggingSv = true;
    handleSvInput(e.clientX, e.clientY);
  });
  
  const mouseMoveHandler = (e) => {
    if (isDraggingSv) {
      handleSvInput(e.clientX, e.clientY);
    }
  };
  
  const mouseUpHandler = () => {
    isDraggingSv = false;
  };
  
  window.addEventListener('mousemove', mouseMoveHandler);
  window.addEventListener('mouseup', mouseUpHandler);

  hexInput.addEventListener('change', (e) => {
    let hex = e.target.value.trim();
    if (!hex.startsWith('#')) hex = '#' + hex;
    if (/^#([0-9A-F]{3}){1,2}$/i.test(hex)) {
      const hsv = hexToHsv(hex);
      currentH = hsv.h;
      currentS = hsv.s;
      currentV = hsv.v;
      hueSlider.value = currentH;
      drawSvBox();
      updateMarkerPosition();
      updateColorFromHsv();
    }
  });

  document.body.appendChild(popup);
  __currentColorPicker = popup;
  __currentColorPickerTrigger = triggerBtn;

  // Initial draw - do it immediately for correct display
  drawSvBox();
  updateMarkerPosition();
  
  // Backup draw in case canvas wasn't ready
  setTimeout(() => {
    drawSvBox();
    updateMarkerPosition();
  }, 50);

  // Position popup (anchor to bottom left of trigger button)
  requestAnimationFrame(() => {
    const rect = triggerBtn.getBoundingClientRect();
    let left = rect.left;
    let top = rect.bottom + 4;

    // Keep within viewport
    if (left + popup.offsetWidth > window.innerWidth - 8) {
      left = window.innerWidth - popup.offsetWidth - 8;
    }
    if (top + popup.offsetHeight > window.innerHeight - 8) {
      top = rect.top - popup.offsetHeight - 4;
    }

    popup.style.left = left - 10 + 'px';
    popup.style.top = top + 10 + 'px';
  });

  // Close on outside click
  setTimeout(() => {
    if (__colorPickerDocClickHandler) {
      document.removeEventListener('click', __colorPickerDocClickHandler, true);
      __colorPickerDocClickHandler = null;
    }

    __colorPickerDocClickHandler = (ev) => {
      if (!popup.contains(ev.target) && !triggerBtn.contains(ev.target)) {
        window.removeEventListener('mousemove', mouseMoveHandler);
        window.removeEventListener('mouseup', mouseUpHandler);
        closeColorPicker();
      }
    };
    document.addEventListener('click', __colorPickerDocClickHandler, true);
  }, 0);

}

document.body.addEventListener('click', (e) => {
  const imgBtn = e.target.closest('.my-extension-image');
  if (!imgBtn) return;

  const card = imgBtn.closest('li[data-course-id]');
  if (!card) return;

  openImagePickerForCard(card, imgBtn);
});

const MGC_BANNER_TINT_KEY = 'modernClassroom_banner_tint_by_course';
const MGC_BANNER_TINT_DEFAULTS = { color: '#000000', opacity: 0.15 };

function normalizeBannerTintSettings(raw) {
  const safe = raw && typeof raw === 'object' ? raw : {};
  const color = (typeof safe.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(safe.color))
    ? safe.color
    : MGC_BANNER_TINT_DEFAULTS.color;
  const opacityNum = Number(safe.opacity);
  const opacity = Number.isFinite(opacityNum)
    ? Math.max(0, Math.min(1, opacityNum))
    : MGC_BANNER_TINT_DEFAULTS.opacity;
  return { color, opacity };
}

function hexToRgba(hex, alpha) {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) return '';
  const int = parseInt(match[1], 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getBannerTintMap() {
  try {
    const raw = JSON.parse(localStorage.getItem(MGC_BANNER_TINT_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch (e) {
    return {};
  }
}

function saveBannerTintMap(map) {
  try {
    localStorage.setItem(MGC_BANNER_TINT_KEY, JSON.stringify(map || {}));
  } catch (e) {}
}

function getBannerTintSettingsForCourse(courseId) {
  if (!courseId) return { ...MGC_BANNER_TINT_DEFAULTS };
  const map = getBannerTintMap();
  return normalizeBannerTintSettings(map[courseId]);
}

function saveBannerTintSettingsForCourse(courseId, settings) {
  if (!courseId) return;
  const map = getBannerTintMap();
  map[courseId] = normalizeBannerTintSettings(settings);
  saveBannerTintMap(map);
}

function applyBannerTintToCard(card, settings) {
  if (!card) return;
  const safe = normalizeBannerTintSettings(settings);
  const elements = [];
  try {
    card.style.setProperty('--mgc-banner-tint-background', hexToRgba(safe.color, safe.opacity));
  } catch (e) {}

  card.querySelectorAll('.slDfNd.ZmqAt.z07MGc').forEach((el) => {
    elements.push(el);
  });

  elements.forEach((el) => {
    try {
      el.style.removeProperty('--mgc-banner-tint-color');
      el.style.removeProperty('--mgc-banner-tint-opacity');
    } catch (e) {}
  });
}

function applyBannerTintToStreamForCourse(courseId, settings) {
  if (!courseId) return;
  const safe = normalizeBannerTintSettings(settings);

  const selectors = [
    `.PFLqgc.KFl4Z[data-mgc-bg-course="${courseId}"]`,
    `.vFkiub.KFl4Z[data-mgc-bg-course="${courseId}"]`,
    `.PFLqgc.PagUde[data-mgc-bg-course="${courseId}"]`,
    `.vFkiub.PagUde[data-mgc-bg-course="${courseId}"]`
  ];

  selectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((banner) => {
      try {
        banner.style.removeProperty('--mgc-banner-tint-color');
        banner.style.removeProperty('--mgc-banner-tint-opacity');
      } catch (e) {}

      const wrapper = banner.closest('.qyN25') || banner.parentElement;
      if (wrapper) {
        wrapper.querySelectorAll('.T4tcpe').forEach((t4) => {
          try {
            t4.style.removeProperty('--mgc-banner-tint-color');
            t4.style.removeProperty('--mgc-banner-tint-opacity');
            t4.style.setProperty('--mgc-banner-tint-background', hexToRgba(safe.color, safe.opacity));
          } catch (e) {}
        });
      }
    });
  });

  // Also apply tints to any visible banner/header elements even if they don't
  // have the data-mgc-bg-course attribute yet (this happens when the tint is
  // changed without changing the background image). We only do this for the
  // active course to avoid affecting other pages.
  try {
    const activeId = typeof getActiveSidebarCourseId === 'function' ? getActiveSidebarCourseId() : null;
    if (activeId === courseId) {
      const banners = document.querySelectorAll('.PFLqgc, .vFkiub, header[role="banner"]');
      banners.forEach((b) => {
        try {
          b.style.removeProperty('--mgc-banner-tint-color');
          b.style.removeProperty('--mgc-banner-tint-opacity');
          b.style.removeProperty('--mgc-banner-tint-color-rgba');
        } catch (e) {}

        const streamWrapper = b.closest('.qyN25') || b.parentElement;
        if (streamWrapper) {
          streamWrapper.querySelectorAll('.T4tcpe').forEach((t4) => {
            try {
              t4.style.removeProperty('--mgc-banner-tint-color');
              t4.style.removeProperty('--mgc-banner-tint-opacity');
              t4.style.setProperty('--mgc-banner-tint-background', hexToRgba(safe.color, safe.opacity));
            } catch (e) {}
          });
        }
      });
    }
  } catch (e) {}
}

function applyStoredBannerTints() {
  const map = getBannerTintMap();
  document.querySelectorAll('li[data-course-id]').forEach((cardEl) => {
    const courseId = cardEl && cardEl.dataset ? cardEl.dataset.courseId : null;
    const settings = courseId && map[courseId]
      ? normalizeBannerTintSettings(map[courseId])
      : MGC_BANNER_TINT_DEFAULTS;
    applyBannerTintToCard(cardEl, settings);
  });
}

applyStoredBannerTints();

let __mgcBannerTintApplyQueued = false;
function queueApplyStoredBannerTints() {
  if (__mgcBannerTintApplyQueued) return;
  __mgcBannerTintApplyQueued = true;
  requestAnimationFrame(() => {
    __mgcBannerTintApplyQueued = false;
    try { applyStoredBannerTints(); } catch (e) {}
  });
}

if (!window.__mgcBannerTintObserverBound) {
  window.__mgcBannerTintObserverBound = true;
  try {
    const observer = new MutationObserver(() => {
      queueApplyStoredBannerTints();
    });
    observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
  } catch (e) {}
}

function openImagePickerForCard(card, triggerEl) {
  closeImagePicker();

  const targetDiv = card.querySelector('.OjOEXb');
  if (!targetDiv) return; 

  try {
    const courseId = card && card.dataset ? card.dataset.courseId : null;
    applyBannerTintToCard(card, getBannerTintSettingsForCourse(courseId));
  } catch (e) {}

  const THEME_IMAGES = [
    "https://www.gstatic.com/classroom/themes/Biology.jpg",
    "https://www.gstatic.com/classroom/themes/Chemistry.jpg",
    "https://www.gstatic.com/classroom/themes/Design.jpg",
    "https://www.gstatic.com/classroom/themes/Economics.jpg",
    "https://www.gstatic.com/classroom/themes/English.jpg",
    "https://www.gstatic.com/classroom/themes/Geography.jpg",
    "https://www.gstatic.com/classroom/themes/Geometry.jpg",
    "https://www.gstatic.com/classroom/themes/LanguageArts.jpg",
    "https://www.gstatic.com/classroom/themes/Math.jpg",
    "https://www.gstatic.com/classroom/themes/Physics.jpg",
    "https://www.gstatic.com/classroom/themes/Psychology.jpg",
    "https://www.gstatic.com/classroom/themes/SocialStudies.jpg",
    "https://www.gstatic.com/classroom/themes/USHistory.jpg",
    "https://www.gstatic.com/classroom/themes/WorldHistory.jpg",
    "https://www.gstatic.com/classroom/themes/WorldStudies.jpg",
    "https://www.gstatic.com/classroom/themes/Writing.jpg",
    "https://www.gstatic.com/classroom/themes/img_americanfootball.jpg",
    "https://www.gstatic.com/classroom/themes/img_arts.jpg",
    "https://www.gstatic.com/classroom/themes/img_athleticsjumping.jpg",
    "https://www.gstatic.com/classroom/themes/img_bbq.jpg",
    "https://www.gstatic.com/classroom/themes/img_billiard.jpg",
    "https://www.gstatic.com/classroom/themes/img_birthday.jpg",
    "https://www.gstatic.com/classroom/themes/img_bowling.jpg",
    "https://www.gstatic.com/classroom/themes/img_boxing.jpg",
    "https://www.gstatic.com/classroom/themes/img_camping.jpg",
    "https://www.gstatic.com/classroom/themes/img_carmaintenance.jpg",
    "https://www.gstatic.com/classroom/themes/img_cinema.jpg",
    "https://www.gstatic.com/classroom/themes/img_climbing.jpg",
    "https://www.gstatic.com/classroom/themes/img_coffee.jpg",
    "https://www.gstatic.com/classroom/themes/img_concert.jpg",
    "https://www.gstatic.com/classroom/themes/img_cooking.jpg",
    "https://www.gstatic.com/classroom/themes/img_cricket.jpg",
    "https://www.gstatic.com/classroom/themes/img_cycling.jpg",
    "https://www.gstatic.com/classroom/themes/img_cyclingbmx.jpg",
    "https://www.gstatic.com/classroom/themes/img_dancing.jpg",
    "https://www.gstatic.com/classroom/themes/img_equestrian.jpg",
    "https://www.gstatic.com/classroom/themes/img_fencing.jpg",
    "https://www.gstatic.com/classroom/themes/img_gamenight.jpg",
    "https://www.gstatic.com/classroom/themes/img_golf.jpg",
    "https://www.gstatic.com/classroom/themes/img_gym.jpg",
    "https://www.gstatic.com/classroom/themes/img_haircut.jpg",
    "https://www.gstatic.com/classroom/themes/img_handcraft.jpg",
    "https://www.gstatic.com/classroom/themes/img_hiking.jpg",
    "https://www.gstatic.com/classroom/themes/img_hobby.jpg",
    "https://www.gstatic.com/classroom/themes/img_karate.jpg",
    "https://www.gstatic.com/classroom/themes/img_kayaking.jpg",
    "https://www.gstatic.com/classroom/themes/img_learninstrument.jpg",
    "https://www.gstatic.com/classroom/themes/img_mealfamily.jpg",
    "https://www.gstatic.com/classroom/themes/img_oilchange.jpg",
    "https://www.gstatic.com/classroom/themes/img_pingpong.jpg",
    "https://www.gstatic.com/classroom/themes/img_repair.jpg",
    "https://www.gstatic.com/classroom/themes/img_rowing.jpg",
    "https://www.gstatic.com/classroom/themes/img_sailing.jpg",
    "https://www.gstatic.com/classroom/themes/img_soccer.jpg",
    "https://www.gstatic.com/classroom/themes/img_swimming.jpg",
    "https://www.gstatic.com/classroom/themes/img_tennis.jpg",
    "https://www.gstatic.com/classroom/themes/img_theatreopera.jpg",
    "https://www.gstatic.com/classroom/themes/img_triathlon.jpg",
    "https://www.gstatic.com/classroom/themes/img_videogaming.jpg",
    "https://www.gstatic.com/classroom/themes/img_violin2.jpg",
    "https://www.gstatic.com/classroom/themes/img_volleyball.jpg",
    "https://www.gstatic.com/classroom/themes/img_walkingdog.jpg",
    "https://www.gstatic.com/classroom/themes/img_waterpolo.jpg",
    "https://www.gstatic.com/classroom/themes/img_wrestling.jpg"
  ];

  const urlArrBase = Array.from(new Set(THEME_IMAGES.filter(Boolean)));
  const CUSTOM_MARKER = '__MGC_CUSTOM_URL__';
  const urlArr = [CUSTOM_MARKER, ...urlArrBase];
  const bannerImagesIconUrl = chrome.runtime.getURL('Icons/bannerimages.svg');
  const bannerTintIconUrl = chrome.runtime.getURL('Icons/bannertint.svg');
  const bannerResetIconUrl = chrome.runtime.getURL('Icons/bannerreset.svg');
  const bannerCloseIconUrl = chrome.runtime.getURL('Icons/bannerclose.svg');

  const popup = document.createElement('div');
  popup.className = 'image-picker-popup';
  popup.setAttribute('role', 'dialog');
  popup.setAttribute('aria-label', 'Banner picker');

  const panel = document.createElement('div');
  panel.className = 'image-picker-panel';

  const previewShell = document.createElement('div');
  previewShell.className = 'image-picker-preview-shell';

  const previewLabel = document.createElement('div');
  previewLabel.className = 'image-picker-preview-label';
  previewLabel.textContent = 'Preview';

  const previewFrame = document.createElement('div');
  previewFrame.className = 'image-picker-preview-frame';

  const preview = document.createElement('div');
  preview.className = 'image-picker-preview';

  const previewTint = document.createElement('div');
  previewTint.className = 'image-picker-preview-tint';

  previewFrame.appendChild(preview);
  previewFrame.appendChild(previewTint);
  previewShell.appendChild(previewLabel);
  previewShell.appendChild(previewFrame);

  const content = document.createElement('div');
  content.className = 'image-picker-content';

  panel.appendChild(previewShell);
  panel.appendChild(content);
  popup.appendChild(panel);

  const actionControls = document.createElement('div');
  actionControls.className = 'image-picker-control-island image-picker-action-island';
  popup.appendChild(actionControls);

  const tabControls = document.createElement('div');
  tabControls.className = 'image-picker-control-island image-picker-tab-island';
  popup.appendChild(tabControls);

  const bannerTabBtn = document.createElement('button');
  bannerTabBtn.type = 'button';
  bannerTabBtn.className = 'image-picker-side-button active';
  bannerTabBtn.innerHTML = `<img class="image-picker-side-button-icon" src="${bannerImagesIconUrl}" alt="" aria-hidden="true">`;
  bannerTabBtn.setAttribute('aria-label', 'Banners');
  bannerTabBtn.setAttribute('aria-pressed', 'true');

  const tintTabBtn = document.createElement('button');
  tintTabBtn.type = 'button';
  tintTabBtn.className = 'image-picker-side-button';
  tintTabBtn.innerHTML = `<img class="image-picker-side-button-icon" src="${bannerTintIconUrl}" alt="" aria-hidden="true">`;
  tintTabBtn.setAttribute('aria-label', 'Tints');
  tintTabBtn.setAttribute('aria-pressed', 'false');

  tabControls.appendChild(bannerTabBtn);
  tabControls.appendChild(tintTabBtn);
  // Close button to dismiss the picker
  const closeBtn = document.createElement('button');
  closeBtn.className = 'image-picker-side-icon-button image-picker-close';
  closeBtn.type = 'button';
  closeBtn.innerHTML = `<img class="image-picker-side-button-icon" src="${bannerCloseIconUrl}" alt="" aria-hidden="true">`;
  closeBtn.setAttribute('aria-label', 'Close image picker');
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeImagePicker();
  });
  actionControls.appendChild(closeBtn);

  function extractCurrentBannerUrl() {
    try {
      const inlineBg = targetDiv.style.getPropertyValue('background-image');
      const inlineUrl = extractUrlFromCss(inlineBg);
      if (inlineUrl) return inlineUrl;
    } catch (e) {}
    try {
      const computedBg = getComputedStyle(targetDiv).backgroundImage;
      const computedUrl = extractUrlFromCss(computedBg);
      if (computedUrl) return computedUrl;
    } catch (e) {}
    return '';
  }

  function updatePreview() {
    const bannerUrl = extractCurrentBannerUrl();
    if (bannerUrl) {
      preview.style.setProperty('background-image', `url("${bannerUrl}")`, 'important');
    } else {
      preview.style.removeProperty('background-image');
    }
    preview.style.setProperty('background-size', 'cover', 'important');
    preview.style.setProperty('background-position', 'center center', 'important');
    preview.style.setProperty('background-repeat', 'no-repeat', 'important');

    try {
      const courseKey = card && card.dataset ? card.dataset.courseId : null;
      const tint = normalizeBannerTintSettings(getBannerTintSettingsForCourse(courseKey));
      previewTint.style.backgroundColor = tint.color;
      previewTint.style.opacity = String(tint.opacity);
    } catch (e) {
      previewTint.style.backgroundColor = MGC_BANNER_TINT_DEFAULTS.color;
      previewTint.style.opacity = String(MGC_BANNER_TINT_DEFAULTS.opacity);
    }
  }

  function renderTintPanel() {
    const currentCourseId = card && card.dataset ? card.dataset.courseId : null;
    const current = getBannerTintSettingsForCourse(currentCourseId);
    content.innerHTML = '';

    const tintPanel = document.createElement('div');
    tintPanel.className = 'image-picker-paint-panel';

    const topRow = document.createElement('div');
    topRow.className = 'image-picker-paint-top-row';

    const leftGroup = document.createElement('div');
    leftGroup.className = 'image-picker-paint-left-group';

    const title = document.createElement('div');
    title.className = 'image-picker-custom-title image-picker-paint-title';
    title.textContent = 'Tint';
    leftGroup.appendChild(title);

    const hexInput = document.createElement('input');
    hexInput.type = 'text';
    hexInput.className = 'home-hex-input image-picker-paint-hex';
    hexInput.placeholder = '#RRGGBB';
    leftGroup.appendChild(hexInput);

    topRow.appendChild(leftGroup);
    tintPanel.appendChild(topRow);

    const colorSection = document.createElement('div');
    colorSection.className = 'home-color-picker-section image-picker-paint-color-section';

    const svWrapper = document.createElement('div');
    svWrapper.className = 'home-sv-wrapper';

    const svCanvas = document.createElement('canvas');
    svCanvas.className = 'home-sv-canvas';
    svCanvas.width = 280;
    svCanvas.height = 200;

    const svMarker = document.createElement('div');
    svMarker.className = 'home-sv-marker';

    svWrapper.appendChild(svCanvas);
    svWrapper.appendChild(svMarker);
    colorSection.appendChild(svWrapper);

    const hueSlider = document.createElement('input');
    hueSlider.type = 'range';
    hueSlider.min = '0';
    hueSlider.max = '360';
    hueSlider.className = 'home-hue-slider';
    colorSection.appendChild(hueSlider);

    tintPanel.appendChild(colorSection);

    const opacityRow = document.createElement('div');
    opacityRow.className = 'image-picker-paint-row';
    const opacityLabel = document.createElement('label');
    opacityLabel.className = 'image-picker-paint-label';
    opacityLabel.textContent = 'Opacity';
    const opacityPreview = document.createElement('div');
    opacityPreview.className = 'image-picker-paint-opacity-preview';
    const opacityControls = document.createElement('div');
    opacityControls.className = 'image-picker-paint-opacity-controls';

    const opacitySlider = document.createElement('input');
    opacitySlider.type = 'range';
    opacitySlider.min = '0';
    opacitySlider.max = '1';
    opacitySlider.step = '0.01';
    opacitySlider.value = String(current.opacity);
    opacitySlider.className = 'image-picker-paint-opacity-slider';

    const opacityNumber = document.createElement('input');
    opacityNumber.type = 'number';
    opacityNumber.min = '0';
    opacityNumber.max = '1';
    opacityNumber.step = '0.01';
    opacityNumber.value = String(current.opacity);
    opacityNumber.className = 'image-picker-paint-opacity-number';

    opacityControls.appendChild(opacitySlider);
    opacityControls.appendChild(opacityNumber);
    opacityRow.appendChild(opacityLabel);
    opacityRow.appendChild(opacityPreview);
    opacityRow.appendChild(opacityControls);
    tintPanel.appendChild(opacityRow);

    function localHsvToRgb(h, s, v) {
      const c = v * s;
      const hh = (h / 60) % 6;
      const x = c * (1 - Math.abs((hh % 2) - 1));
      let r1 = 0; let g1 = 0; let b1 = 0;
      if (0 <= hh && hh < 1) { r1 = c; g1 = x; b1 = 0; }
      else if (1 <= hh && hh < 2) { r1 = x; g1 = c; b1 = 0; }
      else if (2 <= hh && hh < 3) { r1 = 0; g1 = c; b1 = x; }
      else if (3 <= hh && hh < 4) { r1 = 0; g1 = x; b1 = c; }
      else if (4 <= hh && hh < 5) { r1 = x; g1 = 0; b1 = c; }
      else { r1 = c; g1 = 0; b1 = x; }
      const m = v - c;
      return {
        r: Math.round((r1 + m) * 255),
        g: Math.round((g1 + m) * 255),
        b: Math.round((b1 + m) * 255)
      };
    }

    function localRgbToHex(r, g, b) {
      const toHex = (n) => {
        const hex = Math.max(0, Math.min(255, n)).toString(16);
        return hex.length === 1 ? `0${hex}` : hex;
      };
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    function localHexToHsv(hex) {
      let r = 0; let g = 0; let b = 0;
      if (hex.length === 4) {
        r = parseInt(hex[1] + hex[1], 16);
        g = parseInt(hex[2] + hex[2], 16);
        b = parseInt(hex[3] + hex[3], 16);
      } else if (hex.length === 7) {
        r = parseInt(hex.slice(1, 3), 16);
        g = parseInt(hex.slice(3, 5), 16);
        b = parseInt(hex.slice(5, 7), 16);
      }

      const r1 = r / 255;
      const g1 = g / 255;
      const b1 = b / 255;
      const max = Math.max(r1, g1, b1);
      const min = Math.min(r1, g1, b1);
      const d = max - min;
      let h = 0;
      if (d === 0) h = 0;
      else if (max === r1) h = ((g1 - b1) / d) % 6;
      else if (max === g1) h = (b1 - r1) / d + 2;
      else h = (r1 - g1) / d + 4;
      h = Math.round(h * 60);
      if (h < 0) h += 360;
      const s = max === 0 ? 0 : d / max;
      const v = max;
      return { h, s, v };
    }

    function commit(nextColor, nextOpacity) {
      const settings = normalizeBannerTintSettings({ color: nextColor, opacity: nextOpacity });
      applyBannerTintToCard(card, settings);
      saveBannerTintSettingsForCourse(currentCourseId, settings);
      applyBannerTintToStreamForCourse(currentCourseId, settings);
      updatePreview();
      updateOpacityPreview(settings.color, settings.opacity);
    }

    function updateOpacityPreview(color, opacity) {
      const nextOpacity = Math.max(0, Math.min(1, Number(opacity) || 0));
      opacityPreview.style.setProperty('--image-picker-opacity-color', color || MGC_BANNER_TINT_DEFAULTS.color);
      opacityPreview.style.setProperty('--image-picker-opacity-alpha', String(nextOpacity));
      opacitySlider.style.setProperty('--image-picker-opacity-color', color || MGC_BANNER_TINT_DEFAULTS.color);
      opacitySlider.style.setProperty('--image-picker-opacity-alpha', String(nextOpacity));
    }

    let currentH = 0;
    let currentS = 1;
    let currentV = 1;

    try {
      const hsv = localHexToHsv(current.color || MGC_BANNER_TINT_DEFAULTS.color);
      currentH = hsv.h;
      currentS = hsv.s;
      currentV = hsv.v;
    } catch (e) {}

    hueSlider.value = String(currentH);
    hexInput.value = current.color || MGC_BANNER_TINT_DEFAULTS.color;
    updateOpacityPreview(current.color || MGC_BANNER_TINT_DEFAULTS.color, current.opacity);

    function drawSvBox() {
      const ctx = svCanvas.getContext('2d');
      if (!ctx) return;
      const width = svCanvas.width;
      const height = svCanvas.height;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = `hsl(${currentH}, 100%, 50%)`;
      ctx.fillRect(0, 0, width, height);

      const whiteGrad = ctx.createLinearGradient(0, 0, width, 0);
      whiteGrad.addColorStop(0, 'rgba(255,255,255,1)');
      whiteGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = whiteGrad;
      ctx.fillRect(0, 0, width, height);

      const blackGrad = ctx.createLinearGradient(0, 0, 0, height);
      blackGrad.addColorStop(0, 'rgba(0,0,0,0)');
      blackGrad.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.fillStyle = blackGrad;
      ctx.fillRect(0, 0, width, height);
    }

    function updateMarkerPosition() {
      const width = svCanvas.offsetWidth || 280;
      const height = svCanvas.offsetHeight || 120;
      svMarker.style.left = `${currentS * width}px`;
      svMarker.style.top = `${(1 - currentV) * height}px`;
    }

    function updateColorFromHsv() {
      const { r, g, b } = localHsvToRgb(currentH, currentS, currentV);
      const hex = localRgbToHex(r, g, b);
      if (document.activeElement !== hexInput) {
        hexInput.value = hex;
      }
      commit(hex, opacitySlider.value);
    }

    function handleSvInput(clientX, clientY) {
      const rect = svCanvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
      currentS = x / rect.width;
      currentV = 1 - (y / rect.height);
      updateMarkerPosition();
      updateColorFromHsv();
    }

    hueSlider.addEventListener('input', (e) => {
      currentH = Number(e.target.value);
      drawSvBox();
      updateColorFromHsv();
    });

    let isDraggingSv = false;
    svWrapper.addEventListener('pointerdown', (e) => {
      isDraggingSv = true;
      try { svWrapper.setPointerCapture(e.pointerId); } catch (err) {}
      handleSvInput(e.clientX, e.clientY);
      e.preventDefault();
    });

    svWrapper.addEventListener('pointermove', (e) => {
      if (!isDraggingSv) return;
      handleSvInput(e.clientX, e.clientY);
      e.preventDefault();
    });

    function stopSvDrag(e) {
      isDraggingSv = false;
      try { svWrapper.releasePointerCapture(e.pointerId); } catch (err) {}
    }

    svWrapper.addEventListener('pointerup', stopSvDrag);
    svWrapper.addEventListener('pointercancel', stopSvDrag);

    hexInput.addEventListener('input', () => {
      const val = hexInput.value.trim();
      if (!/^#[0-9A-Fa-f]{6}$/.test(val)) return;
      const hsv = localHexToHsv(val);
      currentH = hsv.h;
      currentS = hsv.s;
      currentV = hsv.v;
      hueSlider.value = String(currentH);
      drawSvBox();
      updateMarkerPosition();
      commit(val, opacitySlider.value);
    });

    drawSvBox();
    updateMarkerPosition();

    opacitySlider.addEventListener('input', () => {
      opacityNumber.value = opacitySlider.value;
      commit(hexInput.value, opacitySlider.value);
    });

    opacityNumber.addEventListener('input', () => {
      const parsed = Math.max(0, Math.min(1, Number(opacityNumber.value) || 0));
      opacitySlider.value = String(parsed);
      commit(hexInput.value, parsed);
    });

    content.appendChild(tintPanel);
  }

  function renderBannerGrid() {
    content.innerHTML = '';

    const grid = document.createElement('div');
    grid.className = 'image-picker-grid';

    const savedForCourse = getSavedBackgroundForCourse(card.dataset.courseId);
    const courseKey = card.dataset.courseId;
    const defaultForCourse = getDefaultBackgroundForCourse(courseKey);

    const resetItem = document.createElement('button');
    resetItem.type = 'button';
    resetItem.className = 'image-picker-item image-picker-reset';
    resetItem.setAttribute('aria-label', 'Reset background to default');
    if (defaultForCourse) {
      resetItem.style.setProperty('background-image', `url("${defaultForCourse}")`, 'important');
      resetItem.style.setProperty('background-size', 'cover', 'important');
      resetItem.style.setProperty('background-position', 'center center', 'important');
      resetItem.style.setProperty('background-repeat', 'no-repeat', 'important');
    }

    if (!savedForCourse) {
      resetItem.classList.add('selected');
    }

    const resetShade = document.createElement('div');
    resetShade.className = 'image-picker-reset-shade';
    const resetInner = document.createElement('div');
    resetInner.className = 'image-picker-reset-inner';
    const resetSubtitle = document.createElement('div');
    resetSubtitle.className = 'image-picker-reset-subtitle';
    resetSubtitle.textContent = 'Default Banner';
    resetInner.appendChild(resetSubtitle);
    resetItem.appendChild(resetShade);
    resetItem.appendChild(resetInner);

    resetItem.addEventListener('click', (e) => {
      e.stopPropagation();
      try {
        if (courseKey && getSavedBackgroundForCourse(courseKey)) {
          setSavedBackgroundForCourse(courseKey, null);
        }

        const bgDiv = card.querySelector('.OjOEXb');
        if (bgDiv && defaultForCourse) {
          bgDiv.style.setProperty('background-image', `url("${defaultForCourse}")`, 'important');
          bgDiv.style.setProperty('background-size', 'cover', 'important');
          bgDiv.style.setProperty('background-position', 'center center', 'important');
          bgDiv.style.setProperty('background-repeat', 'no-repeat', 'important');
        } else if (bgDiv) {
          bgDiv.style.removeProperty('background-image');
          bgDiv.style.removeProperty('background-size');
          bgDiv.style.removeProperty('background-position');
          bgDiv.style.removeProperty('background-repeat');
        }
      } catch (err) {}

      renderBannerGrid();
      try { updateHeaderBackgroundForActiveCourse(); } catch (err) {}
      try { updatePreview(); } catch (err) {}
    });

    grid.appendChild(resetItem);

// Ensure we have an IntersectionObserver for lazy-loading thumbnails
    if (!__imagePickerThumbObserver) {
      __imagePickerThumbObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          const img = entry.target;
          if (entry.isIntersecting || entry.intersectionRatio > 0) {
            try {
              if (img.dataset && img.dataset.src) {
                img.src = img.dataset.src;
                img.removeAttribute('data-src');
                perfLog('thumb-loaded');
              }
              __imagePickerThumbObserver.unobserve(img);
            } catch (e) {}
          }
        });
      }, { root: null, rootMargin: '200px', threshold: 0.01 });
    }

    urlArr.forEach(url => {
      // Render the custom URL tile when the marker is encountered
      if (url === CUSTOM_MARKER) {
        try {
          const customItem = document.createElement('div');
          customItem.className = 'image-picker-item image-picker-custom';
          const customInner = document.createElement('div');
          customInner.className = 'image-picker-custom-inner';

          const isSavedCustom = savedForCourse && !urlArrBase.includes(savedForCourse) && !isBuiltInThemeUrl(savedForCourse);

          // Edit button (appears on hover when a custom URL exists)
          const editBtn = document.createElement('button');
          editBtn.type = 'button';
          editBtn.className = 'image-picker-edit';
          editBtn.setAttribute('aria-label','Edit custom URL');
          editBtn.innerHTML = `<img class="image-picker-btn-icon" src="${chrome.runtime.getURL('Icons/Edit.svg')}" alt="">`;

          // palette button removed from individual tiles; tint handled by dedicated Tint tile

          if (isSavedCustom) {
            customItem.style.setProperty('background-image', `url("${savedForCourse}")`, 'important');
            customItem.style.setProperty('background-size', 'cover', 'important');
            customItem.style.setProperty('background-position', 'center center', 'important');
            customItem.style.setProperty('background-repeat', 'no-repeat', 'important');
            customItem.classList.add('selected');
            // show edit icon
            customItem.appendChild(editBtn);
          } else {
            const plus = document.createElement('div'); plus.className = 'image-picker-plus'; plus.textContent = '+'; customInner.appendChild(plus);
          }

          customItem.appendChild(customInner);

          function openCustomInput() {
            // Hide all other banner items to make the custom tile take over
            customItem.classList.add('editing-expanded');
            grid.querySelectorAll('.image-picker-item:not(.image-picker-custom)').forEach(item => {
              item.style.display = 'none';
            });

            // Store and hide preview background while editing
            try {
              const prevBg = customItem.style.getPropertyValue('background-image') || '';
              customItem.dataset.prevBackground = prevBg;
              customItem.style.removeProperty('background-image');
              customItem.style.removeProperty('background-size');
              customItem.style.removeProperty('background-position');
              customItem.style.removeProperty('background-repeat');
            } catch (e) {}

            // hide edit icon while editing
            try { editBtn.style.display = 'none'; } catch (e) {}

            // Reset visual selection so input is full opacity and size
            try { customItem.classList.remove('selected'); } catch (e) {}
            customItem.style.opacity = '1';
            customItem.style.transform = 'none';

            customInner.innerHTML = '';

            // Create expanded edit UI header with title left and close right
            const topRow = document.createElement('div');
            topRow.className = 'image-picker-custom-top-row';

            const title = document.createElement('div');
            title.className = 'image-picker-custom-title image-picker-custom-title-main';
            title.textContent = 'Custom Banner';

            const backBtn = document.createElement('button');
            backBtn.type = 'button';
            backBtn.className = 'image-picker-paint-close image-picker-custom-close';
            backBtn.textContent = '×';
            backBtn.setAttribute('aria-label', 'Close custom banner settings');

            topRow.appendChild(title);
            topRow.appendChild(backBtn);
            customInner.appendChild(topRow);

            const inputLabel = document.createElement('label');
            inputLabel.className = 'image-picker-custom-section-label';
            inputLabel.textContent = 'Image URL';
            customInner.appendChild(inputLabel);

            const input = document.createElement('textarea');
            input.placeholder = "Paste an image URL here from 'Copy image address'";
            input.value = isSavedCustom ? savedForCourse : '';
            input.className = 'image-picker-custom-input';
            input.rows = 4;
            input.setAttribute('spellcheck', 'false');
            customInner.appendChild(input);

            const actionRow = document.createElement('div');
            actionRow.className = 'image-picker-custom-actions';

            const saveActionBtn = document.createElement('button');
            saveActionBtn.type = 'button';
            saveActionBtn.className = 'image-picker-custom-action image-picker-custom-action-save';
            saveActionBtn.textContent = 'Apply';
            saveActionBtn.addEventListener('click', (ev) => {
              ev.stopPropagation();
              saveFn();
            });

            actionRow.appendChild(saveActionBtn);
            customInner.appendChild(actionRow);

            const recentUrls = getRecentCustomBannerUrls();
            if (recentUrls.length > 0) {
              const historySection = document.createElement('div');
              historySection.className = 'image-picker-custom-history';

              const historyLabel = document.createElement('div');
              historyLabel.className = 'image-picker-custom-section-label';
              historyLabel.textContent = 'Recent';
              historySection.appendChild(historyLabel);

              const historyList = document.createElement('div');
              historyList.className = 'image-picker-custom-history-list';

              recentUrls.forEach((recentUrl) => {
                const historyBtn = document.createElement('button');
                historyBtn.type = 'button';
                historyBtn.className = 'image-picker-custom-history-item';
                historyBtn.title = recentUrl;
                historyBtn.style.setProperty('background-image', `url("${recentUrl}")`, 'important');
                historyBtn.style.setProperty('background-size', 'cover', 'important');
                historyBtn.style.setProperty('background-position', 'center center', 'important');
                historyBtn.style.setProperty('background-repeat', 'no-repeat', 'important');

                historyBtn.addEventListener('click', (ev) => {
                  ev.stopPropagation();
                  input.value = recentUrl;
                  try {
                    input.focus();
                    input.setSelectionRange(0, input.value.length);
                  } catch (e) {}
                });
                historyList.appendChild(historyBtn);
              });

              historySection.appendChild(historyList);
              customInner.appendChild(historySection);
            }

            setTimeout(()=> { try { input.focus({ preventScroll: true }); input.setSelectionRange(0, input.value.length); } catch (e) {} }, 20);

            let isClosingCustomEditor = false;

            const cancelFn = () => {
              isClosingCustomEditor = true;
              // Show all other banner items again
              customItem.classList.remove('editing-expanded');
              grid.querySelectorAll('.image-picker-item:not(.image-picker-custom)').forEach(item => {
                item.style.display = '';
              });

               // Clear the editing UI first
               customInner.innerHTML = '';

              // restore previous preview if there was one
              try {
                const prev = customItem.dataset.prevBackground;
                if (prev) {
                  customItem.style.setProperty('background-image', prev, 'important');
                  customItem.style.setProperty('background-size', 'cover', 'important');
                  customItem.style.setProperty('background-position', 'center center', 'important');
                  customItem.style.setProperty('background-repeat', 'no-repeat', 'important');
                  customItem.classList.add('selected');
                  if (!customItem.querySelector('.image-picker-edit')) customItem.appendChild(editBtn);
                  // restore edit icon visibility
                  try { editBtn.style.removeProperty('display'); } catch (e) {}
                } else {
                   const plus = document.createElement('div'); 
                   plus.className = 'image-picker-plus'; 
                   plus.textContent = '+'; 
                   customInner.appendChild(plus);
                }
                customItem.style.removeProperty('opacity');
                customItem.style.removeProperty('transform');
              } catch (e) {}
            };

            const saveFn = () => {
              const val = input.value.trim();
              
              // Show all other banner items again
              customItem.classList.remove('editing-expanded');
              grid.querySelectorAll('.image-picker-item:not(.image-picker-custom)').forEach(item => {
                item.style.display = '';
              });

              if (!val) {
                if (isSavedCustom) { setSavedBackgroundForCourse(courseKey, null); const bgDiv = card.querySelector('.OjOEXb'); if (bgDiv) { bgDiv.style.removeProperty('background-image'); bgDiv.style.removeProperty('background-size'); bgDiv.style.removeProperty('background-position'); bgDiv.style.removeProperty('background-repeat'); } try { grid.querySelectorAll('.image-picker-item.selected').forEach(el => el.classList.remove('selected')); } catch(e){} renderBannerGrid(); updateHeaderBackgroundForActiveCourse(); updatePreview(); return; }
                 customInner.innerHTML = ''; 
                 const plus = document.createElement('div'); 
                 plus.className = 'image-picker-plus'; 
                 plus.textContent = '+'; 
                 customInner.appendChild(plus); 
                 return;
              }

              if (!/^https?:\/\//i.test(val)) { 
                // Show error but don't close expanded view
                customItem.classList.add('editing-expanded');
                grid.querySelectorAll('.image-picker-item:not(.image-picker-custom)').forEach(item => {
                  item.style.display = 'none';
                });
                const err = document.createElement('div'); 
                err.className = 'image-picker-custom-error'; 
                err.textContent = 'Enter a valid http(s) URL'; 
                customInner.appendChild(err); 
                return; 
              }

              try {
                const bgDiv = card.querySelector('.OjOEXb');
                if (bgDiv) { bgDiv.style.setProperty('background-image', `url("${val}")`, 'important'); bgDiv.style.setProperty('background-size', 'cover', 'important'); bgDiv.style.setProperty('background-position', 'center center', 'important'); bgDiv.style.setProperty('background-repeat', 'no-repeat', 'important'); }
                
                setSavedBackgroundForCourse(courseKey, val);
                saveRecentCustomBannerUrl(val);
                try { grid.querySelectorAll('.image-picker-item.selected').forEach(el => el.classList.remove('selected')); } catch(e){}
                customItem.classList.add('selected');
                customInner.innerHTML = '';
                customItem.style.setProperty('background-image', `url("${val}")`, 'important');
                customItem.style.setProperty('background-size', 'cover', 'important');
                customItem.style.setProperty('background-position', 'center center', 'important');
                customItem.style.setProperty('background-repeat', 'no-repeat', 'important');
                // ensure edit icon present
                if (!customItem.querySelector('.image-picker-edit')) customItem.appendChild(editBtn);
                // ensure edit icon visible again
                try { editBtn.style.removeProperty('display'); } catch (e) {}
                // remove inline overrides
                customItem.style.removeProperty('opacity');
                customItem.style.removeProperty('transform');
              } catch(e){}

              updateHeaderBackgroundForActiveCourse();
              updatePreview();
            };

            input.addEventListener('keydown', (ev) => {
              if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') {
                ev.preventDefault();
                saveFn();
              } else if (ev.key === 'Escape') {
                ev.preventDefault();
                cancelFn();
              }
            });

            input.addEventListener('focus', () => {
              window.requestAnimationFrame(() => {
                try { input.setSelectionRange(0, input.value.length); } catch (e) {}
              });
            });

            // Keep the editor open when clicking around inside the custom panel.
            customItem.addEventListener('mousedown', (ev) => {
              const target = ev.target;
              if (!(target instanceof Element)) return;
              if (
                target === input
                || target.closest('.image-picker-custom-close')
                || target.closest('.image-picker-custom-action')
                || target.closest('.image-picker-custom-history-item')
              ) {
                return;
              }
              if (!target.closest('textarea')) {
                ev.preventDefault();
              }
            });
            
            // Back button handler
            backBtn.addEventListener('mousedown', () => { isClosingCustomEditor = true; });
            backBtn.addEventListener('click', (ev) => { ev.stopPropagation(); cancelFn(); });
          }

          // Click behaviour: if saved, clicking applies the saved url; edit button opens input
          customItem.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (customInner.querySelector('textarea')) { try { customInner.querySelector('textarea').focus(); } catch(e){} return; }


            if (isSavedCustom) {
              // if user clicked edit button, open input
              if (ev.target.closest('.image-picker-edit')) { openCustomInput(); return; }

              // otherwise apply saved banner
              try {
                const urlToSet = savedForCourse;
                const bgDiv = card.querySelector('.OjOEXb');
                if (bgDiv) {
                  bgDiv.style.setProperty('background-image', `url("${urlToSet}")`, 'important');
                  bgDiv.style.setProperty('background-size', 'cover', 'important');
                  bgDiv.style.setProperty('background-position', 'center center', 'important');
                  bgDiv.style.setProperty('background-repeat', 'no-repeat', 'important');
                }
                const courseKey2 = card && card.dataset && card.dataset.courseId;
                if (courseKey2) setSavedBackgroundForCourse(courseKey2, urlToSet);
                try { grid.querySelectorAll('.image-picker-item.selected').forEach(el => el.classList.remove('selected')); } catch (e) {}
                customItem.classList.add('selected');
              } catch (e) {}

              try { updateHeaderBackgroundForActiveCourse(); } catch (e) {}
              try { updatePreview(); } catch (e) {}
              return;
            }

            // Not saved -> open input
            openCustomInput();
          });

          // Edit button click (accessible)
          editBtn.addEventListener('click', (ev) => { ev.stopPropagation(); openCustomInput(); });

          grid.appendChild(customItem);
        } catch (e) {}

        return; // handled marker
      }

      const item = document.createElement('div');
      item.className = 'image-picker-item';

      const thumb = document.createElement('img');
      // Defer actual image load until visible
      thumb.dataset.src = url;
      thumb.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
      thumb.alt = '';
      thumb.loading = 'lazy';
      thumb.className = 'image-picker-thumb';

      item.appendChild(thumb);

      const overlay = document.createElement('div');
      overlay.className = 'image-picker-overlay';
      overlay.textContent = 'Use';
      item.appendChild(overlay);

      // palette button removed from individual tiles; tint handled by dedicated Tint tile

      // If this URL was saved for this course, mark as selected
      if (savedForCourse && savedForCourse === url) { item.classList.add('selected'); }

      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        try {
          const urlToSet = url;
          const bgDiv = card.querySelector('.OjOEXb');
          if (bgDiv) {
            bgDiv.style.setProperty('background-image', `url("${urlToSet}")`, 'important');
            bgDiv.style.setProperty('background-size', 'cover', 'important');
            bgDiv.style.setProperty('background-position', 'center center', 'important');
            bgDiv.style.setProperty('background-repeat', 'no-repeat', 'important');
          }

          // Persist selection
          const courseKey = card && card.dataset && card.dataset.courseId;
          if (courseKey) setSavedBackgroundForCourse(courseKey, urlToSet);

          // Update UI selection
          try { grid.querySelectorAll('.image-picker-item.selected').forEach(el => el.classList.remove('selected')); } catch (e) {}
          item.classList.add('selected');
        } catch (e) {}

        // Sync header background if this course is active
        try { updateHeaderBackgroundForActiveCourse(); } catch (e) {}
        try { updatePreview(); } catch (e) {}
      });

      // Observe thumb for lazy load
      try { __imagePickerThumbObserver.observe(thumb); } catch (e) {}

      grid.appendChild(item);
    });
    content.appendChild(grid);
  }

  let activeTab = 'banners';
  function setActiveTab(nextTab) {
    activeTab = nextTab === 'tints' ? 'tints' : 'banners';
    const showingBanners = activeTab === 'banners';
    bannerTabBtn.classList.toggle('active', showingBanners);
    bannerTabBtn.setAttribute('aria-pressed', showingBanners ? 'true' : 'false');
    tintTabBtn.classList.toggle('active', !showingBanners);
    tintTabBtn.setAttribute('aria-pressed', !showingBanners ? 'true' : 'false');

    if (showingBanners) renderBannerGrid();
    else renderTintPanel();
  }

  bannerTabBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setActiveTab('banners');
  });

  tintTabBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setActiveTab('tints');
  });

  if (urlArr.length === 0) {
    const info = document.createElement('div');
    info.className = 'image-picker-empty';
    info.textContent = 'No images available.';
    content.appendChild(info);
  } else {
    setActiveTab('banners');
  }
  updatePreview();

  document.body.appendChild(popup);
  __currentImagePicker = popup;

  window.requestAnimationFrame(() => {
    try { popup.classList.add('image-picker-popup-visible'); } catch (e) {}
  });

  try {
    const popupWidth = Math.round(popup.getBoundingClientRect().width || popup.offsetWidth || 360);
    document.documentElement.style.setProperty('--mc-image-picker-fixed-width', `${popupWidth}px`);
    document.body.classList.add('mc-image-picker-fixed-active');
  } catch (e) {}

  // Add outside click & Escape handling (store handlers so we can remove them on close)
  setTimeout(() => {
    window.__imagePickerDocClickHandler = (ev) => {
      try {
        if (window.__imagePickerDragging) return; // ignore while dragging
        // Dismiss only when the click is outside both popup and the trigger
        if (!popup.contains(ev.target) && !triggerEl.contains(ev.target)) {
          closeImagePicker();
          document.removeEventListener('click', window.__imagePickerDocClickHandler, true);
          window.__imagePickerDocClickHandler = null;
        }
      } catch (e) { /* ignore */ }
    };
    window.__imagePickerKeyHandler = (ev) => {
      if (ev.key === 'Escape') {
        closeImagePicker();
        document.removeEventListener('keydown', window.__imagePickerKeyHandler);
        window.__imagePickerKeyHandler = null;
      }
    };
    // Use capture so we catch clicks even if other handlers stop propagation
    document.addEventListener('click', window.__imagePickerDocClickHandler, true);
    document.addEventListener('keydown', window.__imagePickerKeyHandler);
  }, 0);
}

function syncSidebarOnClassroomPage() {
  getTitles(({ titles = {} }) => {
    document.querySelectorAll('a.uTwgne[data-id]').forEach(sidebarLink => {
      const courseId = sidebarLink.dataset.id;
      const titleDiv = sidebarLink.querySelector('.XL4gNd.YVvGBb');
      if (!courseId || !titles[courseId] || !titleDiv) return;

      if (titleDiv.textContent !== titles[courseId]) {
        titleDiv.textContent = titles[courseId];
        sidebarLink.setAttribute('aria-label', titles[courseId]);
      }

      // Restore color for this title
      const iconElement = sidebarLink?.querySelector('.kWQ5wd');
      if (iconElement) {
        const style = getComputedStyle(iconElement);
        const color = style.getPropertyValue('--dna-icon-color').trim();
                applySidebarCourseTextColor(sidebarLink, color);
      }
    });
  });
}

/* ------------------------------------------------------------------
   Sync active sidebar course -> header background
   - watches sidebar for aria-current changes and updates a single
     header element (.PFLqgc.PagUde) to use the matching widget's
     customised background (if any)
   - uses localStorage key `modernClassroom_card_backgrounds`
   - only one custom background is applied at a time
   - safe: will apply stored background even before home widgets exist
   ------------------------------------------------------------------ */
let __mgc_currentHeaderCourse = null;

function extractUrlFromCss(val) {
  if (!val) return null;
  const m = val.match(/url\((?:"|')?(.*?)(?:"|')?\)/);
  return m ? m[1] : null;
}

function getActiveSidebarCourseId() {
  // 1. Check sidebar links with aria-current
  const el = document.querySelector('a.uTwgne[aria-current="page"], a.uTwgne[aria-current="true"]');
  if (el && el.dataset && el.dataset.id) return el.dataset.id;
  
  // 2. Fallback: Check any sidebar links that have the active class (Google Classroom changes these classes often)
  const activeLink = document.querySelector('a.uTwgne.active, a.uTwgne.selected');
  if (activeLink && activeLink.dataset && activeLink.dataset.id) return activeLink.dataset.id;

  // 3. Fallback: Parse course id from URL - very reliable for classroom pages
  try {
    const path = window.location.pathname;
    // Match /c/ID, /u/N/c/ID, /w/ID, /u/N/w/ID
    const m = path.match(/\/(?:c|w)\/([a-zA-Z0-9_-]+)/);
    if (m && m[1]) return m[1];
    
    // Check if ID is in the search params
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('c')) return urlParams.get('c');
  } catch (e) {}

  return null;
}

let cachedCardBackgrounds = {};

async function refreshCardBackgroundsFromStorage() {
  try {
    if (typeof storageGet === 'function') {
      const data = await storageGet('modernClassroom_card_backgrounds', {});
      cachedCardBackgrounds = (data && typeof data === 'object') ? data : {};
      return cachedCardBackgrounds;
    }

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      const data = await new Promise((resolve) => {
        chrome.storage.sync.get('modernClassroom_card_backgrounds', resolve);
      });
      cachedCardBackgrounds = data?.modernClassroom_card_backgrounds || {};
      return cachedCardBackgrounds;
    }
  } catch (_) {}

  try {
    cachedCardBackgrounds = JSON.parse(localStorage.getItem('modernClassroom_card_backgrounds') || '{}') || {};
  } catch (_) {
    cachedCardBackgrounds = {};
  }
  return cachedCardBackgrounds;
}

async function persistCardBackgroundsToStorage() {
  if (typeof storageSet === 'function') {
    try {
      await storageSet('modernClassroom_card_backgrounds', cachedCardBackgrounds);
      return;
    } catch (_) {}
  }

  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.set({ 'modernClassroom_card_backgrounds': cachedCardBackgrounds });
    }
  } catch (e) {}
  try { localStorage.setItem('modernClassroom_card_backgrounds', JSON.stringify(cachedCardBackgrounds)); } catch (e) {}
}

function setSavedBackgroundForCourse(courseId, url) {
  if (!courseId) return;
  if (url) cachedCardBackgrounds[courseId] = url;
  else delete cachedCardBackgrounds[courseId];
  persistCardBackgroundsToStorage().catch(() => {});
}

function getSavedBackgroundForCourse(courseId) {
  return cachedCardBackgrounds[courseId] || null;
}

// Card icon color storage and management
let cachedCardIconColors = {};
let hasHydratedCardIconColors = false;

async function refreshCardIconColorsFromStorage(force = false) {
  if (hasHydratedCardIconColors && !force) {
    return cachedCardIconColors;
  }

  try {
    if (typeof storageGet === 'function') {
      const data = await storageGet('modernClassroom_card_icon_colors', {});
      cachedCardIconColors = (data && typeof data === 'object') ? data : {};
      hasHydratedCardIconColors = true;
      return cachedCardIconColors;
    }

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      const data = await new Promise((resolve) => {
        chrome.storage.sync.get('modernClassroom_card_icon_colors', resolve);
      });
      cachedCardIconColors = data?.modernClassroom_card_icon_colors || {};
      hasHydratedCardIconColors = true;
      return cachedCardIconColors;
    }
  } catch (_) {}

  try {
    cachedCardIconColors = JSON.parse(localStorage.getItem('modernClassroom_card_icon_colors') || '{}') || {};
  } catch (_) {
    cachedCardIconColors = {};
  }
  hasHydratedCardIconColors = true;
  return cachedCardIconColors;
}

async function persistCardIconColorsToStorage() {
  if (typeof storageSet === 'function') {
    try {
      await storageSet('modernClassroom_card_icon_colors', cachedCardIconColors);
      return;
    } catch (_) {}
  }

  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.set({ 'modernClassroom_card_icon_colors': cachedCardIconColors });
    }
  } catch (e) {}
  try { localStorage.setItem('modernClassroom_card_icon_colors', JSON.stringify(cachedCardIconColors)); } catch (e) {}
}

function setCardIconColorForCourse(courseId, color) {
  if (!courseId) return;
  hasHydratedCardIconColors = true;
  if (color) cachedCardIconColors[courseId] = color;
  else delete cachedCardIconColors[courseId];
  persistCardIconColorsToStorage().catch(() => {});
}

function getCardIconColorForCourse(courseId) {
  return cachedCardIconColors[courseId] || null;
}

const MGC_ICON_COLOR_SELECTORS = [
  '.Cxyznd.qJJSvb.MwOlIe',
  '.Cxyznd.qJJSvb',
  '.Cxyznd.IqHgie.qJJSvb',
  '.Cxyznd.IqHgie.qJJSvb.MwOlIe',
  '.P47N4e.MwOlIe',
  '.P47N4e.MwOlIe.IqHgie',
  '.P47N4e.MwOlIe.bFjUmb-Wvd9Cc',
  '.gmNu1d.iobNdf.OqAhgb',
  '.gmNu1d.iobNdf.OqAhgb.IqHgie',
  '.gmNu1d.iobNdf.OqAhgb.bFjUmb-Wvd9Cc',
  '[class*="Cxyznd"][class*="qJJSvb"]',
  // Refined selectors: target the specific class combinations used for course icons
  '.qvoG3e.MwOlIe',
  '.qvoG3e.MwOlIe.IqHgie',
  '.pOf0gc.MwOlIe',
  '.pOf0gc.MwOlIe.IqHgie'
];

function isMgcCourseIconElement(el) {
  if (!el || !(el instanceof Element)) return false;
  if (el.querySelector('svg, i.google-symbols, i.quRWN-Bz112c, .google-symbols')) return true;
  return el.matches('.Cxyznd, [class*="Cxyznd"], .P47N4e, .gmNu1d');
}

function getMgcCourseIconElements(root = document) {
  const scope = root && typeof root.querySelectorAll === 'function' ? root : document;
  const seen = new Set();
  const out = [];

  MGC_ICON_COLOR_SELECTORS.forEach((selector) => {
    scope.querySelectorAll(selector).forEach((el) => {
      if (seen.has(el) || !isMgcCourseIconElement(el)) return;
      seen.add(el);
      out.push(el);
    });
  });

  return out;
}

function applyMgcCourseIconColor(root, color, options = {}) {
  if (!color) return;
  const { markApplied = false, skipIfAlreadySet = false } = options;

  getMgcCourseIconElements(root).forEach((el) => {
    try {
      if (skipIfAlreadySet && el.style.backgroundColor === color) {
        if (markApplied) el.dataset.mgcColorApplied = 'true';
        return;
      }
      el.style.backgroundColor = color;
      if (markApplied) el.dataset.mgcColorApplied = 'true';
    } catch (e) {}
  });
}

function clearMgcCourseIconColor(root) {
  getMgcCourseIconElements(root).forEach((el) => {
    try {
      el.style.removeProperty('background-color');
      delete el.dataset.mgcColorApplied;
    } catch (e) {}
  });
}

function applyCardIconColor(card, courseId, color) {
  if (!card || !courseId || !color) return;

  applyMgcCourseIconColor(card, color);
}

// Initialize card icon colors on load
refreshCardIconColorsFromStorage().catch(() => {});

// Watch for icon elements and apply saved color
const iconColorObserver = new MutationObserver(() => {
  try {
    const courseId = getActiveSidebarCourseId();
    if (!courseId) return;

    const savedColor = getCardIconColorForCourse(courseId);
    if (!savedColor) return;

    applyMgcCourseIconColor(document, savedColor, { markApplied: true });
  } catch (e) {}
});

// Start observing for icon elements on all classroom pages
try {
  iconColorObserver.observe(document.body, { childList: true, subtree: true });
} catch (e) {}

// Periodic check to ensure icon colors stay applied (in case observer misses something)
setInterval(() => {
  try {
    const courseId = getActiveSidebarCourseId();
    if (!courseId) return;

    const savedColor = getCardIconColorForCourse(courseId);
    if (!savedColor) return;

    applyMgcCourseIconColor(document, savedColor, { markApplied: true, skipIfAlreadySet: true });
  } catch (e) {}
}, 2000);

// Add color picker to classroom page header (not home page)
function addColorPickerToClassroomHeader() {
  try {
    const courseId = getActiveSidebarCourseId();
    if (!courseId) return;

    // Find the main classroom banner on the course page
    const banners = document.querySelectorAll('.PFLqgc.KFl4Z, .vFkiub.KFl4Z, .PFLqgc.PagUde, .vFkiub.PagUde');
    banners.forEach(banner => {
      const isPagUdeBanner = banner.classList.contains('PagUde');
      const host = isPagUdeBanner
        ? (banner.closest('.qyN25') || banner.parentElement || banner)
        : banner;

      if (!host) return;
      
      // Check if button already exists
      let existingBtn = host.querySelector('.my-extension-icon-color-picker');
      if (existingBtn) {
        // Update the existing button's swatch with the current course's color
        const colorSwatch = existingBtn.querySelector('div');
        const savedColor = getCardIconColorForCourse(courseId);
        const defaultColor = '#9aa0a6';
        if (colorSwatch) {
          colorSwatch.style.backgroundColor = savedColor || defaultColor;
          // Apply saved color, or apply a visual default so the UI matches the swatch
          if (savedColor) applyMgcCourseIconColor(document, savedColor);
          else applyMgcCourseIconColor(document, defaultColor, { markApplied: true, skipIfAlreadySet: true });
        }
        return;
      }

      const colorPickerBtn = document.createElement('button');
      colorPickerBtn.className = 'my-extension-icon-color-picker';
      colorPickerBtn.setAttribute('aria-label', 'Change icon background color');
      colorPickerBtn.style.cssText = `position:absolute;bottom:15px;right:15px;width:28px;height:28px;padding:0;border:none;background:none;cursor:pointer;border-radius:6px;transition:all 0.2s ease;z-index:30; opacity:1;box-shadow:none !important;`;

      const colorSwatch = document.createElement('div');
      colorSwatch.style.cssText = 'width:100%;height:100%;border-radius:12px;border:2px solid rgba(255, 255, 255, 0.36);cursor:pointer;background:#9aa0a6;box-shadow:none !important;';
      colorPickerBtn.appendChild(colorSwatch);

      // Apply saved color if exists, otherwise use and apply the default visual color
      const savedColor = getCardIconColorForCourse(courseId);
      const defaultColor = '#9aa0a6';
      if (savedColor) {
        colorSwatch.style.backgroundColor = savedColor;
        applyMgcCourseIconColor(document, savedColor);
      } else {
        colorSwatch.style.backgroundColor = defaultColor;
        applyMgcCourseIconColor(document, defaultColor, { markApplied: true, skipIfAlreadySet: true });
      }

      host.style.position = 'relative';
      host.appendChild(colorPickerBtn);
    });
  } catch (e) {}
}

function getWidgetBackgroundForCourse(courseId) {
  // First try saved; then try to read from widget DOM
  const saved = getSavedBackgroundForCourse(courseId);
  if (saved) return saved;

  const card = document.querySelector(`li[data-course-id="${courseId}"]`);
  if (!card) return null;
  const bgDiv = card.querySelector('.OjOEXb') || card.querySelector('.PFLqgc.PagUde');
  if (!bgDiv) return null;
  const bg = bgDiv.style.backgroundImage || getComputedStyle(bgDiv).backgroundImage;
  return extractUrlFromCss(bg);
}

function applyHeaderBackground(url, courseId) {
  // 1. Define selectors and normalize URL for comparison
  // Removed .joJglb as it often targets the top navigation bar instead of the banner
  const bannerSelector = '.PFLqgc, .vFkiub'; 
  const roleBannerSelector = 'header[role="banner"], [role="banner"]';
  const normalizedUrl = url ? url.replace(/["']/g, "") : null;
  
  // 2. Comprehensive check: are we already in the desired state for this course/url?
  if (__mgc_currentHeaderCourse === courseId && url) {
    const banners = Array.from(document.querySelectorAll(bannerSelector));
    if (banners.length > 0) {
      // If classroom main banners exist, they MUST have the custom URL applied
      const bannerCorrect = banners.every(b => {
        const bg = b.style.backgroundImage || "";
        return b.getAttribute('data-mgc-bg-course') === courseId && bg.includes(normalizedUrl);
      });
      // If banners are already correct, we're done
      if (bannerCorrect) return true;
    } else {
      // No classroom banners (e.g. Classwork), check the top global header
      const topHeader = document.querySelector(roleBannerSelector);
      const bg = topHeader ? (topHeader.style.backgroundImage || "") : "";
      if (topHeader && topHeader.getAttribute('data-mgc-bg-course') === courseId && bg.includes(normalizedUrl)) {
        return true;
      }
    }
  }

  // 3. State needs update: Clear ALL previously marked elements to prevent "ghost" backgrounds
  // This ensures that when we move from top-header application to banner application, the top-header is wiped
  try {
    document.querySelectorAll('[data-mgc-bg-course]').forEach(el => {
      try { 
        el.style.removeProperty('background-image'); 
        el.removeAttribute('data-mgc-bg-course'); 
      } catch (e) {}
    });
  } catch (e) {}
  __mgc_currentHeaderCourse = null;

  if (!url) return true;

  // 4. Primary targets: Actual classroom banners
  const actualBanners = Array.from(document.querySelectorAll(bannerSelector));
  let appliedToBanner = false;
  if (actualBanners.length > 0) {
    actualBanners.forEach(el => {
      el.style.setProperty('background-image', `url("${url}")`, 'important');
      el.style.setProperty('background-size', 'cover', 'important');
      el.style.setProperty('background-position', 'center center', 'important');
      el.style.setProperty('background-repeat', 'no-repeat', 'important');
      el.setAttribute('data-mgc-bg-course', courseId);
      appliedToBanner = true;
    });
  }

  // 5. Fallback target: Top global header 
  // We only apply here if no classroom banners were found, OR if the page typically lacks one (like Classwork /w/)
  // We explicitly avoid applying this to elements with role="navigation" to avoid the top bar issue
  if (!appliedToBanner || window.location.pathname.includes('/w/')) {
    const headerEls = Array.from(document.querySelectorAll(roleBannerSelector)).filter(el => {
        return el.getAttribute('role') !== 'navigation' && el.tagName !== 'NAV';
    });
    if (headerEls.length > 0) {
      const el = headerEls[0];
      el.style.setProperty('background-image', `url("${url}")`, 'important');
      el.setAttribute('data-mgc-bg-course', courseId);
    }
  }

  __mgc_currentHeaderCourse = courseId;
  
  // 6. Final verification to determine if we should retry
  const bannersNow = Array.from(document.querySelectorAll(bannerSelector));
  const isClassroomMainPage = window.location.pathname.includes('/c/');
  if (isClassroomMainPage && bannersNow.length > 0) {
    // Return true only if we successfully applied it to the real banner
    return appliedToBanner;
  }

  return (appliedToBanner || document.querySelector(roleBannerSelector) !== null);
}

function updateHeaderBackgroundForActiveCourse(retries = 10) {
  // Ensure cached saved backgrounds AND titles are loaded before we decide what to apply.
  const p1 = refreshCardBackgroundsFromStorage();
  const p2 = new Promise((resolve) => getCachedTitles(resolve));

  Promise.all([p1, p2]).then(() => {
    const courseId = getActiveSidebarCourseId();
    if (!courseId) {
      applyHeaderBackground(null, null);
      return;
    }

    updateCoursePageHeaderTitleForActiveCourse(courseId);

    const url = getWidgetBackgroundForCourse(courseId);
    if (url) {
      const ok = applyHeaderBackground(url, courseId);
      if (!ok && retries > 0) setTimeout(() => updateHeaderBackgroundForActiveCourse(retries - 1), 500);
    } else {
      // Try applying saved value if widget not present yet (cache is now populated)
      const saved = getSavedBackgroundForCourse(courseId);
      const ok = applyHeaderBackground(saved, saved ? courseId : null);
      if (!ok && retries > 0) setTimeout(() => updateHeaderBackgroundForActiveCourse(retries - 1), 500);
    }

    applyBannerTintToStreamForCourse(courseId, getBannerTintSettingsForCourse(courseId));

    // Add color picker to classroom header
    addColorPickerToClassroomHeader();
    
    // Apply saved icon color if it exists
    const savedIconColor = getCardIconColorForCourse(courseId);
    if (savedIconColor) {
      applyMgcCourseIconColor(document, savedIconColor);
    }
  }).catch(() => {
    // Fallback: best-effort synchronous behaviour
    const courseId = getActiveSidebarCourseId();
    if (!courseId) { applyHeaderBackground(null, null); return; }
    updateCoursePageHeaderTitleForActiveCourse(courseId);
    const url = getWidgetBackgroundForCourse(courseId);
    if (url) applyHeaderBackground(url, courseId);
    else {
      const saved = getSavedBackgroundForCourse(courseId);
      applyHeaderBackground(saved, saved ? courseId : null);
    }

    applyBannerTintToStreamForCourse(courseId, getBannerTintSettingsForCourse(courseId));

    // Add color picker to classroom header
    addColorPickerToClassroomHeader();
    
    // Apply saved icon color if it exists
    const savedIconColor = getCardIconColorForCourse(courseId);
    if (savedIconColor) {
      applyMgcCourseIconColor(document, savedIconColor);
    }
  });
}

// Observe attribute changes (aria-current) and childList changes when sidebar or banners update
const headerSyncObserver = new MutationObserver((mutations) => {
  let shouldUpdate = false;
  for (let m of mutations) {
    if (m.type === 'attributes' && (m.attributeName === 'aria-current' || m.attributeName === 'class')) {
      if (m.target && m.target.matches && m.target.matches('a.uTwgne')) {
        shouldUpdate = true; break;
      }
    }
    if (m.type === 'childList') {
      // Check if added nodes contain sidebar links or classroom banners
      const isRelevant = Array.from(m.addedNodes).some(n => {
        if (!(n instanceof Element)) return false;
        return n.matches('a.uTwgne, .PFLqgc, .vFkiub, .joJglb') || n.querySelector('a.uTwgne, .PFLqgc, .vFkiub, .joJglb');
      });
      if (isRelevant) {
        shouldUpdate = true; break;
      }
    }
  }
  if (shouldUpdate) {
    updateHeaderBackgroundForActiveCourse();
    addColorPickerToClassroomHeader();
  }
});

try {
  headerSyncObserver.observe(document.body, { attributes: true, childList: true, subtree: true, attributeFilter: ['aria-current','class'] });
} catch (e) {}

// Fallback polling for single active id change or missing/incorrect banner application
let __mgc_lastActiveId = null;
setInterval(() => {
  const id = getActiveSidebarCourseId();
  
  let needsUpdate = false;
  if (id !== __mgc_lastActiveId) {
    needsUpdate = true;
  } else if (id) {
    // If ID is same, check if the banner is actually correct in the DOM
    const banner = document.querySelector('.PFLqgc, .vFkiub, .joJglb');
    if (banner) {
      if (banner.getAttribute('data-mgc-bg-course') !== id) needsUpdate = true;
    } else {
      const roleHeader = document.querySelector('header[role="banner"], [role="banner"]');
      if (roleHeader && roleHeader.getAttribute('data-mgc-bg-course') !== id) {
        // Only trigger update if we expect we HAVE a background to show
        if (cachedCardBackgrounds && cachedCardBackgrounds[id]) needsUpdate = true;
      }
    }
  }

  if (needsUpdate) {
    __mgc_lastActiveId = id;
    updateHeaderBackgroundForActiveCourse();
  }
}, 500);

// Make sure updates happen on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    updateHeaderBackgroundForActiveCourse();
    addColorPickerToClassroomHeader();
  });
} else {
  updateHeaderBackgroundForActiveCourse();
  addColorPickerToClassroomHeader();
}

restoreTitles();

// Initialize cached titles on page load
getCachedTitles();

let mutationTimeout;
let isContextMenuOpen = false;

document.addEventListener('contextmenu', () => {
  isContextMenuOpen = true;
}, true);

document.addEventListener('click', () => {
  isContextMenuOpen = false;
}, true);

const observerCallback = (mutations) => {
  clearTimeout(mutationTimeout);
  
  mutationTimeout = setTimeout(() => {
    if (!isContextMenuOpen) {
      const hasRelevantChanges = mutations.some(mutation => {
        return Array.from(mutation.addedNodes).some(node => {
          if (!(node instanceof Element)) return false;
          return node.matches('li[data-course-id], a[data-id]') ||
                 node.querySelector('li[data-course-id], a[data-id], .ScpeUc, .GRvzhf.YVvGBb, .XL4gNd.YVvGBb');
        });
      });

      restoreTitles();
    }
    
    if (document.querySelector('.mSaSG.pEwOBc.Aopndd')) {
      insertCustomSettingsPanel();
    }
  }, 100);
};

const mainObserver = new MutationObserver(observerCallback);
mainObserver.observe(document.body, { childList: true, subtree: true });

window.addEventListener('popstate', () => {
  // Run immediately and again after a short delay to allow page DOM to stabilise
  try { restoreTitles(); } catch (e) {}
  try { updateHeaderBackgroundForActiveCourse(); } catch (e) {}
  try { 
    const courseId = getActiveSidebarCourseId();
    const savedColor = courseId ? getCardIconColorForCourse(courseId) : null;
    if (savedColor) {
      applyMgcCourseIconColor(document, savedColor, { markApplied: true });
    }
  } catch (e) {}
  
  setTimeout(() => {
    try { restoreTitles(); } catch (e) {}
    try { updateHeaderBackgroundForActiveCourse(); } catch (e) {}
    try { 
      const courseId = getActiveSidebarCourseId();
      const savedColor = courseId ? getCardIconColorForCourse(courseId) : null;
      if (savedColor) {
        applyMgcCourseIconColor(document, savedColor, { markApplied: true });
      }
    } catch (e) {}
  }, 350);
});
