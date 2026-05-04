// ============================================================
// Configuration and constants
// ============================================================

const SHEET_NAME = "Data";
const SPREADSHEET_ID = ""; // để trống nếu script gắn trực tiếp vào spreadsheet
const TIMEZONE = "Asia/Ho_Chi_Minh";

const SCRAPER_API_KEYS_SHEET_NAME = "ScraperAPI_Keys";
const SCRAPER_API_KEY_HEADER = "API Key";
const QUEUE_LOG_SHEET_NAME = "Queue_Log";
const SCRAPER_API_ENDPOINT = "https://api.scraperapi.com";
const TIKWM_ENDPOINT = "https://www.tikwm.com/api/";

const QUEUE_BATCH_SIZE = 3;
const WORKER_DEADLINE_MS = 4.5 * 60 * 1000;
const REQUEST_DELAY_MS = 15 * 1000;
const RETRY_DELAY_MS = 15 * 1000;
const MIN_TIME_BEFORE_NEXT_REQUEST_MS = 75 * 1000;
const STALE_PROCESSING_AFTER_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_ROW = 9;
const MAX_PROXY_SWITCHES_PER_ROW = 3;
const MAX_FAILURES_BEFORE_STOP = 3;
const WORKER_CONTINUATION_DELAY_MS = 60 * 1000;

const PROCESSING_PAUSED_PROPERTY = "PROCESSING_PAUSED";
const SCHEDULED_WORKER_HANDLER = "scheduledQueueWorker";

const STATUS_QUEUED = "Queued";
const STATUS_PROCESSING = "Processing";
const STATUS_DONE = "Done";
const STATUS_RETRY = "Retry";
const STATUS_NO_VIDEO = "No Video";
const STATUS_DUPLICATE = "Duplicate";

const SYSTEM_HEADERS = [
  "Queue_status",
  "Queue_attempts",
  "Last_attempt_at",
  "Last_error",
  "Last_session_number",
  "Max_view"
];

// ============================================================
// SPREADSHEET / SHEET
// ============================================================
