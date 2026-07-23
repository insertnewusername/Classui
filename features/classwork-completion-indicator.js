(function () {
    const COMPLETE_CLASS = 'mc-assignment-state-complete';
    const INCOMPLETE_CLASS = 'mc-assignment-state-incomplete';
    const CARD_SELECTOR = '[data-stream-item-type="1"]';

    // ---- Lighten a hex colour (0 to 1) ----
    function lightenHexColor(hex, percent) {
        let r = parseInt(hex.slice(1,3), 16);
        let g = parseInt(hex.slice(3,5), 16);
        let b = parseInt(hex.slice(5,7), 16);
        r = Math.min(255, Math.round(r + (255 - r) * percent));
        g = Math.min(255, Math.round(g + (255 - g) * percent));
        b = Math.min(255, Math.round(b + (255 - b) * percent));
        return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
    }

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

    // ---- Apply colour to badge ----
    function applyColourToBadge(badge, colour, stateClass) {
        if (colour) {
            let finalColour = colour;
            if (stateClass === COMPLETE_CLASS) {
                finalColour = lightenHexColor(colour, 0.4);
            }
            badge.style.setProperty('background-color', finalColour, 'important');
            badge.style.setProperty('--mgc-classwork-color', finalColour, 'important');
        } else {
            badge.style.removeProperty('background-color');
            badge.style.removeProperty('--mgc-classwork-color');
        }
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

    // ---- Update badge state and colour ----
    async function updateAssignmentBadgeState(card, stateClass) {
        const badge = getAssignmentTypeBadge(card);
        if (!badge) return;

        badge.classList.remove(COMPLETE_CLASS, INCOMPLETE_CLASS);
        card.classList.add('mc-classwork-status-target');
        badge.classList.add(stateClass);

        const courseId = getActiveCourseId();
        let colour = null;
        if (courseId) {
            colour = await getCourseColour(courseId);
        }
        applyColourToBadge(badge, colour, stateClass);
    }

    // ---- Clear legacy state classes ----
    function clearAllStateClasses() {
        document.querySelectorAll('.mc-assignment-state-complete, .mc-assignment-state-incomplete').forEach((node) => {
            node.classList.remove(COMPLETE_CLASS, INCOMPLETE_CLASS);
            node.style.removeProperty('background-color');
            node.style.removeProperty('--mgc-classwork-color');
        });
        document.querySelectorAll('.mc-classwork-status-target').forEach((node) => node.classList.remove('mc-classwork-status-target'));
    }

    // ---- Process all cards ----
    async function processCards() {
        if (!/\/w(?:\/|$)/.test(window.location.pathname)) {
            clearAllStateClasses();
            return;
        }

        const cards = Array.from(document.querySelectorAll(CARD_SELECTOR));
        if (!cards.length) return;

        // Pre-fetch colour once
        const courseId = getActiveCourseId();
        let colour = null;
        if (courseId) {
            colour = await getCourseColour(courseId);
        }

        for (const card of cards) {
            if (!(card instanceof Element)) continue;
            const state = detectCardState(card);
            const badge = getAssignmentTypeBadge(card);
            if (!badge) continue;
            // Update class and style
            badge.classList.remove(COMPLETE_CLASS, INCOMPLETE_CLASS);
            card.classList.add('mc-classwork-status-target');
            badge.classList.add(state);
            applyColourToBadge(badge, colour, state);
        }
    }

    // ---- Immediately process on any change ----
    let processTimeout = null;
    function scheduleImmediateProcess() {
        if (processTimeout) {
            clearTimeout(processTimeout);
        }
        processTimeout = setTimeout(() => {
            processTimeout = null;
            processCards().catch(() => {});
        }, 50); // small delay to batch mutations
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
            // additional safety: run every 500ms
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