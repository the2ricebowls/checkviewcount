# Apps Script Modules

This folder is split into focused `.gs` modules. Apps Script files share one global scope, so public triggers and private helpers can call each other across files.

- `code.gs` — small project note only.
- `00_config.gs` — constants, sheet names, queue settings, statuses.
- `01_ui_triggers.gs` — safe Sheet menu, trigger setup, manual actions, pause/resume.
- `02_form_submit.gs` — Google Form submit ingestion and multi-link expansion.
- `03_queue_worker.gs` — queue drain, stale recovery, row processing, continuation scheduling.
- `04_tikwm_client.gs` — TikWM fetch through ScraperAPI, response parsing, fatal URL parsing detection.
- `05_scraperapi_keys.gs` — ScraperAPI key sheet, key rotation, sticky session state.
- `06_sheet_helpers.gs` — sheet column helpers, link helpers, date/lock/toast helpers.
- `07_logging.gs` — `Queue_Log` setup and structured logging helpers.

Operational entrypoints to run manually in Apps Script:

- Sheet menu only exposes `TikTok Views > Count hiện tại` to reduce accidental admin clicks.
- `setupTriggers()` — create Form submit and daily 7 AM triggers.
- `countCurrentViews()` — enqueue today’s count and start the worker.
- `enqueueNeededRowsAndStart()` — enqueue rows missing today’s count and start the worker.
- `startQueueWorker()` — drain queued rows now.
- `stopAllProcessing()` / `resumeProcessing()` — pause or resume all queue processing.
