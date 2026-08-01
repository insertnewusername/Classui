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
            </div>
        `;
        widget.style.cursor = 'pointer';
        return widget;
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
            weekday: 'short',
            month: 'short',
            day: 'numeric'
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

    function startClock() {
        loadTimeFormat();
        loadTempUnit();
        const widget = ensureWidget();
        if (!widget) {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', startClock, { once: true });
            }
            return;
        }

        hideTitlebarHomeLink();
        setupFormatToggle(widget);
        setupTempToggle(widget);
        updateClock(widget);
        updateWeather(widget);
        setInterval(() => updateClock(widget), 1000);
        setInterval(() => updateWeather(widget), 30 * 60 * 1000);

        // Add click handler for expansion
        widget.addEventListener('click', (e) => {
            if (!e.target.closest('.mc-clock-format-btn') && !e.target.closest('.mc-clock-temp-btn')) {
                toggleClockExpanded(widget);
            }
        });

        // Add click outside handler to collapse
        document.addEventListener('click', (e) => collapseClockIfExpanded(widget, e));

        const observer = new MutationObserver(() => {
            hideTitlebarHomeLink();
            if (!widget.isConnected) {
                widgetInstance = null;
                ensureWidget();
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startClock, { once: true });
    } else {
        startClock();
    }
})();
