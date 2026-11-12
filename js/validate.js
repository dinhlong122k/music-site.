// validate.js - các hàm kiểm tra dữ liệu "không tin được" (từ API, từ người dùng, từ localStorage).
//
// Vì sao có file này: mọi dữ liệu đi vào trang đều phải qua cửa kiểm tra trước,
// để tên bài lạ, ID lạ hay URL ảnh lạ không thể gây hại (XSS, tải ảnh từ nơi khác...).
// File này KHÔNG đụng DOM nên test được bằng `node --test`.

// ID video/playlist của YouTube chỉ gồm chữ, số, gạch dưới, gạch ngang.
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

// Chỉ nhận ảnh đến từ máy chủ ảnh của YouTube (khớp với CSP img-src).
const THUMBNAIL_PREFIX = 'https://i.ytimg.com/';

// Chữ thay thế khi API không trả tên bài.
const DEFAULT_TITLE = '(Không có tên)';

export function isValidId(value) {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

export function isSafeThumbnailUrl(url) {
  return typeof url === 'string' && url.startsWith(THUMBNAIL_PREFIX);
}

// Cắt chuỗi về dạng an toàn: nếu không phải chuỗi thì trả về chuỗi rỗng.
function toText(value) {
  return typeof value === 'string' ? value : '';
}

// Tạo một bài hát chuẩn { videoId, title, channel, thumbnail }.
// Trả null nếu videoId không hợp lệ -> nơi gọi sẽ bỏ bài đó.
export function makeTrack(raw) {
  if (!raw || !isValidId(raw.videoId)) return null;
  return {
    videoId: raw.videoId,
    title: toText(raw.title) || DEFAULT_TITLE,
    channel: toText(raw.channel),
    // Ảnh lạ thì bỏ (để rỗng), bài vẫn dùng được.
    thumbnail: isSafeThumbnailUrl(raw.thumbnail) ? raw.thumbnail : '',
  };
}
