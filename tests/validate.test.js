// Test cho js/validate.js: kiểm tra ID, URL ảnh và tạo bài hát an toàn.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidId, isSafeThumbnailUrl, makeTrack } from '../js/validate.js';

test('isValidId: chấp nhận chữ, số, gạch dưới, gạch ngang', () => {
  assert.equal(isValidId('dQw4w9WgXcQ'), true);
  assert.equal(isValidId('PL_abc-123'), true);
});

test('isValidId: từ chối rỗng, ký tự lạ, không phải chuỗi', () => {
  assert.equal(isValidId(''), false);
  assert.equal(isValidId('abc def'), false);
  assert.equal(isValidId('a"><script>'), false);
  assert.equal(isValidId(null), false);
  assert.equal(isValidId(123), false);
});

test('isSafeThumbnailUrl: chỉ nhận https://i.ytimg.com/', () => {
  assert.equal(isSafeThumbnailUrl('https://i.ytimg.com/vi/x/default.jpg'), true);
  assert.equal(isSafeThumbnailUrl('http://i.ytimg.com/vi/x/default.jpg'), false);
  assert.equal(isSafeThumbnailUrl('https://evil.com/i.ytimg.com/'), false);
  assert.equal(isSafeThumbnailUrl('https://i.ytimg.com.evil.com/x'), false);
  assert.equal(isSafeThumbnailUrl(undefined), false);
});

test('makeTrack: tạo bài hợp lệ, bỏ ảnh không an toàn', () => {
  const t = makeTrack({ videoId: 'abc', title: 'Bài', channel: 'Kênh', thumbnail: 'https://evil.com/a.jpg' });
  assert.deepEqual(t, { videoId: 'abc', title: 'Bài', channel: 'Kênh', thumbnail: '' });
});

test('makeTrack: videoId sai thì trả null', () => {
  assert.equal(makeTrack({ videoId: 'a b', title: 'x', channel: 'y', thumbnail: '' }), null);
  assert.equal(makeTrack(null), null);
});

test('makeTrack: thiếu tên thì dùng chữ thay thế', () => {
  const t = makeTrack({ videoId: 'abc' });
  assert.equal(t.title, '(Không có tên)');
  assert.equal(t.channel, '');
});
