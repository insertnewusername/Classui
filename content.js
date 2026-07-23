// Bootstrap placeholder.
// Main functionality has been split into feature modules in the `features/` folder.

// Run migration to cloud sync storage so existing local data survives reinstalls
if (typeof migrateAllToSync === 'function') {
	migrateAllToSync().catch(err => {
		console.warn('Migration to cloud sync storage failed:', err);
	});
}

// ===== LIQUID GLASS CURSOR TRACKING =====
(function trackGlassCursor() {
    function updateGlassCursor(event) {
        const target = event.currentTarget;
        const rect = target.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 100;
        const y = ((event.clientY - rect.top) / rect.height) * 100;
        target.style.setProperty('--mouse-x', x + '%');
        target.style.setProperty('--mouse-y', y + '%');
    }

    function attachGlassListeners() {
        // Only the outer card wrapper
        const selectors = [
            '.uTwgne',
            '.rknsod .uTwgne',
            '[role="main"] .wBE4bf.TIunU'
        ];

        document.querySelectorAll(selectors.join(', ')).forEach(el => {
            if (el.dataset.glassCursor) return;
            el.dataset.glassCursor = 'true';
            el.addEventListener('mousemove', updateGlassCursor);
            el.addEventListener('mouseleave', () => {
                el.style.setProperty('--mouse-x', '50%');
                el.style.setProperty('--mouse-y', '50%');
            });
        });
    }

    attachGlassListeners();

    const observer = new MutationObserver(() => {
        attachGlassListeners();
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();