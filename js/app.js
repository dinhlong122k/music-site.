// app.js - khởi động và nối các phần với nhau.
//
// Chỉ file này biết "khi người dùng làm X thì gọi phần nào". Logic danh sách nằm ở queue.js,
// gọi mạng ở youtube-api.js, giao diện ở ui.js, trình phát ở player.js.
import * as storage from './storage.js';
import * as queue from './queue.js';
import * as api from './youtube-api.js';
import * as ui from './ui.js';
import { createPlayer } from './player.js';
import { extractPlaylistId } from './url-parser.js';

let apiKey = '';
let state = queue.createQueue();
let player = null; // chỉ có sau khi tải xong IFrame API
let playerPromise = null; // MỘT lần khởi tạo trình phát, dùng chung cho mọi nơi cần chờ
let playWhenReady = false; // đã có yêu cầu "phát khi trình phát sẵn sàng" đang chờ
let consecutiveErrors = 0; // số bài lỗi liên tiếp, để không lặp vô hạn

// Chờ tối đa bao lâu cho trình phát khởi động, để không treo mãi khi mạng chặn lửng lơ.
const PLAYER_START_TIMEOUT_MS = 15000;
const PLAYER_NOT_READY_MESSAGE = 'Trình phát YouTube chưa sẵn sàng, đang thử khởi động lại. Nhạc sẽ phát khi xong.';

// ---------- Vẽ lại & lưu ----------

function queueHandlers() {
  return { onSelect: playByUser, onRemove: removeTrack };
}

// Mỗi khi danh sách đổi: lưu lại và vẽ lại.
function commit(newState) {
  // Cùng một mảng bài = chỉ đổi bài hiện tại/chế độ lặp: không dựng lại danh sách (giữ focus và vị trí cuộn).
  const onlyCurrentChanged = newState.items === state.items;
  state = newState;
  storage.saveQueue(state);
  storage.saveRepeat(state.repeat);
  if (onlyCurrentChanged) ui.markCurrent(state.currentIndex);
  else ui.renderQueue(state, queueHandlers());
  ui.renderRepeat(state.repeat);
}

// ---------- Phát nhạc ----------

// Chọn bài và phát. Trả true nếu đã ra lệnh phát cho trình phát, false nếu chưa phát được
// (không có bài ở vị trí đó, hoặc trình phát chưa sẵn sàng - lúc này đã có thông báo và sẽ tự phát khi xong).
function playIndex(index) {
  commit(queue.setCurrent(state, index));
  const track = state.items[state.currentIndex];
  if (!track) return false;
  if (!player) {
    notifyPlayerNotReady();
    return false;
  }
  player.play(track.videoId);
  return true;
}

// Người dùng chủ động chọn phát: bắt đầu đếm lỗi liên tiếp lại từ 0.
// (Tự chuyển bài khi hết bài/khi lỗi thì gọi playIndex trực tiếp, KHÔNG reset.)
function playByUser(index) {
  consecutiveErrors = 0;
  return playIndex(index);
}

// Bài tự hết -> theo chế độ lặp.
function onTrackEnded() {
  const next = queue.getNextIndex(state, { auto: true });
  if (next === null) return;
  playIndex(next);
}

// Video lỗi. wasRequested = app đã yêu cầu phát bài này (false: chỉ mới hiện sẵn khi tải lại trang).
function onPlayerError(code, wasRequested) {
  // Bài đã nhớ lỗi khi vừa mở trang: chỉ báo, không tự chuyển/phát bài khác (người dùng chưa bấm gì).
  if (!wasRequested) {
    ui.setStatus(`Bài đã nhớ không phát được (mã lỗi ${code}). Hãy chọn bài khác.`, 'error');
    return;
  }
  consecutiveErrors += 1;
  const decision = queue.decideAfterError(state, consecutiveErrors);
  if (decision.action === 'stop') {
    const message = decision.reason === 'end'
      ? 'Hết danh sách, đã dừng.'
      : 'Mọi bài trong danh sách đều không phát được, đã dừng.';
    ui.setStatus(message, 'error');
    player?.stop();
    return;
  }
  const track = state.items[state.currentIndex];
  const name = track ? `"${track.title}"` : 'Bài này';
  ui.setStatus(`${name} không phát được (mã lỗi ${code}), chuyển sang bài kế.`, 'error');
  playIndex(decision.next);
}

function onPlayerPlaying() {
  consecutiveErrors = 0;
}

// ---------- Khởi động trình phát ----------

// Tạo trình phát đúng một lần và dùng chung kết quả. Thất bại thì xoá để lần sau thử lại.
function getPlayerPromise() {
  if (!playerPromise) {
    playerPromise = createPlayer('player', {
      onEnded: onTrackEnded,
      onError: onPlayerError,
      onPlaying: onPlayerPlaying,
    })
      .then((created) => {
        player = created;
        // Hiện sẵn bài đã nhớ (không tự phát vì trình duyệt chặn).
        const current = state.items[state.currentIndex];
        if (current) player.cue(current.videoId);
        return player;
      })
      .catch((error) => {
        playerPromise = null;
        throw error;
      });
  }
  return playerPromise;
}

// Chờ trình phát sẵn sàng nhưng không quá PLAYER_START_TIMEOUT_MS.
// Hết giờ thì lần khởi tạo vẫn chạy tiếp nền; lần bấm sau sẽ chờ tiếp chính lần đó.
function waitForPlayer() {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Trình phát YouTube khởi động quá lâu.')), PLAYER_START_TIMEOUT_MS);
  });
  return Promise.race([getPlayerPromise(), timeout]).finally(() => clearTimeout(timer));
}

function showPlayerStartError(error) {
  ui.setStatus(`${error.message} Mạng có thể đang chặn YouTube, hãy bấm phát để thử lại.`, 'error');
}

function startPlayer() {
  waitForPlayer().catch(showPlayerStartError);
}

// Sau khi trình phát sẵn sàng thì phát bài hiện tại (bài người dùng chọn gần nhất).
function playCurrentWhenReady() {
  const track = state.items[state.currentIndex];
  // Đã đổi/xoá key trong lúc chờ (trình phát đang bị ẩn) thì không phát.
  if (!track || !apiKey) return;
  player.play(track.videoId);
  ui.setStatus('');
}

// Người dùng muốn phát mà trình phát chưa có: báo, thử khởi động lại và phát khi xong.
function notifyPlayerNotReady() {
  ui.setStatus(PLAYER_NOT_READY_MESSAGE, 'error');
  if (playWhenReady) return; // đã có yêu cầu đang chờ, không chồng thêm
  playWhenReady = true;
  waitForPlayer()
    .then(playCurrentWhenReady, showPlayerStartError)
    .finally(() => { playWhenReady = false; });
}

// ---------- Xoá bài ----------

function removeTrack(index) {
  const removedCurrent = index === state.currentIndex;
  const result = queue.removeAt(state, index);
  commit(result.state);
  if (result.shouldPlay) playByUser(result.state.currentIndex);
  // Xoá đúng bài đang phát mà không còn bài kế -> dừng trình phát.
  else if (removedCurrent) player?.stop();
}

// ---------- Hiển thị lỗi API ----------

function showApiError(error) {
  const message = error instanceof api.ApiError ? error.message : 'Có lỗi không mong đợi, hãy thử lại.';
  ui.setStatus(message, 'error');
}

// ---------- Hành động của người dùng ----------

function enterMainScreen() {
  ui.showMainScreen();
  ui.renderQueue(state, queueHandlers());
  ui.renderRepeat(state.repeat);
  startPlayer();
}

function onSaveKey(rawKey) {
  const key = rawKey.trim();
  if (!key) {
    ui.setKeyError('Hãy dán key vào ô trên.');
    return;
  }
  storage.saveApiKey(key);
  apiKey = key;
  ui.setKeyError('');
  ui.clearKeyInput();
  ui.setStatus('');
  enterMainScreen();
}

// Xoá key; danh sách đang phát giữ nguyên (thiết kế mục 5.1).
function onResetKey() {
  // Trình phát bị ẩn cùng màn hình chính: phải dừng nhạc trước, kẻo nhạc vẫn phát mà không điều khiển được.
  player?.pause();
  storage.clearApiKey();
  apiKey = '';
  ui.showKeyScreen();
}

async function onLoadPlaylist(text) {
  const playlistId = extractPlaylistId(text);
  if (!playlistId) {
    ui.setStatus('Link playlist không hợp lệ. Hãy dán link có dạng youtube.com/playlist?list=...', 'error');
    return;
  }
  ui.setPlaylistBusy(true);
  ui.setStatus('Đang tải playlist...');
  try {
    const { tracks, truncated } = await api.fetchPlaylistTracks(playlistId, apiKey);
    if (tracks.length === 0) {
      ui.setStatus('Playlist này không có bài nào phát được.', 'error');
      return;
    }
    commit(queue.replaceItems(state, tracks));
    // Chỉ báo "Đã tải" khi phát được; nếu trình phát chưa sẵn sàng thì giữ cảnh báo đó, không ghi đè.
    if (playByUser(0)) {
      const note = truncated ? ` (chỉ lấy ${api.MAX_PLAYLIST_TRACKS} bài đầu tiên)` : '';
      ui.setStatus(`Đã tải ${tracks.length} bài${note}.`);
    }
  } catch (error) {
    showApiError(error);
  } finally {
    ui.setPlaylistBusy(false);
  }
}

async function onSearch(text) {
  const query = text.trim();
  if (!query) return; // chuỗi rỗng: không gọi API
  ui.setSearchBusy(true);
  ui.setStatus('Đang tìm...');
  try {
    const tracks = await api.searchTracks(query, apiKey);
    ui.renderSearchResults(tracks, { onPlayNow: addAndPlay, onAdd: addOnly });
    ui.setStatus(tracks.length === 0 ? 'Không tìm thấy bài nào.' : '');
  } catch (error) {
    showApiError(error);
  } finally {
    ui.setSearchBusy(false);
  }
}

function addOnly(track) {
  commit(queue.addTrack(state, track));
  ui.setStatus(`Đã thêm "${track.title}" vào danh sách.`);
}

function addAndPlay(track) {
  commit(queue.addTrack(state, track));
  playByUser(state.items.length - 1);
}

// ---------- Nút điều khiển ----------

function onPrev() {
  const prev = queue.getPrevIndex(state);
  if (prev !== null) playByUser(prev);
}

function onNext() {
  const next = queue.getNextIndex(state, { auto: false });
  if (next !== null) playByUser(next);
}

// Phát-dừng. Chưa chọn bài mà có danh sách thì phát bài đầu.
function onToggle() {
  if (state.currentIndex === -1 && state.items.length > 0) {
    playByUser(0);
    return;
  }
  if (!player) {
    notifyPlayerNotReady();
    return;
  }
  player.togglePause();
}

function onShuffle() {
  commit(queue.shuffleQueue(state));
}

function onRepeat() {
  commit({ ...state, repeat: queue.nextRepeatMode(state.repeat) });
}

// ---------- Khởi động ----------

function init() {
  apiKey = storage.loadApiKey();
  const saved = storage.loadQueue();
  state = queue.createQueue({ ...saved, repeat: storage.loadRepeat() });

  ui.bindEvents({
    onSaveKey, onResetKey, onLoadPlaylist, onSearch,
    onPrev, onToggle, onNext, onShuffle, onRepeat,
  });

  if (apiKey) enterMainScreen();
  else ui.showKeyScreen();
}

init();
