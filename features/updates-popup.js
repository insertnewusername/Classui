// NEW UPDATE NOTIFICATION POPUP THING 💅
(function() {
    const UPDATE_VERSION_KEY = 'modernClassroom_updateVersion';
    const UPDATE_DISMISSED_KEY = 'modernClassroom_updateDismissedVersion';
    const LEGACY_UPDATE_VERSION_KEY = 'modernClassroomUpdateTrigger';
    const INSTALLED_VERSION_KEY = 'modernClassroom_installedVersion';
    const PREVIOUS_VERSION_KEY = 'modernClassroom_previousVersion';
    const UPDATE_TRIGGER_NUMBER = 7;
    let activeChangelogModal = null;

    const DEFAULT_CHANGELOGS = [
        {
            id: 'latest-release',
            title: 'Unable to fetch Patch Notes',
            version: 'v-.--.--',
            date: 'N/A',
        }
    ];

    async function getStoredValue(key, defaultValue = null) {
        if (typeof storageGet === 'function') {
            return storageGet(key, defaultValue);
        }

        try {
            const raw = localStorage.getItem(key);
            if (raw === null) return defaultValue;
            try { return JSON.parse(raw); } catch { return raw; }
        } catch {
            return defaultValue;
        }
    }

    async function setStoredValue(key, value) {
        if (typeof storageSet === 'function') {
            await storageSet(key, value);
            return;
        }

        try {
            const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
            localStorage.setItem(key, stringValue);
        } catch (_) {}
    }

    function getCurrentVersion() {
        try {
            return chrome?.runtime?.getManifest?.().version || null;
        } catch (_) {
            return null;
        }
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatInlineText(value) {
        let output = escapeHtml(value);
        output = output.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        output = output.replace(/\*(.+?)\*/g, '<em>$1</em>');
        output = output.replace(/`(.+?)`/g, '<code>$1</code>');
        output = output.replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
        return output;
    }

    function renderMarkdown(markdown) {
        if (!markdown) {
            return '<p>No release notes available.</p>';
        }

        const lines = String(markdown).replace(/\r/g, '').split('\n');
        const blocks = [];
        let listItems = [];
        let paragraph = [];

        const flushParagraph = () => {
            if (paragraph.length) {
                blocks.push('<p>' + formatInlineText(paragraph.join(' ')) + '</p>');
                paragraph = [];
            }
        };

        const flushList = () => {
            if (listItems.length) {
                blocks.push('<ul>' + listItems.map(item => '<li>' + formatInlineText(item) + '</li>').join('') + '</ul>');
                listItems = [];
            }
        };

        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) {
                flushParagraph();
                flushList();
                continue;
            }

            if (/^#{1,3}\s+/.test(line)) {
                const match = line.match(/^#+\s+(.*)$/);
                const level = Math.min(Math.max(line.match(/^#+/)[0].length, 1), 3);
                flushParagraph();
                flushList();
                blocks.push('<h' + level + '>' + formatInlineText(match[1]) + '</h' + level + '>');
                continue;
            }

            if (/^[-*]\s+/.test(line)) {
                flushParagraph();
                listItems.push(line.replace(/^[-*]\s+/, ''));
                continue;
            }

            paragraph.push(line);
        }

        flushParagraph();
        flushList();

        return blocks.join('');
    }

    function renderChangelogItems(items) {
        const blocks = [];
        let listItems = [];

        const flushList = () => {
            if (listItems.length) {
                blocks.push('<ul>' + listItems.map(item => '<li>' + formatInlineText(item) + '</li>').join('') + '</ul>');
                listItems = [];
            }
        };

        for (const item of items) {
            if (typeof item === 'object' && item !== null && item.type === 'image' && item.src) {
                flushList();
                const imageUrl = resolveChangelogImage(item.src);
                if (imageUrl) {
                        const width = typeof item.width === 'string' && /^\d+(?:\.\d+)?%$/.test(item.width) ? item.width : '';
                        const widthStyle = width ? ' style="width:' + escapeHtml(width) + '"' : '';
                        blocks.push('<img class="update-popup-release-image"' + widthStyle + ' src="' + escapeHtml(imageUrl) + '" alt="' + escapeHtml(item.alt || 'Release update') + '">');
                }
                continue;
            }

            if (typeof item === 'object' && item !== null && item.type === 'break') {
                flushList();
                blocks.push('<div class="update-popup-release-break" style="height:' + escapeHtml(item.size || 24) + 'px"></div>');
                continue;
            }

            listItems.push(typeof item === 'object' && item !== null ? String(item.text || '') : String(item));
        }

        flushList();
        return blocks.join('');
    }

    function resolveChangelogImage(imagePath) {
        if (!imagePath) {
            return '';
        }

        if (/^https:\/\//i.test(imagePath)) {
            return imagePath;
        }

        try {
            return chrome.runtime.getURL(imagePath);
        } catch (_) {
            return '';
        }
    }

    function normalizeChangelogEntry(rawEntry) {
        if (!rawEntry) {
            return null;
        }

        if (typeof rawEntry === 'string') {
            return {
                id: 'manual-entry',
                title: 'Latest Update',
                version: 'Latest',
                date: 'Recently',
                summary: rawEntry.trim().slice(0, 180),
                sections: [{
                    title: 'Notes',
                    body: rawEntry
                }]
            };
        }

        const sections = Array.isArray(rawEntry.sections)
            ? rawEntry.sections.map((section) => {
                if (Array.isArray(section.content)) {
                    return {
                        title: section.title || 'Notes',
                        content: section.content
                    };
                }
                if (Array.isArray(section.items)) {
                    return {
                        title: section.title || 'Notes',
                        items: section.items,
                        body: ''
                    };
                }
                return {
                    title: section.title || 'Notes',
                    body: section.body || section.content || ''
                };
            })
            : [];

        const summaryText = rawEntry.summary || rawEntry.description || '';

        return {
            id: rawEntry.id || rawEntry.slug || rawEntry.version || rawEntry.title || 'changelog',
            title: rawEntry.title || rawEntry.version || 'Latest Update',
            version: rawEntry.version || 'Latest',
            date: rawEntry.date || rawEntry.published || 'Recently',
            summary: summaryText,
            sections: sections.length ? sections : [{
                title: 'Overview',
                body: rawEntry.body || rawEntry.content || summaryText || 'No changelog content available.'
            }]
        };
    }

    async function getChangelogEntries() {
        const runtimeUrl = (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function')
            ? chrome.runtime.getURL('Changelogs/index.json')
            : null;

        if (!runtimeUrl) {
            return DEFAULT_CHANGELOGS;
        }

        try {
            const response = await fetch(runtimeUrl, { cache: 'no-store' });
            if (!response.ok) {
                return DEFAULT_CHANGELOGS;
            }

            const index = await response.json();
            const list = Array.isArray(index.releases) ? index.releases : Array.isArray(index.entries) ? index.entries : [];
            const results = [];

            for (const item of list) {
                const filePath = item.file || item.path || item.url;
                if (!filePath) {
                    continue;
                }

                const resolvedUrl = filePath.startsWith('http') ? filePath : chrome.runtime.getURL(filePath);
                const fileResponse = await fetch(resolvedUrl, { cache: 'no-store' });
                if (!fileResponse.ok) {
                    continue;
                }

                const contentType = fileResponse.headers.get('content-type') || '';
                if (contentType.includes('application/json')) {
                    const json = await fileResponse.json();
                    const entry = normalizeChangelogEntry({ ...json, ...item });
                    if (entry) {
                        results.push(entry);
                    }
                    continue;
                }

                const text = await fileResponse.text();
                const entry = normalizeChangelogEntry({
                    ...item,
                    title: item.title || 'Latest Update',
                    body: text
                });
                if (entry) {
                    results.push(entry);
                }
            }

            return results.length ? results : DEFAULT_CHANGELOGS;
        } catch (_) {
            return DEFAULT_CHANGELOGS;
        }
    }

    function buildReleaseMarkup(entry) {
        const sections = Array.isArray(entry.sections) ? entry.sections : [];
        const blocks = sections.map((section) => {
            const body = section.body || section.content || '';
                const content = Array.isArray(section.content)
                    ? renderChangelogItems(section.content)
                    : Array.isArray(section.items)
                ? renderChangelogItems(section.items)
                : renderMarkdown(body);
            return '<section class="update-popup-release-section"><h3>' + escapeHtml(section.title || 'Notes') + '</h3>' + content + '</section>';
        }).join('');

        return blocks || '<section class="update-popup-release-section"><h3>Overview</h3><p>' + escapeHtml(entry.summary || 'No release notes available.') + '</p></section>';
    }

    function renderChangelogContent(modal, entry) {
        const title = modal.querySelector('.update-popup-release-title');
        const version = modal.querySelector('.update-popup-release-version');
        const date = modal.querySelector('.update-popup-release-date');
        const summary = modal.querySelector('.update-popup-release-summary');
        const body = modal.querySelector('.update-popup-modal-main-content');

        if (!entry) {
            return;
        }

        title.textContent = entry.title || 'Latest Update';
        version.textContent = entry.version || 'Latest';
        date.textContent = entry.date || 'Recently';
        summary.textContent = entry.summary || '';
        body.innerHTML = buildReleaseMarkup(entry);
    }

    function populateChangelogModal(modal, entries) {
        const list = modal.querySelector('.update-popup-modal-list');
        const main = modal.querySelector('.update-popup-modal-main');
        if (!entries || !entries.length) {
            renderChangelogContent(modal, DEFAULT_CHANGELOGS[0]);
            return;
        }

        list.innerHTML = '';
        entries.forEach((entry, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'update-popup-entry' + (index === 0 ? ' active' : '');
            button.innerHTML = `
                <span class="update-popup-entry-version">${escapeHtml(entry.version || 'Update')}</span>
                <span class="update-popup-entry-title">${escapeHtml(entry.title || 'Latest Update')}</span>
                <span class="update-popup-entry-date">${escapeHtml(entry.date || 'Recently')}</span>
            `;

            button.addEventListener('click', () => {
                modal.querySelectorAll('.update-popup-entry').forEach(node => node.classList.toggle('active', node === button));
                renderChangelogContent(modal, entry);
            });

            list.appendChild(button);
        });

        renderChangelogContent(modal, entries[0]);
    }

    async function createChangelogModal() {
        if (activeChangelogModal && activeChangelogModal.parentNode) {
            activeChangelogModal.classList.add('show');
            return activeChangelogModal;
        }

        const modal = document.createElement('div');
        modal.className = 'update-popup-modal';
        modal.innerHTML = `
            <div class="update-popup-modal-backdrop"></div>
            <div class="update-popup-modal-panel" role="dialog" aria-modal="true" aria-label="Modern Classroom changelog">
                <div class="update-popup-modal-header">
                    <div class="update-popup-modal-title">Patch Notes</div>
                    <button class="update-popup-modal-close" type="button" aria-label="Close Patch Notes">×</button>
                </div>
                <div class="update-popup-modal-body">
                    <aside class="update-popup-modal-sidebar">
                        <div class="update-popup-modal-sidebar-title">Recent Updates</div>
                        <div class="update-popup-modal-list"></div>
                    </aside>
                    <main class="update-popup-modal-main">
                        <div class="update-popup-release-meta">
                            <div class="update-popup-release-version">Latest</div>
                            <h2 class="update-popup-release-title">Modern Classroom</h2>
                            <div class="update-popup-release-date">Recently</div>
                        </div>
                        <p class="update-popup-release-summary"></p>
                        <div class="update-popup-modal-main-content"></div>
                    </main>
                </div>
            </div>
        `;

        const closeButton = modal.querySelector('.update-popup-modal-close');
        const backdrop = modal.querySelector('.update-popup-modal-backdrop');

        closeButton.addEventListener('click', () => {
            modal.classList.remove('show');
            modal.addEventListener('transitionend', () => {
                modal.remove();
                if (activeChangelogModal === modal) {
                    activeChangelogModal = null;
                }
            }, { once: true });
        });

        backdrop.addEventListener('click', () => closeButton.click());

        document.body.appendChild(modal);
        const changelogs = await getChangelogEntries();
        populateChangelogModal(modal, changelogs);
        activeChangelogModal = modal;

        requestAnimationFrame(() => {
            modal.classList.add('show');
        });

        return modal;
    }

    function createUpdatePopup() {
        const popup = document.createElement('div');
        popup.className = 'update-popup';
        popup.style.zIndex = '1500001';
        popup.innerHTML = `
            <div class="update-popup-content">
                <button class="update-popup-close" type="button" aria-label="Close update notification">×</button>
                <span class="update-popup-title">Modern Classroom was updated</span>
                <button class="update-popup-button" type="button">Patch Notes</button>
            </div>
        `;

        const closeBtn = popup.querySelector('.update-popup-close');
        const changelogBtn = popup.querySelector('.update-popup-button');

        closeBtn.addEventListener('click', (event) => {
            event.preventDefault();
            popup.style.transition = 'transform 0.3s ease';
            popup.style.transform = 'translateX(550px)';
            setTimeout(() => {
                popup.remove();
            }, 260);
            markUpdatePopupDismissed().catch(() => {});
        });

        changelogBtn.addEventListener('click', (event) => {
            event.preventDefault();
            createChangelogModal().catch(() => {});
        });

        document.body.appendChild(popup);

        requestAnimationFrame(() => {
            popup.classList.add('show');
        });
    }

    async function markUpdatePopupDismissed(version = getCurrentVersion()) {
        await Promise.all([
            setStoredValue(UPDATE_VERSION_KEY, version),
            setStoredValue(UPDATE_DISMISSED_KEY, version),
            setStoredValue(LEGACY_UPDATE_VERSION_KEY, UPDATE_TRIGGER_NUMBER),
            setStoredValue(INSTALLED_VERSION_KEY, version),
            setStoredValue(PREVIOUS_VERSION_KEY, null)
        ]);
    }

    function normalizeVersion(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    async function markUpdatePopupSeen(version = getCurrentVersion()) {
        await Promise.all([
            setStoredValue(UPDATE_VERSION_KEY, version),
            setStoredValue(LEGACY_UPDATE_VERSION_KEY, UPDATE_TRIGGER_NUMBER),
            setStoredValue(INSTALLED_VERSION_KEY, version),
            setStoredValue(PREVIOUS_VERSION_KEY, null)
        ]);
    }

    async function checkAndShowUpdatePopup() {
        const currentVersion = getCurrentVersion();
        const [storedVersion, dismissedVersion, legacyStored] = await Promise.all([
            getStoredValue(UPDATE_VERSION_KEY, null),
            getStoredValue(UPDATE_DISMISSED_KEY, null),
            getStoredValue(LEGACY_UPDATE_VERSION_KEY, null)
        ]);

        const storedVersionNum = normalizeVersion(storedVersion);
        const dismissedVersionNum = normalizeVersion(dismissedVersion);
        const legacyStoredNum = normalizeVersion(legacyStored);

        if (!currentVersion) {
            return;
        }

        const legacyAcknowledged = (legacyStoredNum === UPDATE_TRIGGER_NUMBER);
        const versionDismissedForCurrentBuild = (dismissedVersionNum !== null && dismissedVersionNum === normalizeVersion(currentVersion));
        const versionSeenForCurrentBuild = (storedVersionNum !== null && storedVersionNum === normalizeVersion(currentVersion));

        if (legacyAcknowledged || versionDismissedForCurrentBuild) {
            return;
        }

        if (versionSeenForCurrentBuild) {
            return;
        }

        createUpdatePopup();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkAndShowUpdatePopup);
    } else {
        checkAndShowUpdatePopup().catch(() => {});
    }

    window.openModernClassroomChangelog = async function() {
        return createChangelogModal().catch(() => {
            return null;
        });
    };

    window.resetModernClassroomUpdatePopup = function() {
        Promise.all([
            setStoredValue(UPDATE_VERSION_KEY, null),
            setStoredValue(UPDATE_DISMISSED_KEY, null),
            setStoredValue(LEGACY_UPDATE_VERSION_KEY, null)
        ]).catch(() => {});
        console.log('Update popup reset. It will show again on next reload.');
    };
})();
