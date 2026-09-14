// NEW UPDATE NOTIFICATION POPUP THING 💅
(function() {
    const UPDATE_VERSION_KEY = 'modernClassroom_updateVersion';
    const UPDATE_DISMISSED_KEY = 'modernClassroom_updateDismissedVersion';
    const LEGACY_UPDATE_VERSION_KEY = 'modernClassroomUpdateTrigger';
    const INSTALLED_VERSION_KEY = 'modernClassroom_installedVersion';
    const PREVIOUS_VERSION_KEY = 'modernClassroom_previousVersion';
    const UPDATE_TRIGGER_NUMBER = 6; 
    
    async function getStoredValue(key, defaultValue = null) {
        if (typeof storageGet === 'function') {
            return storageGet(key, defaultValue);
        }

        return new Promise((resolve) => {
            if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) {
                resolve(defaultValue);
                return;
            }
            chrome.storage.sync.get([key], (data) => {
                if (chrome.runtime?.lastError) {
                    resolve(defaultValue);
                    return;
                }
                resolve(data[key] ?? defaultValue);
            });
        });
    }
    
    async function setStoredValue(key, value) {
        if (typeof storageSet === 'function') {
            await storageSet(key, value);
            return;
        }

        return new Promise((resolve) => {
            if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) {
                resolve();
                return;
            }
            chrome.storage.sync.set({ [key]: value }, () => resolve());
        });
    }

    function getCurrentVersion() {
        try {
            return chrome?.runtime?.getManifest?.().version || null;
        } catch (_) {
            return null;
        }
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
    
    function createUpdatePopup() {
        const popup = document.createElement('div');
        popup.className = 'update-popup';
        popup.style.zIndex = '1500001';
        popup.innerHTML = `
            <div class="update-popup-content">
                <div class="update-popup-header">
                    <span class="update-popup-title">Classroom was Updated!</span> 
                    <button class="update-popup-close" aria-label="Close update notification">×</button>
                </div>
                <p class="update-popup-message" data-color style="--update-popup-message-color-light: #252525ff; --update-popup-message-color-dark: rgb(255, 255, 255);">- Fixed a bug where banner tints were not being shown</p>
                <p class="update-popup-message" data-color style="--update-popup-message-color-light: #252525ff; --update-popup-message-color-dark: rgb(255, 255, 255);">- Download button now more reliably appears</p>
                <p class="update-popup-message" data-color style="--update-popup-message-color-light: #252525ff; --update-popup-message-color-dark: rgb(255, 255, 255);">- Moved the "Class Tasks" feature to the floating notes to make it accessible anywhere</p>
                <p class="update-popup-message" data-color style="--update-popup-message-color-light: #252525ff; --update-popup-message-color-dark: rgb(255, 255, 255);">- The home page sections now appear more reliably</p>
                <p class="update-popup-message" data-color style="--update-popup-message-color-light: #252525ff; --update-popup-message-color-dark: rgb(255, 255, 255);">- Unlinked "Your Day" items no longer lead to a blank page</p>
                <p class="update-popup-message" data-color style="--update-popup-message-color-light: #252525ff; --update-popup-message-color-dark: rgb(255, 255, 255);">- Clicking on linked "Your Day" items now maintains your active logged-in account</p>
                <p class="update-popup-message" data-color style="--update-popup-message-color-light: #252525ff; --update-popup-message-color-dark: rgb(255, 255, 255);">- Clicking on linked "Your Day" items now takes you to linked classes much faster</p>
                <p class="update-popup-message" data-color style="--update-popup-message-color-light: #252525ff; --update-popup-message-color-dark: rgb(255, 255, 255);">- Updated tutorial for class tasks and other changes</p>
                <p class="update-popup-message" data-color data-empty </p>
                <p class="update-popup-message" data-color style="--update-popup-message-color-light: rgb(130 130 152); --update-popup-message-color-dark: #d1d1d1ff;">Please report any bugs or changes through the "Feedback" button in the settings. Thank you for using Modern Classroom!</p>
            </div>
        `;
        
        const closeBtn = popup.querySelector('.update-popup-close');
        closeBtn.addEventListener('click', function(e) {
            e.preventDefault();
            popup.classList.remove('show');
            popup.addEventListener('transitionend', () => {
                popup.remove();
            }, { once: true });
            markUpdatePopupDismissed().catch(() => {});
        });
        
        document.body.appendChild(popup);
        
        requestAnimationFrame(() => {
            popup.classList.add('show');
        });
    }
    
    async function checkAndShowUpdatePopup() {
        const currentVersion = getCurrentVersion();
        const [storedVersion, dismissedVersion, legacyStored, installedVersion, previousVersion] = await Promise.all([
            getStoredValue(UPDATE_VERSION_KEY, null),
            getStoredValue(UPDATE_DISMISSED_KEY, null),
            getStoredValue(LEGACY_UPDATE_VERSION_KEY, null),
            getStoredValue(INSTALLED_VERSION_KEY, null),
            getStoredValue(PREVIOUS_VERSION_KEY, null)
        ]);

        const storedVersionNum = normalizeVersion(storedVersion);
        const dismissedVersionNum = normalizeVersion(dismissedVersion);
        const legacyStoredNum = normalizeVersion(legacyStored);

        if (!currentVersion) {
            return;
        }

        // Rely only on the legacy numeric trigger system.
        // Show the popup only when the stored legacy trigger does not match
        // the current `UPDATE_TRIGGER_NUMBER` the developer sets.
        const legacyAcknowledged = (legacyStoredNum === UPDATE_TRIGGER_NUMBER);

        if (!legacyAcknowledged) {
            // Do not auto-mark as seen here; marking is handled when the
            // user dismisses the popup so that we only set the legacy key
            // once they've acknowledged the notes.
            createUpdatePopup();
        }
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkAndShowUpdatePopup);
    } else {
        checkAndShowUpdatePopup().catch(() => {});
    }
    
    window.resetModernClassroomUpdatePopup = function() {
        Promise.all([
            setStoredValue(UPDATE_VERSION_KEY, null),
            setStoredValue(UPDATE_DISMISSED_KEY, null),
            setStoredValue(LEGACY_UPDATE_VERSION_KEY, null)
        ]).catch(() => {});
        console.log('Update popup reset. It will show again on next reload.');
    };
})();
