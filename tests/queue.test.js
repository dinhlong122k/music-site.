// Test cho js/queue.js: logic danh sách thuần.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createQueue, addTrack, removeAt, setCurrent, replaceItems,
  getNextIndex, getPrevIndex, shuffleQueue, nextRepeatMode, decideAfterError,
} from '../public/js/queue.js';

const t = (id) => ({ videoId: id, title: id, channel: 'c', thumbnail: '' });
const make = (ids, currentIndex = 0, repeat = 'off') =>
  createQueue({ items: ids.map(t), currentIndex, repeat });
const ids = (s) => s.items.map((x) => x.videoId);

test('addTrack: thêm vào cuối, không đổi bài hiện tại', () => {
  const s = addTrack(make(['a', 'b'], 1), t('c'));
  assert.deepEqual(ids(s), ['a', 'b', 'c']);
  assert.equal(s.currentIndex, 1);
});

test('addTrack: danh sách rỗng thì chưa chọn bài', () => {
  const s = addTrack(createQueue(), t('a'));
  assert.equal(s.currentIndex, -1);
});

test('replaceItems: chọn bài đầu; rỗng thì -1; giữ chế độ lặp', () => {
  const s = replaceItems(make(['x'], 0, 'all'), [t('a'), t('b')]);
  assert.equal(s.currentIndex, 0);
  assert.equal(s.repeat, 'all');
  assert.equal(replaceItems(s, []).currentIndex, -1);
});

test('removeAt: xoá bài trước bài hiện tại thì lùi chỉ số', () => {
  const r = removeAt(make(['a', 'b', 'c'], 2), 0);
  assert.deepEqual(ids(r.state), ['b', 'c']);
  assert.equal(r.state.currentIndex, 1);
  assert.equal(r.shouldPlay, false);
});

test('removeAt: xoá bài sau bài hiện tại giữ nguyên chỉ số', () => {
  const r = removeAt(make(['a', 'b', 'c'], 0), 2);
  assert.equal(r.state.currentIndex, 0);
  assert.equal(r.shouldPlay, false);
});

test('removeAt: xoá bài đang phát giữa danh sách thì sang bài kế', () => {
  const r = removeAt(make(['a', 'b', 'c'], 1), 1);
  assert.deepEqual(ids(r.state), ['a', 'c']);
  assert.equal(r.state.currentIndex, 1);
  assert.equal(r.shouldPlay, true);
});

test('removeAt: xoá bài đang phát cuối danh sách', () => {
  const off = removeAt(make(['a', 'b'], 1, 'off'), 1);
  assert.equal(off.state.currentIndex, -1);
  assert.equal(off.shouldPlay, false);
  const all = removeAt(make(['a', 'b'], 1, 'all'), 1);
  assert.equal(all.state.currentIndex, 0);
  assert.equal(all.shouldPlay, true);
});

test('removeAt: xoá bài duy nhất; chỉ số ngoài phạm vi', () => {
  const r = removeAt(make(['a'], 0), 0);
  assert.equal(r.state.items.length, 0);
  assert.equal(r.state.currentIndex, -1);
  assert.equal(r.shouldPlay, false);
  const bad = removeAt(make(['a'], 0), 5);
  assert.equal(bad.state.items.length, 1);
});

test('getNextIndex: lặp tắt', () => {
  assert.equal(getNextIndex(make(['a', 'b', 'c'], 0, 'off'), { auto: true }), 1);
  assert.equal(getNextIndex(make(['a', 'b', 'c'], 2, 'off'), { auto: true }), null);
  assert.equal(getNextIndex(make(['a', 'b', 'c'], 2, 'off'), { auto: false }), null);
});

test('getNextIndex: lặp cả danh sách quay về đầu', () => {
  assert.equal(getNextIndex(make(['a', 'b', 'c'], 2, 'all'), { auto: true }), 0);
  assert.equal(getNextIndex(make(['a', 'b', 'c'], 2, 'all'), { auto: false }), 0);
});

test('getNextIndex: lặp một bài chỉ giữ bài khi tự hết bài', () => {
  assert.equal(getNextIndex(make(['a', 'b', 'c'], 1, 'one'), { auto: true }), 1);
  assert.equal(getNextIndex(make(['a', 'b', 'c'], 1, 'one'), { auto: false }), 2);
  assert.equal(getNextIndex(make(['a', 'b', 'c'], 2, 'one'), { auto: false }), null);
});

test('getNextIndex: danh sách rỗng hoặc chưa chọn bài', () => {
  assert.equal(getNextIndex(createQueue(), { auto: true }), null);
  assert.equal(getNextIndex(make(['a'], -1), { auto: true }), null);
});

test('getPrevIndex: lùi, quay vòng khi lặp all, dừng ở đầu khi khác', () => {
  assert.equal(getPrevIndex(make(['a', 'b', 'c'], 2)), 1);
  assert.equal(getPrevIndex(make(['a', 'b', 'c'], 0, 'all')), 2);
  assert.equal(getPrevIndex(make(['a', 'b', 'c'], 0, 'off')), null);
  assert.equal(getPrevIndex(make(['a', 'b', 'c'], 0, 'one')), null);
});

test('setCurrent: chỉ nhận chỉ số hợp lệ', () => {
  assert.equal(setCurrent(make(['a', 'b']), 1).currentIndex, 1);
  assert.equal(setCurrent(make(['a', 'b']), 9).currentIndex, 0);
});

test('shuffleQueue: bài hiện tại lên đầu, đủ phần tử, không đổi state cũ', () => {
  const before = make(['a', 'b', 'c', 'd', 'e'], 3);
  const after = shuffleQueue(before, () => 0.3);
  assert.equal(after.items[0].videoId, 'd');
  assert.equal(after.currentIndex, 0);
  assert.deepEqual(ids(after).sort(), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(ids(before), ['a', 'b', 'c', 'd', 'e']);
});

test('shuffleQueue: chưa có bài hiện tại thì trộn hết, chỉ số vẫn -1', () => {
  const after = shuffleQueue(make(['a', 'b', 'c'], -1), () => 0.5);
  assert.equal(after.currentIndex, -1);
  assert.deepEqual(ids(after).sort(), ['a', 'b', 'c']);
});

test('nextRepeatMode: off -> all -> one -> off', () => {
  assert.equal(nextRepeatMode('off'), 'all');
  assert.equal(nextRepeatMode('all'), 'one');
  assert.equal(nextRepeatMode('one'), 'off');
  assert.equal(nextRepeatMode('xxx'), 'off');
});

test('removeAt: lặp cả danh sách, xoá bài duy nhất đang phát thì dừng (không còn bài để quay về)', () => {
  const r = removeAt(make(['a'], 0, 'all'), 0);
  assert.equal(r.state.items.length, 0);
  assert.equal(r.state.currentIndex, -1);
  assert.equal(r.shouldPlay, false);
});

test('removeAt: lặp cả danh sách, xoá bài cuối đang phát thì quay về bài đầu', () => {
  const r = removeAt(make(['a', 'b', 'c'], 2, 'all'), 2);
  assert.deepEqual(ids(r.state), ['a', 'b']);
  assert.equal(r.state.currentIndex, 0);
  assert.equal(r.shouldPlay, true);
});

test('decideAfterError: còn bài kế và chưa lỗi hết vòng thì bỏ qua sang bài kế', () => {
  assert.deepEqual(decideAfterError(make(['a', 'b', 'c'], 0), 1), { action: 'skip', next: 1 });
});

test('decideAfterError: bài cuối, không lặp -> dừng vì hết danh sách', () => {
  assert.deepEqual(decideAfterError(make(['a', 'b'], 1, 'off'), 1), { action: 'stop', reason: 'end' });
});

test('decideAfterError: lặp một bài vẫn đi tiếp khi lỗi (không kẹt ở bài lỗi)', () => {
  assert.deepEqual(decideAfterError(make(['a', 'b'], 0, 'one'), 1), { action: 'skip', next: 1 });
});

test('decideAfterError: lặp cả danh sách, lỗi hết một vòng -> dừng', () => {
  assert.deepEqual(decideAfterError(make(['a', 'b'], 1, 'all'), 2), { action: 'stop', reason: 'all-failed' });
  assert.deepEqual(decideAfterError(make(['a', 'b'], 1, 'all'), 1), { action: 'skip', next: 0 });
});

test('decideAfterError: danh sách rỗng hoặc chưa chọn bài -> dừng vì hết danh sách', () => {
  assert.deepEqual(decideAfterError(createQueue(), 1), { action: 'stop', reason: 'end' });
  assert.deepEqual(decideAfterError(make(['a'], -1), 1), { action: 'stop', reason: 'end' });
});
