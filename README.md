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

# Setup:

1. Tạo form đổ vào sheet Data, yêu cầu lấy mail verified và link video, hỗ trợ nhập batch, mỗi link một dòng.
sheet Data dòng 1 header có dạng:
`Timestamp |	Email Address |	Tiktok Video Link |	Name |	Max_view |	Queue_status |	Queue_attempts |	Last_attempt_at |	Last_error |	Last_session_number |	05-05`
3. Chạy SetupTrigger()
4. Tạo sheet View để xem, khóa lại. dán vào A1 công thức `=FILTER({Data!B:E, Data!K:ZY}, Data!B:B <> "")`
5. Lấy Scraper API KEY dán vào sheet ScraperAPI_Keys
6. Check log ở sheet Logs queue

# Demo:
1. Form: https://forms.gle/xcRzDPL2Ydy8PTeQ8
2. Sheet: https://docs.google.com/spreadsheets/d/1mWhJx7oaO2BLbjnUF0Lo1cswNhm1wju4sopPhEkSOEI/edit?usp=sharing

