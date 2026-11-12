// piped-api.js - gọi các API nội bộ /api/* (cùng domain) và đổi lỗi thành thông báo tiếng Việt.
//
// Khác bản YouTube cũ: trình duyệt KHÔNG gọi thẳng Google/Piped nữa, mà gọi
// /api/search, /api/playlist, /api/stream do Cloudflare Pages Functions phục vụ.
// Nhờ vậy mọi kết nối chỉ tới *.pages.dev => vượt tường lửa (FortiGate), không bị 403.
//
// Phần "đổi lỗi" và "chuẩn hoá" là hàm thuần, test được bằng `node --test`.
import { makeTrack } from './validate.js';

// Lỗi mang sẵn thông báo tiếng Việt để UI hiển thị thẳng.
export class ApiError extends Error {}

export const MAX_PLAYLIST_TRACKS = 500;

export const NETWORK_ERROR_MESSAGE =
  'Không kết nối được máy chủ (mạng có thể đang mất kết nối).';

// ---------- Đổi mã HTTP -> thông báo tiếng Việt ----------

export function mapHttpError(status) {
  if (status === 502) return 'Máy chủ nhạc đang bận hoặc không phản hồi. Hãy thử lại sau ít phút.';
  if (status === 404) return 'Không tìm thấy (playlist/bài có thể không tồn tại hoặc ở chế độ riêng tư).';
  if (status === 400) return 'Yêu cầu không hợp lệ.';
  return `Máy chủ trả lỗi (mã ${status}). Hãy thử lại sau.`;
}

// ---------- Gọi mạng ----------

// Gọi một endpoint nội bộ. Ném ApiError (thông báo tiếng Việt) khi lỗi.
async function getJson(path) {
  let response;
  try {
    response = await fetch(path);
  } catch {
    throw new ApiError(NETWORK_ERROR_MESSAGE);
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) throw new ApiError(mapHttpError(response.status));
  if (!body || typeof body !== 'object') throw new ApiError('Máy chủ trả dữ liệu không đọc được.');
  return body;
}

// ---------- Chuẩn hoá -> bài hát ----------

// Ảnh bìa: KHÔNG dùng (để trống). Lý do: ảnh đến từ host ngoài (i.ytimg.com...) sẽ bị
// tường lửa chặn và phá vỡ CSP "chỉ cùng domain". Giao diện tự hiện ô trống thay ảnh.
function normalize(items) {
  const tracks = [];
  for (const it of Array.isArray(items) ? items : []) {
    const track = makeTrack({
      videoId: it && it.videoId,
      title: it && it.title,
      channel: it && it.uploader,
      thumbnail: '',
    });
    if (track) tracks.push(track);
  }
  return tracks;
}

export async function searchTracks(query) {
  const body = await getJson(`/api/search?q=${encodeURIComponent(query)}`);
  return normalize(body.items);
}

// Trả { tracks, truncated } cho đồng bộ với chỗ gọi.
export async function fetchPlaylistTracks(playlistId) {
  const body = await getJson(`/api/playlist?id=${encodeURIComponent(playlistId)}`);
  return { tracks: normalize(body.items), truncated: Boolean(body.truncated) };
}

// Trả về đường dẫn audio (đã bọc qua /api/proxy, cùng domain). Ném ApiError nếu không có.
export async function fetchStreamUrl(videoId) {
  const body = await getJson(`/api/stream?id=${encodeURIComponent(videoId)}`);
  // Phòng thủ: chỉ nhận link cùng domain (/api/proxy...), không để nhạc tải từ host ngoài.
  if (typeof body.audioUrl !== 'string' || !body.audioUrl.startsWith('/api/proxy')) {
    throw new ApiError('Không lấy được luồng nhạc cho bài này.');
  }
  return body.audioUrl;
}
