// queue.js - logic danh sách đang phát (thuần, KHÔNG đụng DOM).
//
// Vì sao tách riêng: để test được bằng `node --test` và để dễ đọc.
// Quy ước: mọi hàm KHÔNG sửa state cũ, mà trả về state mới (dễ hiểu, ít lỗi).
//
// state = { items: [track...], currentIndex: số (-1 = chưa chọn bài), repeat: 'off' | 'all' | 'one' }

export const REPEAT_MODES = ['off', 'all', 'one'];

export function createQueue({ items = [], currentIndex = -1, repeat = 'off' } = {}) {
  return {
    items: [...items],
    currentIndex,
    repeat: REPEAT_MODES.includes(repeat) ? repeat : 'off',
  };
}

function isIndexInRange(state, index) {
  return Number.isInteger(index) && index >= 0 && index < state.items.length;
}

// Thêm bài vào cuối. Không đổi bài đang phát.
export function addTrack(state, track) {
  return { ...state, items: [...state.items, track] };
}

// Thay cả danh sách (khi tải playlist mới). Chọn bài đầu tiên.
export function replaceItems(state, items) {
  return { ...state, items: [...items], currentIndex: items.length > 0 ? 0 : -1 };
}

// Chọn bài theo chỉ số. Chỉ số sai thì giữ nguyên.
export function setCurrent(state, index) {
  return isIndexInRange(state, index) ? { ...state, currentIndex: index } : state;
}

// Xoá bài ở vị trí index.
// Trả { state, shouldPlay }: shouldPlay = true nghĩa là bài đang phát bị xoá và có bài kế để phát ngay.
export function removeAt(state, index) {
  if (!isIndexInRange(state, index)) return { state, shouldPlay: false };

  const items = state.items.filter((_, i) => i !== index);

  // Xoá bài khác bài đang phát: chỉ cần chỉnh lại chỉ số nếu bài bị xoá nằm trước nó.
  if (index !== state.currentIndex) {
    const currentIndex = index < state.currentIndex ? state.currentIndex - 1 : state.currentIndex;
    return { state: { ...state, items, currentIndex }, shouldPlay: false };
  }

  // Xoá đúng bài đang phát: bài kế đã "trượt" vào cùng vị trí đó.
  if (index < items.length) {
    return { state: { ...state, items, currentIndex: index }, shouldPlay: true };
  }
  // Đang ở cuối danh sách: lặp cả danh sách thì về đầu, ngược lại thì dừng (-1).
  if (items.length > 0 && state.repeat === 'all') {
    return { state: { ...state, items, currentIndex: 0 }, shouldPlay: true };
  }
  return { state: { ...state, items, currentIndex: -1 }, shouldPlay: false };
}

// Chỉ số bài kế tiếp, hoặc null nếu phải dừng.
// auto = true: bài tự hết (lặp một bài thì phát lại chính nó).
// auto = false: người dùng bấm "sau" hoặc bài bị lỗi (luôn đi tiếp).
export function getNextIndex(state, { auto }) {
  const { items, currentIndex, repeat } = state;
  if (items.length === 0 || !isIndexInRange(state, currentIndex)) return null;

  if (auto && repeat === 'one') return currentIndex;
  if (currentIndex + 1 < items.length) return currentIndex + 1;
  return repeat === 'all' ? 0 : null;
}

// Chỉ số bài trước, hoặc null nếu đang ở đầu và không lặp cả danh sách.
export function getPrevIndex(state) {
  const { items, currentIndex, repeat } = state;
  if (items.length === 0 || !isIndexInRange(state, currentIndex)) return null;

  if (currentIndex > 0) return currentIndex - 1;
  return repeat === 'all' ? items.length - 1 : null;
}

// Fisher-Yates: trộn mảng mới, không sửa mảng cũ. `random` truyền vào để test được.
function shuffleArray(array, random) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Trộn một lần. Bài đang phát được đưa lên đầu để tiếp tục phát không bị gián đoạn.
export function shuffleQueue(state, random = Math.random) {
  if (!isIndexInRange(state, state.currentIndex)) {
    return { ...state, items: shuffleArray(state.items, random) };
  }
  const current = state.items[state.currentIndex];
  const others = state.items.filter((_, i) => i !== state.currentIndex);
  return { ...state, items: [current, ...shuffleArray(others, random)], currentIndex: 0 };
}

// Xoay vòng chế độ lặp: tắt -> cả danh sách -> một bài -> tắt.
// Lấy vòng xoay từ REPEAT_MODES để thêm/bớt chế độ chỉ phải sửa một chỗ. Chế độ lạ -> về 'off'.
export function nextRepeatMode(mode) {
  const position = REPEAT_MODES.indexOf(mode);
  return REPEAT_MODES[(position + 1) % REPEAT_MODES.length];
}

// Sau khi một bài (do app yêu cầu phát) bị lỗi: tiếp tục sang bài kế hay dừng?
// consecutiveErrors đã tính cả lần lỗi này.
// Trả { action: 'skip', next } hoặc { action: 'stop', reason: 'end' | 'all-failed' }.
// Kiểm tra "còn bài kế không" trước, để hết danh sách thì báo đúng lý do "hết danh sách".
export function decideAfterError(state, consecutiveErrors) {
  const next = getNextIndex(state, { auto: false });
  if (next === null) return { action: 'stop', reason: 'end' };
  // Đã lỗi liên tiếp bằng số bài: nếu đang lặp cả danh sách thì sẽ quay mãi, phải dừng.
  if (consecutiveErrors >= state.items.length) return { action: 'stop', reason: 'all-failed' };
  return { action: 'skip', next };
}
