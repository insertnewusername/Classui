(function() {
    const ROOT_ID = 'mc-homepage-shell';
    const EDIT_WIDGET_ID = 'mc-homepage-edit-shell';
    const ACTIVE_CLASS = 'mc-homepage-redesign-enabled';
    const EDIT_HOST_SELECTOR = '#yDmH0d > c-wiz > div.T4LgNb > div > div:nth-child(9)';
    const HOME_ROUTE_RE = /^https:\/\/classroom\.google\.com(\/u\/\d+)?(\/h)?\/?$/;
    const FALLBACK_TODAY_LABEL = 'Today';
    const DEFAULT_COLOR = '#86a7ff';
    const EDIT_STATE_KEY = 'modernClassroom_homepageEditState';
    const CLASS_TASKS_STATE_KEY = 'modernClassroom_classTasksGridState';
    const CLASS_TASKS_HOST_SELECTOR = '.mc-notes-class-tasks-mount';
    const BROOM_ICON_URL = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
        ? chrome.runtime.getURL('Icons/fi-sr-broom.svg')
        : '';
    const TRASH_ICON_URL = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
        ? chrome.runtime.getURL('Icons/Trash Icon.svg')
        : '';

    let mounted = false;
    let refs = null;
    let editWidget = null;
    let editTrigger = null;
    let editPanel = null;
    let clockToggleBtn = null;
    let scheduleToggleBtn = null;
    let temperatureToggleBtn = null;
    let temperatureAllowActionBtn = null;
    let editWidgetOpen = false;
    let homepageEditState = { clockHidden: false, scheduleHidden: false, clockFormat: '12', clockAlign: 'center', clockSize: 'large', temperatureEnabled: true, temperatureUnit: 'celsius' };
    let hasUpcomingItems = false;
    let clockTimer = null;
    let upcomingTimer = null;
    let weatherTimer = null;
    let classTasksGridState = { title: 'Class Tasks', columns: [{ id: 'column-1', title: 'Title' }], cells: {} };
    let classTasksRefreshHandler = null;
    let classTasksDomObserver = null;
    let classTasksRefreshTimeout = null;
    let homepageShellInsertionObserver = null;
    let homepageShellInsertionRetryTimeout = null;
    let homepageShellInsertionAttempts = 0;
    let homebarAnchorObserver = null;
    let classTasksLastRefreshAt = 0;
    let classTasksInitialRefreshTimeouts = [];
    let classTasksCustomTitles = {};
    let classTasksStorageChangeHandler = null;
    let classTasksActivityEnabled = false;
    let classTasksHostReadyHandler = null;
    let classTasksNotesAddColumnHandler = null;
    let classTasksNotesClearAllHandler = null;
    let notesPanelResizedHandler = null;
    let classTasksLastSourceSignature = '';
    let homepageInitialRefreshTimeouts = [];

    function isHomePage() {
        try {
            const p = (window.location.pathname || '/').replace(/\/+$/g, '') || '/';
            if (p === '/' || p === '') return true;
            if (p === '/h') return true;
            if (/^\/u\/\d+(\/h)?$/.test(p)) return true;
            return false;
        } catch (e) {
            return false;
        }
    }

    function parseTimeToMinutes(t) {
        if (!t || typeof t !== 'string') return 0;
        const parts = t.split(':');
        const hours = parseInt(parts[0], 10) || 0;
        const minutes = parseInt(parts[1], 10) || 0;
        return hours * 60 + minutes;
    }

    function formatTimeToAmPm(t) {
        if (typeof t === 'number') {
            const hours = Math.floor(t / 60);
            const minutes = t % 60;
            const suffix = hours >= 12 ? 'pm' : 'am';
            const displayHours = ((hours + 11) % 12) + 1;
            return `${displayHours}:${String(minutes).padStart(2, '0')} ${suffix}`;
        }

        if (!t || typeof t !== 'string') return '--:--';
        const parts = t.split(':');
        const hours = parseInt(parts[0], 10) || 0;
        const minutes = parseInt(parts[1], 10) || 0;
        const suffix = hours >= 12 ? 'pm' : 'am';
        const displayHours = ((hours + 11) % 12) + 1;
        return `${displayHours}:${String(minutes).padStart(2, '0')} ${suffix}`;
    }

    function formatTimeNoPeriod(t) {
        if (!t || typeof t !== 'string') return '--:--';
        const parts = t.split(':');
        const hours = parseInt(parts[0], 10) || 0;
        const minutes = parseInt(parts[1], 10) || 0;
        const displayHours = ((hours + 11) % 12) + 1;
        return `${displayHours}:${String(minutes).padStart(2, '0')}`;
    }

    function formatMinutesRemaining(mins) {
        const safe = Math.max(0, Math.floor(Number(mins) || 0));
        if (safe >= 60) {
            const h = Math.floor(safe / 60);
            const m = safe % 60;
            return m ? `${h}h ${m}m left` : `${h}h left`;
        }
        return `${safe} min left`;
    }

    function getClassroomClassPath() {
        const match = window.location.pathname.match(/^(.*?\/c\/[^/]+)/);
        return match ? match[1] : window.location.pathname;
    }

    function getAssignmentUrl(item) {
        if (item?.url) return item.url;
        const classPath = String(item?.classPath || '').trim() || getClassroomClassPath();
        const streamItemId = String(item?.streamItemId || '').trim();
        const courseWorkId = String(item?.courseWorkId || '').trim();

        if (courseWorkId) {
            return `${window.location.origin}${classPath}/a/${encodeURIComponent(courseWorkId)}/details`;
        }

        if (streamItemId) {
            return `${window.location.origin}${classPath}/m/${encodeURIComponent(streamItemId)}/details`;
        }

        return `${window.location.origin}${classPath}`;
    }

    function normalizeStarredAssignments(raw) {
        if (!Array.isArray(raw)) return [];

        const seen = new Set();

        return raw.map((item) => {
            const title = String(item?.title || item?.rawTitle || '').trim().slice(0, 220);
            const rawTitle = String(item?.rawTitle || title).trim().slice(0, 240);
            const itemId = String(item?.itemId || '').trim();
            const courseWorkId = String(item?.courseWorkId || '').trim();
            const streamItemId = String(item?.streamItemId || '').trim();
            const classPath = String(item?.classPath || '').trim();
            const itemType = String(item?.itemType || '').trim();
            const note = String(item?.note || '').trim().slice(0, 200);
            const url = String(item?.url || '').trim();
            const savedAt = Number(item?.savedAt) || Date.now();

            return {
                itemId,
                courseWorkId,
                streamItemId,
                classPath,
                itemType,
                title,
                rawTitle,
                note,
                url,
                savedAt
            };
        }).filter((item) => {
            const key = item.itemId || item.courseWorkId || item.streamItemId || `${item.classPath}|${item.title}`;
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return !!item.title;
        }).sort((left, right) => (right.savedAt || 0) - (left.savedAt || 0));
    }

    function loadSavedAssignments() {
        try {
            const raw = localStorage.getItem('modernClassroom_starredAssignments');
            if (!raw) return [];
            return normalizeStarredAssignments(JSON.parse(raw));
        } catch (_) {
            return [];
        }
    }

    function loadTimetableClasses() {
        if (typeof getStoredClasses === 'function') {
            try {
                return getStoredClasses() || [];
            } catch (_) {}
        }

        try {
            const currentIndexRaw = localStorage.getItem('mcTimetableCurrentIndex');
            const currentIndex = Number.isFinite(Number(currentIndexRaw)) ? Number(currentIndexRaw) : 0;
            const classesRaw = localStorage.getItem('mcTimetableClassesShared');
            const periodsRaw = localStorage.getItem(`mcTimetableClasses_${currentIndex}`);
            const classes = classesRaw ? JSON.parse(classesRaw) : [];
            const periodsMap = periodsRaw ? JSON.parse(periodsRaw) : {};
            return Array.isArray(classes)
                ? classes.map((entry) => ({
                    ...entry,
                    periods: periodsMap?.[entry.id] || []
                }))
                : [];
        } catch (_) {
            return [];
        }
    }

    function getUpcomingItems() {
        const classes = loadTimetableClasses();
        const today = new Date().getDay();
        const now = new Date();
        const nowMin = now.getHours() * 60 + now.getMinutes();
        const activeItems = [];
        const upcomingItems = [];

        classes.forEach((classItem) => {
            (classItem.periods || []).forEach((period) => {
                if (!period || Number(period.day) !== today) return;
                if (!period.start || !period.end) return;

                const startMin = parseTimeToMinutes(period.start);
                const endMin = parseTimeToMinutes(period.end);
                
                // Check if class is currently active
                if (startMin <= nowMin && nowMin < endMin) {
                    activeItems.push({
                        classItem,
                        period,
                        startMin,
                        endMin,
                        isActive: true
                    });
                } else if (startMin > nowMin) {
                    upcomingItems.push({
                        classItem,
                        period,
                        startMin,
                        endMin,
                        isActive: false
                    });
                }
            });
        });

        upcomingItems.sort((left, right) => left.startMin - right.startMin);
        return [...activeItems, ...upcomingItems];
    }

    function loadHomepageEditState() {
        try {
            const raw = localStorage.getItem(EDIT_STATE_KEY);
            if (!raw) return { clockHidden: false, scheduleHidden: false, clockFormat: '12', clockAlign: 'center', clockSize: 'large', temperatureEnabled: true, temperatureUnit: 'celsius' };

                const parsed = JSON.parse(raw);
                return {
                    clockHidden: !!parsed?.clockHidden,
                    scheduleHidden: !!parsed?.scheduleHidden,
                    clockFormat: parsed?.clockFormat === '24' ? '24' : '12',
                    clockAlign: parsed?.clockAlign === 'left' ? 'left' : 'center',
                    clockSize: parsed?.clockSize === 'small' || parsed?.clockSize === 'medium' ? parsed.clockSize : 'large',
                    temperatureEnabled: parsed?.temperatureEnabled !== false,
                    temperatureUnit: parsed?.temperatureUnit === 'fahrenheit' ? 'fahrenheit' : 'celsius'
                };
        } catch (_) {
        return { clockHidden: false, scheduleHidden: false, clockFormat: '12', clockAlign: 'center', clockSize: 'large', temperatureEnabled: true, temperatureUnit: 'celsius' };
        }
    }

    function loadClassTasksGridState() {
        try {
            const raw = localStorage.getItem(CLASS_TASKS_STATE_KEY);
            if (!raw) return { title: 'Class Tasks', columns: [{ id: 'column-1', title: 'Title' }], cells: {} };

            const parsed = JSON.parse(raw);
            const columns = Array.isArray(parsed?.columns)
                ? parsed.columns.map((column, index) => ({
                    id: String(column?.id || `column-${index + 1}`),
                    title: String(column?.title || 'Title').trim().slice(0, 40) || 'Title'
                })).filter((column, index, list) => column.id && list.findIndex(entry => entry.id === column.id) === index)
                : [];

            return {
                title: String(parsed?.title || 'Class Tasks').trim().slice(0, 60) || 'Class Tasks',
                columns: columns.length ? columns : [{ id: 'column-1', title: 'Title' }],
                cells: parsed?.cells && typeof parsed.cells === 'object' ? parsed.cells : {}
            };
        } catch (_) {
            return { title: 'Class Tasks', columns: [{ id: 'column-1', title: 'Title' }], cells: {} };
        }
    }

    function saveClassTasksGridState() {
        try {
            localStorage.setItem(CLASS_TASKS_STATE_KEY, JSON.stringify(classTasksGridState));
        } catch (_) {}
    }

    function getClassTasksHostElement() {
        if (typeof document === 'undefined') return null;
        return document.querySelector(CLASS_TASKS_HOST_SELECTOR);
    }

    function attachClassTasksSectionToPreferredHost() {
        if (!refs?.classTasksSection) return;
        if (BROOM_ICON_URL) {
            refs.classTasksSection.style.setProperty('--mc-class-tasks-broom-icon-url', `url("${BROOM_ICON_URL}")`);
        }
        if (TRASH_ICON_URL) {
            refs.classTasksSection.style.setProperty('--mc-class-tasks-trash-icon-url', `url("${TRASH_ICON_URL}")`);
        }

        const host = getClassTasksHostElement();
        if (!host) {
            if (refs.classTasksSection.parentElement) {
                refs.classTasksSection.parentElement.removeChild(refs.classTasksSection);
            }
            refs.classTasksSection.classList.remove('mc-homepage-class-tasks-in-notes');
            return;
        }

        if (refs.classTasksSection.parentElement !== host) {
            host.appendChild(refs.classTasksSection);
        }

        refs.classTasksSection.classList.add('mc-homepage-class-tasks-in-notes');
    }

    function ensureClassTasksHostReadyListener() {
        if (classTasksHostReadyHandler || typeof window === 'undefined') return;

        classTasksHostReadyHandler = () => {
            if (!mounted) {
                mount();
            }
            if (!mounted) return;
            setClassTasksActivityEnabled(!!getClassTasksHostElement());
            attachClassTasksSectionToPreferredHost();
            syncClassTasksUI();
        };

        window.addEventListener('mc-notes-class-tasks-host-ready', classTasksHostReadyHandler);
    }

    function syncClassTasksTitleButtons() {
        if (!refs?.classTasksSectionTitle || !refs?.classTasksSectionTitleInput) return;
        const isEditing = refs.classTasksSectionTitle.classList.contains('mc-homepage-grid-title-editing');
        refs.classTasksSectionTitle.hidden = isEditing;
        refs.classTasksSectionTitleInput.hidden = !isEditing;
        if (isEditing) {
            refs.classTasksSectionTitleInput.value = classTasksGridState.title;
            requestAnimationFrame(() => {
                try {
                    refs.classTasksSectionTitleInput.focus();
                    refs.classTasksSectionTitleInput.select();
                } catch (_) {}
            });
        }
    }

    function setClassTasksSectionTitle(nextTitle) {
        const title = String(nextTitle || '').trim().slice(0, 60) || 'Class Tasks';
        classTasksGridState = {
            ...classTasksGridState,
            title
        };
        saveClassTasksGridState();
        syncClassTasksUI();
    }

    function setClassTasksColumnTitle(columnId, nextTitle) {
        const title = String(nextTitle || '').trim().slice(0, 40) || 'Title';
        classTasksGridState = {
            ...classTasksGridState,
            columns: (classTasksGridState.columns || []).map((column) => (
                column.id === columnId ? { ...column, title } : column
            ))
        };
        saveClassTasksGridState();
        syncClassTasksUI();
    }

    function addClassTasksColumn() {
        const nextIndex = (classTasksGridState.columns?.length || 0) + 1;
        const columnId = `column-${Date.now()}-${nextIndex}`;
        classTasksGridState = {
            ...classTasksGridState,
            columns: [
                ...(classTasksGridState.columns || []),
                { id: columnId, title: `Title ${nextIndex}` }
            ]
        };
        saveClassTasksGridState();
        syncClassTasksUI();
        requestAnimationFrame(() => {
            const input = refs?.classTasksGrid?.querySelector(`[data-column-title-input="${columnId}"]`);
            if (input) {
                try {
                    input.focus();
                    input.select();
                } catch (_) {}
            }
        });
    }

    function scheduleClassTasksRefresh(delay = 0) {
        if (typeof window === 'undefined') return;

        if (classTasksRefreshTimeout !== null) {
            window.clearTimeout(classTasksRefreshTimeout);
            classTasksRefreshTimeout = null;
        }

        classTasksRefreshTimeout = window.setTimeout(() => {
            classTasksRefreshTimeout = null;
            if (!mounted) return;

            const now = Date.now();
            const elapsed = now - classTasksLastRefreshAt;
            if (elapsed < 220) {
                scheduleClassTasksRefresh(220 - elapsed);
                return;
            }

            classTasksLastRefreshAt = now;
            const nextSignature = getSidebarClassEntriesSignature();
            if (nextSignature !== classTasksLastSourceSignature) {
                classTasksLastSourceSignature = nextSignature;
                syncClassTasksUI();
            }
        }, Math.max(0, Number(delay) || 0));
    }

    function scheduleInitialClassTasksRefreshes() {
        if (typeof window === 'undefined') return;
        classTasksInitialRefreshTimeouts.forEach((id) => window.clearTimeout(id));
        classTasksInitialRefreshTimeouts = [];

        const id = window.setTimeout(() => {
            if (!mounted) return;
            scheduleClassTasksRefresh(0);
        }, 180);
        classTasksInitialRefreshTimeouts.push(id);
    }

    function refreshHomepageSections() {
        if (!mounted) return;

        renderUpcoming();
        syncClassTasksUI();
        ensureClassesListMounted();
        attachHomebarToNativeClassPanel();
        syncUpcomingScroller();
    }

    function scheduleInitialHomepageRefreshes() {
        if (typeof window === 'undefined') return;
        homepageInitialRefreshTimeouts.forEach((id) => window.clearTimeout(id));
        homepageInitialRefreshTimeouts = [];

        [80, 240, 520, 1100].forEach((delay) => {
            const id = window.setTimeout(() => {
                refreshHomepageSections();
            }, delay);
            homepageInitialRefreshTimeouts.push(id);
        });
    }

    function normalizeClassTasksTitlesMap(value) {
        return value && typeof value === 'object' ? { ...value } : {};
    }

    async function loadClassTasksCustomTitles() {
        if (!classTasksActivityEnabled) return;

        try {
            if (typeof storageGet === 'function') {
                const stored = await storageGet('titles', {});
                if (!classTasksActivityEnabled) return;
                classTasksCustomTitles = normalizeClassTasksTitlesMap(stored);
                return;
            }
        } catch (_) {}

        try {
            if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
                chrome.storage.local.get('titles', (data) => {
                    if (!classTasksActivityEnabled) return;
                    classTasksCustomTitles = normalizeClassTasksTitlesMap(data?.titles);
                });
            }
        } catch (_) {}
    }

    function getClassTasksDisplayTitle(classId, fallbackTitle) {
        const custom = String(classTasksCustomTitles?.[classId] || '').trim();
        if (custom) return custom;
        return String(fallbackTitle || '').trim() || 'Unknown Class';
    }

    function isClassTasksSourceVisible(element) {
        if (!(element instanceof Element)) return false;
        let current = element;

        while (current && current instanceof Element && current !== document.body) {
            const style = window.getComputedStyle(current);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            current = current.parentElement;
        }

        return true;
    }

    function getClassIdFromClassroomHref(href) {
        const match = String(href || '').match(/\/c\/([^/?#]+)/);
        return match ? match[1] : '';
    }

    function getSidebarClassEntries() {
        const entries = [];
        const seen = new Set();
        const sidebarLinks = document.querySelectorAll('a[role="menuitem"][data-id][href*="/c/"], .STek2d a[href*="/c/"]');

        sidebarLinks.forEach((link) => {
            const classId = getClassIdFromClassroomHref(link.getAttribute('href') || '');
            if (!classId || seen.has(classId) || !isClassTasksSourceVisible(link)) return;

            const titleEl = link.querySelector('.GRvzhf.YVvGBb, .XL4gNd.YVvGBb, .YVvGBb');
            const ariaTitle = String(link.getAttribute('aria-label') || '').trim();
            const fallbackTitle = String(titleEl?.textContent || ariaTitle || '').trim();
            const title = getClassTasksDisplayTitle(classId, fallbackTitle);

            seen.add(classId);
            entries.push({ id: classId, title, element: link });
        });

        return entries;
    }

    function getSidebarClassEntriesSignature() {
        return getSidebarClassEntries().map((entry) => `${entry.id}:${entry.title}`).join('|');
    }

    function ensureClassTasksDomObserver() {
        if (classTasksDomObserver || typeof MutationObserver === 'undefined' || !document?.body) return;

        const sidebarRoots = [
            document.querySelector('.STek2d'),
            document.querySelector('[data-nav-menu-group="2"]'),
            document.querySelector('nav')
        ].filter(Boolean);

        classTasksDomObserver = new MutationObserver((mutations) => {
            let shouldRefresh = false;
            for (const mutation of mutations) {
                if (mutation.type === 'characterData') {
                    const parent = mutation.target?.parentElement;
                    if (!parent || parent.closest('#mc-homepage-shell')) {
                        continue;
                    }
                    const titleElement = parent.closest('.ScpeUc, .onkcGd, .GRvzhf, .XL4gNd, .YVvGBb');
                    const classLink = parent.closest('a[href*="/c/"], a[data-id]');
                    if (titleElement && classLink && sidebarRoots.some((root) => root.contains(classLink) || root === classLink)) {
                        shouldRefresh = true;
                        break;
                    }
                }

                if (mutation.type === 'attributes') {
                    const target = mutation.target;
                    if (target instanceof Element && target.matches('a[href*="/c/"], a[data-id]')) {
                        if (mutation.attributeName === 'href' || mutation.attributeName === 'data-id') {
                            shouldRefresh = true;
                            break;
                        }
                    }
                }

                if (mutation.type === 'childList') {
                    const target = mutation.target;
                    if (target instanceof Element && target.closest('#mc-homepage-shell')) {
                        continue;
                    }

                    if (target instanceof Element && !sidebarRoots.some((root) => root.contains(target) || target === root)) {
                        continue;
                    }

                    const nodes = [...(mutation.addedNodes || []), ...(mutation.removedNodes || [])];
                    const hasClassCardSignal = nodes.some((node) => {
                        if (!(node instanceof Element)) return false;
                        if (node.matches('a[href*="/c/"], a[data-id], .GRvzhf, .XL4gNd, .YVvGBb')) return true;
                        return !!node.querySelector('a[href*="/c/"], a[data-id], .GRvzhf, .XL4gNd, .YVvGBb');
                    });

                    if (hasClassCardSignal) {
                        shouldRefresh = true;
                        break;
                    }
                }
            }

            if (shouldRefresh) {
                scheduleClassTasksRefresh(60);
            }
        });

        sidebarRoots.forEach((root) => {
            classTasksDomObserver.observe(root, {
                childList: true,
                subtree: true,
                characterData: true,
                attributes: true,
                attributeFilter: ['href', 'data-id']
            });
        });
    }

    function removeClassTasksDomObserver() {
        if (classTasksDomObserver) {
            classTasksDomObserver.disconnect();
            classTasksDomObserver = null;
        }

        if (typeof window !== 'undefined') {
            if (classTasksRefreshTimeout !== null) {
                window.clearTimeout(classTasksRefreshTimeout);
                classTasksRefreshTimeout = null;
            }
            classTasksInitialRefreshTimeouts.forEach((id) => window.clearTimeout(id));
            classTasksInitialRefreshTimeouts = [];
        }
    }

    function setClassTasksActivityEnabled(nextEnabled) {
        const shouldEnable = !!nextEnabled;
        if (classTasksActivityEnabled === shouldEnable) return;
        classTasksActivityEnabled = shouldEnable;

        if (!classTasksActivityEnabled) {
            removeClassTasksDomObserver();
            return;
        }

        loadClassTasksCustomTitles();
    }

    function getVisibleClassEntries() {
        return getSidebarClassEntries();
    }

    function getClassTasksCellState(classId, columnId) {
        return classTasksGridState.cells?.[classId]?.[columnId] || 0;
    }

    function setClassTasksCellState(classId, columnId, nextState) {
        const cells = { ...(classTasksGridState.cells || {}) };
        const row = { ...(cells[classId] || {}) };

        if (nextState) {
            row[columnId] = nextState;
        } else {
            delete row[columnId];
        }

        if (Object.keys(row).length) {
            cells[classId] = row;
        } else {
            delete cells[classId];
        }

        classTasksGridState = {
            ...classTasksGridState,
            cells
        };
        saveClassTasksGridState();
        syncClassTasksUI();
    }

    function clearAllClassTasksCells() {
        classTasksGridState = {
            ...classTasksGridState,
            cells: {}
        };
        saveClassTasksGridState();
        syncClassTasksUI();
    }

    function clearClassTasksColumnCells(columnId) {
        const sourceCells = classTasksGridState.cells || {};
        const nextCells = {};

        Object.entries(sourceCells).forEach(([classId, row]) => {
            if (!row || typeof row !== 'object') return;
            const nextRow = { ...row };
            delete nextRow[columnId];
            if (Object.keys(nextRow).length) {
                nextCells[classId] = nextRow;
            }
        });

        classTasksGridState = {
            ...classTasksGridState,
            cells: nextCells
        };
        saveClassTasksGridState();
        syncClassTasksUI();
    }

    function clearClassTasksRowCells(classId) {
        const sourceCells = classTasksGridState.cells || {};
        const nextCells = { ...sourceCells };

        delete nextCells[classId];

        classTasksGridState = {
            ...classTasksGridState,
            cells: nextCells
        };
        saveClassTasksGridState();
        syncClassTasksUI();
    }

    function deleteClassTasksColumn(columnId) {
        const currentColumns = Array.isArray(classTasksGridState.columns) ? classTasksGridState.columns : [];
        const remainingColumns = currentColumns.filter((column) => column.id !== columnId);

        classTasksGridState = {
            ...classTasksGridState,
            columns: remainingColumns.length ? remainingColumns : [{ id: `column-${Date.now()}`, title: 'Title' }]
        };

        clearClassTasksColumnCells(columnId);
    }

    function cycleClassTasksCellState(classId, columnId) {
        const current = getClassTasksCellState(classId, columnId);
        const next = current === 0 ? 1 : current === 1 ? 2 : 0;
        setClassTasksCellState(classId, columnId, next);
    }

    function renderClassTasksGrid() {
        if (!refs?.classTasksGrid) return;

        const classEntries = getVisibleClassEntries();
        const columns = Array.isArray(classTasksGridState.columns) ? classTasksGridState.columns : [];
        const hasClasses = classEntries.length > 0;
        const columnCount = Math.max(columns.length, 1);
        const scrollWidth = Math.max(0, Number(refs?.classTasksScroll?.clientWidth) || Number(refs?.classTasksBody?.clientWidth) || 0);
        const classColumnWidth = 110;
        const gridColumnGap = 6;
        const totalGapWidth = columnCount * gridColumnGap;
        const remainingWidth = Math.max(0, scrollWidth - classColumnWidth - totalGapWidth);
        const candidateColumnWidth = columnCount > 0 ? Math.floor(remainingWidth / columnCount) : 65;
        const columnWidth = Math.max(65, candidateColumnWidth);
        const template = `${classColumnWidth}px repeat(${columnCount}, ${columnWidth}px)`;

        refs.classTasksEmpty.hidden = hasClasses;
        refs.classTasksGrid.hidden = !hasClasses;
        refs.classTasksGrid.style.setProperty('--mc-homepage-class-task-template', template);
        if (!hasClasses) {
            refs.classTasksGrid.innerHTML = '';
            if (refs.classTasksGridHeader) refs.classTasksGridHeader.innerHTML = '';
            return;
        }

        refs.classTasksGrid.innerHTML = '';
        if (refs.classTasksGridHeader) refs.classTasksGridHeader.innerHTML = '';

        const headerRow = document.createElement('div');
        headerRow.className = 'mc-homepage-class-tasks-row mc-homepage-class-tasks-header-row';
        headerRow.style.gridTemplateColumns = template;

        const classHeader = document.createElement('div');
        classHeader.className = 'mc-homepage-class-tasks-cell mc-homepage-class-tasks-class-header';
        classHeader.textContent = '';
        classHeader.setAttribute('aria-hidden', 'true');
        headerRow.appendChild(classHeader);

        columns.forEach((column) => {
            const headerCell = document.createElement('div');
            headerCell.className = 'mc-homepage-class-tasks-cell mc-homepage-class-tasks-column-header';

            const headerActions = document.createElement('div');
            headerActions.className = 'mc-homepage-class-tasks-column-actions';

            const clearColumnBtn = document.createElement('button');
            clearColumnBtn.type = 'button';
            clearColumnBtn.className = 'mc-homepage-class-tasks-column-action-btn mc-homepage-class-tasks-column-action-clear';
            clearColumnBtn.textContent = '';
            clearColumnBtn.setAttribute('aria-label', `Clear ${column.title}`);
            clearColumnBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                clearClassTasksColumnCells(column.id);
            });

            const deleteColumnBtn = document.createElement('button');
            deleteColumnBtn.type = 'button';
            deleteColumnBtn.className = 'mc-homepage-class-tasks-column-action-btn mc-homepage-class-tasks-column-action-delete';
            deleteColumnBtn.textContent = '';
            deleteColumnBtn.setAttribute('aria-label', `Delete ${column.title}`);
            deleteColumnBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                deleteClassTasksColumn(column.id);
            });

            const titleButton = document.createElement('button');
            titleButton.type = 'button';
            titleButton.className = 'mc-homepage-class-tasks-column-title';
            titleButton.dataset.columnTitleButton = column.id;
            titleButton.textContent = column.title;

            const titleInput = document.createElement('input');
            titleInput.type = 'text';
            titleInput.className = 'mc-homepage-class-tasks-column-input';
            titleInput.dataset.columnTitleInput = column.id;
            titleInput.maxLength = 40;
            titleInput.hidden = true;
            titleInput.value = column.title;

            const finishEdit = () => {
                const value = titleInput.value || column.title;
                titleButton.hidden = false;
                titleInput.hidden = true;
                headerCell.classList.remove('mc-homepage-grid-title-editing');
                setClassTasksColumnTitle(column.id, value);
            };

            titleButton.addEventListener('click', (event) => {
                event.stopPropagation();
                titleButton.hidden = true;
                titleInput.hidden = false;
                headerCell.classList.add('mc-homepage-grid-title-editing');
                titleInput.focus();
                titleInput.select();
            });
            titleInput.addEventListener('blur', finishEdit);
            titleInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    finishEdit();
                }
                if (event.key === 'Escape') {
                    event.preventDefault();
                    titleInput.value = column.title;
                    titleButton.hidden = false;
                    titleInput.hidden = true;
                    headerCell.classList.remove('mc-homepage-grid-title-editing');
                }
            });

            headerActions.appendChild(clearColumnBtn);
            headerActions.appendChild(deleteColumnBtn);
            headerCell.appendChild(headerActions);
            headerCell.appendChild(titleButton);
            headerCell.appendChild(titleInput);
            headerRow.appendChild(headerCell);
        });

        if (refs.classTasksGridHeader) {
            refs.classTasksGridHeader.appendChild(headerRow);
        } else {
            refs.classTasksGrid.appendChild(headerRow);
        }

        classEntries.forEach((entry) => {
            const row = document.createElement('div');
            row.className = 'mc-homepage-class-tasks-row';
            row.dataset.classId = entry.id;
            row.style.gridTemplateColumns = template;

            const labelCell = document.createElement('div');
            labelCell.className = 'mc-homepage-class-tasks-cell mc-homepage-class-tasks-class-label';
            const labelText = document.createElement('span');
            labelText.className = 'mc-homepage-class-tasks-class-label-text';
            labelText.textContent = entry.title;

            const clearRowBtn = document.createElement('button');
            clearRowBtn.type = 'button';
            clearRowBtn.className = 'mc-homepage-class-tasks-row-clear-btn';
            clearRowBtn.textContent = 'Clear';
            clearRowBtn.setAttribute('aria-label', `Clear ${entry.title}`);
            clearRowBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                clearClassTasksRowCells(entry.id);
            });

            labelCell.appendChild(labelText);
            labelCell.appendChild(clearRowBtn);
            row.appendChild(labelCell);

            columns.forEach((column) => {
                const cellButton = document.createElement('button');
                cellButton.type = 'button';
                cellButton.className = 'mc-homepage-class-tasks-cell mc-homepage-class-tasks-state-cell';
                cellButton.dataset.classId = entry.id;
                cellButton.dataset.columnId = column.id;

                const state = getClassTasksCellState(entry.id, column.id);
                cellButton.dataset.state = String(state);
                cellButton.setAttribute('aria-label', `${entry.title} ${column.title}`);
                cellButton.setAttribute('aria-pressed', state ? 'true' : 'false');
                cellButton.textContent = state === 1 ? '○' : state === 2 ? '●' : '';

                cellButton.addEventListener('click', (event) => {
                    event.stopPropagation();
                    cycleClassTasksCellState(entry.id, column.id);
                });

                row.appendChild(cellButton);
            });

            refs.classTasksGrid.appendChild(row);
        });
    }

    function syncClassTasksUI() {
        if (!refs) return;

        attachClassTasksSectionToPreferredHost();

        if (refs.classTasksSectionTitle) {
            refs.classTasksSectionTitle.textContent = classTasksGridState.title || 'Class Tasks';
        }

        if (refs.classTasksSectionTitleInput) {
            refs.classTasksSectionTitleInput.value = classTasksGridState.title || 'Class Tasks';
        }

        syncClassTasksTitleButtons();
        renderClassTasksGrid();
    }

    function ensureClassTasksRefreshListener() {
        if (classTasksRefreshHandler || typeof window === 'undefined') return;

        classTasksRefreshHandler = () => {
            if (!mounted || !classTasksActivityEnabled) return;
            scheduleClassTasksRefresh(0);
            scheduleSync();
        };

        window.addEventListener('mc-homepage-class-tasks-refresh', classTasksRefreshHandler);

        if (!classTasksNotesAddColumnHandler) {
            classTasksNotesAddColumnHandler = () => {
                if (!mounted || !classTasksActivityEnabled) return;
                addClassTasksColumn();
            };
            window.addEventListener('mc-notes-class-tasks-add-column', classTasksNotesAddColumnHandler);
        }

        if (!classTasksNotesClearAllHandler) {
            classTasksNotesClearAllHandler = () => {
                if (!mounted || !classTasksActivityEnabled) return;
                clearAllClassTasksCells();
            };
            window.addEventListener('mc-notes-class-tasks-clear-all', classTasksNotesClearAllHandler);
        }

        if (!classTasksStorageChangeHandler && typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
            classTasksStorageChangeHandler = (changes, areaName) => {
                if (!mounted || !classTasksActivityEnabled || areaName !== 'local' || !changes) return;
                if (changes.titles) {
                    loadClassTasksCustomTitles();
                }
            };
            chrome.storage.onChanged.addListener(classTasksStorageChangeHandler);
        }

        if (!notesPanelResizedHandler) {
            notesPanelResizedHandler = (ev) => {
                try {
                    if (!mounted || !classTasksActivityEnabled) return;
                    // Recompute grid template to reflect current host/scroll width
                    renderClassTasksGrid();
                } catch (_) {}
            };
            window.addEventListener('mc-notes-panel-resized', notesPanelResizedHandler);
        }
    }

    function removeClassTasksRefreshListener() {
        if (!classTasksRefreshHandler) return;
        window.removeEventListener('mc-homepage-class-tasks-refresh', classTasksRefreshHandler);
        classTasksRefreshHandler = null;
        if (classTasksNotesAddColumnHandler) {
            window.removeEventListener('mc-notes-class-tasks-add-column', classTasksNotesAddColumnHandler);
            classTasksNotesAddColumnHandler = null;
        }
        if (classTasksNotesClearAllHandler) {
            window.removeEventListener('mc-notes-class-tasks-clear-all', classTasksNotesClearAllHandler);
            classTasksNotesClearAllHandler = null;
        }

        if (notesPanelResizedHandler) {
            window.removeEventListener('mc-notes-panel-resized', notesPanelResizedHandler);
            notesPanelResizedHandler = null;
        }

        if (classTasksStorageChangeHandler && typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
            try {
                chrome.storage.onChanged.removeListener(classTasksStorageChangeHandler);
            } catch (_) {}
            classTasksStorageChangeHandler = null;
        }
    }

    function setClassTasksSectionTitleEditing(isEditing) {
        if (!refs?.classTasksSectionTitle || !refs?.classTasksSectionTitleInput) return;
        refs.classTasksSectionTitle.classList.toggle('mc-homepage-grid-title-editing', !!isEditing);
        syncClassTasksTitleButtons();
    }

    async function getGeolocationPermissionState() {
        if (!navigator.geolocation) return 'unsupported';
        try {
            if (!navigator.permissions || typeof navigator.permissions.query !== 'function') {
                return 'prompt';
            }
            const status = await navigator.permissions.query({ name: 'geolocation' });
            return status && status.state ? status.state : 'prompt';
        } catch (_) {
            return 'prompt';
        }
    }

    async function refreshTemperatureLocationAction() {
        if (!temperatureAllowActionBtn) return;
        const permissionState = await getGeolocationPermissionState();
        const shouldShow = !!homepageEditState.temperatureEnabled && permissionState !== 'granted' && permissionState !== 'unsupported';
        temperatureAllowActionBtn.hidden = !shouldShow;
    }

    async function requestTemperatureLocationPermission() {
        try {
            if (!navigator.geolocation) return;
            await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
            });
        } catch (_) {}

        await refreshTemperatureLocationAction();
        renderWeather();
    }

    function saveHomepageEditState() {
        try {
            localStorage.setItem(EDIT_STATE_KEY, JSON.stringify(homepageEditState));
        } catch (_) {}
    }

    function syncHomepageEditUI() {
        if (!document.body) return;

        document.body.classList.toggle('mc-homepage-clock-hidden', !!homepageEditState.clockHidden);
        document.body.classList.toggle('mc-homepage-schedule-hidden', !!homepageEditState.scheduleHidden);
        document.body.classList.toggle('mc-homepage-clock-left', String(homepageEditState.clockAlign) === 'left');
        document.body.classList.toggle('mc-homepage-clock-size-small', String(homepageEditState.clockSize) === 'small');
        document.body.classList.toggle('mc-homepage-clock-size-medium', String(homepageEditState.clockSize) === 'medium');
        document.body.classList.toggle('mc-homepage-clock-size-large', String(homepageEditState.clockSize) === 'large');
        document.body.classList.toggle('mc-homepage-temperature-hidden', !homepageEditState.temperatureEnabled);
        syncNativeClassesTitleVisibility();

        if (refs?.weather) {
            refs.weather.hidden = !homepageEditState.temperatureEnabled;
        }

        setClassTasksActivityEnabled(isHomePage());

        if (editWidget) {
            const target = getHomepageEditMountTarget();
            if (editWidget.parentElement !== target) {
                target.appendChild(editWidget);
            }
            editWidget.style.marginTop = homepageEditState.clockHidden ? '10px' : '-22px';
            const mountTarget = editWidget.parentElement;
            if (mountTarget && mountTarget !== document.body) {
                mountTarget.style.paddingTop = homepageEditState.clockHidden ? '5px' : '';
            }
        }

        if (clockToggleBtn) {
            const visible = !homepageEditState.clockHidden;
            clockToggleBtn.setAttribute('role', 'switch');
            clockToggleBtn.setAttribute('aria-checked', visible ? 'true' : 'false');
            clockToggleBtn.classList.toggle('mc-switch-on', visible);
            clockToggleBtn.setAttribute('aria-label', 'Clock visibility');
        }

        // sync clock submenu options if present
        const clockMenu = editWidget ? editWidget.querySelector('.mc-homepage-edit-submenu[data-key="clockFormat"]') : null;
        if (clockMenu) {
            const opts = Array.from(clockMenu.querySelectorAll('[data-setting-key][data-setting-value]'));
            opts.forEach((opt) => {
                const settingKey = String(opt.dataset.settingKey || '');
                const settingValue = String(opt.dataset.settingValue || '');
                const selected = String(homepageEditState[settingKey]) === settingValue;
                opt.classList.toggle('mc-menu-selected', selected);
                opt.setAttribute('aria-checked', selected ? 'true' : 'false');
            });
        }

        // sync temperature submenu options if present
        const tempMenu = editWidget ? editWidget.querySelector('.mc-homepage-edit-submenu[data-key="temperatureUnit"]') : null;
        if (tempMenu) {
            const opts = Array.from(tempMenu.querySelectorAll('[data-setting-key][data-setting-value]'));
            opts.forEach((opt) => {
                const settingKey = String(opt.dataset.settingKey || '');
                const settingValue = String(opt.dataset.settingValue || '');
                const selected = String(homepageEditState[settingKey]) === settingValue;
                opt.classList.toggle('mc-menu-selected', selected);
                opt.setAttribute('aria-checked', selected ? 'true' : 'false');
            });

            refreshTemperatureLocationAction();
        }

        if (scheduleToggleBtn) {
            const visible = !homepageEditState.scheduleHidden;
            scheduleToggleBtn.setAttribute('role', 'switch');
            scheduleToggleBtn.setAttribute('aria-checked', visible ? 'true' : 'false');
            scheduleToggleBtn.classList.toggle('mc-switch-on', visible);
            scheduleToggleBtn.setAttribute('aria-label', 'Schedule visibility');
        }

        if (temperatureToggleBtn) {
            const visible = !!homepageEditState.temperatureEnabled;
            temperatureToggleBtn.setAttribute('role', 'switch');
            temperatureToggleBtn.setAttribute('aria-checked', visible ? 'true' : 'false');
            temperatureToggleBtn.classList.toggle('mc-switch-on', visible);
            temperatureToggleBtn.setAttribute('aria-label', 'Temperature visibility');
        }

        renderWeather();
    }

    function setHomepageEditState(nextState) {
        homepageEditState = {
            ...homepageEditState,
            ...nextState
        };
        saveHomepageEditState();
        syncHomepageEditUI();
    }

    function onHomepageEditOutsidePointerDown(event) {
        if (!editWidget || editWidget.contains(event.target)) return;
        setHomepageEditWidgetOpen(false);
    }

    function setHomepageEditWidgetOpen(nextOpen) {
        editWidgetOpen = !!nextOpen;

        if (editWidget) {
            editWidget.classList.toggle('mc-homepage-edit-open', editWidgetOpen);
        }

        if (document.body) {
            document.body.classList.toggle('mc-homepage-edit-open', editWidgetOpen);
        }

        if (editTrigger) {
            editTrigger.setAttribute('aria-expanded', editWidgetOpen ? 'true' : 'false');
        }

        if (editWidgetOpen) {
            document.addEventListener('pointerdown', onHomepageEditOutsidePointerDown, true);
        } else {
            document.removeEventListener('pointerdown', onHomepageEditOutsidePointerDown, true);
        }
    }

    function toggleHomepageEditState(key) {
        setHomepageEditState({ [key]: !homepageEditState[key] });
    }

    function closeHomepageEditSubmenus(exceptSubmenu = null) {
        if (!editWidget) return;
        const submenus = editWidget.querySelectorAll('.mc-homepage-edit-submenu');
        submenus.forEach((submenu) => {
            if (exceptSubmenu && submenu === exceptSubmenu) return;
            submenu.classList.remove('mc-homepage-edit-submenu-open');
            submenu.setAttribute('aria-hidden', 'true');
            const wrap = submenu.closest('.mc-homepage-edit-menu-wrap');
            const trigger = wrap ? wrap.querySelector('.mc-homepage-edit-menu') : null;
            if (trigger) {
                trigger.setAttribute('aria-expanded', 'false');
            }
        });
    }

    function createHomepageEditButton(label, key) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mc-homepage-edit-toggle';
        button.dataset.toggleKey = key;
        button.innerHTML = `
            <span class="mc-homepage-edit-toggle-label">${label}</span>
            <span class="mc-switch-track" aria-hidden="true"><span class="mc-switch-thumb"></span></span>
        `;
        button.setAttribute('role', 'switch');
        button.setAttribute('aria-checked', 'true');
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleHomepageEditState(key);
        });
        return button;
    }

    function createHomepageEditMenu(label, key, options, submenuToggle) {
        const wrapper = document.createElement('div');
        wrapper.className = 'mc-homepage-edit-menu-wrap';
        const submenuArrowUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
            ? chrome.runtime.getURL('Icons/homeeditarrow.svg')
            : 'Icons/homeeditarrow.svg';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mc-homepage-edit-toggle mc-homepage-edit-menu';
        button.setAttribute('aria-haspopup', 'true');
        button.setAttribute('aria-expanded', 'false');
        if (submenuToggle && submenuToggle.key) {
            button.innerHTML = `
                <span class="mc-homepage-edit-toggle-label">${label}</span>
                <span class="mc-switch-track" data-toggle-key="${submenuToggle.key}" aria-hidden="true"><span class="mc-switch-thumb"></span></span>
            `;
        } else {
            button.innerHTML = `
                <span class="mc-homepage-edit-toggle-label">${label}</span>
            `;
        }

        const hasSubmenuContent = Array.isArray(options) && options.length > 0;

        let submenu = null;
        if (hasSubmenuContent) {
            button.classList.add('mc-homepage-edit-menu-has-submenu');
            submenu = document.createElement('div');
            submenu.className = 'mc-homepage-edit-submenu';
            submenu.setAttribute('role', 'menu');
            submenu.dataset.key = key;
            submenu.setAttribute('aria-hidden', 'true');
        }

        // mark button with whether it has options so CSS/behavior can differ
        if (hasSubmenuContent) {
            button.classList.add('mc-homepage-edit-menu-has-options');
        } else {
            button.classList.add('mc-homepage-edit-menu-no-options');
        }

        if (hasSubmenuContent) {
            const optionsRow = document.createElement('div');
            optionsRow.className = 'mc-homepage-edit-submenu-options';

            options.forEach((opt) => {
                const optBtn = document.createElement('button');
                optBtn.type = 'button';
                optBtn.className = 'mc-homepage-edit-submenu-item';
                optBtn.dataset.settingKey = key;
                optBtn.dataset.settingValue = opt.value;
                optBtn.setAttribute('role', 'menuitemradio');
                optBtn.setAttribute('aria-checked', 'false');
                optBtn.textContent = opt.label;
                optBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    setHomepageEditState({ [key]: opt.value });
                });
                optionsRow.appendChild(optBtn);
            });

            submenu.appendChild(optionsRow);
        }

        button.addEventListener('click', (e) => {
            e.stopPropagation();
            // ensure edit widget open
            setHomepageEditWidgetOpen(true);
            if (!hasSubmenuContent) {
                // no submenu content -> clicking the button itself does nothing;
                // only the internal switch toggles visibility.
                return;
            }

            const isOpen = submenu.classList.contains('mc-homepage-edit-submenu-open');
            if (isOpen) {
                submenu.classList.remove('mc-homepage-edit-submenu-open');
                submenu.setAttribute('aria-hidden', 'true');
                button.setAttribute('aria-expanded', 'false');
                return;
            }

            closeHomepageEditSubmenus(submenu);
            submenu.classList.add('mc-homepage-edit-submenu-open');
            submenu.setAttribute('aria-hidden', 'false');
            button.setAttribute('aria-expanded', 'true');
        });

        if (hasSubmenuContent) {
            button.innerHTML = `
                <img class="mc-homepage-edit-menu-arrow" src="${submenuArrowUrl}" alt="" aria-hidden="true" />
                <span class="mc-homepage-edit-toggle-label">${label}</span>
            ` + (submenuToggle && submenuToggle.key ? `
                <span class="mc-switch-track" data-toggle-key="${submenuToggle.key}" aria-hidden="true"><span class="mc-switch-thumb"></span></span>
            ` : '');
        }

        wrapper.appendChild(button);
        // wire up internal switch (if present)
        const internalSwitch = button.querySelector('.mc-switch-track[data-toggle-key]');
        if (internalSwitch) {
            internalSwitch.addEventListener('click', (e) => {
                e.stopPropagation();
                const key = internalSwitch.dataset.toggleKey;
                if (key) toggleHomepageEditState(key);
            });
        }
        if (hasSubmenuContent && submenu) wrapper.appendChild(submenu);
        return wrapper;
    }

    function getHomepageEditMountTarget() {
        const shell = refs?.shell || document.getElementById(ROOT_ID);
        if (shell) {
            return shell;
        }

        const host = document.querySelector(EDIT_HOST_SELECTOR);
        if (host) {
            const computed = window.getComputedStyle(host);
            if (computed.position === 'static') {
                host.style.position = 'relative';
            }
            return host;
        }

        return document.body;
    }

    function buildHomepageEditWidget() {
        const existingWidget = document.getElementById(EDIT_WIDGET_ID) || editWidget;
        if (existingWidget) {
            editWidget = existingWidget;
            editTrigger = editWidget.querySelector('.mc-homepage-edit-trigger');
            editPanel = editWidget.querySelector('.mc-homepage-edit-inline');
            const _findBtn = (root, key) => {
                try {
                    const el = root.querySelector(`[data-toggle-key="${key}"]`);
                    return el ? el.closest('button.mc-homepage-edit-toggle') : null;
                } catch (_) { return null; }
            };
            clockToggleBtn = _findBtn(editWidget, 'clockHidden');
            scheduleToggleBtn = _findBtn(editWidget, 'scheduleHidden');
            temperatureToggleBtn = _findBtn(editWidget, 'temperatureEnabled');
            const mountTarget = getHomepageEditMountTarget();
            if (editWidget.parentElement !== mountTarget) {
                mountTarget.appendChild(editWidget);
            }
            return;
        }

        const widget = document.createElement('div');
        widget.id = EDIT_WIDGET_ID;
        widget.className = 'mc-homepage-edit-widget';
        widget.innerHTML = `
            <button class="mc-homepage-edit-trigger" type="button" aria-expanded="false" aria-controls="mc-homepage-edit-panel">Edit</button>
            <div class="mc-homepage-edit-inline" id="mc-homepage-edit-panel" role="group" aria-label="Home screen visibility toggles"></div>
        `;

        editWidget = widget;
        editTrigger = widget.querySelector('.mc-homepage-edit-trigger');
        editPanel = widget.querySelector('.mc-homepage-edit-inline');

        function findToggleButton(root, key) {
            try {
                const el = root.querySelector(`[data-toggle-key="${key}"]`);
                if (!el) return null;
                return el.closest('button.mc-homepage-edit-toggle');
            } catch (_) { return null; }
        }

        // Clock: submenu for visibility + format
        const clockMenuWrap = createHomepageEditMenu('Clock', 'clockFormat', [
            { label: '12-hour', value: '12' },
            { label: '24-hour', value: '24' }
        ], {
            label: 'Show Clock',
            key: 'clockHidden'
        });

        // Add second settings row: clock alignment
        const clockSubmenu = clockMenuWrap.querySelector('.mc-homepage-edit-submenu[data-key="clockFormat"]');
        if (clockSubmenu) {
            const alignRow = document.createElement('div');
            alignRow.className = 'mc-homepage-edit-submenu-options mc-homepage-edit-submenu-options-align';

            const leftBtn = document.createElement('button');
            leftBtn.type = 'button';
            leftBtn.className = 'mc-homepage-edit-submenu-item';
            leftBtn.dataset.settingKey = 'clockAlign';
            leftBtn.dataset.settingValue = 'left';
            leftBtn.setAttribute('role', 'menuitemradio');
            leftBtn.setAttribute('aria-checked', 'false');
            leftBtn.textContent = 'Left';
            leftBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                setHomepageEditState({ clockAlign: 'left' });
            });

            const centreBtn = document.createElement('button');
            centreBtn.type = 'button';
            centreBtn.className = 'mc-homepage-edit-submenu-item';
            centreBtn.dataset.settingKey = 'clockAlign';
            centreBtn.dataset.settingValue = 'center';
            centreBtn.setAttribute('role', 'menuitemradio');
            centreBtn.setAttribute('aria-checked', 'false');
            centreBtn.textContent = 'Centre';
            centreBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                setHomepageEditState({ clockAlign: 'center' });
            });

            alignRow.appendChild(leftBtn);
            alignRow.appendChild(centreBtn);
            clockSubmenu.appendChild(alignRow);

            const sizeRow = document.createElement('div');
            sizeRow.className = 'mc-homepage-edit-submenu-options mc-homepage-edit-submenu-options-size';

            const smallBtn = document.createElement('button');
            smallBtn.type = 'button';
            smallBtn.className = 'mc-homepage-edit-submenu-item';
            smallBtn.dataset.settingKey = 'clockSize';
            smallBtn.dataset.settingValue = 'small';
            smallBtn.setAttribute('role', 'menuitemradio');
            smallBtn.setAttribute('aria-checked', 'false');
            smallBtn.textContent = 'Small';
            smallBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                setHomepageEditState({ clockSize: 'small' });
            });

            const mediumBtn = document.createElement('button');
            mediumBtn.type = 'button';
            mediumBtn.className = 'mc-homepage-edit-submenu-item';
            mediumBtn.dataset.settingKey = 'clockSize';
            mediumBtn.dataset.settingValue = 'medium';
            mediumBtn.setAttribute('role', 'menuitemradio');
            mediumBtn.setAttribute('aria-checked', 'false');
            mediumBtn.textContent = 'Med';
            mediumBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                setHomepageEditState({ clockSize: 'medium' });
            });

            const largeBtn = document.createElement('button');
            largeBtn.type = 'button';
            largeBtn.className = 'mc-homepage-edit-submenu-item';
            largeBtn.dataset.settingKey = 'clockSize';
            largeBtn.dataset.settingValue = 'large';
            largeBtn.setAttribute('role', 'menuitemradio');
            largeBtn.setAttribute('aria-checked', 'false');
            largeBtn.textContent = 'Large';
            largeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                setHomepageEditState({ clockSize: 'large' });
            });

            // order: Large (default), Medium, Small
            sizeRow.appendChild(largeBtn);
            sizeRow.appendChild(mediumBtn);
            sizeRow.appendChild(smallBtn);
            clockSubmenu.appendChild(sizeRow);
        }
        clockToggleBtn = findToggleButton(clockMenuWrap, 'clockHidden');

        // Schedule: submenu with visibility toggle
        const scheduleMenuWrap = createHomepageEditMenu('Schedule', 'scheduleSettings', [], {
            label: 'Show Schedule',
            key: 'scheduleHidden'
        });
        scheduleToggleBtn = findToggleButton(scheduleMenuWrap, 'scheduleHidden');

        // Temperature: show toggle + allow location + unit selection
        const temperatureMenuWrap = createHomepageEditMenu('Temperature', 'temperatureUnit', [
            { label: 'Celsius', value: 'celsius' },
            { label: 'Fahrenheit', value: 'fahrenheit' }
        ], {
            label: 'Show Temperature',
            key: 'temperatureEnabled'
        });
        // Add allow-location action inside submenu (only shown when location is not yet allowed)
        const tempSubmenu = temperatureMenuWrap.querySelector('.mc-homepage-edit-submenu[data-key="temperatureUnit"]');
        if (tempSubmenu) {
            const allowRow = document.createElement('div');
            allowRow.className = 'mc-homepage-edit-submenu-options mc-homepage-edit-submenu-options-location';

            const allowBtn = document.createElement('button');
            allowBtn.type = 'button';
            allowBtn.className = 'mc-homepage-edit-submenu-item mc-homepage-edit-submenu-action';
            allowBtn.textContent = 'Allow location';
            allowBtn.hidden = true;
            allowBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await requestTemperatureLocationPermission();
            });

            allowRow.appendChild(allowBtn);
            tempSubmenu.appendChild(allowRow);
            temperatureAllowActionBtn = allowBtn;
        }
        temperatureToggleBtn = findToggleButton(temperatureMenuWrap, 'temperatureEnabled');
        refreshTemperatureLocationAction();

        // order: Clock, Temperature, Schedule
        editPanel.appendChild(clockMenuWrap);
        editPanel.appendChild(temperatureMenuWrap);
        editPanel.appendChild(scheduleMenuWrap);

        editTrigger.addEventListener('click', () => {
            if (editWidgetOpen) {
                closeHomepageEditSubmenus();
            }
            setHomepageEditWidgetOpen(!editWidgetOpen);
        });

        getHomepageEditMountTarget().appendChild(widget);
        syncHomepageEditUI();
        setHomepageEditWidgetOpen(false);
    }

    function createSection(titleText, subtitleText) {
        const section = document.createElement('section');
        section.className = 'mc-homepage-section';

        const header = document.createElement('div');
        header.className = 'mc-homepage-section-header';

        const title = document.createElement('div');
        title.className = 'mc-homepage-section-title';
        title.textContent = titleText;

        header.appendChild(title);

        if (subtitleText) {
            const subtitle = document.createElement('div');
            subtitle.className = 'mc-homepage-section-subtitle';
            subtitle.textContent = subtitleText;
            header.appendChild(subtitle);
        }

        section.appendChild(header);

        const body = document.createElement('div');
        section.appendChild(body);

        return { section, header, title, body };
    }

    function createCard({ title, meta, note, color = DEFAULT_COLOR, badge, onClick, ariaLabel, disabled = false }) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'mc-homepage-upcoming-card';
        card.style.setProperty('--mc-card-accent', color);
        card.setAttribute('aria-label', ariaLabel || title);
        if (disabled) {
            card.disabled = true;
            card.setAttribute('disabled', '');
            card.setAttribute('aria-disabled', 'true');
            card.tabIndex = -1;
            card.style.pointerEvents = 'none';
            card.classList.add('mc-homepage-card-disabled');
            card.addEventListener('click', (event) => {
                event.stopPropagation();
                event.preventDefault();
            }, { capture: true });
        }

        const main = document.createElement('span');
        main.className = 'mc-homepage-card-main';

        const strip = document.createElement('span');
        strip.className = 'mc-homepage-card-strip';

        const content = document.createElement('span');
        content.className = 'mc-homepage-card-content';

        if (badge) {
            const badgeEl = document.createElement('span');
            badgeEl.className = 'mc-homepage-card-badge';
            badgeEl.textContent = badge;
            content.appendChild(badgeEl);
        }

        const titleEl = document.createElement('span');
        titleEl.className = 'mc-homepage-card-title';
        titleEl.textContent = title;
        content.appendChild(titleEl);

        if (meta) {
            const metaEl = document.createElement('span');
            metaEl.className = 'mc-homepage-card-meta';
            metaEl.textContent = meta;
            content.appendChild(metaEl);
        }

        if (note) {
            const noteEl = document.createElement('span');
            noteEl.className = 'mc-homepage-card-note';
            noteEl.textContent = note;
            content.appendChild(noteEl);
        }

        main.appendChild(strip);
        main.appendChild(content);

        card.appendChild(main);

        if (typeof onClick === 'function') {
            card.addEventListener('click', onClick);
        }

        return card;
    }

    // Minimal weather rendering using Open-Meteo + geolocation (graceful fallback)
    function weatherCodeToIcon(code) {
        // Simplified mapping
        if (code === 0) return '☀';
        if (code >= 1 && code <= 3) return '⛅';
        if (code >= 45 && code <= 48) return '🌫';
        if (code >= 51 && code <= 67) return '🌧';
        if (code >= 80 && code <= 82) return '🌦';
        if (code >= 71 && code <= 77) return '❄';
        if (code >= 95 && code <= 99) return '⛈';
        return '☁';
    }

    function setWeatherPlaceholder(text = '—°') {
        if (!refs || !refs.weather) return;
        const iconEl = refs.weather.querySelector('.mc-weather-icon');
        const tempEl = refs.weather.querySelector('.mc-weather-temp');
        if (iconEl) iconEl.textContent = '—';
        if (tempEl) tempEl.textContent = text;
    }

    async function fetchAndUpdateWeather() {
        if (!refs || !refs.weather) return;
        const iconEl = refs.weather.querySelector('.mc-weather-icon');
        const tempEl = refs.weather.querySelector('.mc-weather-temp');

        if (!homepageEditState.temperatureEnabled) {
            return;
        }

        const permissionState = await getGeolocationPermissionState();
        if (permissionState === 'unsupported' || permissionState === 'denied') {
            setWeatherPlaceholder('Allow location');
            return;
        }

        const unit = String(homepageEditState.temperatureUnit || 'celsius') === 'fahrenheit' ? 'fahrenheit' : 'celsius';
        const symbol = unit === 'fahrenheit' ? '°F' : '°C';

        try {
            if (!navigator.geolocation) throw new Error('no-geoloc');
            const pos = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 7000 });
            });
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;
            const resp = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&temperature_unit=${unit}`);
            if (!resp.ok) throw new Error('fetch-failed');
            const data = await resp.json();
            const cw = data && data.current_weather;
            if (!cw) throw new Error('no-data');
            const temp = Math.round(cw.temperature);
            const icon = weatherCodeToIcon(Number(cw.weathercode));
            if (iconEl) iconEl.textContent = icon;
            if (tempEl) tempEl.textContent = `${temp}${symbol}`;
        } catch (e) {
            setWeatherPlaceholder('Allow location');
        } finally {
            refreshTemperatureLocationAction();
        }
    }

    function renderWeather() {
        // Do an initial update; scheduled periodically in timers
        fetchAndUpdateWeather();
    }

    function renderClock() {
        if (!refs) return;

        const now = new Date();
        const dayLine = new Intl.DateTimeFormat(undefined, {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
        }).format(now);
        const hours24 = now.getHours();
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const use24Hour = String(homepageEditState.clockFormat || '12') === '24';
        const displayHours = use24Hour ? String(hours24).padStart(2, '0') : ((hours24 + 11) % 12) + 1;
        const clockLine = `${displayHours}:${minutes}`;

        refs.dayLine.textContent = dayLine || FALLBACK_TODAY_LABEL;
        refs.clock.textContent = clockLine;
    }

    function renderUpcoming() {
        if (!refs) return;

        const upcomingItems = getUpcomingItems();
        const now = new Date();
        const nowMin = now.getHours() * 60 + now.getMinutes();
        const hasItems = Array.isArray(upcomingItems) && upcomingItems.length > 0;
        hasUpcomingItems = hasItems;
        refs.upcomingSection.hidden = !hasItems;
        try { document.body.classList.toggle('mc-homepage-upcoming-has-items', !!hasItems); } catch (_) {}
        refs.upcomingBody.innerHTML = '';

        if (!hasItems) {
            // ensure scroller and controls are updated to hidden when empty
            syncNativeClassesTitleVisibility();
            syncUpcomingScroller();
            try { document.body.classList.toggle('mc-homepage-upcoming-has-items', false); } catch (_) {}
            return;
        }

        upcomingItems.forEach((item) => {
            const color = String(item.classItem?.colour || DEFAULT_COLOR).trim() || DEFAULT_COLOR;
            const title = String(item.classItem?.title || 'Class').trim();
            const room = String(item.classItem?.room || '').trim();
            const teacher = String(item.classItem?.teacher || '').trim();
            const startText = formatTimeNoPeriod(item.period.start);
            const endText = formatTimeNoPeriod(item.period.end);
            const startTextAmPm = formatTimeToAmPm(item.period.start);
            const endTextAmPm = formatTimeToAmPm(item.period.end);
            
            const metaBits = [];
            if (teacher) metaBits.push(teacher);
            if (room) metaBits.push(room);
            const meta = metaBits.length ? metaBits.join(' • ') : '';
            const ariaLabel = item.isActive
                ? `${title} active until ${endTextAmPm}`
                : `${title} starting at ${startTextAmPm}`;

            const classId = String(item.classItem?.id || '').trim();
            const rawClassroomUrl = String(item.classItem?.classroom || '').trim();
            const rawUrl = String(item.classItem?.url || '').trim();

            function _extractClassPath(raw) {
                // returns something like '/c/ID' or '/c/ID/...'
                try {
                    const parsed = new URL(raw, window.location.origin);
                    const m = parsed.pathname.match(/\/c\/[\w-]+(?:\/.*)?$/);
                    if (m) return m[0] + (parsed.search || '') + (parsed.hash || '');
                } catch (e) {
                    // fallback to string parsing
                    const idx = raw.indexOf('/c/');
                    if (idx !== -1) return raw.slice(idx);
                }
                return '';
            }

            function _buildWithCurrentAccount(classPath) {
                // Preserve current account prefix (e.g. /u/1) and replace trailing /h or trailing slash
                const curPath = window.location.pathname || '/';
                const accountMatch = curPath.match(/^\/u\/\d+/);
                const accountPrefix = accountMatch ? accountMatch[0] : '';// like '/u/1'

                // Normalize base: remove trailing '/h' or trailing '/'
                let base = curPath.replace(/\/h\/?$/, '');
                base = base.replace(/\/$/, '');

                let finalBase = '';
                if (accountPrefix) {
                    finalBase = base && base.startsWith(accountPrefix) ? base : accountPrefix;
                }

                // Ensure classPath starts with a single slash
                const normalizedClassPath = classPath.startsWith('/') ? classPath : `/${classPath}`;

                if (finalBase) {
                    return `${window.location.origin}${finalBase}${normalizedClassPath}`;
                }

                return `${window.location.origin}${normalizedClassPath}`;
            }

            // Prefer any explicit stored classroom/url path. If the item has no
            // classroom path available, treat it as unlinked rather than guessing
            // from the class ID.
            const classPath = _extractClassPath(rawClassroomUrl) || _extractClassPath(rawUrl) || '';
            const targetUrl = classPath ? _buildWithCurrentAccount(classPath) : '';
            const hasLinkedClassroom = Boolean(classPath);

            const card = createCard({
                title,
                meta,
                color,
                ariaLabel,
                disabled: !hasLinkedClassroom,
                onClick: hasLinkedClassroom
                    ? (ev) => {
                        try { ev.stopPropagation(); } catch (_) {}
                        const preferred = rawClassroomUrl || rawUrl || targetUrl;
                        let handled = false;
                        if (window.navigateToClassroom && typeof window.navigateToClassroom === 'function') {
                            try { handled = !!window.navigateToClassroom(preferred); } catch (_) { handled = false; }
                        }
                        if (!handled) {
                            // fallback to composed URL (preserves current account prefix)
                            window.location.href = targetUrl || preferred;
                        }
                    }
                    : undefined
            });

            const itemWrap = document.createElement('div');
            itemWrap.className = 'mc-homepage-upcoming-item';

            itemWrap.appendChild(card);
            
            if (item.isActive) {
                card.classList.add('mc-homepage-card-active');
                const periodEl = document.createElement('div');
                periodEl.className = 'mc-homepage-card-period';
                periodEl.textContent = `${startTextAmPm} - ${endTextAmPm}`;
                const content = card.querySelector('.mc-homepage-card-content');
                if (content) content.appendChild(periodEl);

                const remainingEl = document.createElement('span');
                remainingEl.className = 'mc-homepage-card-remaining mc-homepage-card-footer';
                remainingEl.textContent = formatMinutesRemaining(item.endMin - nowMin);
                itemWrap.appendChild(remainingEl);
            } else {
                const content = card.querySelector('.mc-homepage-card-content');
                if (content) {
                    const periodEl = document.createElement('div');
                    periodEl.className = 'mc-homepage-card-period';
                    periodEl.textContent = `Starts at ${startTextAmPm}`;
                    content.appendChild(periodEl);
                }
            }

            refs.upcomingBody.appendChild(itemWrap);
        });

        syncNativeClassesTitleVisibility();
        // update scroller visibility based on rendered content
        syncUpcomingScroller();
    }

    function syncNativeClassesTitleVisibility() {
        const title = document.querySelector('.mc-homebar-native-title');
        if (!title) return;

        const scheduleCountsAsVisible = !homepageEditState.scheduleHidden && hasUpcomingItems;
        const showBecauseAnotherHomeSectionIsVisible = scheduleCountsAsVisible;
        title.hidden = !showBecauseAnotherHomeSectionIsVisible;
    }

    function attachHomebarToNativeClassPanel() {
        const indicator = document.querySelector('.home-indicator');
        if (!indicator) return;

        const classList = document.querySelector('main ol') || document.querySelector('ol');
        const nativePanel = classList?.parentElement;
        if (!nativePanel) return;

        let title = nativePanel.querySelector('.mc-homebar-native-title');
        if (!title) {
            title = document.createElement('div');
            title.className = 'mc-homebar-native-title';
            title.textContent = 'Classes';
            nativePanel.insertBefore(title, classList);
        }

        syncNativeClassesTitleVisibility();

        let anchor = nativePanel.querySelector('.mc-homebar-native-anchor');
        if (!anchor) {
            anchor = document.createElement('div');
            anchor.className = 'mc-homebar-native-anchor';
            nativePanel.insertBefore(anchor, classList);
        }

        if (indicator.parentElement !== anchor) {
            anchor.appendChild(indicator);
        }
    }

    function ensureClassesListMounted() {
        if (!refs) return;
        attachHomebarToNativeClassPanel();
    }

    function getHomepageShellInsertionPoint() {
        return document.querySelector('main ol') || document.querySelector('ol');
    }

    function ensureHomepageShellMountedInTarget(shell) {
        const target = getHomepageShellInsertionPoint();
        if (!shell || !target || shell.parentElement === target) return false;
        if (target === document.body) {
            document.body.prepend(shell);
            return true;
        }

        if (shell.parentElement) {
            shell.parentElement.removeChild(shell);
        }

        if (target.parentElement) {
            target.parentElement.insertBefore(shell, target);
        } else {
            target.appendChild(shell);
        }
        return true;
    }

    function stopHomepageShellInsertionWatch() {
        if (homepageShellInsertionObserver) {
            try {
                homepageShellInsertionObserver.disconnect();
            } catch (_) {}
            homepageShellInsertionObserver = null;
        }
        if (homepageShellInsertionRetryTimeout !== null) {
            window.clearTimeout(homepageShellInsertionRetryTimeout);
            homepageShellInsertionRetryTimeout = null;
        }
        homepageShellInsertionAttempts = 0;
    }

    function stopHomebarAnchorWatch() {
        if (homebarAnchorObserver) {
            try { homebarAnchorObserver.disconnect(); } catch (_) {}
            homebarAnchorObserver = null;
        }
    }

    function startHomebarAnchorWatch() {
        stopHomebarAnchorWatch();
        if (!document.body) return;

        const checkAndAttach = () => {
            try {
                attachHomebarToNativeClassPanel();
                const anchor = document.querySelector('.mc-homebar-native-anchor');
                if (anchor) {
                    stopHomebarAnchorWatch();
                    return true;
                }
            } catch (_) {}
            return false;
        };

        if (checkAndAttach()) return;

        homebarAnchorObserver = new MutationObserver(() => {
            if (checkAndAttach()) stopHomebarAnchorWatch();
        });
        homebarAnchorObserver.observe(document.body, { childList: true, subtree: true });
    }

    function startHomepageShellInsertionWatch(shell) {
        stopHomepageShellInsertionWatch();
        if (!document.body) return;

        const attemptInsert = () => {
            if (ensureHomepageShellMountedInTarget(shell)) {
                stopHomepageShellInsertionWatch();
                return;
            }
            homepageShellInsertionAttempts += 1;
            if (homepageShellInsertionAttempts >= 8) {
                stopHomepageShellInsertionWatch();
                if (shell && shell.parentElement !== document.body) {
                    document.body.prepend(shell);
                }
                return;
            }
            homepageShellInsertionRetryTimeout = window.setTimeout(attemptInsert, 220);
        };

        homepageShellInsertionObserver = new MutationObserver(() => {
            if (ensureHomepageShellMountedInTarget(shell)) {
                stopHomepageShellInsertionWatch();
            }
        });
        homepageShellInsertionObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
        attemptInsert();
    }

    function buildShell(shouldInsertShell = false) {
        if (document.getElementById(ROOT_ID)) {
            refs = collectRefs();
            if (!classTasksGridState || !classTasksGridState.columns) {
                classTasksGridState = loadClassTasksGridState();
            }
            if (shouldInsertShell) {
                ensureHomepageShellMountedInTarget(document.getElementById(ROOT_ID));
            }
            return;
        }

        const shell = document.createElement('div');
        shell.id = ROOT_ID;
        shell.style.position = 'relative';

        const hero = document.createElement('section');
        hero.className = 'mc-homepage-hero';

        const dayLine = document.createElement('div');
        dayLine.className = 'mc-homepage-dayline';

        const clock = document.createElement('div');
        clock.className = 'mc-homepage-clock';

        // Day row: date + weather
        const dayRow = document.createElement('div');
        dayRow.className = 'mc-homepage-dayrow';

        const weather = document.createElement('div');
        weather.className = 'mc-homepage-weather';
        weather.innerHTML = '<span class="mc-weather-icon">—</span> <span class="mc-weather-temp">—°</span>';

        dayRow.appendChild(dayLine);
        dayRow.appendChild(weather);

        // Clock row (clock centered under day row)
        const clockRow = document.createElement('div');
        clockRow.className = 'mc-homepage-clock-row';
        clockRow.appendChild(clock);

        hero.appendChild(dayRow);
        hero.appendChild(clockRow);

        const upcomingSection = createSection('Your Day');
        upcomingSection.section.classList.add('mc-homepage-upcoming-section');
        upcomingSection.body.className = 'mc-homepage-upcoming-list';

        const classTasksSection = createSection('Class Tasks');
        classTasksSection.section.classList.add('mc-homepage-class-tasks-section');
        if (BROOM_ICON_URL) {
            classTasksSection.section.style.setProperty('--mc-class-tasks-broom-icon-url', `url("${BROOM_ICON_URL}")`);
        }
        if (TRASH_ICON_URL) {
            classTasksSection.section.style.setProperty('--mc-class-tasks-trash-icon-url', `url("${TRASH_ICON_URL}")`);
        }
        classTasksSection.body.className = 'mc-homepage-class-tasks-body';

        const classTasksTitleInput = document.createElement('input');
        classTasksTitleInput.type = 'text';
        classTasksTitleInput.className = 'mc-homepage-class-tasks-title-input';
        classTasksTitleInput.hidden = true;
        classTasksTitleInput.maxLength = 60;

        classTasksTitleInput.addEventListener('blur', () => {
            setClassTasksSectionTitleEditing(false);
            setClassTasksSectionTitle(classTasksTitleInput.value);
        });
        classTasksTitleInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                setClassTasksSectionTitleEditing(false);
                setClassTasksSectionTitle(classTasksTitleInput.value);
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                setClassTasksSectionTitleEditing(false);
                classTasksTitleInput.value = classTasksGridState.title;
            }
        });

        const classTasksHeaderActions = document.createElement('div');
        classTasksHeaderActions.className = 'mc-homepage-class-tasks-header-actions';

        const classTasksAddColumnBtn = document.createElement('button');
        classTasksAddColumnBtn.type = 'button';
        classTasksAddColumnBtn.className = 'mc-homepage-class-tasks-add-column-btn';
        classTasksAddColumnBtn.textContent = 'Add column';
        classTasksAddColumnBtn.addEventListener('click', () => addClassTasksColumn());

        const classTasksClearBtn = document.createElement('button');
        classTasksClearBtn.type = 'button';
        classTasksClearBtn.className = 'mc-homepage-class-tasks-add-column-btn mc-homepage-class-tasks-clear-btn';
        classTasksClearBtn.textContent = 'Clear';
        classTasksClearBtn.addEventListener('click', () => clearAllClassTasksCells());

        classTasksSection.header.appendChild(classTasksTitleInput);
        classTasksSection.header.appendChild(classTasksHeaderActions);
        classTasksHeaderActions.appendChild(classTasksClearBtn);
        classTasksHeaderActions.appendChild(classTasksAddColumnBtn);

        const classTasksEmpty = document.createElement('div');
        classTasksEmpty.className = 'mc-homepage-class-tasks-empty';
        classTasksEmpty.textContent = 'No active classes right now.';

        const classTasksGrid = document.createElement('div');
        classTasksGrid.className = 'mc-homepage-class-tasks-grid';

        const classTasksScroll = document.createElement('div');
        classTasksScroll.className = 'mc-homepage-class-tasks-scroll';

        const classTasksGridHeader = document.createElement('div');
        classTasksGridHeader.className = 'mc-homepage-class-tasks-grid-header';

        classTasksSection.body.appendChild(classTasksEmpty);
        classTasksSection.body.appendChild(classTasksScroll);
        classTasksScroll.appendChild(classTasksGridHeader);
        classTasksScroll.appendChild(classTasksGrid);

        const upcomingNav = document.createElement('div');
        upcomingNav.className = 'mc-homepage-upcoming-nav';

        const upcomingControls = document.createElement('div');
        upcomingControls.className = 'mc-homepage-upcoming-controls';

        const prevBtn = document.createElement('button');
        prevBtn.type = 'button';
        prevBtn.className = 'mc-homepage-scroll-btn mc-homepage-scroll-btn-prev';
        prevBtn.setAttribute('aria-label', 'Scroll classes left');
        prevBtn.innerHTML = '<span aria-hidden="true">‹</span>';

        const viewport = document.createElement('div');
        viewport.className = 'mc-homepage-upcoming-viewport';

        const nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.className = 'mc-homepage-scroll-btn mc-homepage-scroll-btn-next';
        nextBtn.setAttribute('aria-label', 'Scroll classes right');
        nextBtn.innerHTML = '<span aria-hidden="true">›</span>';

        upcomingControls.appendChild(prevBtn);
        upcomingControls.appendChild(nextBtn);
        upcomingNav.appendChild(upcomingControls);
        upcomingNav.appendChild(viewport);
        viewport.appendChild(upcomingSection.body);
        upcomingSection.section.appendChild(upcomingNav);

        shell.appendChild(hero);
        shell.appendChild(upcomingSection.section);

        if (shouldInsertShell) {
            const insertionPoint = getHomepageShellInsertionPoint();
            if (insertionPoint && insertionPoint.parentElement) {
                insertionPoint.parentElement.insertBefore(shell, insertionPoint);
            }

            ensureHomepageShellMountedInTarget(shell);
        }

        refs = {
            shell,
            dayLine,
            clock,
            weather,
            upcomingSection: upcomingSection.section,
            upcomingBody: upcomingSection.body,
            classTasksSection: classTasksSection.section,
            classTasksSectionTitle: classTasksSection.title,
            classTasksSectionTitleInput: classTasksTitleInput,
            classTasksScroll,
            classTasksGridHeader,
            classTasksGrid,
            classTasksEmpty,
            classTasksBody: classTasksSection.body,
            upcomingViewport: viewport,
            upcomingControls,
            upcomingPrevBtn: prevBtn,
            upcomingNextBtn: nextBtn
        };

        attachClassTasksSectionToPreferredHost();
        if (shouldInsertShell) {
            startHomepageShellInsertionWatch(shell);
            startHomebarAnchorWatch();
        }

        prevBtn.addEventListener('click', () => scrollUpcoming(-1));
        nextBtn.addEventListener('click', () => scrollUpcoming(1));
        viewport.addEventListener('scroll', syncUpcomingScroller, { passive: true });
    }

    function collectRefs() {
        const shell = document.getElementById(ROOT_ID);
        if (!shell) return null;

        return {
            shell,
            dayLine: shell.querySelector('.mc-homepage-dayline'),
            clock: shell.querySelector('.mc-homepage-clock'),
            weather: shell.querySelector('.mc-homepage-weather'),
            upcomingSection: shell.querySelector('.mc-homepage-section:nth-of-type(2)'),
            upcomingBody: shell.querySelector('.mc-homepage-upcoming-list'),
            classTasksSection: document.querySelector('.mc-homepage-class-tasks-section'),
            classTasksSectionTitleInput: document.querySelector('.mc-homepage-class-tasks-title-input'),
            classTasksScroll: document.querySelector('.mc-homepage-class-tasks-scroll'),
            classTasksGridHeader: document.querySelector('.mc-homepage-class-tasks-grid-header'),
            classTasksGrid: document.querySelector('.mc-homepage-class-tasks-grid'),
            classTasksEmpty: document.querySelector('.mc-homepage-class-tasks-empty'),
            classTasksBody: document.querySelector('.mc-homepage-class-tasks-body'),
            upcomingViewport: shell.querySelector('.mc-homepage-upcoming-viewport'),
            upcomingControls: shell.querySelector('.mc-homepage-upcoming-controls'),
            upcomingPrevBtn: shell.querySelector('.mc-homepage-scroll-btn-prev'),
            upcomingNextBtn: shell.querySelector('.mc-homepage-scroll-btn-next')
        };
    }

    function scrollUpcoming(direction) {
        if (!refs?.upcomingViewport) return;
        const viewport = refs.upcomingViewport;
        const distance = Math.max(280, Math.floor(viewport.clientWidth * 0.8));
        viewport.scrollBy({ left: distance * direction, behavior: 'smooth' });
    }

    function syncUpcomingScroller() {
        if (!refs?.upcomingViewport || !refs?.upcomingPrevBtn || !refs?.upcomingNextBtn) return;
        const viewport = refs.upcomingViewport;
        const canScroll = viewport.scrollWidth > viewport.clientWidth + 2;
        const hasItems = refs.upcomingBody && refs.upcomingBody.children && refs.upcomingBody.children.length > 0;
        const atStart = viewport.scrollLeft <= 4;
        const atEnd = viewport.scrollLeft + viewport.clientWidth >= viewport.scrollWidth - 4;
        // hide controls entirely if there are no items, otherwise only when not scrollable
        refs.upcomingControls.hidden = !hasItems || !canScroll;
        refs.upcomingPrevBtn.hidden = !hasItems || !canScroll || atStart;
        refs.upcomingNextBtn.hidden = !hasItems || !canScroll || atEnd;
        refs.upcomingPrevBtn.disabled = !hasItems || !canScroll || atStart;
        refs.upcomingNextBtn.disabled = !hasItems || !canScroll || atEnd;
        viewport.classList.toggle('mc-homepage-upcoming-viewport-scrollable', canScroll);
    }

    function startTimers() {
        if (clockTimer === null) {
            clockTimer = window.setInterval(renderClock, 1000);
        }

        if (upcomingTimer === null) {
            upcomingTimer = window.setInterval(() => {
                if (!mounted) return;
                renderUpcoming();
                ensureClassesListMounted();
            }, 30000);
        }

        if (weatherTimer === null) {
            weatherTimer = window.setInterval(() => {
                if (!mounted) return;
                renderWeather();
            }, 10 * 60 * 1000);
        }

    }

    function stopTimers() {
        if (clockTimer !== null) {
            window.clearInterval(clockTimer);
            clockTimer = null;
        }

        if (upcomingTimer !== null) {
            window.clearInterval(upcomingTimer);
            upcomingTimer = null;
        }

        if (weatherTimer !== null) {
            window.clearInterval(weatherTimer);
            weatherTimer = null;
        }

    }

    function mount() {
        const homePage = isHomePage();
        const classTasksHost = getClassTasksHostElement();
        if (mounted || (!homePage && !classTasksHost) || !document.body) return;

        mounted = true;
        if (homePage) {
            document.body.classList.add(ACTIVE_CLASS);
            document.body.classList.add('homebar');
        }

        homepageEditState = loadHomepageEditState();
        classTasksGridState = loadClassTasksGridState();

        buildShell(homePage);
        ensureClassTasksRefreshListener();
        ensureClassTasksHostReadyListener();
        if (refs?.shell) {
            refs.shell.hidden = !homePage;
        }
        if (homePage) {
            buildHomepageEditWidget();
            syncHomepageEditUI();
            renderClock();
            renderWeather();
            renderUpcoming();
        }
        syncClassTasksUI();
        setClassTasksActivityEnabled(!!classTasksHost);
        if (homePage) {
            ensureClassesListMounted();
            attachHomebarToNativeClassPanel();
            syncUpcomingScroller();
            startTimers();
        }
    }

    function unmount() {
        if (!mounted) return;

        mounted = false;
        stopTimers();

        const shell = document.getElementById(ROOT_ID);
        if (shell && shell.parentElement) {
            shell.parentElement.removeChild(shell);
        }

        if (refs?.classTasksSection && refs.classTasksSection.parentElement) {
            refs.classTasksSection.parentElement.removeChild(refs.classTasksSection);
        }

        if (editWidget && editWidget.parentElement) {
            editWidget.parentElement.removeChild(editWidget);
        }

        document.removeEventListener('pointerdown', onHomepageEditOutsidePointerDown, true);
        classTasksActivityEnabled = false;
        removeClassTasksRefreshListener();
        removeClassTasksDomObserver();
        editWidget = null;
        editTrigger = null;
        editPanel = null;
        clockToggleBtn = null;
        stopHomepageShellInsertionWatch();
        stopHomebarAnchorWatch();
        scheduleToggleBtn = null;
        temperatureToggleBtn = null;
        temperatureAllowActionBtn = null;
        editWidgetOpen = false;
        document.body.classList.remove(
            'mc-homepage-clock-hidden',
            'mc-homepage-schedule-hidden',
            'mc-homepage-edit-open',
            'mc-homepage-clock-size-small',
            'mc-homepage-clock-size-medium',
            'mc-homepage-clock-size-large',
            'mc-homepage-temperature-hidden'
        );

        homepageInitialRefreshTimeouts.forEach((id) => window.clearTimeout(id));
        homepageInitialRefreshTimeouts = [];

        const indicator = document.querySelector('.home-indicator');
        if (indicator) {
            const anchor = document.querySelector('.mc-homebar-native-anchor');
            if (anchor && indicator.parentElement === anchor) {
                try { document.body.appendChild(indicator); } catch (_) {}
            }
        }

        const anchor = document.querySelector('.mc-homebar-native-anchor');
        if (anchor) {
            try { anchor.remove(); } catch (_) {}
        }

        const title = document.querySelector('.mc-homebar-native-title');
        if (title) {
            try { title.remove(); } catch (_) {}
        }

        try {
            document.body.classList.remove(ACTIVE_CLASS);
            document.body.classList.remove('homebar');
        } catch (_) {}
    }

    function syncState() {
        const shouldEnable = isHomePage();
        const hasClassTasksHost = !!getClassTasksHostElement();

        if (shouldEnable) {
            if (mounted && refs?.shell?.hidden) {
                unmount();
            }
            mount();
            if (mounted) {
                if (refs?.shell) refs.shell.hidden = false;
                document.body.classList.add(ACTIVE_CLASS);
                document.body.classList.add('homebar');
                renderClock();
                renderUpcoming();
                ensureClassesListMounted();
                attachHomebarToNativeClassPanel();
                startHomebarAnchorWatch();
                syncUpcomingScroller();
            }
            return;
        }

        if (hasClassTasksHost) {
            if (mounted && !refs?.shell?.hidden) {
                unmount();
            }
            mount();
            if (mounted) {
                if (refs?.shell) refs.shell.hidden = true;
            }
            return;
        }

        unmount();
    }

    let lastLocationHref = typeof location !== 'undefined' ? String(location.href) : '';

    function scheduleSync() {
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(syncState);
        } else {
            window.setTimeout(syncState, 0);
        }
    }

    function handleRouteChange() {
        const href = typeof location !== 'undefined' ? String(location.href) : '';
        if (href === lastLocationHref) return;
        lastLocationHref = href;
        scheduleSync();
    }

    function patchHistoryNavigation() {
        if (typeof history === 'undefined') return;
        ['pushState', 'replaceState'].forEach((methodName) => {
            const original = history[methodName];
            if (typeof original !== 'function') return;
            history[methodName] = function () {
                const result = original.apply(this, arguments);
                handleRouteChange();
                return result;
            };
        });
    }

    function syncFromStoredEditState() {
        homepageEditState = loadHomepageEditState();
        if (!mounted) return;
        syncHomepageEditUI();
        renderClock();
        renderWeather();
    }

    window.addEventListener('storage', scheduleSync);
    window.addEventListener('mc-homepage-edit-state-changed', syncFromStoredEditState);
    window.addEventListener('popstate', handleRouteChange);
    window.addEventListener('hashchange', handleRouteChange);
    window.addEventListener('resize', () => {
        if (!mounted) return;
        syncUpcomingScroller();
    });

    patchHistoryNavigation();
    ensureClassTasksHostReadyListener();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', syncState, { once: true });
    } else {
        syncState();
    }
})();
