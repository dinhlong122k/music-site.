// _piped.js - phần dùng chung cho các API /api/*: gọi nguồn nhạc (Piped + Invidious) và chuẩn hoá.
//
// Vì sao có file này: search/stream/playlist đều cần gọi nguồn ngoài và chuẩn hoá dữ liệu
// giống nhau. Tên giữ "_piped" cho khỏi đổi import, nhưng giờ hỗ trợ HAI hệ:
//   - Piped     (API /streams, /search, /playlists)
//   - Invidious (API /api/v1/videos, /api/v1/search, /api/v1/playlists)
// Instance công cộng hay sập hoặc chặn IP của Cloudflare, nên có hai nguồn độc lập giúp
// tăng khả năng còn ít nhất một server trả lời.
//
// Các hàm "chuẩn hoá" ở đây là hàm THUẦN (không gọi mạng) nên test được bằng `node --test`.

// Danh sách mặc định. Có thể ghi đè bằng biến môi trường (URL ngăn cách bằng dấu phẩy):
//   PIPED_INSTANCES, INVIDIOUS_INSTANCES — KHÔNG phải sửa code.
const DEFAULT_PIPED = [
  'https://pipedapi.kavin.rocks',
  'https://api.piped.private.coffee',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.reallyaweso.me',
  'https://api.piped.yt',
];

const DEFAULT_INVIDIOUS = [
  'https://yt.chocolatemoo53.com',
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yewtu.be',
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)';

// Thời gian chờ tối đa cho MỖI instance. Instance chết thường treo chứ không trả lỗi ngay.
const TIMEOUT_MS = 6000;

function parseList(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const list = raw.split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
  return list.length ? list : null;
}

// Danh sách instance Piped: ưu tiên biến môi trường, sau đó mới tới mặc định.
export function getInstances(env) {
  return parseList(env && env.PIPED_INSTANCES) || DEFAULT_PIPED;
}

// Danh sách instance Invidious: ưu tiên biến môi trường, sau đó mới tới mặc định.
export function getInvidiousInstances(env) {
  return parseList(env && env.INVIDIOUS_INSTANCES) || DEFAULT_INVIDIOUS;
}

// Mọi nguồn, dạng { type: 'piped' | 'invidious', base }.
export function getProviders(env) {
  return [
    ...getInstances(env).map((base) => ({ type: 'piped', base })),
    ...getInvidiousInstances(env).map((base) => ({ type: 'invidious', base })),
  ];
}

// Trả về Response JSON kèm Cache-Control: no-store (không lưu ở trình duyệt/proxy).
export function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// ---------- Gọi nguồn ngoài (có fallback nhiều instance) ----------

// Lỗi khi MỌI instance hỏng. `details` liệt kê lý do của từng instance để debug.
export class UpstreamError extends Error {
  constructor(details) {
    super('all_instances_failed');
    this.details = details;
  }
}

// Gọi một URL, trả JSON. Ném lỗi có thông điệp ngắn gọn (HTTP xxx / Timeout / ...).
async function fetchJson(url, signal) {
  const res = await fetch(url, {
    signal,
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new Error('JSON không hợp lệ');
  }
}

// Gọi SONG SONG mọi instance; instance nào trả dữ liệu dùng được trước thì thắng.
//
//   paths: { piped: '/streams/ID', invidious: '/api/v1/videos/ID' }
//   parse: { piped(data, base), invidious(data, base) } -> kết quả đã chuẩn hoá, hoặc null
//          nếu dữ liệu không dùng được (coi như instance đó hỏng).
//
// Trả { result, provider } để nơi gọi phân trang tiếp trên ĐÚNG instance đó.
// Ném UpstreamError (kèm details) nếu tất cả đều hỏng.
//
// Vì sao song song: gọi lần lượt thì mỗi instance chết tốn tới TIMEOUT_MS, 9 instance chết
// là gần một phút chờ. Song song thì chỉ chờ bằng instance sống nhanh nhất.
export async function upstreamTry(env, paths, parse) {
  const providers = getProviders(env).filter((p) => paths[p.type] && parse[p.type]);
  const controllers = providers.map(() => new AbortController());
  const details = new Array(providers.length);

  const attempts = providers.map(async (provider, i) => {
    const ctrl = controllers[i];
    const timer = setTimeout(() => ctrl.abort(new Error('Timeout')), TIMEOUT_MS);
    try {
      const data = await fetchJson(provider.base + paths[provider.type], ctrl.signal);
      const result = parse[provider.type](data, provider.base);
      if (result == null) throw new Error('Không có dữ liệu dùng được');
      return { result, provider, index: i };
    } catch (err) {
      const reason = ctrl.signal.aborted ? 'Timeout' : (err && err.message) || 'Lỗi không rõ';
      details[i] = `${provider.type} ${provider.base}: ${reason}`;
      throw err;
    } finally {
      clearTimeout(timer);
    }
  });

  try {
    const winner = await Promise.any(attempts);
    // Đã có kết quả: huỷ các request còn treo để không tốn subrequest/thời gian.
    controllers.forEach((c, i) => { if (i !== winner.index) c.abort(); });
    return { result: winner.result, provider: winner.provider };
  } catch {
    throw new UpstreamError(details.filter(Boolean));
  }
}

// Gọi tiếp trên một instance cụ thể (dùng khi phân trang playlist).
export async function fetchFrom(base, path) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetchJson(base + path, ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}

// Body JSON chung cho lỗi 502 (kèm details để xem bằng curl/DevTools).
export function upstreamFailed(err) {
  const details = err instanceof UpstreamError ? err.details : [String((err && err.message) || err)];
  return json({ error: 'upstream_failed', details }, 502);
}

// ---------- Chuẩn hoá dữ liệu -> bài hát ----------

// Tách videoId từ đường dẫn kiểu "/watch?v=ID" (hoặc URL có tham số v=...).
export function videoIdFromUrl(url) {
  if (typeof url !== 'string') return '';
  const i = url.indexOf('v=');
  if (i < 0) return '';
  return url.slice(i + 2).split('&')[0];
}

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

// Piped: chuẩn hoá danh sách "stream" (kết quả tìm kiếm và bài trong playlist).
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

// Invidious: chuẩn hoá danh sách video (kết quả /api/v1/search và videos của playlist).
// Mỗi item: { type: 'video', videoId, title, author, lengthSeconds, ... }.
export function mapInvidiousVideos(items) {
  const out = [];
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || typeof it !== 'object') continue;
    if (it.type && it.type !== 'video') continue; // bỏ channel/playlist trong kết quả tìm
    const videoId = typeof it.videoId === 'string' ? it.videoId : '';
    if (!ID_PATTERN.test(videoId)) continue;
    out.push({
      videoId,
      title: typeof it.title === 'string' ? it.title : '',
      uploader: typeof it.author === 'string' ? it.author : '',
      duration: Number.isFinite(it.lengthSeconds) ? it.lengthSeconds : 0,
    });
  }
  return out;
}

// Piped: chọn luồng âm thanh tốt nhất: ưu tiên M4A (hợp mọi trình duyệt), rồi bitrate cao nhất.
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

// Invidious: chọn định dạng âm thanh tốt nhất trong adaptiveFormats.
// Ưu tiên audio/mp4 (M4A), rồi bitrate cao nhất. Lưu ý Invidious trả bitrate/itag dạng CHUỖI.
export function pickBestInvidiousAudio(adaptiveFormats) {
  const list = (Array.isArray(adaptiveFormats) ? adaptiveFormats : []).filter(
    (f) => f && typeof f.type === 'string' && f.type.startsWith('audio/')
      && /^\d+$/.test(String(f.itag)),
  );
  if (list.length === 0) return null;
  const sorted = [...list].sort((a, b) => {
    const am = a.type.startsWith('audio/mp4');
    const bm = b.type.startsWith('audio/mp4');
    if (am && !bm) return -1;
    if (bm && !am) return 1;
    return (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0);
  });
  return sorted[0];
}

// URL tải audio QUA server Invidious (local=true). Không dùng thẳng link googlevideo của
// Invidious vì link đó bị khoá theo IP server Invidious => Worker tải sẽ 403.
export function invidiousAudioUrl(base, videoId, itag) {
  return `${base}/latest_version?id=${encodeURIComponent(videoId)}&itag=${encodeURIComponent(String(itag))}&local=true`;
}

// ---------- Chặn proxy mở (SSRF) ----------

// Chỉ cho /api/proxy tải từ googlevideo, host chứa "pipedproxy", hoặc đúng tên miền của
// các instance Piped/Invidious đang dùng. Ngăn kẻ xấu mượn domain của bạn để proxy nội dung bất kỳ.
export function buildProxyHostMatcher(env) {
  const apexes = getProviders(env)
    .map(({ base }) => {
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
