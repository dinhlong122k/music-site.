// ui.js - vẽ giao diện và gắn sự kiện.
//
// Quy tắc an toàn: chữ từ API (tên bài, tên kênh) CHỈ được gắn bằng textContent
// hoặc createElement. Không dùng innerHTML với dữ liệu động.
// File này không có logic nghiệp vụ: nó chỉ gọi các hàm xử lý (handlers) do app.js đưa vào.

const REPEAT_LABELS = { off: 'Lặp: tắt', all: 'Lặp: cả danh sách', one: 'Lặp: một bài' };

const $ = (id) => document.getElementById(id);

// ---------- Hàm dựng phần tử nhỏ ----------

function createButton(text, className, title, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.className = className;
  if (title) {
    button.title = title;
    button.setAttribute('aria-label', title);
  }
  button.addEventListener('click', onClick);
  return button;
}

// Ảnh nhỏ của bài; không có ảnh thì dùng khung trống để giữ bố cục.
function createThumbnail(track) {
  if (!track.thumbnail) {
    const placeholder = document.createElement('span');
    placeholder.className = 'thumb thumb-empty';
    return placeholder;
  }
  const img = document.createElement('img');
  img.className = 'thumb';
  img.src = track.thumbnail; // đã được kiểm tra là https://i.ytimg.com/ ở validate.js
  img.alt = '';
  img.loading = 'lazy';
  return img;
}

function createTrackText(track) {
  const box = document.createElement('span');
  box.className = 'track-text';
  const title = document.createElement('span');
  title.className = 'track-title';
  title.textContent = track.title;
  const channel = document.createElement('span');
  channel.className = 'track-channel';
  channel.textContent = track.channel;
  box.append(title, channel);
  return box;
}

// ---------- Màn hình ----------

export function showMainScreen() {
  $('main-screen').hidden = false;
}

// ---------- Thông báo ----------

// kind: 'info' | 'error'
export function setStatus(message, kind = 'info') {
  const box = $('status');
  box.textContent = message;
  box.className = kind === 'error' ? 'status status-error' : 'status';
}

// ---------- Khoá nút khi đang bận ----------

export function setSearchBusy(busy) {
  $('search-button').disabled = busy;
}

export function setPlaylistBusy(busy) {
  $('playlist-button').disabled = busy;
}

// ---------- Kết quả tìm kiếm ----------

// handlers: { onPlayNow(track), onAdd(track) }
export function renderSearchResults(tracks, handlers) {
  const list = $('search-results');
  list.replaceChildren();
  $('search-empty').hidden = tracks.length > 0;

  for (const track of tracks) {
    const item = document.createElement('li');
    item.className = 'result-item';

    // Bấm ảnh/tên = thêm và phát ngay.
    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'result-main';
    main.title = 'Thêm vào danh sách và phát ngay';
    main.append(createThumbnail(track), createTrackText(track));
    main.addEventListener('click', () => handlers.onPlayNow(track));

    const add = createButton('+', 'icon-button', 'Thêm vào cuối danh sách', () => handlers.onAdd(track));
    item.append(main, add);
    list.appendChild(item);
  }
}

// ---------- Danh sách đang phát ----------

function createNowPlayingMark() {
  const mark = document.createElement('span');
  mark.className = 'now-playing';
  mark.textContent = '◀ đang phát';
  return mark;
}

// Chỉ đổi bài đang được đánh dấu, không dựng lại cả danh sách (để không mất vị trí focus/cuộn).
export function markCurrent(currentIndex) {
  [...$('queue-list').children].forEach((item, index) => {
    const isCurrent = index === currentIndex;
    item.className = isCurrent ? 'queue-item current' : 'queue-item';
    item.querySelector('.now-playing')?.remove();
    if (isCurrent) item.querySelector('.queue-main').appendChild(createNowPlayingMark());
  });
}

// handlers: { onSelect(index), onRemove(index) }
export function renderQueue(state, handlers) {
  const list = $('queue-list');
  list.replaceChildren();
  $('queue-title').textContent = `Danh sách đang phát (${state.items.length} bài)`;
  $('queue-empty').hidden = state.items.length > 0;

  state.items.forEach((track, index) => {
    const item = document.createElement('li');
    const isCurrent = index === state.currentIndex;
    item.className = isCurrent ? 'queue-item current' : 'queue-item';

    const number = document.createElement('span');
    number.className = 'queue-number';
    number.textContent = `${index + 1}.`;

    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'queue-main';
    main.append(number, createTrackText(track));
    if (isCurrent) main.appendChild(createNowPlayingMark());
    main.addEventListener('click', () => handlers.onSelect(index));

    const remove = createButton('x', 'icon-button', 'Xoá khỏi danh sách', () => handlers.onRemove(index));
    item.append(main, remove);
    list.appendChild(item);
  });
}

export function renderRepeat(mode) {
  $('repeat-button').textContent = REPEAT_LABELS[mode] ?? REPEAT_LABELS.off;
}

// ---------- Gắn sự kiện một lần khi khởi động ----------

// Gom mọi sự kiện cố định (form, nút điều khiển) vào một chỗ.
// handlers: { onLoadPlaylist(text), onSearch(text),
//             onPrev(), onToggle(), onNext(), onShuffle(), onRepeat() }
export function bindEvents(handlers) {
  $('playlist-form').addEventListener('submit', (event) => {
    event.preventDefault();
    handlers.onLoadPlaylist($('playlist-input').value);
  });
  $('search-form').addEventListener('submit', (event) => {
    event.preventDefault();
    handlers.onSearch($('search-input').value);
  });

  $('prev-button').addEventListener('click', handlers.onPrev);
  $('toggle-button').addEventListener('click', handlers.onToggle);
  $('next-button').addEventListener('click', handlers.onNext);
  $('shuffle-button').addEventListener('click', handlers.onShuffle);
  $('repeat-button').addEventListener('click', handlers.onRepeat);
}
