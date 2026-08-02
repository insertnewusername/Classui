// Background script – simplified for local unpacked extension

// --- Storage Helpers (local only) ---

function getFromLocal(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (data) => {
      if (chrome.runtime?.lastError) {
        resolve({});
        return;
      }
      resolve(data || {});
    });
  });
}

function setInLocal(payload) {
  return new Promise((resolve) => {
    chrome.storage.local.set(payload, () => {
      resolve(!chrome.runtime?.lastError);
    });
  });
}

// --- Titles Storage ---

async function getTitlesData() {
  const data = await getFromLocal("titles");
  return (data && typeof data.titles === "object") ? data.titles : {};
}

async function setTitlesData(titles) {
  return setInLocal({ titles });
}

// --- Message Listener ---

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "getTitles") {
    getTitlesData()
      .then((titles) => sendResponse({ titles }))
      .catch(() => sendResponse({ titles: {} }));
    return true;
  }

  if (msg.action === "setTitle" && msg.courseId) {
    getTitlesData()
      .then(async (titles) => {
        titles[msg.courseId] = msg.newTitle;
        await setTitlesData(titles);
        sendResponse({ success: true, titles });
      })
      .catch(() => sendResponse({ success: false }));
    return true;
  }
});
