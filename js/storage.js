// storage.js - đọc/ghi localStorage an toàn.
//
// Vì sao bọc try/catch: một số trình duyệt/chế độ riêng tư chặn localStorage.
// Khi đó trang vẫn phải chạy, chỉ là không nhớ được gì.
import { makeTrack } from './validate.js';
import { REPEAT_MODES } from './queue.js';

const KEY_QUEUE = 'musicsite.queue';
const KEY_REPEAT = 'musicsite.repeat';

function readRaw(name) {
  try {
    return localStorage.getItem(name);
  } catch {
    return null;
  }
}

function writeRaw(name, value) {
  try {
    localStorage.setItem(name, value);
  } catch {
    // Không lưu được (bị chặn/đầy bộ nhớ) thì chấp nhận: nghe nhạc vẫn chạy, chỉ là lần sau không nhớ.
  }
}

// ---------- Danh sách đang phát ----------

export function saveQueue(state) {
  writeRaw(KEY_QUEUE, JSON.stringify({ items: state.items, currentIndex: state.currentIndex }));
}

// Dữ liệu trong localStorage có thể bị sửa tay -> kiểm tra lại từng bài bằng makeTrack.
export function loadQueue() {
  const empty = { items: [], currentIndex: -1 };
  const raw = readRaw(KEY_QUEUE);
  if (!raw) return empty;
  try {
    const data = JSON.parse(raw);
    const rawItems = Array.isArray(data?.items) ? data.items : [];
    // Bỏ bài hỏng thì vị trí các bài sau bị dồn lên; vì vậy tính lại chỉ số theo vị trí SAU khi lọc,
    // nếu không bài đang chọn sẽ lệch sang bài khác.
    const items = [];
    let currentIndex = -1;
    rawItems.forEach((raw, rawIndex) => {
      const track = makeTrack(raw);
      if (!track) return;
      if (rawIndex === data.currentIndex) currentIndex = items.length;
      items.push(track);
    });
    return { items, currentIndex };
  } catch {
    return empty;
  }
}

// ---------- Chế độ lặp ----------

export function saveRepeat(mode) {
  writeRaw(KEY_REPEAT, mode);
}

export function loadRepeat() {
  const mode = readRaw(KEY_REPEAT);
  return REPEAT_MODES.includes(mode) ? mode : 'off';
}
