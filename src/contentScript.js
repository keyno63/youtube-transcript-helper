let observer = null;
let autoSaveEnabled = false;
let debounceTimer = null;
let controlPanel = null;
let toggleButton = null;
let statusLabel = null;
let infoLabel = null;

function getVideoTitle() {
  const titleEl = document.querySelector("h1.title yt-formatted-string") ||
    document.querySelector("h1.title") ||
    document.querySelector("title");
  return titleEl ? titleEl.textContent.trim() : "youtube-transcript";
}

function findTranscriptContainer() {
  return document.querySelector("ytd-transcript-renderer") ||
    document.querySelector("ytd-transcript-body-renderer") ||
    document.querySelector("ytd-transcript-segment-list-renderer");
}

function extractTranscriptSegments(container) {
  if (!container) return [];
  const segmentNodes = container.querySelectorAll("ytd-transcript-segment-renderer");
  const segments = [];

  segmentNodes.forEach((segment) => {
    const timeEl = segment.querySelector(
      "#segment-timestamp, .segment-timestamp, .timestamp, [class*='timestamp']"
    );
    const textEl = segment.querySelector(
      "#segment-text, .segment-text, yt-formatted-string"
    );

    const time = timeEl?.textContent?.trim() || "";
    const text = textEl?.textContent?.trim() || "";
    if (time && text) {
      segments.push({ time, text });
    }
  });

  return segments;
}

function csvEscape(value) {
  const safe = String(value ?? "");
  if (safe.includes('"') || safe.includes(",") || safe.includes("\n")) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function buildTranscriptText() {
  const container = findTranscriptContainer();
  const segments = extractTranscriptSegments(container);
  if (!segments.length) return "";
  return segments
    .map((segment) => `${csvEscape(segment.time)},${csvEscape(segment.text)}`)
    .join("\n");
}

function sendTranscript(mode) {
  const text = buildTranscriptText();
  if (!text) {
    showInfo("No transcript found. Open the transcript panel.");
  } else {
    showInfo("");
  }
  chrome.runtime.sendMessage({
    type: "TRANSCRIPT_READY",
    mode,
    title: getVideoTitle(),
    text
  });
}

function stopObserver() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (debounceTimer) {
    window.clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

function startObserver() {
  stopObserver();
  const container = findTranscriptContainer();
  if (!container) return;

  observer = new MutationObserver(() => {
    if (!autoSaveEnabled) return;
    if (debounceTimer) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      sendTranscript("auto");
    }, 1200);
  });

  observer.observe(container, { childList: true, subtree: true, characterData: true });
}

function ensureControlPanel() {
  if (controlPanel) return;

  controlPanel = document.createElement("div");
  controlPanel.className = "ytth-panel";

  const title = document.createElement("div");
  title.className = "ytth-title";
  title.textContent = "Transcript Helper";

  statusLabel = document.createElement("div");
  statusLabel.className = "ytth-status";
  statusLabel.textContent = "Auto Save: Off";

  infoLabel = document.createElement("div");
  infoLabel.className = "ytth-info";
  infoLabel.textContent = "";

  toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.className = "ytth-button";
  toggleButton.textContent = "Start";
  toggleButton.addEventListener("click", () => {
    autoSaveEnabled = !autoSaveEnabled;
    if (autoSaveEnabled) {
      startObserver();
      sendTranscript("auto");
    } else {
      stopObserver();
    }
    updateControlPanel();
  });

  controlPanel.appendChild(title);
  controlPanel.appendChild(statusLabel);
  controlPanel.appendChild(infoLabel);
  controlPanel.appendChild(toggleButton);

  const style = document.createElement("style");
  style.textContent = `
    .ytth-panel {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 999999;
      background: rgba(20, 20, 20, 0.9);
      color: #f2f2f2;
      border-radius: 14px;
      padding: 12px 14px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 12px;
      display: grid;
      gap: 6px;
      min-width: 160px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
    }
    .ytth-title {
      font-weight: 600;
      letter-spacing: 0.2px;
    }
    .ytth-status {
      color: #c2f5c2;
    }
    .ytth-info {
      color: #f3d17a;
      min-height: 14px;
    }
    .ytth-button {
      border: none;
      border-radius: 999px;
      padding: 6px 10px;
      background: #e74c3c;
      color: #fff;
      cursor: pointer;
      font-weight: 600;
    }
    .ytth-button.active {
      background: #27ae60;
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(controlPanel);
  updateControlPanel();
}

function updateControlPanel() {
  if (!toggleButton || !statusLabel) return;
  if (autoSaveEnabled) {
    statusLabel.textContent = "Auto Save: On";
    toggleButton.textContent = "Stop";
    toggleButton.classList.add("active");
  } else {
    statusLabel.textContent = "Auto Save: Off";
    toggleButton.textContent = "Start";
    toggleButton.classList.remove("active");
  }
}

function showInfo(message) {
  if (!infoLabel) return;
  infoLabel.textContent = message || "";
}

chrome.runtime.onMessage.addListener((message) => {
  if (!message) return;

  if (message.type === "REQUEST_TRANSCRIPT_ONCE") {
    sendTranscript("once");
  }

  if (message.type === "START_AUTO_SAVE") {
    autoSaveEnabled = true;
    startObserver();
    sendTranscript("auto");
    updateControlPanel();
  }

  if (message.type === "STOP_AUTO_SAVE") {
    autoSaveEnabled = false;
    stopObserver();
    updateControlPanel();
  }
});

ensureControlPanel();
