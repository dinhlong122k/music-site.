// player.js - bọc thẻ <audio> HTML5 để phần còn lại của app không cần biết chi tiết phát nhạc.
//
// Khác bản YouTube cũ (IFrame API): nguồn nhạc là một URL audio cùng domain (/api/proxy...).
// Thẻ <audio> luôn "sẵn sàng" ngay (là phần tử DOM), nên không còn màn chờ khởi động trình phát.
import { isValidId } from './validate.js';

// Tạo trình phát quanh phần tử <audio> có sẵn.
// callbacks: {
//   resolveStreamUrl(videoId) -> Promise<string>  (lấy URL audio; ném lỗi nếu không được)
//   onEnded(), onError(code, wasRequested), onPlaying()
// }
export function createPlayer(audioEl, callbacks) {
  // Mỗi lần play tăng token; kết quả tải cũ (đến muộn) bị bỏ để không "nhảy" bài.
  let token = 0;
  // loaded = đã gán nguồn cho một bài; để lỗi lúc chưa có nguồn không bị hiểu nhầm là bài lỗi.
  let loaded = false;

  audioEl.addEventListener('ended', () => callbacks.onEnded());
  audioEl.addEventListener('playing', () => callbacks.onPlaying());
  audioEl.addEventListener('error', () => {
    if (loaded && audioEl.error) callbacks.onError('audio', true);
  });

  function hasSource() {
    return loaded && Boolean(audioEl.getAttribute('src'));
  }

  async function play(videoId) {
    // isValidId là lớp phòng thủ cuối trước khi đưa id ra ngoài.
    if (!isValidId(videoId)) return;
    const my = ++token;
    let src;
    try {
      src = await callbacks.resolveStreamUrl(videoId);
    } catch {
      if (my === token) callbacks.onError('stream', true);
      return;
    }
    if (my !== token) return; // đã có lệnh phát mới hơn
    loaded = true;
    audioEl.src = src;
    audioEl.load();
    // Trình duyệt có thể chặn tự phát; khi đó người dùng bấm Phát là chạy, không coi là lỗi.
    audioEl.play().catch(() => {});
  }

  return {
    play,
    hasSource,
    // Phát <-> dừng. Trả false nếu chưa có nguồn (app sẽ tự nạp bài hiện tại).
    togglePause() {
      if (!hasSource()) return false;
      if (audioEl.paused) audioEl.play().catch(() => {});
      else audioEl.pause();
      return true;
    },
    pause() {
      audioEl.pause();
    },
    stop() {
      token += 1; // huỷ mọi lần tải đang chờ
      loaded = false;
      audioEl.pause();
      audioEl.removeAttribute('src');
      audioEl.load();
    },
  };
}
