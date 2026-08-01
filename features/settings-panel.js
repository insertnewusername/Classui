
function injectGlassFilter() {
    if (document.querySelector('#liquid-glass-svg-filter')) return;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'liquid-glass-svg-filter';
    svg.style.display = 'none';

    // ---- Filter 1: Default – more distortion (scale 300) ----
    const filter1 = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filter1.id = 'glass-distortion';
    filter1.setAttribute('x', '0%');
    filter1.setAttribute('y', '0%');
    filter1.setAttribute('width', '100%');
    filter1.setAttribute('height', '100%');
    filter1.setAttribute('filterUnits', 'objectBoundingBox');
    filter1.innerHTML = `
        <feTurbulence type="fractalNoise" baseFrequency="0.003 0.007" numOctaves="1" seed="17" result="turbulence"/>
        <feDisplacementMap in="SourceGraphic" in2="turbulence" scale="300" xChannelSelector="R" yChannelSelector="G"/>
    `;
    svg.appendChild(filter1);

    // ---- Filter 2: Strong (for large areas) ----
    const filter2 = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filter2.id = 'glass-distortion-strong';
    filter2.setAttribute('x', '0%');
    filter2.setAttribute('y', '0%');
    filter2.setAttribute('width', '100%');
    filter2.setAttribute('height', '100%');
    filter2.setAttribute('filterUnits', 'objectBoundingBox');
    filter2.innerHTML = `
        <feTurbulence type="fractalNoise" baseFrequency="0.002 0.005" numOctaves="1" seed="42" result="turbulence"/>
        <feDisplacementMap in="SourceGraphic" in2="turbulence" scale="400" xChannelSelector="R" yChannelSelector="G"/>
    `;
    svg.appendChild(filter2);

    // ---- Filter 3: Subtle (for small elements) ----
    const filter3 = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filter3.id = 'glass-distortion-subtle';
    filter3.setAttribute('x', '0%');
    filter3.setAttribute('y', '0%');
    filter3.setAttribute('width', '100%');
    filter3.setAttribute('height', '100%');
    filter3.setAttribute('filterUnits', 'objectBoundingBox');
    filter3.innerHTML = `
        <feTurbulence type="fractalNoise" baseFrequency="0.008 0.008" numOctaves="1" seed="5" result="turbulence"/>
        <feDisplacementMap in="SourceGraphic" in2="turbulence" scale="120" xChannelSelector="R" yChannelSelector="G"/>
    `;
    svg.appendChild(filter3);

    document.head.appendChild(svg);
}
// ---- Liquid Glass: apply saved state on page load ----
(function applyLiquidGlassOnLoad() {
    const isEnabled = localStorage.getItem('glassEnabled') === 'true';
    if (isEnabled) {
        injectGlassFilter();               // <-- ADD THIS
        document.body.classList.add('cui-glass-enabled');
    }
})();
















function insertCustomSettingsPanel() {
    const profilePanel = document.querySelector('.mSaSG.pEwOBc.Aopndd, .mSaSG.pEwOBc, .Aopndd.mSaSG');
    if (!profilePanel) return false;

    if (document.querySelector('#my-extension-settings-panel')) return true;

    const hasSyncStorage = typeof storageGet === 'function';
    const syncPrefsPromise = (typeof storageGetMultiple === 'function')
        ? storageGetMultiple(['sidebarSize','layoutMode','sidebarHeightAdjust','sidebarUseNewIcons','sidebarExpandAllHover','classicSidebar']).catch(() => null)
        : null;
    const readLocalRaw = (key) => { try { return localStorage.getItem(key); } catch (_) { return null; } };
    const readLocalBool = (key, fallback = false) => {
        const raw = readLocalRaw(key);
        return raw === null ? fallback : (raw === 'true' || raw === true);
    };
    const readLocalNumber = (key, fallback) => {
        const parsed = parseInt(readLocalRaw(key), 10);
        return Number.isFinite(parsed) ? parsed : fallback;
    };
    const writePref = (key, value) => {
        if (typeof storageSet === 'function') return storageSet(key, value);
        try { localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)); } catch (_) {}
    };
    const reconcileSync = (key, defaultValue, localValue, onDifferent) => {
        if (!hasSyncStorage) return;
        const source = syncPrefsPromise
            ? syncPrefsPromise.then(syncValues => (syncValues && syncValues[key] !== undefined) ? syncValues[key] : defaultValue)
            : storageGet(key, defaultValue);
        source.then(syncValue => {
            if (syncValue !== localValue) onDifferent(syncValue);
        }).catch(() => {});
    };
    const waitForElement = (selector, onFound, timeoutMs = 9000) => {
        const existing = document.querySelector(selector);
        if (existing) return onFound(existing);
        if (!document.body) return;
        const observer = new MutationObserver(() => {
            const match = document.querySelector(selector);
            if (!match) return;
            observer.disconnect();
            clearTimeout(timer);
            onFound(match);
        });
        const timer = setTimeout(() => observer.disconnect(), timeoutMs);
        try { observer.observe(document.body, { childList: true, subtree: true }); } catch (_) { clearTimeout(timer); }
    };

    const onBodyClassChange = (() => {
        const listeners = [];
        let initialized = false;
        let scheduled = false;

        const notify = () => {
            scheduled = false;
            listeners.forEach(fn => {
                try { fn(); } catch (_) {}
            });
        };

        return (fn) => {
            listeners.push(fn);
            if (initialized || !document.body) return;
            initialized = true;
            try {
                const observer = new MutationObserver(() => {
                    if (scheduled) return;
                    scheduled = true;
                    if (typeof requestAnimationFrame === 'function') {
                        requestAnimationFrame(notify);
                    } else {
                        setTimeout(notify, 16);
                    }
                });
                observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
            } catch (_) {}
        };
    })();

    // Hide the profile panel
    profilePanel.style.display = 'none';

    // --- Tutorial Panel ---
    const tutorialPanel = document.createElement('div');
    tutorialPanel.className = 'mSaSG pEwOBc Aopndd';
    tutorialPanel.id = 'my-extension-tutorial-panel';
    tutorialPanel.style.marginBottom = '24px';

    // Embed tutorial directly
    const tutorialContainer = document.createElement('div');
    tutorialContainer.style.cssText = 'margin-top:0;';

    // Create tutorial modal inline
    const modal = document.createElement("div");
    modal.className = "tutorial-modal";
    // Apply popup-specific styles
    modal.style.padding = "20px";
    modal.style.height = "500px";
    modal.style.paddingBottom = "0px";
    modal.style.cssText = 'max-width: none; width: 100%; height: 400px; margin: 0; border: none; border-radius: 20px; padding: 0;';

    // Main container
    const container = document.createElement("div");
    container.className = "tutorial-container";

    // Left sidebar with feature list
    let guidemenu = document.createElement("div");
    guidemenu.className = "tutorial-guidemenu";
    guidemenu.style.gap = "4px";
    guidemenu.style.padding = "5px";

    const baseUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
            ? chrome.runtime.getURL('Tutorial/')
            : 'Tutorial/';

    const features = typeof window.getTutorialFeatures === 'function'
        ? window.getTutorialFeatures(baseUrl)
        : [];

    const normalizeImageSize = (value, fallbackUnit = '%') => {
        if (value === undefined || value === null) return '';
        if (typeof value === 'number' && Number.isFinite(value)) return `${value}${fallbackUnit}`;
        const raw = String(value).trim();
        if (!raw) return '';
        return /^\d+(\.\d+)?$/.test(raw) ? `${raw}${fallbackUnit}` : raw;
    };

    // Helper to render a feature's content
    function renderFeatureContent(feature) {
        rightPanel.innerHTML = "";
        const panel = document.createElement("div");
        panel.id = `panel-settings-${feature.id}`;
        panel.className = "tutorial-panel active";
        const titleEl = document.createElement("h2");
        titleEl.className = "tutorial-feature-title";
        titleEl.textContent = feature.title;
        panel.appendChild(titleEl);
        feature.content.forEach((block) => {
            if (block.type === 'text') {
                const textEl = document.createElement("p");
                textEl.className = "tutorial-feature-text";
                textEl.textContent = block.text;
                panel.appendChild(textEl);
            } else if (block.type === 'break') {
                const spacerEl = document.createElement('div');
                const rawSize = Number(block.size);
                const size = Number.isFinite(rawSize) ? Math.max(0, rawSize) : 16;
                spacerEl.style.height = `${size}px`;
                spacerEl.setAttribute('aria-hidden', 'true');
                panel.appendChild(spacerEl);
            } else if (block.type === 'image') {
                const imgEl = document.createElement("img");
                imgEl.className = "tutorial-feature-image";
                imgEl.src = block.src;
                imgEl.alt = feature.title;
                const width = normalizeImageSize(block.width, '%');
                const height = normalizeImageSize(block.height, 'px');
                if (width) imgEl.style.width = width;
                if (height) imgEl.style.height = height;
                panel.appendChild(imgEl);
            } else if (block.type === 'youtube') {
                const yt = document.createElement('iframe');
                yt.className = 'tutorial-feature-youtube';
                yt.width = '100%';
                yt.height = '315';
                yt.src = `https://www.youtube.com/embed/${block.id}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&showinfo=0&iv_load_policy=3&fs=0&disablekb=1&playsinline=1`;
                yt.title = feature.title + ' Video';
                yt.frameBorder = '0';
                yt.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
                yt.allowFullscreen = true;
                panel.appendChild(yt);
            }
        });
        rightPanel.appendChild(panel);
    }

    features.forEach((feature, index) => {
        const item = document.createElement("div");
        item.className = "tutorial-feature-item";
        item.style.display = "flex";
        item.style.flexDirection = "column";
        item.style.alignItems = "center";
        item.style.justifyContent = "center";
        item.style.gap = "6px";
        item.style.padding = "0px 10px";
        item.style.height = "35px";
        item.style.textAlign = "center";
        item.style.cursor = "pointer";
        item.style.borderRadius = "15px";
        item.style.transition = "all 0.2s";
        if (index === 0) item.classList.add("active");
        
        const label = document.createElement("span");
        label.textContent = feature.title;
        label.style.fontSize = "12px";
        label.style.fontWeight = "500";
        label.style.wordWrap = "break-word";
        label.style.lineHeight = "1.2";
        label.style.textAlign = "center";
        item.appendChild(label);
        
        item.addEventListener("click", () => {
            guidemenu.querySelectorAll(".tutorial-feature-item").forEach(el => el.classList.remove("active"));
            item.classList.add("active");
            renderFeatureContent(feature);
        });
        
        guidemenu.appendChild(item);
    });


    // Right panel with content (only one feature at a time)
    const rightPanel = document.createElement("div");
    rightPanel.className = "tutorial-content";
    // Render the first feature by default
    if (features.length > 0) {
        renderFeatureContent(features[0]);
    } else {
        const emptyState = document.createElement('p');
        emptyState.className = 'tutorial-feature-text';
        emptyState.textContent = 'No tutorial content available.';
        rightPanel.appendChild(emptyState);
    }

    container.appendChild(guidemenu);
    container.appendChild(rightPanel);
    modal.appendChild(container);
    tutorialContainer.appendChild(modal);
    tutorialPanel.appendChild(tutorialContainer);

  // --- Customisation Panel ---
  const newPanel = document.createElement('div');
    newPanel.className = 'mSaSG pEwOBc Aopndd';
  newPanel.id = 'my-extension-settings-panel';

  const iconBaseUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
      ? chrome.runtime.getURL('Icons/')
      : 'Icons/';

    function requestImmediateExtensionUpdateCheck() {
        return new Promise((resolve) => {
            if (typeof chrome === 'undefined' || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
                resolve({ status: 'unsupported' });
                return;
            }

            try {
                chrome.runtime.sendMessage({ action: 'checkForExtensionUpdate' }, (response) => {
                    if (chrome.runtime?.lastError) {
                        resolve({ status: 'error', error: chrome.runtime.lastError.message || 'Unknown update error' });
                        return;
                    }

                    if (!response) {
                        resolve({ status: 'error', error: 'No response from update checker' });
                        return;
                    }

                    resolve(response);
                });
            } catch (error) {
                resolve({ status: 'error', error: error?.message || 'Unknown update error' });
            }
        });
    }

    // Custom header with feedback button on the right
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.padding = '10px 10px 0 10px';

    const title = document.createElement('h2');
    title.className = 'Fp6Ke B7SYid';
    title.textContent = 'Customisation';

    const headerActions = document.createElement('div');
    headerActions.className = 'settings-header-actions';

    const feedbackBtn = document.createElement('button');
    feedbackBtn.textContent = 'Feedback';
    feedbackBtn.className = 'feedback-btn';
    feedbackBtn.style.alignSelf = 'flex-start';
    feedbackBtn.addEventListener('click', () => {
        try {
            window.open('https://tally.so/r/WO2NWQ', '_blank');
        } catch (e) {
            location.href = 'https://tally.so/r/WO2NWQ';
        }
    });

    header.appendChild(title);
    headerActions.appendChild(feedbackBtn);
    header.appendChild(headerActions);
    newPanel.appendChild(header);

    // Keep every customisation area in one panel, with the guide first.
    const tabs = document.createElement('div');
    tabs.className = 'mgc-settings-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Customisation sections');

    const tabContent = document.createElement('div');
    tabContent.className = 'mgc-settings-tab-content';
    const tabPanes = {};
    const tabButtons = {};

    ['Tutorial', 'Sidebar', 'Background', 'Layout'].forEach((name, index) => {
        const slug = name.toLowerCase();
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mgc-settings-tab';
        button.id = `mgc-settings-tab-${slug}`;
        button.textContent = name;
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-controls', `mgc-settings-pane-${slug}`);
        button.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
        button.tabIndex = index === 0 ? 0 : -1;

        const pane = document.createElement('div');
        pane.className = 'mgc-settings-tab-pane';
        pane.id = `mgc-settings-pane-${slug}`;
        pane.setAttribute('role', 'tabpanel');
        pane.setAttribute('aria-labelledby', button.id);
        pane.hidden = index !== 0;

        tabButtons[slug] = button;
        tabPanes[slug] = pane;
        tabs.appendChild(button);
        tabContent.appendChild(pane);
    });

    const selectSettingsTab = (slug) => {
        Object.entries(tabPanes).forEach(([name, pane]) => {
            const selected = name === slug;
            pane.hidden = !selected;
            tabButtons[name].classList.toggle('active', selected);
            tabButtons[name].setAttribute('aria-selected', String(selected));
            tabButtons[name].tabIndex = selected ? 0 : -1;
        });
    };

    Object.entries(tabButtons).forEach(([slug, button]) => {
        button.addEventListener('click', () => selectSettingsTab(slug));
    });

    selectSettingsTab('tutorial');

    newPanel.appendChild(tabs);
    newPanel.appendChild(tabContent);
    tabPanes.tutorial.appendChild(tutorialPanel);

    const toggleTodoBtn = document.createElement('button');
    toggleTodoBtn.className = 'setting-toggle-btn sidebar-pill-toggle-btn';
    toggleTodoBtn.id = 'toggle-todo-btn';
    toggleTodoBtn.title = 'Toggle To-do';
    toggleTodoBtn.innerHTML = `
        <div style="display: flex; flex-direction: row; align-items: center; gap: 12px;">
            <img src="${iconBaseUrl}newtodo.svg" alt="To-do">
            <span style="font-size: 14px; font-weight:500;">To-Do</span>
        </div>
    `;

    const toggleCalBtn = document.createElement('button');
    toggleCalBtn.className = 'setting-toggle-btn sidebar-pill-toggle-btn';
    toggleCalBtn.id = 'toggle-calendar-btn';
    toggleCalBtn.title = 'Toggle Calendar';
    toggleCalBtn.innerHTML = `
        <div style="display: flex; flex-direction: row; align-items: center; gap: 12px;">
            <img src="${iconBaseUrl}newcalendar.svg" alt="Calendar">
            <span style="font-size: 14px; font-weight:500;">Calendar</span>
        </div>
    `;

    const toggleArchivedBtn = document.createElement('button');
    toggleArchivedBtn.className = 'setting-toggle-btn sidebar-pill-toggle-btn archived-toggle-btn';
    toggleArchivedBtn.id = 'toggle-archived-btn';
    toggleArchivedBtn.title = 'Toggle Archived Classes';
    toggleArchivedBtn.innerHTML = `
        <div style="display: flex; flex-direction: row; align-items: center; gap: 12px;">
            <img src="${iconBaseUrl}newarchive.svg" alt="Archived Classes">
            <span style="font-size: 14px; font-weight:500;">Archived Classes</span>
        </div>
    `;

        tabPanes.sidebar.appendChild(toggleTodoBtn);
        tabPanes.sidebar.appendChild(toggleCalBtn);

    let decorationRowEl = null;
  profilePanel.insertAdjacentElement('afterend', newPanel);

  // Support aria-labels in multiple languages
  setupToggleButton('#toggle-todo-btn', '[aria-label="To-do"], [aria-label="To do"], [aria-label="Por hacer"], [aria-label="À faire"], [aria-label="Aufgaben"], [aria-label="A fazer"], [aria-label="Da fare"], [aria-label="Te doen"], [aria-label="Задачи"], [aria-label="待做"], [aria-label="待執行"], [aria-label="やることリスト"], [aria-label="할 일"]', 'hideTodo');
  setupToggleButton('#toggle-calendar-btn', '[aria-label="Calendar"], [aria-label="Calendario"], [aria-label="Calendrier"], [aria-label="Kalender"], [aria-label="Calendário"], [aria-label="Calendario"], [aria-label="Agenda"], [aria-label="Календарь"], [aria-label="日历"], [aria-label="日曆"], [aria-label="カレンダー"], [aria-label="일정"]', 'hideCalendar', 'calendar-hidden');

  const panelRoot = document.querySelector('#my-extension-settings-panel');
  const tutorialBase = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
      ? chrome.runtime.getURL('Tutorial/')
      : 'chrome-extension://__MSG_@@extension_id__/Tutorial/';

  if (panelRoot) {
  (function setupDecorationSection() {
      const decoRow = document.createElement('div');
      decoRow.className = 'decoration-row';
      decoRow.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
      decorationRowEl = decoRow;

      const grid = document.createElement('div');
      grid.className = 'decoration-grid';
      grid.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start;';
      decoRow.appendChild(grid);

      const base = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
          ? chrome.runtime.getURL('Decoration/')
          : 'chrome-extension://__MSG_@@extension_id__/Decoration/';

        async function applyDecoration(filename) {
            try { await applyDecorationFilename(filename, { persist: true }); } catch (_) {}
        }

        (async function loadDecorationList() {
            const listUrl = base + 'decorations.json';
            try {
                const res = await fetch(listUrl);
                if (!res.ok) throw new Error('no list');
                const list = await res.json();
                if (!Array.isArray(list) || list.length === 0) throw new Error('empty');

                const noneBtn = document.createElement('button');
                noneBtn.className = 'decoration-item none';
                noneBtn.type = 'button';
                noneBtn.textContent = 'None';
                noneBtn.addEventListener('click', () => {
                    applyDecoration(null);
                    grid.querySelectorAll('.decoration-item').forEach(it => it.classList.remove('selected'));
                    noneBtn.classList.add('selected');
                });
                grid.appendChild(noneBtn);

                for (const file of list) {
                    const item = document.createElement('button');
                    item.className = 'decoration-item';
                    item.type = 'button';
                    item.dataset.filename = file;
                    item.dataset.decorationUrl = `url("${base}${file}")`;
                    item.textContent = file.replace(/[-_]/g,' ').replace(/\.png$/i,'');
                    item.title = file.replace(/[-_]/g,' ').replace(/\.png$/i,'');
                    
                    const loadDecorationImage = () => {
                        if (!item.style.getPropertyValue('--decoration-url')) {
                            item.style.setProperty('--decoration-url', item.dataset.decorationUrl);
                        }
                    };
                    item.addEventListener('mouseenter', loadDecorationImage);
                    
                    item.addEventListener('click', async () => {
                        try { 
                            await applyDecoration(file); 
                            // Force reapply immediately
                            setTimeout(() => {
                                applyDecorationFilename(file, { persist: false });
                            }, 50);
                        } catch(_) {}
                        grid.querySelectorAll('.decoration-item').forEach(it => it.classList.remove('selected'));
                        item.classList.add('selected');
                    });
                    grid.appendChild(item);
                }

                // Note: Restoration of previously selected decoration happens after customBtn is created below

                // Add custom decoration button
                const customBtn = document.createElement('button');
                customBtn.className = 'decoration-item custom-decoration';
                customBtn.type = 'button';
                customBtn.textContent = '+';
                customBtn.title = 'Add custom decoration';
                
                const hiddenFileInput = document.createElement('input');
                hiddenFileInput.type = 'file';
                hiddenFileInput.accept = 'image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp';
                hiddenFileInput.style.display = 'none';
                document.body.appendChild(hiddenFileInput);
                
                hiddenFileInput.addEventListener('change', async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    
                    // Check file size (limit to 5MB)
                    if (file.size > 5 * 1024 * 1024) {
                        alert('File size must be less than 5MB');
                        return;
                    }
                    
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                        const dataUrl = event.target.result;
                        try {
                            // Store custom decoration in local storage
                            await new Promise((resolve) => {
                                chrome.storage.local.set({ 'decoration:custom': dataUrl }, resolve);
                            });
                            // Also set as selected
                            await applyDecoration('__CUSTOM__');
                            grid.querySelectorAll('.decoration-item').forEach(it => it.classList.remove('selected'));
                            customBtn.classList.add('selected');
                        } catch(_) {}
                    };
                    reader.readAsDataURL(file);
                    
                    // Reset input
                    hiddenFileInput.value = '';
                });
                
                customBtn.addEventListener('click', () => {
                    hiddenFileInput.click();
                });
                
                grid.appendChild(customBtn);

                // Restore previously selected decoration (including custom)
                (async () => {
                    // Restore saved decoration selection
                    let saved = null;
                    try { saved = document.body && document.body.dataset && document.body.dataset.mcDecoration; } catch(_) { saved = null; }
                    if (!saved) {
                        try { saved = await storageGet('decoration:selected'); } catch (_) { saved = null; }
                    }
                    if (!saved) {
                        try {
                            const raw = localStorage.getItem('decoration:selected');
                            if (raw) saved = JSON.parse(raw);
                        } catch (_) { saved = null; }
                    }

                    // Clear any previous selection
                    grid.querySelectorAll('.decoration-item').forEach(it => it.classList.remove('selected'));
                    
                    // Apply the saved decoration
                    if (saved === '__CUSTOM__') {
                        // Custom decoration
                        const customData = await new Promise((resolve) => {
                            chrome.storage.local.get('decoration:custom', (data) => {
                                resolve(data['decoration:custom']);
                            });
                        });
                        
                        if (customData) {
                            customBtn.classList.add('selected');
                            await applyDecorationFilename('__CUSTOM__', { persist: false });
                        } else {
                            noneBtn.classList.add('selected');
                        }
                    } else if (saved && typeof saved === 'string' && saved.length > 0) {
                        // Preset decoration
                        const matches = Array.from(grid.querySelectorAll('.decoration-item')).filter(b => b.dataset && b.dataset.filename === saved);
                        if (matches.length > 0) {
                            matches[0].classList.add('selected');
                            await applyDecoration(saved);
                        } else {
                            noneBtn.classList.add('selected');
                        }
                    } else {
                        // No saved decoration, use default
                        noneBtn.classList.add('selected');
                    }
                })();

            } catch (e) {
                grid.innerHTML = '<div style="color:var(--text-color, #666)">No decorations found.</div>';
            }
        })();

        tabPanes.background.appendChild(decoRow);
    })();
    const chooser = document.createElement('div');
    chooser.className = 'sidebar-chooser';
    chooser.style.cssText = 'display:flex;justify-content:center;align-items:center;height:135px;max-height:135px;min-height:135px;';

        const makeOption = (id, lightImgFile, darkImgFile, label) => {
            const outer = document.createElement('div');
            outer.id = id;
            outer.className = 'sidebar-option';
            outer.style.cssText = 'cursor:pointer;text-align:center;width:140px;border-radius:10px;padding:6px;box-sizing:border-box;';
            const frame = document.createElement('div');
            frame.style.cssText = 'width:100%;height:90px;border-radius:10px;corner-shape:squircle;overflow:hidden;display:block;flex-shrink:0;';
            const img = document.createElement('img');
            const isDark = document.body.classList.contains('dark-mode');
            img.src = tutorialBase + (isDark ? darkImgFile : lightImgFile);
            img.alt = label;
            img.style.cssText = 'width:140px;height:90px;object-fit:cover;object-position:top center;display:block;';
            img.dataset.lightImg = lightImgFile;
            img.dataset.darkImg = darkImgFile;
            frame.appendChild(img);
            const caption = document.createElement('div');
            caption.textContent = label;
            caption.style.cssText = 'margin-top:6px;font-size:13px;';
            outer.appendChild(frame);
            outer.appendChild(caption);
            return outer;
        };

        const classicOpt = makeOption('classic-option', 'classicsidebar.png', 'darkclassicsidebar.png', 'Docked');
        const floatingOpt = makeOption('floating-option', 'floatingsidebar.png', 'darkfloatingsidebar.png', 'Floating');
        chooser.appendChild(classicOpt);
        chooser.appendChild(floatingOpt);

    const togglesBox = document.createElement('div');
    togglesBox.className = 'toggles-box';
    togglesBox.style.cssText = 'display:flex;flex-direction:column;gap:8px;align-items:center;justify-content:center;';

    const todoBtn = newPanel.querySelector('#toggle-todo-btn');
    const calBtn = newPanel.querySelector('#toggle-calendar-btn');
    if (todoBtn) togglesBox.appendChild(todoBtn);
    if (calBtn) togglesBox.appendChild(calBtn);

    const toggleStack = document.createElement('div');
    toggleStack.className = 'sidebar-toggle-group';
    toggleStack.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;flex:1 1 0px;';
    toggleStack.appendChild(togglesBox);
    toggleStack.appendChild(toggleArchivedBtn);

    const sizeRow = document.createElement('div');
    sizeRow.className = 'sb-size-row';
    sizeRow.style.cssText = 'display:flex;flex-direction:column;gap:6px;align-items:center;';

    const sizeLabel = document.createElement('div');
    sizeLabel.textContent = 'Scale';
    sizeLabel.style.cssText = 'font-size:13px;opacity:1;font-weight:500;';

    const controlsRow = document.createElement('div');
    controlsRow.className = 'mgc-scale-controls';
    controlsRow.style.cssText = 'display:flex;gap:12px;align-items:center;justify-content:center;padding:10px 0px;border-radius:18px;border:1px solid rgba(0,0,0,0.06);background:transparent;';

    const minusBtn = document.createElement('button');
    minusBtn.type = 'button';
    minusBtn.className = 'mgc-scale-btn mgc-scale-minus';
    minusBtn.textContent = '−';
    minusBtn.style.cssText = 'width:68px;height:40px;border-radius:12px;cursor:pointer;transition:opacity 0.2s ease;line-height:1;font-size:20px;font-weight:700;';

    const plusBtn = document.createElement('button');
    plusBtn.type = 'button';
    plusBtn.className = 'mgc-scale-btn mgc-scale-plus';
    plusBtn.textContent = '+';
    plusBtn.style.cssText = 'width:68px;height:40px;border-radius:12px;cursor:pointer;transition:opacity 0.2s ease;line-height:1;font-size:20px;font-weight:700;';

    function applySidebarSize(v) {
        try {
            document.body.classList.remove('sbsmallest','sbsmall','sbmedium');
            if (v === '0') document.body.classList.add('sbsmallest');
            else if (v === '1') document.body.classList.add('sbsmall');
            else if (v === '2') document.body.classList.add('sbmedium');
        } catch (_) {}
    }

    function clampSidebarSize(n) {
        if (Number.isNaN(n)) return 3;
        return Math.max(0, Math.min(3, n));
    }

    function updateScaleButtons(valueStr) {
        const n = clampSidebarSize(parseInt(valueStr, 10));
        const isMin = n <= 0;
        const isMax = n >= 3;

        minusBtn.disabled = isMin;
        plusBtn.disabled = isMax;

        minusBtn.style.opacity = isMin ? '0.35' : '1';
        plusBtn.style.opacity = isMax ? '0.35' : '1';
        minusBtn.style.pointerEvents = isMin ? 'none' : 'auto';
        plusBtn.style.pointerEvents = isMax ? 'none' : 'auto';
    }

    function setSidebarSizeValue(n, persist = true) {
        const clamped = clampSidebarSize(n);
        const v = String(clamped);
        currentSize = clamped;
        if (persist) {
            writePref('sidebarSize', clamped);
        }
        applySidebarSize(v);
        updateScaleButtons(v);
    }

    // Read from localStorage immediately
    let initialSize = readLocalNumber('sidebarSize', 3);
    let currentSize = clampSidebarSize(initialSize);

    minusBtn.addEventListener('click', () => {
        setSidebarSizeValue(currentSize - 1);
    });
    plusBtn.addEventListener('click', () => {
        setSidebarSizeValue(currentSize + 1);
    });

    controlsRow.appendChild(minusBtn);
    controlsRow.appendChild(plusBtn);
    sizeRow.appendChild(sizeLabel);
    sizeRow.appendChild(controlsRow);

    // Add indicator dots
    const dotsContainer = document.createElement('div');
    dotsContainer.style.cssText = 'display:flex;gap:6px;justify-content:center;margin-top:8px;';
    for (let i = 0; i < 4; i++) {
      const dot = document.createElement('div');
      dot.className = `size-indicator-dot size-dot-${i + 1}`;
      dot.style.cssText = 'width:6px;height:6px;border-radius:50%;background-color:currentColor;transition:opacity 0.2s ease;';
      dotsContainer.appendChild(dot);
    }
    sizeRow.appendChild(dotsContainer);
    
    // Update dots after they're created
    updateScaleButtons(String(initialSize));
    setSidebarSizeValue(initialSize, false);
    
    // Load from sync storage in background
    reconcileSync('sidebarSize', 3, initialSize, (storedSize) => {
        const syncSize = (storedSize !== null) ? parseInt(storedSize, 10) : 3;
        if (syncSize !== initialSize) {
            initialSize = syncSize;
            setSidebarSizeValue(initialSize, false);
        }
    });

    const containerRow = document.createElement('div');
    containerRow.className = 'settings-row-container';
    containerRow.style.cssText = 'display:flex;justify-content:space-evenly;align-items:center;gap:12px;margin-top:0px;flex-wrap: wrap;';
    containerRow.appendChild(toggleStack);
    containerRow.appendChild(sizeRow);
    containerRow.appendChild(chooser);

    (function setupLayoutSection() {
        const layoutRow = document.createElement('div');
        layoutRow.className = 'layout-row';
        layoutRow.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:18px;';

        const btns = document.createElement('div');
        btns.style.cssText = 'display:flex;gap:8px;align-items:center;';

        const standardBtn = document.createElement('button');
        standardBtn.type = 'button';
        standardBtn.className = 'setting-toggle-btn layout-btn';
        standardBtn.style.cssText = 'display:flex;flex-direction:column;align-items:center;padding:8px 12px;';

        const stdPreview = document.createElement('div');
        stdPreview.className = 'layout-mini-preview layout-mini-preview-standard';
        stdPreview.style.cssText = 'height:30px;border-radius:8px;background:var(--mgc-surface, #e9edf8);width:44px;margin-bottom:8px;transition:width 0.18s ease, background 0.18s ease;';
        const stdLabel = document.createElement('div');
        stdLabel.textContent = 'Standard';
        stdLabel.style.cssText = 'font-size:13px;font-weight:500;';
        standardBtn.appendChild(stdPreview);
        standardBtn.appendChild(stdLabel);

        const fillBtn = document.createElement('button');
        fillBtn.type = 'button';
        fillBtn.className = 'setting-toggle-btn layout-btn';
        fillBtn.style.cssText = 'display:flex;flex-direction:column;align-items:center;padding:8px 12px;';

        const fillPreview = document.createElement('div');
        fillPreview.className = 'layout-mini-preview layout-mini-preview-fill';
        fillPreview.style.cssText = 'height:30px;border-radius:8px;background:var(--mgc-surface, #e9edf8);width:80px;margin-bottom:8px;transition:width 0.18s ease, background 0.18s ease;';
        const fillLabel = document.createElement('div');
        fillLabel.textContent = 'Fill';
        fillLabel.style.cssText = 'font-size:13px;font-weight:500;';
        fillBtn.appendChild(fillPreview);
        fillBtn.appendChild(fillLabel);

        btns.appendChild(standardBtn);
        btns.appendChild(fillBtn);

        const actionsRow = document.createElement('div');
        // Keep the help text right next to the buttons
        actionsRow.style.cssText = 'display:flex;gap:12px;align-items:center;';
        actionsRow.appendChild(btns);

        const info = document.createElement('div');
        info.className = 'layout-help-text';
        // Use an explicit color with !important so it overrides other rules
        info.style.cssText = 'max-width:320px;font-size:13px;color:rgba(0,0,0,0.6) !important;line-height:1.3;margin-left:6px;font-weight:500;';
        info.textContent = 'This adjusts whether or not the Classroom content extends to the edges of your screen. This is not applied to the settings page.';
        actionsRow.appendChild(info);
        try { info.style.setProperty('color','rgba(0,0,0,0.6)','important'); } catch (_) {}

        layoutRow.appendChild(actionsRow);

        function updatePreviewAppearance(mode) {
            try {
                // Keep preview sizes reflecting their types
                stdPreview.style.width = '35px';
                fillPreview.style.width = '60px';

                // adapt to dark mode
                const isDark = document.body.classList.contains('dark-mode');
                const bg = isDark ? 'rgba(255,255,255,0.03)' : 'var(--mgc-surface, #e9edf8)';
                const border = isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)';
                stdPreview.style.background = bg;
                fillPreview.style.background = bg;
                stdPreview.style.border = border;
                fillPreview.style.border = border;

                // info text color adapts to dark mode and must override other rules
                try { if (info) info.style.setProperty('color', isDark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0,0,0,0.6)', 'important'); } catch (_) {}

                // subtle active highlight
                if (mode === 'fill' || mode === 'fill-screen') {
                    fillPreview.style.opacity = '1';
                    stdPreview.style.opacity = '0.6';
                } else {
                    stdPreview.style.opacity = '1';
                    fillPreview.style.opacity = '0.6';
                }
            } catch (_) {}
        }

        function applyLayoutMode(mode, persist = true) {
            currentLayoutMode = mode;
            if (persist) writePref('layoutMode', mode);

            if (mode === 'fill' || mode === 'fill-screen') {
                try { document.body.classList.add('mgc-layout-fill-screen'); } catch (_) {}
                try { document.body.classList.add('fillview'); } catch (_) {}
                fillBtn.classList.add('active');
                standardBtn.classList.remove('active');
            } else {
                try { document.body.classList.remove('mgc-layout-fill-screen'); } catch (_) {}
                try { document.body.classList.remove('fillview'); } catch (_) {}
                standardBtn.classList.add('active');
                fillBtn.classList.remove('active');
            }

            updatePreviewAppearance(mode);
        }

        standardBtn.addEventListener('click', () => applyLayoutMode('standard'));
        fillBtn.addEventListener('click', () => applyLayoutMode('fill'));

        // Initialize state from localStorage first
        let stored = readLocalRaw('layoutMode') || 'standard';
        let currentLayoutMode = stored;
        applyLayoutMode(stored, false);
        
        // Then load from sync storage in background
        reconcileSync('layoutMode', 'standard', stored, (syncStored) => {
            currentLayoutMode = syncStored;
            applyLayoutMode(syncStored, false);
        });

        // Keep preview in sync with dark mode changes
        onBodyClassChange(() => updatePreviewAppearance(currentLayoutMode));

        // Place the layout controls in their own tab.
        tabPanes.layout.appendChild(layoutRow);
    })();

                const sidebarSection = document.createElement('div');
                sidebarSection.className = 'sidebar-row';
                sidebarSection.style.cssText = 'display:flex;flex-direction:column;gap:12px;padding:10px;';
                sidebarSection.appendChild(containerRow);

                const sidebarAdjustmentsRow = document.createElement('div');
                sidebarAdjustmentsRow.className = 'sidebar-adjustments-row';
                sidebarAdjustmentsRow.style.cssText = 'display:flex;gap:12px;align-items:center;justify-content:center;width:100%;box-sizing:border-box;flex-wrap:wrap;';

                const iconStyleRow = document.createElement('div');
                iconStyleRow.className = 'sidebar-icon-style-row';
                iconStyleRow.style.cssText = 'display:flex;flex-direction:column;justify-content:space-evenly;gap:8px;align-items:center;padding:10px;width:auto;box-sizing:border-box;';

                const iconStyleLabel = document.createElement('div');
                iconStyleLabel.textContent = 'Icon Set';
                iconStyleLabel.style.cssText = 'font-size:13px;font-weight:500;';

                const iconStyleBtns = document.createElement('div');
                iconStyleBtns.style.cssText = 'display:flex;gap:8px;align-items:center;justify-content:flex-start;width:100%;flex-direction:column;';

                const newIconsBtn = document.createElement('button');
                newIconsBtn.type = 'button';
                newIconsBtn.className = 'setting-toggle-btn';
                newIconsBtn.title = 'Use new sidebar icons';
                newIconsBtn.setAttribute('aria-label', 'Use new sidebar icons');
                newIconsBtn.style.cssText = 'height:40px;border-radius:12px;padding:15px !important;justify-content:center;width:auto;min-width:0;';
                newIconsBtn.innerHTML = `
                    <div style="display:flex;align-items:center;gap:10px;">
                            <img src="${iconBaseUrl}newhome.svg" alt="New Home" style="width:18px;height:18px;">
                            <img src="${iconBaseUrl}newtodo.svg" alt="New To-do" style="width:18px;height:18px;">
                            <img src="${iconBaseUrl}newsettings.svg" alt="New Settings" style="width:18px;height:18px;">
                    </div>
                `;

                const oldIconsBtn = document.createElement('button');
                oldIconsBtn.type = 'button';
                oldIconsBtn.className = 'setting-toggle-btn';
                oldIconsBtn.title = 'Use old sidebar icons';
                oldIconsBtn.setAttribute('aria-label', 'Use old sidebar icons');
                oldIconsBtn.style.cssText = 'height:40px;border-radius:12px;padding:15px !important;justify-content:center;width:auto;min-width:0;';
                oldIconsBtn.innerHTML = `
                    <div style="display:flex;align-items:center;gap:10px;color:currentColor;">
                            <svg data-mgc-static-preview="old-home" viewBox="0 0 24 24" aria-hidden="true" style="width:18px;height:18px;fill:currentColor;"><path d="M12 3L4 9v12h16V9l-8-6zm6 16h-3v-6H9v6H6v-9l6-4.5 6 4.5v9z"></path></svg>
                            <svg data-mgc-static-preview="old-todo" enable-background="new 0 0 24 24" focusable="false" height="24" viewBox="0 0 24 24" width="24" aria-hidden="true" style="width:18px;height:18px;fill:currentColor;"><g><rect fill="none" height="24" width="24"></rect></g><g><g><path d="M20,3H4C2.9,3,2,3.9,2,5v14c0,1.1,0.9,2,2,2h16c1.1,0,2-0.9,2-2V5 C22,3.9,21.1,3,20,3z M20,19H4V5h16V19z" fill-rule="evenodd"></path><polygon fill-rule="evenodd" points="19.41,10.42 17.99,9 14.82,12.17 13.41,10.75 12,12.16 14.82,15"></polygon><rect fill-rule="evenodd" height="2" width="5" x="5" y="7"></rect><rect fill-rule="evenodd" height="2" width="5" x="5" y="11"></rect><rect fill-rule="evenodd" height="2" width="5" x="5" y="15"></rect></g></g></svg>
                            <svg data-mgc-static-preview="old-settings" focusable="false" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" style="width:18px;height:18px;fill:currentColor;"><path d="M13.85 22.25h-3.7c-.74 0-1.36-.54-1.45-1.27l-.27-1.89c-.27-.14-.53-.29-.79-.46l-1.8.72c-.7.26-1.47-.03-1.81-.65L2.2 15.53c-.35-.66-.2-1.44.36-1.88l1.53-1.19c-.01-.15-.02-.3-.02-.46 0-.15.01-.31.02-.46l-1.52-1.19c-.59-.45-.74-1.26-.37-1.88l1.85-3.19c.34-.62 1.11-.9 1.79-.63l1.81.73c.26-.17.52-.32.78-.46l.27-1.91c.09-.7.71-1.25 1.44-1.25h3.7c.74 0 1.36.54 1.45 1.27l.27 1.89c.27.14.53.29.79.46l1.8-.72c.71-.26 1.48.03 1.82.65l1.84 3.18c.36.66.2 1.44-.36 1.88l-1.52 1.19c.01.15.02.3.02.46s-.01.31-.02.46l1.52 1.19c.56.45.72 1.23.37 1.86l-1.86 3.22c-.34.62-1.11.9-1.8.63l-1.8-.72c-.26.17-.52.32-.78.46l-.27 1.91c-.1.68-.72 1.22-1.46 1.22zm-3.23-2h2.76l.37-2.55.53-.22c.44-.18.88-.44 1.34-.78l.45-.34 2.38.96 1.38-2.4-2.03-1.58.07-.56c.03-.26.06-.51.06-.78s-.03-.53-.06-.78l-.07-.56 2.03-1.58-1.39-2.4-2.39.96-.45-.35c-.42-.32-.87-.58-1.33-.77l-.52-.22-.37-2.55h-2.76l-.37 2.55-.53.21c-.44.19-.88.44-1.34.79l-.45.33-2.38-.95-1.39 2.39 2.03 1.58-.07.56a7 7 0 0 0-.06.79c0 .26.02.53.06.78l.07.56-2.03 1.58 1.38 2.4 2.39-.96.45.35c.43.33.86.58 1.33.77l.53.22.38 2.55z"></path><circle cx="12" cy="12" r="3.5"></circle></svg>
                    </div>
                `;

                iconStyleBtns.appendChild(newIconsBtn);
                iconStyleBtns.appendChild(oldIconsBtn);
                iconStyleRow.appendChild(iconStyleLabel);
                iconStyleRow.appendChild(iconStyleBtns);
                containerRow.appendChild(iconStyleRow);

                const hoverExpandRow = document.createElement('div');
                hoverExpandRow.className = 'sidebar-hover-expand-row';
                hoverExpandRow.style.cssText = 'display:flex;flex-direction:column;gap:8px;align-items:flex-start;padding-right:3px;width:auto;box-sizing:border-box;';

                const hoverExpandChooser = document.createElement('div');
                hoverExpandChooser.className = 'sidebar-chooser';
                hoverExpandChooser.style.cssText = 'display:flex;gap:0px;justify-content:center;align-items:center;height:135px;max-height:135px;min-height:135px;';

                function makeHoverExpandOption(id, lightImgFile, darkImgFile, label) {
                    const outer = document.createElement('div');
                    outer.id = id;
                    outer.className = 'sidebar-option';
                    outer.style.cssText = 'cursor:pointer;text-align:center;width:140px;border-radius:10px;padding:6px;box-sizing:border-box;';
                    const frame = document.createElement('div');
                    frame.style.cssText = 'width:100%;height:90px;border-radius:10px;corner-shape:squircle;overflow:hidden;display:block;flex-shrink:0;';
                    const img = document.createElement('img');
                    const isDark = document.body.classList.contains('dark-mode');
                    img.src = tutorialBase + (isDark ? darkImgFile : lightImgFile);
                    img.alt = label;
                    img.style.cssText = 'width:140px;height:90px;object-fit:cover;object-position:top center;display:block;';
                    img.dataset.lightImg = lightImgFile;
                    img.dataset.darkImg = darkImgFile;
                    frame.appendChild(img);
                    const caption = document.createElement('div');
                    caption.textContent = label;
                    caption.style.cssText = 'margin-top:6px;font-size:13px;';
                    outer.appendChild(frame);
                    outer.appendChild(caption);
                    return outer;
                }

                const showOneOpt = makeHoverExpandOption('sidebar-show-one-option', 'showone.png', 'showone dark.png', 'Expand Class');
                const showAllOpt = makeHoverExpandOption('sidebar-show-all-option', 'showall.png', 'showall dark.png', 'Expand Sidebar');
                const classicImg = classicOpt.querySelector('img');
                const floatingImg = floatingOpt.querySelector('img');
                const showOneImg = showOneOpt.querySelector('img');
                const showAllImg = showAllOpt.querySelector('img');

                hoverExpandChooser.appendChild(showOneOpt);
                hoverExpandChooser.appendChild(showAllOpt);
                hoverExpandRow.appendChild(hoverExpandChooser);
                sidebarAdjustmentsRow.appendChild(hoverExpandRow);
                sidebarAdjustmentsRow.appendChild(chooser);
                sidebarSection.appendChild(sidebarAdjustmentsRow);

                // Add sidebar height adjustment slider
                const heightAdjustRow = document.createElement('div');
                heightAdjustRow.className = 'sidebar-height-row';
                heightAdjustRow.style.cssText = 'display:flex;flex-direction:column;gap:8px;align-items:center;';

                const heightLabel = document.createElement('div');
                heightLabel.className = 'sidebar-height-label';
                heightLabel.textContent = 'Maximum Height';
                heightLabel.style.cssText = 'font-size:13px;font-weight:500;align-self:flex-start;';

                const sliderContainer = document.createElement('div');
                sliderContainer.className = 'sidebar-height-slider-container';
                sliderContainer.style.cssText = 'width:100%;display:flex;align-items:center;';

                const sliderInput = document.createElement('input');
                sliderInput.type = 'range';
                sliderInput.className = 'sidebar-height-slider';
                sliderInput.min = '-168';
                sliderInput.max = '612';
                sliderInput.step = '20';
                
                // Load from localStorage immediately
                let initialHeight = readLocalNumber('sidebarHeightAdjust', 312);
                sliderInput.value = initialHeight;

                sliderContainer.appendChild(sliderInput);
                heightAdjustRow.appendChild(heightLabel);
                heightAdjustRow.appendChild(sliderContainer);
                sidebarSection.appendChild(heightAdjustRow);

                // Handle slider changes
                function applyEnrolledHeightAdjustment(value, persist = true) {
                    const numValue = parseInt(value, 10);
                    if (!Number.isFinite(numValue)) return;
                    initialHeight = numValue;
                    if (persist) {
                        writePref('sidebarHeightAdjust', numValue);
                    }

                    // Flip the direction: 624 - value (so dragging right decreases, left increases)
                    const adjustedValue = 624 - numValue;
                    document.documentElement.style.setProperty('--enrolled-height-adjust', adjustedValue + 'px');
                    if (document.body) document.body.style.setProperty('--enrolled-height-adjust', adjustedValue + 'px');
                }

                function applySidebarIconMode(useNewIcons, persist = true) {
                    const enabled = !!useNewIcons;
                    newIconsBtn.classList.toggle('active', enabled);
                    oldIconsBtn.classList.toggle('active', !enabled);
                    try {
                        if (document.body) document.body.classList.toggle('mgc-use-new-sidebar-icons', enabled);
                    } catch (_) {}

                    if (persist) {
                        writePref('sidebarUseNewIcons', enabled);
                    }

                    try {
                        window.dispatchEvent(new CustomEvent('mgc-sidebar-icon-style-changed', {
                            detail: { useNewIcons: enabled }
                        }));
                    } catch (_) {}
                }

                function applySidebarHoverExpandMode(enabled, persist = true) {
                    const isEnabled = !!enabled;
                    showOneOpt.classList.toggle('selected', !isEnabled);
                    showAllOpt.classList.toggle('selected', isEnabled);

                    try {
                        if (document.body) {
                            document.body.classList.toggle('sidebar-expand-all-hover', isEnabled);
                        }
                    } catch (_) {}

                    if (persist) {
                        writePref('sidebarExpandAllHover', isEnabled);
                    }

                    try {
                        window.dispatchEvent(new CustomEvent('mgc-sidebar-hover-expand-changed', {
                            detail: { enabled: isEnabled }
                        }));
                    } catch (_) {}
                }

                newIconsBtn.addEventListener('click', () => applySidebarIconMode(true));
                oldIconsBtn.addEventListener('click', () => applySidebarIconMode(false));
                showOneOpt.addEventListener('click', () => applySidebarHoverExpandMode(false));
                showAllOpt.addEventListener('click', () => applySidebarHoverExpandMode(true));

                let initialIconMode = readLocalRaw('sidebarUseNewIcons');
                initialIconMode = initialIconMode === null ? true : initialIconMode !== 'false';
                applySidebarIconMode(initialIconMode, false);

                reconcileSync('sidebarUseNewIcons', true, initialIconMode, (syncValue) => {
                    applySidebarIconMode(!!syncValue, false);
                });

                let initialHoverExpand = readLocalBool('sidebarExpandAllHover', false);
                applySidebarHoverExpandMode(initialHoverExpand, false);

                reconcileSync('sidebarExpandAllHover', initialHoverExpand, initialHoverExpand, (syncValue) => {
                    applySidebarHoverExpandMode(!!syncValue, false);
                });

                const startInteraction = () => {
                    sidebarForceVisible = true;
                    // Always try to find the fresh sidebar element
                    const currentSidebar = document.querySelector('.STek2d');
                    if (currentSidebar) {
                        sidebar = currentSidebar; // Update global reference
                        sidebar.classList.add('sidebar-visible');
                        if (sidebarHotspot) sidebarHotspot.classList.add('sidebar-hide-indicator');
                    }
                };

                const endInteraction = () => {
                    sidebarForceVisible = false;
                    
                    // Re-evaluate sidebar visibility based on screen size
                    const currentSidebar = document.querySelector('.STek2d');
                    if (currentSidebar) {
                        sidebar = currentSidebar;
                        // Only hide if we are on small screen
                        if (window.innerWidth <= 1042) {
                            sidebar.classList.remove('sidebar-visible');
                            if (sidebarHotspot) sidebarHotspot.classList.remove('sidebar-hide-indicator');
                        }
                    }
                    
                    const enrolledEls = document.querySelectorAll('.STek2d div[role="group"]');
                    enrolledEls.forEach(el => el.style.setProperty('height', 'auto', 'important'));
                };

                let previewScheduled = false;
                let pendingPreviewValue = initialHeight;
                const renderDragPreview = (value) => {
                    pendingPreviewValue = parseInt(value, 10);
                    if (!Number.isFinite(pendingPreviewValue) || previewScheduled) return;
                    previewScheduled = true;
                    const run = () => {
                        previewScheduled = false;
                        const enrolledEls = document.querySelectorAll('.STek2d div[role="group"]');
                        if (!enrolledEls.length) return;
                        const adjustedValue = 624 - pendingPreviewValue;
                        const calcExpression = document.body.classList.contains('calendar-hidden')
                            ? `calc((100vh - ${adjustedValue}px + 52px) / var(--sidebar-scale, 1))`
                            : `calc((100vh - ${adjustedValue}px) / var(--sidebar-scale, 1))`;
                        enrolledEls.forEach(el => el.style.setProperty('height', calcExpression, 'important'));
                    };
                    (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb) => setTimeout(cb, 16))(run);
                };

                sliderInput.addEventListener('input', (e) => {
                    if (!sidebarForceVisible) startInteraction();
                    applyEnrolledHeightAdjustment(e.target.value, false);
                    renderDragPreview(e.target.value);
                });

                sliderInput.addEventListener('mousedown', startInteraction);
                sliderInput.addEventListener('touchstart', startInteraction, { passive: true });

                sliderInput.addEventListener('change', (e) => {
                    applyEnrolledHeightAdjustment(e.target.value, true);
                    endInteraction();
                });
                
                sliderInput.addEventListener('mouseup', endInteraction);
                sliderInput.addEventListener('mouseleave', endInteraction);
                sliderInput.addEventListener('touchend', endInteraction, { passive: true });

                const applyInitial = (savedAdjust) => {
                    sliderInput.value = savedAdjust;
                    applyEnrolledHeightAdjustment(savedAdjust, false);
                };

                applyInitial(initialHeight);
                setTimeout(() => applyInitial(initialHeight), 220);
                
                // Load from sync storage in background
                reconcileSync('sidebarHeightAdjust', 312, initialHeight, (syncHeight) => {
                    initialHeight = parseInt(syncHeight, 10);
                    if (!Number.isFinite(initialHeight)) return;
                    applyInitial(initialHeight);
                });

                // Watch for page changes and reapply adjustment
                try {
                    let applyScheduled = false;
                    const enrolledObserver = new MutationObserver((mutations) => {
                        let shouldApply = false;
                        for (const mutation of mutations) {
                            if (mutation.type !== 'childList') continue;
                            for (const node of mutation.addedNodes) {
                                if (!(node instanceof Element)) continue;
                                if (
                                  node.matches('.STek2d, .STek2d div[role="group"]') ||
                                  node.querySelector('.STek2d, .STek2d div[role="group"]')
                                ) {
                                  shouldApply = true;
                                  break;
                                }
                            }
                            if (shouldApply) break;
                        }
                        if (!shouldApply || applyScheduled) return;
                        applyScheduled = true;
                        setTimeout(() => {
                          applyScheduled = false;
                          applyEnrolledHeightAdjustment(initialHeight, false);
                        }, 40);
                    });
                    enrolledObserver.observe(document.body, {
                        childList: true,
                        subtree: true
                    });
                } catch (_) {}

                tabPanes.sidebar.appendChild(sidebarSection);

                // Bind archived toggle and apply saved state when element appears
                // This handles both settings page and other pages where it may load dynamically
                // Multilingual selector for archived classes (supports 12+ languages)
                const archivedClassesSelector = '[aria-label="Archived classes"], [aria-label="Archived Classes"], [aria-label="Clases archivadas"], [aria-label="Classes archivées"], [aria-label="Archivierte Kurse"], [aria-label="Aulas arquivadas"], [aria-label="Classi archiviate"], [aria-label="Gearchiveerde klassen"], [aria-label="Архивные классы"], [aria-label="已归档的课程"], [aria-label="已封存的課程"], [aria-label="アーカイブされたクラス"], [aria-label="보관된 클래스"]';
                
                waitForElement(archivedClassesSelector, () => {
                    const btn = document.querySelector('#toggle-archived-btn');
                    const target = document.querySelector(archivedClassesSelector);
                    if (!target) return;
                    
                    // Element exists — apply saved hidden state and set up listener
                    const hidden = readLocalBool('hideArchived', false);

                    if (hidden) {
                        target.style.display = 'none';
                        if (btn) btn.classList.remove('active');
                        try { document.body.classList.add('archived-hidden'); } catch (e) {}
                    } else {
                        target.style.display = '';
                        if (btn) btn.classList.add('active');
                        try { document.body.classList.remove('archived-hidden'); } catch (e) {}
                    }

                    // Set up listener if button exists
                    if (btn) {
                        setupToggleButton('#toggle-archived-btn', archivedClassesSelector, 'hideArchived', 'archived-hidden');
                    }
                });

                
                function updateSidebarImages() {
                    const isDark = document.body.classList.contains('dark-mode');
                    if (classicImg) {
                        classicImg.src = tutorialBase + (isDark ? classicImg.dataset.darkImg : classicImg.dataset.lightImg);
                    }
                    if (floatingImg) {
                        floatingImg.src = tutorialBase + (isDark ? floatingImg.dataset.darkImg : floatingImg.dataset.lightImg);
                    }
                    if (showOneImg) {
                        showOneImg.src = tutorialBase + (isDark ? showOneImg.dataset.darkImg : showOneImg.dataset.lightImg);
                    }
                    if (showAllImg) {
                        showAllImg.src = tutorialBase + (isDark ? showAllImg.dataset.darkImg : showAllImg.dataset.lightImg);
                    }
                }
                
                updateSidebarImages();

                onBodyClassChange(() => {
                    updateSidebarImages();
                });

                feedbackBtn.style.marginLeft = '0px';

                                // ---- LIQUID GLASS TOGGLE ----
                const glassRow = document.createElement('div');
                glassRow.className = 'layout-row';
                glassRow.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:12px;';

                const glassLabel = document.createElement('div');
                glassLabel.textContent = 'Liquid Glass';
                glassLabel.style.cssText = 'font-size:16px;font-weight:600;';
                glassRow.appendChild(glassLabel);

                const glassToggleContainer = document.createElement('div');
                glassToggleContainer.style.cssText = 'display:flex;gap:12px;align-items:center;';

                const glassToggle = document.createElement('div');
                glassToggle.className = 'cui-toggle-track';
                glassToggle.id = 'cui-glass-toggle';
                glassToggle.style.cssText = 'position:relative;width:44px;height:24px;border-radius:12px;cursor:pointer;transition:0.3s;flex-shrink:0;background:#444;';
                const glassThumb = document.createElement('div');
                glassThumb.className = 'cui-toggle-thumb';
                glassThumb.style.cssText = 'position:absolute;top:2px;left:2px;width:20px;height:20px;background:#fff;border-radius:50%;transition:0.3s;';
                glassToggle.appendChild(glassThumb);

                const glassLabelText = document.createElement('span');
                glassLabelText.textContent = 'Enable shimmer & blur';
                glassLabelText.style.cssText = 'font-size:14px;font-weight:500;';

                glassToggleContainer.appendChild(glassLabelText);
                glassToggleContainer.appendChild(glassToggle);
                glassRow.appendChild(glassToggleContainer);

                // Insert after decoration section
                if (decorationRowEl) {
                    decorationRowEl.parentNode.insertBefore(glassRow, decorationRowEl.nextSibling);
                } else {
                    newPanel.appendChild(glassRow);
                }

                // ---- Load initial state using existing helpers ----
                const glassEnabled = readLocalBool('glassEnabled', false);
                if (glassEnabled) {
                    glassToggle.style.background = '#6c5ce7';
                    glassThumb.style.left = '22px';
                    document.body.classList.add('cui-glass-enabled');
                }

                // ---- Toggle event ----
            glassToggle.addEventListener('click', function() {
            const current = readLocalBool('glassEnabled', false);
            const newVal = !current;
            writePref('glassEnabled', newVal);
            if (newVal) {
                injectGlassFilter();               // <-- ADD THIS
                document.body.classList.add('cui-glass-enabled');
                this.style.background = '#6c5ce7';
                this.querySelector('.cui-toggle-thumb').style.left = '22px';
            } else {
                document.body.classList.remove('cui-glass-enabled');
                this.style.background = '#444';
                this.querySelector('.cui-toggle-thumb').style.left = '2px';
            }
        });
                // ---- END LIQUID GLASS ----

        // ---- FONT PICKER ----
        const fontRow = document.createElement('div');
        fontRow.className = 'layout-row';
        fontRow.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:12px;';

        const fontLabel = document.createElement('div');
        fontLabel.textContent = 'Font';
        fontLabel.style.cssText = 'font-size:16px;font-weight:600;';
        fontRow.appendChild(fontLabel);

        const fontSelectContainer = document.createElement('div');
        fontSelectContainer.style.cssText = 'display:flex;gap:12px;align-items:center;';

        const fontSelect = document.createElement('select');
        fontSelect.id = 'cui-font-select';
        fontSelect.style.cssText = `
        padding: 8px 12px;
        border-radius: 10px;
        border: 1.5px solid rgba(235, 237, 255, 0.58);
        background: rgba(255, 255, 255, 0.7);
        color: #202124;
        font-size: 14px;
        cursor: pointer;
        flex: 1;
        outline: none;
        `;

        // Get available fonts
        const fonts = (typeof window.fontPicker !== 'undefined')
        ? window.fontPicker.getAvailableFonts()
        : [];

        // Build options (no style yet)
        fonts.forEach(font => {
        const option = document.createElement('option');
        option.value = font.name;
        option.textContent = font.name;
        fontSelect.appendChild(option);
        });

        // Load saved font
        const savedFont = (typeof window.fontPicker !== 'undefined')
        ? window.fontPicker.loadSelectedFont()
        : 'Google Sans';
        fontSelect.value = savedFont;

        // ---- Load fonts & style dropdown with !important ----
        async function loadFontsAndStyleDropdown() {
        // Preload Google Fonts
        if (typeof window.fontPicker?.preloadAllFonts === 'function') {
            window.fontPicker.preloadAllFonts();
        }
        await new Promise(r => setTimeout(r, 50));

        // Load each web font via Font Loading API
        const loadPromises = fonts.map(font => {
            if (!font.url) return Promise.resolve();
            const family = font.name;
            const quoted = family.includes(' ') ? `"${family}"` : family;
            return document.fonts.load(`1em ${quoted}`).catch(() => {});
        });
        await Promise.allSettled(loadPromises);

        // Apply fonts to each option with !important
        const options = fontSelect.querySelectorAll('option');
        options.forEach((opt, i) => {
            const font = fonts[i];
            if (font) {
            opt.style.setProperty('font-family', font.value, 'important');
            }
        });

        // Set the select's font to the saved font (so closed dropdown shows the selected font)
        const savedFontObj = fonts.find(f => f.name === savedFont);
        if (savedFontObj) {
            fontSelect.style.fontFamily = savedFontObj.value;
        }

        // Force repaint
        fontSelect.style.display = 'none';
        void fontSelect.offsetHeight;
        fontSelect.style.display = '';
        }

        loadFontsAndStyleDropdown().catch(() => {});

        // ---- Change handler ----
        fontSelect.addEventListener('change', function() {
        const selected = this.value;
        if (typeof window.fontPicker !== 'undefined') {
            window.fontPicker.saveSelectedFont(selected);
            window.fontPicker.applyFont(selected);
            const fontObj = fonts.find(f => f.name === selected);
            if (fontObj) {
            this.style.fontFamily = fontObj.value;
            }
        }
        try {
            if (typeof showStatus === 'function') showStatus('Font updated!');
        } catch (_) {}
        });

        fontSelectContainer.appendChild(fontSelect);
        fontRow.appendChild(fontSelectContainer);

        // ---- Insert after Liquid Glass ----
        const glassRowElement = document.querySelector('#cui-glass-toggle')?.closest('.layout-row');
        if (glassRowElement) {
        glassRowElement.parentNode.insertBefore(fontRow, glassRowElement.nextSibling);
        } else if (decorationRowEl) {
        decorationRowEl.parentNode.insertBefore(fontRow, decorationRowEl.nextSibling);
        } else {
        newPanel.appendChild(fontRow);
        }

        // Dark mode styling
        const updateFontSelectStyle = () => {
        const isDark = document.body.classList.contains('dark-mode');
        fontSelect.style.background = isDark ? 'rgba(33, 33, 38, 0.9)' : 'rgba(255, 255, 255, 0.7)';
        fontSelect.style.color = isDark ? '#e8e8ea' : '#202124';
        fontSelect.style.borderColor = isDark ? 'rgba(43, 45, 63, 0.421)' : 'rgba(235, 237, 255, 0.58)';
        };
        updateFontSelectStyle();
        const fontObserver = new MutationObserver(updateFontSelectStyle);
        fontObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        // END FONT PICKER



        function setSidebarMode(mode, persist = true) {
            const isClassic = mode === 'classic';
            try {
                if (isClassic) document.body.classList.add('classic-sidebar');
                else document.body.classList.remove('classic-sidebar');
            } catch (_) {}
            if (persist) {
                writePref('classicSidebar', isClassic);
            }

            try {
                classicOpt.classList.toggle('selected', isClassic);
                floatingOpt.classList.toggle('selected', !isClassic);
            } catch (_) {}
        }

        classicOpt.addEventListener('click', () => setSidebarMode('classic'));
        floatingOpt.addEventListener('click', () => setSidebarMode('floating'));

        // Load from localStorage immediately
        let storedClassic = readLocalBool('classicSidebar', false);
        setSidebarMode(storedClassic ? 'classic' : 'floating', false);
        
        // Then load from sync storage in background
        reconcileSync('classicSidebar', false, storedClassic, (syncClassic) => {
            setSidebarMode(syncClassic ? 'classic' : 'floating', false);
        });

    }
    return true;
}
