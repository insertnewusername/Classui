(function () {
    const COMPLETE_CLASS = 'mc-assignment-state-complete';
    const INCOMPLETE_CLASS = 'mc-assignment-state-incomplete';
    const CARD_SELECTOR = '[data-stream-item-type="1"]';

    // ---- Get active course ID ----
    function getActiveCourseId() {
        const activeLink = document.querySelector('a.uTwgne[aria-current="page"], a.uTwgne[aria-current="true"]');
        if (activeLink && activeLink.dataset && activeLink.dataset.id) return activeLink.dataset.id;
        const path = window.location.pathname;
        const match = path.match(/\/(?:c|w)\/([a-zA-Z0-9_-]+)/);
        return match ? match[1] : null;
    }

    // ---- Get stored icon colour (cached) ----
    let colourCache = {};
    async function getCourseColour(courseId) {
        if (!courseId) return null;
        if (colourCache[courseId]) return colourCache[courseId];
        if (typeof storageGet === 'function') {
            try {
                const colours = await storageGet('modernClassroom_card_icon_colors', {});
                colourCache[courseId] = colours[courseId] || null;
                return colourCache[courseId];
            } catch (_) {}
        }
        if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
            return new Promise((resolve) => {
                chrome.storage.sync.get('modernClassroom_card_icon_colors', (data) => {
                    if (chrome.runtime.lastError) return resolve(null);
                    const colours = data['modernClassroom_card_icon_colors'] || {};
                    colourCache[courseId] = colours[courseId] || null;
                    resolve(colourCache[courseId]);
                });
            });
        }
        try {
            const raw = localStorage.getItem('modernClassroom_card_icon_colors');
            if (raw) {
                const colours = JSON.parse(raw);
                colourCache[courseId] = colours[courseId] || null;
                return colourCache[courseId];
            }
        } catch (_) {}
        return null;
    }

    // ---- Detect state from badge text ----
    function detectCardState(card) {
        const badge = getAssignmentTypeBadge(card);
        if (!badge) return INCOMPLETE_CLASS;
        const label = normalizeText(badge.querySelector('.PazDv')?.textContent || '');
        return label.includes('completed') ? COMPLETE_CLASS : INCOMPLETE_CLASS;
    }

    // ---- Get assignment badge element ----
    function getAssignmentTypeBadge(card) {
        return card.querySelector('.D3ZbAb .oC328b');
    }

    // ---- Normalise text ----
    function normalizeText(text) {
        return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
    }

    // ---- Process all cards ----
    async function processCards() {
        if (!/\/w(?:\/|$)/.test(window.location.pathname)) {
            document.documentElement.style.removeProperty('--mc-course-colour');
            clearAllStateClasses();
            return;
        }

        const cards = Array.from(document.querySelectorAll(CARD_SELECTOR));
        if (!cards.length) return;

        // 1. Fetch colour once and set it as a CSS variable
        const courseId = getActiveCourseId();
        let colour = null;
        if (courseId) {
            colour = await getCourseColour(courseId);
        }
        document.documentElement.style.setProperty('--mc-course-colour', colour || '');

        // 2. Apply the correct state class to each badge
        for (const card of cards) {
            if (!(card instanceof Element)) continue;
            const state = detectCardState(card);
            const badge = getAssignmentTypeBadge(card);
            if (!badge) continue;
            badge.classList.remove(COMPLETE_CLASS, INCOMPLETE_CLASS);
            badge.classList.add(state);
            card.classList.add('mc-classwork-status-target');
        }
    }

    // ---- Clear legacy state classes ----
    function clearAllStateClasses() {
        document.querySelectorAll('.mc-assignment-state-complete, .mc-assignment-state-incomplete').forEach((node) => {
            node.classList.remove(COMPLETE_CLASS, INCOMPLETE_CLASS);
        });
        document.querySelectorAll('.mc-classwork-status-target').forEach((node) => node.classList.remove('mc-classwork-status-target'));
    }

    // ---- Debounced scheduler ----
    let processTimeout = null;
    function scheduleImmediateProcess() {
        if (processTimeout) {
            clearTimeout(processTimeout);
        }
        processTimeout = setTimeout(() => {
            processTimeout = null;
            processCards().catch(() => {});
        }, 50);
    }

    // ---- MutationObserver ----
    const observer = new MutationObserver(() => {
        scheduleImmediateProcess();
    });

    function startObserver() {
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['data-stream-item-type', 'class']
        });
    }

    // ---- Initialisation ----
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            processCards().catch(() => {});
            startObserver();
            // Periodic safety net
            setInterval(() => scheduleImmediateProcess(), 500);
        });
    } else {
        processCards().catch(() => {});
        startObserver();
        setInterval(() => scheduleImmediateProcess(), 500);
    }

    // ---- Path change ----
    let previousPath = window.location.pathname + window.location.search;
    const onPathChange = () => {
        const nextPath = window.location.pathname + window.location.search;
        if (nextPath === previousPath) return;
        previousPath = nextPath;
        colourCache = {}; // clear cache
        scheduleImmediateProcess();
    };

    window.addEventListener('popstate', onPathChange);
    window.addEventListener('locationchange', onPathChange);
})();