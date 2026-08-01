(function() {
    function initFloatingNotesWidget() {
        if (document.querySelector('.mc-notes-widget')) return;

        const STORAGE_KEY = 'modernClassroom_floatingNotes';
        const STARRED_ASSIGNMENTS_KEY = 'modernClassroom_starredAssignments';
        const LEGACY_STORAGE_KEY = 'mcFloatingNotesStateV1';
        const PANEL_SIZE_KEY = 'modernClassroom_floatingNotesPanelSize';
        const PANEL_MODE_KEY = 'modernClassroom_floatingNotesPanelMode';
        const PANEL_FIXED_WIDTH_KEY = 'modernClassroom_floatingNotesFixedWidth';
        const defaultState = { todos: [], text: '', starredAssignments: [] };
        const defaultPanelSize = { width: 380, height: 420 };
        const defaultFixedPanelWidth = 420;
        let state = { ...defaultState };
        let draggedItem = null;
        let draggedTask = null;
        let editingId = null;
        let editingTaskIndex = null;
        let addingNewSection = false;
        let hoverCloseTimer = null;
        const hoverCloseDelayMs = 400;
        const hoverCloseZonePx = 80;
        const notesIconUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
            ? chrome.runtime.getURL('Icons/notebook.svg')
            : '';
        const fixedNotesIconUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
            ? chrome.runtime.getURL('Icons/fixednotes.svg')
            : '';
        const floatNotesIconUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
            ? chrome.runtime.getURL('Icons/floatnotes.svg')
            : '';
        const lockIconUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
            ? chrome.runtime.getURL('Icons/lock.svg')
            : '';
        const resizeIconUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
            ? chrome.runtime.getURL('Icons/resize.svg')
            : '';
        const broomIconUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
            ? chrome.runtime.getURL('Icons/fi-sr-broom.svg')
            : '';

        const widget = document.createElement('div');
        widget.className = 'mc-notes-widget';
        widget.innerHTML = `
            <button class="mc-notes-trigger" type="button" aria-label="Open notes">
                <img class="mc-notes-trigger-icon" src="${notesIconUrl}" alt="" aria-hidden="true" />
            </button>
            <div class="mc-notes-control-island" aria-label="Notes controls">
                <button class="mc-notes-resize-handle" type="button" aria-label="Resize notes panel" title="Drag to resize"></button>
                <button class="mc-notes-mode-toggle" type="button" aria-label="Dock notes" title="Dock notes panel">
                    <img class="mc-notes-mode-icon" src="${fixedNotesIconUrl}" alt="" aria-hidden="true" />
                </button>
                <button class="mc-notes-lock-toggle" type="button" aria-label="Lock panel open" title="Keep panel open" aria-pressed="false">
                    <img class="mc-notes-lock-icon" src="${lockIconUrl}" alt="" aria-hidden="true" />
                </button>
                <div class="mc-notes-add-shell">
                    <button class="mc-notes-add-section" type="button" aria-label="Add section" title="Add section">+</button>
                </div>
                
            </div>
            <div class="mc-notes-panel" role="dialog" aria-label="Notes panel">
                <div class="mc-notes-tabs" role="tablist" aria-label="Notes tabs">
                    <div class="mc-notes-tabs-center">
                        <div class="mc-notes-tab active" data-tab="starred" role="tab" aria-selected="true" tabindex="0">Saved</div>
                        <div class="mc-notes-tab" data-tab="todo" role="tab" aria-selected="false" tabindex="0">Todo</div>
                        <div class="mc-notes-tab" data-tab="notepad" role="tab" aria-selected="false" tabindex="0">Notepad</div>
                        
                    </div>
                </div>
                <div class="mc-notes-body">
                    <div class="mc-notes-view active" data-view="starred">
                        <ul class="mc-notes-starred-list"></ul>
                    </div>
                    <div class="mc-notes-view" data-view="todo">
                        <ul class="mc-notes-todo-list"></ul>
                    </div>
                    <div class="mc-notes-view" data-view="notepad">
                        <textarea class="mc-notes-textarea" placeholder="Note down..."></textarea>
                    </div>
                    
                </div>
            </div>
        `;

        document.body.appendChild(widget);
        if (resizeIconUrl) {
            widget.style.setProperty('--mc-notes-resize-icon-url', `url("${resizeIconUrl}")`);
        }
        if (broomIconUrl) {
            widget.style.setProperty('--mc-notes-broom-icon-url', `url("${broomIconUrl}")`);
        }

        function isClickOutsideNotesPanel(target) {
            if (!(target instanceof Node)) return false;
            return !widget.contains(target);
        }

        document.addEventListener('click', (event) => {
            if (!isClickOutsideNotesPanel(event.target)) return;
        }, true);

        const controlIsland = widget.querySelector('.mc-notes-control-island');
        const panelEl = widget.querySelector('.mc-notes-panel');

        function clearHoverCloseTimer() {
            if (hoverCloseTimer !== null) {
                window.clearTimeout(hoverCloseTimer);
                hoverCloseTimer = null;
            }
            widget.classList.remove('mc-notes-widget-leave-grace');
            document.removeEventListener('pointermove', onHoverGracePointerMove);
        }

        function getLeaveGraceBounds() {
            if (!panelEl) return null;
            const panelRect = panelEl.getBoundingClientRect();
            const islandRect = controlIsland ? controlIsland.getBoundingClientRect() : panelRect;
            return {
                left: Math.min(panelRect.left, islandRect.left) - hoverCloseZonePx,
                top: Math.min(panelRect.top, islandRect.top) - hoverCloseZonePx,
                right: Math.max(panelRect.right, islandRect.right) + hoverCloseZonePx,
                bottom: Math.max(panelRect.bottom, islandRect.bottom) + hoverCloseZonePx
            };
        }

        function isPointWithinLeaveGraceBounds(clientX, clientY) {
            const bounds = getLeaveGraceBounds();
            if (!bounds) return false;
            return clientX >= bounds.left && clientX <= bounds.right && clientY >= bounds.top && clientY <= bounds.bottom;
        }

        function onHoverGracePointerMove(event) {
            if (isFixedMode || isPanelLocked) {
                clearHoverCloseTimer();
                return;
            }
            if (isPointWithinLeaveGraceBounds(event.clientX, event.clientY)) {
                return;
            }
            clearHoverCloseTimer();
        }

        function startHoverCloseTimer() {
            if (isFixedMode || isPanelLocked) return;
            clearHoverCloseTimer();
            widget.classList.add('mc-notes-widget-leave-grace');
            document.addEventListener('pointermove', onHoverGracePointerMove);
            hoverCloseTimer = window.setTimeout(() => {
                hoverCloseTimer = null;
                widget.classList.remove('mc-notes-widget-leave-grace');
                document.removeEventListener('pointermove', onHoverGracePointerMove);
            }, hoverCloseDelayMs);
        }

        widget.addEventListener('pointerenter', clearHoverCloseTimer);
        widget.addEventListener('pointerleave', startHoverCloseTimer);
        widget.addEventListener('focusin', clearHoverCloseTimer);
        widget.addEventListener('focusout', () => {
            window.setTimeout(() => {
                if (!widget.matches(':hover') && !widget.matches(':focus-within')) {
                    startHoverCloseTimer();
                }
            }, 0);
        });

        const addShell = widget.querySelector('.mc-notes-add-shell');
        const addSectionBtn = widget.querySelector('.mc-notes-add-section');
        const modeToggleBtn = widget.querySelector('.mc-notes-mode-toggle');
        const modeToggleIcon = widget.querySelector('.mc-notes-mode-icon');
        const lockToggleBtn = widget.querySelector('.mc-notes-lock-toggle');
        const todoList = widget.querySelector('.mc-notes-todo-list');
        const starredList = widget.querySelector('.mc-notes-starred-list');
        const textarea = widget.querySelector('.mc-notes-textarea');
        
        const tabButtons = Array.from(widget.querySelectorAll('.mc-notes-tab'));
        const views = Array.from(widget.querySelectorAll('.mc-notes-view'));
        const resizeHandle = widget.querySelector('.mc-notes-resize-handle');
        let currentTab = 'starred';
        let isFixedMode = false;
        let isPanelLocked = false;

        // Class Tasks feature removed.

        // Class Tasks feature removed; no host observer required.

        // Class Tasks fallback removed.

        function applyPanelLockState(locked) {
            isPanelLocked = !!locked && !isFixedMode;
            widget.classList.toggle('mc-notes-widget-locked', isPanelLocked);

            if (lockToggleBtn) {
                lockToggleBtn.classList.toggle('mc-notes-lock-active', isPanelLocked);
                lockToggleBtn.setAttribute('aria-pressed', isPanelLocked ? 'true' : 'false');
                lockToggleBtn.setAttribute('title', isPanelLocked ? 'Unlock panel' : 'Keep panel open');
                lockToggleBtn.setAttribute('aria-label', isPanelLocked ? 'Unlock panel' : 'Lock panel open');
            }
        }

        function getStarItemKey(item) {
            const explicit = String(item?.itemId || '').trim();
            if (explicit) return explicit;
            const streamId = String(item?.streamItemId || '').trim();
            if (streamId) return streamId;
            const courseWorkId = String(item?.courseWorkId || '').trim();
            if (courseWorkId) return `cw:${courseWorkId}`;
            return '';
        }

        function getDisplayTitle(rawTitle) {
            const text = String(rawTitle || '').trim().replace(/^['"]+|['"]+$/g, '');
            if (!text) return 'Classroom item';
            const m = text.match(/^(assignment|material)\s*:\s*(.*)$/i);
            if (m) {
                const stripped = String(m[2] || '').trim().replace(/^['"]+|['"]+$/g, '');
                return stripped || 'Classroom item';
            }
            return text;
        }

        function normalizeTitleForFingerprint(title) {
            return String(title || '')
                .toLowerCase()
                .replace(/\s+/g, ' ')
                .trim();
        }

        function buildFingerprint(classPath, itemType, title) {
            const normalizedTitle = normalizeTitleForFingerprint(title);
            if (!normalizedTitle) return '';
            return `fp:${String(classPath || '').trim()}|${String(itemType || '').trim()}|${normalizedTitle}`;
        }

        function getCanonicalKeyFromUrl(urlLike) {
            try {
                const parsed = new URL(urlLike, window.location.origin);
                const keyMatch = parsed.pathname.match(/\/(a|m)\/([^/]+)/i);
                if (!keyMatch) return '';
                return `${String(keyMatch[1]).toLowerCase()}:${String(keyMatch[2]).trim()}`;
            } catch (_) {
                return '';
            }
        }

        function getAliases(item) {
            const aliases = new Set();
            const explicit = String(item?.itemId || '').trim();
            if (explicit) aliases.add(explicit);
            const fromUrl = getCanonicalKeyFromUrl(item?.url || '');
            if (fromUrl) aliases.add(fromUrl);
            const cwId = String(item?.courseWorkId || '').trim();
            if (cwId) aliases.add(`a:${cwId}`);
            const streamId = String(item?.streamItemId || '').trim();
            if (streamId) aliases.add(`m:${streamId}`);
            const fp = buildFingerprint(item?.classPath, item?.itemType, item?.title || item?.rawTitle);
            if (fp) aliases.add(fp);
            return aliases;
        }

        function aliasesOverlap(leftAliases, rightAliases) {
            for (const value of leftAliases) {
                if (rightAliases.has(value)) return true;
            }
            return false;
        }

        function getClassroomClassPath() {
            const match = window.location.pathname.match(/^(.*?\/c\/[^/]+)/);
            return match ? match[1] : window.location.pathname;
        }

        function getClassPathFromUrl(urlLike) {
            try {
                const parsed = new URL(urlLike, window.location.origin);
                const match = parsed.pathname.match(/^(.*?\/c\/[^/]+)/);
                return match ? match[1] : '';
            } catch (_) {
                return '';
            }
        }

        function buildMaterialDetailsUrl(streamItemId, classPath = getClassroomClassPath()) {
            return `${window.location.origin}${classPath}/m/${encodeURIComponent(streamItemId)}/details`;
        }

        function buildAssignmentDetailsUrl(courseWorkId, classPath = getClassroomClassPath()) {
            return `${window.location.origin}${classPath}/a/${encodeURIComponent(courseWorkId)}/details`;
        }

        function getDefaultStarUrl(streamItemId) {
            return `${window.location.origin}${getClassroomClassPath()}/m/${encodeURIComponent(streamItemId)}/details`;
        }

        function getStreamOpenIntentUrl(streamItemId, classPath = getClassroomClassPath()) {
            const url = new URL(`${window.location.origin}${classPath}`);
            url.searchParams.set('mcOpenStar', streamItemId);
            return url.toString();
        }

        function normalizeStarredUrl(url, streamItemId) {
            try {
                const parsed = new URL(url, window.location.origin);
                const legacyStreamItemId = parsed.searchParams.get('mcStreamItem');
                if (legacyStreamItemId || parsed.searchParams.has('mcStreamItem')) {
                    return getDefaultStarUrl(streamItemId || legacyStreamItemId || '');
                }
                return parsed.toString();
            } catch (_) {
                return getDefaultStarUrl(streamItemId);
            }
        }

        function normalizeStarredAssignments(raw) {
            if (!Array.isArray(raw)) return [];
            const deduped = [];
            return raw
                .map((item) => {
                    if (!item || typeof item !== 'object') return null;
                    const streamItemId = String(item.streamItemId || '').trim();
                    const itemId = String(item.itemId || '').trim() || streamItemId;
                    const courseWorkId = String(item.courseWorkId || '').trim();
                    const rawTitle = String(item.rawTitle || item.title || '').trim().slice(0, 240);
                    const title = getDisplayTitle(item.title || rawTitle).slice(0, 220);
                    const inferredItemType = /^m:/i.test(itemId)
                        ? 'material'
                        : /^a:/i.test(itemId)
                            ? 'assignment'
                            : '';
                    const itemType = String(item.itemType || inferredItemType).trim().toLowerCase();
                    const url = String(item.url || '').trim();
                    const note = String(item.note || '').slice(0, 160);
                    if (!itemId || !title) return null;
                    const classPathFromUrl = getClassPathFromUrl(url);
                    const normalized = {
                        itemId,
                        streamItemId,
                        courseWorkId,
                        title,
                        rawTitle,
                        itemType,
                        note,
                        classPath: String(item.classPath || '').trim() || classPathFromUrl || getClassroomClassPath(),
                        url: normalizeStarredUrl(url || '', streamItemId),
                        savedAt: Number(item.savedAt) || Date.now()
                    };

                    return normalized;
                })
                .filter(Boolean)
                .filter((item) => {
                    const aliases = getAliases(item);
                    if (!aliases.size) return false;
                    const found = deduped.some((existing) => aliasesOverlap(aliases, getAliases(existing)));
                    if (found) return false;
                    deduped.push(item);
                    return true;
                })
                .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
        }

        function clampPanelSize(size, options = {}) {
            const fixedMode = !!options.fixedMode;
            const minWidth = 380;
            const minHeight = 280;
            const margin = 16;
            const islandWidth = 44;
            const maxWidth = Math.max(minWidth, window.innerWidth - (margin * 2) - 50);
            const maxHeight = Math.max(minHeight, window.innerHeight - (margin * 2));
            return {
                width: Math.max(minWidth, Math.min(maxWidth, Number(size?.width) || defaultPanelSize.width)),
                height: fixedMode
                    ? maxHeight
                    : Math.max(minHeight, Math.min(maxHeight, Number(size?.height) || defaultPanelSize.height))
            };
        }

        function getTodoColumnCount(width) {
            if (width >= 1080) return 4;
            if (width >= 820) return 3;
            if (width >= 560) return 2;
            return 1;
        }

        function updateTodoColumns(width) {
            const columns = getTodoColumnCount(width);
            widget.style.setProperty('--mc-notes-todo-columns', String(columns));
        }

        function setPanelSize(size, options = {}) {
            const fixedMode = options.fixedMode === true;
            const clamped = clampPanelSize(size, { fixedMode });
            widget.style.setProperty('--mc-notes-expanded-width', `${clamped.width}px`);
            widget.style.setProperty('--mc-notes-expanded-height', `${clamped.height}px`);
            widget.style.setProperty('--mc-notes-fixed-width', `${clamped.width}px`);
            document.documentElement.style.setProperty('--mc-notes-fixed-width', `${clamped.width}px`);
            updateTodoColumns(clamped.width);
            window.dispatchEvent(new CustomEvent('mc-notes-panel-resized', {
                detail: { width: clamped.width, height: clamped.height, fixedMode }
            }));
            return clamped;
        }

        function savePanelSize(size) {
            try {
                localStorage.setItem(PANEL_SIZE_KEY, JSON.stringify(size));
            } catch (_) {}
        }

        function loadPanelSize() {
            try {
                const raw = localStorage.getItem(PANEL_SIZE_KEY);
                if (!raw) return defaultPanelSize;
                return clampPanelSize(JSON.parse(raw), { fixedMode: false });
            } catch (_) {
                return defaultPanelSize;
            }
        }

        function saveFixedPanelWidth(width) {
            try {
                localStorage.setItem(PANEL_FIXED_WIDTH_KEY, String(width));
            } catch (_) {}
        }

        function loadFixedPanelWidth() {
            try {
                const raw = localStorage.getItem(PANEL_FIXED_WIDTH_KEY);
                const parsed = Number(raw);
                if (!Number.isFinite(parsed)) return defaultFixedPanelWidth;
                return clampPanelSize({ width: parsed, height: window.innerHeight }, { fixedMode: true }).width;
            } catch (_) {
                return defaultFixedPanelWidth;
            }
        }

        function savePanelMode(fixedMode) {
            try {
                localStorage.setItem(PANEL_MODE_KEY, fixedMode ? 'fixed' : 'float');
            } catch (_) {}
        }

        function loadPanelMode() {
            try {
                return localStorage.getItem(PANEL_MODE_KEY) === 'fixed';
            } catch (_) {
                return false;
            }
        }

        function applyPanelMode(fixedMode) {
            isFixedMode = !!fixedMode;
            widget.classList.toggle('mc-notes-widget-fixed', isFixedMode);
            document.body.classList.toggle('mc-notes-fixed-active', isFixedMode);
            clearHoverCloseTimer();

            if (lockToggleBtn) {
                lockToggleBtn.style.display = isFixedMode ? 'none' : 'flex';
            }
            if (isFixedMode && isPanelLocked) {
                applyPanelLockState(false);
            }

            if (modeToggleIcon) {
                modeToggleIcon.src = isFixedMode ? floatNotesIconUrl : fixedNotesIconUrl;
            }
            if (modeToggleBtn) {
                const label = isFixedMode ? 'Float notes' : 'Dock notes';
                const title = isFixedMode ? 'Switch to floating notes' : 'Dock notes to the right side';
                modeToggleBtn.setAttribute('aria-label', label);
                modeToggleBtn.setAttribute('title', title);
            }

            if (isFixedMode) {
                const fixedWidth = loadFixedPanelWidth();
                setPanelSize({ width: fixedWidth, height: window.innerHeight }, { fixedMode: true });
            } else {
                setPanelSize(loadPanelSize(), { fixedMode: false });
            }
        }

        function initializePanelResizing() {
            let resizeState = null;

            function onPointerMove(event) {
                if (!resizeState) return;
                event.preventDefault();
                if (isFixedMode) {
                    const deltaX = resizeState.initialCursorX - event.clientX;
                    const width = resizeState.initialWidth + deltaX;
                    const nextSize = setPanelSize({ width, height: window.innerHeight }, { fixedMode: true });
                    resizeState.lastSize = nextSize;
                    return;
                }
                const deltaX = resizeState.initialCursorX - event.clientX;
                const deltaY = resizeState.initialCursorY - event.clientY;
                const width = resizeState.initialWidth + deltaX;
                const height = resizeState.initialHeight + deltaY;
                const nextSize = setPanelSize({ width, height }, { fixedMode: false });
                resizeState.lastSize = nextSize;
            }

            function stopResizing() {
                if (!resizeState) return;
                if (isFixedMode) {
                    const width = resizeState.lastSize?.width
                        || parseFloat(getComputedStyle(widget).getPropertyValue('--mc-notes-fixed-width'))
                        || defaultFixedPanelWidth;
                    saveFixedPanelWidth(width);
                } else {
                    const finalSize = resizeState.lastSize || loadPanelSize();
                    savePanelSize(finalSize);
                }
                if (resizeState.pointerId !== null) {
                    try {
                        resizeHandle.releasePointerCapture(resizeState.pointerId);
                    } catch (_) {}
                }
                widget.classList.remove('mc-notes-widget-resizing');
                resizeState = null;
                document.removeEventListener('pointermove', onPointerMove);
                document.removeEventListener('pointerup', stopResizing);
                document.removeEventListener('pointercancel', stopResizing);
            }

            resizeHandle.addEventListener('pointerdown', (event) => {
                event.preventDefault();
                event.stopPropagation();
                widget.classList.add('mc-notes-widget-resizing');
                const currentWidth = parseFloat(getComputedStyle(widget).getPropertyValue('--mc-notes-expanded-width')) || defaultPanelSize.width;
                const currentHeight = parseFloat(getComputedStyle(widget).getPropertyValue('--mc-notes-expanded-height')) || defaultPanelSize.height;
                resizeState = {
                    initialCursorX: event.clientX,
                    initialCursorY: event.clientY,
                    initialWidth: currentWidth,
                    initialHeight: currentHeight,
                    pointerId: typeof event.pointerId === 'number' ? event.pointerId : null,
                    lastSize: null
                };

                if (resizeState.pointerId !== null) {
                    try {
                        resizeHandle.setPointerCapture(resizeState.pointerId);
                    } catch (_) {}
                }

                document.addEventListener('pointermove', onPointerMove);
                document.addEventListener('pointerup', stopResizing);
                document.addEventListener('pointercancel', stopResizing);
            });

            window.addEventListener('resize', () => {
                if (isFixedMode) {
                    const currentWidth = parseFloat(getComputedStyle(widget).getPropertyValue('--mc-notes-fixed-width')) || loadFixedPanelWidth();
                    const clamped = setPanelSize({ width: currentWidth, height: window.innerHeight }, { fixedMode: true });
                    saveFixedPanelWidth(clamped.width);
                    return;
                }
                const current = {
                    width: parseFloat(getComputedStyle(widget).getPropertyValue('--mc-notes-expanded-width')),
                    height: parseFloat(getComputedStyle(widget).getPropertyValue('--mc-notes-expanded-height'))
                };
                const clamped = setPanelSize(current, { fixedMode: false });
                savePanelSize(clamped);
            });
        }

        const initialPanelSize = loadPanelSize();
        setPanelSize(initialPanelSize, { fixedMode: false });
        applyPanelMode(loadPanelMode());
        initializePanelResizing();

        function normalizeState(raw) {
            const todos = Array.isArray(raw?.todos)
                ? raw.todos
                    .filter(item => item && typeof item.text === 'string')
                    .map(item => ({
                        id: String(item.id || Date.now() + Math.random()),
                        text: item.text.trim().slice(0, 120),
                        subtasks: Array.isArray(item.subtasks)
                            ? item.subtasks
                                .map(task => {
                                    if (typeof task === 'string') {
                                        const textValue = task.trim().slice(0, 120);
                                        return textValue ? { text: textValue, done: false } : null;
                                    }
                                    if (task && typeof task.text === 'string') {
                                        const textValue = task.text.trim().slice(0, 120);
                                        return textValue ? { text: textValue, done: !!task.done } : null;
                                    }
                                    return null;
                                })
                                .filter(Boolean)
                            : Array.isArray(item.subtopics)
                                ? item.subtopics
                                    .map(topic => {
                                        if (typeof topic === 'string') {
                                            const textValue = topic.trim().slice(0, 120);
                                            return textValue ? { text: textValue, done: false } : null;
                                        }
                                        if (topic && typeof topic.text === 'string') {
                                            const textValue = topic.text.trim().slice(0, 120);
                                            return textValue ? { text: textValue, done: !!topic.done } : null;
                                        }
                                        return null;
                                    })
                                    .filter(Boolean)
                            : []
                    }))
                    .filter(item => item.text)
                : [];
            const text = typeof raw?.text === 'string' ? raw.text : '';
            // Starred assignments are local-only and should not be read from notes payloads.
            const starredAssignments = [];
            return { todos, text, starredAssignments };
        }

        function loadStarredAssignmentsFromStorage() {
            try {
                const raw = localStorage.getItem(STARRED_ASSIGNMENTS_KEY);
                if (!raw) return [];
                return normalizeStarredAssignments(JSON.parse(raw));
            } catch (_) {
                return [];
            }
        }

        function saveStarredAssignmentsToStorage(items) {
            try {
                localStorage.setItem(STARRED_ASSIGNMENTS_KEY, JSON.stringify(items));
            } catch (_) {}
        }

        function broadcastStarredAssignments() {
            window.dispatchEvent(new CustomEvent('mc:starred-assignments-updated', {
                detail: { items: state.starredAssignments }
            }));
        }

        function setStarredAssignments(nextItems, options = {}) {
            const { persist = true, broadcast = true } = options;
            state.starredAssignments = normalizeStarredAssignments(nextItems);
            if (persist) {
                saveStarredAssignmentsToStorage(state.starredAssignments);
            }
            if (currentTab === 'starred') {
                renderStarredAssignments();
            }
            if (broadcast) {
                broadcastStarredAssignments();
            }
        }

        function getPersistableNotesState() {
            return {
                todos: Array.isArray(state.todos) ? state.todos : [],
                text: typeof state.text === 'string' ? state.text : ''
            };
        }

        function saveState() {
            const persistableState = getPersistableNotesState();

            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(persistableState));
            } catch (_) {}

            try {
                localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(persistableState));
            } catch (_) {}

            try {
                if (typeof storageSet === 'function') {
                    storageSet(STORAGE_KEY, persistableState);
                }
            } catch (_) {}

            try {
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.set({ [LEGACY_STORAGE_KEY]: persistableState });
                }
            } catch (_) {}
        }

        function playTaskConfetti(taskItem, anchorEl) {
            if (!taskItem || !anchorEl) return;

            const itemRect = taskItem.getBoundingClientRect();
            const anchorRect = anchorEl.getBoundingClientRect();
            const centerX = (anchorRect.left - itemRect.left) + (anchorRect.width / 2);
            const centerY = (anchorRect.top - itemRect.top) + (anchorRect.height / 2);

            const burst = document.createElement('div');
            burst.className = 'mc-notes-task-confetti-burst';
            burst.style.left = `${centerX}px`;
            burst.style.top = `${centerY}px`;

            const colors = ['#4b75dd', '#ffb84d', '#6bcf7f', '#ff6b8a', '#8f7cff'];
            const pieces = 6;

            for (let index = 0; index < pieces; index += 1) {
                const piece = document.createElement('span');
                piece.className = 'mc-notes-task-confetti-piece';

                const angle = (Math.PI * 2 * index) / pieces + (Math.random() * 0.35 - 0.175);
                const distance = 12 + Math.random() * 10;
                const dx = Math.cos(angle) * distance;
                const dy = Math.sin(angle) * distance;
                const rot = (Math.random() * 180 + 90) * (Math.random() > 0.5 ? 1 : -1);

                piece.style.setProperty('--dx', `${dx.toFixed(1)}px`);
                piece.style.setProperty('--dy', `${dy.toFixed(1)}px`);
                piece.style.setProperty('--rot', `${rot.toFixed(1)}deg`);
                piece.style.setProperty('--piece-color', colors[Math.floor(Math.random() * colors.length)]);
                piece.style.left = `${(Math.random() * 6 - 3).toFixed(1)}px`;
                piece.style.top = `${(Math.random() * 6 - 3).toFixed(1)}px`;

                burst.appendChild(piece);
            }

            taskItem.appendChild(burst);
            window.setTimeout(() => {
                burst.remove();
            }, 520);
        }

        function renderTodos() {
            todoList.innerHTML = '';

            if (addingNewSection) {
                const draft = document.createElement('li');
                draft.className = 'mc-notes-todo-item mc-notes-todo-item-draft';

                const draftHeader = document.createElement('div');
                draftHeader.className = 'mc-notes-section-header';

                const draftTitleContainer = document.createElement('div');
                draftTitleContainer.className = 'mc-notes-section-title-container';

                const draftInput = document.createElement('input');
                draftInput.type = 'text';
                draftInput.className = 'mc-notes-section-title-input mc-notes-draft-input';
                draftInput.maxLength = 120;
                draftInput.placeholder = 'New Section...';

                const draftActions = document.createElement('div');
                draftActions.className = 'mc-notes-add-actions';

                const draftSave = document.createElement('button');
                draftSave.type = 'button';
                draftSave.className = 'mc-notes-add-save';
                draftSave.setAttribute('aria-label', 'Save section');
                draftSave.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                draftSave.disabled = true;
                draftSave.setAttribute('aria-disabled', 'true');

                const draftCancel = document.createElement('button');
                draftCancel.type = 'button';
                draftCancel.className = 'mc-notes-add-cancel';
                draftCancel.setAttribute('aria-label', 'Cancel');
                draftCancel.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

                draftTitleContainer.appendChild(draftInput);
                draftActions.appendChild(draftSave);
                draftActions.appendChild(draftCancel);
                draftHeader.appendChild(draftTitleContainer);
                draftHeader.appendChild(draftActions);
                draft.appendChild(draftHeader);
                todoList.appendChild(draft);

                const updateDraftSaveState = () => {
                    const hasValue = !!String(draftInput.value || '').trim();
                    draftSave.disabled = !hasValue;
                    draftSave.setAttribute('aria-disabled', hasValue ? 'false' : 'true');
                };

                const commitDraft = () => saveNewSection(draftInput.value || '');
                draftSave.addEventListener('click', commitDraft);
                draftCancel.addEventListener('click', cancelNewSection);
                draftInput.addEventListener('input', updateDraftSaveState);
                draftInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        if (!draftSave.disabled) {
                            commitDraft();
                        }
                    }
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        cancelNewSection();
                    }
                });
                updateDraftSaveState();
            }

            if (!state.todos.length) {
                if (!addingNewSection) {
                    const empty = document.createElement('li');
                    empty.className = 'mc-notes-empty';
                    empty.textContent = 'Click + to add a new item...';
                    todoList.appendChild(empty);
                }
                return;
            }

            state.todos.forEach((item, itemIndex) => {
                const li = document.createElement('li');
                li.className = 'mc-notes-todo-item';
                li.draggable = false;
                li.dataset.id = item.id;

                li.addEventListener('dragover', (e) => {
                    if (!draggedItem) return;
                    e.preventDefault();
                    if (e.dataTransfer) {
                        e.dataTransfer.dropEffect = 'move';
                    }
                    const dragging = todoList.querySelector('.mc-notes-todo-item.mc-notes-section-dragging');
                    if (dragging && dragging !== li) {
                        const rect = li.getBoundingClientRect();
                        const midpoint = rect.top + rect.height / 2;
                        if (e.clientY < midpoint) {
                            li.parentNode.insertBefore(dragging, li);
                        } else {
                            li.parentNode.insertBefore(dragging, li.nextSibling);
                        }
                    }
                });

                li.addEventListener('drop', (e) => {
                    if (!draggedItem) return;
                    e.preventDefault();
                    const newOrder = Array.from(todoList.querySelectorAll('.mc-notes-todo-item'))
                        .map(el => el.dataset.id)
                        .filter(Boolean);
                    const reordered = [];
                    newOrder.forEach(id => {
                        const found = state.todos.find(t => t.id === id);
                        if (found) reordered.push(found);
                    });
                    state.todos = reordered;
                    saveState();
                });

                const header = document.createElement('div');
                header.className = 'mc-notes-section-header';

                const dragHandle = document.createElement('div');
                dragHandle.className = 'mc-notes-drag-handle';
                dragHandle.innerHTML = '⋮⋮';
                dragHandle.setAttribute('aria-label', 'Drag to reorder');
                dragHandle.setAttribute('title', 'Drag section');
                dragHandle.draggable = true;
                dragHandle.addEventListener('dragstart', (e) => {
                    draggedItem = item.id;
                    li.classList.add('mc-notes-section-dragging');
                    if (e.dataTransfer) {
                        e.dataTransfer.effectAllowed = 'move';
                    }
                });
                dragHandle.addEventListener('dragend', () => {
                    li.classList.remove('mc-notes-section-dragging');
                    draggedItem = null;
                });

                const titleContainer = document.createElement('div');
                titleContainer.className = 'mc-notes-section-title-container';

                if (editingId === item.id && editingTaskIndex === null) {
                    const titleInput = document.createElement('input');
                    titleInput.type = 'text';
                    titleInput.className = 'mc-notes-section-title-input';
                    titleInput.value = item.text;
                    titleInput.maxLength = 120;

                    const saveTitle = () => {
                        const value = (titleInput.value || '').trim();
                        if (value) {
                            item.text = value.slice(0, 120);
                            saveState();
                        }
                        editingId = null;
                        renderTodos();
                    };

                    titleInput.addEventListener('blur', saveTitle);
                    titleInput.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            saveTitle();
                        }
                        if (e.key === 'Escape') {
                            editingId = null;
                            renderTodos();
                        }
                    });

                    titleContainer.appendChild(titleInput);
                    requestAnimationFrame(() => {
                        try {
                            titleInput.focus();
                            titleInput.select();
                        } catch (_) {}
                    });
                } else {
                    const title = document.createElement('h3');
                    title.className = 'mc-notes-section-title';
                    title.textContent = item.text;
                    title.addEventListener('click', () => {
                        editingId = item.id;
                        editingTaskIndex = null;
                        renderTodos();
                    });
                    titleContainer.appendChild(title);
                }

                const delBtn = document.createElement('button');
                delBtn.type = 'button';
                delBtn.className = 'mc-notes-section-delete';
                delBtn.setAttribute('aria-label', `Delete section ${item.text}`);
                delBtn.textContent = '×';
                delBtn.addEventListener('click', () => {
                    state.todos = state.todos.filter(t => t.id !== item.id);
                    saveState();
                    renderTodos();
                });

                header.appendChild(dragHandle);
                header.appendChild(titleContainer);
                header.appendChild(delBtn);
                li.appendChild(header);

                const taskList = document.createElement('ul');
                taskList.className = 'mc-notes-task-list';

                if (Array.isArray(item.subtasks)) {
                    item.subtasks.forEach((task, taskIndex) => {
                        const taskItem = document.createElement('li');
                        taskItem.className = `mc-notes-task-item${task.done ? ' done' : ''}`;
                        taskItem.draggable = false;
                        taskItem.dataset.taskIndex = String(taskIndex);

                        taskItem.addEventListener('dragover', (e) => {
                            if (!draggedTask || draggedTask.sectionId !== item.id) return;
                            e.preventDefault();
                            if (e.dataTransfer) {
                                e.dataTransfer.dropEffect = 'move';
                            }
                            const dragging = taskList.querySelector('.mc-notes-task-item.mc-notes-task-dragging');
                            if (dragging && dragging !== taskItem) {
                                const rect = taskItem.getBoundingClientRect();
                                const midpoint = rect.top + rect.height / 2;
                                if (e.clientY < midpoint) {
                                    taskItem.parentNode.insertBefore(dragging, taskItem);
                                } else {
                                    taskItem.parentNode.insertBefore(dragging, taskItem.nextSibling);
                                }
                            }
                        });

                        taskItem.addEventListener('drop', (e) => {
                            if (!draggedTask || draggedTask.sectionId !== item.id) return;
                            e.preventDefault();
                            if (!Array.isArray(item.subtasks)) return;

                            const previousSubtasks = item.subtasks.slice();
                            const newOrderIndexes = Array.from(taskList.querySelectorAll('.mc-notes-task-item'))
                                .map(el => Number(el.dataset.taskIndex))
                                .filter(idx => Number.isInteger(idx) && previousSubtasks[idx]);

                            if (!newOrderIndexes.length) return;

                            item.subtasks = newOrderIndexes.map(idx => previousSubtasks[idx]);
                            saveState();
                            renderTodos();
                        });

                        const taskLeft = document.createElement('div');
                        taskLeft.className = 'mc-notes-task-left';

                        const taskDragHandle = document.createElement('div');
                        taskDragHandle.className = 'mc-notes-task-drag-handle';
                        taskDragHandle.innerHTML = '⋮⋮';
                        taskDragHandle.setAttribute('aria-label', 'Drag task to reorder');
                        taskDragHandle.setAttribute('title', 'Drag task');
                        taskDragHandle.draggable = true;
                        taskDragHandle.addEventListener('dragstart', (e) => {
                            draggedTask = { sectionId: item.id, index: taskIndex };
                            taskItem.classList.add('mc-notes-task-dragging');
                            if (e.dataTransfer) {
                                e.dataTransfer.effectAllowed = 'move';
                            }
                        });
                        taskDragHandle.addEventListener('dragend', () => {
                            taskItem.classList.remove('mc-notes-task-dragging');
                            draggedTask = null;
                        });

                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.checked = !!task.done;
                        checkbox.addEventListener('change', () => {
                            if (!Array.isArray(item.subtasks) || !item.subtasks[taskIndex]) return;
                            item.subtasks[taskIndex].done = checkbox.checked;
                            saveState();
                            renderTodos();
                            if (checkbox.checked) {
                                requestAnimationFrame(() => {
                                    const refreshedTaskItem = Array.from(todoList.querySelectorAll('.mc-notes-todo-item'))
                                        .find(el => el.dataset.id === item.id)?.querySelectorAll('.mc-notes-task-item')?.[taskIndex];
                                    const refreshedCheckbox = refreshedTaskItem?.querySelector('input[type="checkbox"]');
                                    if (refreshedTaskItem && refreshedCheckbox) {
                                        playTaskConfetti(refreshedTaskItem, refreshedCheckbox);
                                    }
                                });
                            }
                        });

                        taskLeft.appendChild(taskDragHandle);
                        taskLeft.appendChild(checkbox);

                        if (editingId === item.id && editingTaskIndex === taskIndex) {
                            const taskInput = document.createElement('input');
                            taskInput.type = 'text';
                            taskInput.className = 'mc-notes-task-text-input';
                            taskInput.value = task.text;
                            taskInput.maxLength = 120;

                            const saveTask = () => {
                                const value = (taskInput.value || '').trim();
                                if (value && Array.isArray(item.subtasks) && item.subtasks[taskIndex]) {
                                    item.subtasks[taskIndex].text = value.slice(0, 120);
                                    saveState();
                                }
                                editingId = null;
                                editingTaskIndex = null;
                                renderTodos();
                            };

                            taskInput.addEventListener('blur', saveTask);
                            taskInput.addEventListener('keydown', (e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    saveTask();
                                }
                                if (e.key === 'Escape') {
                                    editingId = null;
                                    editingTaskIndex = null;
                                    renderTodos();
                                }
                            });

                            taskLeft.appendChild(taskInput);
                            requestAnimationFrame(() => {
                                try {
                                    taskInput.focus();
                                    taskInput.select();
                                } catch (_) {}
                            });
                        } else {
                            const taskText = document.createElement('span');
                            taskText.className = 'mc-notes-task-text';
                            taskText.textContent = task.text;
                            taskText.addEventListener('click', () => {
                                editingId = item.id;
                                editingTaskIndex = taskIndex;
                                renderTodos();
                            });
                            taskLeft.appendChild(taskText);
                        }

                        const taskDelete = document.createElement('button');
                        taskDelete.type = 'button';
                        taskDelete.className = 'mc-notes-task-delete';
                        taskDelete.setAttribute('aria-label', `Delete task ${task.text}`);
                        taskDelete.textContent = '×';
                        taskDelete.addEventListener('click', () => {
                            if (!Array.isArray(item.subtasks)) return;
                            item.subtasks = item.subtasks.filter((_, idx) => idx !== taskIndex);
                            saveState();
                            renderTodos();
                        });

                        taskItem.appendChild(taskLeft);
                        taskItem.appendChild(taskDelete);
                        taskList.appendChild(taskItem);
                    });
                }

                const taskEditor = document.createElement('div');
                taskEditor.className = 'mc-notes-task-editor';

                const taskInput = document.createElement('input');
                taskInput.className = 'mc-notes-task-input';
                taskInput.type = 'text';
                taskInput.maxLength = 120;
                taskInput.placeholder = 'Add a task';

                const taskSave = document.createElement('button');
                taskSave.type = 'button';
                taskSave.className = 'mc-notes-task-save';
                taskSave.textContent = 'Add';

                const commitTask = () => {
                    const value = (taskInput.value || '').trim();
                    if (!value) return;
                    if (!Array.isArray(item.subtasks)) item.subtasks = [];
                    item.subtasks.push({ text: value.slice(0, 120), done: false });
                    taskInput.value = '';
                    saveState();
                    renderTodos();
                };

                taskSave.addEventListener('click', commitTask);
                taskInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        commitTask();
                    }
                });

                taskEditor.appendChild(taskInput);
                taskEditor.appendChild(taskSave);

                li.appendChild(taskList);
                li.appendChild(taskEditor);
                todoList.appendChild(li);
            });
        }

        function renderStarredAssignments() {
            if (!starredList) return;
            starredList.innerHTML = '';

            if (!Array.isArray(state.starredAssignments) || !state.starredAssignments.length) {
                const empty = document.createElement('li');
                empty.className = 'mc-notes-empty';
                empty.textContent = 'Click the ★ on an assignment to save it here...';
                starredList.appendChild(empty);
                return;
            }

            state.starredAssignments.forEach((item) => {
                const row = document.createElement('li');
                row.className = 'mc-notes-starred-item';

                const openBtn = document.createElement('button');
                openBtn.type = 'button';
                openBtn.className = 'mc-notes-starred-open';
                openBtn.title = item.title;
                openBtn.textContent = item.title;
                openBtn.addEventListener('click', () => {
                    const streamItemId = String(item.streamItemId || '').trim();
                    const courseWorkId = String(item.courseWorkId || '').trim();
                    const classPath = String(item.classPath || '').trim()
                        || getClassPathFromUrl(item.url || '')
                        || getClassroomClassPath();

                    const itemId = String(item.itemId || '').trim();
                    const canonicalFromSavedUrl = getCanonicalKeyFromUrl(item.url || '');
                    let targetUrl = '';

                    try {
                        const parsedSavedUrl = new URL(String(item.url || ''), window.location.origin);
                        targetUrl = parsedSavedUrl.toString();
                    } catch (_) {
                        targetUrl = '';
                    }

                    if (!targetUrl && /^a:/i.test(itemId)) {
                        targetUrl = buildAssignmentDetailsUrl(itemId.split(':')[1] || '', classPath);
                    } else if (!targetUrl && courseWorkId) {
                        targetUrl = buildAssignmentDetailsUrl(courseWorkId, classPath);
                    } else if (!targetUrl && /^a:/i.test(canonicalFromSavedUrl)) {
                        targetUrl = buildAssignmentDetailsUrl(canonicalFromSavedUrl.split(':')[1] || '', classPath);
                    } else if (!targetUrl && /^m:/i.test(itemId)) {
                        targetUrl = buildMaterialDetailsUrl(itemId.split(':')[1] || '', classPath);
                    } else if (!targetUrl && /^m:/i.test(canonicalFromSavedUrl)) {
                        targetUrl = buildMaterialDetailsUrl(canonicalFromSavedUrl.split(':')[1] || '', classPath);
                    } else if (!targetUrl && streamItemId) {
                        // Stream-origin entries without coursework ids are more reliable via intent URL.
                        targetUrl = getStreamOpenIntentUrl(streamItemId, classPath);
                    }

                    if (!targetUrl) {
                        targetUrl = getStreamOpenIntentUrl(streamItemId, classPath);
                    }

                    window.location.assign(targetUrl);
                });

                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'mc-notes-starred-remove';
                removeBtn.setAttribute('aria-label', `Remove saved assignment ${item.title}`);
                removeBtn.textContent = '×';
                removeBtn.addEventListener('click', () => {
                    const itemKey = getStarItemKey(item);
                    const nextItems = state.starredAssignments.filter((entry) => getStarItemKey(entry) !== itemKey);
                    setStarredAssignments(nextItems);
                });

                const noteInput = document.createElement('input');
                noteInput.type = 'text';
                noteInput.className = 'mc-notes-starred-note';
                noteInput.placeholder = 'Note...';
                noteInput.maxLength = 160;
                noteInput.value = String(item.note || '');

                const persistNote = () => {
                    item.note = String(noteInput.value || '').slice(0, 160);
                    saveStarredAssignmentsToStorage(state.starredAssignments);
                };

                noteInput.addEventListener('input', persistNote);
                noteInput.addEventListener('blur', persistNote);

                const content = document.createElement('div');
                content.className = 'mc-notes-starred-content';
                content.appendChild(openBtn);
                content.appendChild(noteInput);

                row.appendChild(content);
                row.appendChild(removeBtn);
                starredList.appendChild(row);
            });
        }

        function renderActiveTabContent() {
            if (currentTab === 'todo') {
                renderTodos();
                return;
            }
            if (currentTab === 'starred') {
                renderStarredAssignments();
                return;
            }
            
            if (currentTab === 'notepad') {
                textarea.value = state.text;
            }
        }



        function switchTab(tabName) {
            const previousTab = currentTab;
            currentTab = tabName;
            tabButtons.forEach(btn => {
                const active = btn.dataset.tab === tabName;
                btn.classList.toggle('active', active);
                btn.setAttribute('aria-selected', active ? 'true' : 'false');
            });
            views.forEach(view => {
                view.classList.toggle('active', view.dataset.view === tabName);
            });
            const showPlus = tabName === 'todo';
            addSectionBtn.disabled = !showPlus;
            addShell.classList.toggle('mc-notes-plus-visible', showPlus);
            

            if (!showPlus) {
                addSectionBtn.classList.remove('mc-notes-plus-enter');
            } else if (previousTab !== 'todo') {
                addSectionBtn.classList.remove('mc-notes-plus-enter');
                void addSectionBtn.offsetWidth;
                addSectionBtn.classList.add('mc-notes-plus-enter');
            }

            if (tabName !== 'todo' && addingNewSection) {
                hideAddSectionMode();
            }
            renderActiveTabContent();
        }

        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.dataset.tab));
            btn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    switchTab(btn.dataset.tab);
                }
            });
        });

        switchTab(currentTab);

        function showAddSectionMode() {
            if (addingNewSection) return;
            addingNewSection = true;
            addSectionBtn.classList.add('mc-notes-add-section-dim');
            if (currentTab === 'todo') {
                renderTodos();
            }
            requestAnimationFrame(() => {
                try {
                    const draftInput = todoList.querySelector('.mc-notes-draft-input');
                    if (draftInput) {
                        draftInput.focus();
                        draftInput.select();
                    }
                } catch (_) {}
            });
        }

        function hideAddSectionMode() {
            addingNewSection = false;
            addSectionBtn.classList.remove('mc-notes-add-section-dim');
            addSectionBtn.classList.remove('mc-notes-plus-enter');
            if (currentTab === 'todo') {
                renderTodos();
            }
        }

        function saveNewSection(valueRaw = '') {
            const value = String(valueRaw || '').trim();
            if (value) {
                state.todos.unshift({ 
                    id: String(Date.now() + Math.random()), 
                    text: value.slice(0, 120), 
                    subtasks: [] 
                });
                saveState();
                if (currentTab === 'todo') {
                    renderTodos();
                }
            }
            hideAddSectionMode();
        }

        function cancelNewSection() {
            hideAddSectionMode();
        }

        addSectionBtn.addEventListener('click', () => {
            if (currentTab !== 'todo' || addingNewSection) return;
            showAddSectionMode();
        });

        addSectionBtn.addEventListener('animationend', () => {
            addSectionBtn.classList.remove('mc-notes-plus-enter');
        });

        modeToggleBtn.addEventListener('click', () => {
            const nextMode = !isFixedMode;
            applyPanelMode(nextMode);
            savePanelMode(nextMode);
        });

        

        if (lockToggleBtn) {
            lockToggleBtn.addEventListener('click', () => {
                if (isFixedMode) return;
                applyPanelLockState(!isPanelLocked);
            });
        }

        textarea.addEventListener('input', () => {
            state.text = textarea.value;
            saveState();
        });

        function applyState(nextState) {
            const normalized = normalizeState(nextState);
            state = {
                ...normalized,
                starredAssignments: Array.isArray(state.starredAssignments) ? state.starredAssignments : []
            };
            renderActiveTabContent();
        }

        let localLoaded = false;
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                applyState(JSON.parse(raw));
                localLoaded = true;
            }
        } catch (_) {}

        if (!localLoaded) {
            try {
                const rawLegacy = localStorage.getItem(LEGACY_STORAGE_KEY);
                if (rawLegacy) {
                    applyState(JSON.parse(rawLegacy));
                    localLoaded = true;
                }
            } catch (_) {}
        }

        if (!localLoaded) {
            applyState(defaultState);
        }

        const localStarredAssignments = loadStarredAssignmentsFromStorage();
        if (localStarredAssignments.length) {
            setStarredAssignments(localStarredAssignments, { persist: true, broadcast: false });
        }


        try {
            if (typeof storageGet === 'function') {
                storageGet(STORAGE_KEY, null).then((syncState) => {
                    if (syncState && typeof syncState === 'object') {
                        applyState(syncState);
                    }
                });
            }
        } catch (_) {}

        try {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.get([LEGACY_STORAGE_KEY], (res) => {
                    if (chrome.runtime && chrome.runtime.lastError) return;
                    if (res && res[LEGACY_STORAGE_KEY]) {
                        applyState(res[LEGACY_STORAGE_KEY]);
                    }
                });
            }
        } catch (_) {}

        window.addEventListener('mc:starred-assignments-updated', (event) => {
            const nextItems = Array.isArray(event?.detail?.items) ? event.detail.items : [];
            setStarredAssignments(nextItems, { persist: true, broadcast: false });
        });

        const streamItemFromUrl = new URL(window.location.href).searchParams.get('mcStreamItem');
        if (streamItemFromUrl) {
            setTimeout(() => {
                const target = document.querySelector(`[data-stream-item-id="${CSS.escape(streamItemFromUrl)}"]`);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    target.classList.add('mc-starred-highlight');
                    setTimeout(() => target.classList.remove('mc-starred-highlight'), 1800);
                }
            }, 550);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initFloatingNotesWidget();
        });
    } else {
        initFloatingNotesWidget();
    }
})();
