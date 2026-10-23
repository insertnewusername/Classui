(function() {
    const FEATURE_KEY = 'modernClassroom_featureSearch';
    const FEATURE_DEFAULT = true;

    function isFeatureEnabled() {
        try {
            const raw = localStorage.getItem(FEATURE_KEY);
            return raw === null ? FEATURE_DEFAULT : raw !== 'false';
        } catch (_) {
            return FEATURE_DEFAULT;
        }
    }

    if (!isFeatureEnabled()) return;

    const STORAGE_KEY = 'modernClassroom_pageIndex';
    const LEGACY_STORAGE_KEY = 'modernClassroom_pageHistory';
    const SEARCH_SHORTCUT_HINT_KEY = 'modernClassroom_searchShortcutHintDismissed';
    const SEARCH_ONBOARDING_KEY = 'modernClassroom_searchOnboardingDismissed';
    const MAX_ENTRIES = 500;
    const BUTTON_CLASS = 'mc-classroom-search-button';
    const TYPE_ORDER = { Assignment: 0, Question: 1, Material: 2, Topic: 3, 'Classroom page': 4, 'Google Classroom': 5 };

    let panel = null;
    let searchInput = null;
    let folderBackButton = null;
    let settingsButton = null;
    let addButton = null;
    let settingsMenu = null;
    let list = null;
    let backdrop = null;
    let activeResultIndex = -1;
    let searchShortcutHint = null;
    let searchOnboarding = null;
    let clearIndexDialog = null;
    let selectedClassroomFolder = null;
    let classroomNames = new Map();
    let indexingPaused = false;
    let indexCache = null;
    let indexSerialized = null;
    let lastPageSignature = '';
    let collectPagesTimer = null;
    let domChangeObserver = null;

    function cleanText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function escapeRegExp(value) {
        return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function normalizeUrl(url) {
        try {
            const parsed = new URL(url, window.location.origin);
            if (parsed.origin !== 'https://classroom.google.com') return '';
            parsed.hash = '';
            parsed.pathname = parsed.pathname.replace(
                /^(\/u\/\d+)(?:\/u\/\d+)+(?=\/)/,
                '$1'
            );
            const isClassroomPage = /^\/c\/[^/?#]+$/.test(parsed.pathname);
            if (!isClassroomPage) {
                parsed.search = '';
            }
            parsed.pathname = parsed.pathname.replace(/\/$/, '') || '/';
            return parsed.href;
        } catch (_) { return ''; }
    }

    function getCurrentAccountPathPrefix() {
        const match = window.location.pathname.match(/^\/u\/\d+/);
        return match ? match[0] : '';
    }

    function makeAccountAwareUrl(url) {
        try {
            const parsed = new URL(url, window.location.origin);
            if (parsed.origin !== 'https://classroom.google.com') return parsed.href;
            const accountPrefix = getCurrentAccountPathPrefix();
            if (!accountPrefix) return parsed.href;
            const existingAccountPrefix = parsed.pathname.match(/^\/u\/\d+(?=\/)/)?.[0] || '';
            if (existingAccountPrefix === accountPrefix) return parsed.href;
            parsed.pathname = existingAccountPrefix
                ? `${accountPrefix}${parsed.pathname.slice(existingAccountPrefix.length)}`
                : `${accountPrefix}${parsed.pathname}`;
            return parsed.href;
        } catch (_) {
            return url;
        }
    }

    function getEntryDeduplicationKey(url) {
        try {
            const parsed = new URL(normalizeUrl(url) || url, window.location.origin);
            if (parsed.origin !== 'https://classroom.google.com') return parsed.href;
            parsed.pathname = parsed.pathname.replace(/^\/u\/\d+(?=\/)/, '');
            if (/^\/h\/[^/?#]+$/.test(parsed.pathname)) {
                parsed.pathname = '/h';
            }
            return parsed.href;
        } catch (_) {
            return url;
        }
    }

    function getCourseInfo(url = window.location.href) {
        const match = new URL(url, window.location.origin).pathname.match(/\/c\/([^/?#]+)/);
        return { id: match ? match[1] : '', name: match ? `Class ${match[1]}` : 'Google Classroom' };
    }

    function getPageType(url) {
        const path = new URL(url, window.location.origin).pathname;

        if (/^\/(?:u\/\d+\/)?h\/[^/?#]+$/.test(path)) return 'Home page';
        if (/^\/(?:u\/\d+\/)?c\/[^/?#]+$/.test(path)) return 'Classroom page';
        if (/^\/(?:u\/\d+\/)?c\/[^/?#]+\/mc\/[^/?#]+(?:\/details)?$/.test(path)) return 'Question';
        if (/^\/(?:u\/\d+\/)?c\/[^/?#]+\/q\/[^/?#]+(?:\/details)?$/.test(path)) return 'Question';
        if (/^\/(?:u\/\d+\/)?c\/[^/?#]+\/a\/[^/?#]+(?:\/details)?$/.test(path)) return 'Assignment';
        if (/^\/(?:u\/\d+\/)?c\/[^/?#]+\/m\/[^/?#]+(?:\/details)?$/.test(path)) return 'Material';
        if (/^\/(?:u\/\d+\/)?c\/[^/?#]+\/t\/[^/?#]+(?:\/details)?$/.test(path)) return 'Topic';

        return null;
    }

    function cleanClassroomName(value) {
        let cleaned = cleanText(value);
        if (!cleaned) return '';
        cleaned = cleaned.replace(/\s+(Mr|Mrs|Ms|Miss|Dr|Teacher|Teachers)\b.*$/i, '').trim();
        return cleaned;
    }

    function getStoredClassroomNickname(classroomId) {
        const id = cleanText(classroomId);
        if (!id) return '';
        try {
            const raw = localStorage.getItem('titles');
            if (!raw) return '';
            const parsed = JSON.parse(raw);
            const nickname = cleanText(parsed && typeof parsed === 'object' ? parsed[id] : '');
            return nickname || '';
        } catch (_) {
            return '';
        }
    }

    function getClassroomDisplayText(classroomId, fallbackDisplay = '') {
        const id = cleanText(classroomId);
        const fallback = cleanText(fallbackDisplay || '');
        const nickname = getStoredClassroomNickname(id);
        if (nickname) return nickname;
        if (fallback) return fallback;
        if (id) return id;
        return '';
    }

    function getClassroomName(classroomId) {
        if (!classroomId) return '';

        const storedNickname = getStoredClassroomNickname(classroomId);
        if (storedNickname) return storedNickname;

        if (classroomNames.has(classroomId)) return classroomNames.get(classroomId);

        const accountPrefix = getCurrentAccountPathPrefix();
        const link = Array.from(document.querySelectorAll('a[href]')).find(candidate => {
            const href = normalizeUrl(candidate.href);
            if (!href || getCourseInfo(href).id !== classroomId) return false;
            const pathname = new URL(href, window.location.origin).pathname.replace(/\/$/, '') || '/';
            const validPaths = [`/c/${classroomId}`];
            if (accountPrefix) validPaths.push(`${accountPrefix}/c/${classroomId}`);
            return validPaths.includes(pathname);
        });
        const name = cleanClassroomName(link?.getAttribute('aria-label') || link?.textContent);
        if (name) classroomNames.set(classroomId, name);
        return name || '';
    }

    function getSidebarCourseLinks() {
        const sidebar = document.querySelector('.STek2d');
        if (!sidebar) return [];

        const courseLinks = Array.from(sidebar.querySelectorAll('a[href*="/c/"]'));
        return courseLinks.length
            ? courseLinks
            : Array.from(sidebar.querySelectorAll('a[data-id], a[data-course-id]'));
    }

    function getSidebarCourseId(link) {
        const href = normalizeUrl(link.href);
        if (!href) return '';

        const pathname = new URL(href, window.location.origin).pathname.replace(/\/$/, '') || '/';
        const match = pathname.match(/^\/(?:u\/\d+\/)?c\/([^/?#]+)$/);
        return match ? match[1] : '';
    }

    function sanitizeTitle(title) {
        let cleaned = cleanText(title);
        cleaned = cleaned.replace(/^(assignment|material|topic)\s*:\s*/i, '').trim();
        cleaned = cleaned.replace(/\b(?:view|open)\s+(?:material|instructions|assignment|topic)\b\s*[:\-–—|]?\s*/gi, '').trim();
        cleaned = cleaned.replace(/^['"]+|['"]+$/g, '').trim();

        const exactClassroomSuffix = /\s+-\s*Classroom\s*$/i;
        if (exactClassroomSuffix.test(cleaned)) {
            cleaned = cleaned.replace(exactClassroomSuffix, '').trim();
        }

        return cleaned || 'Untitled page';
    }

    function createEntry(url, title, classroom, context, source = 'auto', classroomIdOverride = '', typeOverride = '') {
        const course = getCourseInfo(url);
        const type = typeOverride || getPageType(url) || (source === 'manual' ? 'Other' : null);
        const resolvedClassroomId = cleanText(classroomIdOverride || course.id || '');
        const resolvedClassroom = cleanText(classroom) || getClassroomName(resolvedClassroomId) || resolvedClassroomId || '';
        const resolvedContext = cleanText(context);
        const fallbackTitle = type === 'Classroom page'
            ? cleanText(resolvedClassroom || 'Classroom')
            : 'Untitled page';
        const normalizedTitle = cleanText(title || '');
        const resolvedTitle = type === 'Classroom page'
            ? (cleanText(resolvedClassroom) || normalizedTitle || fallbackTitle || 'Untitled page')
            : (normalizedTitle || fallbackTitle || 'Untitled page');

        return {
            url,
            key: getEntryDeduplicationKey(url),
            title: resolvedTitle,
            alias: '',
            type,
            classroomId: resolvedClassroomId,
            classroom: resolvedClassroom,
            context: resolvedContext,
            source
        };
    }

    function getCurrentPageTitle() {
        const candidates = [
            cleanText(document.title),
            cleanText(document.querySelector('h1, h2, [role="heading"]')?.textContent || ''),
            cleanText(document.querySelector('title')?.textContent || '')
        ].filter(Boolean);

        for (const candidate of candidates) {
            const cleaned = sanitizeTitle(candidate);
            if (cleaned && cleaned !== 'Untitled page') return cleaned;
        }

        return 'Untitled page';
    }

    function normalizeEntry(entry) {
        if (!entry || typeof entry.url !== 'string') return null;
        const url = normalizeUrl(entry.url);
        if (!url) return null;
        const course = getCourseInfo(url);
        const source = entry.source === 'manual' ? 'manual' : 'auto';
        const storedManualType = entry.type === 'Assignment' || entry.type === 'Material' || entry.type === 'Other'
            ? entry.type
            : '';
        const type = source === 'manual'
            ? (storedManualType || getPageType(url) || 'Other')
            : getPageType(url);
        if (!type) return null;
        const classroomId = cleanText(entry.classroomId || course.id || '');
        const rawClassroom = cleanText(entry.classroom || '');
        const classroom = getClassroomName(classroomId) || rawClassroom || classroomId || '';
        const context = cleanText(entry.context || entry.description || '');

        const rawTitle = cleanText(entry.title || '');
        const fallbackTitle = type === 'Classroom page'
            ? cleanText(classroom || 'Classroom')
            : 'Untitled page';
        const title = type === 'Classroom page'
            ? (classroom || rawTitle || fallbackTitle || 'Untitled page')
            : (rawTitle || fallbackTitle || 'Untitled page');

        return {
            ...createEntry(url, title, classroom, context, source, classroomId, type),
            alias: cleanText(entry.alias || '')
        };
    }

    function collectSidebarClassEntries() {
        const seen = new Set();
        const entries = [];

        getSidebarCourseLinks().forEach((link) => {
            const href = normalizeUrl(link.href);
            const resolvedClassroomId = getSidebarCourseId(link);
            if (!resolvedClassroomId) return;

            if (!href) return;
            if (seen.has(resolvedClassroomId)) return;
            seen.add(resolvedClassroomId);

            const classroom = getClassroomDisplayText(
                resolvedClassroomId,
                cleanClassroomName(link.getAttribute('aria-label') || link.textContent)
            );

            entries.push(createEntry(
                href,
                classroom || `Class ${resolvedClassroomId}`,
                classroom,
                '',
                'auto',
                resolvedClassroomId
            ));
        });

        return entries;
    }

    function deduplicateEntries(entries) {
        const byKey = new Map();
        entries.forEach((entry) => {
            const key = getEntryDeduplicationKey(entry.url);
            const previous = byKey.get(key);
            if (!previous || entry.context.length > previous.context.length) byKey.set(key, entry);
        });
        return Array.from(byKey.values());
    }

    function saveIndex(entries) {
        const nextIndex = deduplicateEntries(entries).slice(0, MAX_ENTRIES);
        indexCache = nextIndex;
        try {
            const serialized = JSON.stringify(nextIndex);
            if (indexSerialized !== serialized) {
                localStorage.setItem(STORAGE_KEY, serialized);
                indexSerialized = serialized;
            }
        } catch (_) {}
    }

    function removeEntryFromIndex(url) {
        const normalizedUrl = normalizeUrl(url);
        if (!normalizedUrl) return;

        const nextEntries = readIndex().filter(entry => entry.url !== normalizedUrl);
        saveIndex(nextEntries);

        if (panel?.classList.contains('is-open')) {
            renderResults(searchInput?.value || '');
        }
    }

    function sortIndex(entries) {
        return entries.sort((left, right) => {
            const typeDifference = (TYPE_ORDER[left.type] ?? 99) - (TYPE_ORDER[right.type] ?? 99);
            if (typeDifference) return typeDifference;
            return left.classroom.localeCompare(right.classroom) || left.title.localeCompare(right.title);
        });
    }

    function readIndex() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY) || '[]';
            const values = JSON.parse(raw);
            const entries = (Array.isArray(values) ? values : [])
                .map(value => normalizeEntry(value))
                .filter(Boolean);
            const index = sortIndex(deduplicateEntries(entries)).slice(0, MAX_ENTRIES);
            saveIndex(index);
            return index;
        } catch (_) {
            return indexCache || [];
        }
    }

    function mergeIntoIndex(entries) {
        const currentIndex = readIndex();
        const normalizedEntries = entries
            .map(entry => normalizeEntry(entry))
            .filter(Boolean);
        const currentUrls = new Set(normalizedEntries.map(entry => entry.url));

        const filteredIndex = currentIndex.filter(entry => {
            if (entry.source === 'manual') return true;
            if (entry.type === 'Classroom page') return currentUrls.has(entry.url);
            return true;
        });

        const byKey = new Map();
        filteredIndex.forEach(entry => byKey.set(entry.key, entry));
        let changed = filteredIndex.length !== currentIndex.length;

        normalizedEntries.forEach(entry => {
            const key = entry.key;
            const previous = byKey.get(key);
            const merged = previous
                ? {
                    ...previous,
                    ...entry,
                    title: previous.source === 'manual' && previous.url === entry.url ? entry.title : previous.title,
                    type: previous.source === 'manual' && previous.url === entry.url ? previous.type : entry.type,
                    classroom: previous.classroom || entry.classroom,
                    classroomId: previous.classroomId || entry.classroomId,
                    source: previous.source === 'manual' && previous.url === entry.url ? previous.source : entry.source,
                    context: entry.context || previous.context || '',
                    alias: previous.alias || entry.alias || ''
                }
                : entry;
            if (JSON.stringify(previous) !== JSON.stringify(merged)) {
                byKey.set(key, merged);
                changed = true;
            }
        });

        if (changed) saveIndex(sortIndex(Array.from(byKey.values())).slice(0, MAX_ENTRIES));
    }

    function getSidebarSignature() {
        return getSidebarCourseLinks()
            .map(link => {
                const href = normalizeUrl(link.href);
                const classroomId = getSidebarCourseId(link);
                const title = cleanText(link.getAttribute('aria-label') || link.textContent || '');
                return `${classroomId}|${href}|${title}`;
            })
            .filter(Boolean)
            .sort()
            .join('||');
    }

    function collectVisiblePages() {
        if (indexingPaused) return false;
        classroomNames = new Map();
        const entries = [];
        const currentUrl = normalizeUrl(window.location.href);
        const pageSignature = `${currentUrl}|${document.title}|${getSidebarSignature()}`;
        if (pageSignature === lastPageSignature) return false;
        lastPageSignature = pageSignature;
        if (currentUrl) {
            const currentType = getPageType(currentUrl);
            const currentCourse = getCourseInfo(currentUrl);
            const sidebarClassIds = new Set(getSidebarCourseLinks().map(getSidebarCourseId).filter(Boolean));
            if (currentType && (!currentCourse.id || sidebarClassIds.has(currentCourse.id))) {
                const classroom = getClassroomName(currentCourse.id);
                const title = getCurrentPageTitle();
                entries.push(createEntry(currentUrl, title, classroom, ''));
            }
        }

        entries.push(...collectSidebarClassEntries());

        mergeIntoIndex(entries);
        return true;
    }

    function clearIndex() {
        indexingPaused = true;
        try {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(LEGACY_STORAGE_KEY);
        } catch (_) {}
        indexCache = [];
        indexSerialized = '[]';
        selectedClassroomFolder = null;

        const currentUrl = normalizeUrl(window.location.href);
        const links = Array.from(document.querySelectorAll('a[href]'));
        lastPageSignature = `${currentUrl}|${document.title}|${links.map(link => `${link.href}|${link.getAttribute('aria-label') || ''}|${link.getAttribute('title') || ''}|${cleanText(link.textContent)}`).join('||')}`;

        activeResultIndex = -1;
        if (list) {
            list.replaceChildren();
            const empty = document.createElement('div');
            empty.className = 'mc-classroom-search-empty';
            empty.textContent = 'As you use classroom, the places you visit will show up here, allowing you to quickly search for everything in a class, or a specific material/assignment. Everything is stored locally on your device';
            list.appendChild(empty);
        }
        renderResults(searchInput?.value || '');
    }

    function closeClearIndexDialog() {
        if (clearIndexDialog?.parentElement) {
            clearIndexDialog.remove();
        }
        clearIndexDialog = null;
    }

    function requestClearIndex() {
        if (!document.body) return;

        closeClearIndexDialog();

        const backdrop = document.createElement('div');
        backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(15,17,23,0.46);z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:20px;';

        const modal = document.createElement('div');
        modal.className = 'mc-classroom-search-clearindexcontainer';
        modal.style.cssText = 'width:min(440px,calc(100vw - 32px));border-radius:40px;corner-shape:squircle;padding:22px 20px 18px;';

        const title = document.createElement('h3');
        title.textContent = 'Clear search index?';
        title.style.cssText = 'margin:0 0 8px;font-size:20px;line-height:1.2;';

        const message = document.createElement('p');
        message.className = 'mc-classroom-search-clearindexcontainer-subtext';
        message.textContent = 'This will delete all entries for indexed assignments, materials, and other items. This will require you to visit these pages again to make them searchable.';
        message.style.cssText = 'margin:0 0 18px;color:#4f556b;font-size:14px;line-height:1.45;';

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;justify-content:flex-end;gap:10px;';

        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.textContent = 'Cancel';
        cancel.style.cssText = 'flex:1;border:1px solid #d6d9ea;border-radius:10px;background:#f4f6fb;color:#2d3345;padding:9px 14px;font-size:14px;cursor:pointer;';
        cancel.addEventListener('click', closeClearIndexDialog);

        const confirm = document.createElement('button');
        confirm.type = 'button';
        confirm.textContent = 'Clear my index';
        confirm.style.cssText = 'flex:1;border:none;border-radius:10px;background:#d13030;color:#fff;padding:9px 14px;font-size:14px;cursor:pointer;';
        confirm.addEventListener('click', () => {
            clearIndex();
            closeClearIndexDialog();
            setSettingsOpen(false);
        });

        actions.append(cancel, confirm);
        modal.append(title, message, actions);
        backdrop.appendChild(modal);
        backdrop.addEventListener('click', (event) => {
            if (event.target === backdrop) closeClearIndexDialog();
        });
        document.body.appendChild(backdrop);
        clearIndexDialog = backdrop;
    }

    function getClassroomSidebarIcon(classroomId) {
        const id = cleanText(classroomId || '');
        if (!id) return null;

        let sidebarLink = null;
        const exactCourseLinks = Array.from(document.querySelectorAll(`a[href*="/c/${id}"]`));
        const dataIdLinks = Array.from(document.querySelectorAll(`a[data-id="${id}"], a[data-course-id="${id}"]`));

        sidebarLink = [
            ...exactCourseLinks.filter(link => link.getAttribute('aria-current') === 'page' || link.getAttribute('aria-current') === 'true'),
            ...dataIdLinks,
            ...exactCourseLinks,
            ...Array.from(document.querySelectorAll('a[href]'))
        ].find(link => {
            const dataId = cleanText(link.dataset.id || link.dataset.courseId || '');
            if (dataId === id) return true;

            const href = normalizeUrl(link.href);
            if (!href) return false;
            const pathname = new URL(href, window.location.origin).pathname;
            return new RegExp(`^/(?:u/\\d+/)?c/${escapeRegExp(id)}(?:/|$)`).test(pathname);
        });

        if (!sidebarLink) return null;

        const icon = sidebarLink.querySelector('.kWQ5wd') || sidebarLink;
        const computed = icon instanceof HTMLElement ? getComputedStyle(icon) : null;
        const maskUrl = (computed && computed.getPropertyValue('--dna-icon-url').trim()) || '';

        if (!maskUrl) return null;

        const generatedIcon = document.createElement('span');
        generatedIcon.className = 'mc-classroom-search-result-icon';
        generatedIcon.setAttribute('aria-hidden', 'true');

        const color = (computed && computed.getPropertyValue('--dna-icon-color').trim())
            || (computed && computed.backgroundColor && computed.backgroundColor !== 'rgba(0, 0, 0, 0)' ? computed.backgroundColor : '')
            || '#9aa4c6';

        generatedIcon.style.backgroundColor = color;
        generatedIcon.style.borderRadius = '50%';
        generatedIcon.style.width = '18px';
        generatedIcon.style.height = '18px';
        generatedIcon.style.flexShrink = '0';

        generatedIcon.style.webkitMaskImage = maskUrl;
        generatedIcon.style.maskImage = maskUrl;
        generatedIcon.style.webkitMaskRepeat = 'no-repeat';
        generatedIcon.style.maskRepeat = 'no-repeat';
        generatedIcon.style.webkitMaskSize = 'contain';
        generatedIcon.style.maskSize = 'contain';
        generatedIcon.style.webkitMaskPosition = 'center';
        generatedIcon.style.maskPosition = 'center';

        return generatedIcon;
    }

    function getEntryClassroomKey(entry) {
        const classroomId = cleanText(entry.classroomId || '');
        const classroom = getClassroomDisplayText(
            classroomId || entry.classroom,
            entry.classroom || classroomId
        ).toLocaleLowerCase();
        return classroom ? `name:${classroom}` : '';
    }

    function getClassroomFolders(entries) {
        const folders = new Map();
        entries.forEach(entry => {
            const key = getEntryClassroomKey(entry);
            if (!key) return;

            const classroomId = cleanText(entry.classroomId || '');
            const name = getClassroomDisplayText(
                classroomId || entry.classroom,
                entry.classroom || entry.title
            );
            const existing = folders.get(key);
            if (!existing || (entry.type === 'Classroom page' && existing.name !== name)) {
                folders.set(key, { key, name, classroomId });
            }
        });
        return Array.from(folders.values()).sort((left, right) => left.name.localeCompare(right.name));
    }

    function updateClassroomFolderNav() {
        if (!folderBackButton) return;
        folderBackButton.classList.toggle('is-folder-back', Boolean(selectedClassroomFolder));
        folderBackButton.setAttribute(
            'aria-label',
            selectedClassroomFolder ? 'Back to all classes' : 'Search'
        );
        folderBackButton.title = selectedClassroomFolder ? 'Back to all classes' : 'Search';
        folderBackButton.textContent = selectedClassroomFolder ? '←' : '';
        if (searchInput) {
            searchInput.placeholder = selectedClassroomFolder
                ? `Search ${selectedClassroomFolder.name}...`
                : 'Search Google Classroom...';
        }
    }

    function exitClassroomFolder() {
        if (!selectedClassroomFolder) return false;
        selectedClassroomFolder = null;
        activeResultIndex = -1;
        renderResults(searchInput?.value || '');
        return true;
    }

    function matchesSearchQuery(entry, normalizedQuery) {
        if (!normalizedQuery) return true;

        const tokens = normalizedQuery
            .split(/\s+/)
            .map(token => token.replace(/[^a-z0-9]/gi, ''))
            .filter(Boolean);

        if (!tokens.length) return true;

        const haystack = `${entry.title} ${entry.alias} ${entry.classroom} ${entry.type} ${entry.context}`.toLowerCase();
        const normalizedHaystack = haystack.replace(/[^a-z0-9\s]/gi, ' ');

        if (tokens.every(token => normalizedHaystack.includes(token))) {
            return true;
        }

        const titleTokens = `${entry.title} ${entry.classroom}`.toLowerCase().replace(/[^a-z0-9\s]/gi, ' ').split(/\s+/).filter(Boolean);
        return tokens.every(token => titleTokens.some(titleToken => titleToken.includes(token)));
    }

    function renderResults(query) {
        if (!list) return;
        const normalizedQuery = query.trim().toLowerCase();
        const entries = readIndex().map(entry => {
            const displayClassroom = getClassroomDisplayText(entry.classroomId || entry.classroom, entry.classroom);
            return {
                ...entry,
                classroom: displayClassroom
            };
        });
        updateClassroomFolderNav();
        list.replaceChildren();
        if (!selectedClassroomFolder && !normalizedQuery) {
            const folders = getClassroomFolders(entries);
            folders.forEach(folder => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'mc-classroom-search-result mc-classroom-search-folder';
                button.setAttribute('aria-label', `View all items in ${folder.name}`);
                button.addEventListener('click', () => {
                    selectedClassroomFolder = folder;
                    activeResultIndex = -1;
                    renderResults(searchInput?.value || '');
                    searchInput?.focus();
                });

                const icon = folder.classroomId ? getClassroomSidebarIcon(folder.classroomId) : null;
                if (icon) button.appendChild(icon);

                const text = document.createElement('div');
                text.className = 'mc-classroom-search-result-text';
                const title = document.createElement('strong');
                title.textContent = folder.name;
                text.appendChild(title);

                const savedCount = entries.filter(entry =>
                    getEntryClassroomKey(entry) === folder.key && entry.type !== 'Classroom page'
                ).length;
                const subtext = document.createElement('small');
                subtext.className = 'mc-classroom-search-folder-count';
                subtext.textContent = `${savedCount} ${savedCount === 1 ? 'item' : 'items'} saved`;
                text.appendChild(subtext);

                const viewAll = document.createElement('span');
                viewAll.className = 'mc-classroom-search-folder-view-all';
                viewAll.textContent = 'View all →';
                button.append(text, viewAll);
                list.appendChild(button);
            });
        }

        const filteredResults = entries.filter(entry => {
            if (!matchesSearchQuery(entry, normalizedQuery)) return false;
            if (selectedClassroomFolder) {
                return getEntryClassroomKey(entry) === selectedClassroomFolder.key;
            }
            if (!normalizedQuery) return !getEntryClassroomKey(entry);
            return true;
        }).sort((left, right) => {
            if (left.type === 'Classroom page' && right.type !== 'Classroom page') return -1;
            if (left.type !== 'Classroom page' && right.type === 'Classroom page') return 1;
            return 0;
        });

        filteredResults.forEach(entry => {
            const link = document.createElement('a');
            link.className = 'mc-classroom-search-result';
            link.href = makeAccountAwareUrl(entry.url);
            link.addEventListener('click', () => setPanelOpen(false));

            const icon = getClassroomSidebarIcon(entry.classroomId || entry.classroom);
            if (icon) link.appendChild(icon);

            const text = document.createElement('div');
            text.className = 'mc-classroom-search-result-text';

            const title = document.createElement('strong');
            title.textContent = entry.title;
            text.appendChild(title);
            if (entry.type !== 'Classroom page') {
                const meta = document.createElement('span');
                meta.textContent = entry.classroom;
                text.appendChild(meta);
            }
            if (entry.context && entry.type !== 'Classroom page') {
                const context = document.createElement('small');
                context.textContent = entry.context;
                text.appendChild(context);
            }

            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.className = 'mc-classroom-search-result-remove';
            removeButton.setAttribute('aria-label', `Remove ${entry.title} from search index`);
            removeButton.title = 'Remove from index';
            removeButton.textContent = '×';
            removeButton.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                removeEntryFromIndex(entry.url);
            });

            let aliasInput = null;
            const addAliasInput = () => {
                if (aliasInput) return;

                aliasInput = document.createElement('input');
                aliasInput.type = 'text';
                aliasInput.className = 'mc-classroom-search-result-alias';
                aliasInput.placeholder = 'alias';
                aliasInput.value = entry.alias || '';
                aliasInput.setAttribute('aria-label', `Alias for ${entry.title}`);
                aliasInput.addEventListener('click', event => {
                    event.preventDefault();
                    event.stopPropagation();
                });
                aliasInput.addEventListener('keydown', event => event.stopPropagation());
                aliasInput.addEventListener('input', () => {
                    const currentEntries = readIndex();
                    const currentEntry = currentEntries.find(candidate => candidate.url === entry.url);
                    if (!currentEntry) return;
                    currentEntry.alias = cleanText(aliasInput.value);
                    entry.alias = currentEntry.alias;
                    saveIndex(currentEntries);
                });
                link.insertBefore(aliasInput, removeButton);
            };
            link.addEventListener('mouseenter', addAliasInput);
            link.addEventListener('mouseleave', () => {
                aliasInput?.remove();
                aliasInput = null;
            });

            link.append(text, removeButton);
            list.appendChild(link);
        });

        if (!list.childElementCount) {
            const empty = document.createElement('div');
            empty.className = 'mc-classroom-search-empty';
            empty.textContent = normalizedQuery || selectedClassroomFolder
                ? 'No indexed results were found'
                : 'No indexed items yet';
            list.appendChild(empty);
        }
        const resultCount = list.querySelectorAll('.mc-classroom-search-result').length;
        activeResultIndex = resultCount ? 0 : -1;
        updateActiveResult();
    }

    function getResultLinks() {
        return Array.from(list?.querySelectorAll('.mc-classroom-search-result') || []);
    }

    function updateActiveResult() {
        const links = getResultLinks();
        links.forEach((link, index) => {
            const isActive = index === activeResultIndex;
            link.classList.toggle('is-keyboard-active', isActive);
            link.setAttribute('aria-selected', String(isActive));
        });
    }

    function handleSearchKeydown(event) {
        const links = getResultLinks();
        if (!links.length) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const direction = event.key === 'ArrowDown' ? 1 : -1;
            activeResultIndex = (activeResultIndex + direction + links.length) % links.length;
            updateActiveResult();
            links[activeResultIndex].scrollIntoView({ block: 'nearest' });
        } else if (event.key === 'Enter' && activeResultIndex >= 0) {
            event.preventDefault();
            links[activeResultIndex].click();
        }
    }

    let closeListTimer = null;

    function setPanelOpen(isOpen) {
        if (!isOpen && closeListTimer) {
            clearTimeout(closeListTimer);
        }

        panel.classList.toggle('is-open', isOpen);
        backdrop.classList.toggle('is-open', isOpen);
        panel.setAttribute('aria-hidden', String(!isOpen));
        document.querySelector(`.${BUTTON_CLASS}`)?.setAttribute('aria-expanded', String(isOpen));
        setSettingsOpen(false);
        if (isOpen) {
            selectedClassroomFolder = null;
            searchInput.value = '';
            collectVisiblePages();
            syncSearchOnboardingState();
            if (!hasSeenSearchOnboarding()) {
                requestAnimationFrame(() => {
                    const onboardingButton = panel.querySelector('.mc-classroom-search-onboarding-button');
                    onboardingButton?.focus();
                });
            } else {
                renderResults(searchInput.value);
                requestAnimationFrame(() => searchInput.focus());
            }
        } else {
            activeResultIndex = -1;
            closeListTimer = setTimeout(() => {
                list?.replaceChildren();
            }, 200);
        }
    }

    function updateSearchIndexSummary() {
        const countButton = settingsMenu?.querySelector('.mc-classroom-search-index-count');
        if (!countButton) return;
        const total = readIndex().length;
        countButton.textContent = `${total} / 500 items indexed`;
    }

    function setSettingsOpen(isOpen) {
        settingsMenu?.classList.toggle('is-open', isOpen);
        settingsButton?.setAttribute('aria-expanded', String(isOpen));
        settingsMenu?.setAttribute('aria-hidden', String(!isOpen));
        list?.classList.toggle('is-hidden', isOpen);
        if (isOpen) updateSearchIndexSummary();
    }

    function getLinkedClassroomOptions() {
        const entries = readIndex();
        const options = [];
        const seen = new Set();

        entries.forEach((entry) => {
            const classroomId = cleanText(entry.classroomId || '');
            const label = getClassroomDisplayText(classroomId, entry.classroom);
            if (!classroomId && !label) return;
            const key = classroomId || label;
            if (seen.has(key)) return;
            seen.add(key);
            options.push({
                label,
                value: classroomId || label,
                classroomId,
                classroom: label
            });
        });

        return options;
    }

    function renderAddEntryForm() {
        if (!list) return;

        list.classList.remove('is-hidden');
        list.replaceChildren();
        setSettingsOpen(false);

        const form = document.createElement('form');
        form.className = 'mc-classroom-search-add-form';

        const titleField = document.createElement('label');
        titleField.className = 'mc-classroom-search-add-field';
        titleField.innerHTML = `
            <input type="text" name="title" required placeholder="Title">
        `;

        const classroomField = document.createElement('label');
        classroomField.className = 'mc-classroom-search-add-field';
        classroomField.innerHTML = `
            <div class="mc-classroom-search-select-wrap">
                <select name="classroom">
                    <option value=""></option>
                </select>
                <span class="mc-classroom-search-select-placeholder" aria-hidden="true">Related Classroom (Optional)</span>
            </div>
        `;

        const classroomSelect = classroomField.querySelector('select');
        const selectWrap = classroomField.querySelector('.mc-classroom-search-select-wrap');
        const syncClassroomPlaceholder = () => {
            selectWrap.classList.toggle('has-value', Boolean(classroomSelect.value));
        };
        classroomSelect.addEventListener('change', syncClassroomPlaceholder);
        syncClassroomPlaceholder();

        getLinkedClassroomOptions().forEach((option) => {
            const optionEl = document.createElement('option');
            optionEl.value = option.value;
            optionEl.textContent = option.label;
            optionEl.dataset.classroom = option.classroom;
            optionEl.dataset.classroomId = option.classroomId;
            classroomSelect.appendChild(optionEl);
        });

        const typeField = document.createElement('label');
        typeField.className = 'mc-classroom-search-add-field';
        typeField.innerHTML = `
            <div class="mc-classroom-search-select-wrap">
                <select name="type" required>
                    <option value=""></option>
                    <option value="Assignment">Assignment</option>
                    <option value="Material">Materials</option>
                    <option value="Other">Other</option>
                </select>
                <span class="mc-classroom-search-select-placeholder" aria-hidden="true">Type</span>
            </div>
        `;

        const typeSelect = typeField.querySelector('select');
        const typeSelectWrap = typeField.querySelector('.mc-classroom-search-select-wrap');
        const syncTypePlaceholder = () => {
            typeSelectWrap.classList.toggle('has-value', Boolean(typeSelect.value));
        };
        typeSelect.addEventListener('change', syncTypePlaceholder);
        syncTypePlaceholder();

        const urlField = document.createElement('label');
        urlField.className = 'mc-classroom-search-add-field';
        urlField.innerHTML = `
            <input type="url" name="url" required placeholder="URL">
        `;

        const actions = document.createElement('div');
        actions.className = 'mc-classroom-search-add-actions';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'mc-classroom-search-add-cancel';
        cancelBtn.textContent = '⮐';
        cancelBtn.addEventListener('click', () => {
            renderResults(searchInput?.value || '');
            setSettingsOpen(false);
        });

        const saveBtn = document.createElement('button');
        saveBtn.type = 'submit';
        saveBtn.className = 'mc-classroom-search-add-save';
        saveBtn.textContent = '+';

        actions.appendChild(cancelBtn);
        actions.appendChild(saveBtn);

        form.appendChild(titleField);
        form.appendChild(classroomField);
        form.appendChild(typeField);
        form.appendChild(urlField);
        form.appendChild(actions);

        form.addEventListener('submit', (event) => {
            event.preventDefault();
            const formData = new FormData(form);
            const title = cleanText(formData.get('title'));
            const url = cleanText(formData.get('url'));
            const type = cleanText(formData.get('type'));
            const selectedOption = classroomSelect.selectedOptions[0];
            const classroomValue = selectedOption && selectedOption.value ? selectedOption.dataset.classroom || selectedOption.textContent : '';
            const classroomId = selectedOption && selectedOption.dataset.classroomId ? selectedOption.dataset.classroomId : '';

            if (!title || !url || !type) {
                return;
            }

            const candidateUrl = makeAccountAwareUrl(url);
            const entry = createEntry(candidateUrl, title, classroomValue, '', 'manual', '', type);
            if (classroomValue) {
                entry.classroom = classroomValue;
                entry.classroomId = classroomId;
            }

            const entries = readIndex();
            const nextEntries = [entry, ...entries.filter((existing) => existing.url !== candidateUrl && existing.title !== title)];
            saveIndex(sortIndex(nextEntries).slice(0, MAX_ENTRIES));
            renderResults(searchInput?.value || '');
            setSettingsOpen(false);
        });

        list.appendChild(form);
    }

    function hasSeenSearchOnboarding() {
        try {
            return localStorage.getItem(SEARCH_ONBOARDING_KEY) === 'true';
        } catch (_) {
            return false;
        }
    }

    function setSearchOnboardingSeen() {
        try { localStorage.setItem(SEARCH_ONBOARDING_KEY, 'true'); } catch (_) {}
    }

    function syncSearchOnboardingState() {
        if (!panel || !searchInput || !list) return;
        const field = panel.querySelector('.mc-classroom-search-field');
        const onboardingVisible = !hasSeenSearchOnboarding();

        if (field) {
            field.style.display = onboardingVisible ? 'none' : '';
        }

        list.classList.toggle('is-hidden', onboardingVisible);
        list.style.display = onboardingVisible ? 'none' : '';

        if (onboardingVisible) {
            if (!searchOnboarding) {
                searchOnboarding = document.createElement('div');
                searchOnboarding.className = 'mc-classroom-search-onboarding';

                const message = document.createElement('div');
                message.className = 'mc-classroom-search-onboarding-message';
                message.innerHTML = 'As you use classroom, the places you visit will show up here.<br>This makes it easy to find classes, materials, or assignments right when you need them.<br>-Everything happens on your device, without any AI-';

                const subtext = document.createElement('div');
                subtext.className = 'mc-classroom-search-onboarding-subtext';
                subtext.innerHTML = '~ Search is smart and intuitive ~<br>You can search using partial phrasing, meaning if you wanted to find your English essay on poetry from your friday classroom, you can simply type:<br>"eng poet fri", or you could try: "assignment english po"';

                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'mc-classroom-search-onboarding-button';
                button.textContent = 'Start Searching';
                button.addEventListener('click', () => {
                    setSearchOnboardingSeen();
                    syncSearchOnboardingState();
                    renderResults(searchInput.value || '');
                    requestAnimationFrame(() => searchInput.focus());
                });

                searchOnboarding.appendChild(message);
                searchOnboarding.appendChild(subtext);
                searchOnboarding.appendChild(button);
            }

            searchOnboarding.style.display = 'flex';
            if (!searchOnboarding.parentElement) {
                panel.appendChild(searchOnboarding);
            }
        } else if (searchOnboarding) {
            searchOnboarding.style.display = 'none';
            searchOnboarding.remove();
            searchOnboarding = null;
        }
    }

    function dismissSearchShortcutHint() {
        if (searchShortcutHint) {
            searchShortcutHint.style.display = 'none';
            searchShortcutHint.hidden = true;
        }
        try { localStorage.setItem(SEARCH_SHORTCUT_HINT_KEY, 'true'); } catch (_) {}
    }

    function ensureSearchShortcutHint() {
        if (!document.body) return null;
        if (searchShortcutHint && searchShortcutHint.parentElement) return searchShortcutHint;

        const hint = document.createElement('div');
        hint.className = 'mc-classroom-search-shortcut-hint';
        hint.textContent = 'Shift + S';
        hint.style.cssText = 'position:fixed;left:50%;bottom:46px;transform:translateX(-50%);z-index:10003;padding:4px 8px;background:transparent;border:none;font-size:10px;line-height:1;letter-spacing:0.04em;text-transform:capitalize;color:rgba(95,98,120,0.85);pointer-events:none;user-select:none;';

        try {
            const dismissed = localStorage.getItem(SEARCH_SHORTCUT_HINT_KEY) === 'true';
            if (dismissed) hint.style.display = 'none';
        } catch (_) {}

        document.body.appendChild(hint);
        searchShortcutHint = hint;
        return hint;
    }

    function createSearchUI() {
        if (document.querySelector(`.${BUTTON_CLASS}`)) return;
        const button = document.createElement('button');
        button.className = BUTTON_CLASS;
        button.type = 'button';
        button.setAttribute('aria-label', 'Search Classroom');
        button.setAttribute('aria-expanded', 'false');
        button.title = 'Search Classroom';
        button.innerHTML = '<span class="mc-classroom-search-button-icon" aria-hidden="true"></span><span class="mc-classroom-search-button-label">Search</span>';
        button.querySelector('.mc-classroom-search-button-icon').style.setProperty('--mc-classroom-search-icon-url', `url("${chrome.runtime.getURL('Icons/globalsearch.svg')}")`);
        button.addEventListener('click', () => setPanelOpen(!panel.classList.contains('is-open')));
        backdrop = document.createElement('div');
        backdrop.className = 'mc-classroom-search-backdrop';
        backdrop.addEventListener('click', () => setPanelOpen(false));
        panel = document.createElement('section');
        panel.className = 'mc-classroom-search-panel';
        panel.setAttribute('aria-hidden', 'true');
        panel.innerHTML = `<div class="mc-classroom-search-field"><button type="button" class="mc-classroom-search-icon" aria-label="Search" title="Search"></button><input type="search" placeholder="Search Google Classroom..." autocomplete="off"><div class="mc-classroom-search-actions"><button type="button" class="mc-classroom-search-add" aria-label="Add search entry">+</button><button type="button" class="mc-classroom-search-settings" aria-label="Search settings" aria-expanded="false"><span aria-hidden="true">⚙</span></button></div></div><div class="mc-classroom-search-settings-menu" aria-hidden="true"><button type="button" class="mc-classroom-search-index-count" disabled aria-live="polite">0 items indexed</button><button type="button" class="mc-classroom-search-clear">Clear Index</button><p>Clearing your index will remove all saved assignments, materials, and other pages from search. You will need to visit each assignment/materials page again for them to appear in search. If you have previously exported a backup of your classroom, you can restore your index by importing that file.</p></div><div class="mc-classroom-search-list"></div>`;
        searchInput = panel.querySelector('input');
        folderBackButton = panel.querySelector('.mc-classroom-search-icon');
        folderBackButton.style.setProperty(
            '--mc-classroom-search-icon-url',
            `url("${chrome.runtime.getURL('Icons/globalsearch.svg')}")`
        );
        folderBackButton.addEventListener('click', () => {
            if (exitClassroomFolder()) searchInput?.focus();
        });
        settingsButton = panel.querySelector('.mc-classroom-search-settings');
        addButton = panel.querySelector('.mc-classroom-search-add');
        settingsMenu = panel.querySelector('.mc-classroom-search-settings-menu');
        list = panel.querySelector('.mc-classroom-search-list');
        updateSearchIndexSummary();
        panel.querySelector('.mc-classroom-search-clear').addEventListener('click', () => {
            requestClearIndex();
            setSettingsOpen(false);
        });
        settingsButton.addEventListener('click', event => {
            event.stopPropagation();
            setSettingsOpen(!settingsMenu.classList.contains('is-open'));
        });
        addButton.addEventListener('click', event => {
            event.stopPropagation();
            if (list.querySelector('.mc-classroom-search-add-form')) {
                renderResults(searchInput?.value || '');
                return;
            }
            renderAddEntryForm();
        });
        searchInput.addEventListener('input', () => {
            setSettingsOpen(false);
            renderResults(searchInput.value);
        });
        searchInput.addEventListener('keydown', handleSearchKeydown);
        document.body.append(backdrop, button, panel);
    }

    function mountButton() {
        createSearchUI();
        const button = document.querySelector(`.${BUTTON_CLASS}`);
        if (button) {
            ensureSearchShortcutHint();
        }
    }

    function scheduleCollectVisiblePages() {
        if (collectPagesTimer) {
            clearTimeout(collectPagesTimer);
        }

        collectPagesTimer = setTimeout(() => {
            indexingPaused = false;
            const pageChanged = collectVisiblePages();
            if (panel?.classList.contains('is-open') && pageChanged) {
                renderResults(searchInput?.value || '');
            }
        }, 50);
    }

    function observeNavigation() {
        ['pushState', 'replaceState'].forEach(method => {
            const original = history[method];
            history[method] = function() { original.apply(this, arguments); window.dispatchEvent(new Event('mc-locationchange')); };
        });
        window.addEventListener('popstate', () => window.dispatchEvent(new Event('mc-locationchange')));
        window.addEventListener('mc-locationchange', () => {
            scheduleCollectVisiblePages();
        });

        if (typeof MutationObserver === 'function' && document.body) {
            domChangeObserver = new MutationObserver(() => {
                scheduleCollectVisiblePages();
            });
            domChangeObserver.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                characterData: false
            });
        }
    }

    function init() {
        readIndex();
        mountButton();
        observeNavigation();
        collectVisiblePages();
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && panel?.classList.contains('is-open')) {
                if (searchInput?.value) {
                    event.preventDefault();
                    searchInput.value = '';
                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                    searchInput.focus();
                    return;
                }
                if (exitClassroomFolder()) {
                    event.preventDefault();
                    searchInput?.focus();
                } else {
                    event.preventDefault();
                    setPanelOpen(false);
                }
                return;
            }

            const isTextEntryTarget = (() => {
                const target = event.target;
                if (!(target instanceof HTMLElement)) return false;
                return !!(target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]') || target.isContentEditable);
            })();

            if (
                panel?.classList.contains('is-open')
                && searchInput
                && !isTextEntryTarget
                && !event.metaKey
                && !event.ctrlKey
                && !event.altKey
                && !event.repeat
                && event.key.length === 1
            ) {
                event.preventDefault();
                searchInput.focus();
                searchInput.value += event.key;
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                return;
            }

            if (!event.metaKey && !event.ctrlKey && !event.altKey && !event.repeat && !isTextEntryTarget && event.shiftKey && event.key && event.key.toLowerCase() === 's') {
                event.preventDefault();
                dismissSearchShortcutHint();
                setPanelOpen(true);
            }
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
