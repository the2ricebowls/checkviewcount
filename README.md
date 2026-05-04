### 🚀 TikTok View Tracker (Automation)

**Mục đích:** Theo dõi lượt xem hàng ngày cho số lượng lớn video TikTok, giúp tự động hóa việc đánh giá hiệu quả nội dung, KOL/KOC.

*   **Triển khai linh hoạt:** Đóng gói sẵn dưới dạng **Apps Script** (dễ tùy chỉnh bằng AI Agents).
*   **Hạ tầng thông minh:** 
    *   Sử dụng **Scraper API** (Proxy) + **Sticky Session** gọi TikWM API để lấy dữ liệu chuẩn xác.
    *   Cơ chế **Pool Key tự động**: Tự động xoay vòng key khi hết credit.
*   **Hiệu suất cao:** Xử lý theo **Hàng chờ (Queue)** có cơ chế **Retry**, đáp ứng nhu cầu quét dữ liệu liên tục và quy mô lớn.
*   **Mở rộng:** Dự án này có thể [tham khảo thêm workflow n8n](./TikTok%20Video%20Stats%20Workflow.md), workflow này dùng cách khác để lấy ra thông số video và TTS để lấy nội dung video. => ý tưởng: TTS lấy nội dung, phân tích kịch bản video theo các tiêu chí mẫu,... 
---


## 📂 Các Module trong Apps Script

Hệ thống được chia nhỏ thành các file `.gs` riêng biệt để dễ quản lý. Vì Apps Script chia sẻ phạm vi toàn cục (global scope), nên các hàm và biến ở các file khác nhau có thể gọi lẫn nhau một cách dễ dàng.

*   **`code.gs`** — Chứa các ghi chú ngắn gọn về dự án.
*   **`00_config.gs`** — Nơi lưu trữ các hằng số, tên các trang tính (sheet), cấu hình hàng chờ (queue) và các trạng thái hệ thống.
*   **`01_ui_triggers.gs`** — Tạo menu trên Google Sheets, thiết lập các bộ kích hoạt (trigger), các hành động thủ công và chức năng tạm dừng/tiếp tục.
*   **`02_form_submit.gs`** — Xử lý dữ liệu đầu vào từ Google Form và tự động tách các danh sách nhiều link video.
*   **`03_queue_worker.gs`** — "Công nhân" xử lý hàng chờ: giải quyết các hàng đang đợi, khôi phục các hàng bị lỗi/stale và lên lịch chạy tiếp nối.
*   **`04_tikwm_client.gs`** — Kết nối với TikWM thông qua ScraperAPI để lấy dữ liệu TikTok, phân tích phản hồi và phát hiện lỗi URL.
*   **`05_scraperapi_keys.gs`** — Quản lý danh sách API Key, tự động xoay vòng (rotate) key và duy trì phiên làm việc (session).
*   **`06_sheet_helpers.gs`** — Các hàm bổ trợ xử lý cột, định dạng link, ngày tháng, khóa (lock) và hiển thị thông báo (toast).
*   **`07_logging.gs`** — Thiết lập hệ thống ghi log cấu trúc vào sheet `Queue_Log`.

---

## 🛠 Các hàm vận hành thủ công (Triggers)

Bạn có thể chạy các hàm này trực tiếp từ trình soạn thảo Apps Script:

*   **Menu trên Sheet:** Chỉ hiển thị `TikTok Views > Count hiện tại` để hạn chế việc admin bấm nhầm các chức năng quan trọng.
*   **`setupTriggers()`** — Khởi tạo trigger: chạy khi có người nộp Form và chạy định kỳ hàng ngày vào lúc 7 giờ sáng.
*   **`countCurrentViews()`** — Đưa các yêu cầu của ngày hôm nay vào hàng chờ và bắt đầu xử lý.
*   **`enqueueNeededRowsAndStart()`** — Tìm các hàng còn thiếu lượt xem của hôm nay, đưa vào hàng chờ và bắt đầu chạy.
*   **`startQueueWorker()`** — Kích hoạt xử lý các hàng đang đợi ngay lập tức.
*   **`stopAllProcessing()` / `resumeProcessing()`** — Tạm dừng hoặc tiếp tục toàn bộ quá trình xử lý hàng chờ.

---

## 📝 Hướng dẫn thiết lập (Setup)

1.  **Tạo Google Form:** Kết nối Form vào sheet **Data**. Yêu cầu thu thập Email (verified) và Link video TikTok. Hỗ trợ nhập batch (nhiều link), mỗi link nằm trên một dòng.
    *   Cấu trúc Header của sheet **Data** (Dòng 1):
        `Timestamp | Email Address | Tiktok Video Link | Name | Max_view | Queue_status | Queue_attempts | Last_attempt_at | Last_error | Last_session_number | 05-05`
2.  **Chạy `SetupTrigger()`:** Mở trình soạn thảo code và chạy hàm này để kích hoạt hệ thống tự động.
3.  **Cấu hình API Key:** Lấy Key từ Scraper API và dán vào sheet có tên **ScraperAPI_Keys**.
4.  **Theo dõi:** Kiểm tra tiến độ và lỗi tại sheet **Logs queue**.

---

## 🔗 Demo
*   **Mẫu Form:** [Tại đây](https://forms.gle/xcRzDPL2Ydy8PTeQ8)
*   **Mẫu Sheet:** [Tại đây](https://docs.google.com/spreadsheets/d/1mWhJx7oaO2BLbjnUF0Lo1cswNhm1wju4sopPhEkSOEI/edit?usp=sharing)
