// ============================================================
// Sheet columns, link parsing, date, lock, and UI helpers
// ============================================================

function ensureSystemColumns_(sheet) {
  let headers = getHeaders_(sheet);
  SYSTEM_HEADERS.forEach(header => {
    if (findColumnIndex_(headers, [header]) === -1) {
      appendHeader_(sheet, header);
      headers = getHeaders_(sheet);
    }
  });
}

function ensureTodayColumn_(sheet) {
  let headers = getHeaders_(sheet);
  const today = getTodayLabel();
  let column = findColumnIndex_(headers, [today]);
  if (column === -1) {
    column = appendHeader_(sheet, today);
  }
  return column;
}

function getHeaders_(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (lastColumn === 0) return [];
  return sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
}

function appendHeader_(sheet, headerName) {
  const newColumn = sheet.getLastColumn() + 1;
  sheet.getRange(1, newColumn).setValue(headerName);
  return newColumn - 1;
}

function getColumnMap_(headers) {
  return {
    videoLink: findVideoLinkColumn_(headers),
    queueStatus: findColumnIndex_(headers, ["Queue_status"]),
    queueAttempts: findColumnIndex_(headers, ["Queue_attempts"]),
    lastAttemptAt: findColumnIndex_(headers, ["Last_attempt_at"]),
    lastError: findColumnIndex_(headers, ["Last_error"]),
    lastSessionNumber: findColumnIndex_(headers, ["Last_session_number"]),
    maxView: findColumnIndex_(headers, ["Max_view", "Max view", "Max views"])
  };
}

function findVideoLinkColumn_(headers) {
  const exactIndex = findColumnIndex_(headers, [
    "Video_link",
    "Video link",
    "video_link",
    "Link video",
    "TikTok link",
    "Link TikTok",
    "Video URL",
    "URL",
    "Tiktok Video Link"
  ]);
  if (exactIndex !== -1) return exactIndex;

  return headers.findIndex(header => {
    const normalized = normalizeHeader_(header);
    return normalized.includes("video") && normalized.includes("link")
      || normalized.includes("tiktok") && (normalized.includes("link") || normalized.includes("url"));
  });
}

function findColumnIndex_(headers, names) {
  const normalizedNames = names.map(normalizeHeader_);
  return headers.findIndex(header => normalizedNames.includes(normalizeHeader_(header)));
}

function normalizeHeader_(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function splitVideoLinks_(value) {
  return String(value || "")
    .split(/[\r\n,]+/)
    .map(item => item.trim())
    .filter(item => item && isTikTokLink_(item));
}

function isTikTokLink_(value) {
  return String(value || "").toLowerCase().includes("tiktok.com");
}

function normalizeVideoLink_(value) {
  return String(value || "").trim().replace(/\?.*$/, "").replace(/\/$/, "").toLowerCase();
}

function buildExistingLinkSet_(sheet, videoLinkColumn, excludingRowIndex) {
  const lastRow = sheet.getLastRow();
  const existingLinks = new Set();
  if (lastRow < 2) return existingLinks;

  const values = sheet.getRange(2, videoLinkColumn + 1, lastRow - 1, 1).getValues();
  values.forEach((row, index) => {
    const rowIndex = index + 2;
    if (rowIndex === excludingRowIndex) return;
    const value = row[0];
    if (isTikTokLink_(value)) {
      existingLinks.add(normalizeVideoLink_(value));
    }
  });
  return existingLinks;
}

function hasValue_(value) {
  return value !== "" && value !== null && value !== undefined;
}

function getTodayLabel() {
  const now = new Date();
  const vnNow = new Date(now.toLocaleString("en-US", { timeZone: TIMEZONE }));
  const dd = String(vnNow.getDate()).padStart(2, "0");
  const mm = String(vnNow.getMonth() + 1).padStart(2, "0");
  return dd + "-" + mm;
}

function withDocumentLock_(callback) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function toast_(message) {
  try {
    getSpreadsheet().toast(message, "TikTok Views", 5);
  } catch (err) {
    Logger.log(message);
  }
}
