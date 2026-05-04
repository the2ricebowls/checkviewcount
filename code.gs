// ============================================================
// TikTok Views Apps Script
// ============================================================
// Code has been split into focused .gs files in this folder.
//
// Sheet menu:
// - TikTok Views > Count hiện tại
//
// Admin-only functions: run these from Apps Script editor, not from the Sheet menu.
// - setupTriggers(): install Form Submit + daily 7 AM triggers.
// - ensureScraperApiKeysSheet(): create/check ScraperAPI_Keys sheet.
// - ensureQueueLogSheet_(): create/check Queue_Log sheet.
// - enqueueNeededRowsAndStart(): enqueue rows missing today's count, then start worker.
// - startQueueWorker(): drain queued rows now.
// - stopAllProcessing(): pause all queue processing and release Processing rows.
// - resumeProcessing(): resume queue processing.
//
// Apps Script .gs files share the same global scope, so functions in the
// module files can call each other normally.
