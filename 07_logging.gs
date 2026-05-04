// ============================================================
// Queue and ScraperAPI logging
// ============================================================

function ensureQueueLogSheet_() {
  const spreadsheet = getSpreadsheet();
  let sheet = spreadsheet.getSheetByName(QUEUE_LOG_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(QUEUE_LOG_SHEET_NAME);
  }

  const headers = [
    "Timestamp",
    "Event",
    "Row",
    "Video_link",
    "Status",
    "Message",
    "Details"
  ];
  if (sheet.getLastRow() === 0 || sheet.getRange(1, 1).getValue() !== headers[0]) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  return sheet;
}

function appendQueueLog_(eventName, rowIndex, videoLink, status, message, details) {
  try {
    const sheet = ensureQueueLogSheet_();
    sheet.appendRow([
      new Date(),
      eventName,
      rowIndex || "",
      videoLink || "",
      status || "",
      message || "",
      details ? JSON.stringify(details) : ""
    ]);
  } catch (err) {
    Logger.log("Không ghi được Queue_Log: " + err.message + " | " + eventName + " | " + message);
  }
}

function logScraperApiEvent_(eventName, keyRowIndex, sessionNumber, message, details) {
  const safeDetails = details || {};
  safeDetails.keyRowIndex = keyRowIndex || "";
  safeDetails.sessionNumber = sessionNumber || "";
  appendQueueLog_(eventName, "", safeDetails.videoLink || "", "ScraperAPI", message, safeDetails);
  Logger.log(eventName + " | keyRow=" + (keyRowIndex || "") + " | session=" + (sessionNumber || "") + " | " + message);
}
