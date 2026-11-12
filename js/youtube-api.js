// youtube-api.js - gọi YouTube Data API v3 và đổi lỗi API thành thông báo tiếng Việt.
//
// Vì sao: key do người dùng dán và CHỈ được gửi tới https://www.googleapis.com.
// Các hàm "chuẩn hoá" và "đổi lỗi" ở đây là hàm thuần (không DOM) nên test được.
import { makeTrack } from './validate.js';

const API_BASE = 'https://www.googleapis.com/youtube/v3';
const PAGE_SIZE = 50;
export const MAX_PLAYLIST_TRACKS = 500; // Giới hạn do người xây chọn (thiết kế mục 5.2)
// Chặn vòng lặp phân trang: playlist toàn bài hỏng sẽ không bao giờ đủ 500 bài, nên cần giới hạn số trang.
export const MAX_PLAYLIST_PAGES = 20;
const SEARCH_RESULTS = 10;

// Lỗi mang sẵn thông báo tiếng Việt để UI hiển thị thẳng.
export class ApiError extends Error {}

// ---------- Đổi lỗi -> thông báo tiếng Việt ----------

export const NETWORK_ERROR_MESSAGE =
  'Không truy cập được YouTube từ mạng hiện tại (mạng có thể đang chặn YouTube hoặc bạn mất kết nối).';

const RATE_LIMIT_MESSAGE = 'Thao tác quá nhanh, hãy thử lại sau ít giây.';

// Lấy "lý do" lỗi mà API trả về, ở một trong các chỗ có thể có.
function collectReasons(body) {
  const error = body && typeof body === 'object' ? body.error : null;
  if (!error) return [];
  const reasons = [];
  for (const entry of Array.isArray(error.errors) ? error.errors : []) reasons.push(entry?.reason);
  for (const entry of Array.isArray(error.details) ? error.details : []) reasons.push(entry?.reason);
  reasons.push(error.status);
  return reasons.filter((r) => typeof r === 'string');
}

export function mapApiError(httpStatus, body) {
  const reasons = collectReasons(body);
  const has = (...names) => names.some((n) => reasons.includes(n));

  // Chạm giới hạn tốc độ (tạm thời) khác với hết hạn mức ngày: người dùng chỉ cần chờ vài giây.
  if (has('rateLimitExceeded', 'userRateLimitExceeded')) return RATE_LIMIT_MESSAGE;
  if (has('quotaExceeded', 'dailyLimitExceeded')) {
    return 'Đã hết hạn mức YouTube API trong ngày. Hãy thử lại vào ngày mai.';
  }
  if (has('ipRefererBlocked', 'API_KEY_HTTP_REFERRER_BLOCKED')) {
    return 'Key bị chặn theo referrer: trang này chưa nằm trong danh sách được phép. Hãy kiểm tra "Giới hạn ứng dụng" của key.';
  }
  if (has('keyInvalid', 'API_KEY_INVALID')) {
    return 'Key không đúng. Hãy kiểm tra lại key rồi bấm "Đổi / Xoá key" để nhập lại.';
  }
  if (has('accessNotConfigured', 'SERVICE_DISABLED', 'API_KEY_SERVICE_BLOCKED')) {
    return 'Key chưa được phép dùng YouTube Data API v3. Hãy bật API này trong Google Cloud Console và kiểm tra "Giới hạn API" của key.';
  }
  if (has('playlistNotFound') || httpStatus === 404) {
    return 'Không tìm thấy playlist này (có thể không tồn tại hoặc ở chế độ riêng tư).';
  }
  if (has('playlistItemsNotAccessible', 'forbidden') || httpStatus === 403) {
    return 'Không có quyền truy cập. Hãy kiểm tra key và playlist (playlist riêng tư không đọc được).';
  }
  if (httpStatus === 400) {
    return 'Yêu cầu không hợp lệ hoặc key có vấn đề. Hãy kiểm tra lại key.';
  }
  return `YouTube trả về lỗi (mã ${httpStatus}). Hãy thử lại sau.`;
}

// ---------- Chuẩn hoá dữ liệu API -> bài hát ----------

function pickThumbnail(snippet) {
  const thumbs = snippet?.thumbnails;
  return thumbs?.default?.url ?? thumbs?.medium?.url ?? '';
}

// Bài đã xoá/riêng tư: API vẫn trả mục đó nhưng tên là "Deleted video"/"Private video".
function isUnavailableItem(item) {
  const title = item?.snippet?.title;
  const privacy = item?.status?.privacyStatus;
  return privacy === 'private' || title === 'Deleted video' || title === 'Private video';
}

export function playlistItemsToTracks(items) {
  const tracks = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (isUnavailableItem(item)) continue;
    const snippet = item.snippet;
    const track = makeTrack({
      videoId: snippet?.resourceId?.videoId,
      title: snippet?.title,
      channel: snippet?.videoOwnerChannelTitle ?? snippet?.channelTitle,
      thumbnail: pickThumbnail(snippet),
    });
    if (track) tracks.push(track);
  }
  return tracks;
}

export function searchItemsToTracks(items) {
  const tracks = [];
  for (const item of Array.isArray(items) ? items : []) {
    const track = makeTrack({
      videoId: item?.id?.videoId,
      title: item?.snippet?.title,
      channel: item?.snippet?.channelTitle,
      thumbnail: pickThumbnail(item?.snippet),
    });
    if (track) tracks.push(track);
  }
  return tracks;
}

// ---------- Gọi mạng ----------

// Gọi một endpoint. Ném ApiError (thông báo tiếng Việt) khi lỗi.
// Không bao giờ log URL hay key ra console.
async function callApi(endpoint, params, apiKey) {
  // Key gửi qua header (không nằm trong URL) để không lọt vào lịch sử, log proxy hay header Referer.
  const query = new URLSearchParams(params);
  let response;
  try {
    response = await fetch(`${API_BASE}/${endpoint}?${query.toString()}`, {
      headers: { 'X-Goog-Api-Key': apiKey },
    });
  } catch {
    throw new ApiError(NETWORK_ERROR_MESSAGE);
  }

  let body = null;
  let isJson = true;
  try {
    body = await response.json();
  } catch {
    isJson = false;
  }
  // Lỗi mà không phải JSON thường là trang chặn của tường lửa/proxy công ty, không phải của YouTube.
  if (!response.ok) throw new ApiError(isJson ? mapApiError(response.status, body) : NETWORK_ERROR_MESSAGE);
  if (!body || typeof body !== 'object') throw new ApiError('YouTube trả về dữ liệu không đọc được.');
  return body;
}

// Tải playlist (tối đa MAX_PLAYLIST_TRACKS bài hoặc MAX_PLAYLIST_PAGES trang, 50 bài/trang).
// Trả { tracks, truncated } - truncated = true nếu playlist còn nhiều hơn mức giới hạn.
export async function fetchPlaylistTracks(playlistId, apiKey) {
  const tracks = [];
  let pageToken = '';
  let truncated = false;

  for (let pageNumber = 1; pageNumber <= MAX_PLAYLIST_PAGES; pageNumber += 1) {
    const params = { part: 'snippet,status', maxResults: String(PAGE_SIZE), playlistId };
    if (pageToken) params.pageToken = pageToken;
    const page = await callApi('playlistItems', params, apiKey);

    tracks.push(...playlistItemsToTracks(page.items));
    pageToken = typeof page.nextPageToken === 'string' ? page.nextPageToken : '';

    if (tracks.length >= MAX_PLAYLIST_TRACKS) {
      truncated = Boolean(pageToken) || tracks.length > MAX_PLAYLIST_TRACKS;
      break;
    }
    if (!pageToken) break;
    // Hết số trang cho phép mà playlist vẫn còn trang nữa.
    if (pageNumber === MAX_PLAYLIST_PAGES) truncated = true;
  }

  return { tracks: tracks.slice(0, MAX_PLAYLIST_TRACKS), truncated };
}

// Tìm video theo từ khoá (tốn 100 đơn vị hạn mức mỗi lần).
export async function searchTracks(query, apiKey) {
  const params = {
    part: 'snippet',
    type: 'video',
    videoEmbeddable: 'true',
    maxResults: String(SEARCH_RESULTS),
    q: query,
  };
  const body = await callApi('search', params, apiKey);
  return searchItemsToTracks(body.items);
}
