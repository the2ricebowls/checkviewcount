# TikTok Video Stats Workflow - Tài liệu n8n

## Tổng quan

Workflow này tự động thu thập thông tin chi tiết từ các video TikTok, bao gồm:
- Thống kê engagement (views, likes, comments, shares)
- Subtitle/phụ đề video (nếu có)
- Transcript audio (sử dụng Groq Whisper API)

Dữ liệu được lưu vào Google Sheets để phân tích và theo dõi.

---

## Kiến trúc Workflow

### Flow chính

```
Manual Trigger → Read URLs → Loop → Process Each URL → Update Sheet → Wait → Next Item
```

### Xử lý WAF & Proxy

```
Fetch HTML → WAF Check → Retry (same proxy) → WAF Check → Rotate Proxy → Retry (new proxy)
```

### Xử lý Subtitle/Transcript

```
Parse Metadata → Has Subtitle? 
  ├─ YES → Fetch Subtitle → Parse VTT
  └─ NO  → Call Transcribe API
```

---

## Chi tiết các Node

### 1. Trigger & Configuration

#### `When clicking 'Execute workflow'`
- **Type:** Manual Trigger
- **Chức năng:** Khởi động workflow thủ công
- **Vị trí:** Entry point của workflow

#### `⚙️ Proxy Config`
- **Type:** Set (n8n-nodes-base.set)
- **Chức năng:** Cấu hình proxy và API key
- **Output:**
  - `proxy_api_key`: Key để gọi API xoay proxy
  - `proxy_api_url`: Endpoint API xoay proxy
  - `proxy_live`: Số lượng proxy live tối thiểu
  - `current_proxy`: Proxy hiện tại (format: `ip:port:user:pass`)

---

### 2. Data Input

#### `Read URL List`
- **Type:** Google Sheets (n8n-nodes-base.googleSheets)
- **Chức năng:** Đọc danh sách URL TikTok từ Google Sheets
- **Config:**
  - Document ID: `1q3YEi7EqmCVcMwHRh4ihvrJCincIeS3yRIsqBSSzXNE`
  - Sheet: "Data" (gid=0)
- **Output:** Mảng các row chứa cột `URL`, `Subtitle`, etc.

#### `Loop Over Items`
- **Type:** Split In Batches (n8n-nodes-base.splitInBatches)
- **Chức năng:** Xử lý từng URL một (batch size = 1)
- **Config:** `reset: false` - không reset context giữa các batch
- **Output:** 
  - Branch 1: Khi hết items → `Done`
  - Branch 2: Tiếp tục xử lý item hiện tại

---

### 3. Conditional Processing

#### `Skip if already done`
- **Type:** If (n8n-nodes-base.if)
- **Chức năng:** Bỏ qua video đã xử lý
- **Conditions:**
  - `URL` không rỗng
  - `Subtitle` rỗng (chưa xử lý)
- **Output:**
  - TRUE → Tiếp tục xử lý
  - FALSE → Quay lại `Loop Over Items`

---

### 4. TikTok Data Fetching

#### `Set TikTok URL`
- **Type:** Set
- **Chức năng:** Chuẩn bị URL và proxy cho request
- **Output:**
  - `tiktok_url`: URL video cần fetch
  - `current_proxy`: Proxy từ config

#### `Fetch TikTok HTML`
- **Type:** HTTP Request (n8n-nodes-base.httpRequest)
- **Chức năng:** Tải HTML trang TikTok
- **Config:**
  - URL: `{{ $json.tiktok_url }}`
  - Headers:
    - `User-Agent`: Chrome 120
    - `Accept-Language`: en-US,en;q=0.9
  - Response format: `text`
  - Proxy: `{{ $json.current_proxy }}`

---

### 5. WAF Detection & Retry Logic

#### `WAF? (lần 1)`
- **Type:** If
- **Chức năng:** Kiểm tra xem response có bị WAF block không
- **Condition:** HTML không chứa `__UNIVERSAL_DATA_FOR_REHYDRATION__`
- **Output:**
  - TRUE (bị WAF) → `Retry lần 1 (proxy cũ)`
  - FALSE (OK) → `Parse TikTok Metadata`

#### `Retry lần 1 (proxy cũ)`
- **Type:** HTTP Request
- **Chức năng:** Thử lại với cùng proxy
- **Config:** Giống `Fetch TikTok HTML`

#### `Vẫn WAF? → Xoay proxy`
- **Type:** If
- **Chức năng:** Kiểm tra lần 2
- **Output:**
  - TRUE (vẫn bị WAF) → `Xoay Proxy`
  - FALSE (OK) → `Parse TikTok Metadata`

---

### 6. Proxy Rotation

#### `Xoay Proxy`
- **Type:** HTTP Request
- **Chức năng:** Gọi API để lấy proxy mới
- **Config:**
  - URL: `{{ proxy_api_url }}`
  - Query params:
    - `key`: API key
    - `live`: Số proxy live tối thiểu
- **Response:**
  ```json
  {
    "proxyhttp": "ip:port:user:pass",
    "next_allowed_in_seconds": 45
  }
  ```

#### `Cần chờ? (< 60s)`
- **Type:** If
- **Chức năng:** Kiểm tra xem có cần chờ proxy sẵn sàng không
- **Conditions:**
  - `next_allowed_in_seconds < 60`
  - `next_allowed_in_seconds > 0`
- **Output:**
  - TRUE → `Chờ proxy sẵn sàng` hoặc `Retry lần 2`
  - FALSE → `Set Proxy Mới`

#### `Chờ proxy sẵn sàng`
- **Type:** Wait (n8n-nodes-base.wait)
- **Chức năng:** Pause workflow cho đến khi proxy sẵn sàng
- **Duration:** `{{ next_allowed_in_seconds }}` giây

#### `Set Proxy Mới`
- **Type:** Set
- **Chức năng:** Cập nhật proxy mới vào context
- **Output:**
  - `tiktok_url`: Giữ nguyên
  - `current_proxy`: Proxy mới từ API

#### `Retry lần 2 (proxy mới)`
- **Type:** HTTP Request
- **Chức năng:** Thử lại với proxy mới
- **Config:** Giống `Fetch TikTok HTML` nhưng dùng proxy mới

---

### 7. Data Parsing

#### `Parse TikTok Metadata`
- **Type:** Code (n8n-nodes-base.code)
- **Chức năng:** Parse HTML để extract metadata video
- **Logic:**
  1. Tìm thẻ `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">`
  2. Parse JSON từ nội dung script
  3. Navigate: `data.__DEFAULT_SCOPE__['webapp.video-detail'].itemInfo.itemStruct`
  4. Extract các field:
     - `id`, `desc`, `create_time`
     - `author`, `author_nickname`
     - `play_count`, `like_count`, `comment_count`, `share_count`, `collect_count`
     - `duration`, `hashtags`
     - `subtitle_url`, `has_subtitle`, `has_original_audio`

- **Subtitle Detection Logic:**
  ```javascript
  // Ưu tiên subtitle Version 1 (ASR gốc)
  // Fallback: subtitle tiếng Việt (vie-VN)
  // Fallback: subtitle đầu tiên
  // Fallback: claInfo.captionInfos
  ```

- **Output:**
  ```json
  {
    "id": "7228290717779528961",
    "desc": "Caption video...",
    "author": "username",
    "play_count": "64",
    "like_count": "4",
    "comment_count": "2",
    "share_count": "0",
    "collect_count": "1",
    "duration": 14,
    "hashtags": "depresion, stress, tamtrang, camxuc",
    "subtitle_url": "https://...",
    "has_subtitle": true,
    "has_original_audio": false
  }
  ```

---

### 8. Subtitle/Transcript Processing

#### `Has Subtitle?`
- **Type:** If
- **Chức năng:** Kiểm tra video có subtitle không
- **Condition:** `has_subtitle == true`
- **Output:**
  - TRUE → `Fetch Subtitle`
  - FALSE → `Call Transcribe API`

#### Branch A: Video có subtitle

##### `Fetch Subtitle`
- **Type:** HTTP Request
- **Chức năng:** Tải file WebVTT subtitle
- **Config:**
  - URL: `{{ $json.subtitle_url }}`
  - Response format: `text`
  - Proxy: Dùng proxy hiện tại

##### `Parse Subtitle`
- **Type:** Code
- **Chức năng:** Parse WebVTT thành text thuần
- **Logic:**
  ```javascript
  // Bỏ qua các dòng:
  // - "WEBVTT"
  // - Chứa "-->" (timestamp)
  // - Chỉ có số (index)
  // - Dòng trống
  // Ghép các dòng còn lại thành string
  ```
- **Output:**
  ```json
  {
    "subtitle": "Nội dung subtitle...",
    "transcript": ""
  }
  ```

##### `Set Transcript Result1`
- **Type:** Set
- **Chức năng:** Format output cho branch subtitle
- **Output:**
  - `subtitle`: Text từ subtitle
  - `transcript`: Rỗng

#### Branch B: Video không có subtitle

##### `Call Transcribe API`
- **Type:** HTTP Request
- **Chức năng:** Gọi API transcribe audio bằng Groq Whisper
- **Github:** https://github.com/the2ricebowls/ttta
- **Config:**
  - Method: `POST`
  - URL: `https://ttta.onrender.com/transcribe`
  - Body:
    ```json
    {
      "url": "{{ tiktok_url }}",
      "language": "vi"
    }
    ```
  - Timeout: `120000` ms (2 phút)

- **API Logic:**
  - Nếu `hasOriginalAudio=true`: Tải video → extract audio → Groq
  - Nếu `hasOriginalAudio=false`: Tải `music.playUrl` → Groq (nhanh hơn ~5x)

- **Response:**
  ```json
  {
    "id": "7228290717779528961",
    "transcript": "Nội dung được transcribe...",
    "source": "video_extracted",
    "language": "vi",
    "has_original_audio": true
  }
  ```

##### `Set Transcript Result`
- **Type:** Set
- **Chức năng:** Format output cho branch transcribe
- **Output:**
  - `subtitle`: "Không có Subtitle"
  - `transcript`: Text từ API

---

### 9. Merge & Output

#### `Merge Results`
- **Type:** Merge (n8n-nodes-base.merge)
- **Chức năng:** Gộp kết quả từ 2 branch (subtitle/transcript)
- **Mode:** Merge by position
- **Input:**
  - Input 1: `Set Transcript Result1` (có subtitle)
  - Input 2: `Set Transcript Result` (không có subtitle)

#### `Combine Final Output`
- **Type:** Set
- **Chức năng:** Tạo output cuối cùng để ghi vào Sheet
- **Output:**
  ```json
  {
    "URL": "{{ tiktok_url }}",
    "Like": "{{ like_count }}",
    "View": "{{ play_count }}",
    "Comment": "{{ comment_count }}",
    "Share": "{{ share_count }}",
    "Subtitle": "{{ subtitle }}",
    "Transcript": "{{ transcript }}",
    "Generated Date": "2026-04-11"
  }
  ```

---

### 10. Data Storage

#### `Update Sheet`
- **Type:** Google Sheets
- **Operation:** `appendOrUpdate`
- **Chức năng:** Cập nhật hoặc thêm mới row vào Sheet
- **Config:**
  - Document ID: `1q3YEi7EqmCVcMwHRh4ihvrJCincIeS3yRIsqBSSzXNE`
  - Sheet: "Data"
  - Matching column: `URL` (dùng để tìm row cần update)
  - Columns mapping:
    - URL, Like, View, Comment, Share
    - Subtitle, Transcript
    - Generated Date

- **Logic:**
  - Nếu URL đã tồn tại → Update row đó
  - Nếu URL chưa tồn tại → Append row mới

---

### 11. Loop Control

#### `Wait 5s`
- **Type:** Wait
- **Chức năng:** Delay 5 giây giữa các request
- **Lý do:** Tránh rate limit từ TikTok và Google Sheets API

#### `Done`
- **Type:** Set
- **Chức năng:** Đánh dấu workflow hoàn thành
- **Output:**
  ```json
  {
    "status": "All done"
  }
  ```

---

## Error Handling

### WAF Detection
- **Dấu hiệu:** HTML không chứa `__UNIVERSAL_DATA_FOR_REHYDRATION__`
- **Giải pháp:**
  1. Retry với cùng proxy (1 lần)
  2. Xoay proxy mới
  3. Retry với proxy mới

### Proxy Rotation
- **Cooldown:** Nếu API trả về `next_allowed_in_seconds > 0`
- **Giải pháp:** Wait cho đến khi proxy sẵn sàng

### Subtitle Fallback
- **Nếu không có subtitle:** Gọi Transcribe API
- **Nếu Transcribe API fail:** Transcript = rỗng (workflow vẫn tiếp tục)

---

## Configuration Requirements

### Google Sheets
- **Credential:** `googleSheetsOAuth2Api`
- **Document ID:** `1q3YEi7EqmCVcMwHRh4ihvrJCincIeS3yRIsqBSSzXNE`
- **Sheet structure:**
  ```
  | URL | Like | View | Comment | Share | Subtitle | Transcript | Generated Date |
  ```

### Proxy API
- **Endpoint:** `https://api.proxyxoay.org/api/key_xoay.php`
- **API Key:** Cần cấu hình trong node `⚙️ Proxy Config`
- **Response format:**
  ```json
  {
    "proxyhttp": "ip:port:user:pass",
    "next_allowed_in_seconds": 0
  }
  ```

### Transcribe API
- **Endpoint:** `https://ttta.onrender.com/transcribe`
- **Method:** POST
- **Timeout:** 120 seconds
- **Request:**
  ```json
  {
    "url": "https://www.tiktok.com/@user/video/123",
    "language": "vi"
  }
  ```

---
