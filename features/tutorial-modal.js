const STORAGE_KEY = "modernClassroom_tutorialSeen";
const LEGACY_STORAGE_KEY = "classroomTutorialSeen";

window.showClassroomTutorial = function() {
    if (document.querySelector('.tutorial-overlay')) return;

    const baseUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
        ? chrome.runtime.getURL('Tutorial/')
        : 'Tutorial/';

    const features = typeof window.getTutorialFeatures === 'function'
        ? window.getTutorialFeatures(baseUrl)
        : [];

    let selectedFeature = 0;

    const overlay = document.createElement("div");
    overlay.className = "tutorial-overlay";

    const modal = document.createElement("div");
    modal.className = "tutorial-modal";
    modal.style.padding = "20px";
    modal.style.height = "70%";
    modal.style.paddingBottom = "0px";

    // Close button
    const closeBtn = document.createElement("div");
    closeBtn.className = "tutorial-close";
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", () => {
        overlay.remove();
        if (typeof storageSetBool === 'function') {
            storageSetBool(STORAGE_KEY, true);
            storageSetBool(LEGACY_STORAGE_KEY, true);
        } else {
            try { localStorage.setItem(STORAGE_KEY, "true"); } catch(_) {}
            try { localStorage.setItem(LEGACY_STORAGE_KEY, "true"); } catch(_) {}
        }
    });
    modal.appendChild(closeBtn);

    // Main container
    const container = document.createElement("div");
    container.className = "tutorial-container";

    // Left sidebar with feature list
    let sidebar = document.createElement("div");
    sidebar.className = "tutorial-sidebar";
    sidebar.style.display = "grid";
    sidebar.style.gridTemplateColumns = "1fr 1fr";
    sidebar.style.gap = "4px";
    sidebar.style.padding = "2px";
    sidebar.style.gridAutoFlow = "row";
    sidebar.style.alignContent = "start";
    sidebar.style.overflow = "scroll";
    sidebar.style.minWidth = "200px";
    sidebar.style.maxWidth = "200px";
    sidebar.style.width = "200px";


    features.forEach((feature, index) => {
        const item = document.createElement("div");
        item.className = "tutorial-feature-item";
        item.style.display = "flex";
        item.style.flexDirection = "column";
        item.style.alignItems = "center";
        item.style.justifyContent = "center";
        item.style.gap = "6px";
        item.style.padding = "6px 10px";
        item.style.textAlign = "center";
        item.style.cursor = "pointer";
        item.style.borderRadius = "8px";
        item.style.transition = "all 0.2s";
        if (index === 0) item.classList.add("active");
        
        const label = document.createElement("span");
        label.textContent = feature.title;
        label.style.fontSize = "12px";
        label.style.fontWeight = "500";
        label.style.wordWrap = "break-word";
        label.style.lineHeight = "1.2";
        label.style.textAlign = "center";
        item.appendChild(label);
        
        item.addEventListener("click", () => {
            // Update active item
            sidebar.querySelectorAll(".tutorial-feature-item").forEach(el => el.classList.remove("active"));
            item.classList.add("active");
            
            // Update content panel
            rightPanel.querySelectorAll(".tutorial-panel").forEach(el => el.classList.remove("active"));
            document.getElementById(`panel-${feature.id}`).classList.add("active");
            selectedFeature = index;
        });
        
        sidebar.appendChild(item);
    });

    // Right panel with content
    const rightPanel = document.createElement("div");
    rightPanel.className = "tutorial-content";

    const normalizeImageSize = (value, fallbackUnit = '%') => {
        if (value === undefined || value === null) return '';
        if (typeof value === 'number' && Number.isFinite(value)) return `${value}${fallbackUnit}`;
        const raw = String(value).trim();
        if (!raw) return '';
        return /^\d+(\.\d+)?$/.test(raw) ? `${raw}${fallbackUnit}` : raw;
    };

    features.forEach((feature) => {
        const panel = document.createElement("div");
        panel.id = `panel-${feature.id}`;
        panel.className = "tutorial-panel";
        if (feature === features[0]) panel.classList.add("active");

        // Always add title first
        const titleEl = document.createElement("h2");
        titleEl.className = "tutorial-feature-title";
        titleEl.textContent = feature.title;
        panel.appendChild(titleEl);

        // Render content blocks
        feature.content.forEach((block) => {
            if (block.type === 'text') {
                const textEl = document.createElement("p");
                textEl.className = "tutorial-feature-text";
                textEl.textContent = block.text;
                panel.appendChild(textEl);
            } else if (block.type === 'break') {
                const spacerEl = document.createElement('div');
                const rawSize = Number(block.size);
                const size = Number.isFinite(rawSize) ? Math.max(0, rawSize) : 16;
                spacerEl.style.height = `${size}px`;
                spacerEl.setAttribute('aria-hidden', 'true');
                panel.appendChild(spacerEl);
            } else if (block.type === 'image') {
                const imgEl = document.createElement("img");
                imgEl.className = "tutorial-feature-image";
                imgEl.src = block.src;
                imgEl.alt = feature.title;
                const width = normalizeImageSize(block.width, '%');
                const height = normalizeImageSize(block.height, 'px');
                if (width) imgEl.style.width = width;
                if (height) imgEl.style.height = height;
                panel.appendChild(imgEl);
            }
        });

        rightPanel.appendChild(panel);
    });

    container.appendChild(sidebar);
    container.appendChild(rightPanel);
    modal.appendChild(container);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
};

(function autoLaunchTutorial() {
    const launch = () => {
        try {
            if (typeof storageGetBool === 'function') {
                Promise.all([
                    storageGetBool(STORAGE_KEY, false),
                    storageGetBool(LEGACY_STORAGE_KEY, false)
                ]).then(([modernSeen, legacySeen]) => {
                    if (!modernSeen && !legacySeen) {
                        window.showClassroomTutorial();
                    }
                }).catch(() => {});
                return;
            }

            const seen = (() => {
                try {
                    return localStorage.getItem(STORAGE_KEY) === 'true' || localStorage.getItem(LEGACY_STORAGE_KEY) === 'true';
                } catch (_) {
                    return false;
                }
            })();

            if (!seen) {
                window.showClassroomTutorial();
            }
        } catch (_) {}
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', launch, { once: true });
    } else {
        launch();
    }
})();


