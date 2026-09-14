(function () {
  if (typeof window === 'undefined') return;

  const api = {
    syncToCloud: async function syncToCloud() {
      if (typeof window.writeCloudStateSnapshot === 'function') {
        return window.writeCloudStateSnapshot();
      }
      return false;
    },
    syncFromCloud: async function syncFromCloud() {
      if (typeof window.hydrateFromCloudState === 'function') {
        return window.hydrateFromCloudState();
      }
      return false;
    },
    buildCloudSnapshot: async function buildCloudSnapshot() {
      if (typeof window.writeCloudStateSnapshot === 'function') {
        return window.writeCloudStateSnapshot();
      }
      return false;
    },
    applyCloudPayload: typeof window.applyCloudPayload === 'function' ? window.applyCloudPayload : null,
    exportState: async function exportState() {
      return api.syncToCloud();
    },
    importState: async function importState() {
      return api.syncFromCloud();
    },
    snapshot: async function snapshot() {
      return api.syncToCloud();
    }
  };

  window.modernClassroomCloud = api;

  window.addEventListener('load', () => {
    if (typeof window.hydrateFromCloudState === 'function') {
      window.hydrateFromCloudState().catch(() => {});
    }
  }, { once: true });
})();
