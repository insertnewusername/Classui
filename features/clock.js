(function () {
    const WIDGET_CLASS = 'mc-clock-widget';
    const TIME_CLASS = 'mc-clock-time';
    const DATE_CLASS = 'mc-clock-date';
    const WEATHER_CLASS = 'mc-clock-weather';
    const TEMP_CLASS = 'mc-clock-temp';
    const ICON_CLASS = 'mc-clock-weather-icon';
    const CONTENT_CLASS = 'mc-clock-content';
    const SETTINGS_CLASS = 'mc-clock-settings';

    const WEATHER_ICON_MAP = {
        0: '☀️',
        1: '⛅',
        2: '⛅',
        3: '⛅',
        51: '🌦️',
        53: '🌦️',
        55: '🌦️',
        61: '🌧️',
        63: '🌧️',
        65: '🌧️',
        71: '❄️',
        73: '❄️',
        75: '❄️',
        95: '⛈️',
        96: '⛈️',
        99: '⛈️'
    };

    let widgetInstance = null;
    let weatherRequestPromise = null;
    let weatherCache = null;
    let weatherCacheExpiresAt = 0;
    let use24HourFormat = false;
    let useFahrenheit = false;
    let useHeroClock = true;
    let heroClockAlignment = 'center';
    let heroClockSize = 'medium';
    let heroClockFont = 'google-sans';
    let heroClockColour = null;

    function loadTimeFormat() {
        const stored = localStorage.getItem('modernClassroom_clockFormat');
        use24HourFormat = stored === '24h';
    }

    function saveTimeFormat() {
        localStorage.setItem('modernClassroom_clockFormat', use24HourFormat ? '24h' : '12h');
    }

    function loadTempUnit() {
        const stored = localStorage.getItem('modernClassroom_clockTempUnit');
        useFahrenheit = stored === 'f';
    }

    function saveTempUnit() {
        localStorage.setItem('modernClassroom_clockTempUnit', useFahrenheit ? 'f' : 'c');
    }

function loadClockLayout() {
    const stored = localStorage.getItem('modernClassroom_clockLayout');

    if (stored === null) {
        useHeroClock = true;
        saveClockLayout();
    } else {
        useHeroClock = stored === 'hero';
    }
}

    function saveClockLayout() {
        localStorage.setItem('modernClassroom_clockLayout', useHeroClock ? 'hero' : 'pill');
    }

    function loadHeroClockAppearance() {
        heroClockAlignment = localStorage.getItem('modernClassroom_clockAlignment') === 'left' ? 'left' : 'center';
        const storedSize = localStorage.getItem('modernClassroom_clockSize');
        heroClockSize = ['small', 'medium', 'large'].includes(storedSize) ? storedSize : 'medium';
        const storedFont = localStorage.getItem('modernClassroom_clockFont');
        const validFonts = ['default', 'roboto', 'cursive', 'fantasy', 'math', 'monospace', 'sans-serif'];
        heroClockFont = validFonts.includes(storedFont) ? storedFont : 'default';
        const storedColour = localStorage.getItem('modernClassroom_clockColour');
        heroClockColour = /^#[0-9a-f]{6}$/i.test(storedColour || '') ? storedColour.toLowerCase() : null;
    }

    function saveHeroClockAppearance() {
        localStorage.setItem('modernClassroom_clockAlignment', heroClockAlignment);
        localStorage.setItem('modernClassroom_clockSize', heroClockSize);
        localStorage.setItem('modernClassroom_clockFont', heroClockFont);
        if (heroClockColour) localStorage.setItem('modernClassroom_clockColour', heroClockColour);
        else localStorage.removeItem('modernClassroom_clockColour');
    }

    function hideTitlebarHomeLink() {
        const link = document.querySelector('a[data-focus-id="titlebar-home"][href="/h"], a[href="/h"][data-focus-id="titlebar-home"]');
        if (!link) return;
        link.style.display = 'none !important';
        link.style.visibility = 'hidden';
        link.style.pointerEvents = 'none';
        link.setAttribute('aria-hidden', 'true');
        link.setAttribute('tabindex', '-1');
        link.removeAttribute('href');
        link.classList.add('mc-hidden-titlebar-home');
    }

    function createWidget() {
        const widget = document.createElement('div');
        widget.className = WIDGET_CLASS;
        widget.dataset.mcClockWidget = 'true';
        widget.setAttribute('aria-live', 'polite');
        widget.innerHTML = `
            <div class="${CONTENT_CLASS}">
                <span class="${TIME_CLASS}">--:--</span>
                <span class="${DATE_CLASS}">--</span>
                <span class="${WEATHER_CLASS}">
                    <span class="${ICON_CLASS}" aria-hidden="true">☁️</span>
                    <span class="${TEMP_CLASS}">--</span>
                </span>
            </div>
            <div class="${SETTINGS_CLASS}">
                <div class="mc-clock-setting-item mc-clock-layout-setting">
                    <div class="mc-clock-layout-toggle">
                        <button class="mc-clock-layout-btn mc-clock-layout-pill active" data-layout="pill">Collapsed</button>
                        <button class="mc-clock-layout-btn mc-clock-layout-hero" data-layout="hero">Expanded</button>
                    </div>
                </div>
                <div class="mc-clock-setting-item">
                    <div class="mc-clock-format-toggle">
                        <button class="mc-clock-format-btn mc-clock-format-12h active" data-format="12h">12h</button>
                        <button class="mc-clock-format-btn mc-clock-format-24h" data-format="24h">24h</button>
                    </div>
                </div>
                <div class="mc-clock-setting-item">
                    <div class="mc-clock-temp-toggle">
                        <button class="mc-clock-temp-btn mc-clock-temp-c active" data-unit="c">°C</button>
                        <button class="mc-clock-temp-btn mc-clock-temp-f" data-unit="f">°F</button>
                    </div>
                </div>
                <div class="mc-clock-setting-item mc-clock-hero-setting mc-clock-colour-setting">
                    <button type="button" class="mc-clock-colour-trigger" aria-label="Choose clock colour" aria-expanded="false">
                        <span class="mc-clock-colour-swatch" aria-hidden="true"></span>
                    </button>
                    <div class="mc-clock-colour-picker" hidden></div>
                </div>
                <div class="mc-clock-setting-item mc-clock-hero-setting">
                    <div class="mc-clock-size-toggle">
                        <button class="mc-clock-size-btn mc-clock-size-small" data-size="small" aria-label="Small clock">S</button>
                        <button class="mc-clock-size-btn mc-clock-size-medium active" data-size="medium" aria-label="Medium clock">M</button>
                        <button class="mc-clock-size-btn mc-clock-size-large" data-size="large" aria-label="Large clock">L</button>
                    </div>
                </div>
                <div class="mc-clock-setting-item mc-clock-hero-setting">
                    <div class="mc-clock-alignment-toggle">
                        <button class="mc-clock-alignment-btn mc-clock-align-left" data-alignment="left" aria-label="Left-align clock">Left</button>
                        <button class="mc-clock-alignment-btn mc-clock-align-center active" data-alignment="center" aria-label="Centre clock">Centred</button>
                    </div>
                </div>
                <div class="mc-clock-setting-item mc-clock-hero-setting">
                    <select id="mc-clock-font-select" class="mc-clock-font-select" aria-label="Clock font">
                        <option value="default">Default (Google Sans)</option>
                        <option value="roboto">Roboto</option>
                        <option value="cursive">Cursive</option>
                        <option value="fantasy">Fantasy</option>
                        <option value="math">Math</option>
                        <option value="monospace">Monospace</option>
                        <option value="sans-serif">Sans Serif</option>
                    </select>
                </div>
            </div>
        `;
        widget.style.cursor = 'pointer';
        return widget;
    }

    function getHeroClockContainer() {
        return document.querySelector('main.T9UoTd.YHNy6b');
    }

    function isHomePage() {
        return /^(?:\/u\/\d+)?\/h(?:\/.*)?\/?$/.test(window.location.pathname);
    }

    function applyClockLayout(widget) {
        if (!widget || !document.body) return;

        const heroContainer = getHeroClockContainer();
        // The hero clock is a home-page treatment. Keep the compact pill on
        // Classroom's other routes even when the hero preference is enabled.
        const shouldUseHeroLayout = useHeroClock && isHomePage() && heroContainer;
        const fontFamilyMap = {
            default: '"Google Sans", "Segoe UI", Roboto, Arial, sans-serif',
            roboto: 'Roboto, "Segoe UI", Arial, sans-serif',
            cursive: 'cursive',
            fantasy: 'fantasy',
            math: '"Cambria Math", "STIX Two Math", serif',
            monospace: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
            'sans-serif': 'sans-serif'
        };

        document.body.classList.toggle('expclock', shouldUseHeroLayout);
        widget.classList.toggle('mc-clock-hero', shouldUseHeroLayout);
        widget.classList.toggle('mc-clock-align-left', heroClockAlignment === 'left');
        widget.classList.toggle('mc-clock-align-center', heroClockAlignment === 'center');
        widget.classList.toggle('mc-clock-size-small', heroClockSize === 'small');
        widget.classList.toggle('mc-clock-size-medium', heroClockSize === 'medium');
        widget.classList.toggle('mc-clock-size-large', heroClockSize === 'large');
        widget.style.setProperty('--mc-clock-hero-font-family', fontFamilyMap[heroClockFont] || 'inherit');
        if (heroClockColour) widget.style.setProperty('--mc-clock-hero-color', heroClockColour);
        else widget.style.removeProperty('--mc-clock-hero-color');

        const destination = shouldUseHeroLayout ? heroContainer : document.body;
        if (shouldUseHeroLayout) {
            // Keep Classroom's own header as the first child. Its renderer
            // reuses that position when expandable sections change state.
            const nativeHeader = heroContainer.querySelector(':scope > [data-role="header"]');
            if (nativeHeader) {
                if (widget.previousElementSibling !== nativeHeader) {
                    nativeHeader.insertAdjacentElement('afterend', widget);
                }
            } else if (widget.parentElement !== destination) {
                destination.prepend(widget);
            }
        } else if (widget.parentElement !== destination) {
            destination.prepend(widget);
        }
    }

    function ensureWidget() {
        if (widgetInstance && widgetInstance.isConnected) {
            return widgetInstance;
        }

        if (!document.body) {
            return null;
        }

        const existing = document.querySelector(`.${WIDGET_CLASS}`);
        if (existing) {
            widgetInstance = existing;
            return widgetInstance;
        }

        widgetInstance = createWidget();
        document.body.appendChild(widgetInstance);
        return widgetInstance;
    }

    function updateClock(widget) {
        if (!widget) return;
        const timeEl = widget.querySelector(`.${TIME_CLASS}`);
        const dateEl = widget.querySelector(`.${DATE_CLASS}`);
        if (!timeEl || !dateEl) return;

        const now = new Date();
        const hours = now.getHours();
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const displayHours = use24HourFormat ? hours : (hours % 12 || 12);
        timeEl.textContent = `${displayHours}:${minutes}`;
        dateEl.textContent = new Intl.DateTimeFormat([], {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
        }).format(now);
    }

    function getWeatherIcon(code) {
        return WEATHER_ICON_MAP[code] || '☁️';
    }

    function fetchWeatherForCoordinates(latitude, longitude) {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&temperature_unit=celsius&timezone=auto`;
        return fetch(url)
            .then((response) => (response.ok ? response.json() : null))
            .then((data) => {
                const current = data && data.current ? data.current : null;
                return {
                    temp: current && Number.isFinite(Number(current.temperature_2m)) ? Math.round(Number(current.temperature_2m)) : null,
                    code: current && Number.isFinite(Number(current.weather_code)) ? Number(current.weather_code) : null
                };
            })
            .catch(() => ({ temp: null, code: null }));
    }

    function convertTemp(celsius) {
        if (useFahrenheit) {
            return Math.round((celsius * 9 / 5) + 32);
        }
        return celsius;
    }

    function updateWeather(widget) {
        if (!widget) return;

        const tempEl = widget.querySelector(`.${TEMP_CLASS}`);
        const iconEl = widget.querySelector(`.${ICON_CLASS}`);
        if (!tempEl || !iconEl) return;

        const now = Date.now();
        if (weatherCache && now < weatherCacheExpiresAt) {
            const displayTemp = weatherCache.temp === null ? '—' : `${convertTemp(weatherCache.temp)}°`;
            tempEl.textContent = displayTemp;
            iconEl.textContent = getWeatherIcon(weatherCache.code);
            return;
        }

        if (weatherRequestPromise) {
            weatherRequestPromise.then(() => updateWeather(widget));
            return;
        }

        weatherRequestPromise = Promise.resolve().then(async () => {
            const finish = (temp, code) => {
                weatherCache = { temp, code };
                weatherCacheExpiresAt = Date.now() + 30 * 60 * 1000;
            };

            if (navigator.geolocation) {
                try {
                    const position = await new Promise((resolve) => {
                        navigator.geolocation.getCurrentPosition(
                            (pos) => resolve(pos),
                            () => resolve(null),
                            { enableHighAccuracy: false, timeout: 8000, maximumAge: 30 * 60 * 1000 }
                        );
                    });

                    if (position && position.coords) {
                        const { latitude, longitude } = position.coords;
                        if (latitude && longitude) {
                            const weather = await fetchWeatherForCoordinates(latitude, longitude);
                            finish(weather.temp, weather.code);
                            return;
                        }
                    }
                } catch (_) {}
            }

            try {
                const response = await fetch('https://ipapi.co/json/');
                if (response.ok) {
                    const data = await response.json();
                    if (data && Number.isFinite(Number(data.latitude)) && Number.isFinite(Number(data.longitude))) {
                        const weather = await fetchWeatherForCoordinates(Number(data.latitude), Number(data.longitude));
                        finish(weather.temp, weather.code);
                        return;
                    }
                }
            } catch (_) {}

            finish(null, null);
        }).finally(() => {
            weatherRequestPromise = null;
        });

        weatherRequestPromise.then(() => {
            if (!tempEl || !iconEl) return;
            if (weatherCache && weatherCache.temp !== null) {
                tempEl.textContent = `${convertTemp(weatherCache.temp)}°`;
                iconEl.textContent = getWeatherIcon(weatherCache.code);
            } else {
                tempEl.textContent = '—';
                iconEl.textContent = '☁️';
            }
        });
    }

    function toggleClockExpanded(widget) {
        widget.classList.toggle('mc-clock-expanded');
    }

    function collapseClockIfExpanded(widget, event) {
        if (widget.classList.contains('mc-clock-expanded') && !widget.contains(event.target)) {
            widget.classList.remove('mc-clock-expanded');
        }
    }

    function setupFormatToggle(widget) {
        const formatBtns = widget.querySelectorAll('.mc-clock-format-btn');
        formatBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const format = btn.dataset.format;
                use24HourFormat = format === '24h';
                saveTimeFormat();

                // Update button states
                formatBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Update time display
                updateClock(widget);
            });
        });

        // Set initial button state
        const activeBtn = widget.querySelector(use24HourFormat ? '.mc-clock-format-24h' : '.mc-clock-format-12h');
        if (activeBtn) {
            formatBtns.forEach(b => b.classList.remove('active'));
            activeBtn.classList.add('active');
        }
    }

    function setupTempToggle(widget) {
        const tempBtns = widget.querySelectorAll('.mc-clock-temp-btn');
        tempBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const unit = btn.dataset.unit;
                useFahrenheit = unit === 'f';
                saveTempUnit();

                // Update button states
                tempBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Update weather display
                updateWeather(widget);
            });
        });

        // Set initial button state
        const activeBtn = widget.querySelector(useFahrenheit ? '.mc-clock-temp-f' : '.mc-clock-temp-c');
        if (activeBtn) {
            tempBtns.forEach(b => b.classList.remove('active'));
            activeBtn.classList.add('active');
        }
    }

    function setupLayoutToggle(widget) {
        const layoutBtns = widget.querySelectorAll('.mc-clock-layout-btn');
        layoutBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                useHeroClock = btn.dataset.layout === 'hero';
                saveClockLayout();
                widget.classList.remove('mc-clock-expanded');
                applyClockLayout(widget);
                layoutBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        const activeBtn = widget.querySelector(useHeroClock ? '.mc-clock-layout-hero' : '.mc-clock-layout-pill');
        if (activeBtn) {
            layoutBtns.forEach(b => b.classList.remove('active'));
            activeBtn.classList.add('active');
        }
    }

    function setupHeroAppearanceToggles(widget) {
        const alignmentBtns = widget.querySelectorAll('.mc-clock-alignment-btn');
        const sizeBtns = widget.querySelectorAll('.mc-clock-size-btn');
        const fontSelect = widget.querySelector('.mc-clock-font-select');
        const colourTrigger = widget.querySelector('.mc-clock-colour-trigger');
        const colourPickerEl = widget.querySelector('.mc-clock-colour-picker');

        if (colourTrigger && colourPickerEl && window.MCColourPicker) {
            const defaultColour = document.body.classList.contains('dark-mode') ? '#ffffff' : '#33415f';
            let restoringDefault = false;
            const picker = window.MCColourPicker.create({
                container: colourPickerEl,
                initialColor: heroClockColour || defaultColour,
                title: 'Clock colour',
                defaultColor: defaultColour,
                onColorChange: (colour) => {
                    if (restoringDefault) return;
                    heroClockColour = colour;
                    saveHeroClockAppearance();
                    applyClockLayout(widget);
                    colourTrigger.querySelector('.mc-clock-colour-swatch').style.backgroundColor = colour;
                },
                onDefault: () => {
                    heroClockColour = null;
                    saveHeroClockAppearance();
                    applyClockLayout(widget);
                    restoringDefault = true;
                    picker.setColor(defaultColour, 'default');
                    restoringDefault = false;
                    colourTrigger.querySelector('.mc-clock-colour-swatch').style.backgroundColor = '';
                }
            });

            colourTrigger.querySelector('.mc-clock-colour-swatch').style.backgroundColor = heroClockColour || '';
            colourTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const isHidden = colourPickerEl.hidden;
                colourPickerEl.hidden = !isHidden;
                colourTrigger.setAttribute('aria-expanded', String(isHidden));
            });
        }

        alignmentBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                heroClockAlignment = btn.dataset.alignment === 'left' ? 'left' : 'center';
                saveHeroClockAppearance();
                applyClockLayout(widget);
                alignmentBtns.forEach(b => b.classList.toggle('active', b === btn));
            });
        });

        sizeBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                heroClockSize = ['small', 'medium', 'large'].includes(btn.dataset.size) ? btn.dataset.size : 'medium';
                saveHeroClockAppearance();
                applyClockLayout(widget);
                sizeBtns.forEach(b => b.classList.toggle('active', b === btn));
            });
        });

        if (fontSelect) {
            fontSelect.value = heroClockFont;
            fontSelect.addEventListener('change', (e) => {
                e.stopPropagation();
                const nextFont = ['default', 'roboto', 'cursive', 'fantasy', 'math', 'monospace', 'sans-serif'].includes(fontSelect.value)
                    ? fontSelect.value
                    : 'default';
                heroClockFont = nextFont;
                saveHeroClockAppearance();
                applyClockLayout(widget);
            });
        }

        alignmentBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.alignment === heroClockAlignment));
        sizeBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.size === heroClockSize));
    }

    function startClock() {
        loadTimeFormat();
        loadTempUnit();
        loadClockLayout();
        loadHeroClockAppearance();
        let widget = ensureWidget();
        if (!widget) {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', startClock, { once: true });
            }
            return;
        }

        function setupWidget(widgetToSetup) {
            setupFormatToggle(widgetToSetup);
            setupTempToggle(widgetToSetup);
            setupLayoutToggle(widgetToSetup);
            setupHeroAppearanceToggles(widgetToSetup);

            widgetToSetup.addEventListener('click', (e) => {
                if (!e.target.closest(`.${CONTENT_CLASS}`)) return;
                if (!e.target.closest('.mc-clock-format-btn') && !e.target.closest('.mc-clock-temp-btn') && !e.target.closest('.mc-clock-layout-btn') && !e.target.closest('.mc-clock-alignment-btn') && !e.target.closest('.mc-clock-size-btn') && !e.target.closest('.mc-clock-font-select') && !e.target.closest('.mc-clock-colour-setting')) {
                    toggleClockExpanded(widgetToSetup);
                }
            });
        }

        hideTitlebarHomeLink();
        setupWidget(widget);
        applyClockLayout(widget);
        updateClock(widget);
        updateWeather(widget);
        setInterval(() => updateClock(widget), 1000);
        setInterval(() => updateWeather(widget), 30 * 60 * 1000);

        // Add click outside handler to collapse
        document.addEventListener('click', (e) => collapseClockIfExpanded(widget, e));

        const observer = new MutationObserver(() => {
            hideTitlebarHomeLink();
            const widgetWasReplaced = !widget.isConnected
                || !widget.classList.contains(WIDGET_CLASS)
                || !widget.querySelector(`.${CONTENT_CLASS}`);

            if (widgetWasReplaced) {
                // Expanding a native section can cause Classroom to recycle the
                // clock's node as its header. Create a fresh widget rather than
                // modifying that native header.
                widgetInstance = null;
                widget = ensureWidget();
                if (!widget) return;
                setupWidget(widget);
                updateClock(widget);
                updateWeather(widget);
            }

            applyClockLayout(widget);
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startClock, { once: true });
    } else {
        startClock();
    }
})();
