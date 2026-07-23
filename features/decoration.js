const DECORATION_STYLE_ID = 'mgc-decoration-style';
let currentDecoration = null;

// ----- Overlay toggle support -----
let overlayEnabled = true; // default
let currentDecorationFilename = null; // store filename
let currentDecorationUrl = null; // store url

async function loadOverlaySetting() {
    try {
        const data = await storageGet('decoration:overlayEnabled');
        if (data !== undefined) overlayEnabled = data;
    } catch (_) {}
}

// Function to update only the style element with new overlay setting
function updateOverlayInStyle() {
    const styleEl = document.getElementById(DECORATION_STYLE_ID);
    if (!styleEl || !currentDecorationFilename) return;
    const css = buildDecorationCSS(currentDecorationUrl, currentDecorationFilename);
    styleEl.textContent = css;
}

// Listen for changes to the overlay setting
if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes['decoration:overlayEnabled']) {
            overlayEnabled = changes['decoration:overlayEnabled'].newValue;
            updateOverlayInStyle();
        }
    });
}

// Load initial value
loadOverlaySetting();

// ----- Base functions -----
function decorationBaseUrl() {
    return (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
        ? chrome.runtime.getURL('Decoration/')
        : 'chrome-extension://__MSG_@@extension_id__/Decoration/';
}

function decorationUrl(filename) {
    if (!filename) return '';
    return decorationBaseUrl() + filename;
}

// Helper to build the CSS (only light-mode overlay)
function buildDecorationCSS(url, filename) {
    let baseCSS = `body.mc-has-decoration {
        background-image: url("${url}") !important;
        background-attachment: fixed !important;
        background-repeat: no-repeat !important;
        background-size: cover !important;
        background-position: center center !important;
    }`;

    let overlayCSS = '';
    if (overlayEnabled) {
        overlayCSS = `
    body:not(.dark-mode).mc-has-decoration::before {
        content: "" !important;
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        background: rgba(248, 250, 253, 0.6) !important;
        pointer-events: none !important;
        z-index: -1 !important;
    }`;
    }
    return baseCSS + overlayCSS;
}

async function applyDecorationStyle(filename) {
    let styleEl = document.getElementById(DECORATION_STYLE_ID);
    
    // Always clear old decoration first
    if (styleEl) {
        styleEl.remove();
        styleEl = null;
    }
    
    if (!filename) {
        // Clear stored values
        currentDecorationFilename = null;
        currentDecorationUrl = null;
        try { document.body.classList.remove('mc-has-decoration'); } catch (_) {}
        try { if (document.body && document.body.dataset) delete document.body.dataset.mcDecoration; } catch (_) {}
        return;
    }

    // Handle custom decorations
    let url;
    let isCustom = filename === '__CUSTOM__';
    
    if (isCustom) {
        // Load custom decoration from storage
        return new Promise((resolve) => {
            chrome.storage.local.get('decoration:custom', (data) => {
                if (data['decoration:custom']) {
                    url = data['decoration:custom'];
                    // Store the current decoration details
                    currentDecorationFilename = filename;
                    currentDecorationUrl = url;
                    
                    const css = buildDecorationCSS(url, filename);
                    styleEl = document.createElement('style');
                    styleEl.id = DECORATION_STYLE_ID;
                    document.head.appendChild(styleEl);
                    styleEl.textContent = css;
                    try { document.body.classList.add('mc-has-decoration'); } catch (_) {}
                    try { document.body.dataset.mcDecoration = filename; } catch (_) {}
                } else {
                    // If no custom data, clear and treat as no decoration
                    currentDecorationFilename = null;
                    currentDecorationUrl = null;
                    try { document.body.classList.remove('mc-has-decoration'); } catch (_) {}
                }
                resolve();
            });
        });
    }

    // Regular (non‑custom) decoration
    url = decorationUrl(filename);
    currentDecorationFilename = filename;
    currentDecorationUrl = url;
    
    const css = buildDecorationCSS(url, filename);
    styleEl = document.createElement('style');
    styleEl.id = DECORATION_STYLE_ID;
    document.head.appendChild(styleEl);
    styleEl.textContent = css;
    try { document.body.classList.add('mc-has-decoration'); } catch (_) {}
    try { document.body.dataset.mcDecoration = filename; } catch (_) {}
}

async function persistDecorationSelection(filename) {
    try {
        await storageSet('decoration:selected', filename);
        const verify = await storageGet('decoration:selected');
        if (verify !== filename) {
            await storageSet('decoration:selected', filename);
        }
        try { localStorage.setItem('decoration:selected', JSON.stringify(filename)); } catch (_) {}
    } catch (_) {
        try { localStorage.setItem('decoration:selected', JSON.stringify(filename)); } catch (_) {}
    }
}

async function applyDecorationFilename(filename, { persist = true } = {}) {
    if (!filename) {
        currentDecoration = null;
        await applyDecorationStyle(null);
        if (persist) await persistDecorationSelection(null);
        return;
    }
    currentDecoration = filename;
    await applyDecorationStyle(filename);
    if (persist) await persistDecorationSelection(filename);
}

async function readSavedDecoration() {
    try {
        const ds = document.body && document.body.dataset && document.body.dataset.mcDecoration;
        if (ds) return ds;
    } catch (_) {}
    try {
        const stored = await storageGet('decoration:selected');
        if (stored) return stored;
    } catch (_) {}
    try {
        const raw = localStorage.getItem('decoration:selected');
        if (raw) return JSON.parse(raw);
    } catch (_) {}
    return null;
}

async function restoreDecorationFromStorage() {
    const saved = await readSavedDecoration();
    if (saved) {
        await applyDecorationFilename(saved, { persist: false });
    } else {
        await applyDecorationFilename(null, { persist: false });
    }
}

function ensureDecorationObservers() {
    const bodyObserver = new MutationObserver(() => {
        const styleEl = document.getElementById(DECORATION_STYLE_ID);
        if (currentDecoration && (!document.body.classList.contains('mc-has-decoration') || !styleEl)) {
            applyDecorationFilename(currentDecoration, { persist: false });
        }
    });

    function startBodyObserver() {
        if (!document.body) {
            setTimeout(startBodyObserver, 100);
            return;
        }
        bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'style', 'data-mc-decoration'] });
    }
    startBodyObserver();

    (function hookHistory() {
        const origPush = history.pushState;
        const origReplace = history.replaceState;
        history.pushState = function() {
            origPush.apply(this, arguments);
            window.dispatchEvent(new Event('locationchange'));
        };
        history.replaceState = function() {
            origReplace.apply(this, arguments);
            window.dispatchEvent(new Event('locationchange'));
        };
        window.addEventListener('popstate', () => window.dispatchEvent(new Event('locationchange')));
        window.addEventListener('locationchange', () => {
            setTimeout(() => {
                restoreDecorationFromStorage();
                // Update header background after navigation (ensure cache is loaded in that call)
                try { updateHeaderBackgroundForActiveCourse(); } catch (e) {}
            }, 150);
        });
    })();
}

// ----- Expose for settings panel -----
window.applyDecorationFilename = applyDecorationFilename;
window.currentDecoration = currentDecoration;

// ----- Init -----
restoreDecorationFromStorage();
ensureDecorationObservers();

(function ensureHeaderBeforeRule() {
  if (document.getElementById('mgc-header-before-style')) return;
  try {
    const s = document.createElement('style');
    s.id = 'mgc-header-before-style';
    s.textContent = '.PFLqgc.KFl4Z[data-mgc-bg-course]::before { display: none !important; content: none !important; }';
    document.head.appendChild(s);
  } catch (e) {}
})();