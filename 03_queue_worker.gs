// ============================================================
// Queue enqueueing, worker, row processing, and recovery
// ============================================================

function enqueueRowsForToday_(options) {
  withDocumentLock_(() => {
    const sheet = getSheet();
    ensureSystemColumns_(sheet);

    const headers = getHeaders_(sheet);
    const columns = getColumnMap_(headers);
    if (columns.videoLink === -1) {
      throw new Error("Không tìm thấy cột video link trong sheet " + SHEET_NAME);
    }

    const todayColumn = ensureTodayColumn_(sheet);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    const data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    let queued = 0;
    data.forEach((row, index) => {
      const rowIndex = index + 2;
      const videoLink = row[columns.videoLink];
      if (!isTikTokLink_(videoLink)) return;
      if (!options.force && hasValue_(row[todayColumn])) return;
      if (row[columns.queueStatus] === STATUS_PROCESSING) return;

      sheet.getRange(rowIndex, columns.queueStatus + 1).setValue(STATUS_QUEUED);
      sheet.getRange(rowIndex, columns.lastError + 1).setValue("");
      queued++;
    });

    Logger.log("Đã enqueue " + queued + " dòng cho hôm nay. Nguồn: " + options.source);
    toast_("Đã đưa " + queued + " dòng vào queue.");
    appendQueueLog_("ROWS_ENQUEUED", "", "", STATUS_QUEUED, "Đã đưa dòng vào queue", {
      queued: queued,
      source: options.source,
      force: options.force === true
    });
  });
}

function processQueueWorker() {
  if (isProcessingPaused_()) {
    Logger.log("Worker bỏ qua vì PROCESSING_PAUSED=true.");
    toast_("Đang dừng toàn bộ, worker không chạy.");
    return;
  }

  prepareQueueWorker_();

  const deadline = Date.now() + WORKER_DEADLINE_MS;
  let processed = 0;
  let consecutiveFailures = 0;

  while (processed < QUEUE_BATCH_SIZE && Date.now() < deadline) {
    if (!hasEnoughWorkerTime_(deadline)) {
      Logger.log("Gần hết thời gian worker, dừng mềm trước khi claim dòng mới.");
      break;
    }

    const claimedRow = claimNextQueueRow_();
    if (!claimedRow) break;

    const result = processClaimedQueueRow_(claimedRow);
    finalizeQueueRow_(claimedRow.rowIndex, result);
    processed++;

    if (result.ok) {
      consecutiveFailures = 0;
    } else {
      consecutiveFailures++;
    }

    if (consecutiveFailures >= MAX_FAILURES_BEFORE_STOP) {
      Logger.log("Dừng worker sớm vì lỗi liên tục " + consecutiveFailures + " lần.");
      break;
    }

    if (processed < QUEUE_BATCH_SIZE && Date.now() + REQUEST_DELAY_MS < deadline) {
      Utilities.sleep(REQUEST_DELAY_MS);
    }
  }

  Logger.log("Worker xử lý " + processed + " dòng.");
  toast_("Worker xử lý " + processed + " dòng. Queue còn: " + countPendingQueue_() + ".");
  appendQueueLog_("WORKER_BATCH_DONE", "", "", "Worker", "Worker xử lý xong một batch", {
    processed: processed,
    pending: countPendingQueue_(),
    consecutiveFailures: consecutiveFailures
  });

  if (!isProcessingPaused_() && hasPendingQueue_()) {
    scheduleNextQueueWorker_();
  }
}

function hasEnoughWorkerTime_(deadline) {
  return Date.now() + MIN_TIME_BEFORE_NEXT_REQUEST_MS < deadline;
}

function startQueueWorker() {
  startQueueWorker_();
}

function startQueueWorker_() {
  if (isProcessingPaused_()) {
    toast_("Đang dừng toàn bộ, không khởi động worker.");
    return;
  }

  deleteTriggersByHandler_([SCHEDULED_WORKER_HANDLER]);
  processQueueWorker();
}

function scheduledQueueWorker() {
  processQueueWorker();
}

function scheduleNextQueueWorker_() {
  if (isProcessingPaused_()) return;

  deleteTriggersByHandler_([SCHEDULED_WORKER_HANDLER]);
  ScriptApp.newTrigger(SCHEDULED_WORKER_HANDLER)
    .timeBased()
    .after(WORKER_CONTINUATION_DELAY_MS)
    .create();

  Logger.log("Queue còn việc, đã đặt worker chạy tiếp sau " + WORKER_CONTINUATION_DELAY_MS / 1000 + "s.");
}

function hasPendingQueue_() {
  return countPendingQueue_() > 0;
}

function countPendingQueue_() {
  const sheet = getSheet();
  ensureSystemColumns_(sheet);
  const headers = getHeaders_(sheet);
  const columns = getColumnMap_(headers);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2 || columns.queueStatus === -1) return 0;

  const statuses = sheet.getRange(2, columns.queueStatus + 1, lastRow - 1, 1).getValues();
  return statuses.filter(row => row[0] === STATUS_QUEUED || row[0] === STATUS_RETRY || row[0] === "").length;
}

function prepareQueueWorker_() {
  withDocumentLock_(() => {
    const sheet = getSheet();
    ensureSystemColumns_(sheet);
    ensureTodayColumn_(sheet);
    ensureScraperApiKeysSheet();
    recoverStaleProcessingRows_(sheet);
  });
}

function recoverStaleProcessingRows_(sheet) {
  const headers = getHeaders_(sheet);
  const columns = getColumnMap_(headers);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2 || columns.queueStatus === -1 || columns.lastAttemptAt === -1) return 0;

  const now = Date.now();
  const data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  let recovered = 0;

  data.forEach((row, index) => {
    const status = row[columns.queueStatus];
    const lastAttemptAt = row[columns.lastAttemptAt];
    if (status !== STATUS_PROCESSING || !lastAttemptAt) return;

    const lastAttemptTime = new Date(lastAttemptAt).getTime();
    if (isNaN(lastAttemptTime) || now - lastAttemptTime < STALE_PROCESSING_AFTER_MS) return;

    const rowIndex = index + 2;
    sheet.getRange(rowIndex, columns.queueStatus + 1).setValue(STATUS_RETRY);
    sheet.getRange(rowIndex, columns.lastError + 1).setValue("Recovered stale Processing after Apps Script timeout");
    appendQueueLog_("STALE_PROCESSING_RECOVERED", rowIndex, row[columns.videoLink], STATUS_RETRY, "Recovered stale Processing after Apps Script timeout", {
      lastAttemptAt: lastAttemptAt
    });
    recovered++;
  });

  if (recovered > 0) {
    Logger.log("Recovered stale Processing rows: " + recovered);
  }
  return recovered;
}

function claimNextQueueRow_() {
  return withDocumentLock_(() => {
    const sheet = getSheet();
    ensureSystemColumns_(sheet);
    ensureTodayColumn_(sheet);

    const rowIndex = findNextQueueRow_(sheet);
    if (rowIndex === -1) return null;

    const headers = getHeaders_(sheet);
    const columns = getColumnMap_(headers);
    const rowData = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
    const attempts = Number(rowData[columns.queueAttempts] || 0) + 1;

    sheet.getRange(rowIndex, columns.queueStatus + 1).setValue(STATUS_PROCESSING);
    sheet.getRange(rowIndex, columns.lastAttemptAt + 1).setValue(new Date());
    sheet.getRange(rowIndex, columns.queueAttempts + 1).setValue(attempts);

    return {
      rowIndex: rowIndex,
      videoLink: rowData[columns.videoLink],
      attempts: attempts
    };
  });
}

function findNextQueueRow_(sheet) {
  const headers = getHeaders_(sheet);
  const columns = getColumnMap_(headers);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  const statuses = sheet.getRange(2, columns.queueStatus + 1, lastRow - 1, 1).getValues();
  for (let index = 0; index < statuses.length; index++) {
    const status = statuses[index][0];
    if (status === STATUS_QUEUED || status === STATUS_RETRY || status === "") {
      return index + 2;
    }
  }
  return -1;
}

function processClaimedQueueRow_(claimedRow) {
  const videoLink = claimedRow.videoLink;
  if (!isTikTokLink_(videoLink)) {
    return { ok: false, status: STATUS_NO_VIDEO, error: "Không phải link TikTok" };
  }

  if (claimedRow.attempts > MAX_ATTEMPTS_PER_ROW) {
    return { ok: false, status: STATUS_NO_VIDEO, error: "Vượt quá số lần thử" };
  }

  const cachedView = findCachedViewForToday_(videoLink, claimedRow.rowIndex);
  if (hasValue_(cachedView)) {
    return { ok: true, playCount: cachedView, fromCache: true, error: "Copied from cache" };
  }

  const fetchResult = fetchPlayCountWithRetry(videoLink, MAX_ATTEMPTS_PER_ROW);
  if (fetchResult.ok) {
    return { ok: true, playCount: fetchResult.playCount, sessionNumber: fetchResult.sessionNumber || "" };
  }

  if (fetchResult.fatalTikwmError) {
    return {
      ok: false,
      status: STATUS_NO_VIDEO,
      error: fetchResult.error || "Url parsing is failed! Please check url.",
      sessionNumber: fetchResult.sessionNumber || ""
    };
  }

  const nextStatus = claimedRow.attempts >= MAX_ATTEMPTS_PER_ROW ? STATUS_NO_VIDEO : STATUS_RETRY;
  return {
    ok: false,
    status: nextStatus,
    error: fetchResult.error || "Fetch lỗi",
    sessionNumber: fetchResult.sessionNumber || ""
  };
}

function finalizeQueueRow_(rowIndex, result) {
  withDocumentLock_(() => {
    const sheet = getSheet();
    ensureSystemColumns_(sheet);
    const todayColumn = ensureTodayColumn_(sheet);
    const headers = getHeaders_(sheet);
    const columns = getColumnMap_(headers);
    const rowData = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];

    if (result.sessionNumber) {
      sheet.getRange(rowIndex, columns.lastSessionNumber + 1).setValue(result.sessionNumber);
    }

    if (result.ok) {
      sheet.getRange(rowIndex, todayColumn + 1).setValue(result.playCount);
      updateMaxView_(sheet, rowIndex, columns.maxView, rowData[columns.maxView], result.playCount);
      markQueueRow_(sheet, rowIndex, STATUS_DONE, result.fromCache ? result.error : "", columns);
      Logger.log("Hàng " + rowIndex + ": " + result.playCount + (result.fromCache ? " (cache)" : ""));
      return;
    }

    markQueueRow_(sheet, rowIndex, result.status || STATUS_RETRY, result.error || "Fetch lỗi", columns);
    appendQueueLog_("QUEUE_ROW_FAILED", rowIndex, "", result.status || STATUS_RETRY, result.error || "Fetch lỗi", {
      sessionNumber: result.sessionNumber || ""
    });
  });
}

function markQueueRow_(sheet, rowIndex, status, error, columns) {
  sheet.getRange(rowIndex, columns.queueStatus + 1).setValue(status);
  sheet.getRange(rowIndex, columns.lastError + 1).setValue(error || "");
}

function updateMaxView_(sheet, rowIndex, maxViewColumn, currentMax, viewCount) {
  const numView = parseInt(viewCount, 10);
  if (isNaN(numView)) return;
  if (!hasValue_(currentMax) || numView > parseInt(currentMax, 10)) {
    sheet.getRange(rowIndex, maxViewColumn + 1).setValue(numView);
  }
}

function findCachedViewForToday_(videoLink, excludingRowIndex) {
  const sheet = getSheet();
  const headers = getHeaders_(sheet);
  const columns = getColumnMap_(headers);
  const todayColumn = ensureTodayColumn_(sheet);
  const normalizedTarget = normalizeVideoLink_(videoLink);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return "";

  const data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  for (let index = 0; index < data.length; index++) {
    const rowIndex = index + 2;
    if (rowIndex === excludingRowIndex) continue;

    const row = data[index];
    if (normalizeVideoLink_(row[columns.videoLink]) === normalizedTarget && hasValue_(row[todayColumn])) {
      return row[todayColumn];
    }
  }

  return "";
}
