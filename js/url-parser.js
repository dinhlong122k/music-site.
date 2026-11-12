// url-parser.js - tách playlistId từ link YouTube mà người dùng dán.
//
// Vì sao: người dùng có thể dán nhiều dạng link khác nhau. Ta chỉ cần tham số `list=`.
// Link sai thì trả null để nơi gọi báo lỗi mà KHÔNG gọi API (đỡ tốn hạn mức).
// File này không đụng DOM nên test được bằng `node --test`.
import { isValidId } from './validate.js';

// Chỉ nhận các tên miền YouTube này (tránh nhận link của trang lạ).
const ALLOWED_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
]);

// Người dùng hay dán thiếu "https://": ta tự thêm để `new URL` đọc được.
function toUrl(text) {
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    return new URL(withScheme);
  } catch {
    return null;
  }
}

// Trả về playlistId hợp lệ, hoặc null nếu không tách được.
export function extractPlaylistId(input) {
  if (typeof input !== 'string') return null;
  const text = input.trim();
  if (!text) return null;

  // Dạng ID trần (không có dấu chấm/gạch chéo/khoảng trắng...).
  if (isValidId(text)) return text;

  const url = toUrl(text);
  if (!url || !ALLOWED_HOSTS.has(url.hostname.toLowerCase())) return null;

  const listId = url.searchParams.get('list');
  return isValidId(listId) ? listId : null;
}
