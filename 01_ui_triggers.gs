// ============================================================
// Spreadsheet UI, triggers, and public actions
// ============================================================

function getSpreadsheet() {
  return SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet() {
  const spreadsheet = getSpreadsheet();
  if (!spreadsheet) {
    throw new Error("Không tìm thấy spreadsheet. Hãy gắn script vào Sheet hoặc điền SPREADSHEET_ID.");
  }

  const sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    throw new Error("Không tìm thấy sheet: " + SHEET_NAME);
  }

  return sheet;
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("TikTok Views")
    .addItem("Count hiện tại", "countCurrentViews")
    .addToUi();
}

function setupTriggers() {
  const spreadsheet = getSpreadsheet();
  if (!spreadsheet) {
    throw new Error("Không tìm thấy spreadsheet. Hãy gắn script vào Sheet hoặc điền SPREADSHEET_ID.");
  }

  ensureScraperApiKeysSheet();
  ensureQueueLogSheet_();
  ensureSystemColumns_(getSheet());
  setProcessingPaused_(false);
  deleteTriggersByHandler_(["onFormSubmitHandler", "processQueueWorker", "scheduledQueueWorker", "dailyFetchViews"]);

  ScriptApp.newTrigger("onFormSubmitHandler")
    .forSpreadsheet(spreadsheet)
    .onFormSubmit()
    .create();

  ScriptApp.newTrigger("dailyFetchViews")
    .timeBased()
    .atHour(7)
    .everyDays(1)
    .inTimezone(TIMEZONE)
    .create();

  toast_("Đã cài trigger: Form Submit, daily 7h sáng, worker tự chạy khi có queue.");
  Logger.log("Đã cài trigger: onFormSubmitHandler, dailyFetchViews. Worker tự chạy nối tiếp khi còn queue.");
}

function setupTrigger() {
  setupTriggers();
}

function deleteTriggersByHandler_(handlerNames) {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (handlerNames.includes(trigger.getHandlerFunction())) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function dailyFetchViews() {
  if (isProcessingPaused_()) {
    toast_("Đang dừng toàn bộ, daily 7h không chạy.");
    Logger.log("Daily bỏ qua vì PROCESSING_PAUSED=true.");
    return;
  }
  enqueueRowsForToday_({ force: true, source: "daily" });
  startQueueWorker_();
}

function countCurrentViews() {
  if (isProcessingPaused_()) {
    toast_("Đang dừng toàn bộ. Bấm 'Bật xử lý lại' trước khi Count hiện tại.");
    return;
  }
  enqueueRowsForToday_({ force: true, source: "manual" });
  startQueueWorker_();
}

function enqueueNeededRowsAndStart() {
  if (isProcessingPaused_()) {
    toast_("Đang dừng toàn bộ. Bấm 'Bật xử lý lại' trước khi bốc queue.");
    return;
  }
  enqueueRowsForToday_({ force: false, source: "needed" });
  startQueueWorker_();
}

function stopAllProcessing() {
  setProcessingPaused_(true);
  deleteTriggersByHandler_([SCHEDULED_WORKER_HANDLER]);
  releaseProcessingRows_();
  toast_("Đã dừng toàn bộ xử lý queue.");
  Logger.log("Đã bật PROCESSING_PAUSED và xóa scheduled worker.");
}

function resumeProcessing() {
  setProcessingPaused_(false);
  toast_("Đã bật xử lý lại.");
  if (hasPendingQueue_()) {
    startQueueWorker_();
  }
}

function setProcessingPaused_(paused) {
  PropertiesService.getScriptProperties().setProperty(PROCESSING_PAUSED_PROPERTY, paused ? "true" : "false");
}

function isProcessingPaused_() {
  return PropertiesService.getScriptProperties().getProperty(PROCESSING_PAUSED_PROPERTY) === "true";
}

function releaseProcessingRows_() {
  withDocumentLock_(() => {
    const sheet = getSheet();
    ensureSystemColumns_(sheet);
    const headers = getHeaders_(sheet);
    const columns = getColumnMap_(headers);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    const statuses = sheet.getRange(2, columns.queueStatus + 1, lastRow - 1, 1).getValues();
    statuses.forEach((row, index) => {
      if (row[0] === STATUS_PROCESSING) {
        sheet.getRange(index + 2, columns.queueStatus + 1).setValue(STATUS_RETRY);
        sheet.getRange(index + 2, columns.lastError + 1).setValue("Đã dừng toàn bộ, trả về Retry");
      }
    });
  });
}

function testFetchOne() {
  processQueueWorker();
}
