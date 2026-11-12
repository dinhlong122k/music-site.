// Test cho phần thuần của js/youtube-api.js: ánh xạ lỗi và chuẩn hoá dữ liệu.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mapApiError, NETWORK_ERROR_MESSAGE, playlistItemsToTracks, searchItemsToTracks,
  fetchPlaylistTracks, searchTracks, MAX_PLAYLIST_TRACKS, MAX_PLAYLIST_PAGES,
} from '../js/youtube-api.js';

const body = (reason, status = 'X', detailReason) => ({
  error: {
    status,
    errors: reason ? [{ reason }] : [],
    details: detailReason ? [{ reason: detailReason }] : [],
  },
});

test('key sai (400 API_KEY_INVALID / keyInvalid)', () => {
  assert.match(mapApiError(400, body('badRequest', 'INVALID_ARGUMENT', 'API_KEY_INVALID')), /key/i);
  assert.match(mapApiError(400, body('keyInvalid')), /key/i);
});

test('bị chặn referrer (403 ipRefererBlocked)', () => {
  assert.match(mapApiError(403, body('ipRefererBlocked')), /referrer/i);
});

test('hết hạn mức', () => {
  assert.match(mapApiError(403, body('quotaExceeded')), /hạn mức/);
  assert.match(mapApiError(403, body('dailyLimitExceeded')), /hạn mức/);
});

test('playlist không tồn tại / riêng tư', () => {
  assert.match(mapApiError(404, body('playlistNotFound')), /playlist/i);
});

test('API chưa bật (accessNotConfigured)', () => {
  assert.match(mapApiError(403, body('accessNotConfigured')), /YouTube Data API/);
});

test('lỗi không rõ vẫn có thông báo, body hỏng không làm sập', () => {
  assert.ok(mapApiError(500, body('backendError')).length > 0);
  assert.ok(mapApiError(500, null).length > 0);
  assert.ok(mapApiError(500, 'abc').length > 0);
});

test('lỗi mạng nói rõ không truy cập được YouTube', () => {
  assert.match(NETWORK_ERROR_MESSAGE, /Không truy cập được YouTube/);
});

test('playlistItemsToTracks: bỏ bài xoá/riêng tư/ID sai, lấy kênh chủ video', () => {
  const items = [
    { snippet: { title: 'Ok', videoOwnerChannelTitle: 'Chủ', channelTitle: 'Khác',
        resourceId: { videoId: 'abc123' }, thumbnails: { default: { url: 'https://i.ytimg.com/vi/abc123/default.jpg' } } },
      status: { privacyStatus: 'public' } },
    { snippet: { title: 'Private video', resourceId: { videoId: 'p1' } }, status: { privacyStatus: 'private' } },
    { snippet: { title: 'Deleted video', resourceId: { videoId: 'd1' } }, status: { privacyStatus: 'public' } },
    { snippet: { title: 'Sai id', resourceId: { videoId: 'a b' } }, status: { privacyStatus: 'public' } },
    { snippet: { title: 'Thiếu resource' } },
  ];
  const tracks = playlistItemsToTracks(items);
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].channel, 'Chủ');
  assert.equal(tracks[0].thumbnail, 'https://i.ytimg.com/vi/abc123/default.jpg');
});

test('searchItemsToTracks: chuẩn hoá, bỏ id sai, bỏ ảnh lạ', () => {
  const items = [
    { id: { videoId: 'v1' }, snippet: { title: 'A', channelTitle: 'K', thumbnails: { default: { url: 'https://evil.com/x.jpg' } } } },
    { id: { videoId: '<x>' }, snippet: { title: 'B' } },
  ];
  const tracks = searchItemsToTracks(items);
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].thumbnail, '');
});

test('lỗi giới hạn tốc độ: thông báo riêng, không phải hết hạn mức ngày', () => {
  for (const reason of ['rateLimitExceeded', 'userRateLimitExceeded']) {
    const message = mapApiError(403, body(reason));
    assert.match(message, /quá nhanh/);
    assert.doesNotMatch(message, /hạn mức/);
  }
});

// ---------- Test phần gọi mạng, giả globalThis.fetch ----------

const realFetch = globalThis.fetch;

// Cài fetch giả: handler(số lần gọi, url, options) trả response giả hoặc ném lỗi. Trả về danh sách các lần gọi.
function mockFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return handler(calls.length, String(url), options);
  };
  return calls;
}

const okResponse = (json) => ({ ok: true, status: 200, json: async () => json });
const validItem = (id) => ({
  snippet: { title: `T${id}`, resourceId: { videoId: id }, channelTitle: 'K' },
  status: { privacyStatus: 'public' },
});
const invalidItem = () => ({ snippet: { title: 'Private video', resourceId: { videoId: 'x' } }, status: { privacyStatus: 'private' } });
// Trang có `count` bài hợp lệ, id duy nhất theo (trang, chỉ số).
const pageOf = (pageNo, count, nextPageToken) => ({
  items: Array.from({ length: count }, (_, i) => validItem(`p${pageNo}v${i}`)),
  ...(nextPageToken ? { nextPageToken } : {}),
});

test.afterEach(() => {
  globalThis.fetch = realFetch;
});

test('key gửi qua header X-Goog-Api-Key, không nằm trong URL', async () => {
  const calls = mockFetch(() => okResponse(pageOf(1, 1)));
  await fetchPlaylistTracks('PLabc', 'KEY-GIA');
  assert.equal(calls[0].options.headers['X-Goog-Api-Key'], 'KEY-GIA');
  assert.doesNotMatch(calls[0].url, /key=/i);
  assert.doesNotMatch(calls[0].url, /KEY-GIA/);
  assert.ok(calls[0].url.startsWith('https://www.googleapis.com/youtube/v3/playlistItems?'));
});

test('searchTracks cũng gửi key qua header', async () => {
  const calls = mockFetch(() => okResponse({ items: [{ id: { videoId: 'v1' }, snippet: { title: 'A' } }] }));
  const tracks = await searchTracks('nhạc', 'KEY-GIA');
  assert.equal(tracks.length, 1);
  assert.equal(calls[0].options.headers['X-Goog-Api-Key'], 'KEY-GIA');
  assert.doesNotMatch(calls[0].url, /key=/i);
});

test('fetchPlaylistTracks: dừng khi hết nextPageToken', async () => {
  const calls = mockFetch((n) => okResponse(n === 1 ? pageOf(1, 3, 'TOKEN2') : pageOf(2, 2)));
  const result = await fetchPlaylistTracks('PLabc', 'k');
  assert.equal(calls.length, 2);
  assert.equal(result.tracks.length, 5);
  assert.equal(result.truncated, false);
  assert.match(calls[1].url, /pageToken=TOKEN2/);
});

test('fetchPlaylistTracks: bỏ bài hỏng ở nhiều trang', async () => {
  mockFetch((n) => okResponse(n === 1
    ? { items: [validItem('a'), invalidItem()], nextPageToken: 'TOKEN2' }
    : { items: [invalidItem(), validItem('b')] }));
  const result = await fetchPlaylistTracks('PLabc', 'k');
  assert.deepEqual(result.tracks.map((t) => t.videoId), ['a', 'b']);
  assert.equal(result.truncated, false);
});

test('fetchPlaylistTracks: giới hạn 500 bài và báo truncated', async () => {
  // 10 trang x 50 bài = đúng 500, vẫn còn token -> dừng và báo truncated.
  const calls = mockFetch((n) => okResponse(pageOf(n, 50, `TOKEN${n + 1}`)));
  const result = await fetchPlaylistTracks('PLabc', 'k');
  assert.equal(result.tracks.length, MAX_PLAYLIST_TRACKS);
  assert.equal(result.truncated, true);
  assert.equal(calls.length, 10);
});

test('fetchPlaylistTracks: đúng 500 bài và hết trang thì không truncated', async () => {
  mockFetch((n) => okResponse(pageOf(n, 50, n < 10 ? `TOKEN${n + 1}` : undefined)));
  const result = await fetchPlaylistTracks('PLabc', 'k');
  assert.equal(result.tracks.length, MAX_PLAYLIST_TRACKS);
  assert.equal(result.truncated, false);
});

test('fetchPlaylistTracks: giới hạn số trang khi toàn bài hỏng', async () => {
  const calls = mockFetch((n) => okResponse({ items: [invalidItem()], nextPageToken: `TOKEN${n + 1}` }));
  const result = await fetchPlaylistTracks('PLabc', 'k');
  assert.equal(calls.length, MAX_PLAYLIST_PAGES);
  assert.equal(result.tracks.length, 0);
  assert.equal(result.truncated, true);
});

test('lỗi HTTP không phải JSON (trang chặn của tường lửa) -> thông báo không truy cập được YouTube', async () => {
  mockFetch(() => ({ ok: false, status: 403, json: async () => { throw new SyntaxError('not json'); } }));
  await assert.rejects(fetchPlaylistTracks('PLabc', 'k'), { message: NETWORK_ERROR_MESSAGE });
});

test('lỗi HTTP có JSON thì vẫn đổi theo mã lý do', async () => {
  mockFetch(() => ({ ok: false, status: 403, json: async () => body('quotaExceeded') }));
  await assert.rejects(searchTracks('x', 'k'), /hạn mức/);
});

test('lỗi giới hạn tốc độ qua fetch -> thông báo "quá nhanh"', async () => {
  mockFetch(() => ({ ok: false, status: 429, json: async () => body('rateLimitExceeded') }));
  await assert.rejects(searchTracks('x', 'k'), /quá nhanh/);
});

test('fetch ném lỗi (mất mạng/bị chặn) -> thông báo mạng', async () => {
  mockFetch(() => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(searchTracks('x', 'k'), { message: NETWORK_ERROR_MESSAGE });
});
