// ============================================================
// ScraperAPI key and sticky session management
// ============================================================

function ensureScraperApiKeysSheet() {
  const spreadsheet = getSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SCRAPER_API_KEYS_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SCRAPER_API_KEYS_SHEET_NAME);
  }

  if (sheet.getLastRow() === 0 || sheet.getRange(1, 1).getValue() !== SCRAPER_API_KEY_HEADER) {
    sheet.getRange(1, 1, 1, 3).setValues([[SCRAPER_API_KEY_HEADER, "Note", "Created_at"]]);
  }

  return sheet;
}

function getActiveScraperApiKey_() {
  const sheet = ensureScraperApiKeysSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let index = 0; index < values.length; index++) {
    const apiKey = String(values[index][0] || "").trim();
    if (apiKey) {
      return { apiKey: apiKey, rowIndex: index + 2 };
    }
  }
  return null;
}

function deleteScraperApiKeyRow_(rowIndex, reason, sessionNumber) {
  const sheet = ensureScraperApiKeysSheet();
  if (rowIndex >= 2 && rowIndex <= sheet.getLastRow()) {
    sheet.deleteRow(rowIndex);
    appendQueueLog_("SCRAPERAPI_KEY_DELETED", "", "", "ScraperAPI", "Đã xóa ScraperAPI key", {
      keyRowIndex: rowIndex,
      reason: reason || "",
      sessionNumber: sessionNumber || ""
    });
    Logger.log("Đã xóa ScraperAPI key ở dòng " + rowIndex + " vì " + (reason || "lỗi credit/auth"));
  }
}

function getOrCreateScraperApiSession_() {
  const properties = PropertiesService.getScriptProperties();
  let sessionNumber = properties.getProperty("SCRAPER_API_SESSION_NUMBER");
  if (!sessionNumber) {
    sessionNumber = String(createSessionNumber_());
    properties.setProperty("SCRAPER_API_SESSION_NUMBER", sessionNumber);
  }
  return sessionNumber;
}

function rotateScraperApiSession_() {
  const sessionNumber = String(createSessionNumber_());
  PropertiesService.getScriptProperties().setProperty("SCRAPER_API_SESSION_NUMBER", sessionNumber);
  return sessionNumber;
}

function createSessionNumber_() {
  return Date.now() + Math.floor(Math.random() * 1000000);
}
