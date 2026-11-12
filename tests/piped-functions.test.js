// Test phần THUẦN của functions/api/_piped.js: chuẩn hoá dữ liệu Piped và chặn proxy.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getInstances, videoIdFromUrl, mapStreamList, pickBestAudio, buildProxyHostMatcher,
} from '../src/api/_piped.js';

test('getInstances: mặc định khi không có env', () => {
  assert.ok(getInstances().length > 0);
  assert.ok(getInstances({}).every((u) => u.startsWith('https://')));
});

test('getInstances: ghi đè bằng PIPED_INSTANCES, cắt khoảng trắng và dấu / cuối', () => {
  const list = getInstances({ PIPED_INSTANCES: ' https://a.test/ , https://b.test ,, ' });
  assert.deepEqual(list, ['https://a.test', 'https://b.test']);
});

test('getInstances: env rỗng -> dùng mặc định', () => {
  assert.deepEqual(getInstances({ PIPED_INSTANCES: '   ' }), getInstances());
});

test('videoIdFromUrl: tách id từ /watch?v=ID và URL có v=', () => {
  assert.equal(videoIdFromUrl('/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(videoIdFromUrl('/watch?v=abc123&t=5'), 'abc123');
  assert.equal(videoIdFromUrl('https://x/watch?list=PL&v=XYZ'), 'XYZ');
  assert.equal(videoIdFromUrl('/channel/UC123'), '');
  assert.equal(videoIdFromUrl(null), '');
});

test('mapStreamList: chuẩn hoá, bỏ item không phải stream và id sai', () => {
  const items = [
    { url: '/watch?v=aaa', type: 'stream', title: 'Bài A', uploaderName: 'Kênh A', duration: 200 },
    { url: '/channel/UC1', type: 'channel', title: 'Kênh', uploaderName: 'x' },
    { url: '/watch?v=b b', type: 'stream', title: 'id sai' },
    { url: '/watch?v=ccc', title: 'Không có type vẫn nhận', uploaderName: 'K' },
  ];
  const out = mapStreamList(items);
  assert.deepEqual(out.map((t) => t.videoId), ['aaa', 'ccc']);
  assert.equal(out[0].uploader, 'Kênh A');
  assert.equal(out[0].duration, 200);
});

test('mapStreamList: đầu vào không phải mảng -> rỗng', () => {
  assert.deepEqual(mapStreamList(null), []);
  assert.deepEqual(mapStreamList(undefined), []);
});

test('pickBestAudio: ưu tiên M4A rồi bitrate cao nhất', () => {
  const best = pickBestAudio([
    { url: 'u1', format: 'WEBM', bitrate: 160000 },
    { url: 'u2', format: 'M4A', bitrate: 128000 },
    { url: 'u3', format: 'M4A', bitrate: 256000 },
  ]);
  assert.equal(best.url, 'u3');
});

test('pickBestAudio: không M4A thì lấy bitrate cao nhất', () => {
  const best = pickBestAudio([
    { url: 'u1', format: 'WEBM', bitrate: 90000 },
    { url: 'u2', format: 'WEBM', bitrate: 160000 },
  ]);
  assert.equal(best.url, 'u2');
});

test('pickBestAudio: rỗng hoặc toàn item hỏng -> null', () => {
  assert.equal(pickBestAudio([]), null);
  assert.equal(pickBestAudio(null), null);
  assert.equal(pickBestAudio([{ bitrate: 1 }]), null); // thiếu url
});

test('buildProxyHostMatcher: cho googlevideo, pipedproxy và tên miền instance; chặn còn lại', () => {
  const allowed = buildProxyHostMatcher({ PIPED_INSTANCES: 'https://pipedapi.kavin.rocks' });
  assert.equal(allowed('rr3---sn-x.googlevideo.com'), true);
  assert.equal(allowed('googlevideo.com'), true);
  assert.equal(allowed('pipedproxy-ams.kavin.rocks'), true);
  assert.equal(allowed('pipedapi.kavin.rocks'), true);
  assert.equal(allowed('kavin.rocks'), true);
  assert.equal(allowed('evil.com'), false);
  assert.equal(allowed('googlevideo.com.evil.com'), false);
});
