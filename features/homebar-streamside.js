(function() {

    function initStreamsideToggleButton() {
        let processScheduled = false;

        function scheduleProcessAllTargets() {
            if (processScheduled) return;
            processScheduled = true;
            (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb) => setTimeout(cb, 16))(() => {
                processScheduled = false;
                processAllTargets();
            });
        }

        function createButtonForElement(targetElement) {
            // Check if button already exists for this element
            if (targetElement.hasAttribute('data-streamside-button-added')) {
                return false;
            }

            const buttonWrapper = document.createElement('div');
            buttonWrapper.className = 'streamside-toggle-wrapper';

            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'streamside-toggle-arrow-btn';

            const arrow = document.createElement('img');
            arrow.className = 'streamside-arrow';
            const iconUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
                ? chrome.runtime.getURL('Icons/Arrow Right.svg')
                : 'Icons/Arrow Right.svg';
            arrow.src = iconUrl;
            arrow.alt = 'Toggle streamside';
            arrow.style.width = '20px';
            arrow.style.height = '20px';
            toggleBtn.appendChild(arrow);

            toggleBtn.addEventListener('click', () => {
                const isEnabled = document.body.classList.contains('streamside');
                if (isEnabled) {
                    document.body.classList.remove('streamside');
                    toggleBtn.classList.remove('enabled');
                    chrome.storage.sync.set({ 'streamsideEnabled': false });
                } else {
                    document.body.classList.add('streamside');
                    toggleBtn.classList.add('enabled');
                    chrome.storage.sync.set({ 'streamsideEnabled': true });
                }
            });

            toggleBtn.addEventListener('mouseenter', () => {
                toggleBtn.classList.add('hover');
            });

            toggleBtn.addEventListener('mouseleave', () => {
                toggleBtn.classList.remove('hover');
            });

            // Check saved preference
            chrome.storage.sync.get('streamsideEnabled', (result) => {
                if (result.streamsideEnabled) {
                    document.body.classList.add('streamside');
                    toggleBtn.classList.add('enabled');
                } else {
                    document.body.classList.remove('streamside');
                    toggleBtn.classList.remove('enabled');
                }
            });

            buttonWrapper.appendChild(toggleBtn);

            // Wrap both target element and button wrapper in a flex container
            const flexContainer = document.createElement('div');
            flexContainer.className = 'streamside-flex-container';
            flexContainer.style.display = 'flex';
            flexContainer.style.gap = '12px';
            flexContainer.style.alignItems = 'center';

            targetElement.parentElement.insertBefore(flexContainer, targetElement);
            flexContainer.appendChild(buttonWrapper);
            flexContainer.appendChild(targetElement);
            
            // Mark element so we don't add button twice
            targetElement.setAttribute('data-streamside-button-added', 'true');
            return true;
        }

        function processAllTargets() {
            const targets = document.querySelectorAll('.S1rfaf.nmFHZb');
            targets.forEach(target => {
                createButtonForElement(target);
            });
        }

        // Aggressive observer that watches for new target elements
        const observer = new MutationObserver((mutations) => {
            let shouldCheck = false;
            
            for (let mutation of mutations) {
                if (mutation.type === 'childList') {
                    for (let node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.classList && node.classList.contains('S1rfaf') && node.classList.contains('nmFHZb')) {
                                createButtonForElement(node);
                                shouldCheck = true;
                            }
                            if (node.querySelector && node.querySelector('.S1rfaf.nmFHZb')) {
                                shouldCheck = true;
                            }
                        }
                    }
                }
            }

            if (shouldCheck) {
                scheduleProcessAllTargets();
            }
        });

        // Start observing immediately
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Initial processing attempt
        setTimeout(() => {
            processAllTargets();
        }, 500);
    }

    function initHomeBar() {
        const displayToggleStorageKey = 'homeDisplayToggles';
        const displayToggleVersionKey = 'homeDisplayTogglesVersion';
        const displayToggleClasses = {
            movement: 'hmove',
            title: 'htitle',
            subtitle: 'hsubt',
            teacher: 'hteach',
            profile: 'hpfp'
        };
        const displayToggleLabels = {
            movement: 'Magnetic Cursor',
            title: 'Name',
            subtitle: 'Section',
            teacher: 'Teacher',
            profile: 'Profile'
        };
        const displayToggleControls = {};
        let displayToggleState = {
            movement: true,
            title: true,
            subtitle: true,
            teacher: true,
            profile: true
        };

        const indicator = document.createElement('div');
        indicator.className = 'home-indicator';
        
        const container = document.createElement('div');
        container.className = 'home-buttons-container';
        
        const btn1 = document.createElement('button');
        btn1.className = 'home-btn';
        btn1.innerHTML = '<div class="home-icon-stack"><div class="home-rect"></div></div>';
        
        const btn2 = document.createElement('button');
        btn2.className = 'home-btn';
        btn2.innerHTML = '<div class="home-icon-single"><div class="home-rect-full"></div></div>';

        const customizeWrapper = document.createElement('div');
        customizeWrapper.className = 'home-panel-anchor';

        const customizeBtn = document.createElement('button');
        customizeBtn.className = 'home-btn home-btn-icon home-customize-btn';
        customizeBtn.type = 'button';
        customizeBtn.setAttribute('aria-label', 'Customize home card display');
        customizeBtn.setAttribute('aria-expanded', 'false');
        customizeBtn.style.setProperty('--home-customize-icon-url', `url("${chrome.runtime.getURL('Icons/edithome.svg')}")`);
        customizeBtn.innerHTML = '<span class="home-customize-icon" aria-hidden="true"></span>';

        const customizePanel = document.createElement('div');
        customizePanel.className = 'home-customize-panel';

        function persistDisplayToggleState() {
            if (typeof storageSet === 'function') {
                storageSet(displayToggleStorageKey, displayToggleState);
            } else {
                try {
                    localStorage.setItem(displayToggleStorageKey, JSON.stringify(displayToggleState));
                } catch (_) {}
            }
        }

        function syncDisplayToggleControls() {
            Object.entries(displayToggleControls).forEach(([key, control]) => {
                const isOn = !!displayToggleState[key];
                control.classList.toggle('active', isOn);
                control.setAttribute('aria-checked', isOn ? 'true' : 'false');
            });
        }

        function applyDisplayToggleState(nextState, persist = true) {
            displayToggleState = {
                ...displayToggleState,
                ...nextState
            };

            Object.entries(displayToggleClasses).forEach(([key, className]) => {
                document.body.classList.toggle(className, !displayToggleState[key]);
            });

            window.dispatchEvent(new CustomEvent('mc-home-movement-toggle-changed', {
                detail: { enabled: displayToggleState.movement !== false }
            }));

            syncDisplayToggleControls();

            if (persist) {
                persistDisplayToggleState();
            }
        }

        function normalizeDisplayToggleState(savedState, shouldInvert = false) {
            const normalizedState = { ...displayToggleState };

            if (!savedState || typeof savedState !== 'object') {
                return normalizedState;
            }

            Object.keys(normalizedState).forEach((key) => {
                if (typeof savedState[key] === 'boolean') {
                    normalizedState[key] = shouldInvert ? !savedState[key] : savedState[key];
                }
            });

            return normalizedState;
        }

        function setCustomizePanelOpen(isOpen) {
            customizePanel.classList.toggle('visible', isOpen);
            customizeBtn.classList.toggle('active', isOpen);
            customizeBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        }

        Object.entries(displayToggleLabels).forEach(([key, label]) => {
            const optionBtn = document.createElement('button');
            optionBtn.className = 'home-display-toggle';
            optionBtn.type = 'button';
            optionBtn.setAttribute('role', 'switch');
            optionBtn.setAttribute('aria-checked', 'false');
            optionBtn.innerHTML = `
                <span class="home-display-toggle-label">${label}</span>
                <span class="home-display-toggle-track">
                    <span class="home-display-toggle-thumb"></span>
                </span>
            `;
            optionBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                applyDisplayToggleState({ [key]: !displayToggleState[key] });
            });
            displayToggleControls[key] = optionBtn;
            customizePanel.appendChild(optionBtn);
        });

        customizeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            setCustomizePanelOpen(!customizePanel.classList.contains('visible'));
        });

        customizePanel.addEventListener('click', (e) => e.stopPropagation());
        customizeWrapper.appendChild(customizeBtn);
        customizeWrapper.appendChild(customizePanel);

        document.addEventListener('click', () => {
            setCustomizePanelOpen(false);
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                setCustomizePanelOpen(false);
            }
        });
        
        function updateState(isMiniWidget, persist = true) {
            if (isMiniWidget) {
                document.body.classList.add('miniwidget');
                btn1.classList.add('active');
                btn2.classList.remove('active');
            } else {
                document.body.classList.remove('miniwidget');
                btn1.classList.remove('active');
                btn2.classList.add('active');
            }
            if (persist) {
                if (typeof storageSet === 'function') {
                    storageSet('homeMiniWidget', isMiniWidget);
                } else {
                    try { localStorage.setItem('homeMiniWidget', isMiniWidget ? 'true' : 'false'); } catch (_) {}
                }
            }
        }

        btn1.addEventListener('click', () => updateState(true));
        btn2.addEventListener('click', () => updateState(false));

        // Load from localStorage immediately
        let savedState = false;
        try {
            const raw = localStorage.getItem('homeMiniWidget');
            savedState = raw === 'true' || raw === true;
        } catch (_) {}
        updateState(savedState, false);
        
        // Then load from sync storage in background
        if (typeof storageGet === 'function') {
            storageGet('homeMiniWidget', false).then(syncState => {
                if (syncState !== savedState) {
                    updateState(syncState, false);
                }
            });

            Promise.all([
                storageGet(displayToggleStorageKey, null),
                storageGet(displayToggleVersionKey, 1)
            ]).then(([savedToggles, storedVersion]) => {
                const needsMigration = storedVersion < 2;
                const nextToggleState = normalizeDisplayToggleState(savedToggles, needsMigration);

                applyDisplayToggleState(nextToggleState, false);

                if (needsMigration) {
                    if (typeof storageSet === 'function') {
                        storageSet(displayToggleStorageKey, nextToggleState);
                        storageSet(displayToggleVersionKey, 2);
                    }
                }
            });
        } else {
            try {
                const raw = localStorage.getItem(displayToggleStorageKey);
                const rawVersion = localStorage.getItem(displayToggleVersionKey);
                const savedToggles = raw ? JSON.parse(raw) : null;
                const storedVersion = rawVersion ? Number(rawVersion) : 1;
                const needsMigration = storedVersion < 2;
                const nextToggleState = normalizeDisplayToggleState(savedToggles, needsMigration);

                applyDisplayToggleState(nextToggleState, false);

                if (needsMigration) {
                    localStorage.setItem(displayToggleStorageKey, JSON.stringify(nextToggleState));
                    localStorage.setItem(displayToggleVersionKey, '2');
                }
            } catch (_) {
                applyDisplayToggleState(displayToggleState, false);
            }
        }

        const foldersContainer = document.createElement('div');
        foldersContainer.className = 'home-folders-container';


        
        // 2. Apps Icon Box (Home)
        const appsBtn = document.createElement('div');
        appsBtn.className = 'home-folder-item active'; // Removed icon-item to allow text
        
        const appsIcon = document.createElement('div');
        appsIcon.className = 'home-folder-icon-div home-icon';
        appsIcon.style.setProperty('--dna-icon-url', `url("${chrome.runtime.getURL('Icons/Home Icon.svg')}")`);
        // Color handled in CSS for light/dark mode support
        
        const appsText = document.createElement('span');
        appsText.className = 'folder-name';
        appsText.textContent = 'Home';
        
        appsBtn.appendChild(appsIcon);
        appsBtn.appendChild(appsText);
        foldersContainer.appendChild(appsBtn);

        // Wrapper for dynamic folders
        const dynamicFoldersWrapper = document.createElement('div');
        dynamicFoldersWrapper.className = 'dynamic-folders-wrapper';
        dynamicFoldersWrapper.style.display = 'flex';
        dynamicFoldersWrapper.style.alignItems = 'center';
        dynamicFoldersWrapper.style.gap = '4px'; // Add gap between folders
        foldersContainer.appendChild(dynamicFoldersWrapper);

        // 3. Plus Icon Box
        const plusBtn = document.createElement('div');
        plusBtn.className = 'home-folder-item icon-item';
        plusBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        foldersContainer.appendChild(plusBtn);

        container.appendChild(btn1);
        container.appendChild(btn2);
        container.appendChild(customizeWrapper);
        indicator.appendChild(container);
        indicator.appendChild(foldersContainer);
        
        document.body.appendChild(indicator);

        // --- Sub Bar ---
        const subBar = document.createElement('div');
        subBar.className = 'home-sub-bar';
        
        // Rename Button
        const renameBtn = document.createElement('div');
        renameBtn.className = 'sub-bar-btn';
        renameBtn.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            <span>Rename Folder</span>
        `;
        
        // Icon Button
        const iconBtn = document.createElement('div');
        iconBtn.className = 'sub-bar-btn';
        iconBtn.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
            <span>Icon</span>
        `;

        // Add Classrooms Button
        const addClassBtn = document.createElement('div');
        addClassBtn.className = 'sub-bar-btn';
        addClassBtn.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            <span>Classes</span>
        `;

        // Set as Home (default-open folder) Button
        const setHomeBtn = document.createElement('div');
        setHomeBtn.className = 'sub-bar-btn sub-bar-home-btn';
        setHomeBtn.innerHTML = `
            <svg class="sub-bar-home-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path class="home-shape" d="M4 10.5 12 4l8 6.5V20H4Z"></path>
                <path class="home-door" d="M10 20v-4a2 2 0 0 1 4 0v4"></path>
            </svg>
        `;
        setHomeBtn.title = 'Set this folder as Home';
        setHomeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!activeFolderId) return;
            if (defaultFolderId === activeFolderId) {
                saveDefaultFolder(null);
                return;
            }
            saveDefaultFolder(activeFolderId);
        });

        addClassBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showClassroomPicker();
        });

        // Delete Button
        const deleteBtn = document.createElement('div');
        deleteBtn.className = 'sub-bar-btn sub-bar-delete-btn';
        deleteBtn.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        `;
        
        let isDeleting = false;
        
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!activeFolderId) return;
            
            if (!isDeleting) {
                // Switch to confirm state
                isDeleting = true;
                deleteBtn.innerHTML = `
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                `;
                deleteBtn.classList.add('confirm-delete');
                deleteBtn.style.borderColor = '#ff4444';
                deleteBtn.style.color = '#ff4444';
            } else {
                // Perform delete
                const index = folders.findIndex(f => f.id === activeFolderId);
                if (index !== -1) {
                    folders.splice(index, 1);
                    if (defaultFolderId === activeFolderId) {
                        saveDefaultFolder(null);
                    }
                    saveFolders();
                    setActiveFolder(null); // Go back to home
                }
            }
        });

        subBar.appendChild(setHomeBtn);
        subBar.appendChild(renameBtn);
        subBar.appendChild(iconBtn);
        subBar.appendChild(addClassBtn);
        subBar.appendChild(deleteBtn);
        // Don't append to body yet, will be appended to active folder

        function showClassroomPicker() {
            subBar.innerHTML = '';
            subBar.style.flexDirection = 'column';
            
            // Return Button
            const returnBtn = document.createElement('div');
            returnBtn.className = 'sub-bar-btn';
            returnBtn.style.marginBottom = '0';
            returnBtn.style.justifyContent = 'left';
            returnBtn.style.width = '80px';
            returnBtn.style.boxSizing = 'border-box';
            returnBtn.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                <span>Done</span>
            `;
            returnBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                resetSubBarState();
            });
            subBar.appendChild(returnBtn);

            const grid = document.createElement('div');
            grid.className = 'classroom-picker-grid';
            
            // Get all courses from DOM
            const cards = document.querySelectorAll('ol li');
            const courses = [];
            cards.forEach(card => {
                // Skip hidden classes (they have the OmA97e div)
                if (card.querySelector('.OmA97e')) return;
                
                const id = getClassIdFromCard(card);
                // Use the primary class title only (exclude subtitle like teacher/section text)
                const name = getPrimaryClassTitleFromCard(card);
                
                if (id && !courses.find(c => c.id === id)) {
                    courses.push({ id, name });
                }
            });

            const activeFolder = folders.find(f => f.id === activeFolderId);
            if (!activeFolder) return; 
            
            if (!activeFolder.courseIds) activeFolder.courseIds = [];

            courses.forEach(course => {
                const item = document.createElement('div');
                const isAdded = activeFolder.courseIds.includes(course.id);
                item.className = `classroom-picker-item ${isAdded ? 'added' : 'not-added'}`;
                
                item.innerHTML = `
                    <div class="classroom-picker-name">${course.name}</div>
                `;
                
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const index = activeFolder.courseIds.indexOf(course.id);
                    if (index === -1) {
                        activeFolder.courseIds.push(course.id);
                        item.classList.remove('not-added');
                        item.classList.add('added');
                    } else {
                        activeFolder.courseIds.splice(index, 1);
                        item.classList.remove('added');
                        item.classList.add('not-added');
                    }
                    saveFolders();
                    applyClassroomFilter();
                });
                
                grid.appendChild(item);
            });
            
            subBar.appendChild(grid);
        }

        function resetSubBarState() {
            // Reset Rename Button
            renameBtn.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                <span>Rename</span>
            `;
            renameBtn.classList.remove('editing');

            // Reset Delete Button
            isDeleting = false;
            deleteBtn.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            `;
            deleteBtn.classList.remove('confirm-delete');
            deleteBtn.style.borderColor = '';
            deleteBtn.style.color = '';

            // Reset SubBar Content
            subBar.innerHTML = '';
            subBar.style.flexDirection = '';
            subBar.appendChild(setHomeBtn);
            subBar.appendChild(renameBtn);
            subBar.appendChild(iconBtn);
            subBar.appendChild(addClassBtn);
            subBar.appendChild(deleteBtn);
        }

        // --- Folder Logic ---
        let folders = [];
        try {
            const raw = localStorage.getItem('modernClassroom_folders');
            if (raw) folders = JSON.parse(raw);
        } catch(e) { 
            folders = []; 
        }

        let activeFolderId = null; // null = Home
        const DEFAULT_FOLDER_KEY = 'modernClassroom_defaultFolder';
        let defaultFolderId = null;
        try {
            const rawDefault = localStorage.getItem(DEFAULT_FOLDER_KEY);
            if (rawDefault && rawDefault !== 'null' && rawDefault !== 'undefined') {
                defaultFolderId = rawDefault;
            }
        } catch (_) {}

        function saveDefaultFolder(id) {
            defaultFolderId = id;
            if (typeof storageSet === 'function') {
                storageSet(DEFAULT_FOLDER_KEY, id);
            } else {
                try { localStorage.setItem(DEFAULT_FOLDER_KEY, id === null ? 'null' : id); } catch (_) {}
            }
            updateSetHomeButtonState();
        }

        function updateSetHomeButtonState() {
            if (activeFolderId && defaultFolderId === activeFolderId) {
                setHomeBtn.classList.add('enabled');
                setHomeBtn.title = 'Default Home folder enabled (click to reset)';
            } else {
                setHomeBtn.classList.remove('enabled');
                setHomeBtn.title = 'Set this folder as Home';
            }
        }

        function saveFolders() {
            if (typeof storageSet === 'function') {
                storageSet('modernClassroom_folders', folders);
            } else {
                try { localStorage.setItem('modernClassroom_folders', JSON.stringify(folders)); } catch (_) {}
            }
        }
        
        // Load from sync storage in background and update if different
        if (typeof storageGet === 'function') {
            storageGet('modernClassroom_folders', []).then(storedFolders => {
                if (storedFolders && storedFolders.length > 0) {
                    folders = storedFolders;
                    // Re-render folders if needed
                    if (typeof renderFolders === 'function') {
                        renderFolders();
                    }
                    if (defaultFolderId && folders.some(f => f.id === defaultFolderId)) {
                        setActiveFolder(defaultFolderId);
                    }
                }
            });
            storageGet(DEFAULT_FOLDER_KEY, null).then(syncDefaultFolderId => {
                const normalized = (typeof syncDefaultFolderId === 'string' && syncDefaultFolderId)
                    ? syncDefaultFolderId
                    : null;
                if (normalized !== defaultFolderId) {
                    defaultFolderId = normalized;
                }
                updateSetHomeButtonState();
                if (defaultFolderId && folders.some(f => f.id === defaultFolderId)) {
                    setActiveFolder(defaultFolderId);
                }
            });
        }

        // Icon Logic
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

        iconBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!activeFolderId) return;
            
            const currentFolder = folders.find(f => f.id === activeFolderId);
            if (!currentFolder) return;

            // Temporarily replace sub-bar content with icon picker
            const originalContent = Array.from(subBar.children);
            subBar.innerHTML = '';
            
            const pickerContainer = document.createElement('div');
            pickerContainer.style.display = 'flex';
            pickerContainer.style.flexDirection = 'column';
            pickerContainer.style.width = '384.36px';

            const iconList = document.createElement('div');
            iconList.className = 'icon-picker-scroll';
            iconList.style.overflowY = 'auto';
            iconList.style.maxHeight = '200px';
            iconList.style.padding = '8px';
            iconList.style.paddingTop = '40px';
            iconList.style.display = 'flex';
            iconList.style.flexDirection = 'column';
            iconList.style.gap = '12px';

            availableIcons.forEach(group => {
                const sectionDiv = document.createElement('div');
                
                const title = document.createElement('div');
                title.textContent = group.title;
                title.style.fontSize = '11px';
                title.style.fontWeight = '600';
                title.style.color = 'rgb(105, 111, 168)';
                title.style.marginBottom = '6px';
                title.style.textTransform = 'uppercase';
                title.style.letterSpacing = '0.5px';
                sectionDiv.appendChild(title);

                const grid = document.createElement('div');
                grid.className = 'home-icon-picker-grid';

                group.icons.forEach(iconName => {
                    const iconDiv = document.createElement('div');
                    iconDiv.className = 'home-icon-btn';
                    if (currentFolder.icon === iconName) {
                        iconDiv.classList.add('selected');
                    }
                    
                    const img = document.createElement('img');
                    img.src = chrome.runtime.getURL('Icons/' + iconName);
                    img.className = 'home-icon-img';
                    
                    iconDiv.appendChild(img);
                    
                    iconDiv.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        
                        // Update UI selection
                        const allIcons = iconList.querySelectorAll('.home-icon-btn');
                        allIcons.forEach(el => el.classList.remove('selected'));
                        iconDiv.classList.add('selected');

                        currentFolder.icon = iconName;
                        saveFolders();
                        renderFolders();
                    });
                    
                    grid.appendChild(iconDiv);
                });
                
                sectionDiv.appendChild(grid);
                iconList.appendChild(sectionDiv);
            });
            
            pickerContainer.appendChild(iconList);

            // Return button for picker
            const closePicker = document.createElement('div');
            closePicker.className = 'sub-bar-btn';
            closePicker.style.marginBottom = '0';
            closePicker.style.justifyContent = 'left';
            closePicker.style.width = '80px';
            closePicker.style.boxSizing = 'border-box';
            closePicker.style.position = 'absolute';
            closePicker.style.top = '6px';
            closePicker.style.left = '6px';
            closePicker.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                <span>Done</span>
            `;
            closePicker.addEventListener('click', (ev) => {
                ev.stopPropagation();
                restoreSubBar();
            });

            // Color Picker Section
            const colorSection = document.createElement('div');
            colorSection.className = 'home-color-picker-section';
            
            const colorTitle = document.createElement('div');
            colorTitle.textContent = 'Color';
            colorTitle.style.fontSize = '11px';
            colorTitle.style.fontWeight = '600';
            colorTitle.style.color = 'rgb(105, 111, 168)';
            colorTitle.style.marginBottom = '8px';
            colorTitle.style.textTransform = 'uppercase';
            colorSection.appendChild(colorTitle);

            // SV Box (Saturation/Value)
            const svWrapper = document.createElement('div');
            svWrapper.className = 'home-sv-wrapper';
            
            const svCanvas = document.createElement('canvas');
            svCanvas.className = 'home-sv-canvas';
            svCanvas.width = 280; // Approximate width
            svCanvas.height = 120;
            
            const svMarker = document.createElement('div');
            svMarker.className = 'home-sv-marker';
            
            svWrapper.appendChild(svCanvas);
            svWrapper.appendChild(svMarker);
            colorSection.appendChild(svWrapper);

            // Hue Slider
            const hueSlider = document.createElement('input');
            hueSlider.type = 'range';
            hueSlider.min = '0';
            hueSlider.max = '360';
            hueSlider.className = 'home-hue-slider';
            colorSection.appendChild(hueSlider);
            
            // Hex Input
            const hexInput = document.createElement('input');
            hexInput.type = 'text';
            hexInput.className = 'home-hex-input';
            hexInput.placeholder = '#RRGGBB';
            colorSection.appendChild(hexInput);

            // State
            let currentH = 0;
            let currentS = 1;
            let currentV = 1;

            // Helper functions defined locally to ensure scope access
            function localHsvToRgb(h, s, v) {
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
                return { 
                    r: Math.round((r1+m)*255), 
                    g: Math.round((g1+m)*255), 
                    b: Math.round((b1+m)*255) 
                };
            }

            function localRgbToHex(r, g, b) {
                const toHex = (n) => {
                    const hex = Math.max(0, Math.min(255, n)).toString(16);
                    return hex.length === 1 ? '0' + hex : hex;
                };
                return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
            }

            function localHexToHsv(hex) {
                let r = 0, g = 0, b = 0;
                if (hex.length === 4) {
                    r = parseInt(hex[1] + hex[1], 16);
                    g = parseInt(hex[2] + hex[2], 16);
                    b = parseInt(hex[3] + hex[3], 16);
                } else if (hex.length === 7) {
                    r = parseInt(hex.slice(1, 3), 16);
                    g = parseInt(hex.slice(3, 5), 16);
                    b = parseInt(hex.slice(5, 7), 16);
                }
                
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

            // Initialize from current folder color
            if (currentFolder.color) {
                const { h, s, v } = localHexToHsv(currentFolder.color);
                currentH = h;
                currentS = s;
                currentV = v;
            }
            
            hueSlider.value = currentH;
            hexInput.value = currentFolder.color || '#ffffff';

            // Logic
            function drawSvBox() {
                const ctx = svCanvas.getContext('2d');
                const width = svCanvas.width;
                const height = svCanvas.height;
                
                ctx.clearRect(0, 0, width, height);
                
                // Fill with current Hue
                ctx.fillStyle = `hsl(${currentH}, 100%, 50%)`;
                ctx.fillRect(0, 0, width, height);
                
                // White gradient (Left to Right)
                const whiteGrad = ctx.createLinearGradient(0, 0, width, 0);
                whiteGrad.addColorStop(0, 'rgba(255,255,255,1)');
                whiteGrad.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = whiteGrad;
                ctx.fillRect(0, 0, width, height);
                
                // Black gradient (Top to Bottom)
                const blackGrad = ctx.createLinearGradient(0, 0, 0, height);
                blackGrad.addColorStop(0, 'rgba(0,0,0,0)');
                blackGrad.addColorStop(1, 'rgba(0,0,0,1)');
                ctx.fillStyle = blackGrad;
                ctx.fillRect(0, 0, width, height);
            }

            function updateMarkerPosition() {
                // Ensure we have dimensions
                const width = svCanvas.offsetWidth || 280;
                const height = svCanvas.offsetHeight || 120;
                
                const x = currentS * width;
                const y = (1 - currentV) * height;
                svMarker.style.left = `${x}px`;
                svMarker.style.top = `${y}px`;
            }

            function updateColorFromHsv() {
                const { r, g, b } = localHsvToRgb(currentH, currentS, currentV);
                const hex = localRgbToHex(r, g, b);
                
                // Update inputs
                if (document.activeElement !== hexInput) {
                    hexInput.value = hex;
                }
                
                // Update data
                currentFolder.color = hex;
                saveFolders();
                
                // Update DOM directly
                const activeBtn = subBar.parentElement || dynamicFoldersWrapper.querySelector('.home-folder-item.active');
                if (activeBtn) {
                    const iconDiv = activeBtn.querySelector('.home-folder-icon-div');
                    if (iconDiv) {
                        iconDiv.style.setProperty('background-color', hex, 'important');
                    }
                    const nameSpan = activeBtn.querySelector('.folder-name');
                    if (nameSpan) {
                        nameSpan.style.color = hex;
                    }
                }
            }

            // Event Listeners
            hueSlider.addEventListener('input', (e) => {
                currentH = Number(e.target.value);
                drawSvBox();
                updateColorFromHsv();
            });

            let isDraggingSv = false;
            
            function handleSvInput(clientX, clientY) {
                const rect = svCanvas.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) return;

                let x = clientX - rect.left;
                let y = clientY - rect.top;
                
                // Clamp
                x = Math.max(0, Math.min(rect.width, x));
                y = Math.max(0, Math.min(rect.height, y));
                
                currentS = x / rect.width;
                currentV = 1 - (y / rect.height);
                
                updateMarkerPosition();
                updateColorFromHsv();
            }

            svWrapper.addEventListener('mousedown', (e) => {
                isDraggingSv = true;
                handleSvInput(e.clientX, e.clientY);
            });
            
            window.addEventListener('mousemove', (e) => {
                if (isDraggingSv) {
                    handleSvInput(e.clientX, e.clientY);
                }
            });
            
            window.addEventListener('mouseup', () => {
                isDraggingSv = false;
            });

            hexInput.addEventListener('change', (e) => {
                let hex = e.target.value.trim();
                if (!hex.startsWith('#')) hex = '#' + hex;
                if (/^#([0-9A-F]{3}){1,2}$/i.test(hex)) {
                    const { h, s, v } = localHexToHsv(hex);
                    currentH = h;
                    currentS = s;
                    currentV = v;
                    hueSlider.value = currentH;
                    drawSvBox();
                    updateMarkerPosition();
                    updateColorFromHsv();
                }
            });

            pickerContainer.appendChild(colorSection);
            
            // Initial Draw
            setTimeout(() => {
                drawSvBox();
                updateMarkerPosition();
            }, 50);

            subBar.appendChild(pickerContainer);
            subBar.appendChild(closePicker);

            function restoreSubBar() {
                subBar.innerHTML = '';
                originalContent.forEach(child => subBar.appendChild(child));
            }
        });

        // Rename Logic
        renameBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent folder click
            if (!activeFolderId) return;
            
            const currentFolder = folders.find(f => f.id === activeFolderId);
            if (!currentFolder) return;

            // Clear sub-bar to show rename interface
            subBar.innerHTML = '';
            
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'sub-bar-input';
            input.value = currentFolder.name;
            input.placeholder = "Folder Name";
            
            const saveBtn = document.createElement('div');
            saveBtn.className = 'sub-bar-btn';
            saveBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
            
            const cancelBtn = document.createElement('div');
            cancelBtn.className = 'sub-bar-btn';
            cancelBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

            function save() {
                const newName = input.value.trim();
                if (newName) {
                    currentFolder.name = newName;
                    saveFolders();
                    renderFolders();
                }
                resetSubBarState();
            }

            saveBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                save();
            });

            cancelBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                resetSubBarState();
            });
            
            input.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Enter') save();
                if (e.key === 'Escape') resetSubBarState();
            });
            
            input.addEventListener('click', (e) => e.stopPropagation());

            subBar.appendChild(input);
            subBar.appendChild(saveBtn);
            subBar.appendChild(cancelBtn);
            input.focus();
        });

        function renderFolders() {
            // Sync existing buttons to preserve animations
            const existingButtons = Array.from(dynamicFoldersWrapper.children);
            const folderIds = folders.map(f => f.id);

            // Remove buttons for deleted folders
            existingButtons.forEach(btn => {
                if (btn.dataset.folderId && !folderIds.includes(btn.dataset.folderId)) {
                    btn.remove();
                }
            });

            folders.forEach((folder, index) => {
                let fBtn = dynamicFoldersWrapper.querySelector(`[data-folder-id="${folder.id}"]`);
                
                if (!fBtn) {
                    // Create new button
                    fBtn = document.createElement('div');
                    fBtn.className = 'home-folder-item folder-btn';
                    fBtn.style.position = 'relative';
                    fBtn.dataset.folderId = folder.id;
                    
                    const icon = document.createElement('div');
                    icon.className = 'home-folder-icon-div';
                    
                    const nameSpan = document.createElement('span');
                    nameSpan.className = 'folder-name';
                    
                    fBtn.appendChild(icon);
                    fBtn.appendChild(nameSpan);
                    
                    fBtn.addEventListener('click', () => {
                        setActiveFolder(folder.id);
                    });

                    // Insert in correct order
                    if (index < dynamicFoldersWrapper.children.length) {
                        dynamicFoldersWrapper.insertBefore(fBtn, dynamicFoldersWrapper.children[index]);
                    } else {
                        dynamicFoldersWrapper.appendChild(fBtn);
                    }
                }

                // Update Content
                const icon = fBtn.querySelector('.home-folder-icon-div');
                const nameSpan = fBtn.querySelector('.folder-name');
                
                const iconName = folder.icon || 'fi-sr-folder.svg';
                icon.style.setProperty('--dna-icon-url', `url("${chrome.runtime.getURL('Icons/' + iconName)}")`);
                
                if (folder.color) {
                    icon.style.setProperty('background-color', folder.color, 'important');
                    nameSpan.style.color = folder.color;
                } else {
                    icon.style.removeProperty('background-color');
                    nameSpan.style.removeProperty('color');
                }
                
                nameSpan.textContent = folder.name;

                // Update Active State
                if (folder.id === activeFolderId) {
                    if (!fBtn.classList.contains('active')) {
                        fBtn.classList.add('active');
                        fBtn.appendChild(subBar);
                        requestAnimationFrame(() => subBar.classList.add('visible'));
                    }
                } else {
                    if (fBtn.classList.contains('active')) {
                        fBtn.classList.remove('active');
                    }
                }
            });
        }

        function setActiveFolder(id) {
            // Reset sub-bar state when switching folders
            if (activeFolderId !== id) {
                try { resetSubBarState(); } catch (_) {}
            }

            activeFolderId = id;
            updateSetHomeButtonState();
            
            // Update UI
            if (id === null) {
                appsBtn.classList.add('active');
                subBar.classList.remove('visible');
                document.body.classList.remove('folder-active');
                if (subBar.parentNode) subBar.parentNode.removeChild(subBar);
            } else {
                appsBtn.classList.remove('active');
                document.body.classList.add('folder-active');
            }
            renderFolders(); 
            
            // Trigger Filter
            applyClassroomFilter();
        }

        appsBtn.addEventListener('click', () => setActiveFolder(null));
        
        plusBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (plusBtn.classList.contains('editing')) return;

            const originalContent = plusBtn.innerHTML;
            plusBtn.classList.add('editing');
            plusBtn.innerHTML = '';

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'folder-creation-input';
            input.placeholder = "Name";
            input.value = "New Folder";
            
            // Select all text on focus
            setTimeout(() => input.select(), 0);

            const saveBtn = document.createElement('div');
            saveBtn.style.display = 'flex';
            saveBtn.style.cursor = 'pointer';
            saveBtn.style.marginLeft = '4px';
            saveBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

            const cancelBtn = document.createElement('div');
            cancelBtn.style.display = 'flex';
            cancelBtn.style.cursor = 'pointer';
            cancelBtn.style.marginLeft = '4px';
            cancelBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

            function save() {
                const name = input.value.trim();
                if (name) {
                    const newId = 'folder_' + Date.now();
                    folders.push({ id: newId, name: name });
                    saveFolders();
                    setActiveFolder(newId);
                }
                reset();
            }

            function reset() {
                plusBtn.classList.remove('editing');
                plusBtn.innerHTML = originalContent;
            }

            saveBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                save();
            });

            cancelBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                reset();
            });

            input.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Enter') save();
                if (e.key === 'Escape') reset();
            });
            
            input.addEventListener('click', (e) => e.stopPropagation());

            plusBtn.appendChild(input);
            plusBtn.appendChild(saveBtn);
            plusBtn.appendChild(cancelBtn);
            input.focus();
        });

        // --- Filtering Logic ---
        function getClassIdFromCard(card) {
            const link = card.querySelector('a[href*="/c/"]');
            if (link) {
                const match = link.getAttribute('href').match(/\/c\/([a-zA-Z0-9]+)/);
                return match ? match[1] : null;
            }
            return null;
        }

        function getPrimaryClassTitleFromCard(card) {
            if (!card) return 'Unknown Class';

            // Primary title used in Classroom cards
            const primary = card.querySelector('.ScpeUc');
            if (primary && primary.textContent) return primary.textContent.trim();

            // Common alternative selectors without including subtitle containers
            const alt = card.querySelector('.onkcGd') || card.querySelector('h2 .Vu2fZd.XwD7Ke') || card.querySelector('h2 a div');
            if (alt && alt.textContent) return alt.textContent.trim();

            // Last resort: first line of heading text
            const heading = card.querySelector('h2');
            if (heading && heading.textContent) {
                const firstLine = heading.textContent.split('\n').map(s => s.trim()).find(Boolean);
                if (firstLine) return firstLine;
            }

            return 'Unknown Class';
        }

        function applyClassroomFilter() {
            // Find class cards (usually li elements in an ol)
            const cards = document.querySelectorAll('ol li'); 
            
            // Find active folder
            const activeFolder = folders.find(f => f.id === activeFolderId);
            const allowedCourses = activeFolder ? (activeFolder.courseIds || []) : [];

            // Filter Main Cards
            cards.forEach(card => {
                const classId = getClassIdFromCard(card);
                if (!classId) return;

                if (activeFolderId === null) {
                    card.style.display = '';
                } else {
                    if (allowedCourses.includes(classId)) {
                        card.style.display = '';
                    } else {
                        card.style.display = 'none';
                    }
                }
            });

            // Filter Sidebar Links
            const sidebarLinks = document.querySelectorAll('.STek2d a[href*="/c/"]');
            sidebarLinks.forEach(link => {
                const match = link.getAttribute('href').match(/\/c\/([a-zA-Z0-9]+)/);
                const classId = match ? match[1] : null;
                
                if (!classId) return;

                if (activeFolderId === null) {
                    link.style.display = '';
                } else {
                    if (allowedCourses.includes(classId)) {
                        link.style.display = '';
                    } else {
                        link.style.display = 'none';
                    }
                }
            });
        }

        function checkUrl() {
            const url = window.location.href;
            const isHomePage =
                /^https:\/\/classroom\.google\.com(\/u\/\d+)?(\/h(\/.*)?)?\/?$/.test(url);;
            if (isHomePage) {
                document.body.classList.add('homebar');
            } else {
                document.body.classList.remove('homebar');
            }
        }

        let filterScheduled = false;
        let lastObservedUrl = null;
        let locationWatchTimer = null;

        function scheduleApplyClassroomFilter() {
            if (activeFolderId === null) return;
            if (filterScheduled) return;
            filterScheduled = true;
            (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb) => setTimeout(cb, 16))(() => {
                filterScheduled = false;
                applyClassroomFilter();
            });
        }

        function runLocationUpdate() {
            checkUrl();
            if (activeFolderId !== null) {
                applyClassroomFilter();
            }
        }

        function hookLocationChanges() {
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

            window.addEventListener('popstate', () => window.dispatchEvent(new Event('locationchange')));
            window.addEventListener('hashchange', () => window.dispatchEvent(new Event('locationchange')));
            window.addEventListener('locationchange', runLocationUpdate);

            lastObservedUrl = window.location.href;
            if (locationWatchTimer) clearInterval(locationWatchTimer);
            locationWatchTimer = setInterval(() => {
                const currentUrl = window.location.href;
                if (currentUrl !== lastObservedUrl) {
                    lastObservedUrl = currentUrl;
                    runLocationUpdate();
                }
            }, 250);
        }

        try {
            const bodyObserver = new MutationObserver((mutations) => {
                if (activeFolderId === null) return;

                for (const mutation of mutations) {
                    if (mutation.type !== 'childList') continue;
                    if (mutation.addedNodes.length || mutation.removedNodes.length) {
                        scheduleApplyClassroomFilter();
                        return;
                    }
                }
            });

            if (document.body) {
                bodyObserver.observe(document.body, { childList: true, subtree: true });
            } else {
                document.addEventListener('DOMContentLoaded', () => {
                    bodyObserver.observe(document.body, { childList: true, subtree: true });
                }, { once: true });
            }
        } catch (_) {}

        hookLocationChanges();
        checkUrl();
        applyClassroomFilter();
        
        renderFolders();
        if (defaultFolderId && folders.some(f => f.id === defaultFolderId)) {
            setActiveFolder(defaultFolderId);
        }
    }

    // Class Tasks removed — no host mounting required.

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initStreamsideToggleButton();
            initHomeBar();
        });
    } else {
        initStreamsideToggleButton();
        initHomeBar();
    }
})();
