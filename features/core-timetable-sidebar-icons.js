(function() {
    'use strict';

    const FEATURE_KEY = 'modernClassroom_featureTimetable';
    const FEATURE_DEFAULT = true;

    function isFeatureEnabled() {
        try {
            const raw = localStorage.getItem(FEATURE_KEY);
            return raw === null ? FEATURE_DEFAULT : raw !== 'false';
        } catch (_) {
            return FEATURE_DEFAULT;
        }
    }

    // ==========================================
    // TIMETABLE BUTTON
    // ==========================================
    const timetableButtonConfig = {
        targetSelector: 'div.Mtd4hb.gmNu1d[data-restore-view-focus]'
    };

    function createTimetableButton() {
        const button = document.createElement('button');
        button.className = 'mc-left-action-btn';
        button.type = 'button';
        button.setAttribute('aria-label', 'Open timetable');
        // Use packaged SVG icon from the extension so it remains crisp and themeable
        const iconUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) ? chrome.runtime.getURL('Icons/timetable.svg') : '';
        button.innerHTML = `<img class="mc-left-action-icon" src="${iconUrl}" alt="" aria-hidden="true">`;

        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleTimetableMenu(button);
        });

        return button;
    }


    try {
        if (typeof window !== 'undefined') window.navigateToClassroom = navigateToClassroom;
    } catch (_) {}

    function createLiveWidget() {
        const host = document.createElement('div');
        host.className = 'mc-live-widget';
        host.style.display = 'none'; 
        host.style.position = 'fixed'; 
        host.style.pointerEvents = 'auto';
        host.style.zIndex = '1000';
        host.innerHTML = `
            <div class="mc-live-group mc-live-group-active" role="list" aria-label="Active classes"></div>
            <div class="mc-live-group mc-live-group-upcoming" role="list" aria-label="Upcoming classes"></div>
        `;
        host.addEventListener('click', (e) => {
            e.stopPropagation();
            const target = e.target;
            if (!(target instanceof Element)) return;
            const card = target.closest('.mc-live-card');
            if (card && card.dataset.classroom) navigateToClassroom(card.dataset.classroom);
        });
        host.addEventListener('keydown', (event) => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            const card = target.closest('.mc-live-card');
            if (!card) return;

            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                if (card.dataset.classroom) navigateToClassroom(card.dataset.classroom);
            } else if (event.key === 'Escape') {
                hideTimetableMenu();
            }
        });
        host.addEventListener('pointerover', (event) => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            const card = target.closest('.mc-live-card');
            if (!card || (event.relatedTarget instanceof Node && card.contains(event.relatedTarget))) return;

            const tooltip = card.querySelector('.mc-card-tooltip');
            if (!tooltip) return;

            const now = new Date();
            const currentMin = now.getHours() * 60 + now.getMinutes();
            const eventMin = Number(card.dataset.role === 'upcoming' ? card.dataset.startMin : card.dataset.endMin);
            const minutes = Math.max(0, eventMin - currentMin);
            tooltip.textContent = card.dataset.role === 'upcoming'
                ? `Starts in ${formatDurationCompact(minutes)}`
                : `${formatDurationCompact(minutes)} left`;
        });
        document.body.appendChild(host);
        return host;
    }

    function insertTimetableButton() {
        if (!isFeatureEnabled()) return;
        // Choose a visible target instance (there can be duplicates in the DOM; pick the visible one)
        const all = Array.from(document.querySelectorAll(timetableButtonConfig.targetSelector));
        function isVisible(el) { try { return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length)); } catch(_) { return false; } }
        let target = all.find(isVisible) || all[0];
        if (!target) return;

        const existingBtn = document.querySelector('.mc-left-action-btn');

        // Prefer to insert into the visible header action container so we're not coupled to a specific plus button
        const actionContainerCandidates = [
            '.fB7J9c.kWv2Xb.gmNu1d', // typical header wrapper
            ':scope > div' // fallback: immediate child container
        ];
        let actionContainer = null;
        for (const sel of actionContainerCandidates) {
            const c = Array.from(target.querySelectorAll(sel)).find(isVisible);
            if (c) { actionContainer = c; break; }
        }

        // If there's an existing button somewhere else, move it into the visible action container
        if (existingBtn) {
            try {
                if (actionContainer) {
                    // Insert as the first element so it appears on the left side of that container
                    actionContainer.insertBefore(existingBtn, actionContainer.firstElementChild);
                } else if (target.firstElementChild) {
                    target.insertBefore(existingBtn, target.firstElementChild);
                } else {
                    target.appendChild(existingBtn);
                }
                existingBtn.style.display = '';
                try { updateLiveWidget(); } catch (_) {}
                return;
            } catch (_) {
                // fall through to create new button if moving fails
            }
        }

        // No existing button found - create and insert one into the action container (or fallback into target)
        const btn = createTimetableButton();
        if (actionContainer) {
            actionContainer.insertBefore(btn, actionContainer.firstElementChild);
        } else if (target.firstElementChild) {
            target.insertBefore(btn, target.firstElementChild);
        } else {
            target.appendChild(btn);
        }

        // Create floating widget once and attach to body (if not already created)
        if (!document.querySelector('.mc-live-widget')) {
            createLiveWidget();
        }

        // Ensure live widget gets initial data
        try { updateLiveWidget(); } catch (_) {}

        // Start watching for button movement so the floating widget stays correctly positioned
        try { startButtonPositionWatcher(); } catch (_) {}
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', insertTimetableButton);
    } else {
        insertTimetableButton();
    }

    setTimeout(insertTimetableButton, 200);
    setTimeout(insertTimetableButton, 700);

    // -----------------------------
    // Live widget update logic
    // -----------------------------
    let __mc_live_hide_timer = null;
    let __mc_live_position_frame = 0;

    function updateLiveCardProgress(widget, now = new Date()) {
        const currentMin = now.getHours() * 60 + now.getMinutes();

        widget.querySelectorAll('.mc-live-card-active').forEach(card => {
            const startMin = Number(card.dataset.startMin);
            const endMin = Number(card.dataset.endMin);
            if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || startMin >= endMin) return;

            const duration = endMin - startMin;
            const elapsed = Math.max(0, Math.min(currentMin - startMin, duration));
            const swatch = card.querySelector('.mc-card-swatch-active');
            if (swatch) swatch.style.setProperty('--swatch-progress', `${(elapsed / duration) * 100}%`);
        });

        widget.querySelectorAll('.mc-live-card-upcoming').forEach(card => {
            const startMin = Number(card.dataset.startMin);
            if (!Number.isFinite(startMin)) return;

            const progress = Math.max(0, Math.min(100, 100 - ((startMin - currentMin) / 15) * 100));
            const swatch = card.querySelector('.mc-card-swatch-upcoming');
            if (swatch) swatch.style.setProperty('--swatch-opacity', (0.2 + (progress / 100) * 0.8).toFixed(3));
        });
    }

    function createLiveCard(item, role) {
        const { c: cls, p: period } = item;
        const classTitle = cls.title || '';
        const room = period.room || cls.room;
        const card = document.createElement('div');

        card.className = `mc-live-card ${role === 'upcoming' ? 'mc-live-card-upcoming' : 'mc-live-card-active'}`;
        card.dataset.role = role;
        card.dataset.startMin = item.startMin || 0;
        card.dataset.endMin = item.endMin || 0;
        if (cls.classroom && String(cls.classroom).trim()) card.dataset.classroom = cls.classroom;
        card.setAttribute('role', 'button');
        card.tabIndex = 0;

        const color = escapeHtml(cls.colour || '#9aa0a6');

        if (role === 'upcoming') {
            const title = `${escapeHtml(classTitle)}${room ? ` • ${escapeHtml(room)}` : ''}`;
            card.innerHTML = `
                <div class="mc-card-swatch mc-card-swatch-upcoming" data-colour="${color}" style="--swatch-color: ${color}; background: transparent;"></div>
                <div class="mc-card-mini-content">
                    <div class="mc-card-mini-title">${title}</div>
                    <div class="mc-card-mini-period">Starts at ${escapeHtml(formatTimeToAmPm(period.start))}</div>
                </div>
                <div class="mc-card-tooltip">Starts in --</div>
            `;
            card.setAttribute('aria-label', `${classTitle || 'Class'} starts at ${formatTimeToAmPm(period.start)}`);
        } else {
            const metaParts = [cls.teacher, room].filter(Boolean).map(escapeHtml);
            card.innerHTML = `
                <div class="mc-card-swatch mc-card-swatch-active" data-colour="${color}" style="--swatch-color: ${color}; background: transparent;"></div>
                <div class="mc-card-mini-content">
                    <div class="mc-card-mini-title">${escapeHtml(classTitle)}</div>
                    ${metaParts.length ? `<div class="mc-card-mini-meta">${metaParts.join(' • ')}</div>` : ''}
                    <div class="mc-card-mini-period">${escapeHtml(formatTimeToAmPm(period.start))} - ${escapeHtml(formatTimeToAmPm(period.end))}</div>
                </div>
                <div class="mc-card-tooltip">-- left</div>
            `;
            card.setAttribute('aria-label', `${classTitle || 'Class'} active until ${formatTimeToAmPm(period.end)}`);
        }

        return card;
    }

    function positionLiveWidget() {
        const widget = document.querySelector('.mc-live-widget');
        if (!widget || widget.style.display === 'none') return;

        const button = document.querySelector('.mc-left-action-btn');
        const widgetRect = widget.getBoundingClientRect();
        let left = 8;
        if (button) {
            const buttonRect = button.getBoundingClientRect();
            left = buttonRect.left - widgetRect.width - 8;
            if (left < 8) left = buttonRect.right + 8;
        }

        const nextLeft = `${Math.round(left)}px`;
        if (widget.style.left !== nextLeft) widget.style.left = nextLeft;
        if (widget.style.top !== '0px') widget.style.top = '0px';
    }

    function scheduleLiveWidgetPosition() {
        if (__mc_live_position_frame) return;
        __mc_live_position_frame = requestAnimationFrame(() => {
            __mc_live_position_frame = 0;
            positionLiveWidget();
        });
    }

    function updateLiveWidget() {
        try {
            const widget = document.querySelector('.mc-live-widget');
            if (!widget) return;
            // If the widget has been reparented into the page header (or elsewhere) move it back
            if (widget.parentElement !== document.body) {
                try { document.body.appendChild(widget); } catch (_) {}
            }
            // Enforce fixed positioning and auto width so page CSS/JS can't stretch it
            widget.style.position = 'fixed';
            widget.style.width = 'auto';
            widget.style.maxWidth = 'none';
            let activeGroup = widget.querySelector('.mc-live-group-active');
            let upcomingGroup = widget.querySelector('.mc-live-group-upcoming');
            if (!activeGroup || !upcomingGroup) {
                widget.innerHTML = `
                    <div class="mc-live-group mc-live-group-active" role="list" aria-label="Active classes"></div>
                    <div class="mc-live-group mc-live-group-upcoming" role="list" aria-label="Upcoming classes"></div>
                `;
                activeGroup = widget.querySelector('.mc-live-group-active');
                upcomingGroup = widget.querySelector('.mc-live-group-upcoming');
            }

            const classes = getStoredClasses() || [];
            try { renderTodayPanel(classes); } catch (_) {}
            const now = new Date();
            const today = now.getDay();
            const nowMin = now.getHours() * 60 + now.getMinutes();
            const activePeriods = [];
            const upcomingPeriods = [];
            let nextStartMin = Infinity;

            classes.forEach(cls => {
                (cls.periods || []).forEach(period => {
                    if (!period || Number(period.day) !== today || !period.start || !period.end) return;

                    const item = {
                        c: cls,
                        p: period,
                        startMin: parseTimeToMinutes(period.start),
                        endMin: parseTimeToMinutes(period.end)
                    };
                    if (item.startMin <= nowMin && nowMin < item.endMin) {
                        activePeriods.push(item);
                    } else if (item.startMin > nowMin) {
                        if (item.startMin < nextStartMin) {
                            nextStartMin = item.startMin;
                            upcomingPeriods.length = 0;
                        }
                        if (item.startMin === nextStartMin) upcomingPeriods.push(item);
                    }
                });
            });
            activePeriods.sort((a, b) => a.startMin - b.startMin);

            if (!activePeriods.length && !upcomingPeriods.length) {
                if (__mc_live_hide_timer) clearTimeout(__mc_live_hide_timer);
                __mc_live_hide_timer = setTimeout(() => { widget.style.display = 'none'; }, 600);
                return;
            }

            if (__mc_live_hide_timer) { clearTimeout(__mc_live_hide_timer); __mc_live_hide_timer = null; }

                // Show and position widget near the left button
            widget.style.display = 'inline-flex';
            widget.style.alignItems = 'stretch';
            widget.style.gap = '8px';

            activeGroup.innerHTML = '';
            upcomingGroup.innerHTML = '';

            if (activePeriods.length) {
                activePeriods.forEach(item => {
                    const card = createLiveCard(item, 'active');
                    activeGroup.appendChild(card);
                });
            }

            if (upcomingPeriods.length) {
                upcomingPeriods.forEach(item => {
                    const card = createLiveCard(item, 'upcoming');
                    upcomingGroup.appendChild(card);
                });
            }

            updateLiveCardProgress(widget);

            const hasActiveCards = activeGroup.childElementCount > 0;
            const hasUpcomingCards = upcomingGroup.childElementCount > 0;

            activeGroup.style.display = hasActiveCards ? 'flex' : 'none';
            activeGroup.setAttribute('aria-hidden', hasActiveCards ? 'false' : 'true');
            upcomingGroup.style.display = hasUpcomingCards ? 'flex' : 'none';
            upcomingGroup.setAttribute('aria-hidden', hasUpcomingCards ? 'false' : 'true');
            upcomingGroup.classList.toggle('mc-live-group-alone', hasUpcomingCards && !hasActiveCards);

            scheduleLiveWidgetPosition();

        } catch (e) { console.debug('updateLiveWidget error', e); }
    }

    // periodic refresh and storage events
    try { updateLiveWidget(); } catch(_) {}
    setInterval(updateLiveWidget, 30 * 1000);
    
    window.addEventListener('storage', (e) => { 
        // Listen for any of the timetable storage keys or the current index
        if (e.key && (e.key.startsWith('mcTimetableClasses_') || e.key === 'mcTimetableCurrentIndex')) {
            if (e.key === 'mcTimetableCurrentIndex') {
                // Reload timetable index from storage
                loadTimetableIndex();
            }
            updateLiveWidget();
        }
    });
    // Reposition without rebuilding cards or rereading timetable storage.
    window.addEventListener('resize', scheduleLiveWidgetPosition, { passive: true });
    window.addEventListener('scroll', scheduleLiveWidgetPosition, { passive: true, capture: true });

    function navigateToClassroom(targetUrl) {
        if (!targetUrl) return false;
        try {
            // Build resolved URL and, when navigating to a /c/ path, prefer keeping the current /u/N/ prefix
            let resolved = new URL(targetUrl, window.location.href);

            try {
                const curPath = window.location.pathname || '/';
                const accountMatch = curPath.match(/^\/u\/\d+/);
                const accountPrefix = accountMatch ? accountMatch[0] : '';

                // If the resolved path contains a '/c/...' segment (possibly prefixed by /u/N/),
                // extract that suffix and rebuild the URL using the current account prefix so
                // we navigate under the active profile (e.g. /u/1/c/ID).
                const path = resolved.pathname || '';
                const cIdx = path.indexOf('/c/');
                if (cIdx !== -1) {
                    let classPath = path.slice(cIdx);
                    // ensure single leading slash
                    classPath = classPath.startsWith('/') ? classPath : `/${classPath}`;
                    if (accountPrefix) {
                        const newPath = `${accountPrefix}${classPath}`; // '/u/1' + '/c/ID' => '/u/1/c/ID'
                        resolved = new URL(newPath + (resolved.search || '') + (resolved.hash || ''), window.location.origin);
                    } else if (!path.startsWith('/c/')) {
                        // normalize to the '/c/...' variant
                        resolved = new URL(classPath + (resolved.search || '') + (resolved.hash || ''), window.location.origin);
                    }
                }
            } catch (e) {
                // ignore and proceed with original resolved
            }
            const sameOrigin = resolved.origin === window.location.origin;
            const hrefVariants = sameOrigin ? [
                resolved.pathname + resolved.search + resolved.hash,
                resolved.pathname + resolved.search,
                resolved.pathname
            ] : [];

            const anchors = Array.from(document.querySelectorAll('a[href]'));
            let anchor = anchors.find((el) => {
                try {
                    if (el.href === resolved.href) return true;
                    if (!sameOrigin) return false;
                    const attr = el.getAttribute('href') || '';
                    return hrefVariants.includes(attr);
                } catch (_) { return false; }
            }) || null;

            if (!anchor && resolved.pathname.startsWith('/c/')) {
                const idFragment = resolved.pathname.split('/').filter(Boolean).pop();
                if (idFragment) {
                    const candidates = document.querySelectorAll('a[href*="/c/"]');
                    anchor = Array.from(candidates).find((el) => {
                        try { return el.href.includes(idFragment); } catch (_) { return false; }
                    }) || null;
                }
            }

            if (anchor) {
                anchor.click();
                return true;
            }

            window.location.href = resolved.href;
            return true;
        } catch (err) {
            console.debug('navigateToClassroom fallback', err);
        }
        return false;
    }

    try {
        const timetableButtonObserver = new MutationObserver((mutations) => {
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (!(node instanceof Element)) continue;

                    if (node.matches && node.matches(timetableButtonConfig.targetSelector)) {
                        insertTimetableButton();
                        return;
                    }

                    if (node.querySelector && node.querySelector(timetableButtonConfig.targetSelector)) {
                        insertTimetableButton();
                        return;
                    }
                }
            }
        });

        timetableButtonObserver.observe(document.body, { childList: true, subtree: true });
    } catch (e) {
        console.warn('Left-of-settings observer failed:', e);
    }

    // Observe body class changes so live widget updates when homepage schedule visibility toggles
    try {
        const bodyClassObserver = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.type === 'attributes' && m.attributeName === 'class') {
                    try { updateLiveWidget(); } catch (_) {}
                }
            }
        });
        bodyClassObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    } catch (e) {
        // silent
    }

    // Monitor button position and trigger updates when it moves (helps when the header is reflowed or re-parented)
    let __mc_btn_check_interval = null;
    let __mc_btn_last_rect = '';
    function startButtonPositionWatcher() {
        if (__mc_btn_check_interval) return;
        __mc_btn_check_interval = setInterval(() => {
            const btn = document.querySelector('.mc-left-action-btn');
            if (!btn) { stopButtonPositionWatcher(); return; }
            const r = btn.getBoundingClientRect();
            const rectStr = `${Math.round(r.left)}|${Math.round(r.top)}|${Math.round(r.width)}|${Math.round(r.height)}`;
            if (rectStr !== __mc_btn_last_rect) {
                __mc_btn_last_rect = rectStr;
                scheduleLiveWidgetPosition();
            }
        }, 500);
    }
    function stopButtonPositionWatcher() {
        if (__mc_btn_check_interval) { clearInterval(__mc_btn_check_interval); __mc_btn_check_interval = null; __mc_btn_last_rect = ''; }
    }

    // Start watching shortly after load and on subsequent insertions
    setTimeout(startButtonPositionWatcher, 200);
    setTimeout(startButtonPositionWatcher, 700);

    // TIMETABLE: small popup showing Sun-Sat and live time indicator
    const mcTimetable = {
        container: null,
        todayPanel: null,
        todayHideTimer: null,
        intervalId: null,
        currentTimetableIndex: 0  // Track which timetable is active (0, 1, or 2)
    };

    // Migrate old timetable data to new structure using localStorage only.
    async function migrateOldTimetableData() {
        try {
            if (window.__modernClassroomInitialCloudHydration) {
                await window.__modernClassroomInitialCloudHydration;
            }
        } catch (_) {}

        try {
            const oldKey = 'mcTimetableClasses';
            const newClassesKey = 'mcTimetableClassesShared';
            const newPeriodsKey = 'mcTimetableClasses_0';

            const oldData = localStorage.getItem(oldKey);
            const newClassesData = localStorage.getItem(newClassesKey);

            if (oldData && !newClassesData) {
                try {
                    const oldClasses = JSON.parse(oldData);
                    if (!Array.isArray(oldClasses)) return;
                    const classesList = oldClasses.map(c => {
                        const { periods, ...classData } = c;
                        return classData;
                    });
                    const periodsMap = {};
                    oldClasses.forEach(c => {
                        if (c.id && c.periods) {
                            periodsMap[c.id] = c.periods;
                        }
                    });
                    localStorage.setItem(newClassesKey, JSON.stringify(classesList));
                    localStorage.setItem(newPeriodsKey, JSON.stringify(periodsMap));
                    console.log('Successfully migrated timetable data to new local structure (classes + periods)');
                } catch (e) {
                    console.warn('Failed to parse and migrate old data:', e);
                }
            }
        } catch (e) {
            console.warn('Timetable migration error:', e);
        }
    }

    // Run migration on startup
    migrateOldTimetableData().catch(() => {});

    // Save/load current timetable index
    function saveTimetableIndex() {
        try {
            if (typeof storageSet === 'function') {
                storageSet('mcTimetableCurrentIndex', mcTimetable.currentTimetableIndex);
            } else {
                localStorage.setItem('mcTimetableCurrentIndex', mcTimetable.currentTimetableIndex);
            }
        } catch (e) {}
    }

    function loadTimetableIndex() {
        try {
            const idx = localStorage.getItem('mcTimetableCurrentIndex');
            if (idx !== null) mcTimetable.currentTimetableIndex = parseInt(idx);
        } catch (e) {}
    }

    // Load on startup
    loadTimetableIndex();

    function createTimetableMenu() {
        if (mcTimetable.container) return mcTimetable.container;

        const container = document.createElement('div');
        container.className = 'mc-timetable';
        container.setAttribute('role', 'dialog');
        container.setAttribute('aria-label', 'Timetable');
        container.tabIndex = -1;

        // Header with timetable picker and edit button
        const header = document.createElement('div');
        header.className = 'mc-timetable-header';

        const timetableNames = ['Timetable 1', 'Timetable 2', 'Timetable 3'];

        function normalizeTimetableIndex(index) {
            const count = timetableNames.length;
            if (!count) return 0;
            const num = Number(index);
            if (!Number.isFinite(num)) return 0;
            return ((Math.trunc(num) % count) + count) % count;
        }

        function applyTimetableIndex(index) {
            const nextIndex = normalizeTimetableIndex(index);
            mcTimetable.currentTimetableIndex = nextIndex;
            if (options) {
                options.querySelectorAll('.mc-timetable-option').forEach((option) => {
                    const isSelected = Number(option.dataset.index) === nextIndex;
                    option.classList.toggle('active', isSelected);
                    option.setAttribute('aria-pressed', String(isSelected));
                });
            }
            saveTimetableIndex();
            try { updateLiveWidget(); } catch (_) {}
            try { updateHeaderBackgroundForActiveCourse(); } catch (_) {}
            try { renderPeriodsOnTimetable(); } catch (_) {}
        }

        const titleContainer = document.createElement('div');
        titleContainer.className = 'mc-timetable-title-container';

        const options = document.createElement('div');
        options.className = 'mc-timetable-options mc-timetable-number-row';
        options.setAttribute('role', 'group');
        options.setAttribute('aria-label', 'Choose timetable');
        options.setAttribute('aria-live', 'polite');

        timetableNames.forEach((name, index) => {
            const option = document.createElement('button');
            option.className = 'mc-timetable-option';
            option.type = 'button';
            option.dataset.index = String(index);
            const isSelected = index === normalizeTimetableIndex(mcTimetable.currentTimetableIndex);
            option.classList.toggle('active', isSelected);
            option.setAttribute('aria-pressed', String(isSelected));
            option.setAttribute('aria-label', name);
            option.title = name;

            const number = document.createElement('span');
            number.className = 'mc-timetable-option-number';
            number.textContent = String(index + 1);

            const label = document.createElement('span');
            label.className = 'mc-timetable-option-name';
            label.textContent = 'Timetable';

            option.append(label, number);
            option.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                applyTimetableIndex(index);
            });
            options.appendChild(option);
        });

        titleContainer.appendChild(options);
        header.appendChild(titleContainer);

        const editBtn = document.createElement('button');
        editBtn.className = 'mc-timetable-edit-btn';
        editBtn.type = 'button';
        editBtn.setAttribute('aria-label', 'Edit timetable');
        editBtn.title = 'Edit';
        // Use packaged pencil SVG for crisp rendering
        const editIconUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) ? chrome.runtime.getURL('Icons/Edit.svg') : '';
        editBtn.innerHTML = `<img class="mc-timetable-edit-icon" src="${editIconUrl}" alt="" aria-hidden="true">`;
        editBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openEditTimetableMenu();
        });
        header.appendChild(editBtn);
        container.appendChild(header);

        // Days grid
        const daysGrid = document.createElement('div');
        daysGrid.className = 'mc-timetable-grid';

        const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        const currentDay = new Date().getDay();
        dayNames.forEach((d, i) => {
            const day = document.createElement('div');
            day.className = 'mc-timetable-day';
            if (i === currentDay) day.classList.add('mc-timetable-day-current');
            day.dataset.dayIndex = i;

            const label = document.createElement('div');
            label.className = 'mc-timetable-day-label';
            label.textContent = d;

            const timeline = document.createElement('div');
            timeline.className = 'mc-timetable-timeline';
            timeline.setAttribute('data-day', i);

            day.appendChild(label);
            day.appendChild(timeline);
            daysGrid.appendChild(day);
        });

        container.appendChild(daysGrid);

        const todayPanel = document.createElement('section');
        todayPanel.className = 'mc-today-panel';
        todayPanel.setAttribute('aria-labelledby', 'mc-today-panel-title');

        const todayTitle = document.createElement('div');
        todayTitle.className = 'mc-today-panel-title';
        todayTitle.id = 'mc-today-panel-title';
        todayTitle.textContent = 'Today';

        const todayRow = document.createElement('div');
        todayRow.className = 'mc-today-row';
        todayRow.setAttribute('role', 'list');

        todayPanel.appendChild(todayTitle);
        todayPanel.appendChild(todayRow);
        mcTimetable.todayPanel = todayPanel;

        // Background indicator element (semi-transparent, spans all days)
        const indicatorBg = document.createElement('div');
        indicatorBg.className = 'mc-timetable-indicator-bg';
        container.appendChild(indicatorBg);

        // Bright indicator element (full opacity with glow, only on current day)
        const indicator = document.createElement('div');
        indicator.className = 'mc-timetable-indicator';
        container.appendChild(indicator);

        mcTimetable.container = container;
        return container;
    }

    function openEditTimetableMenu() {
        // If overlay already exists just focus it
        const existing = document.querySelector('.mc-timetable-edit-overlay');
        if (existing) return;

        const STORAGE_KEY_PREFIX = 'mcTimetableClasses_';
        const STORAGE_KEY = STORAGE_KEY_PREFIX + mcTimetable.currentTimetableIndex;
        const STORAGE_CLASSES_KEY = 'mcTimetableClassesShared';  // Shared across all timetables
        const BLOCKS_KEY_PREFIX = 'mcTimetableBlocks_';
        const BLOCKS_SHARED_KEY = 'mcTimetableBlocksShared';
        const BLOCKS_LEGACY_KEYS = [
            BLOCKS_KEY_PREFIX + '0',
            BLOCKS_KEY_PREFIX + '1',
            BLOCKS_KEY_PREFIX + '2'
        ];

        function mergeBlockArrays(...sources) {
            const merged = [];
            const seen = new Set();
            sources.forEach((source) => {
                if (!Array.isArray(source)) return;
                source.forEach((block, index) => {
                    if (!block || typeof block !== 'object') return;
                    const blockId = String(block.id || `legacy_${block.name || 'block'}_${index}`);
                    if (seen.has(blockId)) return;
                    seen.add(blockId);
                    merged.push(block);
                });
            });
            return merged;
        }

        function migrateLegacyLocalBlocks() {
            try {
                const sharedRaw = localStorage.getItem(BLOCKS_SHARED_KEY);
                const sharedBlocks = sharedRaw ? JSON.parse(sharedRaw) : [];
                if (Array.isArray(sharedBlocks) && sharedBlocks.length) {
                    return sharedBlocks;
                }
                const legacyBlocks = BLOCKS_LEGACY_KEYS.map((key) => {
                    try {
                        const raw = localStorage.getItem(key);
                        return raw ? JSON.parse(raw) : [];
                    } catch (_) {
                        return [];
                    }
                });
                const merged = mergeBlockArrays(...legacyBlocks);
                if (merged.length) {
                    localStorage.setItem(BLOCKS_SHARED_KEY, JSON.stringify(merged));
                }
                return merged;
            } catch (_) {
                return [];
            }
        }

        // Load classes from storage (synchronously from localStorage)
        function loadClasses() {
            try {
                // First try to load shared classes
                const raw = localStorage.getItem(STORAGE_CLASSES_KEY);
                return raw ? JSON.parse(raw) : [];
            } catch (e) { return []; }
        }

        // Load periods for current timetable
        function loadPeriods() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                return raw ? JSON.parse(raw) : {};  // Map of classId -> periods array
            } catch (e) { return {}; }
        }

        function loadBlocks() {
            try {
                const raw = localStorage.getItem(BLOCKS_SHARED_KEY);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed)) return parsed;
                }
                return migrateLegacyLocalBlocks();
            } catch (e) { return []; }
        }

        // Local-only sync stub retained for compatibility with the rest of the module.
        function syncClassesFromChrome() {
            return;
        }

        function saveClasses(classes) {
            try {
                if (typeof storageSet === 'function') {
                    storageSet(STORAGE_CLASSES_KEY, classes);
                } else {
                    localStorage.setItem(STORAGE_CLASSES_KEY, JSON.stringify(classes));
                }
            } catch (e) { console.warn('Failed to save classes', e); }
            try { updateLiveWidget(); } catch (_) {}
        }

        // Save periods for current timetable
        function savePeriods(periodsMap) {
            try {
                if (typeof storageSet === 'function') {
                    storageSet(STORAGE_KEY, periodsMap);
                } else {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(periodsMap));
                }
            } catch (e) { console.warn('Failed to save periods', e); }
            try { updateLiveWidget(); } catch (_) {}
        }

        function saveBlocks(nextBlocks) {
            blocks = Array.isArray(nextBlocks) ? nextBlocks : [];
            try { console.log('mc:saveBlocks', blocks.length, blocks.map(b=>b.id)); } catch (_) {}
            try {
                if (typeof storageSet === 'function') {
                    storageSet(BLOCKS_SHARED_KEY, blocks);
                } else {
                    localStorage.setItem(BLOCKS_SHARED_KEY, JSON.stringify(blocks));
                }
            } catch (e) { console.warn('Failed to save blocks', e); }
            renderSidebarList();
        }

        function generateId() { return 'c_' + Math.random().toString(36).slice(2,9); }

        // Helper: attach current timetable's periods to a class object
        function attachPeriodsToClass(classObj) {
            const periods = classPeriods[classObj.id] || [];
            return Object.assign({}, classObj, { periods });
        }

        // Helper: extract and save periods from a class object
        function extractAndSavePeriods(classObj) {
            if (classObj.periods) {
                classPeriods[classObj.id] = classObj.periods;
                savePeriods(classPeriods);
            }
        }

        let classes = loadClasses();
        let classPeriods = loadPeriods();  // Map of classId -> periods array
        let blocks = loadBlocks();
        let selectedId = classes.length ? classes[0].id : null;
        let selectedBlockId = blocks.length ? blocks[0].id : null;
        let sidebarMode = 'classes';
        let draggedBlockId = null;

        // Local-only startup check: the edit menu works with locally loaded data only.
        syncClassesFromChrome();

        const overlay = document.createElement('div');
        overlay.className = 'mc-timetable-edit-overlay';

        const panel = document.createElement('div');
        panel.className = 'mc-edit-panel';

        // Left: classes list
        const left = document.createElement('div');
        left.className = 'mc-edit-list';

        const leftHeader = document.createElement('div');
        leftHeader.className = 'mc-edit-list-header';
        
        const listTabs = document.createElement('div');
        listTabs.className = 'mc-schedule-tabs mc-list-tabs';
        listTabs.setAttribute('role', 'tablist');
        
        const classesTab = document.createElement('button');
        classesTab.type = 'button';
        classesTab.className = 'mc-schedule-tab mc-schedule-tab-active';
        classesTab.setAttribute('data-tab', 'classes');
        classesTab.setAttribute('role', 'tab');
        classesTab.setAttribute('aria-selected', 'true');
        classesTab.textContent = 'Classes';
        
        const blocksTab = document.createElement('button');
        blocksTab.type = 'button';
        blocksTab.className = 'mc-schedule-tab';
        blocksTab.setAttribute('data-tab', 'blocks');
        blocksTab.setAttribute('role', 'tab');
        blocksTab.setAttribute('aria-selected', 'false');
        blocksTab.textContent = 'Blocks';
        
        listTabs.appendChild(classesTab);
        listTabs.appendChild(blocksTab);
        leftHeader.appendChild(listTabs);

        left.appendChild(leftHeader);

        const list = document.createElement('div');
        list.className = 'mc-class-list';

        const addEntry = document.createElement('div');
        addEntry.className = 'mc-class-item-row mc-class-add-entry';

        const addItem = document.createElement('div');
        addItem.className = 'mc-class-item';
        addItem.dataset.id = 'mc-add-class-row';

        const addContent = document.createElement('div');
        addContent.className = 'mc-class-item-content';

        const addDot = document.createElement('span');
        addDot.className = 'mc-class-dot';
        addDot.style.background = '#9aa0a6';

        const addInput = document.createElement('input');
        addInput.type = 'text';
        addInput.className = 'mc-class-add-input';
        addInput.placeholder = 'New Class';
        addInput.setAttribute('aria-label', 'New Class');

        const updateAddInputPlaceholder = () => {
            const placeholder = sidebarMode === 'blocks' ? 'New Block' : 'New Class';
            const ariaLabel = sidebarMode === 'blocks' ? 'New block name' : 'New Class';
            addInput.placeholder = placeholder;
            addInput.setAttribute('aria-label', ariaLabel);
        };
        updateAddInputPlaceholder();

        addContent.appendChild(addDot);
        addContent.appendChild(addInput);
        addItem.appendChild(addContent);

        const addConfirmBtn = document.createElement('button');
        addConfirmBtn.type = 'button';
        addConfirmBtn.className = 'mc-add-row-btn';
        addConfirmBtn.textContent = '+';
        addConfirmBtn.title = 'Create class';
        addConfirmBtn.setAttribute('aria-label', 'Create class');

        addEntry.appendChild(addItem);
        addEntry.appendChild(addConfirmBtn);

        function createClassFromInput() {
            const title = String(addInput.value || '').trim();
            if (!title) {
                addInput.focus();
                return;
            }
            if (sidebarMode === 'blocks') {
                const newBlock = {
                    id: 'b_' + Math.random().toString(36).slice(2, 8),
                    name: title,
                    items: []
                };
                openBlockEditor(newBlock);
                addInput.value = '';
                addConfirmBtn.classList.remove('visible');
                return;
            }
            const newClass = {
                id: generateId(),
                title,
                teacher: '',
                room: '',
                classroom: '',
                classroomName: '',
                colour: '#9aa0a6',
                periods: []
            };
            classes.unshift(newClass);
            saveClasses(classes);
            selectedId = newClass.id;
            addInput.value = '';
            addConfirmBtn.classList.remove('visible');
            renderSidebarList();
            renderEditFormFor(newClass);
            setTimeout(() => {
                const titleInput = form.querySelector('.mc-input-title');
                if (titleInput) titleInput.focus();
            }, 0);
        }

        addConfirmBtn.addEventListener('click', createClassFromInput);
        addInput.addEventListener('input', () => {
            const hasText = String(addInput.value || '').trim().length > 0;
            addConfirmBtn.classList.toggle('visible', hasText);
        });

        addInput.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                if (String(addInput.value || '').trim().length > 0) {
                    createClassFromInput();
                }
            }
        });

        list.appendChild(addEntry);
        left.appendChild(list);

        // Tab switching logic
        function updateTabState() {
            const isBlocksMode = sidebarMode === 'blocks';
            classesTab.classList.toggle('mc-schedule-tab-active', !isBlocksMode);
            classesTab.setAttribute('aria-selected', !isBlocksMode ? 'true' : 'false');
            blocksTab.classList.toggle('mc-schedule-tab-active', isBlocksMode);
            blocksTab.setAttribute('aria-selected', isBlocksMode ? 'true' : 'false');
            
            // Update placeholder text based on mode
            updateAddInputPlaceholder();
        }
        
        classesTab.addEventListener('click', () => {
            if (sidebarMode !== 'classes') {
                sidebarMode = 'classes';
                resetClearTimetableButton();
                renderSidebarList();
                updateTabState();
            }
        });
        
        blocksTab.addEventListener('click', () => {
            if (sidebarMode !== 'blocks') {
                sidebarMode = 'blocks';
                resetClearTimetableButton();
                renderSidebarList();
                updateTabState();
            }
        });
        
        // Initialize tab state
        updateTabState();

        const right = document.createElement('div');
        right.className = 'mc-edit-form';

        const form = document.createElement('form');
        form.className = 'mc-edit-form-fields';
        form.addEventListener('submit', (e) => { e.preventDefault(); });

        const detailsCard = document.createElement('div');
        detailsCard.className = 'mc-class-details-card';

        const scheduleCard = document.createElement('div');
        scheduleCard.className = 'mc-schedule-editor-card mc-field-row mc-field-schedule';

        // Top row: Colour + Title
        const topRow = document.createElement('div');
        topRow.className = 'mc-field-row mc-top-row';
        topRow.innerHTML = `
            <div class="mc-top-inputs">
                <div class="mc-colour-control">
                    <button type="button" class="mc-input-colour-trigger mc-picker-trigger" aria-label="Choose class colour" aria-expanded="false" title="Choose class colour">
                        <span class="mc-input-colour-swatch mc-picker-trigger-swatch" aria-hidden="true"></span>
                    </button>
                    <input name="colour" type="text" class="mc-input-colour mc-input-hidden" aria-hidden="true" tabindex="-1">
                    <div class="mc-inline-colour-picker" hidden>
                        <div class="mc-inline-colour-picker-header">
                            <div class="mc-inline-colour-picker-title">Class colour</div>
                            <button type="button" class="mc-inline-colour-picker-close" aria-label="Close colour picker">&times;</button>
                        </div>
                        <div class="mc-colour-picker-hex-row mc-picker-hex-row">
                            <input type="text" class="mc-inline-colour-picker-hex mc-picker-hex mc-unified-hex-input" placeholder="#9aa0a6" aria-label="Hex colour">
                        </div>
                        <div class="mc-inline-colour-picker-sv-wrap mc-picker-sv">
                            <canvas class="mc-inline-colour-picker-sv mc-picker-sv-canvas" width="260" height="130" aria-hidden="true"></canvas>
                            <div class="mc-inline-colour-picker-marker mc-picker-marker" aria-hidden="true"></div>
                        </div>
                        <input type="range" min="0" max="360" value="0" class="mc-inline-colour-picker-hue mc-picker-hue" aria-label="Hue">
                        <div class="mc-inline-colour-picker-footer">
                            <div class="mc-inline-colour-picker-preview mc-picker-preview" aria-hidden="true"></div>
                        </div>
                    </div>
                </div>
                <input name="title" type="text" class="mc-input-title" placeholder="Title" aria-label="Title">
            </div>
        `;
        detailsCard.appendChild(topRow);

        // Middle row: Teacher, Room and Classroom side-by-side
        const midRow = document.createElement('div');
        midRow.className = 'mc-field-row mc-mid-row';
        midRow.innerHTML = `
            <div class="mc-two-col">
                <div class="mc-two-col-item">
                    <input name="teacher" type="text" class="mc-input-teacher" placeholder="Teacher" aria-label="Teacher">
                </div>
                <div class="mc-two-col-item">
                    <input name="room" type="text" class="mc-input-room" placeholder="Room" aria-label="Room">
                </div>
                <div class="mc-two-col-item mc-two-col-item-classroom">
                    <div class="mc-classroom-field">
                        <div class="mc-classroom-selector" aria-live="polite">
                            <div class="mc-classroom-display" role="button" tabindex="0" aria-haspopup="listbox" aria-expanded="false">
                                <div class="mc-classroom-selected" data-placeholder="Link a Classroom">Link a Classroom</div>
                                <span class="mc-classroom-arrow" aria-hidden="true">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                </span>
                            </div>
                            <button type="button" class="mc-clear-classroom-btn" title="Remove classroom" aria-label="Remove classroom" disabled>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                            </button>
                            <input name="classroom" type="text" class="mc-input-classroom mc-input-hidden" aria-label="Classroom URL">
                        </div>
                        <div class="mc-classroom-dropdown" role="listbox" hidden></div>
                    </div>
                </div>
            </div>
        `;
        detailsCard.appendChild(midRow);
        const classroomInput = midRow.querySelector('.mc-input-classroom');
        const classroomSelectedEl = midRow.querySelector('.mc-classroom-selected');
        const classroomDropdownEl = midRow.querySelector('.mc-classroom-dropdown');
        const classroomSelectorEl = midRow.querySelector('.mc-classroom-selector');
        const classroomDisplayEl = midRow.querySelector('.mc-classroom-display');
        const clearClassroomBtn = midRow.querySelector('.mc-clear-classroom-btn');

        if (clearClassroomBtn) clearClassroomBtn.hidden = true;

        let classroomDropdownVisible = false;

        function updateClassroomDisplay(name, url) {
            if (classroomInput) classroomInput.value = url || '';
            if (!classroomSelectedEl) return;
            const placeholder = classroomSelectedEl.dataset.placeholder || 'No classroom linked';
            let displayName = (name && name.trim()) ? name.trim() : '';
            if (!displayName && url) {
                const available = findAvailableClassrooms();
                const matched = available.find(item => item.url === url);
                if (matched) displayName = matched.name;
            }
            if (!displayName && url) displayName = url;

            if (displayName) {
                classroomSelectedEl.textContent = displayName;
                classroomSelectedEl.dataset.label = displayName;
                classroomSelectedEl.classList.remove('mc-placeholder');
            } else {
                classroomSelectedEl.textContent = placeholder;
                classroomSelectedEl.classList.add('mc-placeholder');
                delete classroomSelectedEl.dataset.label;
            }
            const hasSelection = !!(displayName || url);
            if (classroomSelectorEl) {
                classroomSelectorEl.classList.toggle('mc-classroom-has-selection', hasSelection);
            }
            if (clearClassroomBtn) {
                clearClassroomBtn.disabled = !hasSelection;
                clearClassroomBtn.hidden = !hasSelection;
            }
        }

        function hideClassroomDropdown() {
            if (!classroomDropdownEl) return;
            classroomDropdownEl.hidden = true;
            classroomDropdownEl.innerHTML = '';
            classroomDropdownVisible = false;
            document.removeEventListener('click', handleDropdownOutsideClick, true);
            if (classroomDisplayEl) classroomDisplayEl.setAttribute('aria-expanded', 'false');
            if (classroomSelectorEl) classroomSelectorEl.classList.remove('open');
        }

        function handleDropdownOutsideClick(ev) {
            if (classroomSelectorEl && !classroomSelectorEl.contains(ev.target) && classroomDropdownEl && !classroomDropdownEl.contains(ev.target)) {
                hideClassroomDropdown();
            }
        }

        function findAvailableClassrooms() {
            const results = [];
            const cards = document.querySelectorAll('ol li');
            cards.forEach(card => {
                if (!(card instanceof HTMLElement)) return;
                if (card.querySelector('.OmA97e')) return;
                let id = null;
                if (typeof getClassIdFromCard === 'function') {
                    id = getClassIdFromCard(card);
                }
                if (!id) {
                    const anchor = card.querySelector('a[href*="/c/"]');
                    if (anchor) {
                        const match = anchor.getAttribute('href').match(/\/c\/([a-zA-Z0-9_-]+)/);
                        if (match) id = match[1];
                    }
                }
                if (!id) return;
                if (results.find(r => r.id === id)) return;
                const titleEl = card.querySelector('h2') || card.querySelector('.onkcGd') || card.querySelector('a[href*="/c/"] div');
                const name = titleEl ? titleEl.textContent.trim() : 'Untitled class';
                results.push({ id, name, url: `https://classroom.google.com/c/${id}` });
            });
            return results;
        }

        function renderClassroomDropdown(currentClass) {
            if (!classroomDropdownEl) return;
            const courses = findAvailableClassrooms();
            classroomDropdownEl.innerHTML = '';

            if (!courses.length) {
                const empty = document.createElement('div');
                empty.className = 'mc-classroom-empty';
                empty.textContent = 'Go to the home page to edit';
                classroomDropdownEl.appendChild(empty);
                return;
            }

            courses.forEach(course => {
                const option = document.createElement('button');
                option.type = 'button';
                option.className = 'mc-classroom-option';
                option.textContent = course.name;
                if (currentClass && currentClass.classroom === course.url) {
                    option.classList.add('selected');
                }
                option.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    const target = classes.find(x => x.id === selectedId);
                    if (!target) return;
                    target.classroom = course.url;
                    target.classroomName = course.name;
                    saveClasses(classes);
                    renderSidebarList();
                    renderEditFormFor(target);
                    hideClassroomDropdown();
                });
                classroomDropdownEl.appendChild(option);
            });
        }

        function showClassroomDropdown() {
            if (!classroomDropdownEl) return;
            const current = classes.find(x => x.id === selectedId);
            renderClassroomDropdown(current);
            classroomDropdownEl.hidden = false;
            classroomDropdownVisible = true;
            if (classroomDisplayEl) classroomDisplayEl.setAttribute('aria-expanded', 'true');
            if (classroomSelectorEl) classroomSelectorEl.classList.add('open');
            document.addEventListener('click', handleDropdownOutsideClick, true);
        }

        function toggleClassroomDropdown(nextState) {
            const shouldOpen = typeof nextState === 'boolean' ? nextState : !classroomDropdownVisible;
            if (shouldOpen) {
                showClassroomDropdown();
            } else {
                hideClassroomDropdown();
            }
        }

        const periodsRow = scheduleCard;
        periodsRow.innerHTML = `
                <div class="mc-schedule-tabs" role="tablist">
                    <button type="button" class="mc-schedule-tab mc-schedule-tab-active" data-tab="timetable" role="tab" aria-selected="true">Timetable</button>
                    <button type="button" class="mc-schedule-tab" data-tab="periods" role="tab" aria-selected="false">Periods</button>
                    <button type="button" class="mc-schedule-tab" data-tab="import" role="tab" aria-selected="false">Import</button>
                </div>
                <div class="mc-schedule-tab-content">
                    <div class="mc-schedule-panel mc-schedule-panel-timetable" data-panel="timetable">
                        <div class="mc-schedule-board">
                            <div class="mc-schedule-time-axis" aria-hidden="true"></div>
                            <div class="mc-schedule-days" aria-label="Weekly schedule"></div>
                        </div>
                        <div class="mc-schedule-clear-wrap">
                            <button type="button" class="mc-schedule-clear-btn" aria-label="Clear timetable">Clear Timetable</button>
                        </div>
                        <div class="mc-schedule-tune" hidden>
                            <div class="mc-schedule-tune-row mc-schedule-tune-times">
                                <label>Start <input type="time" class="mc-tune-start"></label>
                                <label>End <input type="time" class="mc-tune-end"></label>
                            </div>
                            <div class="mc-schedule-tune-row mc-schedule-tune-details">
                                <input type="text" class="mc-tune-room" placeholder="Alternate Room" aria-label="Alternate Room">
                            </div>
                            <div class="mc-schedule-tune-actions">
                                <button type="button" class="mc-tune-delete">Delete</button>
                            </div>
                        </div>
                    </div>
                    <div class="mc-schedule-panel mc-schedule-panel-periods" data-panel="periods" hidden>
                        <div class="mc-periods-list" aria-live="polite"></div>
                    </div>
                    <div class="mc-schedule-panel mc-schedule-panel-import" data-panel="import" hidden>
                        <div class="mc-import-panel" role="dialog" aria-label="Import periods">
                            <div class="mc-import-header">
                                <span class="mc-import-header-text">Import from</span>
                                <select id="mc-import-source" class="mc-import-source" aria-label="Import from timetable"></select>
                            </div>
                            <div class="mc-import-row mc-import-days-row">
                                <div class="mc-import-days-head">
                                    <div class="mc-import-days-head-actions">
                                        <button type="button" class="mc-import-all">All</button>
                                        <button type="button" class="mc-import-none">None</button>
                                    </div>
                                </div>
                                <div class="mc-import-days-controls">
                                    <div class="mc-import-days-grid">
                                        <button type="button" class="mc-import-day" data-day="0">Sun</button>
                                        <button type="button" class="mc-import-day" data-day="1">Mon</button>
                                        <button type="button" class="mc-import-day" data-day="2">Tue</button>
                                        <button type="button" class="mc-import-day" data-day="3">Wed</button>
                                        <button type="button" class="mc-import-day" data-day="4">Thu</button>
                                        <button type="button" class="mc-import-day" data-day="5">Fri</button>
                                        <button type="button" class="mc-import-day" data-day="6">Sat</button>
                                    </div>
                                </div>
                            </div>
                            <div class="mc-import-disclaimer">This will overwrite any existing periods on selected days</div>
                            <div class="mc-import-footer">
                                <button type="button" class="mc-import-cancel">Cancel</button>
                                <button type="button" class="mc-import-confirm">Import</button>
                            </div>
                        </div>
                    </div>
                </div>
        `;

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'mc-close-edit-btn';
        closeBtn.innerHTML = '&times;';
        form.appendChild(detailsCard);
        form.appendChild(scheduleCard);

        right.appendChild(form);

        panel.appendChild(left);
        panel.appendChild(right);
        panel.appendChild(closeBtn);


        const blockEditorOverlay = document.createElement('div');
        blockEditorOverlay.className = 'mc-block-editor-overlay';
        blockEditorOverlay.hidden = true;
        blockEditorOverlay.innerHTML = `
            <div class="mc-block-editor-panel" role="dialog" aria-label="Block editor">
                <div class="mc-block-editor-header">
                    <input type="text" class="mc-block-name-input" placeholder="Block name" aria-label="Block name">
                    <div class="mc-block-editor-actions">
                        <button type="button" class="mc-block-editor-cancel">Cancel</button>
                        <button type="button" class="mc-block-editor-save">Save</button>
                    </div>
                </div>
                <div class="mc-block-editor-body">
                    <div class="mc-block-editor-classes">
                        <div class="mc-block-editor-subtitle">Classes</div>
                        <div class="mc-block-editor-class-list"></div>
                    </div>
                    <div class="mc-block-editor-schedule">
                        <div class="mc-block-editor-subtitle">Block</div>
                        <div class="mc-block-schedule-board">
                            <div class="mc-block-schedule-axis" aria-hidden="true"></div>
                            <div class="mc-block-schedule-day" aria-label="Block schedule"></div>
                        </div>
                    </div>
                    <div class="mc-block-editor-periods">
                        <div class="mc-block-editor-periods-header">Periods</div>
                        <div class="mc-block-editor-periods-list" aria-live="polite"></div>
                    </div>
                </div>
            </div>
        `;
        panel.appendChild(blockEditorOverlay);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        const importSourceSelect = periodsRow.querySelector('.mc-import-source');
        const importAllBtn = periodsRow.querySelector('.mc-import-all');
        const importNoneBtn = periodsRow.querySelector('.mc-import-none');
        const importDayButtons = Array.from(periodsRow.querySelectorAll('.mc-import-day'));
        const importCancelBtn = periodsRow.querySelector('.mc-import-cancel');
        const importConfirmBtn = periodsRow.querySelector('.mc-import-confirm');
        const blockNameInput = blockEditorOverlay.querySelector('.mc-block-name-input');
        const blockEditorCancelBtn = blockEditorOverlay.querySelector('.mc-block-editor-cancel');
        const blockEditorSaveBtn = blockEditorOverlay.querySelector('.mc-block-editor-save');
        const blockEditorClassList = blockEditorOverlay.querySelector('.mc-block-editor-class-list');
        const blockScheduleAxis = blockEditorOverlay.querySelector('.mc-block-schedule-axis');
        const blockScheduleDay = blockEditorOverlay.querySelector('.mc-block-schedule-day');
        const blockEditorPeriodsList = blockEditorOverlay.querySelector('.mc-block-editor-periods-list');
        const blockEditorPanel = blockEditorOverlay.querySelector('.mc-block-editor-panel');
        const blockTuneEl = document.createElement('div');
        blockTuneEl.className = 'mc-schedule-tune mc-block-schedule-tune';
        blockTuneEl.hidden = true;
        blockTuneEl.innerHTML = `
            <div class="mc-schedule-tune-row mc-schedule-tune-times">
                <label>Start <input type="time" class="mc-block-tune-start"></label>
                <label>End <input type="time" class="mc-block-tune-end"></label>
            </div>
            <div class="mc-schedule-tune-actions">
                <button type="button" class="mc-block-tune-delete">Delete</button>
            </div>
        `;
        blockEditorPanel.appendChild(blockTuneEl);
        const blockTuneStartEl = blockTuneEl.querySelector('.mc-block-tune-start');
        const blockTuneEndEl = blockTuneEl.querySelector('.mc-block-tune-end');
        const blockTuneDeleteEl = blockTuneEl.querySelector('.mc-block-tune-delete');
        const colourInputEl = form.querySelector('.mc-input-colour');
        const colourTriggerEl = form.querySelector('.mc-input-colour-trigger');
        const colourSwatchEl = form.querySelector('.mc-input-colour-swatch');
        const inlineColourPickerEl = form.querySelector('.mc-inline-colour-picker');
        inlineColourPickerEl.innerHTML = '';
        const inlineColourPicker = window.MCColourPicker.create({
            container: inlineColourPickerEl,
            initialColor: '#9aa0a6',
            title: 'Class colour',
            onClose: hideInlineColourPicker,
            onColorChange: (colour) => {
                syncColourTrigger(colour);
                commitColourToSelectedClass(colour);
            }
        });
        const inlineColourCanvasEl = inlineColourPicker.canvas;
        const inlineColourMarkerEl = inlineColourPicker.marker;
        const inlineColourHueEl = inlineColourPicker.hue;
        const inlineColourHexEl = inlineColourPicker.hex;
        const inlineColourPreviewEl = inlineColourPicker.preview;
        const inlineColourCloseEl = inlineColourPicker.root.querySelector('.mc-picker-close');
        let selectedImportDays = new Set([0, 1, 2, 3, 4, 5, 6]);
        const scheduleCardEl = scheduleCard;
        const timetablePanelEl = periodsRow.querySelector('.mc-schedule-panel-timetable');
        const periodsPanelEl = periodsRow.querySelector('.mc-schedule-panel-periods');
        const importPanelWrapper = periodsRow.querySelector('.mc-schedule-panel-import');
        const periodsListEl = periodsRow.querySelector('.mc-periods-list');
        const scheduleBoardEl = periodsRow.querySelector('.mc-schedule-board');
        const scheduleAxisEl = periodsRow.querySelector('.mc-schedule-time-axis');
        const scheduleDaysEl = periodsRow.querySelector('.mc-schedule-days');
        const scheduleClearBtn = periodsRow.querySelector('.mc-schedule-clear-btn');
        const scheduleViewTabs = scheduleCardEl.querySelectorAll('.mc-schedule-tab');
        const scheduleImportBtn = periodsRow.querySelector('.mc-schedule-import-btn');
        const scheduleTuneEl = periodsRow.querySelector('.mc-schedule-tune');
        const tuneStartEl = periodsRow.querySelector('.mc-tune-start');
        const tuneEndEl = periodsRow.querySelector('.mc-tune-end');
        const tuneRoomEl = periodsRow.querySelector('.mc-tune-room');
        const tuneDeleteEl = periodsRow.querySelector('.mc-tune-delete');
        const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        let draggedClassId = null;
        let activeTune = null;
        let focusedPeriod = null;
        let scheduleDragState = null;
        let scheduleDragMoveRafId = null;
        let scheduleResizeState = null;
        let scheduleViewMode = 'timetable';
        let clearTimetableArmed = false;
        let clearTimetableTimer = null;
        let scheduleBoardResizeObserver = null;
        let periodsLaneResizeObserver = null;
        let blockEditorState = null;
        let blockEditorDraggedClassId = null;
        let blockEditorDragState = null;
        let blockEditorResizeState = null;
        let blockEditorResizeObserver = null;
        let focusedBlockEditorItem = null;
        let activeBlockEditorItem = null;
        let activeInlinePeriodEditor = null;
        let viewStartInput = null;
        let viewEndInput = null;
        let inlineColourState = { h: 0, s: 0, v: 1 };

        function getTimeControlParts(timeString) {
            const normalized = normalizeCustomTimeValue(timeString) || '08:00';
            const totalMinutes = parseTimeToMinutes(normalized);
            const hours24 = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            const meridiem = hours24 >= 12 ? 'pm' : 'am';
            const hours12 = ((hours24 + 11) % 12) + 1;
            return {
                hour: String(hours12),
                minute: String(minutes).padStart(2, '0'),
                meridiem
            };
        }

        function createTimeControl(timeString, ariaLabel, sideClass) {
            const parts = getTimeControlParts(timeString);
            const root = document.createElement('div');
            root.className = `mc-schedule-axis-control ${sideClass}`;
            root.setAttribute('role', 'group');
            root.setAttribute('aria-label', ariaLabel);

            // Card-style control: label, display, edit button and hidden edit area
            const labelText = ariaLabel && /start/i.test(ariaLabel) ? 'Start' : 'End';
            const isStart = /start/i.test(sideClass || '');
            // For both Start and End: label, display, edit area, and Edit button below
            root.innerHTML = `
                <div class="mc-axis-card mc-axis-card-inline">
                    <div class="mc-schedule-axis-control-label">${labelText}</div>
                    <div class="mc-schedule-axis-control-display">${formatTimeToAmPm(timeString)}</div>
                    <div class="mc-axis-edit-area">
                        <div class="mc-schedule-time-group">
                            <input type="text" class="mc-schedule-time-part mc-schedule-time-hour" inputmode="numeric" maxlength="2" autocomplete="off" spellcheck="false" aria-label="${ariaLabel} hour" value="${parts.hour}">
                            <span class="mc-schedule-time-separator" aria-hidden="true">:</span>
                            <input type="text" class="mc-schedule-time-part mc-schedule-time-minute" inputmode="numeric" maxlength="2" autocomplete="off" spellcheck="false" aria-label="${ariaLabel} minute" value="${parts.minute}">
                            <button type="button" class="mc-schedule-time-part mc-schedule-time-meridiem" aria-label="${ariaLabel} am or pm" aria-pressed="${parts.meridiem === 'pm' ? 'true' : 'false'}">${parts.meridiem}</button>
                        </div>
                    </div>
                    <button type="button" class="mc-axis-edit-btn" aria-label="Edit ${labelText}">Edit</button>
                </div>
            `;

            const hourInput = root.querySelector('.mc-schedule-time-hour');
            const minuteInput = root.querySelector('.mc-schedule-time-minute');
            const meridiemInput = root.querySelector('.mc-schedule-time-meridiem');
            const displayEl = root.querySelector('.mc-schedule-axis-control-display');
            const editArea = root.querySelector('.mc-axis-edit-area');
            const editBtn = root.querySelector('.mc-axis-edit-btn');

            const controlObj = { root, hourInput, minuteInput, meridiemInput };
            const updateDisplay = () => {
                try {
                    const v = getTimeControlValue(controlObj) || timeString || '';
                    displayEl.textContent = formatTimeToAmPm(v);
                } catch (e) {}
            };

            if (hourInput) hourInput.addEventListener('input', updateDisplay);
            if (minuteInput) minuteInput.addEventListener('input', updateDisplay);
            if (meridiemInput) meridiemInput.addEventListener('click', () => {
                const cur = (meridiemInput.dataset?.value || meridiemInput.textContent || '').trim().toLowerCase();
                const next = cur && cur.startsWith('p') ? 'am' : 'pm';
                meridiemInput.textContent = next;
                meridiemInput.dataset.value = next;
                meridiemInput.setAttribute('aria-pressed', next === 'pm' ? 'true' : 'false');
                updateDisplay();
            });
            // Delegate edit button clicks (handles buttons above/below without moving nodes)
            root.addEventListener('click', (ev) => {
                const btn = ev.target.closest('.mc-axis-edit-btn');
                if (!btn) return;
                ev.preventDefault(); ev.stopPropagation();
                const isEditing = btn.dataset.editing === '1';
                const editAreaEl = root.querySelector('.mc-axis-edit-area');
                const labelEl = root.querySelector('.mc-schedule-axis-control-label');
                if (!editAreaEl) return;
                if (!isEditing) {
                    btn.dataset.editing = '1';
                    btn.textContent = 'Done';
                    if (labelEl) labelEl.style.display = 'none';
                    if (displayEl) displayEl.style.display = 'none';
                    editAreaEl.classList.add('mc-axis-edit-open');
                    setTimeControlValue(controlObj, getTimeControlValue(controlObj) || timeString);
                    try { const h = root.querySelector('.mc-schedule-time-hour'); if (h) { h.focus(); if (typeof h.select === 'function') h.select(); } } catch (_) {}
                } else {
                    btn.dataset.editing = '0';
                    btn.textContent = 'Edit';
                    editAreaEl.classList.remove('mc-axis-edit-open');
                    if (labelEl) labelEl.style.display = '';
                    if (displayEl) displayEl.style.display = '';
                    try { commitViewRangeFromControls(viewStartInput, viewEndInput); } catch (e) {}
                    updateDisplay();
                }
            });
            return {
                root,
                hourInput,
                minuteInput,
                meridiemInput
            };
        }

        function getTimeControlValue(control) {
            if (!control) return '';
            const hourRaw = String(control.hourInput?.value || '').replace(/\D/g, '');
            const minuteRaw = String(control.minuteInput?.value || '').replace(/\D/g, '');
            const meridiemRaw = String(control.meridiemInput?.dataset?.value || control.meridiemInput?.textContent || '').trim().toLowerCase();
            if (!hourRaw || !minuteRaw || !meridiemRaw) return '';

            let hour = Number(hourRaw);
            if (!Number.isFinite(hour) || hour < 1 || hour > 12) return '';

            const minute = Number(minuteRaw);
            if (!Number.isFinite(minute) || minute < 0 || minute > 59) return '';

            const meridiem = meridiemRaw.startsWith('p') ? 'pm' : meridiemRaw.startsWith('a') ? 'am' : '';
            if (!meridiem) return '';

            if (hour === 12 && meridiem === 'am') hour = 0;
            if (hour !== 12 && meridiem === 'pm') hour += 12;

            return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        }

        function setTimeControlValue(control, timeString) {
            if (!control) return;
            const parts = getTimeControlParts(timeString);
            if (control.hourInput) control.hourInput.value = parts.hour;
            if (control.minuteInput) control.minuteInput.value = parts.minute;
            if (control.meridiemInput) {
                control.meridiemInput.textContent = parts.meridiem;
                control.meridiemInput.dataset.value = parts.meridiem;
                control.meridiemInput.setAttribute('aria-pressed', parts.meridiem === 'pm' ? 'true' : 'false');
            }
        }

        function styleCustomTimeInputValue(inputEl, isValid) {
            if (!inputEl) return;
            const target = inputEl.root || inputEl;
            if (!target.classList) return;
            target.classList.toggle('mc-custom-time-input-invalid', isValid === false);
        }

        function sanitizeTimePartValue(inputEl, isMeridiem = false) {
            if (!inputEl) return '';
            if (isMeridiem) {
                return String(inputEl.dataset?.value || inputEl.textContent || '').trim().toLowerCase();
            }
            return String(inputEl.value || '').replace(/\D/g, '').slice(0, 2);
        }

        function focusNextTimePart(nextInput) {
            if (!nextInput) return;
            nextInput.focus();
            if (typeof nextInput.select === 'function') nextInput.select();
        }

        function commitViewRangeFromControls(startControl = viewStartInput, endControl = viewEndInput) {
            if (!startControl || !endControl) return;
            const startValue = getTimeControlValue(startControl) || '08:00';
            const endValue = getTimeControlValue(endControl) || '16:00';
            const startMin = parseTimeToMinutes(startValue);
            const endMin = parseTimeToMinutes(endValue);
            if (startMin >= endMin) {
                styleCustomTimeInputValue(startControl, false);
                styleCustomTimeInputValue(endControl, false);
                return;
            }
            styleCustomTimeInputValue(startControl, true);
            styleCustomTimeInputValue(endControl, true);
            setTimeControlValue(startControl, startValue);
            setTimeControlValue(endControl, endValue);
            saveViewRange(startValue, endValue);
            if (mcTimetable.container && document.body.contains(mcTimetable.container)) {
                renderPeriodsOnTimetable();
                updateTimetableIndicator();
            }
            renderPeriodsList(classById(selectedId));
        }

        function bindTimeControl(control, counterpartGetter, isStart) {
            if (!control || control.root?.dataset.bound === '1') return;
            if (control.root) control.root.dataset.bound = '1';

            const commit = () => {
                const fallback = isStart ? getViewRange().start : getViewRange().end;
                const normalized = getTimeControlValue(control);
                if (!normalized) {
                    setTimeControlValue(control, fallback);
                    styleCustomTimeInputValue(control, true);
                    return;
                }
                setTimeControlValue(control, normalized);
                styleCustomTimeInputValue(control, true);
                const otherControl = counterpartGetter ? counterpartGetter() : null;
                const startControl = isStart ? control : otherControl;
                const endControl = isStart ? otherControl : control;
                commitViewRangeFromControls(startControl, endControl);
            };

            const attach = (inputEl, nextInput, isMeridiem = false) => {
                if (!inputEl) return;
                if (!isMeridiem) {
                    inputEl.addEventListener('focus', () => {
                        if (typeof inputEl.select === 'function') inputEl.select();
                    });
                }
                inputEl.addEventListener('input', () => {
                    const cleaned = sanitizeTimePartValue(inputEl, isMeridiem);
                    inputEl.value = cleaned;
                    if (inputEl === control.hourInput) {
                        const hourNumber = Number(cleaned);
                        if (cleaned.length === 2 || (cleaned.length === 1 && Number.isFinite(hourNumber) && hourNumber > 1)) {
                            focusNextTimePart(nextInput);
                        }
                    } else if (inputEl === control.minuteInput && cleaned.length === 2) {
                        focusNextTimePart(nextInput);
                    }
                });
                inputEl.addEventListener('keydown', (ev) => {
                    if (isMeridiem && /^[ap]$/i.test(ev.key)) {
                        ev.preventDefault();
                        setMeridiemValue(ev.key.toLowerCase() === 'a' ? 'am' : 'pm');
                    } else if (ev.key === 'Enter') {
                        ev.preventDefault();
                        commit();
                    } else if (ev.key === 'Escape') {
                        const vrLocal = getViewRange();
                        setTimeControlValue(control, isStart ? vrLocal.start : vrLocal.end);
                        styleCustomTimeInputValue(control, true);
                    }
                });
            };

            const setMeridiemValue = (nextValue) => {
                if (control.meridiemInput) {
                    control.meridiemInput.textContent = nextValue;
                    control.meridiemInput.dataset.value = nextValue;
                    control.meridiemInput.setAttribute('aria-pressed', nextValue === 'pm' ? 'true' : 'false');
                }
                commit();
            };

            const handleFocusOut = (ev) => {
                if (control.root && control.root.contains(ev.relatedTarget)) return;
                commit();
            };

            attach(control.hourInput, control.minuteInput);
            attach(control.minuteInput, control.meridiemInput);
            attach(control.meridiemInput, null, true);
            control.root?.addEventListener('focusout', handleFocusOut);
        }

        function detachActiveInlinePeriodEditorListeners() {
            if (!activeInlinePeriodEditor) return;
            if (activeInlinePeriodEditor.onDocumentClick) {
                document.removeEventListener('click', activeInlinePeriodEditor.onDocumentClick, true);
            }
            if (activeInlinePeriodEditor.onDocumentKeydown) {
                document.removeEventListener('keydown', activeInlinePeriodEditor.onDocumentKeydown, true);
            }
            activeInlinePeriodEditor.onDocumentClick = null;
            activeInlinePeriodEditor.onDocumentKeydown = null;
        }

        function randomPeriodId() {
            return 'p_' + Math.random().toString(36).slice(2, 8);
        }

        function normalizeCustomTimeValue(raw) {
            const source = String(raw || '').trim().toLowerCase();
            if (!source) return '';

            let normalized = source.replace(/\s+/g, '');
            let meridiem = '';
            const meridiemMatch = normalized.match(/(am|pm)$/);
            if (meridiemMatch) {
                meridiem = meridiemMatch[1];
                normalized = normalized.slice(0, -meridiem.length);
            }
            normalized = normalized.replace(/\./g, ':');

            let hours = 0;
            let minutes = 0;
            if (normalized.includes(':')) {
                const parts = normalized.split(':');
                if (parts.length !== 2) return '';
                hours = Number(parts[0]);
                minutes = Number(parts[1]);
            } else if (/^\d{1,4}$/.test(normalized)) {
                if (normalized.length <= 2) {
                    hours = Number(normalized);
                    minutes = 0;
                } else if (normalized.length === 3) {
                    hours = Number(normalized.slice(0, 1));
                    minutes = Number(normalized.slice(1));
                } else {
                    hours = Number(normalized.slice(0, 2));
                    minutes = Number(normalized.slice(2));
                }
            } else {
                return '';
            }

            if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return '';
            if (minutes < 0 || minutes > 59) return '';

            if (meridiem) {
                if (hours < 1 || hours > 12) return '';
                if (meridiem === 'am') hours = hours === 12 ? 0 : hours;
                if (meridiem === 'pm') hours = hours === 12 ? 12 : hours + 12;
            }

            if (hours < 0 || hours > 23) return '';
            return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        }

        function syncColourTrigger(color) {
            const safeColor = /^#([0-9a-f]{6})$/i.test(color || '') ? color : '#9aa0a6';
            if (colourInputEl) colourInputEl.value = safeColor;
            if (colourSwatchEl) colourSwatchEl.style.background = safeColor;
            if (inlineColourPreviewEl) inlineColourPreviewEl.style.background = safeColor;
            if (inlineColourHexEl && document.activeElement !== inlineColourHexEl) inlineColourHexEl.value = safeColor;
        }

        function hideInlineColourPicker() {
            if (!inlineColourPickerEl) return;
            inlineColourPickerEl.hidden = true;
            if (colourTriggerEl) colourTriggerEl.setAttribute('aria-expanded', 'false');
        }

        function positionInlineColourMarker() {
            if (!inlineColourCanvasEl || !inlineColourMarkerEl) return;
            inlineColourMarkerEl.style.left = `${inlineColourState.s * inlineColourCanvasEl.width}px`;
            inlineColourMarkerEl.style.top = `${(1 - inlineColourState.v) * inlineColourCanvasEl.height}px`;
        }

        function drawInlineColourCanvas() {
            if (!inlineColourCanvasEl) return;
            const ctx = inlineColourCanvasEl.getContext('2d');
            if (!ctx) return;
            drawColorWheel(ctx, inlineColourCanvasEl.width, inlineColourCanvasEl.height, inlineColourState.h);
        }

        function commitColourToSelectedClass(hex) {
            if (!selectedId || !hex) return;
            const targetClass = classById(selectedId);
            if (!targetClass) return;
            targetClass.colour = hex;
            saveClasses(classes);
            renderSidebarList();
            try { renderPeriodsList(targetClass); } catch (_) {}
            try { renderPeriodsOnTimetable(); } catch (_) {}
            try { updateTimetableIndicator(); } catch (_) {}
            try { updateLiveWidget(); } catch (_) {}
        }

        function updateInlineColourFromState() {
            const { r, g, b } = hsvToRgb(inlineColourState.h, inlineColourState.s, inlineColourState.v);
            const hex = rgbToHex(r, g, b);
            syncColourTrigger(hex);
            commitColourToSelectedClass(hex);
            positionInlineColourMarker();
        }

        function openInlineColourPicker() {
            if (!inlineColourPickerEl) return;
            const hex = colourInputEl && colourInputEl.value ? colourInputEl.value : '#9aa0a6';
            inlineColourPicker.setColor(hex, 'open');
            const hsv = hexToHsv(hex);
            inlineColourState = { h: hsv.h, s: hsv.s, v: hsv.v };
            if (inlineColourHueEl) inlineColourHueEl.value = String(Math.round(inlineColourState.h));
            drawInlineColourCanvas();
            syncColourTrigger(hex);
            positionInlineColourMarker();
            inlineColourPickerEl.hidden = false;
            if (colourTriggerEl) colourTriggerEl.setAttribute('aria-expanded', 'true');
        }

        function handleInlineColourPointer(clientX, clientY) {
            if (!inlineColourCanvasEl) return;
            const rect = inlineColourCanvasEl.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
            const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
            inlineColourState.s = x / rect.width;
            inlineColourState.v = 1 - (y / rect.height);
            updateInlineColourFromState();
        }

        function snapMinutes(mins, step) {
            const stepSize = Math.max(1, step || 5);
            return Math.round(mins / stepSize) * stepSize;
        }

        function placementChanged(left, right) {
            if (!left || !right) return false;
            return Number(left.day) !== Number(right.day)
                || Number(left.startMin) !== Number(right.startMin)
                || Number(left.endMin) !== Number(right.endMin);
        }

        function clearScheduleDropTargets() {
            if (!scheduleDaysEl) return;
            scheduleDaysEl.querySelectorAll('.mc-schedule-day-body.mc-drop-target').forEach((el) => {
                el.classList.remove('mc-drop-target');
            });
        }

        function clearScheduleDragMoveRaf() {
            if (scheduleDragMoveRafId !== null && typeof window !== 'undefined') {
                window.cancelAnimationFrame(scheduleDragMoveRafId);
            }
            scheduleDragMoveRafId = null;
        }

        function findScheduleBlock(classId, periodId) {
            return periodsRow.querySelector(`.mc-schedule-block[data-class-id="${classId}"][data-period-id="${periodId}"]`);
        }

        function syncScheduleBlockBadges(block, placement) {
            if (!block || !placement) return;
            const startBadge = block.querySelector('.mc-schedule-time-badge-start');
            if (startBadge) startBadge.textContent = formatTimeToAmPm(minutesToTimeString(placement.startMin));
        }

        function setScheduleBlockBadgeVisibility(block, visible) {
            if (!block) return;
            block.classList.toggle('mc-schedule-block-show-badges', !!visible);
        }

        function syncActiveTuneBlock() {
            periodsRow.querySelectorAll('.mc-schedule-block-active-tune').forEach((el) => {
                el.classList.remove('mc-schedule-block-active-tune');
            });
            if (!activeTune) return;
            const block = findScheduleBlock(activeTune.classId, activeTune.periodId);
            if (block) {
                block.classList.add('mc-schedule-block-active-tune');
            }
        }

        function syncFocusedPeriodBlock() {
            periodsRow.querySelectorAll('.mc-schedule-block-focused').forEach((el) => {
                el.classList.remove('mc-schedule-block-focused');
            });
            if (!focusedPeriod) return;
            const block = findScheduleBlock(focusedPeriod.classId, focusedPeriod.periodId);
            if (block) {
                block.classList.add('mc-schedule-block-focused');
            }
        }

        function focusSchedulePeriod(classId, periodId) {
            focusedPeriod = { classId, periodId };
            syncFocusedPeriodBlock();
        }

        function syncActiveTuneInputs(placement, target = activeTune) {
            if (!placement || !target || !tuneStartEl || !tuneEndEl) return;
            tuneStartEl.value = minutesToTimeString(placement.startMin);
            tuneEndEl.value = minutesToTimeString(placement.endMin);
        }

        function updateClearTimetableButton() {
            if (!scheduleClearBtn) return;
            scheduleClearBtn.textContent = clearTimetableArmed ? 'Confirm' : 'Clear Timetable';
            scheduleClearBtn.classList.toggle('confirming', clearTimetableArmed);
            scheduleClearBtn.setAttribute('aria-label', clearTimetableArmed ? 'Confirm clear timetable' : 'Clear timetable');
        }

        function setScheduleViewMode(mode) {
            const validModes = ['timetable', 'periods', 'import'];
            scheduleViewMode = validModes.includes(mode) ? mode : 'timetable';
            const isTimetable = scheduleViewMode === 'timetable';
            const isPeriods = scheduleViewMode === 'periods';
            const isImport = scheduleViewMode === 'import';

            if (scheduleCardEl) scheduleCardEl.hidden = false;
            if (timetablePanelEl) timetablePanelEl.hidden = !isTimetable;
            if (periodsPanelEl) periodsPanelEl.hidden = !isPeriods;
            if (importPanelWrapper) importPanelWrapper.hidden = !isImport;
            if (periodsRow) {
                periodsRow.classList.toggle('mc-periods-view', isPeriods);
                periodsRow.classList.toggle('mc-timetable-view', isTimetable);
                periodsRow.classList.toggle('mc-import-view', isImport);
            }
            scheduleViewTabs.forEach((tab) => {
                const tabMode = tab.dataset.tab;
                const selected = tabMode === scheduleViewMode;
                tab.classList.toggle('mc-schedule-tab-active', selected);
                tab.setAttribute('aria-selected', selected ? 'true' : 'false');
            });
            hideTunePanel();
            if (isTimetable) {
                window.requestAnimationFrame(() => {
                    if (scheduleViewMode !== 'timetable') return;
                    renderPeriodsList(classById(selectedId));
                });
            } else if (isPeriods) {
                renderAllPeriodsView();
            } else if (isImport) {
                ensureImportSourceOptions();
            }
        }

        function collectAllPeriodsForCurrentTimetable() {
            const entries = [];
            classes.forEach((cls) => {
                const periods = normalizePeriods(classPeriods[cls.id] || []);
                periods.forEach((period) => {
                    const startMin = parseTimeToMinutes(period.start || '00:00');
                    const endMin = parseTimeToMinutes(period.end || '00:00');
                    if (endMin <= startMin) return;
                    entries.push({
                        classId: cls.id,
                        periodId: period.id,
                        classTitle: cls.title || 'Class',
                        classColor: cls.colour || '#9aa0a6',
                        day: Number(period.day) || 0,
                        start: period.start || '00:00',
                        end: period.end || '00:00',
                        room: String(period.room || ''),
                        startMin,
                        endMin
                    });
                });
            });
            entries.sort((a, b) => {
                if (a.day !== b.day) return a.day - b.day;
                if (a.startMin !== b.startMin) return a.startMin - b.startMin;
                return a.classTitle.localeCompare(b.classTitle);
            });
            return entries;
        }

        function removePeriodFromTimetable(classId, periodId) {
            const targetClass = classById(classId);
            if (!targetClass) return;
            const next = normalizePeriods(classPeriods[targetClass.id] || []).filter((p) => p.id !== periodId);
            classPeriods[targetClass.id] = next;
            targetClass.periods = next;
            if (activeTune && activeTune.classId === classId && activeTune.periodId === periodId) hideTunePanel();
            if (focusedPeriod && focusedPeriod.classId === classId && focusedPeriod.periodId === periodId) {
                focusedPeriod = null;
                syncFocusedPeriodBlock();
            }
            savePeriods(classPeriods);
            renderPeriodsList(classById(selectedId));
            if (scheduleViewMode === 'periods') renderAllPeriodsView();
            renderSidebarList();
            try { renderPeriodsOnTimetable(); } catch (_) {}
            try { updateTimetableIndicator(); } catch (_) {}
            try { updateLiveWidget(); } catch (_) {}
        }

        function addPeriodToDay(classId, day) {
            const targetClass = classById(classId);
            if (!targetClass) return;

            const existing = collectAllPeriodsForCurrentTimetable()
                .filter((entry) => entry.day === Number(day));
            const range = getViewRange();
            const duration = 60;
            let startMin = range.startMin;
            let foundSlot = false;

            for (; startMin + duration <= range.endMin; startMin += 5) {
                const overlaps = existing.some((entry) => startMin < entry.endMin && startMin + duration > entry.startMin);
                if (!overlaps) {
                    foundSlot = true;
                    break;
                }
            }

            if (!foundSlot) {
                startMin = Math.max(range.startMin, ...existing.map((entry) => entry.endMin));
                startMin = Math.min(startMin, 23 * 60);
            }
            const endMin = Math.min(startMin + duration, (23 * 60) + 59);
            if (endMin <= startMin) return;

            const next = normalizePeriods(classPeriods[targetClass.id] || []);
            next.push({
                id: randomPeriodId(),
                day: Number(day) || 0,
                start: minutesToTimeString(startMin),
                end: minutesToTimeString(endMin),
                label: '',
                room: ''
            });
            classPeriods[targetClass.id] = next;
            targetClass.periods = next;
            savePeriods(classPeriods);
            renderSidebarList();
            renderPeriodsList(classById(selectedId));
            if (scheduleViewMode === 'periods') renderAllPeriodsView();
            try { updateTimetableIndicator(); } catch (_) {}
            try { updateLiveWidget(); } catch (_) {}
        }

        function updatePeriodTimesInTimetable(classId, periodId, start, end, room) {
            const targetClass = classById(classId);
            if (!targetClass) return;
            if (!start || !end) return;
            if (parseTimeToMinutes(start) >= parseTimeToMinutes(end)) return;

            const next = normalizePeriods(classPeriods[targetClass.id] || []);
            const idx = next.findIndex((p) => p.id === periodId);
            if (idx === -1) return;

            next[idx] = Object.assign({}, next[idx], { start, end, room: String(room || '').trim() });
            classPeriods[targetClass.id] = next;
            targetClass.periods = next;

            savePeriods(classPeriods);
            renderPeriodsList(classById(selectedId));
            if (scheduleViewMode === 'periods') renderAllPeriodsView();
            renderSidebarList();
            try { renderPeriodsOnTimetable(); } catch (_) {}
            try { updateTimetableIndicator(); } catch (_) {}
            try { updateLiveWidget(); } catch (_) {}
        }

        function updatePeriodScrollbar(grid) {
            const scrollbar = grid && grid.nextElementSibling;
            const thumb = scrollbar && scrollbar.firstElementChild;
            if (!grid || !scrollbar || !thumb) return;
            const trackWidth = scrollbar.clientWidth;
            const maxScroll = Math.max(0, grid.scrollWidth - grid.clientWidth);
            const hasOverflow = maxScroll > 1;
            const thumbWidth = maxScroll > 0
                ? Math.max(Math.min(24, trackWidth), trackWidth * grid.clientWidth / grid.scrollWidth)
                : trackWidth;
            const thumbTravel = Math.max(0, trackWidth - thumbWidth);
            const thumbOffset = maxScroll > 0 ? grid.scrollLeft / maxScroll * thumbTravel : 0;
            scrollbar.classList.toggle('is-overflowing', hasOverflow);
            thumb.style.width = `${thumbWidth}px`;
            thumb.style.transform = `translateX(${thumbOffset}px)`;
            scrollbar.setAttribute('aria-valuemax', String(Math.round(maxScroll)));
            scrollbar.setAttribute('aria-valuenow', String(Math.round(grid.scrollLeft)));
            scrollbar.setAttribute('aria-disabled', String(maxScroll <= 0));
        }

        function disconnectPeriodsLaneResizeObserver() {
            if (!periodsLaneResizeObserver) return;
            periodsLaneResizeObserver.disconnect();
            periodsLaneResizeObserver = null;
        }

        function renderAllPeriodsView() {
            if (!periodsListEl) return;
            detachActiveInlinePeriodEditorListeners();
            disconnectPeriodsLaneResizeObserver();
            periodsLaneResizeObserver = typeof ResizeObserver !== 'undefined'
                ? new ResizeObserver((observedEntries) => {
                    observedEntries.forEach((observedEntry) => {
                        updatePeriodScrollbar(observedEntry.target);
                    });
                })
                : null;
            periodsListEl.innerHTML = '';
            const entries = collectAllPeriodsForCurrentTimetable();
            const periodDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

            const groupedByDay = new Map();
            entries.forEach((entry) => {
                const day = Number(entry.day) || 0;
                if (!groupedByDay.has(day)) groupedByDay.set(day, []);
                groupedByDay.get(day).push(entry);
            });

            periodDayNames.forEach((dayName, day) => {
                const section = document.createElement('section');
                section.className = 'mc-periods-day-section';
                section.dataset.day = String(day);

                const header = document.createElement('div');
                header.className = 'mc-periods-day-header';
                header.textContent = dayName;
                section.appendChild(header);

                const lane = document.createElement('div');
                lane.className = 'mc-periods-day-lane';

                const grid = document.createElement('div');
                grid.className = 'mc-periods-day-grid';
                grid.id = `mc-periods-day-grid-${day}`;
                grid.addEventListener('dragover', (ev) => {
                    if (!draggedClassId) return;
                    ev.preventDefault();
                    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
                    section.classList.add('mc-periods-day-drop-target');
                });
                grid.addEventListener('dragleave', (ev) => {
                    if (ev.relatedTarget && grid.contains(ev.relatedTarget)) return;
                    section.classList.remove('mc-periods-day-drop-target');
                });
                grid.addEventListener('drop', (ev) => {
                    if (!draggedClassId) return;
                    ev.preventDefault();
                    section.classList.remove('mc-periods-day-drop-target');
                    addPeriodToDay(draggedClassId, day);
                });

                const scrollbar = document.createElement('div');
                scrollbar.className = 'mc-periods-scrollbar-track';
                scrollbar.setAttribute('role', 'scrollbar');
                scrollbar.setAttribute('aria-label', `${dayName} periods scroll position`);
                scrollbar.setAttribute('aria-orientation', 'horizontal');
                scrollbar.setAttribute('aria-controls', grid.id);
                scrollbar.setAttribute('aria-valuemin', '0');
                scrollbar.setAttribute('aria-valuemax', '0');
                scrollbar.setAttribute('aria-valuenow', '0');
                scrollbar.tabIndex = 0;

                const scrollbarThumb = document.createElement('div');
                scrollbarThumb.className = 'mc-periods-scrollbar-thumb';
                scrollbarThumb.setAttribute('aria-hidden', 'true');
                scrollbar.appendChild(scrollbarThumb);

                let thumbDragStart = null;
                scrollbar.addEventListener('keydown', (ev) => {
                    const maxScroll = Math.max(0, grid.scrollWidth - grid.clientWidth);
                    const page = Math.max(32, grid.clientWidth * 0.8);
                    const keyTargets = {
                        ArrowLeft: grid.scrollLeft - 32,
                        ArrowRight: grid.scrollLeft + 32,
                        PageUp: grid.scrollLeft - page,
                        PageDown: grid.scrollLeft + page,
                        Home: 0,
                        End: maxScroll
                    };
                    if (!(ev.key in keyTargets)) return;
                    ev.preventDefault();
                    grid.scrollLeft = keyTargets[ev.key];
                });
                scrollbar.addEventListener('pointerdown', (ev) => {
                    if (ev.target === scrollbarThumb && grid.scrollWidth > grid.clientWidth) {
                        ev.preventDefault();
                        thumbDragStart = { x: ev.clientX, scrollLeft: grid.scrollLeft };
                        scrollbar.setPointerCapture(ev.pointerId);
                    } else if (ev.target === scrollbar) {
                        const rect = scrollbar.getBoundingClientRect();
                        const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
                        grid.scrollLeft = ratio * Math.max(0, grid.scrollWidth - grid.clientWidth);
                    }
                });
                scrollbar.addEventListener('pointermove', (ev) => {
                    if (!thumbDragStart) return;
                    const maxScroll = Math.max(0, grid.scrollWidth - grid.clientWidth);
                    const thumbTravel = scrollbar.clientWidth - scrollbarThumb.offsetWidth;
                    if (thumbTravel <= 0) return;
                    grid.scrollLeft = thumbDragStart.scrollLeft
                        + ((ev.clientX - thumbDragStart.x) / thumbTravel) * maxScroll;
                });
                const endThumbDrag = () => { thumbDragStart = null; };
                scrollbar.addEventListener('pointerup', endThumbDrag);
                scrollbar.addEventListener('pointercancel', endThumbDrag);
                grid.addEventListener('scroll', () => updatePeriodScrollbar(grid), { passive: true });

                lane.append(grid, scrollbar);
                if (periodsLaneResizeObserver) periodsLaneResizeObserver.observe(grid);

                const dayEntries = groupedByDay.get(day) || [];
                if (dayEntries.length === 0) {
                    section.classList.add('mc-periods-day-empty');
                    const emptyHint = document.createElement('div');
                    emptyHint.className = 'mc-periods-day-empty-hint';
                    emptyHint.textContent = 'Drag a class from the sidebar to add a period';
                    grid.appendChild(emptyHint);
                }

                dayEntries.forEach((entry) => {
                    const item = document.createElement('div');
                    item.className = 'mc-periods-item';

                    const topRow = document.createElement('div');
                    topRow.className = 'mc-periods-item-top';

                    const swatch = document.createElement('span');
                    swatch.className = 'mc-periods-item-dot';
                    swatch.style.background = entry.classColor;

                    const meta = document.createElement('div');
                    meta.className = 'mc-periods-item-meta';
                    const titleRow = document.createElement('div');
                    titleRow.className = 'mc-periods-item-title-row';
                    const titleEl = document.createElement('div');
                    titleEl.className = 'mc-periods-item-title';
                    titleEl.textContent = entry.classTitle;
                    titleRow.appendChild(titleEl);
                    if (entry.room) {
                        const roomEl = document.createElement('div');
                        roomEl.className = 'mc-periods-item-room';
                        roomEl.textContent = `• ${entry.room}`;
                        titleRow.appendChild(roomEl);
                    }
                    const timeEl = document.createElement('div');
                    timeEl.className = 'mc-periods-item-time';
                    timeEl.textContent = `${formatTimeToAmPm(entry.start)} - ${formatTimeToAmPm(entry.end)}`;
                    meta.appendChild(titleRow);
                    meta.appendChild(timeEl);

                    const actions = document.createElement('div');
                    actions.className = 'mc-periods-item-actions';

                    const editBtn = document.createElement('button');
                    editBtn.type = 'button';
                    editBtn.className = 'mc-periods-item-edit';
                    editBtn.textContent = 'Edit';
                    editBtn.setAttribute('aria-label', `Edit time for ${entry.classTitle}`);

                    const deleteBtn = document.createElement('button');
                    deleteBtn.type = 'button';
                    deleteBtn.className = 'mc-periods-item-delete';
                    deleteBtn.textContent = 'Delete';
                    deleteBtn.setAttribute('aria-label', `Delete period for ${entry.classTitle}`);
                    deleteBtn.addEventListener('click', () => {
                        removePeriodFromTimetable(entry.classId, entry.periodId);
                    });

                    const editor = document.createElement('div');
                    editor.className = 'mc-periods-item-editor';
                    editor.hidden = true;

                    const startInput = document.createElement('input');
                    startInput.type = 'time';
                    startInput.className = 'mc-periods-item-editor-start';
                    startInput.value = entry.start;
                    startInput.setAttribute('aria-label', `Start time for ${entry.classTitle}`);
                    const startField = document.createElement('label');
                    startField.className = 'mc-periods-item-editor-field';
                    startField.appendChild(startInput);

                    const endInput = document.createElement('input');
                    endInput.type = 'time';
                    endInput.className = 'mc-periods-item-editor-end';
                    endInput.value = entry.end;
                    endInput.setAttribute('aria-label', `End time for ${entry.classTitle}`);
                    const endField = document.createElement('label');
                    endField.className = 'mc-periods-item-editor-field';
                    endField.appendChild(endInput);

                    const roomInput = document.createElement('input');
                    roomInput.type = 'text';
                    roomInput.className = 'mc-periods-item-editor-room';
                    roomInput.placeholder = 'Alternate Room';
                    roomInput.setAttribute('aria-label', `Alternate room for ${entry.classTitle}`);
                    roomInput.value = entry.room;

                    const roomRow = document.createElement('div');
                    roomRow.className = 'mc-periods-item-editor-room-row';

                    const saveBtn = document.createElement('button');
                    saveBtn.type = 'button';
                    saveBtn.className = 'mc-periods-item-editor-save';
                    saveBtn.textContent = 'Save';
                    saveBtn.setAttribute('aria-label', 'Save time changes');
                    saveBtn.title = 'Save';

                    const shouldRestoreEditor = !!activeInlinePeriodEditor
                        && activeInlinePeriodEditor.classId === entry.classId
                        && activeInlinePeriodEditor.periodId === entry.periodId;

                    const closeEditor = (revert = false, clearState = true) => {
                        editor.hidden = true;
                        item.classList.remove('mc-periods-item-editing');
                        if (revert) {
                            startInput.value = entry.start;
                            endInput.value = entry.end;
                            roomInput.value = entry.room;
                        }
                        if (activeInlinePeriodEditor
                            && activeInlinePeriodEditor.classId === entry.classId
                            && activeInlinePeriodEditor.periodId === entry.periodId) {
                            detachActiveInlinePeriodEditorListeners();
                            if (clearState) activeInlinePeriodEditor = null;
                        }
                    };

                    const openEditor = () => {
                        if (activeInlinePeriodEditor
                            && (activeInlinePeriodEditor.classId !== entry.classId || activeInlinePeriodEditor.periodId !== entry.periodId)) {
                            activeInlinePeriodEditor.close(true);
                        }

                        const onDocumentClick = (ev) => {
                            if (!item.contains(ev.target)) {
                                closeEditor(true);
                            }
                        };

                        const onDocumentKeydown = (ev) => {
                            if (ev.key === 'Escape') {
                                closeEditor(true);
                            }
                        };

                        activeInlinePeriodEditor = {
                            classId: entry.classId,
                            periodId: entry.periodId,
                            close: (revert = true) => closeEditor(revert, true),
                            onDocumentClick,
                            onDocumentKeydown
                        };

                        document.addEventListener('click', onDocumentClick, true);
                        document.addEventListener('keydown', onDocumentKeydown, true);
                        editor.hidden = false;
                        item.classList.add('mc-periods-item-editing');
                        startInput.focus();
                    };

                    if (shouldRestoreEditor) {
                        openEditor();
                    }

                    editBtn.addEventListener('click', () => {
                        if (editor.hidden) openEditor();
                        else closeEditor(true);
                    });

                    saveBtn.addEventListener('click', () => {
                        const startVal = startInput.value;
                        const endVal = endInput.value;
                        if (!startVal || !endVal || parseTimeToMinutes(startVal) >= parseTimeToMinutes(endVal)) {
                            alert('Please enter a valid time range.');
                            return;
                        }
                        detachActiveInlinePeriodEditorListeners();
                        activeInlinePeriodEditor = null;
                        editor.hidden = true;
                        item.classList.remove('mc-periods-item-editing');
                        updatePeriodTimesInTimetable(entry.classId, entry.periodId, startVal, endVal, roomInput.value);
                    });

                    actions.appendChild(editBtn);
                    actions.appendChild(deleteBtn);

                    topRow.appendChild(swatch);
                    topRow.appendChild(meta);
                    topRow.appendChild(actions);

                    editor.appendChild(startField);
                    editor.appendChild(endField);
                    roomRow.appendChild(roomInput);
                    roomRow.appendChild(saveBtn);
                    editor.appendChild(roomRow);

                    item.appendChild(topRow);
                    item.appendChild(editor);
                    grid.appendChild(item);
                });

                section.appendChild(lane);
                periodsListEl.appendChild(section);
            });

            window.requestAnimationFrame(() => {
                periodsListEl.querySelectorAll('.mc-periods-day-grid').forEach((grid) => {
                    updatePeriodScrollbar(grid);
                });
            });
        }

        function resetClearTimetableButton() {
            clearTimetableArmed = false;
            if (clearTimetableTimer !== null) {
                window.clearTimeout(clearTimetableTimer);
                clearTimetableTimer = null;
            }
            updateClearTimetableButton();
        }

        function armClearTimetableButton() {
            clearTimetableArmed = true;
            if (clearTimetableTimer !== null) {
                window.clearTimeout(clearTimetableTimer);
            }
            clearTimetableTimer = window.setTimeout(() => {
                clearTimetableTimer = null;
                clearTimetableArmed = false;
                updateClearTimetableButton();
            }, 4000);
            updateClearTimetableButton();
        }

        function clearCurrentTimetablePeriods() {
            classPeriods = {};
            hideTunePanel();
            focusedPeriod = null;
            syncFocusedPeriodBlock();
            savePeriods(classPeriods);
            renderPeriodsList(classById(selectedId));
            renderSidebarList();
            try { renderPeriodsOnTimetable(); } catch (_) {}
            try { updateTimetableIndicator(); } catch (_) {}
            try { updateLiveWidget(); } catch (_) {}
        }

        function getBlockById(blockId) {
            return blocks.find((item) => item.id === blockId) || null;
        }

        function getClassTitleById(classId) {
            const match = classes.find((item) => item.id === classId);
            return match ? (match.title || 'Class') : 'Class';
        }

        function getClassColorById(classId) {
            const match = classes.find((item) => item.id === classId);
            return match ? (match.colour || '#9aa0a6') : '#9aa0a6';
        }

        function updateSidebarModeUi() {
            updateTabState();
            if (typeof addConfirmBtn !== 'undefined') {
                addConfirmBtn.title = sidebarMode === 'blocks' ? 'Add new block' : 'Add new class';
                addConfirmBtn.setAttribute('aria-label', sidebarMode === 'blocks' ? 'Create block' : 'Create class');
            }
            left.classList.toggle('mc-edit-list-blocks', sidebarMode === 'blocks');
        }

        function applyBlockToDay(blockId, dayIndex) {
            const block = getBlockById(blockId);
            if (!block || !Array.isArray(block.items)) return;

            const nextPeriods = {};
            classes.forEach((cls) => {
                const current = normalizePeriods(classPeriods[cls.id] || []);
                const kept = current.filter((period) => Number(period.day) !== Number(dayIndex));
                if (kept.length) nextPeriods[cls.id] = kept;
            });

            block.items.forEach((item) => {
                if (!item || !item.classId || !classes.find((cls) => cls.id === item.classId)) return;
                const target = normalizePeriods(nextPeriods[item.classId] || []);
                target.push({
                    id: randomPeriodId(),
                    day: Number(dayIndex) || 0,
                    start: item.start,
                    end: item.end,
                    label: ''
                });
                nextPeriods[item.classId] = target;
            });

            classPeriods = nextPeriods;
            hideTunePanel();
            focusedPeriod = null;
            syncFocusedPeriodBlock();
            savePeriods(classPeriods);
            renderPeriodsList(classById(selectedId));
            renderSidebarList();
            try { renderPeriodsOnTimetable(); } catch (_) {}
            try { updateTimetableIndicator(); } catch (_) {}
            try { updateLiveWidget(); } catch (_) {}
        }

        function buildBlockScheduleBoard() {
            if (!blockScheduleAxis || !blockScheduleDay) return;
            const vrLocal = getViewRange();
            blockScheduleAxis.innerHTML = '';
            blockScheduleDay.innerHTML = '';
            [vrLocal.startMin, vrLocal.endMin].forEach((mins, index) => {
                const tick = document.createElement('div');
                tick.className = 'mc-schedule-axis-tick';
                tick.classList.add(index === 0 ? 'mc-block-schedule-tick-start' : 'mc-block-schedule-tick-end');
                tick.textContent = formatTimeToAmPm(mins);
                blockScheduleAxis.appendChild(tick);
            });
        }

        function renderBlockEditorClassList() {
            if (!blockEditorClassList) return;
            blockEditorClassList.innerHTML = '';
            classes.forEach((cls) => {
                const item = document.createElement('div');
                item.className = 'mc-block-editor-class-item';
                item.draggable = true;
                item.innerHTML = `<span class="mc-class-dot" style="background:${cls.colour || '#9aa0a6'}"></span><span class="mc-class-label">${escapeHtml(cls.title || 'Class')}</span>`;
                item.addEventListener('dragstart', (ev) => {
                    blockEditorDraggedClassId = cls.id;
                    if (ev.dataTransfer) {
                        ev.dataTransfer.effectAllowed = 'copy';
                        ev.dataTransfer.setData('text/plain', cls.id);
                    }
                });
                item.addEventListener('dragend', () => {
                    blockEditorDraggedClassId = null;
                });
                blockEditorClassList.appendChild(item);
            });
        }

        function getBlockEditorItem(itemId) {
            return blockEditorState && Array.isArray(blockEditorState.items)
                ? blockEditorState.items.find((entry) => entry.id === itemId) || null
                : null;
        }

        function syncBlockEditorFocusedItem() {
            if (!blockScheduleDay) return;
            blockScheduleDay.querySelectorAll('.mc-block-editor-period-focused').forEach((el) => el.classList.remove('mc-block-editor-period-focused'));
            if (!focusedBlockEditorItem) return;
            const block = findBlockEditorBlock(focusedBlockEditorItem);
            if (block) block.classList.add('mc-block-editor-period-focused');
        }

        function syncBlockEditorActiveItem() {
            if (!blockScheduleDay) return;
            blockScheduleDay.querySelectorAll('.mc-block-editor-period-active').forEach((el) => el.classList.remove('mc-block-editor-period-active'));
            if (!activeBlockEditorItem) return;
            const block = findBlockEditorBlock(activeBlockEditorItem);
            if (block) block.classList.add('mc-block-editor-period-active');
        }

        function syncBlockEditorTuneInputs(item) {
            if (!item || !blockTuneStartEl || !blockTuneEndEl) return;
            blockTuneStartEl.value = item.start || '';
            blockTuneEndEl.value = item.end || '';
        }

        function hideBlockTunePanel() {
            activeBlockEditorItem = null;
            blockTuneEl.hidden = true;
            blockTuneEl.style.left = '';
            blockTuneEl.style.top = '';
            syncBlockEditorActiveItem();
        }

        function openBlockTunePanel(itemId, anchorEl) {
            const item = getBlockEditorItem(itemId);
            if (!item || !anchorEl || !blockTuneEl) {
                hideBlockTunePanel();
                return;
            }
            activeBlockEditorItem = itemId;
            focusedBlockEditorItem = itemId;
            syncBlockEditorTuneInputs(item);
            blockTuneEl.hidden = false;
            const positionRoot = blockTuneEl.offsetParent || blockEditorPanel;
            const rootRect = positionRoot.getBoundingClientRect();
            const anchorRect = anchorEl.getBoundingClientRect();
            const tuneRect = blockTuneEl.getBoundingClientRect();
            let left = anchorRect.right - rootRect.left + 10;
            let top = anchorRect.top - rootRect.top + Math.max(0, (anchorRect.height - tuneRect.height) / 2);
            if (left + tuneRect.width > rootRect.width - 12) {
                left = anchorRect.left - rootRect.left - tuneRect.width - 10;
            }
            left = Math.max(12, Math.min(rootRect.width - tuneRect.width - 12, left));
            top = Math.max(12, Math.min(rootRect.height - tuneRect.height - 12, top));
            blockTuneEl.style.left = `${Math.round(left)}px`;
            blockTuneEl.style.top = `${Math.round(top)}px`;
            syncBlockEditorFocusedItem();
            syncBlockEditorActiveItem();
        }

        function persistBlockTuneChanges() {
            if (!activeBlockEditorItem) return;
            const item = getBlockEditorItem(activeBlockEditorItem);
            if (!item) return;
            const startVal = blockTuneStartEl?.value || '';
            const endVal = blockTuneEndEl?.value || '';
            if (!startVal || !endVal) return;
            if (parseTimeToMinutes(startVal) >= parseTimeToMinutes(endVal)) return;
            item.start = startVal;
            item.end = endVal;
            renderBlockEditorItems();
            setTimeout(() => {
                const block = findBlockEditorBlock(item.id);
                if (block) openBlockTunePanel(item.id, block);
                else hideBlockTunePanel();
            }, 0);
        }

        function findBlockEditorBlock(itemId) {
            return blockScheduleDay ? blockScheduleDay.querySelector(`.mc-block-editor-period[data-item-id="${itemId}"]`) : null;
        }

        function getBlockEditorPlacementFromPointer(clientY, durationMin) {
            if (!blockScheduleDay) return null;
            const rect = blockScheduleDay.getBoundingClientRect();
            const vrLocal = getViewRange();
            const total = Math.max(1, vrLocal.endMin - vrLocal.startMin);
            const rawRatio = (clientY - rect.top) / Math.max(1, rect.height);
            const centeredRatio = rawRatio - ((durationMin || 0) / total) / 2;
            const startMin = vrLocal.startMin + (Math.max(0, Math.min(1, centeredRatio)) * total);
            return computeSchedulePlacement(0, startMin, durationMin);
        }

        function syncBlockEditorItemPlacement(el, placement, item) {
            if (!el || !placement) return;
            el.style.top = `${placement.topPct}%`;
            el.style.height = `${placement.heightPct}%`;
            el.style.background = getClassColorById(item.classId);
            el.setAttribute('title', `${getClassTitleById(item.classId)} ${formatTimeToAmPm(item.start)} - ${formatTimeToAmPm(item.end)}`);
            const dayHeight = Math.max(1, blockScheduleDay?.clientHeight || blockScheduleDay?.offsetHeight || 1);
            const topPx = (placement.topPct / 100) * dayHeight;
            el.dataset.badgeClamped = topPx <= 24 ? 'top' : '';
            el.style.setProperty('--mc-badge-fixed-top', `${Math.round(2 - topPx)}px`);
            const startBadge = el.querySelector('.mc-schedule-time-badge-start');
            if (startBadge) startBadge.textContent = formatTimeToAmPm(item.start);
        }

        function renderBlockEditorPeriodsList() {
            if (!blockEditorPeriodsList) return;
            blockEditorPeriodsList.innerHTML = '';

            if (!blockEditorState || !Array.isArray(blockEditorState.items) || !blockEditorState.items.length) {
                const empty = document.createElement('div');
                empty.className = 'mc-periods-empty';
                empty.textContent = 'Drag a class into the schedule to get started';
                blockEditorPeriodsList.appendChild(empty);
                return;
            }

            const items = blockEditorState.items
                .map((item) => ({
                    item,
                    classTitle: getClassTitleById(item.classId),
                    classColor: getClassColorById(item.classId),
                    startMin: parseTimeToMinutes(item.start || '00:00'),
                    endMin: parseTimeToMinutes(item.end || '00:00')
                }))
                .filter((entry) => entry.endMin > entry.startMin)
                .sort((a, b) => {
                    if (a.startMin !== b.startMin) return a.startMin - b.startMin;
                    return a.classTitle.localeCompare(b.classTitle);
                });

            if (!items.length) {
                const empty = document.createElement('div');
                empty.className = 'mc-periods-empty';
                empty.textContent = 'No periods yet in this block.';
                blockEditorPeriodsList.appendChild(empty);
                return;
            }

            const section = document.createElement('section');
            section.className = 'mc-periods-day-section mc-block-periods-section';


            const grid = document.createElement('div');
            grid.className = 'mc-periods-day-grid';

            items.forEach((entry) => {
                const item = document.createElement('div');
                item.className = 'mc-periods-item mc-block-periods-item';

                const topRow = document.createElement('div');
                topRow.className = 'mc-periods-item-top';

                const swatch = document.createElement('span');
                swatch.className = 'mc-periods-item-dot';
                swatch.style.background = entry.classColor;

                const meta = document.createElement('div');
                meta.className = 'mc-periods-item-meta';
                const titleEl = document.createElement('div');
                titleEl.className = 'mc-periods-item-title';
                titleEl.textContent = entry.classTitle;
                const timeEl = document.createElement('div');
                timeEl.className = 'mc-periods-item-time';
                timeEl.textContent = `${formatTimeToAmPm(entry.item.start)} - ${formatTimeToAmPm(entry.item.end)}`;
                meta.appendChild(titleEl);
                meta.appendChild(timeEl);

                const actions = document.createElement('div');
                actions.className = 'mc-periods-item-actions';

                const deleteBtn = document.createElement('button');
                deleteBtn.type = 'button';
                deleteBtn.className = 'mc-periods-item-delete';
                deleteBtn.textContent = 'Delete';
                deleteBtn.setAttribute('aria-label', `Delete ${entry.classTitle} from block`);
                deleteBtn.addEventListener('click', () => {
                    if (!blockEditorState) return;
                    blockEditorState.items = (blockEditorState.items || []).filter((itemEntry) => itemEntry.id !== entry.item.id);
                    if (focusedBlockEditorItem === entry.item.id) focusedBlockEditorItem = null;
                    if (activeBlockEditorItem === entry.item.id) hideBlockTunePanel();
                    renderBlockEditorItems();
                });

                topRow.addEventListener('click', () => {
                    focusedBlockEditorItem = entry.item.id;
                    renderBlockEditorItems();
                    const block = findBlockEditorBlock(entry.item.id);
                    if (block) openBlockTunePanel(entry.item.id, block);
                });

                actions.appendChild(deleteBtn);
                topRow.appendChild(swatch);
                topRow.appendChild(meta);
                topRow.appendChild(actions);
                item.appendChild(topRow);
                grid.appendChild(item);
            });

            section.appendChild(grid);
            blockEditorPeriodsList.appendChild(section);
        }

        function renderBlockEditorItems() {
            if (!blockScheduleDay || !blockEditorState) return;
            blockScheduleDay.innerHTML = '';
            const vrLocal = getViewRange();
            const total = Math.max(1, vrLocal.endMin - vrLocal.startMin);
            const items = Array.isArray(blockEditorState.items) ? blockEditorState.items : [];
            const bucket = [];

            items.forEach((item) => {
                const startMin = parseTimeToMinutes(item.start || '00:00');
                const endMin = parseTimeToMinutes(item.end || '00:00');
                if (endMin <= startMin) return;
                // Match timetable behavior: fully outside view range is hidden.
                if (endMin <= vrLocal.startMin || startMin >= vrLocal.endMin) return;
                const clippedStart = Math.max(startMin, vrLocal.startMin);
                const clippedEnd = Math.min(endMin, vrLocal.endMin);
                const topPct = ((clippedStart - vrLocal.startMin) / total) * 100;
                const heightPct = Math.max(4, ((clippedEnd - clippedStart) / total) * 100);
                const el = document.createElement('button');
                el.type = 'button';
                el.className = 'mc-schedule-block mc-block-editor-period';
                el.dataset.itemId = item.id;
                el.innerHTML = `
                    <span class="mc-schedule-resize-handle mc-schedule-resize-handle-start" aria-hidden="true"></span>
                    <span class="mc-schedule-resize-handle mc-schedule-resize-handle-end" aria-hidden="true"></span>
                `;
                el.addEventListener('pointerdown', (ev) => {
                    const handle = ev.target.closest('.mc-schedule-resize-handle');
                    if (handle) {
                        startBlockEditorResize(ev, item, el, handle.classList.contains('mc-schedule-resize-handle-start') ? 'start' : 'end');
                        return;
                    }
                    startBlockEditorDrag(ev, item, el);
                });
                if (blockEditorDragState
                    && blockEditorDragState.itemId === item.id
                    && blockEditorDragState.hasMoved) {
                    el.classList.add('mc-schedule-block-dragging');
                    el.classList.add('mc-schedule-block-show-badges');
                }
                bucket.push({ el, item, top: clippedStart, height: Math.max(1, clippedEnd - clippedStart), topPct, heightPct });
            });

            bucket.sort((a, b) => a.top - b.top);
            const n = bucket.length;
            const adj = new Array(n).fill(0).map(() => []);
            for (let i = 0; i < n; i++) {
                const aTop = bucket[i].top;
                const aBottom = bucket[i].top + bucket[i].height;
                for (let j = i + 1; j < n; j++) {
                    const bTop = bucket[j].top;
                    const bBottom = bucket[j].top + bucket[j].height;
                    if (!(aBottom <= bTop || aTop >= bBottom)) {
                        adj[i].push(j);
                        adj[j].push(i);
                    }
                }
            }
            const visited = new Array(n).fill(false);
            for (let i = 0; i < n; i++) {
                if (visited[i]) continue;
                const stack = [i];
                const compIdxs = [];
                visited[i] = true;
                while (stack.length) {
                    const u = stack.pop();
                    compIdxs.push(u);
                    adj[u].forEach((v) => { if (!visited[v]) { visited[v] = true; stack.push(v); } });
                }
                const comp = compIdxs.map((idx) => bucket[idx]).sort((a, b) => a.top - b.top);
                const cols = [];
                comp.forEach((entry) => {
                    const bottom = entry.top + entry.height;
                    let placed = false;
                    for (let cIndex = 0; cIndex < cols.length; cIndex++) {
                        if (entry.top >= cols[cIndex].lastBottom) {
                            cols[cIndex].lastBottom = bottom;
                            entry.colIndex = cIndex;
                            placed = true;
                            break;
                        }
                    }
                    if (!placed) {
                        cols.push({ lastBottom: bottom });
                        entry.colIndex = cols.length - 1;
                    }
                });
                const colCount = Math.max(1, cols.length);
                const gapPx = 4;
                const boardWidth = Math.max(0, blockScheduleDay.clientWidth || blockScheduleDay.offsetWidth || 0);
                const usableWidth = Math.max(0, boardWidth - 8);
                const columnWidth = colCount === 1 ? usableWidth : Math.max(6, Math.floor((usableWidth - ((colCount - 1) * gapPx)) / colCount));
                comp.forEach((entry) => {
                    entry.el.style.left = `${4 + (entry.colIndex * (columnWidth + gapPx))}px`;
                    entry.el.style.width = `${columnWidth}px`;
                    syncBlockEditorItemPlacement(entry.el, { topPct: entry.topPct, heightPct: entry.heightPct }, entry.item);
                    blockScheduleDay.appendChild(entry.el);
                });
            }
            if (activeBlockEditorItem && !findBlockEditorBlock(activeBlockEditorItem)) {
                hideBlockTunePanel();
            }
            if (focusedBlockEditorItem && !findBlockEditorBlock(focusedBlockEditorItem)) {
                focusedBlockEditorItem = null;
            }
            syncBlockEditorFocusedItem();
            syncBlockEditorActiveItem();
            renderBlockEditorPeriodsList();
        }

        function closeBlockEditor() {
            if (blockEditorResizeObserver) {
                blockEditorResizeObserver.disconnect();
                blockEditorResizeObserver = null;
            }
            blockEditorOverlay.hidden = true;
            blockEditorOverlay.classList.remove('visible');
            blockEditorState = null;
            blockEditorDraggedClassId = null;
            focusedBlockEditorItem = null;
            activeBlockEditorItem = null;
            hideBlockTunePanel();
        }

        function openBlockEditor(existingBlock = null) {
            blockEditorState = existingBlock
                ? { id: existingBlock.id, name: existingBlock.name || '', items: (existingBlock.items || []).map((item) => ({ ...item })) }
                : { id: 'b_' + Math.random().toString(36).slice(2, 8), name: '', items: [] };
            if (blockNameInput) blockNameInput.value = blockEditorState.name || '';
            buildBlockScheduleBoard();
            renderBlockEditorClassList();
            blockEditorOverlay.hidden = false;
            blockEditorOverlay.classList.add('visible');
            renderBlockEditorItems();
            if (typeof ResizeObserver !== 'undefined' && blockScheduleDay) {
                if (blockEditorResizeObserver) blockEditorResizeObserver.disconnect();
                blockEditorResizeObserver = new ResizeObserver(() => {
                    if (blockEditorState) renderBlockEditorItems();
                });
                blockEditorResizeObserver.observe(blockScheduleDay);
            }
            window.requestAnimationFrame(() => {
                renderBlockEditorItems();
            });
        }

        function startBlockEditorDrag(ev, item, el) {
            if (ev.button !== 0 || !blockEditorState) return;
            ev.preventDefault();
            const startMin = parseTimeToMinutes(item.start || '00:00');
            const endMin = parseTimeToMinutes(item.end || '00:00');
            blockEditorDragState = {
                pointerId: ev.pointerId,
                itemId: item.id,
                el,
                durationMin: Math.max(5, endMin - startMin),
                startClientX: ev.clientX,
                startClientY: ev.clientY,
                hasMoved: false,
                alreadyFocused: focusedBlockEditorItem === item.id
            };
            try { el.setPointerCapture(ev.pointerId); } catch (_) {}
            window.addEventListener('pointermove', handleBlockEditorDragMove, true);
            window.addEventListener('pointerup', handleBlockEditorDragUp, true);
            window.addEventListener('pointercancel', handleBlockEditorDragCancel, true);
        }

        function handleBlockEditorDragMove(ev) {
            if (!blockEditorDragState || !blockEditorState) return;
            const item = blockEditorState.items.find((entry) => entry.id === blockEditorDragState.itemId);
            if (!item) return;
            const dx = ev.clientX - blockEditorDragState.startClientX;
            const dy = ev.clientY - blockEditorDragState.startClientY;
            if (!blockEditorDragState.hasMoved && ((dx * dx) + (dy * dy) >= 16)) {
                blockEditorDragState.hasMoved = true;
                blockEditorDragState.el.classList.add('mc-schedule-block-dragging');
                blockEditorDragState.el.classList.add('mc-schedule-block-show-badges');
            }
            const placement = getBlockEditorPlacementFromPointer(ev.clientY, blockEditorDragState.durationMin);
            if (!placement) return;
            item.start = minutesToTimeString(placement.startMin);
            item.end = minutesToTimeString(placement.endMin);
            renderBlockEditorItems();
            const block = findBlockEditorBlock(item.id);
            if (block) openBlockTunePanel(item.id, block);
        }

        function finishBlockEditorDrag() {
            if (!blockEditorDragState) return;
            const current = blockEditorDragState;
            blockEditorDragState = null;
            try { current.el.releasePointerCapture(current.pointerId); } catch (_) {}
            window.removeEventListener('pointermove', handleBlockEditorDragMove, true);
            window.removeEventListener('pointerup', handleBlockEditorDragUp, true);
            window.removeEventListener('pointercancel', handleBlockEditorDragCancel, true);
            if (!current.hasMoved) {
                focusedBlockEditorItem = current.itemId;
                syncBlockEditorFocusedItem();
                const block = findBlockEditorBlock(current.itemId);
                if (block) openBlockTunePanel(current.itemId, block);
            }
        }

        function handleBlockEditorDragUp() { finishBlockEditorDrag(); }
        function handleBlockEditorDragCancel() { finishBlockEditorDrag(); }

        function startBlockEditorResize(ev, item, el, edge) {
            if (ev.button !== 0 || !blockEditorState) return;
            if (activeBlockEditorItem !== item.id) return;
            ev.preventDefault();
            const startMin = parseTimeToMinutes(item.start || '00:00');
            const endMin = parseTimeToMinutes(item.end || '00:00');
            blockEditorResizeState = { pointerId: ev.pointerId, itemId: item.id, el, edge, startMin, endMin, startClientY: ev.clientY, hasMoved: false };
            try { el.setPointerCapture(ev.pointerId); } catch (_) {}
            window.addEventListener('pointermove', handleBlockEditorResizeMove, true);
            window.addEventListener('pointerup', handleBlockEditorResizeUp, true);
            window.addEventListener('pointercancel', handleBlockEditorResizeCancel, true);
        }

        function handleBlockEditorResizeMove(ev) {
            if (!blockEditorResizeState || !blockEditorState) return;
            const item = blockEditorState.items.find((entry) => entry.id === blockEditorResizeState.itemId);
            if (!item || !blockScheduleDay) return;
            const rect = blockScheduleDay.getBoundingClientRect();
            const vrLocal = getViewRange();
            const total = Math.max(1, vrLocal.endMin - vrLocal.startMin);

            // Require a small initial movement to avoid accidental drags
            const deltaY = ev.clientY - (blockEditorResizeState.startClientY || ev.clientY);
            if (!blockEditorResizeState.hasMoved && Math.abs(deltaY) < 4) return;
            if (!blockEditorResizeState.hasMoved) blockEditorResizeState.hasMoved = true;

            // Use cursor position to determine placement (less sensitive than incremental deltas)
            const rawRatio = (ev.clientY - rect.top) / Math.max(1, rect.height);
            const clampedRatio = Math.max(0, Math.min(1, rawRatio));

            const originalStart = Math.max(vrLocal.startMin, Math.min(vrLocal.endMin, blockEditorResizeState.startMin || 0));
            const originalEnd = Math.max(vrLocal.startMin, Math.min(vrLocal.endMin, blockEditorResizeState.endMin || 0));
            const minDur = 5;

            if (blockEditorResizeState.edge === 'start') {
                let startMin = vrLocal.startMin + Math.round(clampedRatio * total);
                startMin = snapMinutes(startMin, 5);
                startMin = Math.max(vrLocal.startMin, Math.min(startMin, originalEnd - minDur));
                item.start = minutesToTimeString(startMin);
                item.end = minutesToTimeString(originalEnd);
            } else {
                let endMin = vrLocal.startMin + Math.round(clampedRatio * total);
                endMin = snapMinutes(endMin, 5);
                endMin = Math.min(vrLocal.endMin, Math.max(endMin, originalStart + minDur));
                item.start = minutesToTimeString(originalStart);
                item.end = minutesToTimeString(endMin);
            }
            syncBlockEditorTuneInputs(item);
            renderBlockEditorItems();
            const block = findBlockEditorBlock(item.id);
            if (block) openBlockTunePanel(item.id, block);
        }

        function finishBlockEditorResize() {
            if (!blockEditorResizeState) return;
            const current = blockEditorResizeState;
            blockEditorResizeState = null;
            try { current.el.releasePointerCapture(current.pointerId); } catch (_) {}
            window.removeEventListener('pointermove', handleBlockEditorResizeMove, true);
            window.removeEventListener('pointerup', handleBlockEditorResizeUp, true);
            window.removeEventListener('pointercancel', handleBlockEditorResizeCancel, true);
        }

        function handleBlockEditorResizeUp() { finishBlockEditorResize(); }
        function handleBlockEditorResizeCancel() { finishBlockEditorResize(); }

        function computeSchedulePlacement(dayIndex, startMin, durationMin) {
            const vrLocal = getViewRange();
            const total = Math.max(1, vrLocal.endMin - vrLocal.startMin);
            const safeDuration = Math.max(5, durationMin || 5);
            const maxStart = Math.max(vrLocal.startMin, vrLocal.endMin - safeDuration);
            const clampedStart = Math.max(vrLocal.startMin, Math.min(maxStart, snapMinutes(startMin, 5)));
            const clampedEnd = Math.min(vrLocal.endMin, clampedStart + safeDuration);
            const topPct = ((clampedStart - vrLocal.startMin) / total) * 100;
            const heightPct = Math.max(4, ((clampedEnd - clampedStart) / total) * 100);
            return {
                day: Number(dayIndex) || 0,
                startMin: clampedStart,
                endMin: clampedEnd,
                topPct,
                heightPct
            };
        }

        function getPlacementFromDayBodyPointer(dayBody, clientY, durationMin, grabOffsetMin) {
            if (!dayBody) return null;
            const rect = dayBody.getBoundingClientRect();
            const vrLocal = getViewRange();
            const total = Math.max(1, vrLocal.endMin - vrLocal.startMin);
            const rawRatio = (clientY - rect.top) / Math.max(1, rect.height);
            const startMin = vrLocal.startMin + (rawRatio * total) - grabOffsetMin;
            return computeSchedulePlacement(dayBody.dataset.day, startMin, durationMin);
        }

        function applyScheduleBlockPlacement(block, placement, backgroundColor) {
            if (!block || !placement || !scheduleDaysEl) return;
            const dayBody = scheduleDaysEl.querySelector(`.mc-schedule-day-body[data-day="${placement.day}"]`);
            if (!dayBody) return;
            if (block.parentElement !== dayBody) {
                dayBody.appendChild(block);
            }
            block.style.top = `${placement.topPct}%`;
            block.style.height = `${placement.heightPct}%`;
            if (backgroundColor) block.style.background = backgroundColor;
            block.dataset.day = String(placement.day);
            const dayHeight = Math.max(1, dayBody.clientHeight || dayBody.offsetHeight || 1);
            const topPx = (placement.topPct / 100) * dayHeight;
            block.dataset.badgeClamped = topPx <= 24 ? 'top' : '';
            block.style.setProperty('--mc-badge-fixed-top', `${Math.round(2 - topPx)}px`);
            syncScheduleBlockBadges(block, placement);
        }

        function commitScheduleDrag(dragState) {
            if (!dragState || !dragState.currentPlacement) return;
            const targetClass = classById(dragState.classId);
            if (!targetClass) return;
            const next = normalizePeriods(classPeriods[targetClass.id] || []);
            const idx = next.findIndex(x => x.id === dragState.periodId);
            if (idx === -1) return;
            next[idx] = Object.assign({}, next[idx], {
                day: dragState.currentPlacement.day,
                start: minutesToTimeString(dragState.currentPlacement.startMin),
                end: minutesToTimeString(dragState.currentPlacement.endMin)
            });
            classPeriods[targetClass.id] = next;
            targetClass.periods = next;
            selectedId = targetClass.id;
            saveAndRender();
        }

        function finishScheduleBlockDrag({ cancelled = false, openTune = false } = {}) {
            const dragState = scheduleDragState;
            if (!dragState) return;
            scheduleDragState = null;
            clearScheduleDragMoveRaf();

            clearScheduleDropTargets();
            document.body.classList.remove('mc-schedule-dragging');
            window.removeEventListener('pointermove', handleScheduleBlockPointerMove, true);
            window.removeEventListener('pointerup', handleScheduleBlockPointerUp, true);
            window.removeEventListener('pointercancel', handleScheduleBlockPointerCancel, true);

            if (dragState.block) {
                dragState.block.classList.remove('mc-schedule-block-dragging');
                setScheduleBlockBadgeVisibility(dragState.block, false);
                try { dragState.block.releasePointerCapture(dragState.pointerId); } catch (_) {}
            }

            const shouldCommit = !cancelled && dragState.hasMoved && placementChanged(dragState.originPlacement, dragState.currentPlacement);
            if (shouldCommit) {
                commitScheduleDrag(dragState);
                return;
            }

            if (dragState.block && dragState.originPlacement) {
                applyScheduleBlockPlacement(dragState.block, dragState.originPlacement, dragState.backgroundColor);
            }

            if (openTune && dragState.block) {
                if (selectedId !== dragState.classId) selectClassById(dragState.classId);
                focusSchedulePeriod(dragState.classId, dragState.periodId);
                const targetBlock = periodsRow.querySelector(`.mc-schedule-block[data-class-id="${dragState.classId}"][data-period-id="${dragState.periodId}"]`);
                if (targetBlock) openTunePanel(dragState.classId, dragState.periodId, targetBlock);
            }
        }

        function handleScheduleBlockPointerMove(ev) {
            const dragState = scheduleDragState;
            if (!dragState) return;

            dragState.lastPointerClientX = ev.clientX;
            dragState.lastPointerClientY = ev.clientY;

            if (scheduleDragMoveRafId !== null) return;

            scheduleDragMoveRafId = window.requestAnimationFrame(() => {
                scheduleDragMoveRafId = null;

                const currentState = scheduleDragState;
                if (!currentState) return;

                const clientX = currentState.lastPointerClientX;
                const clientY = currentState.lastPointerClientY;
                if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;

                const distanceX = clientX - currentState.startClientX;
                const distanceY = clientY - currentState.startClientY;
                if (!currentState.hasMoved && ((distanceX * distanceX) + (distanceY * distanceY) >= 4)) {
                    currentState.hasMoved = true;
                    document.body.classList.add('mc-schedule-dragging');
                    if (currentState.block) {
                        currentState.block.classList.add('mc-schedule-block-dragging');
                        setScheduleBlockBadgeVisibility(currentState.block, true);
                    }
                }

                const dayBody = document.elementFromPoint(clientX, clientY)?.closest('.mc-schedule-day-body');
                if (!dayBody || !scheduleDaysEl.contains(dayBody)) {
                    clearScheduleDropTargets();
                    return;
                }

                const highlightedDay = scheduleDaysEl.querySelector('.mc-schedule-day-body.mc-drop-target');
                if (highlightedDay !== dayBody) {
                    clearScheduleDropTargets();
                    dayBody.classList.add('mc-drop-target');
                }

                const placement = getPlacementFromDayBodyPointer(
                    dayBody,
                    clientY,
                    currentState.durationMin,
                    currentState.grabOffsetMin
                );
                if (!placement) return;
                currentState.currentPlacement = placement;
                applyScheduleBlockPlacement(currentState.block, placement, currentState.backgroundColor);
                if (activeTune
                    && activeTune.classId === currentState.classId
                    && activeTune.periodId === currentState.periodId) {
                    positionTunePanel(currentState.block);
                }
            });
        }

        function handleScheduleBlockPointerUp(ev) {
            const dragState = scheduleDragState;
            if (!dragState || ev.pointerId !== dragState.pointerId) return;
            finishScheduleBlockDrag({ openTune: !dragState.hasMoved });
        }

        function handleScheduleBlockPointerCancel(ev) {
            const dragState = scheduleDragState;
            if (!dragState || ev.pointerId !== dragState.pointerId) return;
            finishScheduleBlockDrag({ cancelled: true });
        }

        function startScheduleBlockDrag(ev, cls, p, block) {
            if (ev.button !== 0) return;
            const startMin = parseTimeToMinutes(p.start || '00:00');
            const endMin = parseTimeToMinutes(p.end || '00:00');
            if (endMin <= startMin) return;

            ev.preventDefault();
            ev.stopPropagation();
            finishScheduleBlockDrag({ cancelled: true });

            const originPlacement = computeSchedulePlacement(p.day, startMin, endMin - startMin);
            const dayBodyRect = block.parentElement.getBoundingClientRect();
            const blockRect = block.getBoundingClientRect();
            const viewRange = getViewRange();
            const durationMin = endMin - startMin;
            const grabOffsetMin = Math.max(0, Math.min(
                durationMin,
                ((ev.clientY - blockRect.top) / Math.max(1, dayBodyRect.height))
                    * (viewRange.endMin - viewRange.startMin)
            ));
            scheduleDragState = {
                pointerId: ev.pointerId,
                block,
                classId: cls.id,
                periodId: p.id,
                durationMin,
                grabOffsetMin,
                backgroundColor: cls.colour || '#9aa0a6',
                startClientX: ev.clientX,
                startClientY: ev.clientY,
                hasMoved: false,
                originPlacement,
                currentPlacement: originPlacement
            };

            try { block.setPointerCapture(ev.pointerId); } catch (_) {}
            window.addEventListener('pointermove', handleScheduleBlockPointerMove, true);
            window.addEventListener('pointerup', handleScheduleBlockPointerUp, true);
            window.addEventListener('pointercancel', handleScheduleBlockPointerCancel, true);
            openTunePanel(cls.id, p.id, block);
        }

        function updateResizePreview(block, placement) {
            if (!scheduleResizeState || !block || !placement) return;
            applyScheduleBlockPlacement(block, placement, scheduleResizeState.backgroundColor);
            block.classList.add('mc-schedule-block-resizing');
            syncActiveTuneInputs(placement, scheduleResizeState.activeTuneSnapshot);
            positionTunePanel(block);
        }

        function handleScheduleResizePointerMove(ev) {
            const resizeState = scheduleResizeState;
            if (!resizeState) return;
            const dayBody = resizeState.block.parentElement;
            if (!dayBody) return;
            const rect = dayBody.getBoundingClientRect();
            const vrLocal = getViewRange();
            const total = Math.max(1, vrLocal.endMin - vrLocal.startMin);

            const deltaY = ev.clientY - (resizeState.startClientY || ev.clientY);
            if (!resizeState.hasMoved && Math.abs(deltaY) < 4) return;
            if (!resizeState.hasMoved) resizeState.hasMoved = true;

            const deltaMinutes = Math.round((deltaY / Math.max(1, rect.height)) * total);

            let nextStart = resizeState.originPlacement.startMin;
            let nextEnd = resizeState.originPlacement.endMin;
            if (resizeState.edge === 'start') {
                let candidate = nextStart + deltaMinutes;
                candidate = snapMinutes(candidate, 5);
                nextStart = Math.max(vrLocal.startMin, Math.min(candidate, nextEnd - 5));
            } else {
                let candidate = nextEnd + deltaMinutes;
                candidate = snapMinutes(candidate, 5);
                nextEnd = Math.min(vrLocal.endMin, Math.max(candidate, nextStart + 5));
            }

            resizeState.currentPlacement = computeSchedulePlacement(
                resizeState.originPlacement.day,
                nextStart,
                Math.max(5, nextEnd - nextStart)
            );
            updateResizePreview(resizeState.block, resizeState.currentPlacement);
        }

        function finishScheduleResize({ cancelled = false } = {}) {
            const resizeState = scheduleResizeState;
            if (!resizeState) return;
            scheduleResizeState = null;

            window.removeEventListener('pointermove', handleScheduleResizePointerMove, true);
            window.removeEventListener('pointerup', handleScheduleResizePointerUp, true);
            window.removeEventListener('pointercancel', handleScheduleResizePointerCancel, true);

            if (resizeState.block) {
                resizeState.block.classList.remove('mc-schedule-block-resizing');
                try { resizeState.block.releasePointerCapture(resizeState.pointerId); } catch (_) {}
            }

            const targetClass = classById(resizeState.classId);
            const next = targetClass ? normalizePeriods(classPeriods[targetClass.id] || []) : [];
            const idx = next.findIndex(x => x.id === resizeState.periodId);
            const canCommit = !cancelled && targetClass && idx !== -1 && placementChanged(resizeState.originPlacement, resizeState.currentPlacement);

            if (canCommit) {
                next[idx] = Object.assign({}, next[idx], {
                    start: minutesToTimeString(resizeState.currentPlacement.startMin),
                    end: minutesToTimeString(resizeState.currentPlacement.endMin)
                });
                classPeriods[targetClass.id] = next;
                targetClass.periods = next;
                saveAndRender();
                return;
            }

            if (resizeState.block) {
                applyScheduleBlockPlacement(resizeState.block, resizeState.originPlacement, resizeState.backgroundColor);
            }
            syncActiveTuneInputs(resizeState.originPlacement, resizeState.activeTuneSnapshot);
            syncActiveTuneBlock();
        }

        function handleScheduleResizePointerUp(ev) {
            const resizeState = scheduleResizeState;
            if (!resizeState || ev.pointerId !== resizeState.pointerId) return;
            finishScheduleResize();
        }

        function handleScheduleResizePointerCancel(ev) {
            const resizeState = scheduleResizeState;
            if (!resizeState || ev.pointerId !== resizeState.pointerId) return;
            finishScheduleResize({ cancelled: true });
        }

        function startScheduleResize(ev, cls, p, block, edge) {
            if (ev.button !== 0) return;
            ev.preventDefault();
            ev.stopPropagation();

            finishScheduleBlockDrag({ cancelled: true });
            finishScheduleResize({ cancelled: true });

            const startMin = parseTimeToMinutes(p.start || '00:00');
            const endMin = parseTimeToMinutes(p.end || '00:00');
            if (endMin <= startMin) return;

            if (!activeTune || activeTune.classId !== cls.id || activeTune.periodId !== p.id) {
                return;
            }

            const originPlacement = computeSchedulePlacement(p.day, startMin, endMin - startMin);
            scheduleResizeState = {
                pointerId: ev.pointerId,
                block,
                classId: cls.id,
                periodId: p.id,
                edge,
                backgroundColor: cls.colour || '#9aa0a6',
                originPlacement,
                currentPlacement: originPlacement,
                startClientY: ev.clientY,
                hasMoved: false,
                activeTuneSnapshot: { classId: activeTune.classId, periodId: activeTune.periodId }
            };

            block.classList.add('mc-schedule-block-resizing');
            try { block.setPointerCapture(ev.pointerId); } catch (_) {}
            window.addEventListener('pointermove', handleScheduleResizePointerMove, true);
            window.addEventListener('pointerup', handleScheduleResizePointerUp, true);
            window.addEventListener('pointercancel', handleScheduleResizePointerCancel, true);
        }

        function classById(classId) {
            return classes.find(x => x.id === classId) || null;
        }

        function periodById(classId, periodId) {
            const list = normalizePeriods(classPeriods[classId] || []);
            return list.find(p => p.id === periodId) || null;
        }

        function buildScheduleBoard() {
            if (!scheduleAxisEl || !scheduleDaysEl) return;
            const vrLocal = getViewRange();
            const startControl = createTimeControl(vrLocal.start, 'Timetable start time', 'mc-schedule-axis-control-start');
            const endControl = createTimeControl(vrLocal.end, 'Timetable end time', 'mc-schedule-axis-control-end');
            scheduleAxisEl.innerHTML = '';
            scheduleAxisEl.appendChild(startControl.root);
            const spacer = document.createElement('div');
            spacer.className = 'mc-schedule-axis-spacer';
            spacer.setAttribute('aria-hidden', 'true');
            scheduleAxisEl.appendChild(spacer);
            scheduleAxisEl.appendChild(endControl.root);
            scheduleDaysEl.innerHTML = '';
            viewStartInput = startControl;
            viewEndInput = endControl;

            dayNames.forEach((dayName, dayIndex) => {
                const col = document.createElement('div');
                col.className = 'mc-schedule-day-col';
                col.dataset.day = String(dayIndex);

                const head = document.createElement('div');
                head.className = 'mc-schedule-day-head';
                head.textContent = dayName;

                const body = document.createElement('div');
                body.className = 'mc-schedule-day-body';
                body.dataset.day = String(dayIndex);

                body.addEventListener('dragover', (ev) => {
                    ev.preventDefault();
                    body.classList.add('mc-drop-target');
                });
                body.addEventListener('dragleave', () => {
                    body.classList.remove('mc-drop-target');
                });
                body.addEventListener('drop', (ev) => {
                    ev.preventDefault();
                    body.classList.remove('mc-drop-target');
                    if (draggedBlockId) {
                        applyBlockToDay(draggedBlockId, dayIndex);
                        draggedBlockId = null;
                        return;
                    }
                    if (!draggedClassId) return;
                    const targetClass = classById(draggedClassId);
                    if (!targetClass) return;

                    const rect = body.getBoundingClientRect();
                    const ratio = Math.max(0, Math.min(1, (ev.clientY - rect.top) / Math.max(1, rect.height)));
                    const total = vrLocal.endMin - vrLocal.startMin;
                    let startMin = vrLocal.startMin + Math.round(total * ratio);
                    startMin = snapMinutes(startMin, 5);
                    startMin = Math.max(vrLocal.startMin, Math.min(vrLocal.endMin - 15, startMin));
                    let endMin = Math.min(vrLocal.endMin, startMin + 60);
                    if (endMin <= startMin) endMin = Math.min(vrLocal.endMin, startMin + 30);
                    if (endMin <= startMin) return;

                    const newPeriod = {
                        id: randomPeriodId(),
                        day: dayIndex,
                        start: minutesToTimeString(startMin),
                        end: minutesToTimeString(endMin),
                        label: ''
                    };
                    const next = normalizePeriods(classPeriods[targetClass.id] || []);
                    next.push(newPeriod);
                    classPeriods[targetClass.id] = next;
                    if (selectedId === targetClass.id) targetClass.periods = next;
                    savePeriods(classPeriods);
                    renderPeriodsList(classById(selectedId));
                });

                col.appendChild(head);
                col.appendChild(body);
                scheduleDaysEl.appendChild(col);
            });
        }

        function hideTunePanel() {
            activeTune = null;
            if (!scheduleTuneEl) return;
            scheduleTuneEl.hidden = true;
            scheduleTuneEl.style.left = '';
            scheduleTuneEl.style.top = '';
            syncActiveTuneBlock();
        }

        function positionTunePanel(anchorEl) {
            if (!scheduleTuneEl || scheduleTuneEl.hidden || !anchorEl) return;
            const positionRoot = scheduleTuneEl.offsetParent || periodsRow || panel;
            const rootRect = positionRoot.getBoundingClientRect();
            const anchorRect = anchorEl.getBoundingClientRect();
            const tuneRect = scheduleTuneEl.getBoundingClientRect();
            let left = anchorRect.right - rootRect.left + 10;
            let top = anchorRect.top - rootRect.top + Math.max(0, (anchorRect.height - tuneRect.height) / 2);
            if (left + tuneRect.width > rootRect.width - 12) {
                left = anchorRect.left - rootRect.left - tuneRect.width - 10;
            }
            left = Math.max(12, Math.min(rootRect.width - tuneRect.width - 12, left));
            top = Math.max(12, Math.min(rootRect.height - tuneRect.height - 12, top));
            scheduleTuneEl.style.left = `${Math.round(left)}px`;
            scheduleTuneEl.style.top = `${Math.round(top)}px`;
        }

        function openTunePanel(classId, periodId, anchorEl) {
            const targetClass = classById(classId);
            const targetPeriod = periodById(classId, periodId);
            if (!targetClass || !targetPeriod || !scheduleTuneEl) {
                hideTunePanel();
                return;
            }
            activeTune = { classId, periodId };
            focusSchedulePeriod(classId, periodId);
            syncActiveTuneInputs({
                startMin: parseTimeToMinutes(targetPeriod.start || '00:00'),
                endMin: parseTimeToMinutes(targetPeriod.end || '00:00')
            });
            if (tuneRoomEl) tuneRoomEl.value = targetPeriod.room || '';
            scheduleTuneEl.hidden = false;
            positionTunePanel(anchorEl);
            syncActiveTuneBlock();
        }

        function persistActiveTuneChanges() {
            if (!activeTune) return;
            const targetClass = classById(activeTune.classId);
            if (!targetClass) return;
            const startVal = tuneStartEl ? tuneStartEl.value : '';
            const endVal = tuneEndEl ? tuneEndEl.value : '';

            const next = normalizePeriods(classPeriods[targetClass.id] || []);
            const idx = next.findIndex(x => x.id === activeTune.periodId);
            if (idx === -1) return;
            const period = Object.assign({}, next[idx]);
            if (startVal && endVal && parseTimeToMinutes(startVal) < parseTimeToMinutes(endVal)) {
                period.start = startVal;
                period.end = endVal;
            }
            period.room = String(tuneRoomEl?.value || '').trim();
            next[idx] = period;
            classPeriods[targetClass.id] = next;
            targetClass.periods = next;
            saveAndRender();
            try { renderPeriodsOnTimetable(); } catch (_) {}
            try { updateTimetableIndicator(); } catch (_) {}
            try { updateLiveWidget(); } catch (_) {}
        }

        function updateImportDayUI() {
            importDayButtons.forEach(btn => {
                const day = Number(btn.dataset.day);
                btn.classList.toggle('selected', selectedImportDays.has(day));
            });
            importAllBtn.classList.toggle('selected', selectedImportDays.size === 7);
            if (importNoneBtn) importNoneBtn.classList.toggle('selected', selectedImportDays.size === 0);
        }

        function setAllImportDays(selected) {
            selectedImportDays = selected ? new Set([0, 1, 2, 3, 4, 5, 6]) : new Set();
            updateImportDayUI();
        }

        function ensureImportSourceOptions() {
            if (importSourceSelect) {
                importSourceSelect.innerHTML = '';
                ['Timetable 1', 'Timetable 2', 'Timetable 3'].forEach((name, idx) => {
                    if (idx === mcTimetable.currentTimetableIndex) return;
                    const option = document.createElement('option');
                    option.value = String(idx);
                    option.textContent = name;
                    importSourceSelect.appendChild(option);
                });
                if (!importSourceSelect.value && importSourceSelect.options.length) {
                    importSourceSelect.value = importSourceSelect.options[0].value;
                }
            }
            setAllImportDays(true);
        }

        function closeImportOverlay() {
            setScheduleViewMode('timetable');
        }

        function loadPeriodsForTimetableIndex(index) {
            try {
                const key = STORAGE_KEY_PREFIX + index;
                const raw = localStorage.getItem(key);
                return raw ? JSON.parse(raw) : {};
            } catch (e) {
                return {};
            }
        }

        function importPeriodsFromTimetable(sourceIndex, daySet) {
            if (sourceIndex === mcTimetable.currentTimetableIndex) return;
            const sourcePeriods = loadPeriodsForTimetableIndex(sourceIndex);
            const targetPeriods = Object.assign({}, classPeriods || {});
            const classIds = new Set([
                ...Object.keys(targetPeriods || {}),
                ...Object.keys(sourcePeriods || {}),
                ...classes.map(c => c.id)
            ]);

            classIds.forEach(classId => {
                const currentList = normalizePeriods(targetPeriods[classId] || []);
                const sourceList = normalizePeriods(sourcePeriods[classId] || []);

                const kept = currentList.filter(p => !daySet.has(Number(p.day) || 0));
                const imported = sourceList
                    .filter(p => daySet.has(Number(p.day) || 0))
                    .map(p => Object.assign({}, p, { id: randomPeriodId() }));

                const merged = kept.concat(imported);
                if (merged.length) targetPeriods[classId] = merged;
                else delete targetPeriods[classId];
            });

            classPeriods = targetPeriods;
            savePeriods(classPeriods);

            const selectedClass = classes.find(x => x.id === selectedId);
            if (selectedClass) {
                selectedClass.periods = normalizePeriods(classPeriods[selectedClass.id] || []);
                renderPeriodsList(selectedClass);
            } else {
                renderPeriodsList(null);
            }

            renderSidebarList();
            try { renderPeriodsOnTimetable(); } catch (_) {}
            try { updateTimetableIndicator(); } catch (_) {}
            try { updateLiveWidget(); } catch (_) {}
        }

        function applyViewInputs(startInput = viewStartInput, endInput = viewEndInput) {
            commitViewRangeFromControls(startInput, endInput);
        }

        scheduleViewTabs.forEach((tab) => {
            tab.addEventListener('click', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                const mode = tab.dataset.tab;
                if (mode) setScheduleViewMode(mode);
            });
        });
        if (importAllBtn) {
            importAllBtn.addEventListener('click', () => {
                setAllImportDays(true);
            });
        }
        if (importNoneBtn) {
            importNoneBtn.addEventListener('click', () => {
                setAllImportDays(false);
            });
        }
        importDayButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const day = Number(btn.dataset.day);
                if (selectedImportDays.has(day)) selectedImportDays.delete(day);
                else selectedImportDays.add(day);
                updateImportDayUI();
            });
        });
        if (importCancelBtn) {
            importCancelBtn.addEventListener('click', closeImportOverlay);
        }
        if (importConfirmBtn) {
            importConfirmBtn.addEventListener('click', () => {
                if (!importSourceSelect || !importSourceSelect.value) {
                    alert('Please choose a timetable to import from.');
                    return;
                }
                if (!selectedImportDays.size) {
                    alert('Please select at least one day to import.');
                    return;
                }
                const sourceIndex = Number(importSourceSelect.value);
                if (Number.isNaN(sourceIndex) || sourceIndex === mcTimetable.currentTimetableIndex) {
                    alert('Please choose a different timetable.');
                    return;
                }
                importPeriodsFromTimetable(sourceIndex, new Set(selectedImportDays));
                closeImportOverlay();
            });
        }

        if (blockScheduleDay) {
            blockScheduleDay.addEventListener('dragover', (ev) => {
                ev.preventDefault();
                blockScheduleDay.classList.add('mc-drop-target');
            });
            blockScheduleDay.addEventListener('dragleave', () => {
                blockScheduleDay.classList.remove('mc-drop-target');
            });
            blockScheduleDay.addEventListener('drop', (ev) => {
                ev.preventDefault();
                blockScheduleDay.classList.remove('mc-drop-target');
                if (!blockEditorState || !blockEditorDraggedClassId) return;
                const rect = blockScheduleDay.getBoundingClientRect();
                const vrLocal = getViewRange();
                const total = vrLocal.endMin - vrLocal.startMin;
                let startMin = vrLocal.startMin + Math.round(total * Math.max(0, Math.min(1, (ev.clientY - rect.top) / Math.max(1, rect.height))));
                startMin = snapMinutes(startMin, 5);
                startMin = Math.max(vrLocal.startMin, Math.min(vrLocal.endMin - 30, startMin));
                const endMin = Math.min(vrLocal.endMin, startMin + 60);
                blockEditorState.items.push({
                    id: randomPeriodId(),
                    classId: blockEditorDraggedClassId,
                    start: minutesToTimeString(startMin),
                    end: minutesToTimeString(endMin)
                });
                renderBlockEditorItems();
            });
        }

        if (blockEditorCancelBtn) {
            blockEditorCancelBtn.addEventListener('click', closeBlockEditor);
        }
        if (blockTuneStartEl) {
            blockTuneStartEl.addEventListener('blur', persistBlockTuneChanges);
            blockTuneStartEl.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') {
                    persistBlockTuneChanges();
                    blockTuneStartEl.blur();
                }
            });
        }
        if (blockTuneEndEl) {
            blockTuneEndEl.addEventListener('blur', persistBlockTuneChanges);
            blockTuneEndEl.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') {
                    persistBlockTuneChanges();
                    blockTuneEndEl.blur();
                }
            });
        }
        if (blockTuneDeleteEl) {
            blockTuneDeleteEl.addEventListener('click', () => {
                if (!activeBlockEditorItem || !blockEditorState) return;
                blockEditorState.items = (blockEditorState.items || []).filter((item) => item.id !== activeBlockEditorItem);
                focusedBlockEditorItem = null;
                hideBlockTunePanel();
                renderBlockEditorItems();
            });
        }
        blockEditorOverlay.addEventListener('click', (e) => {
            if (e.target === blockEditorOverlay) closeBlockEditor();
        });
        if (blockEditorPanel) {
            blockEditorPanel.addEventListener('click', (e) => e.stopPropagation());
        }
        if (blockEditorSaveBtn) {
            blockEditorSaveBtn.addEventListener('click', () => {
                try { console.log('mc:block-editor:save-click', !!blockEditorState, blockEditorState && blockEditorState.id); } catch (_) {}
                if (!blockEditorState) return;
                const name = String(blockNameInput?.value || '').trim() || `Block ${blocks.length + 1}`;
                const nextBlock = {
                    id: blockEditorState.id,
                    name,
                    items: (blockEditorState.items || []).map((item) => ({
                        id: item.id,
                        classId: item.classId,
                        start: item.start,
                        end: item.end
                    }))
                };
                const existingIndex = blocks.findIndex((item) => item.id === nextBlock.id);
                const nextBlocks = blocks.slice();
                if (existingIndex === -1) nextBlocks.unshift(nextBlock);
                else nextBlocks.splice(existingIndex, 1, nextBlock);
                selectedBlockId = nextBlock.id;
                saveBlocks(nextBlocks);
                closeBlockEditor();
            });
        }

        // Utilities to render
        function renderSidebarList(animateSelected = false) {
            updateSidebarModeUi();
            const addEntry = list.querySelector('.mc-class-add-entry');
            list.innerHTML = '';
            if (addEntry) list.appendChild(addEntry);
            if (sidebarMode === 'blocks') {
                blocks.forEach((block) => {
                    const row = document.createElement('div');
                    row.className = 'mc-class-item-row';

                    const item = document.createElement('div');
                    item.className = 'mc-class-item mc-block-item';
                    item.dataset.id = block.id;
                    item.draggable = true;

                    const dot = document.createElement('span');
                    dot.className = 'mc-class-dot mc-block-dot';
                    const label = document.createElement('span');
                    label.className = 'mc-class-label';
                    label.textContent = block.name || 'Untitled block';

                    const content = document.createElement('div');
                    content.className = 'mc-class-item-content';
                    content.appendChild(dot);
                    content.appendChild(label);

                    item.appendChild(content);

                    item.addEventListener('dragstart', (ev) => {
                        draggedBlockId = block.id;
                        if (ev.dataTransfer) {
                            ev.dataTransfer.effectAllowed = 'copy';
                            ev.dataTransfer.setData('text/plain', block.id);
                        }
                    });
                    item.addEventListener('dragend', () => {
                        draggedBlockId = null;
                        const targets = periodsRow.querySelectorAll('.mc-drop-target');
                        targets.forEach((target) => target.classList.remove('mc-drop-target'));
                    });

                    const itemDelBtn = document.createElement('button');
                    itemDelBtn.type = 'button';
                    itemDelBtn.className = 'mc-delete-class-btn';
                    itemDelBtn.title = 'Delete block';
                    itemDelBtn.setAttribute('aria-label', 'Delete block');
                    itemDelBtn.innerHTML = `<img src="${deleteCrossIconUrl}" class="mc-delete-class-icon" alt="Delete" aria-hidden="true">`;

                    let confirmState = false;
                    const resetDeleteState = () => {
                        confirmState = false;
                        itemDelBtn.innerHTML = `<img src="${deleteCrossIconUrl}" class="mc-delete-class-icon" alt="Delete" aria-hidden="true">`;
                        itemDelBtn.classList.remove('mc-delete-class-confirm');
                    };

                    itemDelBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (!confirmState) {
                            confirmState = true;
                            itemDelBtn.innerHTML = `<img src="${deleteCheckIconUrl}" class="mc-delete-class-icon" alt="Confirm delete" aria-hidden="true">`;
                            itemDelBtn.classList.add('mc-delete-class-confirm');
                            return;
                        }
                        if (blockEditorState && blockEditorState.id === block.id) {
                            closeBlockEditor();
                        }
                        blocks = blocks.filter(x => x.id !== block.id);
                        saveBlocks(blocks);
                        renderSidebarList();
                    });

                    itemDelBtn.addEventListener('mouseleave', () => {
                        if (confirmState) {
                            resetDeleteState();
                        }
                    });

                    item.addEventListener('click', () => {
                        openBlockEditor(block);
                    });

                    row.appendChild(item);
                    row.appendChild(itemDelBtn);
                    list.appendChild(row);
                });
                return;
            }

            classes.forEach(c => {
                const row = document.createElement('div');
                row.className = 'mc-class-item-row';

                const item = document.createElement('div');
                item.className = 'mc-class-item';
                item.dataset.id = c.id;

                const dot = document.createElement('span');
                dot.className = 'mc-class-dot';
                dot.style.background = c.colour || '#9aa0a6';
                const label = document.createElement('span');
                label.className = 'mc-class-label';
                label.textContent = c.title || '';

                item.draggable = true;
                item.setAttribute('aria-grabbed', 'false');
                item.addEventListener('dragstart', (ev) => {
                    draggedClassId = c.id;
                    item.setAttribute('aria-grabbed', 'true');
                    if (ev.dataTransfer) {
                        ev.dataTransfer.effectAllowed = 'copy';
                        ev.dataTransfer.setData('text/plain', c.id);
                    }
                });
                item.addEventListener('dragend', () => {
                    draggedClassId = null;
                    item.setAttribute('aria-grabbed', 'false');
                    const targets = periodsRow.querySelectorAll('.mc-drop-target, .mc-periods-day-drop-target');
                    targets.forEach(target => target.classList.remove('mc-drop-target'));
                    periodsRow.querySelectorAll('.mc-periods-day-drop-target').forEach(target => target.classList.remove('mc-periods-day-drop-target'));
                });

                const content = document.createElement('div');
                content.className = 'mc-class-item-content';
                content.appendChild(dot);
                content.appendChild(label);

                const itemDelBtn = document.createElement('button');
                itemDelBtn.type = 'button';
                itemDelBtn.className = 'mc-delete-class-btn';
                itemDelBtn.title = 'Delete class';
                itemDelBtn.setAttribute('aria-label', 'Delete class');
                itemDelBtn.innerHTML = `<img src="${deleteCrossIconUrl}" class="mc-delete-class-icon" alt="Delete" aria-hidden="true">`;

                let confirmState = false;
                const resetDeleteState = () => {
                    confirmState = false;
                    itemDelBtn.innerHTML = `<img src="${deleteCrossIconUrl}" class="mc-delete-class-icon" alt="Delete" aria-hidden="true">`;
                    itemDelBtn.classList.remove('mc-delete-class-confirm');
                };

                itemDelBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (!selectedId) return;
                    if (!confirmState) {
                        confirmState = true;
                        itemDelBtn.innerHTML = `<img src="${deleteCheckIconUrl}" class="mc-delete-class-icon" alt="Confirm delete" aria-hidden="true">`;
                        itemDelBtn.classList.add('mc-delete-class-confirm');
                        return;
                    }
                    classes = classes.filter(x => x.id !== selectedId);
                    saveClasses(classes);
                    selectedId = classes.length ? classes[0].id : null;
                    renderSidebarList();
                    renderEditFormFor(classes.find(x => x.id === selectedId));
                });

                itemDelBtn.addEventListener('mouseleave', () => {
                    if (confirmState) {
                        resetDeleteState();
                    }
                });

                item.appendChild(content);
                row.appendChild(item);
                row.appendChild(itemDelBtn);

                if (selectedId === c.id) {
                    if (animateSelected) {
                        window.requestAnimationFrame(() => item.classList.add('selected'));
                    } else {
                        item.classList.add('selected');
                    }
                } else {
                    resetDeleteState();
                }

                item.addEventListener('click', () => selectClassById(c.id));
                list.appendChild(row);
            });

            if (!classes.length) {
                selectedId = null;
                renderEditFormFor(null);
            }
        }

        function renderEmptyClassOverlay() {
            const emptyPanel = document.createElement('div');
            emptyPanel.className = 'mc-class-empty-overlay';
            emptyPanel.innerHTML = `
                <div class="mc-class-empty-title">Add a new class to get started</div>
            `;
            return emptyPanel;
        }

        function selectClassById(id) {
            if (selectedId !== id) hideTunePanel();
            selectedId = id;
            renderSidebarList(true);
            hideClassroomDropdown();
            const c = classes.find(x => x.id === id);
            renderEditFormFor(c);
        }

        function normalizePeriods(arr) {
            if (!Array.isArray(arr)) return [];
            return arr.map(p => {
                if (!p) return null;
                if (typeof p === 'string') {
                    // Try parse 'HH:MM-HH:MM Label' (no day)
                    const m = p.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})\s*(.*)$/);
                    if (m) {
                        return { id: 'p_' + Math.random().toString(36).slice(2,8), start: m[1], end: m[2], day: 0, label: m[3] || '' };
                    }
                    return { id: 'p_' + Math.random().toString(36).slice(2,8), start: '', end: '', day: 0, label: p };
                }
                return Object.assign({ id: 'p_' + Math.random().toString(36).slice(2,8), start: '', end: '', day: 0, label: '' }, p);
            }).filter(Boolean);
        }

        function renderEditFormFor(c) {
            const existingEmptyPanel = right.querySelector('.mc-class-empty-overlay');
            if (!c) {
                right.classList.add('mc-edit-form-empty');
                if (!existingEmptyPanel) {
                    right.appendChild(renderEmptyClassOverlay());
                }
                form.querySelectorAll('input,textarea').forEach(el => {
                    if (el.classList.contains('mc-input-colour')) {
                        el.value = '#9aa0a6';
                    } else {
                        el.value = '';
                    }
                });
                syncColourTrigger('#9aa0a6');
                hideInlineColourPicker();
                renderPeriodsList(null);
                updateClassroomDisplay('', '');
                return;
            }
            right.classList.remove('mc-edit-form-empty');
            if (existingEmptyPanel) existingEmptyPanel.remove();
            hideInlineColourPicker();
            form.querySelector('.mc-input-title').value = c.title || '';
            form.querySelector('.mc-input-teacher').value = c.teacher || '';
            form.querySelector('.mc-input-room').value = c.room || '';
            syncColourTrigger(c.colour || '#9aa0a6');
            updateClassroomDisplay(c.classroomName, c.classroom);

            // Get periods for this class from the current timetable
            const periods = classPeriods[c.id] || [];
            c.periods = normalizePeriods(periods);
            renderPeriodsList(c);
        }

        // Visual schedule functionality
        const deleteCrossIconUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
            ? chrome.runtime.getURL('Icons/bannerclose.svg')
            : '';
        const deleteCheckIconUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
            ? chrome.runtime.getURL('Icons/check.svg')
            : '';
        const trashIconUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
            ? chrome.runtime.getURL('Icons/Trash Icon.svg')
            : '';

        function saveAndRender() {
            // Save class data
            saveClasses(classes);
            // Extract and save periods from the current selected class
            const c = classes.find(x => x.id === selectedId);
            if (c && c.periods) {
                classPeriods[c.id] = c.periods;
                savePeriods(classPeriods);
            }
            renderSidebarList();
            renderPeriodsList(c);
        }

        function renderPeriodsList(c) {
            if (!scheduleDaysEl) return;
            buildScheduleBoard();
            bindTimeControl(viewStartInput, () => viewEndInput, true);
            bindTimeControl(viewEndInput, () => viewStartInput, false);
            const vrLocal = getViewRange();
            const total = Math.max(1, vrLocal.endMin - vrLocal.startMin);
            const dayBuckets = {};

            classes.forEach(cls => {
                const periods = normalizePeriods(classPeriods[cls.id] || []);
                periods.forEach(p => {
                    const day = Number(p.day) || 0;
                    const startMin = parseTimeToMinutes(p.start || '00:00');
                    const endMin = parseTimeToMinutes(p.end || '00:00');
                    if (endMin <= startMin) return;
                    if (endMin <= vrLocal.startMin || startMin >= vrLocal.endMin) return;

                    const dayBody = scheduleDaysEl.querySelector(`.mc-schedule-day-body[data-day="${day}"]`);
                    if (!dayBody) return;

                    const clippedStart = Math.max(startMin, vrLocal.startMin);
                    const clippedEnd = Math.min(endMin, vrLocal.endMin);
                    const topPct = ((clippedStart - vrLocal.startMin) / total) * 100;
                    const heightPct = Math.max(4, ((clippedEnd - clippedStart) / total) * 100);

                    const block = document.createElement('button');
                    block.type = 'button';
                    block.className = 'mc-schedule-block';
                    if (selectedId === cls.id) block.classList.add('mc-schedule-block-selected');
                    block.style.top = `${topPct}%`;
                    block.style.height = `${heightPct}%`;
                    block.style.background = cls.colour || '#9aa0a6';
                    block.dataset.classId = cls.id;
                    block.dataset.periodId = p.id;
                    block.dataset.day = String(day);
                    block.innerHTML = `
                        <span class="mc-schedule-time-badge mc-schedule-time-badge-start"></span>
                        <span class="mc-schedule-resize-handle mc-schedule-resize-handle-start" aria-hidden="true"></span>
                        <span class="mc-schedule-resize-handle mc-schedule-resize-handle-end" aria-hidden="true"></span>
                    `;
                    block.setAttribute('aria-label', `${cls.title || 'Class'} ${formatTimeToAmPm(p.start || '00:00')} - ${formatTimeToAmPm(p.end || '00:00')} ${dayNames[day] || ''}`.trim());
                    block.setAttribute('title', `${cls.title || 'Class'} ${formatTimeToAmPm(p.start || '00:00')} - ${formatTimeToAmPm(p.end || '00:00')}`.trim());
                    syncScheduleBlockBadges(block, { startMin, endMin });
                    block.addEventListener('pointerdown', (ev) => {
                        const handle = ev.target.closest('.mc-schedule-resize-handle');
                        if (handle) {
                            startScheduleResize(ev, cls, p, block, handle.classList.contains('mc-schedule-resize-handle-start') ? 'start' : 'end');
                            return;
                        }
                        startScheduleBlockDrag(ev, cls, p, block);
                    });

                    if (!dayBuckets[day]) dayBuckets[day] = { body: dayBody, items: [] };
                    dayBuckets[day].items.push({
                        el: block,
                        topPct,
                        heightPct,
                        top: clippedStart,
                        height: Math.max(1, clippedEnd - clippedStart)
                    });
                });
            });

            Object.values(dayBuckets).forEach((bucket) => {
                const blocks = bucket.items;
                const dayBody = bucket.body;
                blocks.sort((a, b) => a.top - b.top);

                const n = blocks.length;
                const adj = new Array(n).fill(0).map(() => []);
                for (let i = 0; i < n; i++) {
                    const aTop = blocks[i].top;
                    const aBottom = blocks[i].top + blocks[i].height;
                    for (let j = i + 1; j < n; j++) {
                        const bTop = blocks[j].top;
                        const bBottom = blocks[j].top + blocks[j].height;
                        if (!(aBottom <= bTop || aTop >= bBottom)) {
                            adj[i].push(j);
                            adj[j].push(i);
                        }
                    }
                }

                const visited = new Array(n).fill(false);
                for (let i = 0; i < n; i++) {
                    if (visited[i]) continue;
                    const stack = [i];
                    const compIdxs = [];
                    visited[i] = true;
                    while (stack.length) {
                        const u = stack.pop();
                        compIdxs.push(u);
                        adj[u].forEach((v) => {
                            if (!visited[v]) {
                                visited[v] = true;
                                stack.push(v);
                            }
                        });
                    }

                    const comp = compIdxs.map((idx) => blocks[idx]).sort((a, b) => a.top - b.top);
                    const cols = [];
                    comp.forEach((item) => {
                        const bottom = item.top + item.height;
                        let placed = false;
                        for (let cIndex = 0; cIndex < cols.length; cIndex++) {
                            if (item.top >= cols[cIndex].lastBottom) {
                                cols[cIndex].lastBottom = bottom;
                                item.colIndex = cIndex;
                                placed = true;
                                break;
                            }
                        }
                        if (!placed) {
                            cols.push({ lastBottom: bottom });
                            item.colIndex = cols.length - 1;
                        }
                    });

                    const colCount = Math.max(1, cols.length);
                    const gapPx = 4;
                    const bodyWidth = Math.max(0, dayBody.clientWidth || dayBody.offsetWidth || 0);
                    const usableWidth = Math.max(0, bodyWidth - 8);
                    const columnWidth = colCount === 1
                        ? usableWidth
                        : Math.max(6, Math.floor((usableWidth - ((colCount - 1) * gapPx)) / colCount));

                    comp.forEach((item) => {
                        item.el.style.top = `${item.topPct}%`;
                        item.el.style.height = `${item.heightPct}%`;
                        item.el.style.left = `${4 + (item.colIndex * (columnWidth + gapPx))}px`;
                        item.el.style.width = `${columnWidth}px`;
                        item.el.style.right = 'auto';
                        dayBody.appendChild(item.el);
                    });
                }
            });

            if (c) {
                const latest = normalizePeriods(classPeriods[c.id] || []);
                c.periods = latest;
            }
            syncFocusedPeriodBlock();
            syncActiveTuneBlock();
            if (activeTune) {
                const activeBlock = findScheduleBlock(activeTune.classId, activeTune.periodId);
                if (activeBlock) openTunePanel(activeTune.classId, activeTune.periodId, activeBlock);
                else hideTunePanel();
            }
            renderAllPeriodsView();
        }

        function editPeriod(c, p) {
            const block = periodsRow.querySelector(`.mc-schedule-block[data-class-id="${c.id}"][data-period-id="${p.id}"]`);
            if (block) openTunePanel(c.id, p.id, block);
        }

        if (tuneDeleteEl) {
            tuneDeleteEl.addEventListener('click', () => {
                if (!activeTune) return;
                const targetClass = classById(activeTune.classId);
                if (!targetClass) return;
                const next = normalizePeriods(classPeriods[targetClass.id] || []).filter(x => x.id !== activeTune.periodId);
                classPeriods[targetClass.id] = next;
                targetClass.periods = next;
                saveAndRender();
                hideTunePanel();
            });
        }

        if (tuneStartEl) {
            tuneStartEl.addEventListener('blur', persistActiveTuneChanges);
            tuneStartEl.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') {
                    persistActiveTuneChanges();
                    tuneStartEl.blur();
                }
            });
        }
        if (tuneEndEl) {
            tuneEndEl.addEventListener('blur', persistActiveTuneChanges);
            tuneEndEl.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') {
                    persistActiveTuneChanges();
                    tuneEndEl.blur();
                }
            });
        }
        if (tuneRoomEl) {
            tuneRoomEl.addEventListener('change', persistActiveTuneChanges);
            tuneRoomEl.addEventListener('blur', persistActiveTuneChanges);
            tuneRoomEl.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') {
                    ev.preventDefault();
                    persistActiveTuneChanges();
                    tuneRoomEl.blur();
                }
            });
        }

        if (scheduleClearBtn) {
            updateClearTimetableButton();
            scheduleClearBtn.addEventListener('click', () => {
                if (!clearTimetableArmed) {
                    armClearTimetableButton();
                    return;
                }
                resetClearTimetableButton();
                clearCurrentTimetablePeriods();
            });
        }

        setScheduleViewMode('timetable');

        if (scheduleBoardEl) {
            scheduleBoardEl.addEventListener('click', (ev) => {
                if (!ev.target.closest('.mc-schedule-block') && !ev.target.closest('.mc-schedule-tune')) {
                    hideTunePanel();
                }
            });
        }

        if (colourTriggerEl) {
            colourTriggerEl.addEventListener('click', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                if (!selectedId) return;
                if (inlineColourPickerEl && !inlineColourPickerEl.hidden) hideInlineColourPicker();
                else openInlineColourPicker();
            });
        }

        if (inlineColourCloseEl) {
            inlineColourCloseEl.addEventListener('click', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                hideInlineColourPicker();
            });
        }

        if (inlineColourHueEl) {
            inlineColourHueEl.addEventListener('input', () => {
                inlineColourState.h = Number(inlineColourHueEl.value || 0);
                drawInlineColourCanvas();
                updateInlineColourFromState();
            });
        }

        if (inlineColourHexEl) {
            const commitInlineHex = () => {
                let value = (inlineColourHexEl.value || '').trim();
                if (!value) return;
                if (!value.startsWith('#')) value = `#${value}`;
                if (!/^#([0-9a-f]{6})$/i.test(value)) return;
                const hsv = hexToHsv(value);
                inlineColourState = { h: hsv.h, s: hsv.s, v: hsv.v };
                if (inlineColourHueEl) inlineColourHueEl.value = String(Math.round(hsv.h));
                drawInlineColourCanvas();
                syncColourTrigger(value);
                commitColourToSelectedClass(value);
                positionInlineColourMarker();
            };
            inlineColourHexEl.addEventListener('blur', commitInlineHex);
            inlineColourHexEl.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') {
                    ev.preventDefault();
                    commitInlineHex();
                }
            });
        }

        if (inlineColourCanvasEl) {
            let draggingInlineColour = false;
            inlineColourCanvasEl.addEventListener('mousedown', (ev) => {
                draggingInlineColour = true;
                handleInlineColourPointer(ev.clientX, ev.clientY);
            });
            inlineColourCanvasEl.addEventListener('touchstart', (ev) => {
                if (!ev.touches || !ev.touches[0]) return;
                draggingInlineColour = true;
                handleInlineColourPointer(ev.touches[0].clientX, ev.touches[0].clientY);
                ev.preventDefault();
            }, { passive: false });
            window.addEventListener('mousemove', (ev) => {
                if (!draggingInlineColour) return;
                handleInlineColourPointer(ev.clientX, ev.clientY);
            });
            window.addEventListener('touchmove', (ev) => {
                if (!draggingInlineColour || !ev.touches || !ev.touches[0]) return;
                handleInlineColourPointer(ev.touches[0].clientX, ev.touches[0].clientY);
            }, { passive: false });
            window.addEventListener('mouseup', () => {
                draggingInlineColour = false;
            });
            window.addEventListener('touchend', () => {
                draggingInlineColour = false;
            });
        }


        // Click away to hide input
        document.addEventListener('click', function handler(e) {
            if (!overlay.isConnected || !inlineColourPickerEl || inlineColourPickerEl.hidden) return;
            const clickedInsidePicker = inlineColourPickerEl.contains(e.target);
            const clickedTrigger = colourTriggerEl && colourTriggerEl.contains(e.target);
            if (!clickedInsidePicker && !clickedTrigger) {
                hideInlineColourPicker();
            }
        }, true);

        // Form inputs (title/teacher/room/colour/classroom)
        form.querySelectorAll('.mc-input-title, .mc-input-teacher, .mc-input-room, .mc-input-colour, .mc-input-classroom').forEach(el => {
            el.addEventListener('input', () => {
                if (!selectedId) return;
                const c = classes.find(x => x.id === selectedId);
                if (!c) return;
                c.title = form.querySelector('.mc-input-title').value;
                c.teacher = form.querySelector('.mc-input-teacher').value;
                c.room = form.querySelector('.mc-input-room').value;
                c.colour = form.querySelector('.mc-input-colour').value;
                c.classroom = classroomInput ? classroomInput.value : '';
                const labelEl = classroomSelectedEl;
                c.classroomName = labelEl && labelEl.dataset.label ? labelEl.dataset.label : '';
                saveClasses(classes);
                renderSidebarList();
            });
        });

        if (classroomDisplayEl) {
            classroomDisplayEl.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleClassroomDropdown();
            });

            classroomDisplayEl.addEventListener('keydown', (e) => {
                if (!selectedId) return;
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleClassroomDropdown();
                } else if (e.key === 'Escape') {
                    hideClassroomDropdown();
                }
            });
        }

        if (clearClassroomBtn) {
            clearClassroomBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const target = classes.find(x => x.id === selectedId);
                if (!target) return;
                target.classroom = '';
                target.classroomName = '';
                saveClasses(classes);
                renderSidebarList();
                renderEditFormFor(target);
                hideClassroomDropdown();
            });
        }

        closeBtn.addEventListener('click', () => {
            if (scheduleBoardResizeObserver) {
                scheduleBoardResizeObserver.disconnect();
                scheduleBoardResizeObserver = null;
            }
            disconnectPeriodsLaneResizeObserver();
            hideClassroomDropdown();
            closeImportOverlay();
            hideTunePanel();
            overlay.remove();
        });

        // Close on overlay click outside panel
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                if (scheduleBoardResizeObserver) {
                    scheduleBoardResizeObserver.disconnect();
                    scheduleBoardResizeObserver = null;
                }
                disconnectPeriodsLaneResizeObserver();
                hideClassroomDropdown();
                closeImportOverlay();
                hideTunePanel();
                overlay.remove();
            }
        });

        // Keep overlay open when interacting inside the panel, but close tune popovers
        // when clicking outside blocks/tune controls anywhere in the editor panel.
        panel.addEventListener('click', (e) => {
            e.stopPropagation();
            const target = e.target;
            if (!(target instanceof Element)) return;
            if (
                target.closest('.mc-schedule-block') ||
                target.closest('.mc-schedule-tune') ||
                target.closest('.mc-block-schedule-tune')
            ) {
                return;
            }
            hideTunePanel();
            hideBlockTunePanel();
        });

        buildScheduleBoard();

        if (typeof ResizeObserver !== 'undefined' && scheduleBoardEl) {
            scheduleBoardResizeObserver = new ResizeObserver(() => {
                if (!overlay.isConnected) return;
                renderPeriodsList(classById(selectedId));
            });
            scheduleBoardResizeObserver.observe(scheduleBoardEl);
        }

        // Initial render
        renderSidebarList();
        if (selectedId) selectClassById(selectedId);
        setTimeout(() => overlay.classList.add('visible'), 10);
    }

    function positionTimetableMenu(container, anchor) {
        const rect = anchor.getBoundingClientRect();

        // Prefer a fixed top offset so the panel sits under the page header
        container.style.top = '4.5rem';

        // Position panel 10px from the right edge
        container.style.right = '10px';

        // If the fixed top causes the panel to overflow the bottom of the viewport, nudge it up so it fits
        const containerRect = container.getBoundingClientRect();
        if (containerRect.bottom > window.innerHeight - 8) {
            const topPx = Math.round(window.innerHeight - container.offsetHeight - 8);
            container.style.top = `${topPx}px`;
        }
    }

    function positionTodayPanel() {
        const todayPanel = mcTimetable.todayPanel;
        if (!todayPanel) return;
        todayPanel.style.top = '384px';
        todayPanel.style.removeProperty('right');
    }

    function updateTimetableIndicator() {
        const container = mcTimetable.container;
        if (!container) return;
        const now = new Date();
        const dayIndex = now.getDay(); // 0 (Sun) - 6 (Sat)
        const minutes = now.getHours() * 60 + now.getMinutes();

        const indicator = container.querySelector('.mc-timetable-indicator');
        const indicatorBg = container.querySelector('.mc-timetable-indicator-bg');
        if (!indicator || !indicatorBg) return;

        // Use view range to compute placement
        const view = getViewRange();
        const viewStart = view.startMin;
        const viewEnd = view.endMin;

        if (minutes < viewStart || minutes > viewEnd) {
            indicator.style.display = 'none';
            indicatorBg.style.display = 'none';
            return;
        }

        // Calculate vertical position based on the view range (using first timeline as reference)
        const grid = container.querySelector('.mc-timetable-grid');
        const firstTimeline = container.querySelector('.mc-timetable-timeline');
        if (!firstTimeline || !grid) return;
        
        const height = firstTimeline.offsetHeight;
        const topOffset = Math.round(((minutes - viewStart) / (viewEnd - viewStart)) * height);

        // Position the line to span across all days
        // Use getBoundingClientRect to get actual visual position
        const containerRect = container.getBoundingClientRect();
        const timelineRect = firstTimeline.getBoundingClientRect();
        const gridRect = grid.getBoundingClientRect();
        
        // Calculate relative to container: grid top + offset within timeline + time offset
        const relativeTop = (gridRect.top - containerRect.top) + (timelineRect.top - gridRect.top) + topOffset;
        const relativeLeft = gridRect.left - containerRect.left;
        const gridWidth = gridRect.width;
        
        // Position background indicator (semi-transparent) across all days
        indicatorBg.style.position = 'absolute';
        indicatorBg.style.left = `${relativeLeft}px`;
        indicatorBg.style.top = `${relativeTop}px`;
        indicatorBg.style.width = `${gridWidth}px`;
        indicatorBg.style.display = '';

        // Position bright indicator only on the current day
        const currentDayElement = container.querySelector('.mc-timetable-day[data-day-index="' + dayIndex + '"]');
        if (currentDayElement) {
            const currentTimeline = currentDayElement.querySelector('.mc-timetable-timeline');
            if (currentTimeline) {
                const currentTimelineRect = currentTimeline.getBoundingClientRect();
                const currentTimelineLeft = currentTimelineRect.left - containerRect.left;
                const currentTimelineWidth = currentTimelineRect.width;

                indicator.style.position = 'absolute';
                indicator.style.left = `${currentTimelineLeft}px`;
                indicator.style.top = `${relativeTop}px`;
                indicator.style.width = `${currentTimelineWidth}px`;
                indicator.style.display = '';
            } else {
                indicator.style.display = 'none';
            }
        } else {
            indicator.style.display = 'none';
        }

        indicator.style.position = 'absolute';
        indicator.style.height = '2px';
        indicator.style.borderRadius = '1px';
    }

    function showTimetableMenu(anchor) {
        console.debug('showTimetableMenu', anchor && anchor.className);
        const container = createTimetableMenu();
        if (!document.body.contains(container)) document.body.appendChild(container);
        if (mcTimetable.todayPanel && !document.body.contains(mcTimetable.todayPanel)) {
            document.body.appendChild(mcTimetable.todayPanel);
        }

        // Apply initial sizing so position can be calculated
        container.style.visibility = '';
        container.style.display = 'block';
        // use fixed positioning so the panel stays put during scroll
        container.style.position = 'fixed';
        container.style.zIndex = 1000000;
        if (mcTimetable.todayPanel) {
            if (mcTimetable.todayHideTimer) {
                clearTimeout(mcTimetable.todayHideTimer);
                mcTimetable.todayHideTimer = null;
            }
            mcTimetable.todayPanel.style.position = 'fixed';
            mcTimetable.todayPanel.style.zIndex = '1000000';
            mcTimetable.todayPanel.style.display = 'block';
            mcTimetable.todayPanel.classList.remove('mc-today-panel-visible');
            positionTodayPanel();
        }

        // Trigger slide-in animation
        requestAnimationFrame(() => {
            container.classList.add('mc-timetable-visible');
            if (mcTimetable.todayPanel) mcTimetable.todayPanel.classList.add('mc-today-panel-visible');
            positionTodayPanel();
        });
        setTimeout(positionTodayPanel, 360);

        updateTimetableIndicator();
        // render period blocks on the timeline
        renderPeriodsOnTimetable();

        if (mcTimetable.intervalId) clearInterval(mcTimetable.intervalId);
        mcTimetable.intervalId = setInterval(updateTimetableIndicator, 30 * 1000); // update every 30s

        // highlight current day
        const now = new Date();
        const dayIndex = now.getDay();
        container.querySelectorAll('.mc-timetable-day').forEach(d => d.classList.toggle('current', Number(d.dataset.dayIndex) === dayIndex));

        // close on outside click or ESC
        setTimeout(() => {
            document.addEventListener('click', onDocumentClickForTimetable);
            document.addEventListener('keydown', onDocumentKeydownForTimetable);
        }, 0);
    }

    function hideTimetableMenu() {
        if (!mcTimetable.container) return;
        if (mcTimetable.intervalId) { clearInterval(mcTimetable.intervalId); mcTimetable.intervalId = null; }
        
        // Trigger slide-out animation
        mcTimetable.container.classList.remove('mc-timetable-visible');
        if (mcTimetable.todayPanel) {
            mcTimetable.todayPanel.classList.remove('mc-today-panel-visible');
            if (mcTimetable.todayHideTimer) clearTimeout(mcTimetable.todayHideTimer);
            mcTimetable.todayHideTimer = setTimeout(() => {
                if (mcTimetable.todayPanel) mcTimetable.todayPanel.style.display = 'none';
                mcTimetable.todayHideTimer = null;
            }, 450);
        }
        
        // Remove after animation completes
        setTimeout(() => {
            if (mcTimetable.container && mcTimetable.container.parentElement) {
                mcTimetable.container.parentElement.removeChild(mcTimetable.container);
            }
            if (mcTimetable.todayPanel && mcTimetable.todayPanel.parentElement) {
                mcTimetable.todayPanel.parentElement.removeChild(mcTimetable.todayPanel);
            }
        }, 450); // matches the delayed Today panel animation
        
        document.removeEventListener('click', onDocumentClickForTimetable);
        document.removeEventListener('keydown', onDocumentKeydownForTimetable);
    }

    function toggleTimetableMenu(anchor) {
        if (mcTimetable.container && document.body.contains(mcTimetable.container)) {
            hideTimetableMenu();
        } else {
            showTimetableMenu(anchor);
        }
    }

    function onDocumentClickForTimetable(e) {
        if (!mcTimetable.container) return;
        if (e.target.closest('.mc-timetable') || e.target.closest('.mc-today-panel') || e.target.closest('.mc-left-action-btn')) return;
        hideTimetableMenu();
    }

    function onDocumentKeydownForTimetable(e) {
        if (e.key === 'Escape') hideTimetableMenu();
    }

    // Update indicator on resize/scroll too
    let timetableIndicatorFrame = 0;
    function scheduleTimetableIndicatorUpdate() {
        if (timetableIndicatorFrame) return;
        timetableIndicatorFrame = requestAnimationFrame(() => {
            timetableIndicatorFrame = 0;
            if (mcTimetable.container && mcTimetable.container.classList.contains('mc-timetable-visible')) {
                updateTimetableIndicator();
            }
        });
    }

    window.addEventListener('resize', () => {
        if (!mcTimetable.container || !mcTimetable.container.classList.contains('mc-timetable-visible')) return;
        scheduleTimetableIndicatorUpdate();
        renderPeriodsOnTimetable();
        positionTodayPanel();
    }, { passive: true });
    window.addEventListener('scroll', scheduleTimetableIndicatorUpdate, { passive: true });

    // Helper: read classes from storage for current timetable, with periods attached
    function getStoredClasses() {
        try {
            // Load shared classes
            const classesRaw = localStorage.getItem('mcTimetableClassesShared');
            let classes = classesRaw ? JSON.parse(classesRaw) : [];
            
            // Load periods for current timetable
            const periodsKey = 'mcTimetableClasses_' + mcTimetable.currentTimetableIndex;
            const periodsRaw = localStorage.getItem(periodsKey);
            const periodsMap = periodsRaw ? JSON.parse(periodsRaw) : {};
            
            // Attach periods to classes
            classes = classes.map(c => ({
                ...c,
                periods: periodsMap[c.id] || []
            }));
            
            // Fallback: if no shared classes, check for old format (migration safety)
            if (classes.length === 0 && mcTimetable.currentTimetableIndex === 0) {
                const oldRaw = localStorage.getItem('mcTimetableClasses');
                if (oldRaw) {
                    const oldData = JSON.parse(oldRaw);
                    // Auto-save to new format
                    try {
                        const classesList = oldData.map(c => {
                            const { periods, ...classData } = c;
                            return classData;
                        });
                        const newPeriodsMap = {};
                        oldData.forEach(c => {
                            if (c.id && c.periods) newPeriodsMap[c.id] = c.periods;
                        });
                        localStorage.setItem('mcTimetableClassesShared', JSON.stringify(classesList));
                        localStorage.setItem(periodsKey, JSON.stringify(newPeriodsMap));
                    } catch (e) {}
                    return oldData;
                }
            }
            
            return classes;
        } catch (e) { return []; }
    }

    // Local-only timetable sync; nothing is pushed to the cloud.
    function syncTimetableFromChrome() {
        try {
            if (mcTimetable.container && mcTimetable.container.classList.contains('visible')) {
                renderPeriodsOnTimetable();
            }
        } catch (e) {}
    }

    // Sync on page load
    syncTimetableFromChrome();

    // View range helpers (start/end times for visible timetable)
    function parseTimeToMinutes(t) {
        if (!t || typeof t !== 'string') return 0;
        const parts = t.split(':');
        const h = parseInt(parts[0], 10) || 0;
        const m = parseInt(parts[1], 10) || 0;
        return h * 60 + m;
    }

    function minutesToTimeString(mins) {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    }

    function formatTimeToAmPm(t) {
        // Accepts 'HH:MM' or a minutes number; returns 'h:mm am/pm'
        if (typeof t === 'number') {
            const h = Math.floor(t / 60);
            const m = t % 60;
            const ampm = h >= 12 ? 'pm' : 'am';
            const hh = ((h + 11) % 12) + 1; // 12-hour
            return `${hh}:${String(m).padStart(2, '0')} ${ampm}`;
        }
        if (!t || typeof t !== 'string') return '--:--';
        const parts = t.split(':');
        let h = parseInt(parts[0], 10) || 0;
        const m = parseInt(parts[1], 10) || 0;
        const ampm = h >= 12 ? 'pm' : 'am';
        const hh = ((h + 11) % 12) + 1;
        return `${hh}:${String(m).padStart(2, '0')} ${ampm}`;
    }

    function formatDurationCompact(totalMinutes) {
        const mins = Math.max(0, Math.floor(Number(totalMinutes) || 0));
        const hours = Math.floor(mins / 60);
        const remainingMinutes = mins % 60;

        if (hours > 0 && remainingMinutes > 0) return `${hours}h ${remainingMinutes}m`;
        if (hours > 0) return hours === 1 ? '1 hour' : `${hours} hours`;
        return remainingMinutes === 1 ? '1 minute' : `${remainingMinutes} minutes`;
    }

    function getViewRange() {
        try {
            const raw = localStorage.getItem('mcTimetableViewRange');
            if (raw) {
                const obj = JSON.parse(raw);
                const start = obj.start || '08:00';
                const end = obj.end || '16:00';
                const startMin = parseTimeToMinutes(start);
                const endMin = parseTimeToMinutes(end);
                // ensure sensible defaults
                if (startMin >= endMin) return { start: '08:00', end: '16:00', startMin: 480, endMin: 960 };
                return { start, end, startMin, endMin };
            }
        } catch (e) {}
        return { start: '08:00', end: '16:00', startMin: 480, endMin: 960 };
    }

    function saveViewRange(startStr, endStr) {
        try {
            const rangeData = { start: startStr, end: endStr };
            if (typeof storageSet === 'function') {
                storageSet('mcTimetableViewRange', rangeData);
            } else {
                localStorage.setItem('mcTimetableViewRange', JSON.stringify(rangeData));
            }
        } catch (e) { console.warn('Failed to save view range', e); }
    }

    // Period detail card state
    let mcPeriodDetailEl = null;
    let mcPeriodDetailHideTimeout = null;
    let mcPeriodDetailMoveHandler = null;

    function scheduleHidePeriodDetail(ms) {
        if (mcPeriodDetailHideTimeout) clearTimeout(mcPeriodDetailHideTimeout);
        mcPeriodDetailHideTimeout = setTimeout(hidePeriodDetailCard, ms || 200);
    }
    function cancelHidePeriodDetail() {
        if (mcPeriodDetailHideTimeout) { clearTimeout(mcPeriodDetailHideTimeout); mcPeriodDetailHideTimeout = null; }
    }

    function showPeriodDetailCard(targetEl, cls, period, mouseEvent) {
        // Create/update a persistent card that remains while hovered
        hidePeriodDetailCard();
        const card = document.createElement('div');
        card.className = 'mc-period-detail-card';
        const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        const dayName = dayNames[(period.day||0)];
        const metaParts = [];
        if (cls.teacher) metaParts.push(escapeHtml(cls.teacher));
        const room = period.room || cls.room;
        if (room) metaParts.push(escapeHtml(room));

        const startFancy = formatTimeToAmPm(period.start || '--:--');
        const endFancy = formatTimeToAmPm(period.end || '--:--');

        card.innerHTML = `
            <div class="mc-card-swatch" style="background:${escapeHtml(cls.colour || '#9aa0a6')}"></div>
            <div class="mc-card-content">
                <div class="mc-card-title">${escapeHtml(cls.title || '')}</div>
                ${metaParts.length? `<div class="mc-card-meta">${metaParts.join(' • ')}</div>`: ''}
                <div class="mc-card-period">${escapeHtml(dayName)} • ${escapeHtml(startFancy)} - ${escapeHtml(endFancy)}</div>
            </div>
        `;

        document.body.appendChild(card);
        mcPeriodDetailEl = card;

        card.addEventListener('mouseenter', () => { cancelHidePeriodDetail(); });
        card.addEventListener('mouseleave', () => { scheduleHidePeriodDetail(150); });

        const blockRect = targetEl.getBoundingClientRect();
        const containerRect = mcTimetable.container.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();

        let left, top;
        if (mouseEvent && typeof mouseEvent.clientX === 'number') {
            const offset = 12;
            left = mouseEvent.clientX + offset + window.scrollX;
            if (left + cardRect.width > window.scrollX + window.innerWidth - 8) {
                left = mouseEvent.clientX - cardRect.width - offset + window.scrollX;
            }
            // vertical: place slightly below cursor, but clamp
            top = mouseEvent.clientY + (offset/2) + window.scrollY;
        } else {
            left = containerRect.right + 10 + window.scrollX;
            if (left + cardRect.width > window.innerWidth - 8) {
                left = containerRect.left - cardRect.width - 10 + window.scrollX;
            }
            top = blockRect.top + window.scrollY - (cardRect.height/2) + (blockRect.height/2);
        }

        // Clamp horizontal placement so the card never appears off-screen
        const minLeft = window.scrollX + 8;
        const maxLeft = window.scrollX + window.innerWidth - cardRect.width - 8;
        if (maxLeft < minLeft) {
            left = minLeft;
        } else {
            if (left < minLeft) left = minLeft;
            if (left > maxLeft) left = maxLeft;
        }

        // clamp vertical position
        if (top < 8) top = 8;
        if (top + cardRect.height > window.scrollY + window.innerHeight - 8) {
            top = window.scrollY + window.innerHeight - cardRect.height - 8;
        }

        card.style.position = 'absolute';
        card.style.left = `${Math.round(left)}px`;
        card.style.top = `${Math.round(top)}px`;
        card.style.zIndex = '1400001';
        card.style.pointerEvents = 'auto';

        // Follow the cursor while visible
        if (mouseEvent && typeof mouseEvent.clientX === 'number') {
            try { if (mcPeriodDetailMoveHandler) window.removeEventListener('mousemove', mcPeriodDetailMoveHandler); } catch (_) {}
            mcPeriodDetailMoveHandler = (ev) => {
                const offset = 12;
                let nx = ev.clientX + offset + window.scrollX;
                if (nx + card.offsetWidth > window.scrollX + window.innerWidth - 8) {
                    nx = ev.clientX - card.offsetWidth - offset + window.scrollX;
                }
                let ny = ev.clientY + (offset/2) + window.scrollY;
                if (ny < 8) ny = 8;
                if (ny + card.offsetHeight > window.scrollY + window.innerHeight - 8) {
                    ny = window.scrollY + window.innerHeight - card.offsetHeight - 8;
                }
                card.style.left = Math.round(nx) + 'px';
                card.style.top = Math.round(ny) + 'px';
            };
            window.addEventListener('mousemove', mcPeriodDetailMoveHandler);
        }

    }

    function hidePeriodDetailCard() {
        cancelHidePeriodDetail();
        try { if (mcPeriodDetailMoveHandler) { window.removeEventListener('mousemove', mcPeriodDetailMoveHandler); mcPeriodDetailMoveHandler = null; } } catch (_) {}
        if (mcPeriodDetailEl && mcPeriodDetailEl.parentElement) mcPeriodDetailEl.parentElement.removeChild(mcPeriodDetailEl);
        mcPeriodDetailEl = null;
    }

    function escapeHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    function renderTodayPanel(classes) {
        const row = mcTimetable.todayPanel && mcTimetable.todayPanel.querySelector('.mc-today-row');
        if (!row) return;

        row.innerHTML = '';
        const now = new Date();
        const today = now.getDay();
        const nowMin = now.getHours() * 60 + now.getMinutes();
        const entries = [];

        (classes || []).forEach((cls) => {
            (cls.periods || []).forEach((period) => {
                if (!period || Number(period.day) !== today || !period.start || !period.end) return;
                const startMin = parseTimeToMinutes(period.start);
                const endMin = parseTimeToMinutes(period.end);
                if (endMin <= startMin) return;
                entries.push({ cls, period, startMin, endMin });
            });
        });

        entries.sort((a, b) => a.startMin - b.startMin);

        const visibleEntries = entries.filter((entry) => entry.endMin > nowMin);

        if (!visibleEntries.length) {
            const empty = document.createElement('div');
            empty.className = 'mc-today-empty';
            empty.textContent = 'Nothing else scheduled today...';
            row.appendChild(empty);
            return;
        }

        visibleEntries.forEach(({ cls, period, startMin, endMin }) => {
            const isActive = startMin <= nowMin && nowMin < endMin;
            const card = document.createElement('div');
            card.className = `mc-today-card mc-live-card ${isActive ? 'mc-live-card-active' : 'mc-live-card-upcoming'}`;
            card.setAttribute('role', 'button');
            card.tabIndex = 0;
            card.setAttribute('aria-label', `${cls.title || 'Class'} ${formatTimeToAmPm(period.start)} to ${formatTimeToAmPm(period.end)}`);

            const colour = escapeHtml(cls.colour || '#9aa0a6');
            const metaParts = [];
            if (cls.teacher) metaParts.push(escapeHtml(cls.teacher));
            const room = period.room || cls.room;
            if (room) metaParts.push(escapeHtml(room));
            card.innerHTML = `
                <div class="mc-card-swatch mc-card-swatch-today" style="--swatch-color: ${colour};"></div>
                <div class="mc-card-mini-content">
                    <div class="mc-card-mini-title">${escapeHtml(cls.title || '')}</div>
                    ${metaParts.length ? `<div class="mc-card-mini-meta">${metaParts.join(' • ')}</div>` : ''}
                    <div class="mc-card-mini-period">${escapeHtml(formatTimeToAmPm(period.start))} - ${escapeHtml(formatTimeToAmPm(period.end))}</div>
                </div>
            `;

            const activate = () => {
                if (cls.classroom && String(cls.classroom).trim()) navigateToClassroom(cls.classroom);
            };
            card.addEventListener('click', activate);
            card.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    activate();
                }
            });
            row.appendChild(card);
        });
    }

    function renderPeriodsOnTimetable() {
        const container = mcTimetable.container;
        if (!container || !document.body.contains(container)) return;

        // Remove existing blocks
        container.querySelectorAll('.mc-period-block').forEach(el => el.remove());

        const classes = getStoredClasses();
        renderTodayPanel(classes);
        if (!classes || !classes.length) return;

        const view = getViewRange();
        if (view.endMin <= view.startMin) return;

        const timelines = new Map(
            Array.from(container.querySelectorAll('.mc-timetable-timeline[data-day]'))
                .map(timeline => [timeline.dataset.day, timeline])
        );
        const timelineHeights = new Map(
            Array.from(timelines, ([day, timeline]) => [day, timeline.offsetHeight])
        );

        // Collect blocks per day so we can compute overlaps and split columns
        const dayBuckets = {};

        classes.forEach(cls => {
            (cls.periods || []).forEach(period => {
                // Basic sanity checks
                if (!period || typeof period.day === 'undefined' || !period.start || !period.end) return;
                const dayIndex = period.day || 0;
                const dayKey = String(dayIndex);
                const dayTimeline = timelines.get(dayKey);
                if (!dayTimeline) return;

                const timelineHeight = timelineHeights.get(dayKey);
                const startMin = parseTimeToMinutes(String(period.start));
                const endMin = parseTimeToMinutes(String(period.end));
                if (endMin <= startMin) return;

                // Use the configured view range, clamp and scale within it
                const viewStart = view.startMin;
                const viewEnd = view.endMin;

                const clampedStart = Math.max(startMin, viewStart);
                const clampedEnd = Math.min(endMin, viewEnd);
                if (clampedEnd <= clampedStart) return; // not visible in current view

                const top = Math.round(((clampedStart - viewStart) / (viewEnd - viewStart)) * timelineHeight);
                const height = Math.max(6, Math.round(((clampedEnd - clampedStart) / (viewEnd - viewStart)) * timelineHeight));

                const block = document.createElement('div');
                block.className = 'mc-period-block';
                block.style.position = 'absolute';
                block.style.top = `${top}px`;
                block.style.height = `${height}px`;
                block.style.background = cls.colour || '#9aa0a6';
                block.style.opacity = '1';
                block.style.pointerEvents = 'auto';
                block.dataset.classId = cls.id;
                block.dataset.periodId = period.id;
                block.dataset.top = String(top);
                block.dataset.height = String(height);
                // Remove visible text label inside blocks (keep accessible tooltip/aria-label)
                block.innerHTML = '';
                block.setAttribute('title', cls.title || '');
                block.setAttribute('aria-label', cls.title || '');

                block.addEventListener('mouseenter', (e) => {
                    cancelHidePeriodDetail();
                    // Pass the mouse event so the detail card can position next to the cursor
                    showPeriodDetailCard(block, cls, period, e);
                });
                block.addEventListener('mouseleave', () => scheduleHidePeriodDetail(200));

                if (!dayBuckets[dayIndex]) dayBuckets[dayIndex] = { timeline: dayTimeline, blocks: [] };
                dayBuckets[dayIndex].blocks.push({ el: block, top, height });
            });
        });

        // For each day, compute layout so only locally overlapping blocks share columns
        Object.keys(dayBuckets).forEach(dayKey => {
            const bucket = dayBuckets[dayKey];
            const dayTimeline = bucket.timeline;
            const blocks = bucket.blocks;
            // sort by top
            blocks.sort((a,b) => a.top - b.top);

            const gap = 4; // px gutter between columns
            const timelineWidth = Math.max(0, dayTimeline.clientWidth || dayTimeline.offsetWidth || 300);

            // Build overlap graph (small N so O(N^2) check is fine)
            const n = blocks.length;
            const adj = new Array(n).fill(0).map(() => []);
            for (let i = 0; i < n; i++) {
                const aTop = blocks[i].top; const aBottom = blocks[i].top + blocks[i].height;
                for (let j = i+1; j < n; j++) {
                    const bTop = blocks[j].top; const bBottom = blocks[j].top + blocks[j].height;
                    if (!(aBottom <= bTop || aTop >= bBottom)) {
                        adj[i].push(j); adj[j].push(i);
                    }
                }
            }

            // Find connected components in overlap graph
            const visited = new Array(n).fill(false);
            for (let i = 0; i < n; i++) {
                if (visited[i]) continue;
                // BFS/DFS to collect component
                const stack = [i];
                const compIdxs = [];
                visited[i] = true;
                while (stack.length) {
                    const u = stack.pop();
                    compIdxs.push(u);
                    adj[u].forEach(v => { if (!visited[v]) { visited[v] = true; stack.push(v); } });
                }

                // Extract component blocks and sort by top
                const comp = compIdxs.map(idx => blocks[idx]);
                comp.sort((a,b) => a.top - b.top);

                // Interval partitioning across the component
                const cols = [];
                comp.forEach(item => {
                    const bottom = item.top + item.height;
                    let placed = false;
                    for (let c = 0; c < cols.length; c++) {
                        if (item.top >= cols[c].lastBottom) {
                            cols[c].items.push(item);
                            cols[c].lastBottom = bottom;
                            item.colIndex = c;
                            placed = true;
                            break;
                        }
                    }
                    if (!placed) {
                        cols.push({ lastBottom: bottom, items: [item] });
                        item.colIndex = cols.length - 1;
                    }
                });

                const colCount = Math.max(1, cols.length);
                const columnWidth = (colCount === 1)
                    ? timelineWidth
                    : Math.max(6, Math.floor((timelineWidth - ((colCount - 1) * gap)) / colCount));

                // Compute an outer left offset so the columns are visually balanced inside the timeline
                const totalColsWidth = (columnWidth * colCount) + ((colCount - 1) * gap);
                const leftOffset = Math.max(0, Math.round((timelineWidth - totalColsWidth) / 2));

                comp.forEach(item => {
                    const col = item.colIndex || 0;
                    const leftPx = leftOffset + Math.round(col * (columnWidth + gap));
                    const widthPx = (colCount === 1) ? timelineWidth : columnWidth;
                    item.el.style.left = `${leftPx}px`;
                    item.el.style.width = `${widthPx}px`;
                    item.el.style.boxSizing = 'border-box';
                    // ensure appended
                    dayTimeline.appendChild(item.el);
                });
            }
        });
    }
    // Apply sidebar height adjustment immediately on script load
    (function() {
        try {
            let savedHeightAdjust = 420;
            try {
                if (typeof window !== 'undefined' && Number.isFinite(window.__mgcSidebarHeightAdjust)) {
                    savedHeightAdjust = window.__mgcSidebarHeightAdjust;
                } else {
                    const raw = localStorage.getItem('sidebarHeightAdjust');
                    if (raw !== null) savedHeightAdjust = parseInt(raw, 10);
                }
            } catch (_) {}
            if (!Number.isFinite(savedHeightAdjust)) savedHeightAdjust = 420;

            const adjustedValue = 624 - savedHeightAdjust;
            document.documentElement.style.setProperty('--enrolled-height-adjust', adjustedValue + 'px');

            if (typeof window !== 'undefined' && typeof window.storageGet === 'function') {
                window.storageGet('sidebarHeightAdjust', savedHeightAdjust).then((syncHeight) => {
                    const normalized = parseInt(syncHeight, 10);
                    if (!Number.isFinite(normalized)) return;
                    try { window.__mgcSidebarHeightAdjust = normalized; } catch (_) {}
                    const syncAdjustedValue = 624 - normalized;
                    document.documentElement.style.setProperty('--enrolled-height-adjust', syncAdjustedValue + 'px');
                }).catch(() => {});
            }
        } catch (_) {}
    })();

    let listenersAdded = false;
    let currentToggleButton = null;
    let sidebarHotspot = null;
    let sidebar = null;
    let sidebarForceVisible = false;

    function isDarkModeEnabled() {
        try {
            return localStorage.getItem('modernGoogleClassroomDarkMode') === 'true';
        } catch (_) {
            return false;
        }
    }

    function saveDarkModePreference(enabled) {
        try { localStorage.setItem('modernGoogleClassroomDarkMode', enabled.toString()); } catch (_) {}
        try {
            if (typeof window !== 'undefined' && typeof window.storageSetBool === 'function') {
                window.storageSetBool('modernGoogleClassroomDarkMode', !!enabled);
            }
        } catch (_) {}
    }

    function toggleDarkMode() {
        const body = document.body;
        const isDark = body.classList.contains('dark-mode');
        
        if (isDark) {
            body.classList.remove('dark-mode');
            saveDarkModePreference(false);
            console.log('Dark mode disabled');
        } else {
            body.classList.add('dark-mode');
            saveDarkModePreference(true);
            console.log('Dark mode enabled');
        }
        try { applyWheelTheme(); } catch (_) {}
        try { if (hintUi && hintUi.wrapper) applyThemeToWrapper(hintUi.wrapper); } catch (_) {}
    }

    function createSidebarHotspot() {
        if (sidebarHotspot) {
            sidebarHotspot.remove();
        }

        sidebarHotspot = document.createElement('div');
        sidebarHotspot.className = 'sidebar-hotspot';
        sidebarHotspot.style.cssText = `
            position: fixed;
            left: 0;
            top: 0;
            width: 20px;
            height: 100vh;
            z-index: 9999;
            cursor: pointer;
            display: none;
        `;

        const indicator = document.createElement('div');
        indicator.className = 'sidebar-hotspot-indicator';
        sidebarHotspot.appendChild(indicator);

        sidebarHotspot.addEventListener('mouseenter', function() {
            this.classList.remove('sidebar-hide-indicator');
            showSidebar();
        });

        sidebarHotspot.addEventListener('mouseleave', function() {
            this.classList.add('sidebar-hide-indicator');
        });

        document.body.appendChild(sidebarHotspot);
        console.log('Sidebar hotspot created');
    }

    function showSidebar() {
        if (sidebar) {
            sidebar.classList.add('sidebar-visible');
            if (sidebarHotspot) {
                sidebarHotspot.classList.add('sidebar-hide-indicator');
            }
        }
        try { updateVisibleIconEditHint(); } catch (_) {}
    }

    function hideSidebar() {
        if (sidebarForceVisible) return;

        if (sidebar) {
            sidebar.classList.remove('sidebar-visible');
            if (sidebarHotspot) {
                sidebarHotspot.classList.remove('sidebar-hide-indicator');
            }
        }
        try { updateVisibleIconEditHint(); } catch (_) {}
    }

    function handleSidebarVisibility() {
        if (!sidebar) {
            try { findSidebar(); } catch (_) {}
        }
        const isSmallScreen = window.innerWidth <= 1042;
        
        if (isSmallScreen) {
            if (sidebarHotspot) {
                sidebarHotspot.style.display = 'block';
            }
            if (sidebar) {
                sidebar.classList.remove('sidebar-visible');
            }
        } else {
            if (sidebarHotspot) {
                sidebarHotspot.style.display = 'none';
            }
            if (sidebar) {
                sidebar.classList.remove('sidebar-visible');
            }
        }
        try { updateVisibleIconEditHint(); } catch (_) {}
    }

    function findSidebar() {
        sidebar = document.querySelector('.STek2d');
        if (sidebar) {
            console.log('Sidebar found:', sidebar);
            
            sidebar.removeEventListener('mouseenter', handleSidebarMouseEnter);
            sidebar.removeEventListener('mouseleave', handleSidebarMouseLeave);
            
            sidebar.addEventListener('mouseenter', handleSidebarMouseEnter);
            sidebar.addEventListener('mouseleave', handleSidebarMouseLeave);
            
            console.log('Sidebar hover events attached');
        } else {
            console.log('Sidebar not found');
        }
    }
    
    function handleSidebarMouseEnter() {
        console.log('Mouse entered sidebar');
    }
    
    function handleSidebarMouseLeave() {
        console.log('Mouse left sidebar, hiding...');
        hideSidebar();
    }

    function addDarkModeToggleListener() {
        const toggleButton = document.querySelector('.k43Owe.mmOZjd');
        
        if (!toggleButton || (listenersAdded && currentToggleButton === toggleButton)) {
            return;
        }

        if (currentToggleButton && currentToggleButton !== toggleButton) {
            currentToggleButton.removeEventListener('click', toggleDarkMode);
        }
        
        toggleButton.removeEventListener('click', toggleDarkMode);
        
        toggleButton.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            toggleDarkMode();
        });
        
        toggleButton.style.pointerEvents = 'auto';
        toggleButton.style.cursor = 'pointer';
        
        currentToggleButton = toggleButton;
        listenersAdded = true;
        
        console.log('Dark mode toggle listener added to:', toggleButton);
    }

    function addKeyboardShortcut() {
        document.removeEventListener('keydown', handleKeyboardShortcut);
        
        document.addEventListener('keydown', handleKeyboardShortcut);
    }

    function handleKeyboardShortcut(e) {
        if (e.ctrlKey && e.shiftKey && e.key === 'D') {
            e.preventDefault();
            toggleDarkMode();
            console.log('Dark mode toggled via keyboard shortcut');
        }
    }

    function initializeDarkMode() {
        if (isDarkModeEnabled()) {
            document.body.classList.add('dark-mode');
            console.log('Dark mode initialized from saved preference');
        } else {
            console.log('Light mode initialized');
        }

        try {
            if (typeof window !== 'undefined' && typeof window.storageGetBool === 'function') {
                window.storageGetBool('modernGoogleClassroomDarkMode', isDarkModeEnabled()).then((isDark) => {
                    if (isDark) {
                        document.body.classList.add('dark-mode');
                    } else {
                        document.body.classList.remove('dark-mode');
                    }
                    try { applyWheelTheme(); } catch (_) {}
                    try { if (hintUi && hintUi.wrapper) applyThemeToWrapper(hintUi.wrapper); } catch (_) {}
                });
            }
        } catch (_) {}
    }

    function initializeSidebar() {
        createSidebarHotspot();
        findSidebar();
        handleSidebarVisibility();
        
        window.addEventListener('resize', handleSidebarVisibility);
    }

    let colorPickerInput = null;
    let elementAwaitingColor = null;
    let wheelUi = null; 
    let persistTimer = null;
    let hintUi = null; 
    let hintShownOnce = false;

    const COLOUR_PALETTE_KEY = 'modernClassroom_colourPalette';
    const COLOUR_PALETTE_LIMIT = 10;

    function normalizePaletteColour(value) {
        const raw = String(value || '').trim();
        const hex = raw.startsWith('#') ? raw : `#${raw}`;
        if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return null;
        if (hex.length === 4) {
            return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`.toLowerCase();
        }
        return hex.toLowerCase();
    }

    function readColourPalette() {
        try {
            const stored = JSON.parse(localStorage.getItem(COLOUR_PALETTE_KEY) || '[]');
            return Array.isArray(stored) ? stored.map(normalizePaletteColour).filter(Boolean).slice(0, COLOUR_PALETTE_LIMIT) : [];
        } catch (_) {
            return [];
        }
    }

    function writeColourPalette(colours) {
        try { localStorage.setItem(COLOUR_PALETTE_KEY, JSON.stringify(colours.slice(0, COLOUR_PALETTE_LIMIT))); } catch (_) {}
    }

    function createColourPaletteControls({ container, addContainer = container, getColor, onSelect }) {
        const paletteShell = document.createElement('div');
        paletteShell.className = 'mc-colour-palette-shell mc-picker-palette-shell';
        const palette = document.createElement('div');
        palette.className = 'mc-colour-palette mc-picker-palette';
        const leftFade = document.createElement('span');
        leftFade.className = 'mc-colour-palette-fade mc-picker-palette-fade mc-colour-palette-fade-left';
        const rightFade = document.createElement('span');
        rightFade.className = 'mc-colour-palette-fade mc-picker-palette-fade mc-colour-palette-fade-right';
        paletteShell.appendChild(palette);
        paletteShell.appendChild(leftFade);
        paletteShell.appendChild(rightFade);

        const render = () => {
            palette.innerHTML = '';
            const colours = readColourPalette();
            colours.forEach((colour) => {
                const swatch = document.createElement('button');
                swatch.type = 'button';
                swatch.className = 'mc-colour-palette-swatch mc-picker-swatch';
                swatch.style.backgroundColor = colour;
                swatch.title = `Use ${colour}`;
                swatch.setAttribute('aria-label', `Use colour ${colour}`);
                swatch.addEventListener('click', () => onSelect(colour));
                palette.appendChild(swatch);
            });
        };

        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'mc-colour-palette-add mc-picker-add';
        add.textContent = '+';
        add.title = 'Save current colour';
        add.setAttribute('aria-label', 'Save current colour to palette');
        add.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const colour = normalizePaletteColour(getColor());
            if (!colour) return;
            const colours = readColourPalette().filter((item) => item !== colour);
            writeColourPalette([colour, ...colours]);
            render();
        });

        container.appendChild(paletteShell);
        addContainer.appendChild(add);
        render();
        return { palette, add, render };
    }

    if (typeof window !== 'undefined') {
        window.MCColourPickerPalette = { create: createColourPaletteControls };
    }

    function createColourPicker({ container, initialColor = '#9aa0a6', title = '', onClose = null, onColorChange = null, defaultColor = null, onDefault = null }) {
        const normalizeColour = (value) => {
            let colour = String(value || '').trim();
            if (!colour.startsWith('#')) colour = `#${colour}`;
            if (/^#([0-9a-f]{3})$/i.test(colour)) {
                colour = `#${colour[1]}${colour[1]}${colour[2]}${colour[2]}${colour[3]}${colour[3]}`;
            }
            return /^#[0-9a-f]{6}$/i.test(colour) ? colour.toLowerCase() : null;
        };

        const hsvToRgb = (h, s, v) => {
            const c = v * s;
            const hh = (h / 60) % 6;
            const x = c * (1 - Math.abs((hh % 2) - 1));
            let r = 0;
            let g = 0;
            let b = 0;
            if (hh < 1) { r = c; g = x; }
            else if (hh < 2) { r = x; g = c; }
            else if (hh < 3) { g = c; b = x; }
            else if (hh < 4) { g = x; b = c; }
            else if (hh < 5) { r = x; b = c; }
            else { r = c; b = x; }
            const m = v - c;
            return {
                r: Math.round((r + m) * 255),
                g: Math.round((g + m) * 255),
                b: Math.round((b + m) * 255)
            };
        };

        const rgbToHex = (r, g, b) => {
            const toHex = (value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0');
            return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
        };

        const hexToHsv = (colour) => {
            const safe = normalizeColour(colour) || '#9aa0a6';
            const r = parseInt(safe.slice(1, 3), 16) / 255;
            const g = parseInt(safe.slice(3, 5), 16) / 255;
            const b = parseInt(safe.slice(5, 7), 16) / 255;
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const delta = max - min;
            let h = 0;
            if (delta) {
                if (max === r) h = 60 * (((g - b) / delta) % 6);
                else if (max === g) h = 60 * ((b - r) / delta + 2);
                else h = 60 * ((r - g) / delta + 4);
            }
            if (h < 0) h += 360;
            return { h, s: max ? delta / max : 0, v: max };
        };

        const startingColor = normalizeColour(initialColor) || '#9aa0a6';
        const root = document.createElement('div');
        root.className = 'mc-picker-surface mc-colour-picker';

        if (title) {
            const header = document.createElement('div');
            header.className = 'mc-picker-header';
            const heading = document.createElement('div');
            heading.className = 'mc-picker-title';
            heading.textContent = title;
            header.appendChild(heading);
            const headerActions = document.createElement('div');
            headerActions.className = 'mc-picker-header-actions';
            if (defaultColor && typeof onDefault === 'function') {
                const defaultButton = document.createElement('button');
                defaultButton.type = 'button';
                defaultButton.className = 'mc-picker-default';
                defaultButton.textContent = 'Revert';
                defaultButton.title = 'Use the default colour';
                defaultButton.setAttribute('aria-label', 'Use the default colour');
                defaultButton.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onDefault();
                });
                headerActions.appendChild(defaultButton);
            }
            if (onClose) {
                const close = document.createElement('button');
                close.type = 'button';
                close.className = 'close mc-picker-close';
                close.textContent = '×';
                close.setAttribute('aria-label', 'Close colour picker');
                close.addEventListener('click', onClose);
                headerActions.appendChild(close);
            }
            header.appendChild(headerActions);
            root.appendChild(header);
        }

        const sv = document.createElement('div');
        sv.className = 'mc-picker-sv';
        const canvas = document.createElement('canvas');
        canvas.className = 'mc-picker-sv-canvas';
        canvas.width = 280;
        canvas.height = 130;
        const marker = document.createElement('div');
        marker.className = 'mc-picker-marker';
        sv.append(canvas, marker);

        const hueRow = document.createElement('div');
        hueRow.className = 'mc-picker-row mc-picker-hue-row';
        const preview = document.createElement('div');
        preview.className = 'mc-picker-preview';
        const hue = document.createElement('input');
        hue.type = 'range';
        hue.min = '0';
        hue.max = '360';
        hue.className = 'mc-picker-hue';
        hueRow.append(preview, hue);

        const inputRow = document.createElement('div');
        inputRow.className = 'mc-picker-row mc-picker-input-row';
        const hexRow = document.createElement('div');
        hexRow.className = 'mc-picker-hex-row';
        const hex = document.createElement('input');
        hex.type = 'text';
        hex.className = 'mc-picker-hex';
        hex.value = startingColor;
        hex.placeholder = '#rrggbb';
        hex.setAttribute('aria-label', 'Hex colour');
        hexRow.appendChild(hex);
        inputRow.appendChild(hexRow);

        const palette = createColourPaletteControls({
            container: inputRow,
            addContainer: hexRow,
            getColor: () => hex.value,
            onSelect: (colour) => setColour(colour, 'palette')
        });

        root.append(sv, hueRow, inputRow);
        if (container) container.appendChild(root);

        let hsv = hexToHsv(startingColor);
        let isDragging = false;

        const drawSv = () => {
            const context = canvas.getContext('2d');
            if (!context) return;
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.fillStyle = `hsl(${hsv.h}, 100%, 50%)`;
            context.fillRect(0, 0, canvas.width, canvas.height);
            const white = context.createLinearGradient(0, 0, canvas.width, 0);
            white.addColorStop(0, '#fff');
            white.addColorStop(1, 'rgba(255,255,255,0)');
            context.fillStyle = white;
            context.fillRect(0, 0, canvas.width, canvas.height);
            const black = context.createLinearGradient(0, 0, 0, canvas.height);
            black.addColorStop(0, 'rgba(0,0,0,0)');
            black.addColorStop(1, '#000');
            context.fillStyle = black;
            context.fillRect(0, 0, canvas.width, canvas.height);
        };

        const updateMarker = () => {
            const width = canvas.offsetWidth || canvas.width;
            const height = canvas.offsetHeight || canvas.height;
            marker.style.left = `${hsv.s * width}px`;
            marker.style.top = `${(1 - hsv.v) * height}px`;
        };

        const emitColour = (source) => {
            const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
            const colour = rgbToHex(rgb.r, rgb.g, rgb.b);
            if (document.activeElement !== hex) hex.value = colour;
            preview.style.backgroundColor = colour;
            drawSv();
            updateMarker();
            if (typeof onColorChange === 'function') onColorChange(colour, source);
        };

        function setColour(value, source = 'input') {
            const colour = normalizeColour(value);
            if (!colour) return false;
            hsv = hexToHsv(colour);
            hex.value = colour;
            hue.value = String(Math.round(hsv.h));
            emitColour(source);
            return true;
        }

        const handleSvInput = (clientX, clientY) => {
            const rect = canvas.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            hsv.s = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            hsv.v = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
            emitColour('sv');
        };

        hue.addEventListener('input', () => {
            hsv.h = Number(hue.value);
            emitColour('hue');
        });
        hex.addEventListener('change', () => setColour(hex.value, 'hex'));
        sv.addEventListener('mousedown', (event) => {
            isDragging = true;
            handleSvInput(event.clientX, event.clientY);
        });
        const onMouseMove = (event) => {
            if (isDragging) handleSvInput(event.clientX, event.clientY);
        };
        const onMouseUp = () => { isDragging = false; };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);

        drawSv();
        updateMarker();
        preview.style.backgroundColor = startingColor;
        return { root, sv, canvas, marker, hueRow, hue, preview, inputRow, hexRow, hex, palette, setColor: setColour };
    }

    if (typeof window !== 'undefined') {
        window.MCColourPicker = { create: createColourPicker };
    }

    const availableIcons = [
        { title: 'Maths & Science', icons: [
            'Square Root Icon.svg',
            'Function Icon.svg',
            'Sigma Summation Icon.svg',
            'Wave Sine Icon.svg',
            'Simple Calculator Icon.svg',
            'Statistics.svg',
            'Calculator Icon.svg',
            'Chart Pie Icon.svg',
            'Flask Icon.svg',
            'Chemistry Tubes.svg',
            'Cell Icon.svg',
            'Bacterium Icon.svg',
            'Microscope Bacteria Icon.svg',
            'DNA Icon.svg',
            'Effect Icon Newtons Cradle.svg',
            'React Icon.svg',
            'Magnet Icon.svg',
            'light Bulb.svg',

        ]},
        { title: 'Writing/Language', icons: [
            'Drawer Alt Icon.svg',
            'Pen Nib Icon (1).svg',
            'Edit Pencil Icon.svg',
            'Edit.svg',
            'Scroll Document Story Icon.svg',
            'Document Icon.svg',
            'Book Alt Icon.svg',
            'notes.svg',
            'Search.svg',
            'Comment.svg',
            'Assignments.svg',
            'fi-sr-book-bookmark.svg',
            'fi-sr-book.svg',
            'fi-sr-journal-alt.svg',

        ]},
        
        { title: 'Food', icons: [
            'fi-sr-apple-pie.svg',
            'fi-sr-baguette.svg',
            'fi-sr-bottle-baby.svg',
            'fi-sr-bowl-chopsticks-noodles.svg',
            'fi-sr-carrot.svg',
            'fi-sr-cheese.svg',
            'fi-sr-cherry.svg',
            'fi-sr-lemon.svg',
            'fi-sr-pineapple-alt.svg',
            'fi-sr-croissant.svg',
            'fi-sr-egg.svg',
            'fi-sr-hamburger.svg',
            'Turkey.svg',
            'fi-sr-kitchen-set.svg',
        ]},

        { title: 'Arts', icons: [
            'Palette Icon.svg',
            'Paint Icon.svg',
            'Paint Roller.svg',
            'fi-sr-artist.svg',
            'fi-sr-cello.svg',
            'fi-sr-guitar.svg',
            'Music Alt Icon.svg',
            'Picture Icon Font.svg',
            'fi-sr-clapper-open.svg',
        ]},

        { title: 'Buildings/Homes', icons: [
            'Home Icon.svg',
            'Building.svg',
            'fi-sr-car-building.svg',
            'Bank Icon.svg',
            'Shop Icon.svg',
            'fi-sr-castle.svg',
        ]},

        { title: 'Technology', icons: [
            'Computer Icon.svg',
            'Floppy Disk.svg',
            'Controller.svg',
            'Camera.svg',
            'Film.svg',
            'Mic.svg',
        ]},
        { title: 'Nature', icons: [
            'Fire.svg',
            'Apple.svg',
            'Hand Plant.svg',
            'World Icon.svg',
            'Paw Icon.svg',
            'fi-sr-bay-leaf.svg',
            'fi-sr-bio-leaves.svg',
            'fi-sr-trees.svg',
            'fi-sr-tree-deciduous.svg',
            'fi-sr-rocks.svg',
            'fi-sr-trillium.svg',
            'fi-sr-rose.svg',
            'fi-sr-flower-tulip.svg',
            'fi-sr-flower-daffodil.svg',
            'fi-sr-flower-butterfly.svg',
            'fi-sr-cat.svg',
            'fi-sr-cow-alt.svg',
            'fi-sr-dog.svg',
            'fi-sr-dolphin.svg',
            'fi-sr-dove.svg',
            'fi-sr-fish.svg',
            'fi-sr-frog.svg',
        ]},

        { title: 'Tools', icons: [
            'Steering.svg',
            'Gym.svg',
            'Hammer.svg',
            'Tools.svg',
            'fi-sr-blush.svg',
            'fi-sr-broom.svg',
            'fi-sr-driller.svg',
            'fi-sr-hair-clipper.svg',
            'fi-sr-hairbrush.svg',
            'fi-sr-hairdryer.svg',
            'fi-sr-makeup-brush.svg',

        ]},


        { title: 'Shapes', icons: [
            'circledot.svg',
            'Circle Icon.svg',
            'Triangle.svg',
            'Hexagon.svg',
            'Diamond.svg',
            'Square.svg',
            'Unset.svg',
            'Star Icon.svg',
            'Apps.svg',
            'Heart.svg',
            'Bookmark Icon.svg',
            'fi-sr-asterik.svg',
            'fi-sr-bolt.svg',
            'fi-sr-cloud.svg',
            'fi-sr-balloons.svg',
        ]},

        { title: 'Emojis', icons: [
            'hearts.svg',
            'laugh.svg',
            'depressed.svg',
            'angry.svg',
            'meh.svg',
            'upsidesmile.svg',
            'sadsweat.svg',
            'superstar.svg',
            'laughcry.svg',
            'cry.svg',
            'sob.svg',
            'ghostie.svg',
            'vomit.svg',
            'cool.svg',
            'angersteam.svg',
            'tired.svg',
            'curious.svg',
            'shock.svg',
            'halo.svg',
            'tongue.svg',
            'literallyme.svg',
            'perish.svg',
            'fi-sr-face-explode.svg',
            'fi-sr-face-head-bandage.svg',
            'fi-sr-face-sleeping.svg',
            'fi-sr-face-tongue-money.svg',
        ]},

        { title: 'Miscellaneous', icons: [
            'Handshake Icon.svg',
            'Hand Holding Heart Icon.svg',
            'Praying Hands Icon.svg',
            'Sack Dollar Icon.svg',
            'Coins Icon.svg',
            'Trash Icon.svg',
            'People.svg',
            'Graduation.svg',
            'Location.svg',
            'Bricks.svg',
            'fi-sr-archery.svg',
            'fi-sr-badminton.svg',
            'fi-sr-court-sport.svg',
            'fi-sr-baby-carriage.svg',
            'fi-sr-balance-scale-right.svg',
            'fi-sr-browser.svg',
            'fi-sr-calendar-lines.svg',
            'fi-sr-envelope.svg',
            'fi-sr-sofa.svg',
            'fi-sr-folder.svg',
            'fi-sr-judge.svg',
            'fi-sr-traffic-cone.svg',
        ]},

    ];

    const STORAGE_KEY_PREFIX = 'dnaIconColors:';
    function pageStorageKey() {
        return STORAGE_KEY_PREFIX + location.origin;
    }
    function storageGet(key) {
        if (typeof window.storageGet === 'function') {
            return window.storageGet(key, null);
        }
        return new Promise((resolve) => {
            try {
                const raw = localStorage.getItem(key);
                if (raw === null) {
                    resolve(null);
                    return;
                }
                try {
                    resolve(JSON.parse(raw));
                } catch {
                    resolve(raw);
                }
            } catch (_) {
                resolve(null);
            }
        });
    }
    function storageSet(key, value) {
        if (typeof window.storageSet === 'function') {
            return window.storageSet(key, value);
        }
        return new Promise((resolve) => {
            try {
                const str = typeof value === 'string' ? value : JSON.stringify(value);
                localStorage.setItem(key, str);
            } catch (e) {
                console.warn('localStorage.setItem failed:', e);
            }
            resolve();
        });
    }
    function storageGetBool(key) {
        return storageGet(key).then((v) => Boolean(v));
    }
    function storageSetBool(key, value) {
        return storageSet(key, !!value);
    }
    function cssEscape(s) { try { return CSS.escape(s); } catch (_) { return s.replace(/[^a-zA-Z0-9_-]/g, '\\$&'); } }
    function textHash(str) {
        let h = 0;
        for (let i = 0; i < str.length; i++) {
            h = ((h << 5) - h) + str.charCodeAt(i);
            h |= 0;
        }
        return (h >>> 0).toString(36);
    }
    function normalizeWhitespace(str) {
        return (str || '').replace(/\s+/g, ' ').trim();
    }
    function computeStableKey(el) {
        const anchor = el.closest('a[href]') || el.querySelector && el.querySelector('a[href]');
        if (anchor && anchor.href) {
            const courseMatch = anchor.href.match(/\/c\/([^/?#]+)/);
            if (courseMatch) return 'course:' + courseMatch[1];
            return 'href:' + anchor.href;
        }
        const label = normalizeWhitespace(el.textContent || (el.getAttribute && el.getAttribute('aria-label')) || '');
        if (label) {
            return 'text:' + textHash(label) + ':' + label.slice(0, 64);
        }
        const path = [];
        let node = el;
        while (node && node.nodeType === 1 && path.length < 6) {
            let part = node.tagName.toLowerCase();
            const id = node.id ? ('#' + node.id) : '';
            const cls = (node.classList && node.classList.length) ? ('.' + Array.from(node.classList).slice(0,2).join('.')) : '';
            part += id + cls;
            path.unshift(part);
            node = node.parentElement;
        }
        return 'path:' + textHash(path.join('>'));
    }

    function computeClassLabelKey(el) {
        const anchor = el.closest('a[href]') || el.querySelector && el.querySelector('a[href]');
        if (!anchor) return null;
        const label = normalizeWhitespace(anchor.getAttribute('aria-label') || anchor.textContent || '');
        return label ? 'class-label:' + textHash(label.toLowerCase()) : null;
    }

    function getStoredIconValue(map, el) {
        if (!map || !el) return null;
        const stableKey = computeStableKey(el);
        if (map[stableKey]) return map[stableKey];

        const labelKey = computeClassLabelKey(el);
        if (labelKey && map[labelKey]) return map[labelKey];

        const anchor = el.closest('a[href]') || el.querySelector && el.querySelector('a[href]');
        const href = anchor && anchor.href;
        if (href) {
            const matchingLegacyKey = Object.keys(map).find((key) => {
                if (!key.startsWith('href:')) return false;
                const legacyHref = key.slice(5);
                const legacyCourse = legacyHref.match(/\/c\/([^/?#]+)/);
                const currentCourse = href.match(/\/c\/([^/?#]+)/);
                return legacyCourse && currentCourse && legacyCourse[1] === currentCourse[1];
            });
            if (matchingLegacyKey && map[matchingLegacyKey]) return map[matchingLegacyKey];
        }
        return null;
    }
    async function persistColorForElement(el, hex) {
        el.dataset.dnaUneditedIcon = 'false';
        updateVisibleIconEditHint();
        const key = pageStorageKey();
        const map = (await storageGet(key)) || {};
        const stableKey = computeStableKey(el);
        const labelKey = computeClassLabelKey(el);
        map[stableKey] = hex;
        if (labelKey) map[labelKey] = hex;
        await storageSet(key, map);
        try {
            const stored = (await storageGet(key)) || {};
            if (stored[stableKey] !== hex) {
                await storageSet(key, map);
            }
        } catch (_) {}
    }
    // Strip the extension base URL so we store a portable relative path
    // e.g. "chrome-extension://abc123/Icons/math.svg" -> "Icons/math.svg"
    function toRelativeIconPath(url) {
        if (!url || url.startsWith('data:')) return url;
        try {
            const extBase = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
                ? chrome.runtime.getURL('/') : null;
            if (extBase && url.startsWith(extBase)) {
                return url.slice(extBase.length);
            }
            // Also handle URLs from a previous extension ID
            const match = url.match(/^chrome-extension:\/\/[^/]+\/(.+)$/);
            if (match) return match[1];
        } catch (_) {}
        return url;
    }

    // Resolve a stored icon path to a full URL usable in the current extension context
    function resolveIconUrl(stored) {
        if (!stored) return stored;
        if (stored.startsWith('data:')) return stored;
        // Already a full chrome-extension URL for this extension – use as-is
        try {
            const extBase = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
                ? chrome.runtime.getURL('/') : null;
            if (extBase && stored.startsWith(extBase)) return stored;
        } catch (_) {}
        // If it looks like a relative path (e.g. "Icons/math.svg"), resolve it
        if (!stored.startsWith('chrome-extension://') && !stored.startsWith('http')) {
            try {
                if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
                    return chrome.runtime.getURL(stored);
                }
            } catch (_) {}
        }
        // Old full URL from a different extension ID – extract relative path and resolve
        const match = stored.match(/^chrome-extension:\/\/[^/]+\/(.+)$/);
        if (match) {
            try {
                if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
                    return chrome.runtime.getURL(match[1]);
                }
            } catch (_) {}
        }
        return stored;
    }

    async function persistIconForElement(el, iconUrl) {
        el.dataset.dnaUneditedIcon = 'false';
        updateVisibleIconEditHint();
        const key = pageStorageKey() + ':icons';
        const map = (await storageGet(key)) || {};
        const stableKey = computeStableKey(el);
        const labelKey = computeClassLabelKey(el);
        const portable = toRelativeIconPath(iconUrl);
        map[stableKey] = portable;
        if (labelKey) map[labelKey] = portable;
        await storageSet(key, map);
        try {
            const stored = (await storageGet(key)) || {};
            if (stored[stableKey] !== portable) {
                await storageSet(key, map);
            }
        } catch (_) {}
    }

    function setIconEditHintState(el, iconMap, colorMap) {
        if (!el || !el.dataset) return;
        const stableKey = computeStableKey(el);
        const hasCustomisation = Boolean(
            (iconMap && iconMap[stableKey]) ||
            (colorMap && colorMap[stableKey])
        );
        el.dataset.dnaUneditedIcon = hasCustomisation ? 'false' : 'true';
    }

    let iconEditHintElement = null;
    let iconEditHintResizeObserver = null;
    let iconEditHintObservedElements = [];
    let iconEditHintDismissed = false;

    storageGetBool(pageStorageKey() + ':editHintDismissed').then((dismissed) => {
        iconEditHintDismissed = dismissed;
        updateVisibleIconEditHint();
    });

    function observeIconEditHintLayout(...elements) {
        if (typeof ResizeObserver === 'undefined') return;
        const nextElements = [...new Set(elements)].filter(Boolean);
        const isAlreadyObserving = nextElements.length === iconEditHintObservedElements.length &&
            nextElements.every((el, index) => el === iconEditHintObservedElements[index]);
        if (isAlreadyObserving) return;
        if (!iconEditHintResizeObserver) {
            iconEditHintResizeObserver = new ResizeObserver(() => updateVisibleIconEditHint());
        }
        iconEditHintResizeObserver.disconnect();
        nextElements.forEach(el => iconEditHintResizeObserver.observe(el));
        iconEditHintObservedElements = nextElements;
    }

    function updateVisibleIconEditHint() {
        if (iconEditHintDismissed) {
            if (iconEditHintElement) iconEditHintElement.hidden = true;
            return;
        }

        const icons = Array.from(document.querySelectorAll('.kWQ5wd[data-dna-unedited-icon="true"]'))
            .filter(el => el.closest('a.uTwgne'));

        document.querySelectorAll('.kWQ5wd[data-dna-show-edit-hint="true"]')
            .forEach(el => { el.dataset.dnaShowEditHint = 'false'; });
        document.querySelectorAll('a.uTwgne[data-dna-show-edit-hint="true"]')
            .forEach(el => { el.dataset.dnaShowEditHint = 'false'; });

        const target = icons[0];
        const sidebarElement = target && target.closest('.STek2d');
        const iconRect = target && target.getBoundingClientRect();
        const scrollContainer = target && target.closest('div[role="group"]');
        const scrollRect = scrollContainer && scrollContainer.getBoundingClientRect();
        const sidebarRect = sidebarElement && sidebarElement.getBoundingClientRect();
        const sidebarIsHidden = sidebarElement && window.innerWidth <= 1042 && !sidebarElement.classList.contains('sidebar-visible');
        const iconIsVisible = iconRect && iconRect.width > 0 && iconRect.height > 0 &&
            iconRect.top >= 0 && iconRect.bottom <= window.innerHeight &&
            (!sidebarRect || (iconRect.top >= sidebarRect.top && iconRect.bottom <= sidebarRect.bottom)) &&
            (!scrollRect || (iconRect.top >= scrollRect.top && iconRect.bottom <= scrollRect.bottom));

        if (!target || sidebarIsHidden || !iconIsVisible) {
            if (iconEditHintElement) iconEditHintElement.hidden = true;
            return;
        }

        target.dataset.dnaShowEditHint = 'true';
        const targetLink = target.closest('a.uTwgne');
        if (!targetLink) return;
        targetLink.dataset.dnaShowEditHint = 'true';
        const hintHost = document.body;
        if (!iconEditHintElement) {
            iconEditHintElement = document.createElement('div');
            iconEditHintElement.className = 'mgc-icon-edit-hint';
            iconEditHintElement.setAttribute('role', 'tooltip');

            const hintText = document.createElement('span');
            hintText.textContent = 'Click the icon to customise';
            iconEditHintElement.appendChild(hintText);

            const dismissButton = document.createElement('button');
            dismissButton.className = 'mgc-icon-edit-hint-dismiss';
            dismissButton.type = 'button';
            dismissButton.setAttribute('aria-label', 'Dismiss tip');
            dismissButton.title = 'Dismiss tip';
            dismissButton.textContent = '×';
            dismissButton.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                iconEditHintDismissed = true;
                iconEditHintElement.hidden = true;
                storageSetBool(pageStorageKey() + ':editHintDismissed', true);
            });
            iconEditHintElement.appendChild(dismissButton);
        }

        if (iconEditHintElement.parentElement !== hintHost) {
            hintHost.appendChild(iconEditHintElement);
        }
        const linkRect = targetLink.getBoundingClientRect();
        iconEditHintElement.style.left = `${Math.round(linkRect.right + 8)}px`;
        iconEditHintElement.style.top = `${Math.round(linkRect.top + (linkRect.height / 2))}px`;
        iconEditHintElement.hidden = false;
        observeIconEditHintLayout(targetLink, sidebarElement, scrollContainer);
    }

    window.addEventListener('resize', updateVisibleIconEditHint);
    document.addEventListener('scroll', updateVisibleIconEditHint, true);
    if (document.body) {
        new MutationObserver(updateVisibleIconEditHint).observe(document.body, {
            attributes: true,
            attributeFilter: ['class']
        });
    }

    async function restoreSavedColors(root = document) {
        const roots = Array.isArray(root) ? root : [root];
        const key = pageStorageKey();
        const map = (await storageGet(key)) || {};
        const iconKey = key + ':icons';
        const iconMap = (await storageGet(iconKey)) || {};

        try {
            const nodes = [];
            roots.forEach(searchRoot => nodes.push(...getIconElements(searchRoot)));
            nodes.forEach(el => {
                const k = computeStableKey(el);
                const hex = map[k];
                if (hex) {
                    el.style.setProperty('--dna-icon-color', hex);
                    // Also set text color
                    const parent = el.closest('a.uTwgne');
                    if (parent) {
                        const textEl = parent.querySelector('.GRvzhf.YVvGBb');
                        if (textEl) {
                            textEl.style.color = hex;
                        }
                    }
                }
                const icon = getStoredIconValue(iconMap, el);
                if (icon) {
                    const resolvedIcon = resolveIconUrl(icon);
                    el.style.setProperty('--dna-icon-url', `url("${resolvedIcon}")`);
                }
                setIconEditHintState(el, iconMap, map);
            });
        } catch (_) {}

        try {
            roots.forEach(refreshActiveClassroomHoverEdit);
        } catch (_) {}

        updateVisibleIconEditHint();

        for (const [savedKey, hex] of Object.entries(map)) {
            if (/[#.>:\[]/.test(savedKey) && typeof hex === 'string') {
                for (const searchRoot of roots) {
                    try {
                        const el = searchRoot.matches && searchRoot.matches(savedKey)
                            ? searchRoot
                            : searchRoot.querySelector(savedKey);
                        if (el) {
                            el.style.setProperty('--dna-icon-color', hex);
                            // Also set text color
                            const parent = el.closest('a.uTwgne');
                            if (parent) {
                                const textEl = parent.querySelector('.GRvzhf.YVvGBb');
                                if (textEl) {
                                    textEl.style.color = hex;
                                }
                            }
                        }
                    } catch (_) {}
                }
            }
        }
    }

    function ensureColorPickerInput() {
        if (colorPickerInput) {
            return colorPickerInput;
        }
        const input = document.createElement('input');
        input.type = 'color';
        input.style.position = 'fixed';
        input.style.left = '0';
        input.style.top = '0';
        input.style.width = '1px';
        input.style.height = '1px';
        input.style.opacity = '0';
        input.style.zIndex = '2147483647';
        input.autocomplete = 'off';

        input.addEventListener('input', function onColorChange() {
            if (!elementAwaitingColor) {
                return;
            }
            try {
                elementAwaitingColor.style.setProperty('--dna-icon-color', input.value);
                // Also set text color
                const parent = elementAwaitingColor.closest('a.uTwgne');
                if (parent) {
                    const textEl = parent.querySelector('.GRvzhf.YVvGBb');
                    if (textEl) {
                        textEl.style.color = input.value;
                        console.log('Set text color to:', input.value);
                    } else {
                        console.log('Could not find text element');
                    }
                } else {
                    console.log('Could not find parent a.uTwgne');
                }
            } catch (_err) {
                console.log('Error in color change:', _err);
            }
        });

        input.addEventListener('change', function onColorCommit() {
            const target = elementAwaitingColor;
            elementAwaitingColor = null;
            if (target) {
                persistColorForElement(target, input.value);
            }
        });

        document.body.appendChild(input);
        colorPickerInput = input;
        return input;
    }

    function parseCssColorToHex(cssColor) {
        if (!cssColor) return '#ffffff';
        const tmp = document.createElement('div');
        tmp.style.color = cssColor;
        document.body.appendChild(tmp);
        const computed = getComputedStyle(tmp).color;
        document.body.removeChild(tmp);
        const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(computed);
        if (!match) return '#ffffff';
        const r = Number(match[1]).toString(16).padStart(2, '0');
        const g = Number(match[2]).toString(16).padStart(2, '0');
        const b = Number(match[3]).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
    }

    let iconPickerModeActive = false;

    function openPickerForElement(targetElement, event) {
        if (!targetElement) return;
        if (event) {
            event.preventDefault();
            event.stopPropagation();
            if (event.stopImmediatePropagation) {
                event.stopImmediatePropagation();
            }
        }

        const isPickerActive = !!elementAwaitingColor && wheelUi && wheelUi.wrapper && wheelUi.wrapper.style.display !== 'none';
        const isSameTarget = !!elementAwaitingColor && targetElement === elementAwaitingColor;
        if (isPickerActive && !isSameTarget) {
            try { hideWheel(); } catch (_) {}
        }

        iconPickerModeActive = true;
        try { applyActiveClassroomHoverIcon(targetElement, false); } catch (_) {}

        try {
            showColorWheelFor(targetElement, event);
            return;
        } catch (_err) {
        }

        const input = ensureColorPickerInput();
        elementAwaitingColor = targetElement;
        const style = getComputedStyle(targetElement);
        const variableColor = style.getPropertyValue('--dna-icon-color').trim();
        const baseColor = variableColor || style.color || '#ffffff';
        input.value = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(baseColor)
            ? baseColor
            : parseCssColorToHex(baseColor);
        try {
            if (typeof input.showPicker === 'function') {
                input.showPicker();
            } else {
                input.click();
            }
        } catch (_err2) {
            const hex = prompt('Please refresh to enable colour selection menu, or enter a hex code below:', input.value);
            if (hex) {
                try { 
                    targetElement.style.setProperty('--dna-icon-color', hex);
                    // Also set text color
                    const parent = targetElement.closest('a.uTwgne');
                    if (parent) {
                        const textEl = parent.querySelector('.GRvzhf.YVvGBb');
                        if (textEl) {
                            textEl.style.color = hex;
                        }
                    }
                } catch (_) {}
            }
        }
    }

    let lastPointerClientX = 0;
    let lastPointerClientY = 0;

    function applyActiveClassroomHoverIcon(el, active) {
        if (!el) return;
        const linkEl = el.closest('a.uTwgne');
        if (!linkEl || linkEl.getAttribute('aria-current') !== 'page') return;
        if (iconPickerModeActive) {
            const previousIconValue = el.dataset.dnaHoverOriginalIcon || '';
            if (previousIconValue) {
                el.style.setProperty('--dna-icon-url', previousIconValue);
            } else {
                el.style.removeProperty('--dna-icon-url');
            }
            return;
        }

        const editIconUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
            ? chrome.runtime.getURL('Icons/Edit.svg')
            : '';
        if (!editIconUrl) return;

        if (active) {
            const currentIconValue = el.style.getPropertyValue('--dna-icon-url') || getComputedStyle(el).getPropertyValue('--dna-icon-url') || '';
            if (currentIconValue && !el.dataset.dnaHoverOriginalIcon) {
                el.dataset.dnaHoverOriginalIcon = currentIconValue;
            }
            el.style.setProperty('--dna-icon-url', `url("${editIconUrl}")`);
        } else {
            const previousIconValue = el.dataset.dnaHoverOriginalIcon || '';
            if (previousIconValue) {
                el.style.setProperty('--dna-icon-url', previousIconValue);
            } else {
                el.style.removeProperty('--dna-icon-url');
            }
        }
    }

    function attachActiveClassroomHoverEdit(el) {
        if (!el || el.dataset.dnaHoverBound === '1') return;
        const editIconUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
            ? chrome.runtime.getURL('Icons/Edit.svg')
            : '';
        if (!editIconUrl) return;

        el.dataset.dnaHoverBound = '1';

        el.addEventListener('mouseenter', () => {
            applyActiveClassroomHoverIcon(el, true);
        });

        el.addEventListener('mouseleave', () => {
            applyActiveClassroomHoverIcon(el, false);
        });
    }

    function syncActiveClassroomHoverState(root = document) {
        const elements = root.querySelectorAll ? root.querySelectorAll('.kWQ5wd') : [];
        const pointerOver = document.elementFromPoint(lastPointerClientX, lastPointerClientY);
        const hoveredForCurrentPage = pointerOver && pointerOver.closest && pointerOver.closest('a.uTwgne');
        elements.forEach((el) => {
            const linkEl = el.closest('a.uTwgne');
            const isCurrentPage = !!linkEl && linkEl.getAttribute('aria-current') === 'page';
            const isPointerOverThis = !!(hoveredForCurrentPage && hoveredForCurrentPage === linkEl);
            if (isCurrentPage && isPointerOverThis) {
                applyActiveClassroomHoverIcon(el, true);
            } else {
                const currentIconValue = el.style.getPropertyValue('--dna-icon-url') || getComputedStyle(el).getPropertyValue('--dna-icon-url') || '';
                const hasCustomIcon = !!currentIconValue && currentIconValue.includes('Icons/') || currentIconValue.includes('chrome-extension');
                if (!hasCustomIcon) {
                    applyActiveClassroomHoverIcon(el, false);
                }
            }
        });
    }

    function getIconElements(root) {
        const elements = root.querySelectorAll ? Array.from(root.querySelectorAll('.kWQ5wd')) : [];
        if (root.matches && root.matches('.kWQ5wd')) elements.unshift(root);
        return elements;
    }

    function refreshActiveClassroomHoverEdit(root = document) {
        const elements = getIconElements(root);
        elements.forEach(attachActiveClassroomHoverEdit);
        try { syncActiveClassroomHoverState(root); } catch (_) {}
    }

    function attachIconPickersInDom(root = document) {
        const elements = getIconElements(root);
        elements.forEach((el) => {
            if (el.dataset.dnaPickerAttached === '1') return;
            el.dataset.dnaPickerAttached = '1';
            attachActiveClassroomHoverEdit(el);
            el.addEventListener('dblclick', (e) => {
                console.debug('[Modern Classroom] dblclick on .kWQ5wd');
                openPickerForElement(el, e);
            }, true);
            el.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                const linkEl = el.closest('a.uTwgne');
                if (!linkEl) return;
                if (iconPickerModeActive) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.stopImmediatePropagation) {
                        e.stopImmediatePropagation();
                    }
                }
            }, true);
            el.addEventListener('click', (e) => {
                const linkEl = el.closest('a.uTwgne');
                const isCurrentPageIcon = !!linkEl && linkEl.getAttribute('aria-current') === 'page';
                const isSwitchingTarget = !!elementAwaitingColor && el !== elementAwaitingColor && !e.target.closest('.picker');
                if (e.detail === 2 || isSwitchingTarget) {
                    console.debug('[Modern Classroom] icon click switching target on .kWQ5wd');
                    openPickerForElement(el, e);
                } else if (iconPickerModeActive || isCurrentPageIcon) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.stopImmediatePropagation) {
                        e.stopImmediatePropagation();
                    }
                    openPickerForElement(el, e);
                }
            }, true);
            try {
                el.style.cursor = 'pointer';
                el.style.userSelect = 'none';
                el.style.pointerEvents = 'auto';
            } catch (_err) {}
        });
    }

    function initializeIconColorPicker() {
        document.addEventListener('mousemove', function onMouseMove(event) {
            lastPointerClientX = event.clientX;
            lastPointerClientY = event.clientY;
        }, true);
        document.addEventListener('mousedown', function onIconMouseDown(event) {
            const targetElement = event.target.closest('.kWQ5wd');
            if (!targetElement || event.button !== 0 || !iconPickerModeActive) return;
            event.preventDefault();
            event.stopPropagation();
            if (event.stopImmediatePropagation) {
                event.stopImmediatePropagation();
            }
        }, true);
        document.addEventListener('dblclick', function onDblClick(event) {
            const targetElement = event.target.closest('.kWQ5wd');
            if (targetElement) {
                openPickerForElement(targetElement, event);
            }
        }, true);
        document.addEventListener('click', function onClick(event) {
            const targetElement = event.target.closest('.kWQ5wd');
            if (!targetElement) return;
            const linkEl = targetElement.closest('a.uTwgne');
            const isCurrentPageIcon = !!linkEl && linkEl.getAttribute('aria-current') === 'page';
            const isSwitchingTarget = !!elementAwaitingColor && targetElement !== elementAwaitingColor && !event.target.closest('.picker');
            if (event.detail === 2 || isSwitchingTarget || iconPickerModeActive || isCurrentPageIcon) {
                event.preventDefault();
                event.stopPropagation();
                if (event.stopImmediatePropagation) {
                    event.stopImmediatePropagation();
                }
                openPickerForElement(targetElement, event);
            }
        }, true);
        attachIconPickersInDom();
        restoreSavedColors();

        // Ensure colors are restored after a delay to catch lazy-loaded elements
        setTimeout(() => {
            restoreSavedColors();
        }, 500);

        setTimeout(() => {
            restoreSavedColors();
        }, 1500);

    }

    function ensureWheelUi() {
        if (wheelUi) return wheelUi;
        const host = document.createElement('div');
        host.id = 'dna-color-wheel-host';
        host.style.position = 'fixed';
        host.style.left = '0';
        host.style.top = '0';
        host.style.zIndex = '2147483647';
        host.style.pointerEvents = 'none';
        document.documentElement.appendChild(host);
        const shadow = host.attachShadow({ mode: 'open' });

        const colourStylesheet = document.createElement('link');
        colourStylesheet.rel = 'stylesheet';
        colourStylesheet.href = chrome.runtime.getURL('color-pickers.css');
        host.style.visibility = 'hidden';
        let resolveStylesReady;
        const stylesReady = new Promise((resolve) => { resolveStylesReady = resolve; });
        const revealPicker = () => {
            host.style.visibility = 'visible';
            resolveStylesReady();
        };
        colourStylesheet.addEventListener('load', revealPicker, { once: true });
        colourStylesheet.addEventListener('error', revealPicker, { once: true });
        window.setTimeout(revealPicker, 1500);
        shadow.appendChild(colourStylesheet);

        const style = document.createElement('style');
        style.textContent = `
            .icons { display: block; max-height: 220px; overflow: auto; background: #212126; border-top: 1.5px solid rgba(43, 45, 63, 0.421); margin-top: 10px; border-radius: 0px 0px 10px 10px; }
            .icon-group { padding: 6px 8px; }
            .icon-group-title { font-size: 12px; opacity: .8; color: inherit; margin: 6px 4px; }
            .icon-grid { display: grid; grid-template-columns: repeat(auto-fill, 35px); grid-auto-rows: 35px; gap: 12px; align-items: start; justify-content: start; }
            .iconBtn { width: 35px; height: 35px; display: flex; align-items: center; justify-content: center; cursor: pointer; opacity: 0.6; border-radius: 12px; transition: 0.2s; background: rgb(42, 42, 48); border: 1.5px solid rgba(43, 45, 63, 0.42) }
            .iconBtn:hover { transform: scale(1.1); transition: 0.2s; cursor: pointer; }
            .icon { width: 20px; height: 20px; }

            .icons::-webkit-scrollbar { width: 10px; height: 10px; }
            .icons::-webkit-scrollbar-track { background: transparent; }
            .icons::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 8px; border: 2px solid transparent; background-clip: padding-box; }
            .picker.light .icons::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.08); }
            .icons::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.12); }

            .icons { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.08) transparent; }
            .picker.light .icons { scrollbar-color: rgba(0,0,0,0.08) transparent; }


            .picker:not(.light) .icon { filter: invert(1) brightness(1.1) contrast(1.1); }

            .picker.light .icons { background: #f8fafd; border-top: 1.5px solid rgba(235, 237, 255, 0.58); }
            .picker.light .iconBtn { background: rgb(255, 255, 255); border: 1.5px solid rgba(235, 237, 255, 0.58) }
            .picker.light .icon { filter: none; }
        `;
        shadow.appendChild(style);

        const wrapper = document.createElement('div');
        wrapper.className = 'picker mc-picker-surface';
        wrapper.style.display = 'none';
        wrapper.style.visibility = 'hidden';
        wrapper.style.position = 'absolute';

        const pointer = document.createElement('div');
        pointer.className = 'picker-pointer';
        pointer.setAttribute('aria-hidden', 'true');
        wrapper.appendChild(pointer);

        const picker = window.MCColourPicker.create({
            container: wrapper,
            initialColor: '#ffffff',
            title: 'Icon colour',
            onClose: hideWheel,
            onColorChange: (colour) => applySidebarPickerColour(colour)
        });
    const canvas = picker.canvas;
    const marker = picker.marker;
    const preview = picker.preview;
    const slider = picker.hue;
    const hexInput = picker.hex;
    const iconsControls = picker.inputRow;

        const iconsGrid = document.createElement('div');
        iconsGrid.className = 'icons';
        const baseUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
            ? chrome.runtime.getURL('Icons/')
            : 'chrome-extension://__MSG_@@extension_id__/Icons/';

        // Create custom icons group at the top
        const customGroup = document.createElement('div');
        customGroup.className = 'icon-group';
        const customTitle = document.createElement('div');
        customTitle.className = 'icon-group-title';
        customTitle.style.position = 'relative';
        customTitle.innerHTML = 'Custom <span style="font-size: 11px; opacity: 0.6;">(.svg files only)</span>';
        customGroup.appendChild(customTitle);
        
        const customGrid = document.createElement('div');
        customGrid.className = 'icon-grid';
        
        // Create add custom icon button
        const addCustomBtn = document.createElement('div');
        addCustomBtn.className = 'iconBtn custom-add-btn';
        addCustomBtn.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        
        const plusText = document.createElement('span');
        plusText.className = 'custom-add-text';
        plusText.style.fontSize = '20px';
        plusText.style.lineHeight = '1';
        plusText.textContent = '+';
        addCustomBtn.appendChild(plusText);
        
        // Hidden file input for SVG selection
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.svg,image/svg+xml';
        fileInput.style.display = 'none';
        shadow.appendChild(fileInput);
        
        addCustomBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            fileInput.click();
        });
        
        const MAX_CUSTOM_ICONS = 14;
        const MAX_FILE_SIZE = 100 * 1024; // 100KB
        
        // Create notification popup
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: absolute;
            left: 160px;
            top: 50%;
            transform: translateY(-50%);
            background: rgba(255, 80, 80, 0.95);
            color: white;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 500;
            z-index: 10000;
            display: none;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            white-space: nowrap;
        `;
        customTitle.appendChild(notification);
        
        function showNotification(message) {
            notification.textContent = message;
            notification.style.display = 'block';
            setTimeout(() => {
                notification.style.display = 'none';
            }, 3000);
        }
        
        function updateAddButtonVisibility() {
            const customIcons = customGrid.querySelectorAll('.iconBtn:not(.custom-add-btn)').length;
            if (customIcons >= MAX_CUSTOM_ICONS) {
                addCustomBtn.style.display = 'none';
            } else {
                addCustomBtn.style.display = 'flex';
            }
        }
        
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file || !file.type.includes('svg') && !file.name.endsWith('.svg')) {
                return;
            }
            
            // Check file size
            if (file.size > MAX_FILE_SIZE) {
                showNotification('File too large, max 100KB');
                fileInput.value = '';
                return;
            }
            
            const reader = new FileReader();
            reader.onload = async (event) => {
                const svgData = event.target?.result;
                if (!svgData) return;
                
                // Store custom icon
                const customIcons = await storageGet('customIcons') || [];
                if (customIcons.length >= MAX_CUSTOM_ICONS) return;
                const iconId = 'custom_' + Date.now();
                customIcons.push({ id: iconId, data: svgData, name: file.name });
                await storageSet('customIcons', customIcons);
                
                // Add to grid
                addCustomIconToGrid(iconId, svgData);
                updateAddButtonVisibility();
            };
            reader.readAsDataURL(file);
            fileInput.value = '';
        });
        
        function addCustomIconToGrid(iconId, svgData) {
            const cell = document.createElement('div');
            cell.className = 'iconBtn';
            cell.style.position = 'relative';
            const img = document.createElement('img');
            img.src = svgData;
            img.alt = 'Custom Icon';
            img.className = 'icon';
            cell.appendChild(img);
            
            // Delete button
            const deleteBtn = document.createElement('div');
            deleteBtn.style.cssText = `
                position: absolute;
                top: -6px;
                right: -6px;
                width: 18px;
                height: 18px;
                background: rgba(255, 80, 80, 0.9);
                border-radius: 50%;
                display: none;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                font-size: 12px;
                color: white;
                font-weight: bold;
                z-index: 10;
                line-height: 1;
            `;
            deleteBtn.textContent = '×';
            deleteBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Remove from storage
                const customIcons = await storageGet('customIcons') || [];
                const filtered = customIcons.filter(icon => icon.id !== iconId);
                await storageSet('customIcons', filtered);
                // Remove from DOM
                cell.remove();
                updateAddButtonVisibility();
            });
            cell.appendChild(deleteBtn);
            
            cell.addEventListener('mouseenter', () => {
                deleteBtn.style.display = 'flex';
            });
            cell.addEventListener('mouseleave', () => {
                deleteBtn.style.display = 'none';
            });
            
            cell.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!elementAwaitingColor) return;
                try {
                    elementAwaitingColor.style.setProperty('--dna-icon-url', `url("${svgData}")`);
                    persistIconForElement(elementAwaitingColor, svgData);
                } catch (_) {}
            });
            customGrid.appendChild(cell);
        }
        
        // Load stored custom icons
        (async () => {
            const customIcons = await storageGet('customIcons') || [];
            customIcons.forEach(icon => {
                addCustomIconToGrid(icon.id, icon.data);
            });
            updateAddButtonVisibility();
        })();
        
        customGrid.appendChild(addCustomBtn);
        customGroup.appendChild(customGrid);
        iconsGrid.appendChild(customGroup);

        availableIcons.forEach((group) => {
            const groupEl = document.createElement('div');
            groupEl.className = 'icon-group';

            const titleEl = document.createElement('div');
            titleEl.className = 'icon-group-title';
            titleEl.textContent = group.title || '';
            groupEl.appendChild(titleEl);

            const grid = document.createElement('div');
            grid.className = 'icon-grid';

            (group.icons || []).forEach((file) => {
                const cell = document.createElement('div');
                cell.className = 'iconBtn';
                const img = document.createElement('img');
                img.src = baseUrl + file;
                img.alt = file;
                img.className = 'icon';
                cell.appendChild(img);
                cell.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!elementAwaitingColor) return;
                    const url = baseUrl + file;
                    try {
                        elementAwaitingColor.style.setProperty('--dna-icon-url', `url("${url}")`);
                        persistIconForElement(elementAwaitingColor, url);
                    } catch (_) {}
                });
                grid.appendChild(cell);
            });

            groupEl.appendChild(grid);
            iconsGrid.appendChild(groupEl);
        });
        wrapper.appendChild(iconsGrid);
        shadow.appendChild(wrapper);

    wheelUi = { host, shadow, wrapper, canvas, marker, slider, preview, iconsGrid, hexInput, pointer, stylesReady };

    function applySidebarPickerColour(hex) {
        if (!elementAwaitingColor) return;
        try {
            elementAwaitingColor.style.setProperty('--dna-icon-color', hex);
            const parent = elementAwaitingColor.closest('a.uTwgne');
            const textElement = parent && parent.querySelector('.GRvzhf.YVvGBb');
            if (textElement) textElement.style.color = hex;
        } catch (_) {}

        clearTimeout(persistTimer);
        persistTimer = setTimeout(() => {
            persistColorForElement(elementAwaitingColor, hex);
        }, 150);
    }

    wheelUi.updateFromHex = (hex) => picker.setColor(hex, 'initial');
    wheelUi.updatePreviewAndApply = () => {};
    applyWheelTheme();
    return wheelUi;
    }

    function showColorWheelFor(targetElement, event) {
        const ui = ensureWheelUi();
        applyWheelTheme();
        elementAwaitingColor = targetElement;
        try {
            createSidebarHotspot();
            try { findSidebar(); } catch (_) {}
            sidebarForceVisible = true;
            showSidebar();
        } catch (_) {}
        const pref = (event && event.clientX !== undefined)
            ? { left: 95, top: event.clientY}
            : targetElement.getBoundingClientRect();
        ui.wrapper.style.display = 'block';
        ui.wrapper.style.visibility = 'hidden';

        const revealPositionedPicker = () => {
            if (!wheelUi || elementAwaitingColor !== targetElement) return;
            requestAnimationFrame(() => {
                if (!wheelUi || elementAwaitingColor !== targetElement) return;
                positionPickerWithinViewport(pref.left, pref.top);
                updatePickerPointerForTarget();
                ui.wrapper.style.visibility = 'visible';
            });
        };
        ui.stylesReady.then(revealPositionedPicker);

        const style = getComputedStyle(targetElement);
        const variableColor = style.getPropertyValue('--dna-icon-color').trim();
        const baseColor = variableColor || parseCssColorToHex(style.color) || '#ffffff';
        ui.updateFromHex(baseColor);
        ui.updatePreviewAndApply();

        ui.onKey = (e) => { if (e.key === 'Escape') hideWheel(); };
        ui.onDocDown = (e) => {
            const path = (typeof e.composedPath === 'function') ? e.composedPath() : [];
            const clickedInside = path.includes(ui.wrapper);
            if (!clickedInside) hideWheel();
        };
        setTimeout(() => {
            document.addEventListener('keydown', ui.onKey);
            document.addEventListener('mousedown', ui.onDocDown, { capture: true });
            ui.onResize = () => {
                const currentLeft = parseInt(ui.wrapper.style.left || '0', 10);
                const currentTop = parseInt(ui.wrapper.style.top || '0', 10);
                positionPickerWithinViewport(currentLeft, currentTop);
            };
            window.addEventListener('resize', ui.onResize);
        }, 0);
    }

    function updatePickerPointerForTarget() {
        if (!wheelUi || !wheelUi.wrapper || !wheelUi.pointer) return;
        const pointer = wheelUi.pointer;
        if (!elementAwaitingColor) {
            pointer.style.display = 'none';
            pointer.classList.remove('left', 'right');
            return;
        }

        const panelRect = wheelUi.wrapper.getBoundingClientRect();
        const targetRect = elementAwaitingColor.getBoundingClientRect();
        const targetCenterX = targetRect.left + (targetRect.width / 2);
        const panelCenterX = panelRect.left + (panelRect.width / 2);
        const targetCenterY = targetRect.top + (targetRect.height / 2);
        const top = Math.max(16, Math.min(panelRect.height - 24, targetCenterY - panelRect.top - 8));

        pointer.style.display = 'block';
        pointer.style.top = `${top}px`;
        if (targetCenterX < panelCenterX) {
            pointer.classList.add('left');
            pointer.classList.remove('right');
        } else {
            pointer.classList.add('right');
            pointer.classList.remove('left');
        }
    }

    function positionPickerWithinViewport(preferredLeft, preferredTop) {
        if (!wheelUi) return;
        const el = wheelUi.wrapper;
        const margin = 10;
        const width = el.offsetWidth;
        const height = el.offsetHeight;
        let left = Math.round(preferredLeft);
        let top = Math.round(preferredTop - 28);
        if (left + width + margin > window.innerWidth) {
            left = window.innerWidth - width - margin;
        }
        if (left < margin) left = margin;
        if (top + height + margin > window.innerHeight) {
            top = window.innerHeight - height - margin;
        }
        if (top < margin) top = margin;
        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
        updatePickerPointerForTarget();
    }

    function positionPopupWithinViewport(el, preferredLeft, preferredTop) {
        const margin = 10;
        const width = el.offsetWidth;
        const height = el.offsetHeight;
        let left = Math.round(preferredLeft);
        let top = Math.round(preferredTop);
        if (left + width + margin > window.innerWidth) {
            left = window.innerWidth - width - margin;
        }
        if (left < margin) left = margin;
        if (top + height + margin > window.innerHeight) {
            top = window.innerHeight - height - margin;
        }
        if (top < margin) top = margin;
        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
        el.style.position = 'absolute';
    }

    function applyWheelTheme() {
        if (!wheelUi || !wheelUi.wrapper) return;
        const isDark = document.body.classList.contains('dark-mode');
        wheelUi.wrapper.classList.toggle('light', !isDark);
    }

    

    function hideWheel() {
        if (!wheelUi) return;
        wheelUi.wrapper.style.display = 'none';
        iconPickerModeActive = false;
        if (wheelUi.pointer) {
            wheelUi.pointer.style.display = 'none';
            wheelUi.pointer.classList.remove('left', 'right');
        }
        elementAwaitingColor = null;
        try { sidebarForceVisible = false; } catch (_) {}
        if (wheelUi.onKey) {
            try { document.removeEventListener('keydown', wheelUi.onKey); } catch (_) {}
            wheelUi.onKey = null;
        }
        if (wheelUi.onDocDown) {
            try { document.removeEventListener('mousedown', wheelUi.onDocDown, { capture: true }); } catch (_) {}
            try { document.removeEventListener('mousedown', wheelUi.onDocDown); } catch (_) {}
            wheelUi.onDocDown = null;
        }
        if (wheelUi.onResize) {
            try { window.removeEventListener('resize', wheelUi.onResize); } catch (_) {}
            wheelUi.onResize = null;
        }
        try { 
            createSidebarHotspot();
            handleSidebarVisibility(); 
        } catch (_) {}
    }

    function hsvToRgb(h, s, v) {
        const c = v * s;
        const hh = (h / 60) % 6;
        const x = c * (1 - Math.abs((hh % 2) - 1));
        let r1=0, g1=0, b1=0;
        if (0 <= hh && hh < 1) { r1=c; g1=x; b1=0; }
        else if (1 <= hh && hh < 2) { r1=x; g1=c; b1=0; }
        else if (2 <= hh && hh < 3) { r1=0; g1=c; b1=x; }
        else if (3 <= hh && hh < 4) { r1=0; g1=x; b1=c; }
        else if (4 <= hh && hh < 5) { r1=x; g1=0; b1=c; }
        else { r1=c; g1=0; b1=x; }
        const m = v - c;
        return { r: Math.round((r1+m)*255), g: Math.round((g1+m)*255), b: Math.round((b1+m)*255) };
    }

    function rgbToHex(r, g, b) {
        const toHex = (n) => n.toString(16).padStart(2, '0');
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    function drawColorWheel(ctx, width, height, hue) {
        const image = ctx.createImageData(width, height);
        const data = image.data;
        for (let y = 0; y < height; y++) {
            const value = 1 - (y + 0.5) / height;
            for (let x = 0; x < width; x++) {
                const index = (y * width + x) * 4;
                const saturation = (x + 0.5) / width;
                const colour = hsvToRgb(hue, saturation, value);
                data[index] = colour.r;
                data[index + 1] = colour.g;
                data[index + 2] = colour.b;
                data[index + 3] = 255;
            }
        }
        ctx.putImageData(image, 0, 0);
    }

    function hexToHsv(hex) {
        const { r, g, b } = hexToRgb(hex);
        const r1=r/255, g1=g/255, b1=b/255;
        const max=Math.max(r1,g1,b1), min=Math.min(r1,g1,b1);
        const d=max-min;
        let h=0;
        if (d===0) h=0;
        else if (max===r1) h=((g1-b1)/d)%6;
        else if (max===g1) h=(b1-r1)/d+2;
        else h=(r1-g1)/d+4;
        h=Math.round(h*60); if (h<0) h+=360;
        const s=max===0?0:d/max;
        const v=max;
        return { h, s, v };
    }

    function hexToRgb(hex) {
        const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (!m) return { r: 255, g: 255, b: 255 };
        return { r: parseInt(m[1],16), g: parseInt(m[2],16), b: parseInt(m[3],16) };
    }

let lastUrl = location.href;
function handleUrlChange() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    setTimeout(() => {
        restoreTitles();
        syncSidebarOnClassroomPage();
        // Also restore colors when URL changes
        setTimeout(() => {
            restoreSavedColors();
            setTimeout(() => {
                try { refreshActiveClassroomHoverEdit(); } catch (_) {}
                try { syncActiveClassroomHoverState(); } catch (_) {}
            }, 50);
            // After colors are restored, conditionally open icon customizer
            setTimeout(() => {
                try { openIconCustomizerIfUncustomized(); } catch (_) {}
            }, 120);
        }, 100);
    }, 100);
}

async function openIconCustomizerIfUncustomized() {
    // Try to find the currently selected class anchor and open the picker
    // if there is no custom CSS variable set for icon or colour.
    const attempts = 6;
    const delay = (ms) => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < attempts; i++) {
        try {
            // Prefer the currently-focused/active class entry in the sidebar
            let anchor = document.querySelector('a[href*="/c/"][aria-current="page"]')
                || document.querySelector('a[href*="/c/"]');
            if (!anchor) {
                // Wait a bit and retry if the sidebar hasn't rendered yet
                await delay(150);
                continue;
            }

            const iconEl = anchor.querySelector('.kWQ5wd');
            if (!iconEl) return;

            const computed = getComputedStyle(iconEl);
            const varColor = (computed.getPropertyValue('--dna-icon-color') || '').trim();
            const varUrl = (computed.getPropertyValue('--dna-icon-url') || '').trim();
            const inlineColor = (iconEl.style && iconEl.style.getPropertyValue('--dna-icon-color') || '').trim();
            const inlineUrl = (iconEl.style && iconEl.style.getPropertyValue('--dna-icon-url') || '').trim();

            const hasCustomColour = !!(varColor || inlineColor);
            const hasCustomIcon = !!(varUrl || inlineUrl);

            if (!hasCustomColour && !hasCustomIcon) {
                try { openPickerForElement(iconEl); } catch (_) {}
            }
            return;
        } catch (err) {
            // keep retrying briefly
            await delay(150);
        }
    }
}

window.addEventListener('popstate', handleUrlChange);
window.addEventListener('locationchange', handleUrlChange);
if (typeof history !== 'undefined') {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function() {
        originalPushState.apply(this, arguments);
        window.dispatchEvent(new Event('locationchange'));
    };

    history.replaceState = function() {
        originalReplaceState.apply(this, arguments);
        window.dispatchEvent(new Event('locationchange'));
    };
}
handleUrlChange();

function initialize() {
  console.log('Modern Google Classroom extension initializing...');
  
  // Load classicSidebar setting immediately from localStorage
  try {
    const isClassic = localStorage.getItem('classicSidebar') === 'true';
    if (isClassic) {
      document.body.classList.add('classic-sidebar');
    }
  } catch (_) {}
  
  // Then load from sync storage in background
  if (typeof storageGet === 'function') {
    storageGet('classicSidebar', false).then(isClassic => {
      if (isClassic) {
        document.body.classList.add('classic-sidebar');
      } else {
        document.body.classList.remove('classic-sidebar');
      }
    });
  }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                initializeDarkMode();
                addDarkModeToggleListener();
                addKeyboardShortcut();
                initializeSidebar();

                // Apply stored layout mode on load (even if settings not opened)
                try {
                    const storedLayout = localStorage.getItem('layoutMode') || 'standard';
                    if (storedLayout === 'fill' || storedLayout === 'fill-screen') {
                        document.body.classList.add('mgc-layout-fill-screen');
                        document.body.classList.add('fillview');
                    } else {
                        document.body.classList.remove('mgc-layout-fill-screen');
                        document.body.classList.remove('fillview');
                    }
                } catch (_) {}
                
                // Load from sync storage in background
                if (typeof storageGet === 'function') {
                    storageGet('layoutMode', 'standard').then(storedLayout => {
                        if (storedLayout === 'fill' || storedLayout === 'fill-screen') {
                            document.body.classList.add('mgc-layout-fill-screen');
                            document.body.classList.add('fillview');
                        } else {
                            document.body.classList.remove('mgc-layout-fill-screen');
                            document.body.classList.remove('fillview');
                        }
                    });
                }
            });
        } else {
            initializeDarkMode();
            addDarkModeToggleListener();
            addKeyboardShortcut();
            initializeSidebar();
            initializeIconColorPicker();

            // Apply stored layout mode on load (even if settings not opened)
            try {
                const storedLayout = localStorage.getItem('layoutMode') || 'standard';
                if (storedLayout === 'fill' || storedLayout === 'fill-screen') {
                    document.body.classList.add('mgc-layout-fill-screen');
                    document.body.classList.add('fillview');
                } else {
                    document.body.classList.remove('mgc-layout-fill-screen');
                    document.body.classList.remove('fillview');
                }
            } catch (_) {}
            
            // Load from sync storage in background
            if (typeof storageGet === 'function') {
                storageGet('layoutMode', 'standard').then(storedLayout => {
                    if (storedLayout === 'fill' || storedLayout === 'fill-screen') {
                        document.body.classList.add('mgc-layout-fill-screen');
                        document.body.classList.add('fillview');
                    } else {
                        document.body.classList.remove('mgc-layout-fill-screen');
                        document.body.classList.remove('fillview');
                    }
                });
            }
        }

        const pendingColorRestoreRoots = new Set();
        let colorRestoreFrame = 0;
        function scheduleColorRestoration(root) {
            pendingColorRestoreRoots.add(root);
            if (colorRestoreFrame) return;

            colorRestoreFrame = requestAnimationFrame(() => {
                colorRestoreFrame = 0;
                const roots = Array.from(pendingColorRestoreRoots);
                pendingColorRestoreRoots.clear();
                const topLevelRoots = roots.filter(root =>
                    !roots.some(other => other !== root && other.contains(root))
                );

                topLevelRoots.forEach(attachIconPickersInDom);
                restoreSavedColors(topLevelRoots);
            });
        }

        const observer = new MutationObserver(function(mutations) {
            let shouldCheckForButton = false;
            let shouldCheckForSidebar = false;
            
            mutations.forEach(function(mutation) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    for (let node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.classList && node.classList.contains('k43Owe') && node.classList.contains('mmOZjd')) {
                                shouldCheckForButton = true;
                            }
                            if (node.classList && node.classList.contains('STek2d')) {
                                shouldCheckForSidebar = true;
                            }
                            if (node.querySelector) {
                                if (node.querySelector('.k43Owe.mmOZjd')) {
                                    shouldCheckForButton = true;
                                }
                                if (node.querySelector('.STek2d')) {
                                    shouldCheckForSidebar = true;
                                }
                                const hasIcons = (node.matches && node.matches('.kWQ5wd')) || node.querySelector('.kWQ5wd');
                                const hasSidebarLinks = (node.matches && node.matches('a.uTwgne')) || node.querySelector('a.uTwgne');
                                if (hasIcons || hasSidebarLinks) {
                                    scheduleColorRestoration(node);
                                }
                            }
                        }
                    }
                }
            });
            
            if (shouldCheckForButton) {
                setTimeout(addDarkModeToggleListener, 100);
            }
            
            if (shouldCheckForSidebar) {
                setTimeout(function() {
                    findSidebar();
                    handleSidebarVisibility();
                }, 100);
            }

        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        let attempts = 0;
        const maxAttempts = 5;
        const interval = setInterval(function() {
            attempts++;
            const toggleButton = document.querySelector('.k43Owe.mmOZjd');
            const sidebarElement = document.querySelector('.STek2d');
            const anyIcons = document.querySelector('.kWQ5wd');
            
            if ((toggleButton && sidebarElement && anyIcons) || attempts >= maxAttempts) {
                clearInterval(interval);
                if (toggleButton) {
                    addDarkModeToggleListener();
                }
                if (sidebarElement) {
                    findSidebar();
                    handleSidebarVisibility();
                }
            }
        }, 1000);
    }

    initialize();

})();
