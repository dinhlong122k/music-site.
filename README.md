# Nghe nhạc (chạy trên Cloudflare Pages, vượt tường lửa)

Website nghe nhạc riêng, chạy trên **Cloudflare Pages**. Thiết kế để dùng được sau tường lửa
công ty (FortiGate) hay chặn `youtube.com` / `googleapis.com`.

**Vì sao vượt được tường lửa:** trình duyệt CHỈ nói chuyện với domain của chính site
(`*.pages.dev` hoặc tên miền riêng). Mọi việc tìm bài, lấy luồng nhạc và tải nhạc đều đi qua
**Cloudflare Pages Functions** (`/api/*`). Các Function này mới là nơi gọi ra Piped / YouTube —
chạy trên máy chủ Cloudflare, không phải trên máy bạn.

- Dán link playlist YouTube, hoặc gõ tên bài để tìm, rồi phát.
- **Không cần API key.** Dùng mạng Piped công cộng (được proxy qua `/api`), không cần tài khoản Google.
- Frontend chỉ có HTML/CSS/JS thuần; backend là vài file Function nhỏ. Không có bước build.
- Không tải ảnh bìa (giữ đúng nguyên tắc "chỉ cùng domain"). Giao diện hiện ô trống thay ảnh.

## 1. Luồng dữ liệu

```
Trình duyệt (chỉ gọi *.pages.dev)
   │  GET /api/search?q=...        → Function gọi Piped /search          → danh sách bài
   │  GET /api/playlist?id=...     → Function gọi Piped /playlists/{id}  → bài trong playlist
   │  GET /api/stream?id=VIDEO_ID  → Function gọi Piped /streams/{id}    → chọn audio tốt nhất
   │                                 trả link đã bọc: /api/proxy?url=...
   └  <audio src="/api/proxy?...">  → Function tải nhạc hộ (hỗ trợ tua)  → phát
```

## 2. Cấu trúc code

| File | Việc của nó |
| --- | --- |
| `public/` | Thư mục file tĩnh Cloudflare Pages phục vụ (`pages_build_output_dir`) |
| `public/index.html` | Khung trang và CSP (chỉ cho tải/kết nối cùng domain) |
| `public/css/style.css` | Giao diện hai cột |
| `public/js/app.js` | Khởi động, nối các phần với nhau |
| `public/js/piped-api.js` | Gọi `/api/*` (cùng domain), đổi lỗi thành tiếng Việt |
| `public/js/player.js` | Bọc thẻ `<audio>` HTML5 |
| `public/js/ui.js` | Vẽ giao diện, gắn sự kiện (chỉ `textContent`, không `innerHTML`) |
| `public/js/queue.js` | Logic danh sách phát (không đụng giao diện) |
| `public/js/storage.js` | Đọc/ghi `localStorage` an toàn (danh sách + chế độ lặp) |
| `public/js/validate.js` | Kiểm tra ID, tạo bài hát an toàn |
| `public/js/url-parser.js` | Tách playlistId từ link YouTube |
| `wrangler.toml` | Khai báo project Pages (`pages_build_output_dir = "./public"`) |
| `functions/api/_piped.js` | Dùng chung: danh sách instance, gọi Piped, chuẩn hoá, chặn proxy mở |
| `functions/api/search.js` | `GET /api/search?q=` |
| `functions/api/stream.js` | `GET /api/stream?id=` |
| `functions/api/proxy.js` | `GET /api/proxy?url=` (truyền luồng nhạc, hỗ trợ Range để tua) |
| `functions/api/playlist.js` | `GET /api/playlist?id=` |
| `tests/` | Test bằng `node --test` |

## 3. Chạy test

Cần Node.js 18 trở lên:

```
node --test
```

## 4. Chạy thử ở máy (tuỳ chọn)

Pages Functions cần `wrangler` để chạy local (chỉ mở `index.html` bằng Python/Node thường sẽ
KHÔNG có `/api/*`, nên không phát được nhạc). Cần Node.js:

```
npx wrangler pages dev ./public
```

Mở địa chỉ mà lệnh in ra (thường `http://localhost:8788`). Lệnh này chạy cả trang tĩnh lẫn các
Function trong `functions/`.

## 5. Đưa lên Cloudflare Pages (từng bước)

Không có bước build. Có hai cách; chọn một.

### Cách A — nối Git (khuyên dùng, tự deploy khi push)

1. Đẩy code lên một repository GitHub/GitLab.
2. Vào https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git**, chọn repo.
3. Ở phần build:
   - **Framework preset:** None
   - **Build command:** để TRỐNG
   - **Build output directory:** `public` (khớp `pages_build_output_dir` trong `wrangler.toml`)
4. Bấm **Save and Deploy**. Vài phút sau có địa chỉ `https://TEN-DU-AN.pages.dev`.
   Cloudflare tự nhận thư mục `functions/` thành các API `/api/*`.

   > Lưu ý: PHẢI tạo kiểu **Pages**, không phải **Workers**. Nếu lỡ tạo Worker,
   > build chạy `wrangler deploy` và báo lỗi "`functions` directory ... looks like a
   > Cloudflare Pages project". File `wrangler.toml` (có `pages_build_output_dir`) đã
   > khai báo đây là Pages để build chạy đúng `wrangler pages deploy ./public`.

### Cách B — tải thẳng bằng Wrangler (không cần Git)

```
npx wrangler pages deploy ./public
```

Làm theo hướng dẫn đăng nhập; chọn/tạo project. Xong sẽ in ra địa chỉ `*.pages.dev`.

## 6. Kiểm tra thủ công site đã chạy (manual verification)

Sau khi deploy, mở `https://TEN-DU-AN.pages.dev` và kiểm theo thứ tự. Nếu bước nào hỏng, xem
mục 8 (xử lý sự cố).

1. **Function sống chưa:** mở thẳng `https://TEN-DU-AN.pages.dev/api/search?q=test`.
   - Mong đợi: JSON `{"items":[...]}` có vài bài.
   - Nếu ra `{"error":"upstream_failed"}` (mã 502): các instance Piped mặc định đang hỏng → xem mục 7 để đổi.
2. **Tìm bài:** ở trang, gõ tên một bài hát rồi bấm **Tìm**. Phải thấy danh sách kết quả.
3. **Phát:** bấm vào một kết quả. Thanh trạng thái chuyển `Đang tải...` → `Đang phát: ...`,
   và nghe thấy nhạc. (Lần đầu trình duyệt có thể chặn tự phát — bấm nút ▶ trên thanh audio.)
4. **Tua:** kéo thanh thời gian của trình phát tới giữa bài. Nếu nhảy tới đúng chỗ và phát tiếp
   là `/api/proxy` đã hỗ trợ Range đúng.
5. **Playlist:** dán một link `https://www.youtube.com/playlist?list=...` rồi bấm **Tải**.
   Danh sách bên phải phải đầy bài và tự phát bài đầu.
6. **Điều khiển:** thử ⏮ ⏯ ⏭, **Trộn**, **Lặp**.
7. **Nhớ trạng thái:** tải lại trang (F5). Danh sách và bài hiện tại còn đó (không tự phát — đúng).
8. **Chạy sau tường lửa:** mở site bằng máy trong mạng công ty. Vì trang chỉ gọi `*.pages.dev`,
   không gọi `youtube.com`/`googleapis.com`, nên không dính 403 như trước.

Kiểm nhanh bằng DevTools (F12 → tab **Network**): mọi request phải tới chính domain của bạn
(`/api/search`, `/api/stream`, `/api/proxy`). Không được có request thẳng tới `googlevideo.com`
hay `youtube.com` từ trình duyệt.

## 7. Đổi máy chủ Piped mà không sửa code

Các instance Piped công cộng hay sập/bảo trì. Nếu `/api/search` trả 502, đổi danh sách bằng
biến môi trường (không cần sửa code, không cần deploy lại code):

1. Dashboard Cloudflare → project Pages của bạn → **Settings** → **Variables and Secrets**
   (môi trường **Production**).
2. Thêm biến tên **`PIPED_INSTANCES`**, giá trị là các URL API ngăn cách bằng dấu phẩy, ví dụ:

   ```
   https://pipedapi.kavin.rocks,https://pipedapi.adminforge.de
   ```

3. **Save**, rồi **Retry deployment** (hoặc deploy lại) để biến có hiệu lực.

Danh sách instance đang sống xem ở: https://github.com/TeamPiped/documentation (hoặc trang
uptime của TeamPiped). Nhớ dùng host **API** (thường bắt đầu bằng `pipedapi.` hoặc `api.`),
không phải host giao diện.

## 8. Xử lý sự cố

- **Tìm được bài nhưng không phát (lỗi "không phát được"):** instance trả được metadata nhưng
  luồng audio hỏng. Thử lại, hoặc đổi `PIPED_INSTANCES` (mục 7).
- **`/api/proxy` trả 403 "Host not allowed":** đúng là tính năng an toàn — proxy chỉ cho tải từ
  googlevideo / pipedproxy / tên miền instance đã cấu hình. Nếu đổi sang instance có domain proxy
  lạ, thêm instance đó vào `PIPED_INSTANCES` để domain của nó được cho phép.
- **Mạng công ty vẫn chặn:** kiểm tra tường lửa có chặn cả `*.pages.dev` không. Nếu có, gắn
  **tên miền riêng** cho project Pages (Settings → Custom domains) rồi dùng tên miền đó.

## 9. An toàn

- **CSP** chỉ cho `'self'`: trang không thể gọi hay tải từ domain ngoài, kể cả khi có lỗ hổng.
- **`/api/proxy` KHÔNG phải proxy mở:** chỉ chuyển tiếp tới host trong danh sách cho phép, tránh
  bị kẻ xấu mượn domain của bạn để proxy nội dung bất kỳ (SSRF).
- Không có API key, không secret trong code. `.gitignore` chặn các file cấu hình local.

## 10. Hành vi cần biết

- Tải playlist sẽ THAY danh sách đang phát và phát bài đầu; tối đa 500 bài.
- Bấm tên ở kết quả tìm kiếm: thêm vào cuối và phát ngay. Bấm `+`: chỉ thêm vào cuối.
- Trộn: trộn thứ tự một lần, bài đang phát lên đầu. Lặp: tắt → cả danh sách → một bài → tắt.
- Tải lại trang: nhớ danh sách, bài hiện tại và chế độ lặp, nhưng không tự phát (trình duyệt chặn).
