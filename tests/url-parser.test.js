// Test cho js/url-parser.js: tách playlistId từ nhiều dạng link.
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPlaylistId } from '../public/js/url-parser.js';

const ID = 'PLabc_123-XYZ';

test('link playlist thường', () => {
  assert.equal(extractPlaylistId(`https://www.youtube.com/playlist?list=${ID}`), ID);
});

test('link watch có list', () => {
  assert.equal(extractPlaylistId(`https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=${ID}&index=2`), ID);
});

test('link music.youtube.com', () => {
  assert.equal(extractPlaylistId(`https://music.youtube.com/playlist?list=${ID}`), ID);
});

test('link youtu.be có list', () => {
  assert.equal(extractPlaylistId(`https://youtu.be/dQw4w9WgXcQ?list=${ID}`), ID);
});

test('link không có https và có khoảng trắng đầu/cuối', () => {
  assert.equal(extractPlaylistId(`  youtube.com/playlist?list=${ID}  `), ID);
});

test('ID trần', () => {
  assert.equal(extractPlaylistId(ID), ID);
});

test('link sai: domain lạ, thiếu list, rỗng, ID chứa ký tự lạ', () => {
  assert.equal(extractPlaylistId(`https://evil.com/playlist?list=${ID}`), null);
  assert.equal(extractPlaylistId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(extractPlaylistId(''), null);
  assert.equal(extractPlaylistId('   '), null);
  assert.equal(extractPlaylistId('https://www.youtube.com/playlist?list=a<b>'), null);
  assert.equal(extractPlaylistId('hello world'), null);
  assert.equal(extractPlaylistId(undefined), null);
});
