let observer = null;
let autoSaveEnabled = false;
let debounceTimer = null;
let controlPanel = null;
let toggleButton = null;
let statusLabel = null;
let infoLabel = null;
let topWordsBox = null;
let topWordsList = null;
let topWordsLimit = 50;
let lastSegments = [];

const DEFAULT_TOP_WORDS_LIMIT = 50;
const STOP_WORDS = new Set([
  "a","about","above","after","again","against","all","am","an","and","any","are","aren't","as","at",
  "be","because","been","before","being","below","between","both","but","by",
  "can","can't","cannot","could","couldn't",
  "did","didn't","do","does","doesn't","doing","don't","down","during",
  "each",
  "few","for","from","further",
  "had","hadn't","has","hasn't","have","haven't","having","he","he'd","he'll","he's","her","here","here's","hers","herself","him","himself","his","how","how's",
  "i","i'd","i'll","i'm","i've","if","in","into","is","isn't","it","it's","its","itself",
  "let's",
  "me","more","most","mustn't","my","myself",
  "no","nor","not",
  "of","off","on","once","only","or","other","ought","our","ours","ourselves","out","over","own",
  "same","shan't","she","she'd","she'll","she's","should","shouldn't","so","some","such",
  "than","that","that's","the","their","theirs","them","themselves","then","there","there's","these","they","they'd","they'll","they're","they've","this","those","through","to","too",
  "under","until","up",
  "very",
  "was","wasn't","we","we'd","we'll","we're","we've","were","weren't","what","what's","when","when's","where","where's","which","while","who","who's","whom","why","why's","with","won't","would","wouldn't",
  "you","you'd","you'll","you're","you've","your","yours","yourself","yourselves"
]);

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

function getTranscriptSegments() {
  const container = findTranscriptContainer();
  return extractTranscriptSegments(container);
}

function buildTranscriptText(segments) {
  if (!segments.length) return "";
  return segments
    .map((segment) => `${csvEscape(segment.time)},${csvEscape(segment.text)}`)
    .join("\n");
}

function normalizeTopWordsLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_TOP_WORDS_LIMIT;
  return Math.min(200, Math.max(1, Math.floor(parsed)));
}

function normalizeToken(token) {
  let word = token.toLowerCase();
  if (word.endsWith("'s")) word = word.slice(0, -2);
  if (word.endsWith("'")) word = word.slice(0, -1);
  return word;
}

function extractTokens(text) {
  return text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || [];
}

function buildTopWords(segments) {
  const counts = new Map();
  segments.forEach((segment) => {
    const tokens = extractTokens(segment.text || "");
    tokens.forEach((token) => {
      const word = normalizeToken(token);
      if (!word || STOP_WORDS.has(word)) return;
      counts.set(word, (counts.get(word) || 0) + 1);
    });
  });

  return Array.from(counts.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .slice(0, topWordsLimit);
}

function renderTopWords(segments) {
  if (!topWordsList) return;
  topWordsList.textContent = "";
  if (!segments.length) {
    const empty = document.createElement("div");
    empty.className = "ytth-top-empty";
    empty.textContent = "No transcript words.";
    topWordsList.appendChild(empty);
    return;
  }

  const topWords = buildTopWords(segments);
  if (!topWords.length) {
    const empty = document.createElement("div");
    empty.className = "ytth-top-empty";
    empty.textContent = "No words after filtering.";
    topWordsList.appendChild(empty);
    return;
  }

  topWords.forEach(([word, count]) => {
    const row = document.createElement("div");
    row.className = "ytth-top-row";
    row.textContent = `${word} ?${count}`;
    topWordsList.appendChild(row);
  });
}

function sendTranscript(mode) {
  const segments = getTranscriptSegments();
  lastSegments = segments;
  const text = buildTranscriptText(segments);
  if (!text) {

    showInfo("No transcript found. Open the transcript panel.");
  } else {
    showInfo("");
  }
  renderTopWords(segments);
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

  topWordsBox = document.createElement("div");
  topWordsBox.className = "ytth-top";

  const topWordsTitle = document.createElement("div");
  topWordsTitle.className = "ytth-top-title";
  topWordsTitle.textContent = "Top words";

  topWordsList = document.createElement("div");
  topWordsList.className = "ytth-top-list";

  topWordsBox.appendChild(topWordsTitle);
  topWordsBox.appendChild(topWordsList);

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
  controlPanel.appendChild(topWordsBox);
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
    .ytth-top {
      background: rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      padding: 8px;
      display: grid;
      gap: 6px;
      max-height: 200px;
    }
    .ytth-top-title {
      font-weight: 600;
      font-size: 11px;
      letter-spacing: 0.3px;
      text-transform: uppercase;
      color: #f5f5f5;
    }
    .ytth-top-list {
      display: grid;
      gap: 4px;
      max-height: 140px;
      overflow: auto;
      font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace;
      font-size: 11px;
      color: #e3e3e3;
    }
    .ytth-top-row {
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }
    .ytth-top-empty {
      color: #c5c5c5;
      font-style: italic;
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

function loadOptions() {
  chrome.storage.sync.get(
    { topWordsLimit: DEFAULT_TOP_WORDS_LIMIT },
    (items) => {
      topWordsLimit = normalizeTopWordsLimit(items.topWordsLimit);
      renderTopWords(lastSegments);
    }
  );
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

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") return;
  if (changes.topWordsLimit) {
    topWordsLimit = normalizeTopWordsLimit(changes.topWordsLimit.newValue);
    renderTopWords(lastSegments);
  }
});

ensureControlPanel();
loadOptions();
