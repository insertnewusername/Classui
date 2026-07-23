(function() {
    'use strict';

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

    // Expose for other modules so they can perform SPA-friendly classroom navigation
    try {
        if (typeof window !== 'undefined') window.navigateToClassroom = navigateToClassroom;
    } catch (_) {}

    // Create a floating widget attached to document.body so it doesn't affect layout
    function createLiveWidget() {
        const host = document.createElement('div');
        host.className = 'mc-live-widget';
        host.style.display = 'none'; // hidden by default until content exists
        host.style.position = 'fixed'; // fixed so it doesn't move on scroll
        host.style.pointerEvents = 'auto';
        host.style.zIndex = '1000';
        host.innerHTML = `
            <div class="mc-live-group mc-live-group-active" role="list" aria-label="Active classes"></div>
            <div class="mc-live-group mc-live-group-upcoming" role="list" aria-label="Upcoming classes"></div>
        `;
        host.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        document.body.appendChild(host);
        return host;
    }

    function insertTimetableButton() {
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

        // No existing button found — create and insert one into the action container (or fallback into target)
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
    let __mc_live_last_shown = 0;

    function updateLiveWidget() {
        try {
            const widget = document.querySelector('.mc-live-widget');
            if (!widget) return;
            if (document.body && document.body.classList.contains('mc-homepage-redesign-enabled') && !document.body.classList.contains('mc-homepage-schedule-hidden')) {
                widget.style.display = 'none';
                return;
            }
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
            const today = (new Date()).getDay();
            const nowMin = (() => { const d = new Date(); return d.getHours()*60 + d.getMinutes(); })();

            const periods = [];
            classes.forEach(c => (c.periods || []).forEach(p => { if (p && Number(p.day) === today && p.start && p.end) periods.push({ c, p }); }));
            console.debug('updateLiveWidget periods:', periods.length);

            if (!periods.length) {
                // Debounce hide to avoid flicker when DOM/loads are changing
                if (__mc_live_hide_timer) clearTimeout(__mc_live_hide_timer);
                __mc_live_hide_timer = setTimeout(() => {
                    widget.style.display = 'none';
                }, 600);
                return;
            }

            // compute start/end minutes for each
            periods.forEach(x => { x.startMin = parseTimeToMinutes(x.p.start); x.endMin = parseTimeToMinutes(x.p.end); });
            periods.sort((a,b) => a.startMin - b.startMin);

            const activePeriods = periods.filter(x => x.startMin <= nowMin && nowMin < x.endMin);
            const upcomingCandidates = periods.filter(x => x.startMin > nowMin);
            const nextStartMin = upcomingCandidates.length ? upcomingCandidates[0].startMin : null;
            const upcomingPeriods = nextStartMin !== null ? upcomingCandidates.filter(x => x.startMin === nextStartMin) : [];

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

            function attachCardInteractions(card, cls) {
                if (!card) return;
                const handler = (ev) => {
                    ev.stopPropagation();
                    if (cls && cls.classroom && String(cls.classroom).trim()) {
                        const handled = navigateToClassroom(cls.classroom);
                        if (handled) return;
                    }
                };
                card.addEventListener('click', handler);
                card.addEventListener('keydown', (ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault();
                        handler(ev);
                    }
                    if (ev.key === 'Escape') {
                        hideTimetableMenu();
                    }
                });
            }

            function createLiveCard(item, role) {
                const card = document.createElement('div');
                const cls = item.c;
                const period = item.p;
                const classTitle = cls.title || '';
                card.className = `mc-live-card ${role === 'upcoming' ? 'mc-live-card-upcoming' : 'mc-live-card-active'}`;
                card.dataset.role = role;
                card.dataset.startMin = item.startMin || 0;
                card.dataset.endMin = item.endMin || 0;
                card.setAttribute('role', 'button');
                card.tabIndex = 0;

                if (role === 'upcoming') {
                    const titleWithRoom = `${escapeHtml(classTitle)}${cls.room ? ' • ' + escapeHtml(cls.room) : ''}`;
                    const colorStyle = escapeHtml(cls.colour || '#9aa0a6');
                    card.innerHTML = `
                        <div class="mc-card-swatch mc-card-swatch-upcoming" data-colour="${colorStyle}" style="--swatch-color: ${colorStyle};"></div>
                        <div class="mc-card-mini-content">
                            <div class="mc-card-mini-title">${titleWithRoom}</div>
                            <div class="mc-card-mini-period">Starts at ${escapeHtml(formatTimeToAmPm(period.start))}</div>
                        </div>
                        <div class="mc-card-tooltip">Starts in --</div>
                    `;
                    card.setAttribute('aria-label', `${classTitle || 'Class'} starts at ${formatTimeToAmPm(period.start)}`);
                } else {
                    const metaParts = [];
                    if (cls.teacher) metaParts.push(escapeHtml(cls.teacher));
                    if (cls.room) metaParts.push(escapeHtml(cls.room));
                    const colorStyle = escapeHtml(cls.colour || '#9aa0a6');
                    card.innerHTML = `
                        <div class="mc-card-swatch mc-card-swatch-active" data-colour="${colorStyle}" style="--swatch-color: ${colorStyle};"></div>
                        <div class="mc-card-mini-content">
                            <div class="mc-card-mini-title">${escapeHtml(classTitle)}</div>
                            ${metaParts.length ? `<div class="mc-card-mini-meta">${metaParts.join(' • ')}</div>` : ''}
                            <div class="mc-card-mini-period">${escapeHtml(formatTimeToAmPm(period.start))} — ${escapeHtml(formatTimeToAmPm(period.end))}</div>
                        </div>
                        <div class="mc-card-tooltip">-- left</div>
                    `;
                    card.setAttribute('aria-label', `${classTitle || 'Class'} active until ${formatTimeToAmPm(period.end)}`);
                }

                attachCardInteractions(card, cls);
                return card;
            }

            activeGroup.innerHTML = '';
            upcomingGroup.innerHTML = '';

            if (activePeriods.length) {
                activePeriods.forEach(item => {
                    const card = createLiveCard(item, 'active');
                    activeGroup.appendChild(card);
                    
                    // Add hover listener for tooltip
                    card.addEventListener('mouseenter', () => {
                        const now = new Date();
                        const currentMin = now.getHours() * 60 + now.getMinutes();
                        const endMin = Number(card.dataset.endMin);
                        const minutesLeft = Math.max(0, endMin - currentMin);
                        const tooltip = card.querySelector('.mc-card-tooltip');
                        if (tooltip) {
                            tooltip.textContent = `${formatDurationCompact(minutesLeft)} left`;
                        }
                    });
                });
            }

            if (upcomingPeriods.length) {
                upcomingPeriods.forEach(item => {
                    const card = createLiveCard(item, 'upcoming');
                    upcomingGroup.appendChild(card);
                    
                    // Add hover listener for tooltip
                    card.addEventListener('mouseenter', () => {
                        const now = new Date();
                        const currentMin = now.getHours() * 60 + now.getMinutes();
                        const startMin = Number(card.dataset.startMin);
                        const minutesUntil = Math.max(0, startMin - currentMin);
                        const tooltip = card.querySelector('.mc-card-tooltip');
                        if (tooltip) {
                            tooltip.textContent = `Starts in ${formatDurationCompact(minutesUntil)}`;
                        }
                    });
                });
            }

            function updateLiveCardProgress() {
                const now = new Date();
                const currentMin = now.getHours() * 60 + now.getMinutes();
                
                // Update active cards
                const activeCards = activeGroup.querySelectorAll('.mc-live-card-active');
                activeCards.forEach(card => {
                    const startMin = Number(card.dataset.startMin);
                    const endMin = Number(card.dataset.endMin);
                    if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || startMin >= endMin) return;
                    const duration = endMin - startMin;
                    const elapsed = Math.max(0, Math.min(currentMin - startMin, duration));
                    const progressPct = (elapsed / duration) * 100;
                    const swatch = card.querySelector('.mc-card-swatch-active');
                    if (swatch) {
                        swatch.style.setProperty('--swatch-progress', progressPct + '%');
                    }
                });
                
                // Update upcoming cards
                const upcomingCards = upcomingGroup.querySelectorAll('.mc-live-card-upcoming');
                upcomingCards.forEach(card => {
                    const startMin = Number(card.dataset.startMin);
                    if (!Number.isFinite(startMin)) return;
                    const timeUntilStart = startMin - currentMin;
                    const countdownWindow = 15;
                    const countdownProgress = Math.max(0, Math.min(100, 100 - (timeUntilStart / countdownWindow) * 100));
                    const swatch = card.querySelector('.mc-card-swatch-upcoming');
                    if (swatch) {
                        swatch.style.setProperty('--swatch-progress', countdownProgress + '%');
                    }
                });
            }

            updateLiveCardProgress();

            const hasActiveCards = activeGroup.childElementCount > 0;
            const hasUpcomingCards = upcomingGroup.childElementCount > 0;

            activeGroup.style.display = hasActiveCards ? 'flex' : 'none';
            activeGroup.setAttribute('aria-hidden', hasActiveCards ? 'false' : 'true');
            upcomingGroup.style.display = hasUpcomingCards ? 'flex' : 'none';
            upcomingGroup.setAttribute('aria-hidden', hasUpcomingCards ? 'false' : 'true');
            upcomingGroup.classList.toggle('mc-live-group-alone', hasUpcomingCards && !hasActiveCards);

            const positionWidget = () => {
                const btn = document.querySelector('.mc-left-action-btn');
                const wRect = widget.getBoundingClientRect();
                if (btn) {
                    const r = btn.getBoundingClientRect();
                    let left = r.left - wRect.width - 8;
                    if (left < 8) left = r.right + 8;
                    let top = r.top + (r.height - wRect.height) / 2;
                    if (top < 8) top = 8;
                    if (top + wRect.height > window.innerHeight - 8) top = window.innerHeight - wRect.height - 8;
                    widget.style.left = `${Math.round(left)}px`;
                    widget.style.top = '0px';
                } else {
                    widget.style.left = '8px';
                    widget.style.top = '0px';
                }
            };

            positionWidget();
            requestAnimationFrame(positionWidget);

            __mc_live_last_shown = Date.now();
        } catch (e) { console.debug('updateLiveWidget error', e); }
    }

    // periodic refresh and storage events
    try { updateLiveWidget(); } catch(_) {}
    setInterval(updateLiveWidget, 30 * 1000);
    
    // Update progress bar smoothly every second
    function updateAllLiveCardProgress() {
        try {
            const widget = document.querySelector('.mc-live-widget');
            if (!widget) return;
            const now = new Date();
            const currentMin = now.getHours() * 60 + now.getMinutes();
            
            // Update active cards
            const activeGroup = widget.querySelector('.mc-live-group-active');
            if (activeGroup) {
                const activeCards = activeGroup.querySelectorAll('.mc-live-card-active');
                activeCards.forEach(card => {
                    const startMin = Number(card.dataset.startMin);
                    const endMin = Number(card.dataset.endMin);
                    if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || startMin >= endMin) return;
                    const duration = endMin - startMin;
                    const elapsed = Math.max(0, Math.min(currentMin - startMin, duration));
                    const progressPct = (elapsed / duration) * 100;
                    const swatch = card.querySelector('.mc-card-swatch-active');
                    if (swatch) {
                        swatch.style.setProperty('--swatch-progress', progressPct + '%');
                    }
                });
            }
            
            // Update upcoming cards
            const upcomingGroup = widget.querySelector('.mc-live-group-upcoming');
            if (upcomingGroup) {
                const upcomingCards = upcomingGroup.querySelectorAll('.mc-live-card-upcoming');
                upcomingCards.forEach(card => {
                    const startMin = Number(card.dataset.startMin);
                    if (!Number.isFinite(startMin)) return;
                    const timeUntilStart = startMin - currentMin;
                    // Show countdown in the last 15 minutes before start
                    const countdownWindow = 15;
                    const countdownProgress = Math.max(0, Math.min(100, 100 - (timeUntilStart / countdownWindow) * 100));
                    const swatch = card.querySelector('.mc-card-swatch-upcoming');
                    if (swatch) {
                        swatch.style.setProperty('--swatch-progress', countdownProgress + '%');
                    }
                });
            }
        } catch (e) {
            console.debug('updateAllLiveCardProgress error:', e);
        }
    }
    
    setInterval(updateAllLiveCardProgress, 1000);
    
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
    // Also reposition/update on resize/scroll so floating widget tracks the button
    window.addEventListener('resize', () => { try { updateLiveWidget(); } catch(_) {} });
    window.addEventListener('scroll', () => { try { updateLiveWidget(); } catch(_) {} });

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
                try { updateLiveWidget(); } catch (_) {}
            }
        }, 150);
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
        intervalId: null,
        currentTimetableIndex: 0  // Track which timetable is active (0, 1, or 2)
    };

    // Migrate old timetable data to new structure
    function migrateOldTimetableData() {
        try {
            const oldKey = 'mcTimetableClasses';
            const newClassesKey = 'mcTimetableClassesShared';
            const newPeriodsKey = 'mcTimetableClasses_0';
            
            // Check if old key exists in localStorage
            const oldData = localStorage.getItem(oldKey);
            const newClassesData = localStorage.getItem(newClassesKey);
            
            if (oldData && !newClassesData) {
                try {
                    const oldClasses = JSON.parse(oldData);
                    
                    // Separate classes from periods
                    const classesList = oldClasses.map(c => {
                        const { periods, ...classData } = c;
                        return classData;
                    });
                    
                    // Build periods map
                    const periodsMap = {};
                    oldClasses.forEach(c => {
                        if (c.id && c.periods) {
                            periodsMap[c.id] = c.periods;
                        }
                    });
                    
                    // Save separated data
                    localStorage.setItem(newClassesKey, JSON.stringify(classesList));
                    localStorage.setItem(newPeriodsKey, JSON.stringify(periodsMap));
                    console.log('Successfully migrated timetable data to new structure (classes + periods)');
                } catch (e) {
                    console.warn('Failed to parse and migrate old data:', e);
                }
            }
            
            // Also check chrome.storage and migrate if needed
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
                chrome.storage.sync.get([oldKey, newClassesKey], function(data) {
                    if (chrome.runtime?.lastError) return;
                    
                    const oldChromeData = data[oldKey];
                    const newChromeclassesData = data[newClassesKey];
                    
                    if (oldChromeData && !newChromeclassesData) {
                        try {
                            const oldClasses = Array.isArray(oldChromeData) ? oldChromeData : [];
                            
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
                            
                            chrome.storage.sync.set({ 
                                [newClassesKey]: classesList,
                                [newPeriodsKey]: periodsMap
                            }, function() {
                                if (chrome.runtime?.lastError) {
                                    console.warn('Chrome.storage migration failed:', chrome.runtime.lastError);
                                } else {
                                    console.log('Successfully migrated timetable data to chrome.storage (classes + periods)');
                                }
                            });
                        } catch (e) {
                            console.warn('Failed to migrate chrome data:', e);
                        }
                    }
                });
            }
        } catch (e) {
            console.warn('Timetable migration error:', e);
        }
    }

    // Run migration on startup
    migrateOldTimetableData();

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
        
        // Then check chrome.storage.sync and update localStorage if different
        try {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
                chrome.storage.sync.get(['mcTimetableCurrentIndex'], (result) => {
                    if (chrome.runtime.lastError) return;
                    if (result.mcTimetableCurrentIndex !== undefined) {
                        const syncIdx = parseInt(result.mcTimetableCurrentIndex);
                        if (!isNaN(syncIdx)) {
                            mcTimetable.currentTimetableIndex = syncIdx;
                            localStorage.setItem('mcTimetableCurrentIndex', syncIdx);
                        }
                    }
                });
            }
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

        // Header with timetable cycle arrows and edit button
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

        function applyTimetableIndex(index, labelEl) {
            const nextIndex = normalizeTimetableIndex(index);
            mcTimetable.currentTimetableIndex = nextIndex;
            if (labelEl) {
                labelEl.textContent = timetableNames[nextIndex] || `Timetable ${nextIndex + 1}`;
            }
            saveTimetableIndex();
            try { updateLiveWidget(); } catch (_) {}
            try { updateHeaderBackgroundForActiveCourse(); } catch (_) {}
            try { renderPeriodsOnTimetable(); } catch (_) {}
        }

        // Create a container for title + arrows
        const titleContainer = document.createElement('div');
        titleContainer.className = 'mc-timetable-title-container';
        
        const title = document.createElement('label');
        title.className = 'mc-timetable-title';
        title.textContent = 'Timetable';
        title.style.marginRight = '8px';

        const switcher = document.createElement('div');
        switcher.className = 'mc-timetable-switcher';

        const prevBtn = document.createElement('button');
        prevBtn.className = 'mc-timetable-nav-btn mc-timetable-nav-prev';
        prevBtn.type = 'button';
        prevBtn.setAttribute('aria-label', 'Previous timetable');
        prevBtn.title = 'Previous timetable';
        prevBtn.textContent = '◀';

        const currentLabel = document.createElement('span');
        currentLabel.className = 'mc-timetable-current-label';
        currentLabel.setAttribute('aria-live', 'polite');
        currentLabel.textContent = timetableNames[normalizeTimetableIndex(mcTimetable.currentTimetableIndex)] || 'Timetable 1';

        const nextBtn = document.createElement('button');
        nextBtn.className = 'mc-timetable-nav-btn mc-timetable-nav-next';
        nextBtn.type = 'button';
        nextBtn.setAttribute('aria-label', 'Next timetable');
        nextBtn.title = 'Next timetable';
        nextBtn.textContent = '▶';

        prevBtn.addEventListener('click', () => {
            applyTimetableIndex(mcTimetable.currentTimetableIndex - 1, currentLabel);
        });
        nextBtn.addEventListener('click', () => {
            applyTimetableIndex(mcTimetable.currentTimetableIndex + 1, currentLabel);
        });

        switcher.appendChild(prevBtn);
        switcher.appendChild(currentLabel);
        switcher.appendChild(nextBtn);
        
        titleContainer.appendChild(title);
        titleContainer.appendChild(switcher);
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

        // Async: Load from chrome.storage.sync and sync to localStorage if needed
        function syncClassesFromChrome() {
            if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) return;
            chrome.storage.sync.get([STORAGE_CLASSES_KEY, STORAGE_KEY, BLOCKS_SHARED_KEY, ...BLOCKS_LEGACY_KEYS], (data) => {
                if (chrome.runtime?.lastError) return;
                
                // Sync shared classes
                const chromeClasses = data[STORAGE_CLASSES_KEY];
                if (chromeClasses && Array.isArray(chromeClasses)) {
                    try { localStorage.setItem(STORAGE_CLASSES_KEY, JSON.stringify(chromeClasses)); } catch (e) {}
                    if (JSON.stringify(classes) !== JSON.stringify(chromeClasses)) {
                        classes = chromeClasses;
                        selectedId = classes.length ? classes[0].id : null;
                        try { renderSidebarList(); } catch (e) {}
                    }
                }
                
                // Sync periods for this timetable
                const chromePeriods = data[STORAGE_KEY];
                if (chromePeriods && typeof chromePeriods === 'object') {
                    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(chromePeriods)); } catch (e) {}
                    classPeriods = chromePeriods;
                }

                const chromeSharedBlocks = data[BLOCKS_SHARED_KEY];
                const chromeLegacyBlocks = BLOCKS_LEGACY_KEYS.map((key) => data[key]);
                const chromeBlocks = Array.isArray(chromeSharedBlocks) && chromeSharedBlocks.length
                    ? chromeSharedBlocks
                    : mergeBlockArrays(...chromeLegacyBlocks);
                if (Array.isArray(chromeBlocks) && chromeBlocks.length) {
                    try { localStorage.setItem(BLOCKS_SHARED_KEY, JSON.stringify(chromeBlocks)); } catch (e) {}
                    blocks = chromeBlocks;
                    renderSidebarList();
                    if (!Array.isArray(chromeSharedBlocks) || !chromeSharedBlocks.length) {
                        try {
                            if (typeof storageSet === 'function') storageSet(BLOCKS_SHARED_KEY, chromeBlocks);
                            else localStorage.setItem(BLOCKS_SHARED_KEY, JSON.stringify(chromeBlocks));
                        } catch (_) {}
                    }
                }
            });
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

        // Sync from chrome.storage.sync on startup
        syncClassesFromChrome();

        // Don't sync from chrome while editing - it can overwrite local changes
        // The edit menu works with locally loaded data only

        const overlay = document.createElement('div');
        overlay.className = 'mc-timetable-edit-overlay';

        const panel = document.createElement('div');
        panel.className = 'mc-edit-panel';

        // Left: classes list
        const left = document.createElement('div');
        left.className = 'mc-edit-list';

        const leftHeader = document.createElement('div');
        leftHeader.className = 'mc-edit-list-header';
        leftHeader.innerHTML = '<div class="mc-edit-list-title">Classes</div>';

        const addWrap = document.createElement('div');
        addWrap.className = 'mc-add-class-wrap';
        const addBtn = document.createElement('button');
        addBtn.className = 'mc-add-class-btn';
        addBtn.type = 'button';
        addBtn.textContent = '+';
        addBtn.title = 'Add new class';

        addWrap.appendChild(addBtn);
        leftHeader.appendChild(addWrap);
        left.appendChild(leftHeader);

        const list = document.createElement('div');
        list.className = 'mc-class-list';
        left.appendChild(list);

        const leftFooter = document.createElement('div');
        leftFooter.className = 'mc-edit-list-footer';
        const sidebarModeBtn = document.createElement('button');
        sidebarModeBtn.type = 'button';
        sidebarModeBtn.className = 'mc-sidebar-mode-btn';
        sidebarModeBtn.textContent = 'Blocks';
        leftFooter.appendChild(sidebarModeBtn);
        left.appendChild(leftFooter);

        // Right: edit form
        const right = document.createElement('div');
        right.className = 'mc-edit-form';

        const form = document.createElement('form');
        form.className = 'mc-edit-form-fields';
        form.addEventListener('submit', (e) => { e.preventDefault(); });

        // Top row: Colour + Title
        const topRow = document.createElement('div');
        topRow.className = 'mc-field-row mc-top-row';
        topRow.innerHTML = `
            <div class="mc-top-inputs">
                <div class="mc-colour-control">
                    <button type="button" class="mc-input-colour-trigger" aria-label="Choose class colour" aria-expanded="false" title="Choose class colour">
                        <span class="mc-input-colour-swatch" aria-hidden="true"></span>
                    </button>
                    <input name="colour" type="text" class="mc-input-colour mc-input-hidden" aria-hidden="true" tabindex="-1">
                    <div class="mc-inline-colour-picker" hidden>
                        <div class="mc-inline-colour-picker-header">
                            <div class="mc-inline-colour-picker-title">Class colour</div>
                            <button type="button" class="mc-inline-colour-picker-close" aria-label="Close colour picker">&times;</button>
                        </div>
                        <div class="mc-inline-colour-picker-sv-wrap">
                            <canvas class="mc-inline-colour-picker-sv" width="260" height="130" aria-hidden="true"></canvas>
                            <div class="mc-inline-colour-picker-marker" aria-hidden="true"></div>
                        </div>
                        <input type="range" min="0" max="360" value="0" class="mc-inline-colour-picker-hue" aria-label="Hue">
                        <div class="mc-inline-colour-picker-footer">
                            <div class="mc-inline-colour-picker-preview" aria-hidden="true"></div>
                            <input type="text" class="mc-inline-colour-picker-hex" placeholder="#9aa0a6" aria-label="Hex colour">
                        </div>
                    </div>
                </div>
                <input name="title" type="text" class="mc-input-title" placeholder="Title" aria-label="Title">
            </div>
        `;
        form.appendChild(topRow);

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
        form.appendChild(midRow);
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
                empty.textContent = 'No visible classrooms found. Visit the Classroom home page to refresh.';
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

        const periodsRow = document.createElement('div');
        periodsRow.className = 'mc-field-row mc-field-schedule';
        periodsRow.innerHTML = `
            <div class="mc-schedule-card">
                <div class="mc-schedule-header">
                    <div class="mc-schedule-title">Timetable</div>
                    <div class="mc-schedule-hint">Drag a class from the left - Click or drag a period to edit</div>
                </div>
                <div class="mc-schedule-board">
                    <div class="mc-schedule-time-axis" aria-hidden="true"></div>
                    <div class="mc-schedule-days" aria-label="Weekly schedule"></div>
                </div>
            </div>
            <div class="mc-periods-panel" hidden>
                <div class="mc-periods-panel-header">
                    <div class="mc-periods-panel-title">Periods</div>
                </div>
                <div class="mc-periods-list" aria-live="polite"></div>
            </div>
            <div class="mc-schedule-clear-wrap">
                <button type="button" class="mc-schedule-view-toggle-btn" aria-label="Show periods view">Show Periods</button>
                <button type="button" class="mc-schedule-import-btn" aria-label="Import periods">Import</button>
                <button type="button" class="mc-schedule-clear-btn" aria-label="Clear timetable">Clear Timetable</button>
            </div>
            <div class="mc-schedule-tune" hidden>
                <div class="mc-schedule-tune-row mc-schedule-tune-times">
                    <label>Start <input type="time" class="mc-tune-start"></label>
                    <label>End <input type="time" class="mc-tune-end"></label>
                </div>
                <div class="mc-schedule-tune-actions">
                    <button type="button" class="mc-tune-delete">Delete</button>
                </div>
            </div>
        `;
        form.appendChild(periodsRow);

        // Footer (close button only — delete is inline on the selected list item)
        const footer = document.createElement('div');
        footer.className = 'mc-edit-form-footer';
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'mc-close-edit-btn';
        closeBtn.innerHTML = '&times;';
        form.appendChild(footer);

        right.appendChild(form);

        panel.appendChild(left);
        panel.appendChild(right);
        panel.appendChild(closeBtn);

        const importOverlay = document.createElement('div');
        importOverlay.className = 'mc-import-overlay';
        importOverlay.innerHTML = `
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
        `;
        panel.appendChild(importOverlay);

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

        const importSourceSelect = importOverlay.querySelector('.mc-import-source');
        const importAllBtn = importOverlay.querySelector('.mc-import-all');
        const importNoneBtn = importOverlay.querySelector('.mc-import-none');
        const importDayButtons = Array.from(importOverlay.querySelectorAll('.mc-import-day'));
        const importCancelBtn = importOverlay.querySelector('.mc-import-cancel');
        const importConfirmBtn = importOverlay.querySelector('.mc-import-confirm');
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
        const inlineColourCanvasEl = form.querySelector('.mc-inline-colour-picker-sv');
        const inlineColourMarkerEl = form.querySelector('.mc-inline-colour-picker-marker');
        const inlineColourHueEl = form.querySelector('.mc-inline-colour-picker-hue');
        const inlineColourHexEl = form.querySelector('.mc-inline-colour-picker-hex');
        const inlineColourPreviewEl = form.querySelector('.mc-inline-colour-picker-preview');
        const inlineColourCloseEl = form.querySelector('.mc-inline-colour-picker-close');
        let selectedImportDays = new Set([0, 1, 2, 3, 4, 5, 6]);
        const scheduleCardEl = periodsRow.querySelector('.mc-schedule-card');
        const periodsPanelEl = periodsRow.querySelector('.mc-periods-panel');
        const periodsListEl = periodsRow.querySelector('.mc-periods-list');
        const scheduleBoardEl = periodsRow.querySelector('.mc-schedule-board');
        const scheduleAxisEl = periodsRow.querySelector('.mc-schedule-time-axis');
        const scheduleDaysEl = periodsRow.querySelector('.mc-schedule-days');
        const scheduleClearBtn = periodsRow.querySelector('.mc-schedule-clear-btn');
        const scheduleViewToggleBtn = periodsRow.querySelector('.mc-schedule-view-toggle-btn');
        const scheduleImportBtn = periodsRow.querySelector('.mc-schedule-import-btn');
        const scheduleTuneEl = periodsRow.querySelector('.mc-schedule-tune');
        const tuneStartEl = periodsRow.querySelector('.mc-tune-start');
        const tuneEndEl = periodsRow.querySelector('.mc-tune-end');
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
        let blockEditorState = null;
        let blockEditorDraggedClassId = null;
        let blockEditorDragState = null;
        let blockEditorResizeState = null;
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
            root.innerHTML = `
                <div class="mc-schedule-time-group">
                    <input type="text" class="mc-schedule-time-part mc-schedule-time-hour" inputmode="numeric" maxlength="2" autocomplete="off" spellcheck="false" aria-label="${ariaLabel} hour" value="${parts.hour}">
                    <span class="mc-schedule-time-separator" aria-hidden="true">:</span>
                    <input type="text" class="mc-schedule-time-part mc-schedule-time-minute" inputmode="numeric" maxlength="2" autocomplete="off" spellcheck="false" aria-label="${ariaLabel} minute" value="${parts.minute}">
                    <button type="button" class="mc-schedule-time-part mc-schedule-time-meridiem" aria-label="${ariaLabel} am or pm" aria-pressed="${parts.meridiem === 'pm' ? 'true' : 'false'}">${parts.meridiem}</button>
                </div>
            `;
            const hourInput = root.querySelector('.mc-schedule-time-hour');
            const minuteInput = root.querySelector('.mc-schedule-time-minute');
            const meridiemInput = root.querySelector('.mc-schedule-time-meridiem');
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
            scheduleViewMode = mode === 'periods' ? 'periods' : 'timetable';
            const inPeriodsView = scheduleViewMode === 'periods';
            if (scheduleCardEl) scheduleCardEl.hidden = inPeriodsView;
            if (periodsPanelEl) periodsPanelEl.hidden = !inPeriodsView;
            if (periodsRow) {
                periodsRow.classList.toggle('mc-periods-view', inPeriodsView);
                periodsRow.classList.toggle('mc-timetable-view', !inPeriodsView);
            }
            if (scheduleViewToggleBtn) {
                scheduleViewToggleBtn.textContent = inPeriodsView ? 'Show Timetable' : 'Show Periods';
                scheduleViewToggleBtn.setAttribute('aria-label', inPeriodsView ? 'Show timetable view' : 'Show periods view');
            }
            hideTunePanel();
            if (!inPeriodsView) {
                if (scheduleCardEl) scheduleCardEl.hidden = false;
                if (periodsPanelEl) periodsPanelEl.hidden = true;
                window.requestAnimationFrame(() => {
                    if (scheduleViewMode !== 'timetable') return;
                    renderPeriodsList(classById(selectedId));
                });
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
            renderSidebarList();
            try { renderPeriodsOnTimetable(); } catch (_) {}
            try { updateTimetableIndicator(); } catch (_) {}
            try { updateLiveWidget(); } catch (_) {}
        }

        function updatePeriodTimesInTimetable(classId, periodId, start, end) {
            const targetClass = classById(classId);
            if (!targetClass) return;
            if (!start || !end) return;
            if (parseTimeToMinutes(start) >= parseTimeToMinutes(end)) return;

            const next = normalizePeriods(classPeriods[targetClass.id] || []);
            const idx = next.findIndex((p) => p.id === periodId);
            if (idx === -1) return;

            next[idx] = Object.assign({}, next[idx], { start, end });
            classPeriods[targetClass.id] = next;
            targetClass.periods = next;

            savePeriods(classPeriods);
            renderPeriodsList(classById(selectedId));
            renderSidebarList();
            try { renderPeriodsOnTimetable(); } catch (_) {}
            try { updateTimetableIndicator(); } catch (_) {}
            try { updateLiveWidget(); } catch (_) {}
        }

        function renderAllPeriodsView() {
            if (!periodsListEl) return;
            detachActiveInlinePeriodEditorListeners();
            periodsListEl.innerHTML = '';
            const entries = collectAllPeriodsForCurrentTimetable();
            if (!entries.length) {
                const empty = document.createElement('div');
                empty.className = 'mc-periods-empty';
                empty.textContent = 'No periods yet in this timetable.';
                periodsListEl.appendChild(empty);
                return;
            }

            const groupedByDay = new Map();
            entries.forEach((entry) => {
                const day = Number(entry.day) || 0;
                if (!groupedByDay.has(day)) groupedByDay.set(day, []);
                groupedByDay.get(day).push(entry);
            });

            Array.from(groupedByDay.keys()).sort((a, b) => a - b).forEach((day) => {
                const section = document.createElement('section');
                section.className = 'mc-periods-day-section';

                const header = document.createElement('div');
                header.className = 'mc-periods-day-header';
                header.textContent = dayNames[day] || 'Sun';
                section.appendChild(header);

                const grid = document.createElement('div');
                grid.className = 'mc-periods-day-grid';

                groupedByDay.get(day).forEach((entry) => {
                    const item = document.createElement('div');
                    item.className = 'mc-periods-item';

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
                    timeEl.textContent = `${formatTimeToAmPm(entry.start)} - ${formatTimeToAmPm(entry.end)}`;
                    meta.appendChild(titleEl);
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

                    const endInput = document.createElement('input');
                    endInput.type = 'time';
                    endInput.className = 'mc-periods-item-editor-end';
                    endInput.value = entry.end;

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
                        updatePeriodTimesInTimetable(entry.classId, entry.periodId, startVal, endVal);
                    });

                    actions.appendChild(editBtn);
                    actions.appendChild(deleteBtn);

                    topRow.appendChild(swatch);
                    topRow.appendChild(meta);
                    topRow.appendChild(actions);

                    editor.appendChild(startInput);
                    editor.appendChild(endInput);
                    editor.appendChild(saveBtn);

                    item.appendChild(topRow);
                    item.appendChild(editor);
                    grid.appendChild(item);
                });

                section.appendChild(grid);
                periodsListEl.appendChild(section);
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
            const titleEl = leftHeader.querySelector('.mc-edit-list-title');
            if (titleEl) titleEl.textContent = sidebarMode === 'blocks' ? 'Blocks' : 'Classes';
            addBtn.title = sidebarMode === 'blocks' ? 'Add new block' : 'Add new class';
            sidebarModeBtn.textContent = sidebarMode === 'blocks' ? 'Classes' : 'Blocks';
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
            el.dataset.badgeClamped = placement.topPct <= 13.8889 ? 'top' : '';
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
                empty.textContent = 'No periods yet in this block.';
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

            const header = document.createElement('div');
            header.className = 'mc-periods-day-header';
            header.textContent = blockEditorState.name || 'Current block';
            section.appendChild(header);

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
            blockEditorResizeState = { pointerId: ev.pointerId, itemId: item.id, el, edge, startMin, endMin };
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
            const rawRatio = (ev.clientY - rect.top) / Math.max(1, rect.height);
            const pointerMin = snapMinutes(vrLocal.startMin + (Math.max(0, Math.min(1, rawRatio)) * total), 5);
            let nextStart = parseTimeToMinutes(item.start);
            let nextEnd = parseTimeToMinutes(item.end);
            if (blockEditorResizeState.edge === 'start') nextStart = Math.max(vrLocal.startMin, Math.min(pointerMin, nextEnd - 5));
            else nextEnd = Math.min(vrLocal.endMin, Math.max(pointerMin, nextStart + 5));
            item.start = minutesToTimeString(nextStart);
            item.end = minutesToTimeString(nextEnd);
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

        function getPlacementFromDayBodyPointer(dayBody, clientY, durationMin) {
            if (!dayBody) return null;
            const rect = dayBody.getBoundingClientRect();
            const vrLocal = getViewRange();
            const total = Math.max(1, vrLocal.endMin - vrLocal.startMin);
            const rawRatio = (clientY - rect.top) / Math.max(1, rect.height);
            const centeredRatio = rawRatio - ((durationMin || 0) / total) / 2;
            const startMin = vrLocal.startMin + (Math.max(0, Math.min(1, centeredRatio)) * total);
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
            block.dataset.badgeClamped = placement.topPct <= 13.8889 ? 'top' : '';
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
                const alreadyFocused = !!focusedPeriod
                    && focusedPeriod.classId === dragState.classId
                    && focusedPeriod.periodId === dragState.periodId;
                selectClassById(dragState.classId);
                focusSchedulePeriod(dragState.classId, dragState.periodId);
                if (alreadyFocused) {
                    const targetBlock = periodsRow.querySelector(`.mc-schedule-block[data-class-id="${dragState.classId}"][data-period-id="${dragState.periodId}"]`);
                    if (targetBlock) {
                        openTunePanel(dragState.classId, dragState.periodId, targetBlock);
                    }
                } else {
                    hideTunePanel();
                }
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
                if (!currentState.hasMoved && ((distanceX * distanceX) + (distanceY * distanceY) >= 16)) {
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

                const placement = getPlacementFromDayBodyPointer(dayBody, clientY, currentState.durationMin);
                if (!placement) return;
                currentState.currentPlacement = placement;
                applyScheduleBlockPlacement(currentState.block, placement, currentState.backgroundColor);
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
            hideTunePanel();
            finishScheduleBlockDrag({ cancelled: true });

            const originPlacement = computeSchedulePlacement(p.day, startMin, endMin - startMin);
            scheduleDragState = {
                pointerId: ev.pointerId,
                block,
                classId: cls.id,
                periodId: p.id,
                durationMin: endMin - startMin,
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
        }

        function updateResizePreview(block, placement) {
            if (!scheduleResizeState || !block || !placement) return;
            applyScheduleBlockPlacement(block, placement, scheduleResizeState.backgroundColor);
            block.classList.add('mc-schedule-block-resizing');
            syncActiveTuneInputs(placement, scheduleResizeState.activeTuneSnapshot);
        }

        function handleScheduleResizePointerMove(ev) {
            const resizeState = scheduleResizeState;
            if (!resizeState) return;
            const dayBody = resizeState.block.parentElement;
            if (!dayBody) return;
            const rect = dayBody.getBoundingClientRect();
            const vrLocal = getViewRange();
            const total = Math.max(1, vrLocal.endMin - vrLocal.startMin);
            const rawRatio = (ev.clientY - rect.top) / Math.max(1, rect.height);
            const pointerMin = snapMinutes(vrLocal.startMin + (Math.max(0, Math.min(1, rawRatio)) * total), 5);

            let nextStart = resizeState.originPlacement.startMin;
            let nextEnd = resizeState.originPlacement.endMin;
            if (resizeState.edge === 'start') {
                nextStart = Math.max(vrLocal.startMin, Math.min(pointerMin, nextEnd - 5));
            } else {
                nextEnd = Math.min(vrLocal.endMin, Math.max(pointerMin, nextStart + 5));
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
                setTimeout(() => {
                    const block = findScheduleBlock(resizeState.classId, resizeState.periodId);
                    if (block) openTunePanel(resizeState.classId, resizeState.periodId, block);
                }, 0);
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
            scheduleTuneEl.hidden = false;

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
            syncActiveTuneBlock();
        }

        function persistActiveTuneChanges() {
            if (!activeTune) return;
            const tuneState = { classId: activeTune.classId, periodId: activeTune.periodId };
            const targetClass = classById(activeTune.classId);
            if (!targetClass) return;
            const startVal = tuneStartEl ? tuneStartEl.value : '';
            const endVal = tuneEndEl ? tuneEndEl.value : '';
            if (!startVal || !endVal) return;
            if (parseTimeToMinutes(startVal) >= parseTimeToMinutes(endVal)) return;

            const next = normalizePeriods(classPeriods[targetClass.id] || []);
            const idx = next.findIndex(x => x.id === activeTune.periodId);
            if (idx === -1) return;
            next[idx] = Object.assign({}, next[idx], { start: startVal, end: endVal });
            classPeriods[targetClass.id] = next;
            targetClass.periods = next;
            saveAndRender();
            setTimeout(() => {
                const targetBlock = periodsRow.querySelector(`.mc-schedule-block[data-class-id="${tuneState.classId}"][data-period-id="${tuneState.periodId}"]`);
                if (targetBlock) {
                    openTunePanel(tuneState.classId, tuneState.periodId, targetBlock);
                }
            }, 0);
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

        function openImportOverlay() {
            importOverlay.classList.add('visible');
            overlay.classList.add('mc-import-open');
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
            importOverlay.classList.remove('visible');
            overlay.classList.remove('mc-import-open');
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

        if (scheduleImportBtn) {
            scheduleImportBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openImportOverlay();
            });
        }
        importOverlay.addEventListener('click', (e) => {
            if (e.target === importOverlay) {
                closeImportOverlay();
            }
        });
        const importPanelEl = importOverlay.querySelector('.mc-import-panel');
        if (importPanelEl) {
            importPanelEl.addEventListener('click', (e) => e.stopPropagation());
        }
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
        if (blockTuneStartEl) blockTuneStartEl.addEventListener('change', persistBlockTuneChanges);
        if (blockTuneEndEl) blockTuneEndEl.addEventListener('change', persistBlockTuneChanges);
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
        function renderSidebarList() {
            updateSidebarModeUi();
            list.innerHTML = '';
            if (sidebarMode === 'blocks') {
                blocks.forEach((block) => {
                    const item = document.createElement('div');
                    item.className = 'mc-class-item mc-block-item';
                    if (selectedBlockId === block.id) item.classList.add('selected');
                    item.dataset.id = block.id;
                    item.draggable = true;
                    item.innerHTML = `<span class="mc-class-dot mc-block-dot"></span><span class="mc-class-label">${escapeHtml(block.name || 'Untitled block')}</span>`;
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
                    if (selectedBlockId === block.id) {
                        const itemDelBtn = document.createElement('button');
                        itemDelBtn.type = 'button';
                        itemDelBtn.className = 'mc-delete-class-btn';
                        itemDelBtn.title = 'Delete block';
                        itemDelBtn.setAttribute('aria-label', 'Delete block');
                        itemDelBtn.innerHTML = `<img src="${trashIconUrl}" class="mc-delete-class-icon" alt="" aria-hidden="true">`;
                        itemDelBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            if (!selectedBlockId) return;
                            if (!confirm('Delete this block?')) return;
                            if (blockEditorState && blockEditorState.id === selectedBlockId) {
                                closeBlockEditor();
                            }
                            blocks = blocks.filter(x => x.id !== selectedBlockId);
                            const nextSelectedBlock = blocks.length ? blocks[0].id : null;
                            selectedBlockId = nextSelectedBlock;
                            saveBlocks(blocks);
                            renderSidebarList();
                        });
                        item.appendChild(itemDelBtn);
                    }
                    item.addEventListener('click', () => {
                        selectedBlockId = block.id;
                        openBlockEditor(block);
                        renderSidebarList();
                    });
                    list.appendChild(item);
                });
                return;
            }

            classes.forEach(c => {
                const item = document.createElement('div');
                item.className = 'mc-class-item';
                if (selectedId === c.id) item.classList.add('selected');
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
                    const targets = periodsRow.querySelectorAll('.mc-drop-target');
                    targets.forEach(target => target.classList.remove('mc-drop-target'));
                });

                item.appendChild(dot);
                item.appendChild(label);

                // Trash icon on the selected item
                if (selectedId === c.id) {
                    const itemDelBtn = document.createElement('button');
                    itemDelBtn.type = 'button';
                    itemDelBtn.className = 'mc-delete-class-btn';
                    itemDelBtn.title = 'Delete class';
                    itemDelBtn.setAttribute('aria-label', 'Delete class');
                    itemDelBtn.innerHTML = `<img src="${trashIconUrl}" class="mc-delete-class-icon" alt="" aria-hidden="true">`;
                    itemDelBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (!selectedId) return;
                        if (!confirm('Delete this class?')) return;
                        classes = classes.filter(x => x.id !== selectedId);
                        saveClasses(classes);
                        selectedId = classes.length ? classes[0].id : null;
                        renderSidebarList();
                        renderEditFormFor(classes.find(x => x.id === selectedId));
                    });
                    item.appendChild(itemDelBtn);
                }

                item.addEventListener('click', () => selectClassById(c.id));
                list.appendChild(item);
            });

            if (!classes.length) {
                selectedId = null;
                renderEditFormFor(null);
            }
        }

        function selectClassById(id) {
            selectedId = id;
            renderSidebarList();
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
            if (!c) {
                right.classList.add('mc-edit-form-empty');
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

        // Add class behaviour
        addBtn.addEventListener('click', () => {
            // Create a new unnamed class directly
            if (sidebarMode === 'blocks') {
                openBlockEditor();
                return;
            }
            const newClass = {
                id: generateId(),
                title: '',
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
            renderSidebarList();
            renderEditFormFor(newClass);
            setTimeout(() => {
                const titleInput = form.querySelector('.mc-input-title');
                if (titleInput) titleInput.focus();
            }, 0);
        });

        // Visual schedule functionality
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
            hideTunePanel();
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

        if (tuneStartEl) tuneStartEl.addEventListener('change', persistActiveTuneChanges);
        if (tuneEndEl) tuneEndEl.addEventListener('change', persistActiveTuneChanges);

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

        if (scheduleViewToggleBtn) {
            setScheduleViewMode('timetable');
            scheduleViewToggleBtn.addEventListener('click', () => {
                setScheduleViewMode(scheduleViewMode === 'timetable' ? 'periods' : 'timetable');
                if (scheduleViewMode === 'periods') {
                    renderAllPeriodsView();
                }
            });
        }

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
            if (!overlay.contains(e.target)) return;
            if (inlineColourPickerEl && !inlineColourPickerEl.hidden) {
                const clickedInsidePicker = inlineColourPickerEl.contains(e.target);
                const clickedTrigger = colourTriggerEl && colourTriggerEl.contains(e.target);
                if (!clickedInsidePicker && !clickedTrigger) {
                    hideInlineColourPicker();
                }
            }
        });

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
                if (!selectedId) return;
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

        sidebarModeBtn.addEventListener('click', () => {
            sidebarMode = sidebarMode === 'blocks' ? 'classes' : 'blocks';
            resetClearTimetableButton();
            renderSidebarList();
        });


        closeBtn.addEventListener('click', () => {
            hideClassroomDropdown();
            closeImportOverlay();
            hideTunePanel();
            overlay.remove();
        });

        // Close on overlay click outside panel
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
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

        // Apply initial sizing so position can be calculated
        container.style.visibility = 'hidden';
        container.style.display = 'block';
        // use fixed positioning so the panel stays put during scroll
        container.style.position = 'fixed';
        container.style.zIndex = 1000000;

        positionTimetableMenu(container, anchor);
        container.style.visibility = '';

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
        if (mcTimetable.container.parentElement) mcTimetable.container.parentElement.removeChild(mcTimetable.container);
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
        if (e.target.closest('.mc-timetable') || e.target.closest('.mc-left-action-btn')) return;
        hideTimetableMenu();
    }

    function onDocumentKeydownForTimetable(e) {
        if (e.key === 'Escape') hideTimetableMenu();
    }

    // Update indicator on resize/scroll too
    window.addEventListener('resize', () => { if (mcTimetable.container) { updateTimetableIndicator(); renderPeriodsOnTimetable(); } });
    window.addEventListener('scroll', () => { if (mcTimetable.container) { updateTimetableIndicator(); renderPeriodsOnTimetable(); } });

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

    // Sync timetable data from chrome.storage.sync to localStorage
    function syncTimetableFromChrome() {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) return;
        
        const classesKey = 'mcTimetableClassesShared';
        const periodsKey = 'mcTimetableClasses_' + mcTimetable.currentTimetableIndex;
        const viewRangeKey = 'mcTimetableViewRange';
        
        chrome.storage.sync.get([classesKey, periodsKey, viewRangeKey], (result) => {
            if (chrome.runtime.lastError) return;
            
            // Sync classes
            if (result[classesKey] && Array.isArray(result[classesKey])) {
                try {
                    localStorage.setItem(classesKey, JSON.stringify(result[classesKey]));
                } catch (e) {}
            }
            
            // Sync periods
            if (result[periodsKey] && typeof result[periodsKey] === 'object') {
                try {
                    localStorage.setItem(periodsKey, JSON.stringify(result[periodsKey]));
                } catch (e) {}
            }
            
            // Sync view range
            if (result[viewRangeKey] && typeof result[viewRangeKey] === 'object') {
                try {
                    localStorage.setItem(viewRangeKey, JSON.stringify(result[viewRangeKey]));
                } catch (e) {}
            }

            // Manual refresh is now triggered only by clicking outside the notes panel.
            
            // Re-render the timetable if it's visible
            try {
                if (mcTimetable.container && mcTimetable.container.classList.contains('visible')) {
                    renderPeriodsOnTimetable();
                }
            } catch (e) {}
        });
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
        console.debug('scheduleHidePeriodDetail', ms);
        if (mcPeriodDetailHideTimeout) clearTimeout(mcPeriodDetailHideTimeout);
        mcPeriodDetailHideTimeout = setTimeout(hidePeriodDetailCard, ms || 200);
    }
    function cancelHidePeriodDetail() {
        if (mcPeriodDetailHideTimeout) { clearTimeout(mcPeriodDetailHideTimeout); mcPeriodDetailHideTimeout = null; }
    }

    function showPeriodDetailCard(targetEl, cls, period, mouseEvent) {
        console.debug('showPeriodDetailCard called', cls && cls.title, period && (period.start + '-' + period.end));
        // Create/update a persistent card that remains while hovered
        hidePeriodDetailCard();
        const card = document.createElement('div');
        card.className = 'mc-period-detail-card';
        const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        const dayName = dayNames[(period.day||0)];
        const metaParts = [];
        if (cls.teacher) metaParts.push(escapeHtml(cls.teacher));
        if (cls.room) metaParts.push(escapeHtml(cls.room));

        const startFancy = formatTimeToAmPm(period.start || '--:--');
        const endFancy = formatTimeToAmPm(period.end || '--:--');

        card.innerHTML = `
            <div class="mc-card-swatch" style="background:${escapeHtml(cls.colour || '#9aa0a6')}"></div>
            <div class="mc-card-content">
                <div class="mc-card-title">${escapeHtml(cls.title || '')}</div>
                ${metaParts.length? `<div class="mc-card-meta">${metaParts.join(' • ')}</div>`: ''}
                <div class="mc-card-period">${escapeHtml(dayName)} • ${escapeHtml(startFancy)} — ${escapeHtml(endFancy)}</div>
            </div>
        `;

        document.body.appendChild(card);
        mcPeriodDetailEl = card;

        // Allow interactions: keep card visible while the mouse is over it
        card.addEventListener('mouseenter', () => { cancelHidePeriodDetail(); });
        card.addEventListener('mouseleave', () => { scheduleHidePeriodDetail(150); });

        // Position card near the cursor if we have a mouseEvent, otherwise to the right of timetable
        const blockRect = targetEl.getBoundingClientRect();
        const containerRect = mcTimetable.container.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();

        let left, top;
        if (mouseEvent && typeof mouseEvent.clientX === 'number') {
            // Prefer to the right of cursor; if not enough space, place to left
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

        console.debug('placedPeriodDetail', { left: Math.round(left), top: Math.round(top), width: cardRect.width, height: cardRect.height });
    }

    function hidePeriodDetailCard() {
        cancelHidePeriodDetail();
        try { if (mcPeriodDetailMoveHandler) { window.removeEventListener('mousemove', mcPeriodDetailMoveHandler); mcPeriodDetailMoveHandler = null; } } catch (_) {}
        if (mcPeriodDetailEl && mcPeriodDetailEl.parentElement) mcPeriodDetailEl.parentElement.removeChild(mcPeriodDetailEl);
        mcPeriodDetailEl = null;
    }

    function escapeHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function renderPeriodsOnTimetable() {
        const container = mcTimetable.container;
        if (!container || !document.body.contains(container)) return;

        // Remove existing blocks
        container.querySelectorAll('.mc-period-block').forEach(el => el.remove());

        const classes = getStoredClasses();
        if (!classes || !classes.length) return;

        // Collect blocks per day so we can compute overlaps and split columns
        const dayBuckets = {};

        classes.forEach(cls => {
            (cls.periods || []).forEach(period => {
                // Basic sanity checks
                if (!period || typeof period.day === 'undefined' || !period.start || !period.end) return;
                const dayIndex = period.day || 0;
                const dayTimeline = container.querySelector('.mc-timetable-timeline[data-day="' + (dayIndex) + '"]');
                if (!dayTimeline) return;

                const timelineHeight = dayTimeline.offsetHeight;

                function toMinutes(t) {
                    if (!t) return 0;
                    const parts = String(t).split(':');
                    const h = parseInt(parts[0],10); const m = parseInt(parts[1],10);
                    if (isNaN(h) || isNaN(m)) return 0;
                    return h*60 + m;
                }

                const startMin = toMinutes(period.start);
                const endMin = toMinutes(period.end);
                if (endMin <= startMin) return;

                // Use the configured view range, clamp and scale within it
                const view = getViewRange();
                const viewStart = view.startMin;
                const viewEnd = view.endMin;
                if (viewEnd <= viewStart) return;

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

                console.debug('created period block', cls.id, period.id, top, height);

                block.addEventListener('mouseenter', (e) => {
                    console.debug('period block mouseenter', cls && cls.id, period && period.id);
                    cancelHidePeriodDetail();
                    // Pass the mouse event so the detail card can position next to the cursor
                    showPeriodDetailCard(block, cls, period, e);
                });
                block.addEventListener('mouseleave', (e) => { console.debug('period block mouseleave', cls && cls.id, period && period.id); scheduleHidePeriodDetail(200); });

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
                const columnWidth = (colCount === 1) ? timelineWidth : Math.max(6, Math.floor((timelineWidth - (colCount - 1) * gap) / colCount));

                comp.forEach(item => {
                    const col = item.colIndex || 0;
                    const leftPx = Math.round(col * (columnWidth + gap));
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
            let savedHeightAdjust = 312;
            try {
                if (typeof window !== 'undefined' && Number.isFinite(window.__mgcSidebarHeightAdjust)) {
                    savedHeightAdjust = window.__mgcSidebarHeightAdjust;
                } else {
                    const raw = localStorage.getItem('sidebarHeightAdjust');
                    if (raw !== null) savedHeightAdjust = parseInt(raw, 10);
                }
            } catch (_) {}
            if (!Number.isFinite(savedHeightAdjust)) savedHeightAdjust = 312;

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
    }

    function hideSidebar() {
        if (sidebarForceVisible) return;

        if (sidebar) {
            sidebar.classList.remove('sidebar-visible');
            if (sidebarHotspot) {
                sidebarHotspot.classList.remove('sidebar-hide-indicator');
            }
        }
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
        return new Promise(async (resolve) => {
            // For cross-device sync: try chrome.storage.sync first (works for published extensions)
            // Fall back to localStorage for unpacked extensions and offline reliability
            const isIconMapKey = key.includes(':icons');
            let syncVal = null;
            try {
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
                    syncVal = await syncStorageGet(key);
                    if (syncVal !== undefined && syncVal !== null) {
                        // Icon maps in sync intentionally exclude data URLs, so avoid clobbering
                        // local custom icon mappings. Merge local+sync and prefer local values.
                        if (isIconMapKey && typeof syncVal === 'object' && syncVal !== null) {
                            let localVal = null;
                            try {
                                const localRaw = localStorage.getItem(key);
                                if (localRaw !== null) {
                                    localVal = JSON.parse(localRaw);
                                }
                            } catch (_) {}
                            if (localVal && typeof localVal === 'object') {
                                const merged = { ...syncVal, ...localVal };
                                try { localStorage.setItem(key, JSON.stringify(merged)); } catch (_) {}
                                resolve(merged);
                                return;
                            }
                        }
                        // Found in sync — also cache to localStorage for fast offline access
                        try { localStorage.setItem(key, JSON.stringify(syncVal)); } catch (_) {}
                        resolve(syncVal);
                        return;
                    }
                }
            } catch (_) {}
            
            // localStorage is the fallback — persists across extension reinstalls 
            // and works for unpacked extensions where sync isn't available
            try {
                const raw = localStorage.getItem(key);
                if (raw !== null) {
                    const parsed = JSON.parse(raw);
                    // If we have local data but sync didn't, populate sync for future syncing
                    if (syncVal === null || syncVal === undefined) {
                        try {
                            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
                                syncStorageSet(key, parsed).catch(() => {});
                            }
                        } catch (_) {}
                    }
                    resolve(parsed);
                    return;
                }
            } catch (_) {}
            
            // Last resort: try chrome.storage.local 
            try {
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.get([key], (res) => {
                        const val = res[key];
                        if (val !== undefined && val !== null) {
                            // Re-populate localStorage and sync
                            try { localStorage.setItem(key, JSON.stringify(val)); } catch (_) {}
                            try { syncStorageSet(key, val).catch(() => {}); } catch (_) {}
                            resolve(val);
                        } else {
                            resolve(null);
                        }
                    });
                    return;
                }
            } catch (_) {}
            resolve(null);
        });
    }
    function storageSet(key, value) {
        return new Promise((resolve) => {
            const str = JSON.stringify(value);
            let syncCompleted = false;
            let chromeCompleted = false;
            let localStorageCompleted = false;

            function checkComplete() {
                if (syncCompleted && chromeCompleted && localStorageCompleted) {
                    resolve();
                }
            }

            // Always try to set localStorage first (immediate, works offline)
            try {
                localStorage.setItem(key, str);
                localStorageCompleted = true;
            } catch (e) {
                console.warn('localStorage.setItem failed:', e);
                localStorageCompleted = true; // Mark as done even on failure
            }

            // Write to chrome.storage.sync for cross-device sync (published extensions only)
            // Filter out large data URLs from icon maps to avoid hitting sync quota limits
            try {
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
                    let syncValue = value;
                    // If this is an icon map (key ends with ':icons'), filter out data URLs
                    if (key.includes(':icons') && typeof value === 'object' && value !== null) {
                        syncValue = {};
                        for (const [k, v] of Object.entries(value)) {
                            if (!v || !v.startsWith || !v.startsWith('data:')) {
                                syncValue[k] = v;
                            }
                        }
                    }
                    chrome.storage.sync.set({ [key]: syncValue }, function() {
                        if (chrome.runtime?.lastError) {
                            // This will fail for unpacked extensions - that's expected
                            console.debug('chrome.storage.sync.set info:', chrome.runtime.lastError.message);
                        }
                        syncCompleted = true;
                        checkComplete();
                    });
                } else {
                    syncCompleted = true;
                }
            } catch (err) {
                console.debug('chrome.storage.sync.set error:', err);
                syncCompleted = true;
            }

            // Also write to chrome.storage.local as secondary cache
            try {
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.set({ [key]: value }, function() {
                        if (chrome.runtime?.lastError) {
                            console.warn('chrome.storage.local.set failed:', chrome.runtime.lastError);
                        }
                        chromeCompleted = true;
                        checkComplete();
                    });
                } else {
                    chromeCompleted = true;
                }
            } catch (err) {
                console.warn('chrome.storage.local.set error:', err);
                chromeCompleted = true;
            }

            checkComplete();
        });
    }
    function syncStorageGet(key) {
        return new Promise((resolve) => {
            try {
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
                    chrome.storage.sync.get([key], (res) => {
                        if (chrome.runtime.lastError) {
                            console.warn('syncStorageGet error:', chrome.runtime.lastError);
                            resolve(null);
                            return;
                        }
                        resolve(res[key]);
                    });
                    return;
                }
            } catch (_) {}
            resolve(null);
        });
    }
    function syncStorageSet(key, value) {
        return new Promise((resolve) => {
            try {
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
                    chrome.storage.sync.set({ [key]: value }, () => {
                        if (chrome.runtime.lastError) {
                            console.warn('syncStorageSet error:', chrome.runtime.lastError);
                        }
                        resolve();
                    });
                    return;
                }
            } catch (_) {}
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
    async function persistColorForElement(el, hex) {
        const key = pageStorageKey();
        const map = (await storageGet(key)) || {};
        const stableKey = computeStableKey(el);
        map[stableKey] = hex;
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
        const key = pageStorageKey() + ':icons';
        const map = (await storageGet(key)) || {};
        const stableKey = computeStableKey(el);
        const portable = toRelativeIconPath(iconUrl);
        map[stableKey] = portable;
        await storageSet(key, map);
        try {
            const stored = (await storageGet(key)) || {};
            if (stored[stableKey] !== portable) {
                await storageSet(key, map);
            }
        } catch (_) {}
    }
    async function restoreSavedColors(root = document) {
        const key = pageStorageKey();
        const map = (await storageGet(key)) || {};
        const iconKey = key + ':icons';
        const iconMap = (await storageGet(iconKey)) || {};

        try {
            const nodes = (root.querySelectorAll ? root.querySelectorAll('.kWQ5wd') : []);
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
                const icon = iconMap[k];
                if (icon) {
                    const resolvedIcon = resolveIconUrl(icon);
                    el.style.setProperty('--dna-icon-url', `url("${resolvedIcon}")`);
                }
            });
        } catch (_) {}

        for (const [savedKey, hex] of Object.entries(map)) {
            if (/[#.>:\[]/.test(savedKey) && typeof hex === 'string') {
                try {
                    const el = root.querySelector(savedKey);
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
            elementAwaitingColor = null;
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

    function openPickerForElement(targetElement, event) {
        if (!targetElement) return;
        if (event) {
            event.preventDefault();
            event.stopPropagation();
            if (event.stopImmediatePropagation) {
                event.stopImmediatePropagation();
            }
        }

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

    function attachIconPickersInDom(root = document) {
        const elements = root.querySelectorAll('.kWQ5wd');
        elements.forEach((el) => {
            if (el.dataset.dnaPickerAttached === '1') return;
            el.dataset.dnaPickerAttached = '1';
            el.addEventListener('dblclick', (e) => {
                console.debug('[Modern Classroom] dblclick on .kWQ5wd');
                openPickerForElement(el, e);
            }, true);
            el.addEventListener('click', (e) => {
                if (e.detail === 2) {
                    console.debug('[Modern Classroom] click detail=2 on .kWQ5wd');
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
        document.addEventListener('dblclick', function onDblClick(event) {
            const targetElement = event.target.closest('.kWQ5wd');
            if (targetElement) {
                openPickerForElement(targetElement, event);
            }
        }, true);
        document.addEventListener('click', function onClick(event) {
            if (event.detail !== 2) return;
            const targetElement = event.target.closest('.kWQ5wd');
            if (targetElement) {
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

        const style = document.createElement('style');
        style.textContent = `
            .picker { pointer-events: auto; box-sizing: border-box; position: absolute; width: 380px; padding: 10px; border-radius: 40px;corner-shape: squircle;background: #212126; color: #fff; box-shadow: 0 10px 30px rgba(0,0,0,.35); font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; border: 1.5px solid rgba(43, 45, 63, 0.421) !important; }
            .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
            .title { font-size: 13px; opacity: .8; }
            .close { background: transparent; border: 0; color: #fff; cursor: pointer; font-size: 26px; line-height: 1; opacity: .8; margin-right: 8px;}
            .close:hover { opacity: 1; }
            .wheel { position: relative; display: block; width: 100%; height: 160px; margin: 6px 0; cursor: crosshair; border-radius: 20px; corner-shape: squircle; overflow: hidden; }
            .marker { position: absolute; width: 12px; height: 12px; border: 2px solid #fff; border-radius: 50%; transform: translate(-50%, -50%); box-shadow: 0 0 0 1px rgba(0,0,0,.6); pointer-events:none; }
            .row { display:flex; align-items:center; gap:8px; padding: 6px 0 2px; width: 100%; margin: 0; }
            .preview { width: 28px; height: 20px; border-radius: 4px; border: 1px solid rgba(255,255,255,.2); }
            .hex-input { width: 100%; box-sizing: border-box; padding: 6px 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); background: transparent; color: inherit; margin: 6px 0; font-family: inherit; }
            .hex-input::placeholder { color: rgba(255,255,255,0.35); }
            .hex-input-inline { width: 120px; margin-right: 8px; margin-left: 6px; padding: 4px 8px; height: 28px; font-size: 12px; border-radius: 6px; }
            input[type="range"] { width: 100%; -webkit-appearance: none; appearance: none; height: 10px; border-radius: 6px; background: linear-gradient(90deg, hsl(0,100%,50%) 0%, hsl(60,100%,50%) 16.66%, hsl(120,100%,50%) 33.33%, hsl(180,100%,50%) 50%, hsl(240,100%,50%) 66.66%, hsl(300,100%,50%) 83.33%, hsl(360,100%,50%) 100%); outline: none; }
            input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 2px rgba(0,0,0,0.14); border: 0; margin-top: -2px; }
            input[type="range"]::-moz-range-thumb { width: 14px; height: 14px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 2px rgba(0,0,0,0.14); border: 0; }
            input[type="range"]::-ms-thumb { width: 14px; height: 14px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 2px rgba(0,0,0,0.14); border: 0; }
            .footer { display:flex; justify-content: flex-end; gap: 6px; margin-top: 6px; }
            .btn { padding: 6px 10px; border-radius: 8px; border: 0; cursor: pointer; }
            .icons { display: block; max-height: 220px; overflow: auto; padding-top: 8px; background: transparent; }
            .icon-group { padding: 6px 8px; }
            .icon-group-title { font-size: 12px; opacity: .8; color: inherit; margin: 6px 4px; }
            .icon-grid { display: grid; grid-template-columns: repeat(auto-fill, 35px); grid-auto-rows: 35px; gap: 10px 13px; align-items: start; justify-content: start; }
            .iconBtn { width: 35px; height: 35px; border-radius: 8px; background: #2a2a30ff; border: 1.5px solid rgba(43, 45, 63, 0.421) !important; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
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

            .picker.light { background: #f8fafd; color: #111; box-shadow: 0 10px 30px rgba(0,0,0,.15); border: 1.5px solid rgba(235, 237, 255, 0.58) !important; }
            .picker.light .close { color: #111; }
            .picker.light .marker { border-color: #000; box-shadow: 0 0 0 1px rgba(0,0,0,.2); }
            .picker.light .preview { border-color: rgba(0,0,0,.15); }
            .picker.light .iconBtn { background: #ffffffff; border: 1.5px solid rgba(235, 237, 255, 0.58) !important; }
            .picker.light .icon { filter: none; }
        `;
        shadow.appendChild(style);

        const wrapper = document.createElement('div');
        wrapper.className = 'picker';

        const header = document.createElement('div');
        header.className = 'header';
        const title = document.createElement('div');
        title.className = 'title';
        title.textContent = '';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'close';
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', () => hideWheel());
        header.appendChild(title);
        header.appendChild(closeBtn);

    const canvas = document.createElement('canvas');
    canvas.className = 'wheel';
    canvas.width = 360; canvas.height = 160;
        const marker = document.createElement('div');
        marker.className = 'marker';

    const wheelBox = document.createElement('div');
    wheelBox.style.position = 'relative';
    wheelBox.style.width = '100%';
    wheelBox.style.height = '160px';
    wheelBox.style.margin = '0';
    wheelBox.appendChild(canvas);
    wheelBox.appendChild(marker);

    const hexInput = document.createElement('input');
    hexInput.type = 'text';
    hexInput.className = 'hex-input';
    hexInput.placeholder = '#rrggbb';

    const row = document.createElement('div');
    row.className = 'row';
        const preview = document.createElement('div');
        preview.className = 'preview';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0'; slider.max = '360'; slider.value = '0';
        row.appendChild(preview);
        row.appendChild(slider);

    wrapper.appendChild(header);
    wrapper.appendChild(wheelBox);
    wrapper.appendChild(row);

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
            background: rgba(100, 150, 255, 0.1) !important;
            border: 1.5px dashed rgba(100, 150, 255, 0.4) !important;
        `;
        
        const plusText = document.createElement('span');
        plusText.style.fontSize = '20px';
        plusText.style.lineHeight = '1';
        plusText.style.color = 'rgba(100, 150, 255, 0.7)';
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

    wheelUi = { host, shadow, wrapper, canvas, marker, slider, preview, iconsGrid, hexInput };
    wheelUi.currentH = 0;
    wheelUi.currentS = 1;
    wheelUi.currentV = 1;
    slider.value = String(Math.round(wheelUi.currentH));
    applyWheelTheme();
    drawColorWheel(canvas.getContext('2d'), canvas.width, canvas.height, wheelUi.currentH);
    try { updatePreviewAndApply(); } catch (_) {}

        let dragging = false;
        const onPointer = (evt) => {
            const rect = canvas.getBoundingClientRect();
            const x = (evt.clientX - rect.left);
            const y = (evt.clientY - rect.top);
            const { s, v } = positionToSV(canvas, x, y);
            wheelUi.currentS = s; wheelUi.currentV = v;
            updateMarkerFromSV();
            updatePreviewAndApply();
        };
        canvas.addEventListener('mousedown', (e) => { dragging = true; onPointer(e); });
        window.addEventListener('mousemove', (e) => { if (dragging) onPointer(e); });
        window.addEventListener('mouseup', () => { dragging = false; });
        canvas.addEventListener('touchstart', (e) => { dragging = true; onPointer(e.touches[0]); e.preventDefault(); }, { passive: false });
        window.addEventListener('touchmove', (e) => { if (dragging) onPointer(e.touches[0]); }, { passive: false });
        window.addEventListener('touchend', () => { dragging = false; });
        slider.min = '0'; slider.max = '360'; slider.value = '0';
        slider.addEventListener('input', () => {
            wheelUi.currentH = Number(slider.value);
            try { drawColorWheel(canvas.getContext('2d'), canvas.width, canvas.height, wheelUi.currentH); } catch (_) {}
            updateMarkerFromSV();
            updatePreviewAndApply();
        });

        function commitHexInput() {
            const raw = (hexInput.value || '').trim();
            if (!raw) return;
            let v = raw.startsWith('#') ? raw : ('#' + raw);
            if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) {
                try { hexInput.style.borderColor = 'rgba(255,80,80,0.9)'; setTimeout(() => hexInput.style.borderColor = 'rgba(255,255,255,0.08)', 700); } catch (_) {}
                return;
            }
            try {
                const { h, s, v: val } = hexToHsv(v);
                wheelUi.currentH = h; wheelUi.currentS = s; wheelUi.currentV = val;
                slider.value = String(Math.round(h));
                drawColorWheel(canvas.getContext('2d'), canvas.width, canvas.height, wheelUi.currentH);
                updateMarkerFromSV();
                updatePreviewAndApply();
            } catch (_) {}
        }
        hexInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') commitHexInput(); });
        hexInput.addEventListener('blur', commitHexInput);

        try {
            hexInput.classList.add('hex-input-inline');
            header.insertBefore(hexInput, header.firstChild);
        } catch (_) {}

        function updateMarkerFromSV() {
            const cx = (wheelUi.currentS || 0) * wheelUi.canvas.width;
            const cy = (1 - (wheelUi.currentV || 0)) * wheelUi.canvas.height;
            marker.style.left = `${cx}px`;
            marker.style.top = `${cy}px`;
        }

        function updatePreviewAndApply() {
            const h = (wheelUi.currentH !== undefined) ? wheelUi.currentH : 0;
            const s = (wheelUi.currentS !== undefined) ? wheelUi.currentS : 0;
            const v = (wheelUi.currentV !== undefined) ? wheelUi.currentV : 1;
            const { r, g, b } = hsvToRgb(h, s, v);
            const hex = rgbToHex(r, g, b);
            preview.style.background = hex;
            try { if (wheelUi && wheelUi.hexInput) wheelUi.hexInput.value = hex; } catch (_) {}
            if (elementAwaitingColor) {
                try { 
                    elementAwaitingColor.style.setProperty('--dna-icon-color', hex);
                    // Also set text color
                    const parent = elementAwaitingColor.closest('a.uTwgne');
                    if (parent) {
                        const textEl = parent.querySelector('.GRvzhf.YVvGBb');
                        if (textEl) {
                            textEl.style.color = hex;
                            console.log('Wheel: Set text color to:', hex);
                        } else {
                            console.log('Wheel: Could not find text element');
                        }
                    } else {
                        console.log('Wheel: Could not find parent a.uTwgne');
                    }
                } catch (_) {
                    console.log('Wheel: Error setting color:', _);
                }
                clearTimeout(persistTimer);
                persistTimer = setTimeout(() => {
                    persistColorForElement(elementAwaitingColor, hex);
                }, 150);
            }
        }

        wheelUi.updateFromHex = function(hex) {
            const { h, s, v } = hexToHsv(hex);
            wheelUi.currentH = h; wheelUi.currentS = s; wheelUi.currentV = v; slider.value = String(Math.round(h));
            try { drawColorWheel(canvas.getContext('2d'), canvas.width, canvas.height, wheelUi.currentH); } catch (_) {}
            updateMarkerFromSV();
            wheelUi.preview.style.background = hex;
            try { if (wheelUi && wheelUi.hexInput) wheelUi.hexInput.value = hex; } catch (_) {}
        };
        wheelUi.updatePreviewAndApply = updatePreviewAndApply;

        return wheelUi;
    }

    function drawColorWheel(ctx, width, height, hue) {
        const h = (typeof hue === 'number') ? hue : ((wheelUi && wheelUi.currentH) || 0);
        const img = ctx.createImageData(width, height);
        const data = img.data;

        for (let y = 0; y < height; y++) {
            const v = 1 - (y + 0.5) / height;
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const s = (x + 0.5) / width;
                const { r, g, b } = hsvToRgb(h, s, v);
                data[idx + 0] = r;
                data[idx + 1] = g;
                data[idx + 2] = b;
                data[idx + 3] = 255;
            }
        }

        ctx.putImageData(img, 0, 0);
    }

    function positionToSV(canvas, x, y) {
        const clampedX = Math.max(0, Math.min(canvas.width, x));
        const clampedY = Math.max(0, Math.min(canvas.height, y));
        const s = (clampedX / canvas.width);
        const v = 1 - (clampedY / canvas.height);
        return { s, v };
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
        ui.wrapper.style.visibility = 'hidden';
        ui.wrapper.style.display = 'block';
        positionPickerWithinViewport(pref.left, pref.top);
        ui.wrapper.style.visibility = 'visible';

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

    function positionPickerWithinViewport(preferredLeft, preferredTop) {
        if (!wheelUi) return;
        const el = wheelUi.wrapper;
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
        }, 100);
    }, 100);
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

        const observer = new MutationObserver(function(mutations) {
            let shouldCheckForButton = false;
            let shouldCheckForSidebar = false;
            let shouldRestoreColors = false;
            
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
                                if (node.matches && node.matches('.kWQ5wd') || (node.querySelector && node.querySelector('.kWQ5wd'))) {
                                    setTimeout(() => attachIconPickersInDom(node), 0);
                                    shouldRestoreColors = true;
                                }
                                // Check if this is a sidebar link that needs color restoration
                                if (node.matches && node.matches('a.uTwgne') || (node.querySelector && node.querySelector('a.uTwgne'))) {
                                    shouldRestoreColors = true;
                                }
                                setTimeout(() => restoreSavedColors(node), 0);
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

            if (shouldRestoreColors) {
                setTimeout(() => restoreSavedColors(), 50);
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
