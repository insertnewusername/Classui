const DECORATION_STYLE_ID = 'mgc-decoration-style';
let currentDecoration = null;
let decorationInvertEnabled = false;

function decorationBaseUrl() {
    return (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
        ? chrome.runtime.getURL('Images/Decoration/')
        : 'chrome-extension://__MSG_@@extension_id__/Images/Decoration/';
}

function decorationUrl(filename) {
    if (!filename) return '';
    return decorationBaseUrl() + filename;
}

let decorationOverlayOpacity = null;
const DECORATION_OVERLAY_DEFAULTS = {
    'Bricks.png': 0.02,
    'Gridlines.png': 0.02,
    'Dots.png': 0.02,
    'Cubes.png': 0.02,
    'Rocks.png': 0.02,
    'Treetops.png': 0.02,
    'Clouds.png': 0.02,
    'Gradient.png': 0.30,
    'Icons.png': 0.02,
    'Emojis.png': 0.02,
    'Festive.png': 0.02,
    'Nature.png': 0.02,
    'Library.png': 0.02,
    'Paint.png': 0.02,
    'Doodles.png': 0.30,
    '__CUSTOM__': 0.40
};

function parseDecorationOverlayOpacity(value) {
    const opacity = Number(value);
    if (!Number.isFinite(opacity)) return null;
    return Math.max(0, Math.min(1, opacity));
}

function getSavedDecorationOverlayOpacity() {
    try {
        const raw = localStorage.getItem('decoration:overlayOpacity');
        if (raw === null) return null;
        const parsed = JSON.parse(raw);
        return parseDecorationOverlayOpacity(parsed);
    } catch (_) {
        return null;
    }
}

async function loadSavedDecorationOverlayOpacity() {
    try {
        if (typeof storageGet === 'function') {
            const stored = await storageGet('decoration:overlayOpacity');
            if (stored !== undefined && stored !== null) {
                const p = parseDecorationOverlayOpacity(stored);
                if (p !== null) {
                    decorationOverlayOpacity = p;
                    return;
                }
            }
        }
    } catch (_) {}

    try {
        const raw = localStorage.getItem('decoration:overlayOpacity');
        if (raw !== null) {
            const parsed = JSON.parse(raw);
            const p = parseDecorationOverlayOpacity(parsed);
            if (p !== null) decorationOverlayOpacity = p;
        }
    } catch (_) {}
}

function getDecorationOverlayOpacity(filename) {
    if (decorationOverlayOpacity !== null) {
        return decorationOverlayOpacity;
    }

    if (filename && DECORATION_OVERLAY_DEFAULTS.hasOwnProperty(filename)) {
        return DECORATION_OVERLAY_DEFAULTS[filename];
    }

    const savedLegacy = getSavedDecorationOverlayOpacity();
    if (savedLegacy !== null) return savedLegacy;

    return 0.98;
}

function applyDecorationInvertClass(filename = currentDecoration) {
    try {
        if (!document.body) return;
        const shouldInvert = filename === '__CUSTOM__' && decorationInvertEnabled;
        document.body.classList.toggle('mc-decoration-invert', shouldInvert);
    } catch (_) {}
}

async function loadSavedDecorationInvertState() {
    try {
        if (typeof storageGet === 'function') {
            const stored = await storageGet('decoration:invert');
            if (typeof stored === 'boolean') {
                decorationInvertEnabled = stored;
                return decorationInvertEnabled;
            }
            if (stored !== undefined && stored !== null) {
                decorationInvertEnabled = stored === true || stored === 'true' || stored === 1;
                return decorationInvertEnabled;
            }
        }
    } catch (_) {}

    try {
        const raw = localStorage.getItem('decoration:invert');
        if (raw !== null) {
            const parsed = JSON.parse(raw);
            decorationInvertEnabled = parsed === true || parsed === 'true' || parsed === 1;
            return decorationInvertEnabled;
        }
    } catch (_) {}

    decorationInvertEnabled = false;
    return decorationInvertEnabled;
}

async function setDecorationInvertEnabled(enabled, { persist = true } = {}) {
    decorationInvertEnabled = Boolean(enabled);
    applyDecorationInvertClass(currentDecoration);

    if (!persist) return decorationInvertEnabled;

    try {
        if (typeof storageSet === 'function') {
            await storageSet('decoration:invert', decorationInvertEnabled);
        }
    } catch (_) {}

    try {
        localStorage.setItem('decoration:invert', JSON.stringify(decorationInvertEnabled));
    } catch (_) {}

    return decorationInvertEnabled;
}

function getDecorationInvertEnabled(filename) {
    return filename === '__CUSTOM__' ? decorationInvertEnabled : false;
}

function applyDecorationStyle(filename) {
    let styleEl = document.getElementById(DECORATION_STYLE_ID);
    
    // Always clear old decoration first
    if (styleEl) {
        styleEl.remove();
        styleEl = null;
    }
    
    if (!filename) {
        try { document.body.classList.remove('mc-has-decoration'); } catch (_) {}
        try { document.body.classList.remove('mc-decoration-invert'); } catch (_) {}
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
                    const overlayOpacity = getDecorationOverlayOpacity(filename);
                    const css = `body.mc-has-decoration {\n        background-image: none !important;\n    }\n    body.mc-has-decoration::after {\n        content: "" !important;\n        position: fixed !important;\n        top: 0 !important;\n        left: 0 !important;\n        width: 100% !important;\n        height: 100% !important;\n        background-image: url("${url}") !important;\n        background-attachment: fixed !important;\n        background-repeat: no-repeat !important;\n        background-size: cover !important;\n        background-position: center center !important;\n        pointer-events: none !important;\n        z-index: -1 !important;\n        opacity: ${overlayOpacity} !important;\n    }\n    body:not(.dark-mode):not(.dark).mc-decoration-invert.mc-has-decoration::after {
        filter: invert(1) !important;
    }
    body.dark-mode.mc-decoration-invert.mc-has-decoration::after,
    body.dark.mc-decoration-invert.mc-has-decoration::after {
        filter: none !important;
    }`;
                    
                    styleEl = document.createElement('style');
                    styleEl.id = DECORATION_STYLE_ID;
                    document.head.appendChild(styleEl);
                    styleEl.textContent = css;
                    try { document.body.classList.add('mc-has-decoration'); } catch (_) {}
                    try { document.body.dataset.mcDecoration = filename; } catch (_) {}
                }
                resolve();
            });
        });
    }

    url = decorationUrl(filename);
    const overlayOpacity = getDecorationOverlayOpacity(filename);
    const lower = filename ? filename.toLowerCase() : '';
    const skipInvert = lower.includes('gradient') || lower.includes('doodles');
                        const css = `body.mc-has-decoration {
        background-image: none \!important;
    }
    body.mc-has-decoration::after {
        content: "" \!important;
        position: fixed \!important;
        top: 0 \!important;
        left: 0 \!important;
        width: 100% \!important;
        height: 100% \!important;
        background-image: url("${url}") \!important;
        background-attachment: fixed \!important;
        background-repeat: no-repeat \!important;
        background-size: cover \!important;
        background-position: center center \!important;
        pointer-events: none \!important;
        z-index: -1 \!important;
        opacity: ${overlayOpacity} \!important;
    }
    ${skipInvert ? '' : `body:not(.dark-mode):not(.dark).mc-has-decoration::after {
        filter: invert(1) \!important;
    }
    body.dark-mode.mc-has-decoration::after,
    body.dark.mc-has-decoration::after {
        filter: none \!important;
    }
`} `;

    styleEl = document.createElement('style');
    styleEl.id = DECORATION_STYLE_ID;
    document.head.appendChild(styleEl);
    styleEl.textContent = css;
    try { document.body.classList.add('mc-has-decoration'); } catch (_) {}
    try { document.body.dataset.mcDecoration = filename; } catch (_) {}
    applyDecorationInvertClass(filename);
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

function updateDecorationOverlayStyle(opacity) {
    const styleEl = document.getElementById(DECORATION_STYLE_ID);
    if (!styleEl || typeof styleEl.textContent !== 'string') return;
    try {
        styleEl.textContent = styleEl.textContent.replace(/opacity:\s*[0-9.]+\s*!important;/, `opacity: ${opacity} !important;`);
    } catch (_) {}
}

async function setDecorationOverlayOpacity(value) {
    const safeOpacity = parseDecorationOverlayOpacity(value);
    if (safeOpacity === null) return;
    decorationOverlayOpacity = safeOpacity;
    updateDecorationOverlayStyle(safeOpacity);
    try {
        if (typeof storageSet === 'function') {
            await storageSet('decoration:overlayOpacity', safeOpacity);
            const verify = await storageGet('decoration:overlayOpacity');
            if (verify !== safeOpacity) {
                await storageSet('decoration:overlayOpacity', safeOpacity);
            }
        }
    } catch (_) {}
    try { localStorage.setItem('decoration:overlayOpacity', JSON.stringify(safeOpacity)); } catch (_) {}
}

async function applyDecorationFilename(filename, { persist = true, resetOverlayOpacity = false } = {}) {
    if (!filename) {
        currentDecoration = null;
        applyDecorationStyle(null);
        decorationOverlayOpacity = null;
        if (persist) await persistDecorationSelection(null);
        return;
    }
    currentDecoration = filename;
    if (resetOverlayOpacity) {
        decorationOverlayOpacity = null;
    }
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

(async function initDecoration() {
    await loadSavedDecorationOverlayOpacity();
    await loadSavedDecorationInvertState();
    await restoreDecorationFromStorage();
    ensureDecorationObservers();
})();

(function ensureHeaderBeforeRule() {
  if (document.getElementById('mgc-header-before-style')) return;
  try {
    const s = document.createElement('style');
    s.id = 'mgc-header-before-style';
    s.textContent = '.PFLqgc.KFl4Z[data-mgc-bg-course]::before { display: none !important; content: none !important; }';
    document.head.appendChild(s);
  } catch (e) {}
})();
