// Bootstrap placeholder.
// Main functionality has been split into feature modules in the `features/` folder.

// Run migration to cloud sync storage so existing local data survives reinstalls.
if (typeof migrateAllToSync === 'function') {
	migrateAllToSync().catch(err => {
		console.warn('Migration to cloud sync storage failed:', err);
	});
}

// Scroll and cursor proximity transform for `.WQqwid` elements
(function() {
	const TARGET_CLASS = 'WQqwid';
	const SCROLLED_CLASS = 'mc-scrolled';
	const PROXIMITY_PX = 60; // reduced distance in px to restore when cursor is near
	const DOWN_THRESHOLD = 6; // px to consider a meaningful downward scroll
	const UP_THRESHOLD = 8; // px upward scroll needed to restore
	const TOP_THRESHOLD = 20; // consider "at top" when within these px

	let lastY = typeof window !== 'undefined' ? (window.scrollY || window.pageYOffset || 0) : 0;
	let ticking = false;

	function onAddScrolled(el, y) {
		el.classList.add(SCROLLED_CLASS);
		try { el.dataset.mcScrolledAt = String(Number(y) || 0); } catch (e) { el._mcScrolledAt = Number(y) || 0; }
	}

	function onRemoveScrolled(el) {
		el.classList.remove(SCROLLED_CLASS);
		try { delete el.dataset.mcScrolledAt; } catch (e) { el._mcScrolledAt = undefined; }
	}

	function getScrolledAt(el) {
		try { return Number(el.dataset.mcScrolledAt || el._mcScrolledAt || 0); } catch (e) { return Number(el._mcScrolledAt || 0); }
	}

	function updateForScroll() {
		const y = window.scrollY || window.pageYOffset || 0;
		const delta = y - lastY;

		document.querySelectorAll('.' + TARGET_CLASS).forEach(el => {
			const has = el.classList.contains(SCROLLED_CLASS);

			if (delta > DOWN_THRESHOLD) {
				// user scrolled down — apply shrink
				if (!has) onAddScrolled(el, y);
			} else if (delta < -DOWN_THRESHOLD) {
				// user scrolled up sufficiently — only restore if they've scrolled up enough relative to when it was shrunk
				const scAt = getScrolledAt(el);
				const scrolledUpEnough = (scAt && y < scAt - UP_THRESHOLD) || y <= TOP_THRESHOLD;
				if (has && scrolledUpEnough) onRemoveScrolled(el);
			}
			// otherwise: no significant movement — keep current state
		});

		lastY = y;
	}

	window.addEventListener('scroll', () => {
		if (!ticking) {
			window.requestAnimationFrame(() => {
				updateForScroll();
				ticking = false;
			});
			ticking = true;
		}
	}, { passive: true });

	// Also restore immediately when user scrolls upward with wheel/trackpad
	window.addEventListener('wheel', (ev) => {
		if (ev.deltaY < 0) {
			document.querySelectorAll('.' + TARGET_CLASS).forEach(el => {
				if (el.classList.contains(SCROLLED_CLASS)) onRemoveScrolled(el);
			});
		}
	}, { passive: true });

	// Restore when cursor gets near an element
	window.addEventListener('mousemove', (ev) => {
		const mx = ev.clientX;
		const my = ev.clientY;
		document.querySelectorAll('.' + TARGET_CLASS).forEach(el => {
			const r = el.getBoundingClientRect();
			const dx = Math.max(r.left - mx, mx - r.right, 0);
			const dy = Math.max(r.top - my, my - r.bottom, 0);
			const dist = Math.hypot(dx, dy);
			if (dist < PROXIMITY_PX) {
				onRemoveScrolled(el);
			}
		});
	}, { passive: true });

	// Also restore on direct pointer enter (covers touch/pointer interactions)
	document.addEventListener('pointerenter', (ev) => {
		const el = ev.target.closest && ev.target.closest('.' + TARGET_CLASS);
		if (el) onRemoveScrolled(el);
	}, true);

	// Safety: restore on touchstart
	window.addEventListener('touchstart', () => {
		document.querySelectorAll('.' + TARGET_CLASS).forEach(el => onRemoveScrolled(el));
	}, { passive: true });

	// Initialize once in case page already scrolled
	try { updateForScroll(); } catch (e) { /* noop */ }
})();
