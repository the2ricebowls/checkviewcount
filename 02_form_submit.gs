// ============================================================
// Google Form submit ingestion
// ============================================================

function onFormSubmitHandler(e) {
  let enqueueResult = { queued: 0, duplicates: 0 };
  withDocumentLock_(() => {
    const sheet = e && e.range ? e.range.getSheet() : getSheet();
    if (sheet.getName() !== SHEET_NAME) {
      Logger.log("Bỏ qua form submit ở sheet khác: " + sheet.getName());
      return;
    }

    ensureSystemColumns_(sheet);
    const rowIndex = e && e.range ? e.range.getRow() : sheet.getLastRow();
    if (rowIndex < 2) return;

    enqueueResult = expandSubmittedLinksToQueue_(sheet, rowIndex);
    Logger.log("Đã enqueue " + enqueueResult.queued + " link, duplicate " + enqueueResult.duplicates + ".");
  });

  toast_("Form mới: đã đưa " + enqueueResult.queued + " link vào queue, duplicate " + enqueueResult.duplicates + ".");
  appendQueueLog_("FORM_SUBMIT_ENQUEUED", "", "", STATUS_QUEUED, "Form submit đã đưa link vào queue", enqueueResult);
  startQueueWorker_();
}

function expandSubmittedLinksToQueue_(sheet, rowIndex) {
  const headers = getHeaders_(sheet);
  const columns = getColumnMap_(headers);
  if (columns.videoLink === -1) {
    throw new Error("Không tìm thấy cột video link trong sheet " + SHEET_NAME);
  }

  const lastColumn = sheet.getLastColumn();
  const rowData = sheet.getRange(rowIndex, 1, 1, lastColumn).getValues()[0];
  const links = splitVideoLinks_(rowData[columns.videoLink]);
  if (links.length === 0) return { queued: 0, duplicates: 0 };

  const existingLinks = buildExistingLinkSet_(sheet, columns.videoLink, rowIndex);
  let queued = 0;
  let duplicates = 0;

  links.forEach((link, index) => {
    const normalizedLink = normalizeVideoLink_(link);
    const isDuplicate = existingLinks.has(normalizedLink);

    if (index === 0) {
      rowData[columns.videoLink] = link;
      rowData[columns.queueStatus] = isDuplicate ? STATUS_DUPLICATE : STATUS_QUEUED;
      rowData[columns.queueAttempts] = 0;
      rowData[columns.lastAttemptAt] = "";
      rowData[columns.lastError] = isDuplicate ? "Duplicate link" : "";
      rowData[columns.lastSessionNumber] = "";
      sheet.getRange(rowIndex, 1, 1, lastColumn).setValues([rowData]);
    } else {
      const newRow = rowData.slice();
      newRow[columns.videoLink] = link;
      newRow[columns.queueStatus] = isDuplicate ? STATUS_DUPLICATE : STATUS_QUEUED;
      newRow[columns.queueAttempts] = 0;
      newRow[columns.lastAttemptAt] = "";
      newRow[columns.lastError] = isDuplicate ? "Duplicate link" : "";
      newRow[columns.lastSessionNumber] = "";
      sheet.appendRow(newRow);
    }

    if (isDuplicate) {
      duplicates++;
    } else {
      queued++;
      existingLinks.add(normalizedLink);
    }
  });

  return { queued: queued, duplicates: duplicates };
}
