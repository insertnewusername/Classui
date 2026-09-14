// UPDATE CHECKER - Detects when updates are available from Chrome servers
(function() {
    const UPDATE_AVAILABLE_KEY = 'modernClassroom_updateAvailable';
    const UPDATE_PENDING_VERSION_KEY = 'modernClassroom_updatePendingVersion';
    const UPDATE_AVAILABLE_DISMISSED_KEY = 'modernClassroom_updateAvailableDismissed';

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

    function createUpdateAvailablePrompt() {
        if (document.querySelector('.update-available-prompt')) {
            return;
        }

        const prompt = document.createElement('div');
        prompt.className = 'update-available-prompt';
        prompt.style.zIndex = '1500002';
        prompt.innerHTML = `
            <div class="update-available-content">
                <div class="update-available-header">
                    <span class="update-available-title">Update Available</span>
                </div>
                <p class="update-available-message">A newer version of Modern Classroom is available - Please update to get the latest bug fixes and/or new features</p>
                <div class="update-available-actions">
                    <button class="update-available-update-btn">Update Now</button>
                    <button class="update-available-later-btn">Later</button>
                </div>
            </div>
        `;

        const laterBtn = prompt.querySelector('.update-available-later-btn');
        const updateBtn = prompt.querySelector('.update-available-update-btn');

        laterBtn.addEventListener('click', function(e) {
            e.preventDefault();
            dismissPrompt();
            setStoredValue(UPDATE_AVAILABLE_KEY, false).catch(() => {});
            setStoredValue(UPDATE_AVAILABLE_DISMISSED_KEY, true).catch(() => {});
        });

        updateBtn.addEventListener('click', function(e) {
            e.preventDefault();
            setStoredValue(UPDATE_AVAILABLE_KEY, false).catch(() => {});
            setStoredValue(UPDATE_AVAILABLE_DISMISSED_KEY, true).catch(() => {});
            try {
                if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
                    chrome.runtime.sendMessage({ action: 'applyUpdate' }, () => {});
                }
            } catch (_) {}
            dismissPrompt();
        });

        function dismissPrompt() {
            prompt.classList.remove('show');
            prompt.addEventListener('transitionend', () => {
                prompt.remove();
            }, { once: true });
        }

        document.body.appendChild(prompt);

        requestAnimationFrame(() => {
            prompt.classList.add('show');
        });
    }

    async function checkForUpdatePrompt() {
        const updateAvailable = await getStoredValue(UPDATE_AVAILABLE_KEY, false);
        const dismissed = await getStoredValue(UPDATE_AVAILABLE_DISMISSED_KEY, false);
        if (updateAvailable && !dismissed) {
            createUpdateAvailablePrompt();
        }
    }

    // Listen for messages from background script about available updates
    if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
            if (msg.action === 'updateAvailable') {
                getStoredValue(UPDATE_AVAILABLE_DISMISSED_KEY, false).then((dismissed) => {
                    if (dismissed) {
                        return;
                    }
                    createUpdateAvailablePrompt();
                    setStoredValue(UPDATE_AVAILABLE_KEY, true).catch(() => {});
                    setStoredValue(UPDATE_PENDING_VERSION_KEY, msg.version || null).catch(() => {});
                }).catch(() => {});
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkForUpdatePrompt);
    } else {
        checkForUpdatePrompt().catch(() => {});
    }
})();
