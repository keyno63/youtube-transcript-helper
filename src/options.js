const DEFAULT_TOP_WORDS_LIMIT = 50;
const STATUS_TIMEOUT_MS = 1200;

const limitInput = document.getElementById("topWordsLimit");
const statusEl = document.getElementById("status");

function normalizeLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_TOP_WORDS_LIMIT;
  return Math.min(200, Math.max(1, Math.floor(parsed)));
}

function showStatus(message) {
  statusEl.textContent = message;
  if (!message) return;
  window.clearTimeout(showStatus.timer);
  showStatus.timer = window.setTimeout(() => {
    statusEl.textContent = "";
  }, STATUS_TIMEOUT_MS);
}

function loadOptions() {
  chrome.storage.sync.get(
    { topWordsLimit: DEFAULT_TOP_WORDS_LIMIT },
    (items) => {
      limitInput.value = normalizeLimit(items.topWordsLimit);
    }
  );
}

function saveOptions() {
  const value = normalizeLimit(limitInput.value);
  limitInput.value = value;
  chrome.storage.sync.set({ topWordsLimit: value }, () => {
    showStatus("Saved.");
  });
}

limitInput.addEventListener("change", saveOptions);
limitInput.addEventListener("input", () => {
  showStatus("");
});

loadOptions();
