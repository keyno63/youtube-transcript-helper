const MENU_ROOT_ID = "yt-transcript-helper-root";
const MENU_SAVE_ONCE_ID = "yt-transcript-helper-save-once";
const MENU_START_ID = "yt-transcript-helper-start";
const MENU_STOP_ID = "yt-transcript-helper-stop";

const autoSaveTabs = new Set();
const latestByTab = new Map();

function sanitizeFilenamePart(value) {
  return value
    .replace(/[\s]+/g, " ")
    .replace(/[\\/:*?"<>|]/g, "")
    .trim()
    .slice(0, 120);
}

function buildFilename(title) {
  const safeTitle = sanitizeFilenamePart(title || "youtube-transcript");
  return `${safeTitle}-transcript.csv`;
}

async function downloadText({ title, text }) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to build data URL."));
    reader.readAsDataURL(blob);
  });

  chrome.downloads.download({
    url: dataUrl,
    filename: buildFilename(title),
    saveAs: true,
    conflictAction: "uniquify"
  });
}

function rebuildMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ROOT_ID,
      title: "YouTube Transcript Helper",
      contexts: ["page", "selection", "editable"]
    });

    chrome.contextMenus.create({
      id: MENU_SAVE_ONCE_ID,
      parentId: MENU_ROOT_ID,
      title: "Save transcript now",
      contexts: ["page", "selection", "editable"]
    });

    chrome.contextMenus.create({
      id: MENU_START_ID,
      parentId: MENU_ROOT_ID,
      title: "Start auto save",
      contexts: ["page", "selection", "editable"]
    });

    chrome.contextMenus.create({
      id: MENU_STOP_ID,
      parentId: MENU_ROOT_ID,
      title: "Stop auto save",
      contexts: ["page", "selection", "editable"]
    });
  });
}

chrome.runtime.onInstalled.addListener(rebuildMenu);
chrome.runtime.onStartup?.addListener(rebuildMenu);

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === MENU_SAVE_ONCE_ID) {
    chrome.tabs.sendMessage(tab.id, { type: "REQUEST_TRANSCRIPT_ONCE" });
    return;
  }

  if (info.menuItemId === MENU_START_ID) {
    autoSaveTabs.add(tab.id);
    chrome.tabs.sendMessage(tab.id, { type: "START_AUTO_SAVE" });
    return;
  }

  if (info.menuItemId === MENU_STOP_ID) {
    autoSaveTabs.delete(tab.id);
    chrome.tabs.sendMessage(tab.id, { type: "STOP_AUTO_SAVE" });
    return;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  autoSaveTabs.delete(tabId);
  latestByTab.delete(tabId);
});

chrome.runtime.onMessage.addListener((message, sender) => {
  const tabId = sender.tab?.id;
  if (!tabId || !message) return;

  if (message.type === "TRANSCRIPT_READY") {
    latestByTab.set(tabId, {
      title: message.title || "youtube-transcript",
      text: message.text || ""
    });

    if (message.mode === "once") {
      downloadText(latestByTab.get(tabId));
      return;
    }

    if (message.mode === "auto") {
      downloadText(latestByTab.get(tabId));
    }
  }
});
