(function() {
    const STARRED_ASSIGNMENTS_KEY = 'modernClassroom_starredAssignments';
    const STAR_CANDIDATE_SELECTOR = '[data-stream-item-id], [data-course-work-id]';
    const STAR_BUTTON_CLASS = 'mc-assignment-star-btn';

    function getNodeDepth(node) {
        let depth = 0;
        let current = node;
        while (current && current.parentElement) {
            depth += 1;
            current = current.parentElement;
        }
        return depth;
    }

    function isCardVisible(card) {
        if (!card || !card.isConnected) return false;
        if (card.getAttribute('aria-hidden') === 'true') return false;

        const style = window.getComputedStyle(card);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
            return false;
        }

        const rect = card.getBoundingClientRect();
        if (!rect.width || !rect.height) return false;

        return true;
    }

    function getCardScore(card) {
        const depth = getNodeDepth(card);
        const visibleBonus = isCardVisible(card) ? 100000 : 0;
        return visibleBonus - depth;
    }

    function getClassroomClassPath() {
        const match = window.location.pathname.match(/^(.*?\/c\/[^/]+)/);
        return match ? match[1] : window.location.pathname;
    }

    function buildDetailsUrl(streamItemId) {
        return `${window.location.origin}${getClassroomClassPath()}/m/${encodeURIComponent(streamItemId)}/details`;
    }

    function buildCourseworkDetailsUrl(courseworkId) {
        return `${window.location.origin}${getClassroomClassPath()}/a/${encodeURIComponent(courseworkId)}/details`;
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

    function getRecordAliases(record) {
        const aliases = new Set();

        const explicit = String(record?.itemId || '').trim();
        if (explicit) aliases.add(explicit);

        const fromUrl = getCanonicalKeyFromUrl(record?.url || '');
        if (fromUrl) aliases.add(fromUrl);

        const courseWorkId = String(record?.courseWorkId || '').trim();
        if (courseWorkId) aliases.add(`a:${courseWorkId}`);

        const streamItemId = String(record?.streamItemId || '').trim();
        if (streamItemId) aliases.add(`m:${streamItemId}`);

        const fingerprint = buildFingerprint(record?.classPath, record?.itemType, record?.title || record?.rawTitle);
        if (fingerprint) aliases.add(fingerprint);

        return aliases;
    }

    function aliasesOverlap(leftAliases, rightAliases) {
        for (const value of leftAliases) {
            if (rightAliases.has(value)) return true;
        }
        return false;
    }

    function getItemKey(item) {
        const explicit = String(item?.itemId || '').trim();
        if (explicit) return explicit;

        const fromUrl = getCanonicalKeyFromUrl(item?.url || '');
        if (fromUrl) return fromUrl;

        const courseWorkId = String(item?.courseWorkId || '').trim();
        if (courseWorkId) return `a:${courseWorkId}`;

        const streamItemId = String(item?.streamItemId || '').trim();
        if (streamItemId) return `m:${streamItemId}`;

        return '';
    }

    function getCardAliases(ids, urlValue, classPath, itemType, title) {
        const aliases = new Set();

        const canonical = getCanonicalItemId(ids, urlValue);
        if (canonical) aliases.add(canonical);

        const streamId = String(ids?.streamItemId || '').trim();
        if (streamId) aliases.add(`m:${streamId}`);

        const cwId = String(ids?.courseWorkId || '').trim();
        if (cwId) aliases.add(`a:${cwId}`);

        const fromUrl = getCanonicalKeyFromUrl(urlValue || '');
        if (fromUrl) aliases.add(fromUrl);

        const fingerprint = buildFingerprint(classPath, itemType, title);
        if (fingerprint) aliases.add(fingerprint);

        return aliases;
    }

    function isItemDetailPage() {
        return /\/(a|m)\//.test(window.location.pathname);
    }

    function isStarsSuppressedRoute() {
        const path = window.location.pathname;
        return /\/w\//.test(path) || /^\/(?:u\/\d+\/)?a(?:\/|$)/.test(path);
    }

    function parsePrefixedTitle(rawText) {
        const text = String(rawText || '').trim();
        if (!text) return { rawTitle: '', cleanTitle: '', itemType: '' };

        const normalized = text.replace(/^['\"]+|['\"]+$/g, '').trim();
        const typeMatch = normalized.match(/^(assignment|material)\s*:\s*(.*)$/i);

        if (typeMatch) {
            return {
                rawTitle: normalized,
                cleanTitle: String(typeMatch[2] || '').replace(/^['\"]+|['\"]+$/g, '').trim(),
                itemType: typeMatch[1].toLowerCase()
            };
        }

        return { rawTitle: normalized, cleanTitle: normalized, itemType: '' };
    }

    function getItemIdentifiers(card) {
        const streamItemId = String(card.getAttribute('data-stream-item-id') || '').trim();
        const courseWorkEl = card.querySelector('[data-course-work-id]') || card.closest('[data-course-work-id]') || card;
        const courseWorkId = String(courseWorkEl?.getAttribute?.('data-course-work-id') || '').trim();
        return { streamItemId, courseWorkId };
    }

    function getCardPrimaryUrl(card, ids) {
        const linked = card.querySelector('a[href*="/details"], a[href*="/a/"], a[href*="/m/"]');
        if (linked && linked.href) {
            try {
                return new URL(linked.href, window.location.origin).toString();
            } catch (_) {}
        }

        const linkLike = card.querySelector('[role="link"][data-href], [role="link"][href], [jsname="rQC7Ie"][data-href]');
        if (linkLike) {
            const href = String(linkLike.getAttribute('data-href') || linkLike.getAttribute('href') || '').trim();
            if (href) {
                try {
                    const parsed = new URL(href, window.location.origin);
                    if (/\/(a|m)\/[^/]+/i.test(parsed.pathname) || /\/details$/i.test(parsed.pathname)) {
                        return parsed.toString();
                    }
                } catch (_) {}
            }
        }

        const here = new URL(window.location.href);
        if (/\/(a|m)\/[^/]+/i.test(here.pathname)) {
            return here.toString();
        }

        if (ids.courseWorkId) {
            return buildCourseworkDetailsUrl(ids.courseWorkId);
        }

        if (ids.streamItemId) {
            return buildDetailsUrl(ids.streamItemId);
        }

        return `${window.location.origin}${getClassroomClassPath()}`;
    }

    function getCanonicalItemId(ids, urlValue) {
        const keyFromUrl = getCanonicalKeyFromUrl(urlValue);
        if (keyFromUrl) return keyFromUrl;
        if (ids.courseWorkId) return `a:${ids.courseWorkId}`;
        if (ids.streamItemId) return `m:${ids.streamItemId}`;
        return '';
    }

    function detectItemType(card) {
        const ariaCandidates = [
            card.querySelector('[jsname="rQC7Ie"]'),
            card.querySelector('[role="link"][aria-label]'),
            card.querySelector('[aria-label]')
        ];

        for (const node of ariaCandidates) {
            const label = node?.getAttribute?.('aria-label') || '';
            if (!label) continue;
            if (/^assignment\s*:/i.test(label)) return 'assignment';
            if (/^material\s*:/i.test(label)) return 'material';
            if (/^assignment options for/i.test(label)) return 'assignment';
            if (/^material options for/i.test(label)) return 'material';
        }

        const titleNode = card.querySelector('.QUEiXc .jzdBjc') || card.querySelector('.jzdBjc') || card.querySelector('h1.fOvfyc span') || card.querySelector('h1.fOvfyc');
        const title = titleNode?.textContent?.trim() || '';
        if (/^assignment\s*:/i.test(title)) return 'assignment';
        if (/^material\s*:/i.test(title)) return 'material';

        const currentPath = window.location.pathname;
        if (/\/a\//.test(currentPath)) return 'assignment';
        if (/\/m\//.test(currentPath)) return 'material';

        return '';
    }

    function normalizeStoredUrl(url, streamItemId, classPath) {
        try {
            const parsed = new URL(url, window.location.origin);
            const legacyStreamItemId = parsed.searchParams.get('mcStreamItem');

            if (legacyStreamItemId || parsed.searchParams.has('mcStreamItem')) {
                return `${window.location.origin}${classPath}`;
            }

            return parsed.toString();
        } catch (_) {
            return `${window.location.origin}${classPath}`;
        }
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

    function normalizeStarred(raw) {
        if (!Array.isArray(raw)) return [];
        const seen = new Set();

        return raw
            .map((item) => {
                if (!item || typeof item !== 'object') return null;
                const streamItemId = String(item.streamItemId || '').trim();
                const courseWorkId = String(item.courseWorkId || '').trim();
                const title = String(item.title || '').trim().slice(0, 220);
                const rawTitle = String(item.rawTitle || title).trim().slice(0, 240);
                const url = String(item.url || '').trim();
                const classPath = String(item.classPath || '').trim() || getClassPathFromUrl(url) || getClassroomClassPath();
                const itemType = String(item.itemType || '').trim().toLowerCase();
                const note = String(item.note || '').slice(0, 160);
                const normalizedUrl = normalizeStoredUrl(url || '', streamItemId, classPath);
                const itemId = String(item.itemId || '').trim() || getCanonicalItemId({ streamItemId, courseWorkId }, normalizedUrl);
                if (!itemId || !title) return null;
                if (seen.has(itemId)) return null;
                seen.add(itemId);
                return {
                    itemId,
                    streamItemId,
                    courseWorkId,
                    title,
                    rawTitle,
                    itemType,
                    classPath,
                    note,
                    url: normalizedUrl,
                    savedAt: Number(item.savedAt) || Date.now()
                };
            })
            .filter(Boolean)
            .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    }

    function loadStarred() {
        try {
            const raw = localStorage.getItem(STARRED_ASSIGNMENTS_KEY);
            if (!raw) return [];
            return normalizeStarred(JSON.parse(raw));
        } catch (_) {
            return [];
        }
    }

    function saveStarred(items) {
        const normalized = normalizeStarred(items);

        try {
            localStorage.setItem(STARRED_ASSIGNMENTS_KEY, JSON.stringify(normalized));
        } catch (_) {}

        window.dispatchEvent(new CustomEvent('mc:starred-assignments-updated', {
            detail: { items: normalized }
        }));

        return normalized;
    }

    function getTitleFromCard(card) {
        const titleNode = card.querySelector('.QUEiXc .jzdBjc') || card.querySelector('.jzdBjc') || card.querySelector('h1.fOvfyc span') || card.querySelector('h1.fOvfyc');
        if (titleNode && titleNode.textContent) {
            const parsed = parsePrefixedTitle(titleNode.textContent);
            if (parsed.cleanTitle) {
                return parsed;
            }
        }

        const ariaNode = card.querySelector('[aria-label]');
        if (ariaNode && ariaNode.getAttribute('aria-label')) {
            const parsed = parsePrefixedTitle(ariaNode.getAttribute('aria-label'));
            if (parsed.cleanTitle) {
                return parsed;
            }
        }

        const optionLabelNode = card.querySelector('[aria-label*=" options for "]');
        if (optionLabelNode) {
            const label = String(optionLabelNode.getAttribute('aria-label') || '');
            const optionMatch = label.match(/^(material|assignment)\s+options\s+for\s+(.+)$/i);
            if (optionMatch) {
                return {
                    rawTitle: `${optionMatch[1]}: ${optionMatch[2]}`,
                    cleanTitle: String(optionMatch[2] || '').trim(),
                    itemType: String(optionMatch[1] || '').toLowerCase()
                };
            }
        }

        const fallback = parsePrefixedTitle('Classroom item');
        return {
            rawTitle: fallback.rawTitle,
            cleanTitle: fallback.cleanTitle,
            itemType: detectItemType(card)
        };
    }

    function getUrlFromCard(card, ids) {
        const primary = getCardPrimaryUrl(card, ids);
        if (primary) return primary;
        return `${window.location.origin}${getClassroomClassPath()}`;
    }

    function openCardInCurrentView(card) {
        const trigger = card.querySelector('[jsname="rQC7Ie"], [role="link"], a[href]');
        if (trigger && typeof trigger.click === 'function') {
            trigger.click();
            return true;
        }

        if (typeof card.click === 'function') {
            card.click();
            return true;
        }

        return false;
    }

    function setPendingAutoStar(itemId) {
        if (!itemId) return;
        const payload = JSON.stringify({ itemId, savedAt: Date.now() });
        try {
            sessionStorage.setItem('modernClassroom_pendingAutoStar', payload);
        } catch (_) {}
    }

    function getPendingAutoStar() {
        try {
            const raw = sessionStorage.getItem('modernClassroom_pendingAutoStar');
            if (!raw) return '';
            const parsed = JSON.parse(raw);
            return String(parsed?.itemId || '').trim();
        } catch (_) {
            return '';
        }
    }

    function hasPendingAutoStar() {
        return !!getPendingAutoStar();
    }

    function clearPendingAutoStar() {
        try {
            sessionStorage.removeItem('modernClassroom_pendingAutoStar');
        } catch (_) {}
    }

    function openCardAndAutoStar(card) {
        const ids = getItemIdentifiers(card);
        const itemUrl = getCardPrimaryUrl(card, ids);
        const itemId = getCanonicalItemId(ids, itemUrl);
        if (!itemId) return;

        setPendingAutoStar(itemId);
        if (!openCardInCurrentView(card)) {
            clearPendingAutoStar();
        }
    }

    function isStarredByAliases(targetAliases, items) {
        return items.some((item) => aliasesOverlap(targetAliases, getRecordAliases(item)));
    }

    function updateCardButtonState(card, starredItems) {
        const ids = getItemIdentifiers(card);
        const itemUrl = getCardPrimaryUrl(card, ids);
        const itemType = detectItemType(card);
        if (itemType !== 'assignment' && itemType !== 'material') return;

        const titleData = getTitleFromCard(card);
        const displayTitle = titleData.cleanTitle || titleData.rawTitle || '';
        const classPath = getClassroomClassPath();
        const aliases = getCardAliases(ids, itemUrl, classPath, itemType, displayTitle);
        if (!aliases.size) return;

        const starBtn = card.querySelector('.' + STAR_BUTTON_CLASS);
        if (!starBtn) return;

        const starred = isStarredByAliases(aliases, starredItems);
        starBtn.classList.toggle('is-starred', starred);
        starBtn.setAttribute('aria-pressed', starred ? 'true' : 'false');
        starBtn.setAttribute('title', starred ? 'Remove from Saved' : 'Save item');
    }

    function toggleStar(card) {
        const ids = getItemIdentifiers(card);

        const itemType = detectItemType(card);
        if (itemType !== 'assignment' && itemType !== 'material') return;

        const titleData = getTitleFromCard(card);
        const cleanTitle = titleData.cleanTitle || titleData.rawTitle || 'Classroom item';
        const rawTitle = titleData.rawTitle || cleanTitle;
        const url = getUrlFromCard(card, ids);
        const itemId = getCanonicalItemId(ids, url);
        if (!itemId) return;
        const classPath = getClassroomClassPath();
        const current = loadStarred();
        const targetAliases = getCardAliases(ids, url, classPath, itemType, cleanTitle);

        if (isStarredByAliases(targetAliases, current)) {
            saveStarred(current.filter((item) => !aliasesOverlap(targetAliases, getRecordAliases(item))));
        } else {
            const existingItem = current.find((item) => aliasesOverlap(targetAliases, getRecordAliases(item)));
            const mergedOutExisting = current.filter((item) => !aliasesOverlap(targetAliases, getRecordAliases(item)));
            saveStarred([
                {
                    itemId,
                    streamItemId: ids.streamItemId,
                    courseWorkId: ids.courseWorkId,
                    title: cleanTitle,
                    rawTitle,
                    itemType,
                    classPath,
                    note: String(existingItem?.note || '').slice(0, 160),
                    url,
                    savedAt: Date.now()
                },
                ...mergedOutExisting
            ]);
        }

        refreshButtons();
    }

    function createStarButton(card) {
        const existingButton = card.querySelector('.' + STAR_BUTTON_CLASS);
        if (existingButton) {
            card.setAttribute('data-mc-starred-initialized', 'true');
            return;
        }

        // Classroom often reuses nodes across SPA navigation and can keep this flag
        // while dropping injected children. Re-arm injection when button is missing.
        if (card.hasAttribute('data-mc-starred-initialized')) {
            card.removeAttribute('data-mc-starred-initialized');
        }

        const ids = getItemIdentifiers(card);
        const itemUrl = getCardPrimaryUrl(card, ids);
        const itemId = getCanonicalItemId(ids, itemUrl);
        if (!itemId) return;

        const itemType = detectItemType(card);
        if (itemType !== 'assignment' && itemType !== 'material') return;

        if (card.hasAttribute('data-mc-starred-initialized')) return;

        card.setAttribute('data-mc-starred-initialized', 'true');
        card.setAttribute('data-mc-starred-item-id', itemId);
        card.classList.add('mc-star-target');

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = STAR_BUTTON_CLASS;
        btn.setAttribute('aria-label', 'Save item');
        btn.setAttribute('aria-pressed', 'false');
        btn.innerHTML = '<span class="mc-assignment-star-glyph" aria-hidden="true">★</span>';

        if (isStarsSuppressedRoute()) {
            btn.style.display = 'none';
        }

        btn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();

            if (!isItemDetailPage()) {
                const ids = getItemIdentifiers(card);
                const itemUrl = getCardPrimaryUrl(card, ids);
                const itemType = detectItemType(card);
                const titleData = getTitleFromCard(card);
                const displayTitle = titleData.cleanTitle || titleData.rawTitle || '';
                const classPath = getClassroomClassPath();
                const aliases = getCardAliases(ids, itemUrl, classPath, itemType, displayTitle);
                const isStarred = isStarredByAliases(aliases, loadStarred());

                if (isStarred) {
                    toggleStar(card);
                    return;
                }

                openCardAndAutoStar(card);
                return;
            }

            toggleStar(card);
        });

        card.appendChild(btn);
    }

    function removeInvalidStarsFromPage() {
        document.querySelectorAll('.' + STAR_BUTTON_CLASS).forEach((btn) => {
            const card = btn.closest('[data-stream-item-id], [data-course-work-id]');
            if (!card) return;
            const itemType = detectItemType(card);
            if (itemType === 'assignment' || itemType === 'material') return;
            btn.remove();
            card.removeAttribute('data-mc-starred-initialized');
            card.removeAttribute('data-mc-starred-item-id');
        });
    }

    function removeDuplicateStars(cards) {
        const bestCardByItem = new Map();

        cards.forEach((card) => {
            const ids = getItemIdentifiers(card);
            const itemId = getCanonicalItemId(ids, getCardPrimaryUrl(card, ids));
            if (!itemId) return;

            const existing = bestCardByItem.get(itemId);
            if (!existing) {
                bestCardByItem.set(itemId, card);
                return;
            }

            const existingScore = getCardScore(existing);
            const nextScore = getCardScore(card);
            if (nextScore > existingScore) {
                bestCardByItem.set(itemId, card);
            }
        });

        cards.forEach((card) => {
            const ids = getItemIdentifiers(card);
            const itemId = getCanonicalItemId(ids, getCardPrimaryUrl(card, ids));
            if (!itemId) return;
            const isBest = bestCardByItem.get(itemId) === card;
            if (isBest) return;

            card.querySelectorAll('.' + STAR_BUTTON_CLASS).forEach((btn) => btn.remove());
            card.removeAttribute('data-mc-starred-initialized');
            card.removeAttribute('data-mc-starred-item-id');
        });

        return Array.from(bestCardByItem.values());
    }

    function collectCandidateCards() {
        const nodes = Array.from(document.querySelectorAll(STAR_CANDIDATE_SELECTOR));
        const seen = new Set();
        const cards = [];

        nodes.forEach((node) => {
            if (!(node instanceof Element)) return;

            // Keep the most specific matching element first. Promoting every
            // node to the outer stream wrapper can lose title/type markers.
            const host = (node.matches('[data-course-work-id]') && node)
                || (node.matches('[data-stream-item-id]') && node)
                || node.closest('[data-course-work-id]')
                || node.closest('[data-stream-item-id]')
                || node;

            if (!host || seen.has(host)) return;
            seen.add(host);
            cards.push(host);
        });

        if (cards.length) {
            return cards;
        }

        const fallbackNodes = Array.from(document.querySelectorAll(
            '[aria-label^="Assignment:"], [aria-label^="Material:"], [aria-label*=" options for "], a[href*="/a/"], a[href*="/m/"]'
        ));

        fallbackNodes.forEach((node) => {
            if (!(node instanceof Element)) return;
            const host = node.closest('[data-course-work-id]')
                || node.closest('[data-stream-item-id]')
                || node.closest('[role="listitem"]')
                || node;

            if (!host || seen.has(host)) return;
            seen.add(host);
            cards.push(host);
        });

        return cards;
    }

    function processCards() {
        if (isStarsSuppressedRoute() && !hasPendingAutoStar()) {
            document.querySelectorAll('.' + STAR_BUTTON_CLASS).forEach((btn) => {
                const card = btn.closest('[data-stream-item-id], [data-course-work-id]');
                btn.remove();
                if (!card) return;
                card.removeAttribute('data-mc-starred-initialized');
                card.removeAttribute('data-mc-starred-item-id');
            });
            return;
        }

        const allCards = collectCandidateCards();
        const cards = removeDuplicateStars(allCards) || allCards;
        cards.forEach((card) => createStarButton(card));
        removeInvalidStarsFromPage();
        refreshButtons();
    }

    function refreshButtons() {
        const starred = loadStarred();
        collectCandidateCards().forEach((card) => {
            updateCardButtonState(card, starred);
        });
    }

    function findCardForAlias(targetAlias) {
        const normalizedAlias = String(targetAlias || '').trim();
        if (!normalizedAlias) return null;

        const cards = collectCandidateCards();
        for (const card of cards) {
            const ids = getItemIdentifiers(card);
            const itemUrl = getCardPrimaryUrl(card, ids);
            const itemType = detectItemType(card);
            const titleData = getTitleFromCard(card);
            const displayTitle = titleData.cleanTitle || titleData.rawTitle || '';
            const aliases = getCardAliases(ids, itemUrl, getClassroomClassPath(), itemType, displayTitle);
            if (aliases.has(normalizedAlias)) {
                return card;
            }
        }

        return null;
    }

    function handlePendingAutoStar() {
        const pendingId = getPendingAutoStar();
        if (!pendingId) return;

        let attempts = 0;
        const maxAttempts = 20;
        const timer = setInterval(() => {
            attempts += 1;
            processCards();

            const targetCard = findCardForAlias(pendingId);
            const targetButton = targetCard?.querySelector('.' + STAR_BUTTON_CLASS);
            if (targetButton) {
                if (targetButton.classList.contains('is-starred')) {
                    clearInterval(timer);
                    clearPendingAutoStar();
                    processCards();
                    return;
                }
                clearInterval(timer);
                clearPendingAutoStar();
                targetButton.click();
                processCards();
                return;
            }

            if (isItemDetailPage()) {
                const fallbackButton = document.querySelector('.' + STAR_BUTTON_CLASS);
                if (fallbackButton) {
                    clearInterval(timer);
                    clearPendingAutoStar();
                    fallbackButton.click();
                    processCards();
                    return;
                }
            }

            if (attempts >= maxAttempts) {
                clearInterval(timer);
                clearPendingAutoStar();
                processCards();
            }
        }, 350);
    }

    const observer = new MutationObserver((mutations) => {
        let shouldProcess = false;

        for (const mutation of mutations) {
            if (mutation.type === 'attributes') {
                const target = mutation.target;
                if (target instanceof Element) {
                    if ((target.matches && target.matches(STAR_CANDIDATE_SELECTOR))
                        || (target.closest && (target.closest('[data-stream-item-id]') || target.closest('[data-course-work-id]')))
                        || (target.querySelector && target.querySelector(STAR_CANDIDATE_SELECTOR))) {
                        shouldProcess = true;
                        break;
                    }
                }
                continue;
            }

            if (mutation.type !== 'childList') continue;
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue;
                if ((node.matches && node.matches(STAR_CANDIDATE_SELECTOR)) || (node.querySelector && node.querySelector(STAR_CANDIDATE_SELECTOR))) {
                    shouldProcess = true;
                    break;
                }
            }
            if (shouldProcess) break;
        }

        if (shouldProcess) {
            processCards();
        }
    });

    function runPostNavigationRescanBurst() {
        let ticks = 0;
        const maxTicks = 8;
        const intervalId = setInterval(() => {
            ticks += 1;
            processCards();
            if (ticks >= maxTicks) {
                clearInterval(intervalId);
            }
        }, 220);
    }

    let pathSnapshot = window.location.pathname + window.location.search;

    function handlePathChange() {
        const current = window.location.pathname + window.location.search;
        if (current === pathSnapshot) return;
        pathSnapshot = current;
        processCards();
        handlePendingAutoStar();
        runPostNavigationRescanBurst();
    }

    window.addEventListener('popstate', handlePathChange);
    window.addEventListener('locationchange', handlePathChange);

    window.addEventListener('mc:starred-assignments-updated', () => {
        refreshButtons();
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            processCards();
            handlePendingAutoStar();
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['data-stream-item-id', 'data-course-work-id', 'aria-label', 'href', 'data-href']
            });
        });
    } else {
        processCards();
        handlePendingAutoStar();
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['data-stream-item-id', 'data-course-work-id', 'aria-label', 'href', 'data-href']
        });
    }
})();
