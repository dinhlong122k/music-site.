# Music Site — Thiết kế

Ngày: 2026-11-12. Trạng thái: đã duyệt trong chat.

## 1. Mục đích

Website nghe nhạc riêng, chạy trên máy tính, deploy miễn phí trên GitHub Pages.
Người dùng: chủ site + 2-3 người quen. Không đăng nhập.

Hai việc chính:
1. Dán link playlist YouTube → hiện danh sách bài → phát.
2. Gõ tên bài → tìm trên YouTube → phát hoặc thêm vào danh sách.

## 2. Mục tiêu / Không làm / Thất bại nếu

**Mục tiêu**
- Chỉ front-end tĩnh. Không backend, không serverless, không database.
- Không có API key nào trong repo hay trong code đã deploy.
- Code dễ đọc cho người mới học: comment tiếng Việt, mỗi file một việc, hàm nhỏ.

**Không làm**
- Lưu nhiều playlist có tên, tài khoản, đồng bộ giữa các máy.
- Nghe khi tắt màn hình, tối ưu mobile.
- Tách riêng audio từ YouTube. Ẩn hoặc che trình phát YouTube.
- Bất kỳ cơ chế nào để vượt bộ lọc mạng (proxy, đổi domain...). Mạng chặn YouTube thì site không phát được — đó là hành vi đúng.

**Thất bại nếu** (dù vẫn chạy)
- Key xuất hiện trong repo, trong URL trang, hoặc gửi tới domain khác ngoài `www.googleapis.com`.
- Tên bài từ API được chèn vào trang dưới dạng HTML (lỗ hổng XSS).
- Trình phát nhỏ hơn 200×200 px hoặc bị che (vi phạm điều khoản YouTube).

## 3. Ràng buộc kỹ thuật (đã chốt)

- HTML + CSS + JavaScript thuần (ES modules), **không framework, không bước build**. Mở bằng GitHub Pages là chạy.
- Phát nhạc: YouTube IFrame Player API (`https://www.youtube.com/iframe_api`).
- Dữ liệu: YouTube Data API v3, gọi trực tiếp từ trình duyệt bằng key người dùng dán.
- Lưu trữ: `localStorage` (mọi đọc/ghi bọc `try/catch`; hỏng thì trang vẫn chạy, chỉ không nhớ).
- Hạn mức Data API: 10.000 đơn vị/ngày/key. `search.list` = 100 đơn vị, `playlistItems.list` = 1 đơn vị/trang.

## 4. Giao diện — Bố cục A (hai cột)

```
┌───────────────────────────────┬───────────────────────────────┐
│ [Dán link playlist...] [Tải]  │  ┌─────────────────────────┐  │
│ [Tìm bài hát...]      [Tìm]   │  │  Video YouTube (≥200px) │  │
│                               │  └─────────────────────────┘  │
│ Kết quả tìm kiếm              │  ⏮ ⏯ ⏭   🔀  🔁(tắt/all/1)    │
│  • Tên bài — Kênh      [+]    │  Danh sách đang phát (N bài)  │
│  • Tên bài — Kênh      [+]    │   1. Bài 1  ◀ đang phát   [x] │
│  ...                          │   2. Bài 2                [x] │
└───────────────────────────────┴───────────────────────────────┘
 Thanh trên cùng: tên site · nút "Đổi / Xoá key"
 Vùng thông báo lỗi/trạng thái (tiếng Việt)
```

Toàn bộ chữ trên giao diện bằng tiếng Việt.

## 5. Hành vi

### 5.1 Key
- Chưa có key → chỉ hiện màn hình nhập key (ô `type="password"`) + hướng dẫn ngắn tạo key:
  1. Google Cloud Console → tạo project → bật "YouTube Data API v3".
  2. Tạo API key.
  3. Giới hạn API: chỉ "YouTube Data API v3".
  4. Giới hạn ứng dụng: HTTP referrer `https://<user>.github.io/*` (và `http://localhost:*/*` nếu chạy thử ở máy).
- Bấm Lưu → lưu `localStorage` → vào màn hình chính.
- Nút "Đổi / Xoá key": xoá key, quay về màn hình nhập key (danh sách đang phát giữ nguyên).
- Key chỉ được gửi tới `https://www.googleapis.com/youtube/v3/...`. Không log key ra console, không đưa vào URL của trang.
- API trả lỗi key sai / bị chặn referrer → báo lỗi rõ, gợi ý kiểm tra key.

### 5.2 Dán playlist
- Nhận các dạng link có tham số `list=`: `youtube.com/playlist?list=…`, `youtube.com/watch?v=…&list=…`, `music.youtube.com/playlist?list=…`, `youtu.be/…?list=…`. Cũng nhận chuỗi ID playlist trần.
- Link không hợp lệ → báo lỗi, không gọi API.
- Gọi `playlistItems.list` (`part=snippet,status`, `maxResults=50`), theo `nextPageToken`, **tối đa 500 bài** (người xây chọn).
- Bỏ các bài đã xoá / riêng tư.
- **Thay** danh sách đang phát bằng playlist này và phát bài đầu.

### 5.3 Tìm bài
- Enter hoặc bấm Tìm. Chuỗi rỗng → không gọi API.
- Gọi `search.list` (`part=snippet`, `type=video`, `videoEmbeddable=true`, `maxResults=10`).
- Mỗi kết quả: ảnh nhỏ, tên bài, tên kênh, nút `[+]`.
  - Bấm vào tên/ảnh: thêm vào cuối danh sách và phát ngay bài đó.
  - Bấm `[+]`: thêm vào cuối danh sách, không đổi bài đang phát.
- Đang tìm thì khoá nút Tìm để tránh tốn hạn mức do bấm nhiều lần.

### 5.4 Danh sách đang phát + trình phát
- Mỗi bài: `{ videoId, title, channel, thumbnail }`.
- Phát từng video theo `videoId` từ danh sách của mình (không dùng chế độ playlist của trình phát YouTube), để thứ tự do site điều khiển.
- Bài đang phát được tô sáng. Bấm bài → phát bài đó. `[x]` → xoá bài (xoá bài đang phát thì chuyển sang bài kế).
- Nút: trước / phát-dừng / sau / trộn / lặp.
  - **Trộn**: trộn thứ tự danh sách một lần, hiển thị ngay; bài đang phát lên đầu và tiếp tục phát (người xây chọn).
  - **Lặp**: tắt → lặp cả danh sách → lặp một bài → tắt.
- Hết bài → sang bài kế theo chế độ lặp. Hết danh sách và lặp tắt → dừng.
- Video lỗi (cấm nhúng, bị xoá, mã lỗi IFrame 2/5/100/101/150 hoặc khác) → báo ngắn, tự sang bài kế. Nếu **mọi** bài liên tiếp đều lỗi (đã thử hết một vòng) → dừng, không lặp vô hạn.
- Nhớ khi tải lại trang: danh sách, vị trí bài hiện tại, chế độ lặp. Tải lại không tự phát (trình duyệt chặn autoplay); hiện sẵn bài đã chọn.

### 5.5 Lỗi phải báo rõ (tiếng Việt)
- Key sai / bị chặn referrer (HTTP 400/403 với lý do tương ứng).
- Hết hạn mức ngày (`quotaExceeded`, `dailyLimitExceeded`).
- Lỗi mạng / không kết nối được YouTube (ví dụ mạng công ty chặn): nói rõ là không truy cập được YouTube từ mạng hiện tại.
- Playlist không tồn tại / riêng tư (404 `playlistNotFound`).

## 6. Bảo mật

- Repo và site **không chứa key**. Thêm `.gitignore` phòng trường hợp có file cấu hình local.
- Chữ từ API (tên bài, tên kênh) chỉ gắn vào DOM qua `textContent` / tạo element. **Không** dùng `innerHTML` với dữ liệu từ API hoặc từ người dùng.
- URL ảnh chỉ nhận từ `https://i.ytimg.com/`.
- `videoId`, `playlistId` kiểm tra bằng regex `^[A-Za-z0-9_-]+$` trước khi dùng.
- Thẻ `<meta http-equiv="Content-Security-Policy">` giới hạn nguồn:
  - `script-src 'self' https://www.youtube.com https://s.ytimg.com`
  - `frame-src https://www.youtube.com https://www.youtube-nocookie.com`
  - `connect-src https://www.googleapis.com`
  - `img-src 'self' https://i.ytimg.com data:`
  - `style-src 'self'`, `default-src 'self'`
  - Người xây chỉnh nếu IFrame API cần thêm nguồn, nhưng không mở `*` và không thêm `unsafe-eval`.
- Không đặt `Referrer-Policy: no-referrer`: Data API (khi key giới hạn referrer) và trình phát nhúng cần header Referer.

## 7. Cấu trúc code (đề xuất, người xây được chỉnh nếu có lý do)

```
music-site/
├── index.html
├── css/style.css
├── js/
│   ├── app.js           # khởi động, nối các phần với nhau
│   ├── storage.js       # đọc/ghi localStorage an toàn (key, danh sách, lặp)
│   ├── url-parser.js    # tách playlistId từ link; kiểm tra ID
│   ├── youtube-api.js   # gọi Data API: search, playlistItems; chuyển lỗi API → thông báo tiếng Việt
│   ├── queue.js         # logic danh sách thuần (thêm, xoá, kế/trước, trộn, lặp) — không đụng DOM
│   ├── player.js        # bọc IFrame Player API
│   └── ui.js            # vẽ giao diện, gắn sự kiện
├── tests/               # node --test cho url-parser.js, queue.js, phần xử lý lỗi của youtube-api.js
├── package.json         # chỉ để chạy test ("type": "module"), không dependency
├── README.md            # tiếng Việt: chạy thử ở máy, tạo key, deploy GitHub Pages
└── .gitignore
```

- Logic thuần (`url-parser`, `queue`, ánh xạ lỗi API) tách khỏi DOM để test được bằng `node --test` (Node 24 đã có sẵn).
- Mọi file: comment tiếng Việt giải thích *vì sao*, hàm ngắn, tên rõ nghĩa.

## 8. Kiểm tra (acceptance)

1. `node --test` xanh: tách link playlist (đủ các dạng ở 5.2, link sai, ID trần); queue (thêm, xoá bài đang phát, kế/trước với 3 chế độ lặp, trộn giữ bài hiện tại lên đầu); ánh xạ lỗi API (key sai, hết hạn mức, playlist không tồn tại, lỗi mạng).
2. `grep` repo không có chuỗi dạng key Google (`AIza`).
3. `grep` không có `innerHTML` gán dữ liệu động.
4. Chạy thử ở máy (`npx serve` hoặc `python -m http.server`) mở được, chưa có key thì thấy màn hình nhập key. (Phát nhạc thật cần key thật và mạng không chặn YouTube — để chủ site tự kiểm.)

## 9. Những lựa chọn do người xây/Claude quyết (chủ site chưa nói)

- Tối đa 500 bài khi tải playlist.
- Trộn = trộn một lần, bài đang phát lên đầu.
- Lặp xoay vòng tắt → cả danh sách → một bài.
- Bấm kết quả tìm kiếm = thêm vào cuối + phát ngay.
- Tải lại trang không tự phát.
- Thư mục dự án: `C:\Work\My Project\music-site`.
