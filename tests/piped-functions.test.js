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

// ---------- Invidious + fallback đa nguồn ----------
import {
  getInvidiousInstances, getProviders, mapInvidiousVideos, pickBestInvidiousAudio,
  invidiousAudioUrl, upstreamTry, UpstreamError,
} from '../src/api/_piped.js';
import { onRequestGet as streamGet } from '../src/api/stream.js';
import { onRequestGet as searchGet } from '../src/api/search.js';
import { onRequestGet as playlistGet } from '../src/api/playlist.js';

const ENV = { PIPED_INSTANCES: 'https://p.test', INVIDIOUS_INSTANCES: 'https://i.test' };

// Thay global fetch bằng hàm định tuyến theo URL; trả hàm khôi phục.
function mockFetch(routes) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    for (const [prefix, reply] of Object.entries(routes)) {
      if (String(url).startsWith(prefix)) return reply(String(url));
    }
    throw new Error('connect ECONNREFUSED');
  };
  return () => { globalThis.fetch = original; };
}
const ok = (body) => () => new Response(JSON.stringify(body), { status: 200 });
const status = (code) => () => new Response('x', { status: code });
const req = (path) => ({ request: new Request('https://site.test' + path), env: ENV });

test('getInvidiousInstances / getProviders: ghi đè bằng env, gộp hai loại', () => {
  assert.ok(getInvidiousInstances().length > 0);
  assert.deepEqual(getProviders(ENV), [
    { type: 'piped', base: 'https://p.test' },
    { type: 'invidious', base: 'https://i.test' },
  ]);
});

test('mapInvidiousVideos: chuẩn hoá, bỏ item không phải video và id sai', () => {
  const out = mapInvidiousVideos([
    { type: 'video', videoId: 'aaa', title: 'A', author: 'K', lengthSeconds: 99 },
    { type: 'channel', videoId: 'bbb' },
    { type: 'video', videoId: 'b b' },
    { videoId: 'ccc' },
  ]);
  assert.deepEqual(out.map((t) => t.videoId), ['aaa', 'ccc']);
  assert.deepEqual(out[0], { videoId: 'aaa', title: 'A', uploader: 'K', duration: 99 });
  assert.deepEqual(mapInvidiousVideos(null), []);
});

test('pickBestInvidiousAudio: ưu tiên audio/mp4 rồi bitrate (chuỗi), bỏ video', () => {
  const best = pickBestInvidiousAudio([
    { type: 'video/mp4', itag: '137', bitrate: '9000000' },
    { type: 'audio/webm; codecs="opus"', itag: '251', bitrate: '160000' },
    { type: 'audio/mp4; codecs="mp4a.40.5"', itag: '139', bitrate: '48000' },
    { type: 'audio/mp4; codecs="mp4a.40.2"', itag: '140', bitrate: '130000' },
  ]);
  assert.equal(best.itag, '140');
  assert.equal(pickBestInvidiousAudio([{ type: 'video/mp4', itag: '1' }]), null);
  assert.equal(pickBestInvidiousAudio(null), null);
});

test('invidiousAudioUrl: đi qua server Invidious (local=true)', () => {
  assert.equal(
    invidiousAudioUrl('https://i.test', 'abc', '140'),
    'https://i.test/latest_version?id=abc&itag=140&local=true',
  );
});

test('buildProxyHostMatcher: cho phép cả tên miền instance Invidious', () => {
  const allowed = buildProxyHostMatcher(ENV);
  assert.equal(allowed('i.test'), true);
  assert.equal(allowed('p.test'), true);
  assert.equal(allowed('evil.com'), false);
});

test('upstreamTry: Piped hỏng thì lấy Invidious', async (t) => {
  t.after(mockFetch({ 'https://p.test': status(500), 'https://i.test': ok({ v: 1 }) }));
  const { result, provider } = await upstreamTry(ENV, { piped: '/a', invidious: '/b' }, {
    piped: () => 'P', invidious: (d) => d.v,
  });
  assert.equal(result, 1);
  assert.equal(provider.type, 'invidious');
});

test('upstreamTry: dữ liệu không dùng được (parse null) coi như hỏng', async (t) => {
  t.after(mockFetch({ 'https://p.test': ok({}), 'https://i.test': ok({ v: 2 }) }));
  const { result } = await upstreamTry(ENV, { piped: '/a', invidious: '/b' }, {
    piped: () => null, invidious: (d) => d.v,
  });
  assert.equal(result, 2);
});

test('upstreamTry: tất cả hỏng -> UpstreamError kèm details từng instance', async (t) => {
  t.after(mockFetch({ 'https://p.test': status(403) }));
  await assert.rejects(
    upstreamTry(ENV, { piped: '/a', invidious: '/b' }, { piped: () => 1, invidious: () => 1 }),
    (err) => err instanceof UpstreamError
      && err.details.some((d) => d.includes('https://p.test') && d.includes('HTTP 403'))
      && err.details.some((d) => d.includes('https://i.test') && d.includes('ECONNREFUSED')),
  );
});

test('/api/stream: Invidious -> audioUrl bọc /api/proxy, link local=true', async (t) => {
  t.after(mockFetch({
    'https://p.test': status(502),
    'https://i.test/api/v1/videos/vid1': ok({
      title: 'T', author: 'A',
      adaptiveFormats: [{ type: 'audio/mp4; codecs="mp4a.40.2"', itag: '140', bitrate: '1' }],
    }),
  }));
  const res = await streamGet(req('/api/stream?id=vid1'));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.source, 'https://i.test');
  assert.equal(body.title, 'T');
  assert.equal(body.uploader, 'A');
  assert.equal(
    body.audioUrl,
    '/api/proxy?url=' + encodeURIComponent('https://i.test/latest_version?id=vid1&itag=140&local=true'),
  );
});

test('/api/stream: tất cả hỏng -> 502 kèm details', async (t) => {
  t.after(mockFetch({ 'https://p.test': status(429), 'https://i.test': status(403) }));
  const res = await streamGet(req('/api/stream?id=vid1'));
  const body = await res.json();
  assert.equal(res.status, 502);
  assert.equal(body.error, 'upstream_failed');
  assert.equal(body.details.length, 2);
});

test('/api/search: Invidious trả kết quả đã chuẩn hoá', async (t) => {
  t.after(mockFetch({
    'https://p.test': status(500),
    'https://i.test/api/v1/search': ok([
      { type: 'video', videoId: 'x1', title: 'S', author: 'U', lengthSeconds: 10 },
      { type: 'channel', authorId: 'UC' },
    ]),
  }));
  const body = await (await searchGet(req('/api/search?q=hello'))).json();
  assert.deepEqual(body.items, [{ videoId: 'x1', title: 'S', uploader: 'U', duration: 10 }]);
});

test('/api/playlist: Invidious phân trang bằng ?page=, dừng khi không có bài mới', async (t) => {
  const page = (ids) => ok({ videos: ids.map((videoId) => ({ videoId, title: videoId })) });
  t.after(mockFetch({
    'https://p.test': status(500),
    'https://i.test/api/v1/playlists/PL1?page=2': page(['b', 'a']),
    'https://i.test/api/v1/playlists/PL1?page=3': page(['b']),
    'https://i.test/api/v1/playlists/PL1': page(['a']),
  }));
  const body = await (await playlistGet(req('/api/playlist?id=PL1'))).json();
  assert.deepEqual(body.items.map((t) => t.videoId), ['a', 'b']);
  assert.equal(body.truncated, false);
});

import { onRequestGet as proxyGet } from '../src/api/proxy.js';

test('/api/proxy: theo redirect trong allowlist, chặn redirect sang host lạ', async (t) => {
  t.after(mockFetch({
    'https://i.test/latest_version': () => new Response(null, {
      status: 302, headers: { Location: '/videoplayback?x=1' },
    }),
    'https://i.test/videoplayback': () => new Response('AUDIO', {
      status: 200, headers: { 'Content-Type': 'audio/mp4' },
    }),
    'https://i.test/bad': () => new Response(null, {
      status: 302, headers: { Location: 'https://evil.com/x' },
    }),
  }));
  const good = await proxyGet(req('/api/proxy?url=' + encodeURIComponent('https://i.test/latest_version?id=a')));
  assert.equal(good.status, 200);
  assert.equal(await good.text(), 'AUDIO');

  const bad = await proxyGet(req('/api/proxy?url=' + encodeURIComponent('https://i.test/bad')));
  assert.equal(bad.status, 403);
});
