# Nghe nhạc (website tĩnh dùng YouTube)

Website nghe nhạc riêng cho bạn và vài người quen, chạy trên máy tính.

- Dán link playlist YouTube, hoặc gõ tên bài để tìm, rồi phát.
- Chỉ có HTML, CSS, JavaScript thuần. Không backend, không database, không bước build.
- **Không có API key nào trong code.** Mỗi người tự dán key của mình vào trang; key chỉ lưu trên trình duyệt của người đó và chỉ gửi tới `https://www.googleapis.com`.
- Trình phát YouTube luôn hiện (tối thiểu 200x200 px). Site không phát nhạc khi mạng chặn YouTube, đó là hành vi đúng.

## 1. Chạy thử ở máy

Cần cài Python hoặc Node.js (một trong hai là đủ).

Mở terminal (PowerShell) trong thư mục dự án rồi chạy MỘT trong hai lệnh:

```
python -m http.server 8080
```

hoặc

```
npx serve
```

Mở trình duyệt vào `http://localhost:8080` (với `npx serve` thì dùng địa chỉ mà lệnh in ra). Lần đầu bạn sẽ thấy màn hình nhập key.

**Mở `index.html` bằng cách bấm đúp (địa chỉ `file://...`) sẽ KHÔNG chạy được**: trình duyệt chặn JavaScript dạng module từ `file://`, và key bị giới hạn theo referrer cũng không khớp. Luôn dùng máy chủ cục bộ như trên.

Khi chạy thử ở máy, hãy tạo một **key riêng chỉ để thử** (xem mục 2) và dán key đó vào trang `localhost`; đừng dùng key thật của site đã đưa lên mạng.

Chạy test (cần Node.js 18 trở lên):

```
node --test
```

## 2. Tạo API key và giới hạn nó (từng bước)

1. Vào https://console.cloud.google.com và đăng nhập tài khoản Google.
2. Bấm chọn project ở thanh trên, chọn **Dự án mới (New project)**, đặt tên (ví dụ `music-site`), bấm **Tạo**.
3. Vào menu **APIs & Services > Library**, tìm **YouTube Data API v3**, bấm **Enable (Bật)**.
4. Vào **APIs & Services > Credentials**, bấm **Create credentials > API key**. Google sẽ hiện key, hãy giữ trang này mở.
5. Bấm **Edit API key** (hoặc tên key) để giới hạn. Việc này RẤT quan trọng, vì key sẽ nằm trong trình duyệt:
   - **API restrictions**: chọn **Restrict key**, chỉ tick **YouTube Data API v3**.
   - **Application restrictions**: chọn **Websites (HTTP referrers)**, rồi thêm:
     - `https://TEN-BAN.github.io/*` (thay `TEN-BAN` bằng tên tài khoản GitHub của bạn)
   - KHÔNG thêm `http://localhost:*/*` vào key thật. Cho phép localhost nghĩa là bất kỳ ai chạy một trang trên máy của họ cũng dùng được key của bạn. Muốn thử ở máy thì tạo một key thứ hai (bước 4), giới hạn **API restrictions** giống key thật, chỉ thêm referrer `http://localhost:*/*`, dùng xong thì xoá key đó.
6. Bấm **Save**. Có thể mất vài phút để giới hạn có hiệu lực.
7. Mở site, dán key vào ô nhập key và bấm **Lưu**.

Hạn mức miễn phí: 10.000 đơn vị mỗi ngày cho mỗi key. Mỗi lần tìm bài tốn 100 đơn vị (khoảng 100 lần tìm/ngày), mỗi trang playlist (50 bài) tốn 1 đơn vị.

Nếu muốn dùng key khác: bấm **Đổi / Xoá key** ở góc trên bên phải. Danh sách đang phát vẫn được giữ (nhạc đang phát sẽ được tạm dừng).

### Thu hồi hoặc đổi key (khi nghi key bị lộ)

1. Vào https://console.cloud.google.com, chọn đúng project, vào **APIs & Services > Credentials**.
2. Muốn đổi key: bấm tên key, bấm **Regenerate key (Tạo lại key)** nếu có, hoặc tạo key mới (**Create credentials > API key**) và áp giới hạn như mục 2.
3. Bấm biểu tượng thùng rác ở key cũ (**Delete**) để thu hồi ngay; key cũ lập tức vô dụng.
4. Mở site, bấm **Đổi / Xoá key** và dán key mới. Key đã dán nằm trong `localStorage` của trình duyệt từng người, nên mỗi người dùng chung site phải tự đổi.

### Cảnh báo quan trọng khi dùng GitHub Pages

**Mọi repository GitHub Pages của cùng một tài khoản đều dùng chung một địa chỉ gốc `https://TEN-BAN.github.io`, nên cũng dùng chung `localStorage`.** JavaScript của bất kỳ trang nào trong tài khoản đó đọc được key mà bạn đã dán ở site này.

- Đừng đặt trang khác có chứa JavaScript của bên thứ ba (quảng cáo, thống kê, thư viện lạ) dưới cùng tài khoản GitHub.
- Tốt nhất dùng một tài khoản hoặc tổ chức (organization) GitHub riêng chỉ cho site này.
- Key đã giới hạn theo referrer và theo API (mục 2) để hạn chế thiệt hại nếu bị lộ, nhưng không thay thế được các biện pháp trên.

### Key gửi bằng header, cần thử một lần với key thật

Site gửi key qua header `X-Goog-Api-Key` (không để trong URL). Phần này chưa được thử với key thật trong lúc viết code (các test dùng `fetch` giả). Sau khi dán key thật lần đầu, hãy thử tải một playlist và tìm một bài; nếu báo lỗi key hoặc lỗi mạng dù key đúng, hãy báo lại.

## 3. Đưa lên GitHub Pages (từng bước)

1. Tạo tài khoản GitHub nếu chưa có, rồi tạo repository mới (ví dụ `music-site`, chế độ Public).
2. Trong thư mục dự án, mở terminal và chạy lần lượt (thay `TEN-BAN`):

   ```
   git init
   git add .
   git commit -m "Website nghe nhạc"
   git branch -M main
   git remote add origin https://github.com/TEN-BAN/music-site.git
   git push -u origin main
   ```

3. Trên GitHub, vào repository > **Settings > Pages**.
4. Ở mục **Build and deployment > Source** chọn **Deploy from a branch**; **Branch** chọn `main`, thư mục `/ (root)`; bấm **Save**.
5. Đợi khoảng 1-2 phút. Địa chỉ site sẽ là `https://TEN-BAN.github.io/music-site/`.
6. Quay lại Google Cloud Console, kiểm tra key đã có referrer `https://TEN-BAN.github.io/*` (bước 5 ở phần 2).

Trước khi push, hãy chắc chắn không có key nào nằm trong file. File `.gitignore` đã chặn các file cấu hình local thường gặp.

## 4. Cấu trúc code

| File | Việc của nó |
| --- | --- |
| `index.html` | Khung trang và CSP (giới hạn nguồn tải) |
| `css/style.css` | Giao diện hai cột |
| `js/app.js` | Khởi động, nối các phần với nhau |
| `js/ui.js` | Vẽ giao diện, gắn sự kiện (chỉ dùng `textContent`, không `innerHTML`) |
| `js/storage.js` | Đọc/ghi `localStorage` an toàn |
| `js/validate.js` | Kiểm tra ID, URL ảnh, tạo bài hát an toàn |
| `js/url-parser.js` | Tách playlistId từ link |
| `js/youtube-api.js` | Gọi YouTube Data API, đổi lỗi thành tiếng Việt |
| `js/queue.js` | Logic danh sách phát (không đụng giao diện) |
| `js/player.js` | Bọc YouTube IFrame Player API |
| `tests/` | Test bằng `node --test` |

## 5. Hành vi cần biết

- Tải playlist sẽ THAY danh sách đang phát và phát bài đầu; tối đa 500 bài, bài đã xoá/riêng tư bị bỏ.
- Bấm tên/ảnh ở kết quả tìm kiếm: thêm vào cuối và phát ngay. Bấm `+`: chỉ thêm vào cuối.
- Trộn: trộn thứ tự danh sách một lần, bài đang phát lên đầu.
- Lặp: tắt, rồi cả danh sách, rồi một bài, rồi lại tắt.
- Tải lại trang: nhớ danh sách, bài hiện tại và chế độ lặp, nhưng không tự phát (trình duyệt chặn tự phát).
