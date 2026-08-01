// Bootstrap placeholder.
// Main functionality has been split into feature modules in the `features/` folder.

// Run migration to cloud sync storage so existing local data survives reinstalls
if (typeof migrateAllToSync === 'function') {
	migrateAllToSync().catch(err => {
		console.warn('Migration to cloud sync storage failed:', err);
	});
}
