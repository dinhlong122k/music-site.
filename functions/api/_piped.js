// _piped.js - phần dùng chung cho các API chạy trên Cloudflare Pages Functions.
//
// Vì sao có file này: cả search/stream/playlist đều cần gọi Piped và chuẩn hoá dữ liệu
// giống nhau. File bắt đầu bằng "_" nên Pages không biến nó thành một route công khai.
//
// Các hàm "chuẩn hoá" ở đây là hàm THUẦN (không gọi mạng) nên test được bằng `node --test`.

// Danh sách máy chủ Piped mặc định (thử lần lượt khi cái trước hỏng).
// Các instance công cộng hay sập/bảo trì => có thể ghi đè bằng biến môi trường
// PIPED_INSTANCES (các URL ngăn cách bằng dấu phẩy) mà KHÔNG phải sửa code.
const DEFAULT_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.reallyaweso.me',
  'https://api.piped.yt',
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

// Lấy danh sách instance: ưu tiên biến môi trường, sau đó mới tới mặc định.
export function getInstances(env) {
  const raw = env && env.PIPED_INSTANCES;
  if (typeof raw === 'string' && raw.trim()) {
    const list = raw.split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
    if (list.length) return list;
  }
  return DEFAULT_INSTANCES;
}

// Trả về Response JSON kèm Cache-Control: no-store (không lưu ở trình duyệt/proxy).
export function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// ---------- Gọi Piped (có fallback nhiều instance) ----------

// Thử lần lượt từng instance cho tới khi có cái trả JSON hợp lệ.
// Trả { data, base } để nơi gọi có thể phân trang tiếp trên ĐÚNG instance đó.
export async function pipedTry(env, path) {
  for (const base of getInstances(env)) {
    try {
      const res = await fetch(base + path, { headers: { 'User-Agent': UA } });
      if (!res.ok) continue;
      const data = await res.json();
      return { data, base };
    } catch {
      // Instance này hỏng: thử cái kế tiếp.
    }
  }
  throw new Error('all_instances_failed');
}

// Gọi tiếp trên một instance cụ thể (dùng khi phân trang playlist với nextpage token).
export async function pipedFrom(base, path) {
  const res = await fetch(base + path, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error('page_failed');
  return res.json();
}

export async function pipedGetJson(env, path) {
  return (await pipedTry(env, path)).data;
}

// ---------- Chuẩn hoá dữ liệu Piped -> bài hát ----------

// Tách videoId từ đường dẫn kiểu "/watch?v=ID" (hoặc URL có tham số v=...).
export function videoIdFromUrl(url) {
  if (typeof url !== 'string') return '';
  const i = url.indexOf('v=');
  if (i < 0) return '';
  return url.slice(i + 2).split('&')[0];
}

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

// Chuẩn hoá danh sách "stream" (dùng cho cả kết quả tìm kiếm và bài trong playlist).
// Mỗi item Piped: { url, type, title, uploaderName, duration, ... }.
export function mapStreamList(items) {
  const out = [];
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || typeof it !== 'object') continue;
    if (it.type && it.type !== 'stream') continue; // bỏ channel/playlist trong kết quả tìm
    const videoId = videoIdFromUrl(it.url);
    if (!ID_PATTERN.test(videoId)) continue;
    out.push({
      videoId,
      title: typeof it.title === 'string' ? it.title : '',
      uploader: typeof it.uploaderName === 'string'
        ? it.uploaderName
        : (typeof it.uploader === 'string' ? it.uploader : ''),
      duration: Number.isFinite(it.duration) ? it.duration : 0,
    });
  }
  return out;
}

// Chọn luồng âm thanh tốt nhất: ưu tiên M4A (hợp mọi trình duyệt), rồi bitrate cao nhất.
export function pickBestAudio(audioStreams) {
  const list = (Array.isArray(audioStreams) ? audioStreams : [])
    .filter((a) => a && typeof a.url === 'string');
  if (list.length === 0) return null;
  const sorted = [...list].sort((a, b) => {
    const am = a.format === 'M4A';
    const bm = b.format === 'M4A';
    if (am && !bm) return -1;
    if (bm && !am) return 1;
    return (b.bitrate || 0) - (a.bitrate || 0);
  });
  return sorted[0];
}

// ---------- Chặn proxy mở (SSRF) ----------

// Chỉ cho /api/proxy tải từ googlevideo, host chứa "pipedproxy", hoặc đúng tên miền của
// các instance Piped đang dùng. Ngăn kẻ xấu mượn domain của bạn để proxy nội dung bất kỳ.
export function buildProxyHostMatcher(env) {
  const apexes = getInstances(env)
    .map((base) => {
      try {
        const parts = new URL(base).hostname.toLowerCase().split('.');
        return parts.slice(-2).join('.');
      } catch {
        return '';
      }
    })
    .filter(Boolean);

  return (hostname) => {
    const h = String(hostname).toLowerCase();
    if (h === 'googlevideo.com' || h.endsWith('.googlevideo.com')) return true;
    if (h.includes('pipedproxy')) return true;
    return apexes.some((apex) => h === apex || h.endsWith('.' + apex));
  };
}

export { UA };
