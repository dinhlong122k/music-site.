// Test cho js/piped-api.js: đổi lỗi HTTP -> tiếng Việt và các hàm gọi /api/* (fetch giả).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mapHttpError, NETWORK_ERROR_MESSAGE, ApiError,
  searchTracks, fetchPlaylistTracks, fetchStreamUrl,
} from '../public/js/piped-api.js';

const realFetch = globalThis.fetch;

function mockFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return handler(calls.length, String(url));
  };
  return calls;
}

const ok = (json) => ({ ok: true, status: 200, json: async () => json });
const fail = (status, json = {}) => ({ ok: false, status, json: async () => json });

test.afterEach(() => { globalThis.fetch = realFetch; });

test('mapHttpError: 502 -> máy chủ bận; khác -> có mã', () => {
  assert.match(mapHttpError(502), /bận|không phản hồi/i);
  assert.match(mapHttpError(404), /không tìm thấy/i);
  assert.match(mapHttpError(400), /không hợp lệ/i);
  assert.match(mapHttpError(500), /mã 500/);
});

test('searchTracks: gọi /api/search và chuẩn hoá (uploader -> channel)', async () => {
  const calls = mockFetch(() => ok({ items: [
    { videoId: 'aaa', title: 'Bài A', uploader: 'Kênh A' },
    { videoId: 'x y', title: 'id sai' },
  ] }));
  const tracks = await searchTracks('nhạc trẻ');
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].videoId, 'aaa');
  assert.equal(tracks[0].channel, 'Kênh A');
  assert.equal(tracks[0].thumbnail, '');
  assert.ok(calls[0].url.startsWith('/api/search?q='));
  assert.match(calls[0].url, /q=nh%E1%BA%A1c%20tr%E1%BA%BB/);
});

test('fetchPlaylistTracks: trả { tracks, truncated }', async () => {
  mockFetch(() => ok({ items: [{ videoId: 'aaa', title: 'A', uploader: 'K' }], truncated: true }));
  const result = await fetchPlaylistTracks('PLabc');
  assert.equal(result.tracks.length, 1);
  assert.equal(result.truncated, true);
});

test('fetchStreamUrl: chỉ nhận audioUrl cùng domain (/api/proxy...)', async () => {
  mockFetch(() => ok({ audioUrl: '/api/proxy?url=https%3A%2F%2Fx' }));
  assert.equal(await fetchStreamUrl('aaa'), '/api/proxy?url=https%3A%2F%2Fx');
});

test('fetchStreamUrl: audioUrl ra host ngoài -> ApiError', async () => {
  mockFetch(() => ok({ audioUrl: 'https://evil.com/a.mp3' }));
  await assert.rejects(fetchStreamUrl('aaa'), ApiError);
});

test('HTTP lỗi -> ApiError kèm thông báo đã đổi', async () => {
  mockFetch(() => fail(502, { error: 'upstream_failed' }));
  await assert.rejects(searchTracks('x'), (e) => e instanceof ApiError && /bận|không phản hồi/i.test(e.message));
});

test('fetch ném lỗi (mất mạng) -> ApiError thông báo mạng', async () => {
  mockFetch(() => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(fetchStreamUrl('aaa'), { message: NETWORK_ERROR_MESSAGE });
});

test('body không phải object -> ApiError', async () => {
  mockFetch(() => ({ ok: true, status: 200, json: async () => 'abc' }));
  await assert.rejects(searchTracks('x'), ApiError);
});
