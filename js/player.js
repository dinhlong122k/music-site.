// player.js - bọc YouTube IFrame Player API.
//
// Vì sao bọc: phần còn lại của app không cần biết chi tiết của API YouTube.
// Ta phát từng video theo videoId (không dùng chế độ playlist của YouTube)
// để thứ tự do site điều khiển.
import { isValidId } from './validate.js';

const IFRAME_API_URL = 'https://www.youtube.com/iframe_api';

// Mã trạng thái của YouTube (YT.PlayerState).
const STATE_ENDED = 0;
const STATE_PLAYING = 1;
const STATE_BUFFERING = 3; // đang đệm: người dùng coi như "đang phát"

let apiPromise = null;

// Nạp script IFrame API đúng một lần. Script này gọi window.onYouTubeIframeAPIReady khi sẵn sàng.
function loadIframeApi() {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player) {
      resolve(window.YT);
      return;
    }
    window.onYouTubeIframeAPIReady = () => resolve(window.YT);
    const script = document.createElement('script');
    script.src = IFRAME_API_URL;
    script.onerror = () => {
      apiPromise = null; // cho phép thử lại lần sau
      reject(new Error('Không tải được trình phát YouTube.'));
    };
    document.head.appendChild(script);
  });
  return apiPromise;
}

// Tạo trình phát trong phần tử có id `containerId`.
// callbacks: { onEnded(), onError(code, wasRequested), onPlaying() }
// wasRequested = true nếu video lỗi là video mà app đã yêu cầu PHÁT (play); false nếu chỉ mới hiện sẵn (cue).
// Trả về các hàm điều khiển. Ném lỗi nếu không tải được API (ví dụ mạng chặn YouTube).
export async function createPlayer(containerId, callbacks) {
  const YT = await loadIframeApi();

  // Video gần nhất do app yêu cầu là "phát" hay chỉ "hiện sẵn". Lỗi khi hiện sẵn không được kéo theo tự động chuyển bài.
  let lastActionWasPlay = false;

  const player = await new Promise((resolve) => {
    const instance = new YT.Player(containerId, {
      width: '100%',
      height: '100%',
      playerVars: { playsinline: 1, rel: 0, origin: window.location.origin },
      events: {
        onReady: () => resolve(instance),
        onStateChange: (event) => {
          if (event.data === STATE_ENDED) callbacks.onEnded();
          if (event.data === STATE_PLAYING) callbacks.onPlaying();
        },
        onError: (event) => callbacks.onError(event.data, lastActionWasPlay),
      },
    });
  });

  return {
    // Phát ngay một video.
    // isValidId ở đây là lớp phòng thủ cuối: videoId đã được kiểm tra khi vào danh sách,
    // nhưng đây là nơi duy nhất đưa chuỗi vào API của YouTube nên kiểm tra thêm cho chắc.
    play(videoId) {
      if (!isValidId(videoId)) return;
      lastActionWasPlay = true;
      player.loadVideoById(videoId);
    },
    // Chỉ hiện sẵn video, không phát (dùng khi tải lại trang vì trình duyệt chặn tự phát).
    cue(videoId) {
      if (!isValidId(videoId)) return;
      lastActionWasPlay = false;
      player.cueVideoById(videoId);
    },
    // Phát <-> dừng.
    togglePause() {
      const state = player.getPlayerState();
      if (state === STATE_PLAYING || state === STATE_BUFFERING) player.pauseVideo();
      else player.playVideo();
    },
    // Tạm dừng, giữ nguyên vị trí (dùng khi ẩn trình phát).
    pause() {
      player.pauseVideo();
    },
    stop() {
      player.stopVideo();
    },
  };
}
