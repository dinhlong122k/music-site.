// app.js - khởi động và nối các phần với nhau.
//
// Chỉ file này biết "khi người dùng làm X thì gọi phần nào". Logic danh sách ở queue.js,
// gọi mạng ở piped-api.js, giao diện ở ui.js, trình phát ở player.js.
//
// Không còn màn hình nhập key: Piped được proxy qua /api nên không cần API key của người dùng.
import * as storage from './storage.js';
import * as queue from './queue.js';
import * as api from './piped-api.js';
import * as ui from './ui.js';
import { createPlayer } from './player.js';
import { extractPlaylistId } from './url-parser.js';

let state = queue.createQueue();
let player = null;
let consecutiveErrors = 0; // số bài lỗi liên tiếp, để không lặp vô hạn

// ---------- Vẽ lại & lưu ----------

function queueHandlers() {
  return { onSelect: playByUser, onRemove: removeTrack };
}

function commit(newState) {
  const onlyCurrentChanged = newState.items === state.items;
  state = newState;
  storage.saveQueue(state);
  storage.saveRepeat(state.repeat);
  if (onlyCurrentChanged) ui.markCurrent(state.currentIndex);
  else ui.renderQueue(state, queueHandlers());
  ui.renderRepeat(state.repeat);
}

// ---------- Phát nhạc ----------

// Chọn bài và ra lệnh phát. Trả true nếu có bài để phát, false nếu vị trí trống.
function playIndex(index) {
  commit(queue.setCurrent(state, index));
  const track = state.items[state.currentIndex];
  if (!track) return false;
  ui.setStatus(`Đang tải: ${track.title}...`);
  player.play(track.videoId);
  return true;
}

// Người dùng chủ động chọn phát: đếm lỗi liên tiếp lại từ 0.
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

// Bài không phát được (không lấy được luồng, hoặc audio lỗi) -> chuyển bài kế hay dừng.
function onPlayerError() {
  consecutiveErrors += 1;
  const decision = queue.decideAfterError(state, consecutiveErrors);
  if (decision.action === 'stop') {
    const message = decision.reason === 'end'
      ? 'Hết danh sách, đã dừng.'
      : 'Mọi bài trong danh sách đều không phát được, đã dừng.';
    ui.setStatus(message, 'error');
    player.stop();
    return;
  }
  const track = state.items[state.currentIndex];
  const name = track ? `"${track.title}"` : 'Bài này';
  ui.setStatus(`${name} không phát được, chuyển sang bài kế.`, 'error');
  playIndex(decision.next);
}

function onPlaying() {
  consecutiveErrors = 0;
  const track = state.items[state.currentIndex];
  if (track) ui.setStatus(`Đang phát: ${track.title}`);
}

// ---------- Xoá bài ----------

function removeTrack(index) {
  const removedCurrent = index === state.currentIndex;
  const result = queue.removeAt(state, index);
  commit(result.state);
  if (result.shouldPlay) playByUser(result.state.currentIndex);
  else if (removedCurrent) player.stop();
}

// ---------- Lỗi API ----------

function showApiError(error) {
  const message = error instanceof api.ApiError ? error.message : 'Có lỗi không mong đợi, hãy thử lại.';
  ui.setStatus(message, 'error');
}

// ---------- Hành động của người dùng ----------

async function onLoadPlaylist(text) {
  const playlistId = extractPlaylistId(text);
  if (!playlistId) {
    ui.setStatus('Link playlist không hợp lệ. Hãy dán link có dạng youtube.com/playlist?list=...', 'error');
    return;
  }
  ui.setPlaylistBusy(true);
  ui.setStatus('Đang tải playlist...');
  try {
    const { tracks, truncated } = await api.fetchPlaylistTracks(playlistId);
    if (tracks.length === 0) {
      ui.setStatus('Playlist này không có bài nào phát được.', 'error');
      return;
    }
    commit(queue.replaceItems(state, tracks));
    playByUser(0);
    const note = truncated ? ` (chỉ lấy ${api.MAX_PLAYLIST_TRACKS} bài đầu tiên)` : '';
    ui.setStatus(`Đã tải ${tracks.length} bài${note}.`);
  } catch (error) {
    showApiError(error);
  } finally {
    ui.setPlaylistBusy(false);
  }
}

async function onSearch(text) {
  const query = text.trim();
  if (!query) return;
  ui.setSearchBusy(true);
  ui.setStatus('Đang tìm...');
  try {
    const tracks = await api.searchTracks(query);
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
// Mới tải lại trang (có bài hiện tại nhưng chưa nạp nguồn) thì nạp và phát bài đó.
function onToggle() {
  if (state.items.length === 0) return;
  if (state.currentIndex === -1) {
    playByUser(0);
    return;
  }
  if (!player.hasSource()) {
    playByUser(state.currentIndex);
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
  const saved = storage.loadQueue();
  state = queue.createQueue({ ...saved, repeat: storage.loadRepeat() });

  const audioEl = document.getElementById('audio-player');
  player = createPlayer(audioEl, {
    resolveStreamUrl: api.fetchStreamUrl,
    onEnded: onTrackEnded,
    onError: onPlayerError,
    onPlaying,
  });

  ui.showMainScreen();
  ui.renderQueue(state, queueHandlers());
  ui.renderRepeat(state.repeat);
  ui.bindEvents({ onLoadPlaylist, onSearch, onPrev, onToggle, onNext, onShuffle, onRepeat });
}

init();
