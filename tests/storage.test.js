// Test cho js/storage.js: đọc danh sách/chế độ lặp từ localStorage (giả bằng globalThis).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadQueue, loadRepeat, saveQueue } from '../js/storage.js';

const realLocalStorage = globalThis.localStorage;

// Cài localStorage giả chứa sẵn `data` (object tên -> chuỗi).
function mockStorage(data = {}) {
  const store = { ...data };
  globalThis.localStorage = {
    getItem: (name) => (name in store ? store[name] : null),
    setItem: (name, value) => { store[name] = String(value); },
    removeItem: (name) => { delete store[name]; },
  };
  return store;
}

const QUEUE = 'musicsite.queue';
const REPEAT = 'musicsite.repeat';
const item = (id) => ({ videoId: id, title: id, channel: 'c', thumbnail: '' });

test.afterEach(() => {
  // Trả lại như cũ để test khác không bị ảnh hưởng.
  if (realLocalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = realLocalStorage;
});

test('loadQueue: chưa có dữ liệu (null) -> danh sách rỗng', () => {
  mockStorage();
  assert.deepEqual(loadQueue(), { items: [], currentIndex: -1 });
});

test('loadQueue: JSON hỏng -> danh sách rỗng, không ném lỗi', () => {
  mockStorage({ [QUEUE]: '{khong phai json' });
  assert.deepEqual(loadQueue(), { items: [], currentIndex: -1 });
});

test('loadQueue: JSON là null hoặc kiểu lạ -> danh sách rỗng', () => {
  for (const raw of ['null', '5', '"abc"', '[]']) {
    mockStorage({ [QUEUE]: raw });
    assert.deepEqual(loadQueue(), { items: [], currentIndex: -1 }, raw);
  }
});

test('loadQueue: đọc đúng bài và chỉ số hợp lệ', () => {
  mockStorage({ [QUEUE]: JSON.stringify({ items: [item('a'), item('b')], currentIndex: 1 }) });
  const result = loadQueue();
  assert.equal(result.items.length, 2);
  assert.equal(result.currentIndex, 1);
});

test('loadQueue: chỉ số ngoài phạm vi hoặc không phải số nguyên -> -1', () => {
  for (const currentIndex of [5, -3, 1.5, 'x', null]) {
    mockStorage({ [QUEUE]: JSON.stringify({ items: [item('a'), item('b')], currentIndex }) });
    assert.equal(loadQueue().currentIndex, -1, String(currentIndex));
  }
});

test('loadQueue: bỏ bài hỏng trước bài đang chọn thì chỉ số vẫn trỏ đúng bài đó', () => {
  const items = [item('a'), { videoId: 'sai id' }, item('c'), item('d')];
  mockStorage({ [QUEUE]: JSON.stringify({ items, currentIndex: 3 }) });
  const result = loadQueue();
  assert.deepEqual(result.items.map((t) => t.videoId), ['a', 'c', 'd']);
  assert.equal(result.items[result.currentIndex].videoId, 'd');
});

test('loadQueue: chính bài đang chọn bị hỏng -> -1', () => {
  mockStorage({ [QUEUE]: JSON.stringify({ items: [item('a'), { videoId: '!' }], currentIndex: 1 }) });
  assert.equal(loadQueue().currentIndex, -1);
});

test('loadQueue: ghi rồi đọc lại cho kết quả giống nhau', () => {
  mockStorage();
  saveQueue({ items: [item('a'), item('b')], currentIndex: 0 });
  assert.equal(loadQueue().items.length, 2);
  assert.equal(loadQueue().currentIndex, 0);
});

test('loadRepeat: chế độ hợp lệ giữ nguyên; null hoặc lạ -> off', () => {
  mockStorage({ [REPEAT]: 'all' });
  assert.equal(loadRepeat(), 'all');
  mockStorage();
  assert.equal(loadRepeat(), 'off');
  mockStorage({ [REPEAT]: 'xyz' });
  assert.equal(loadRepeat(), 'off');
});

test('localStorage ném lỗi (bị chặn) -> vẫn trả giá trị mặc định', () => {
  globalThis.localStorage = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
    removeItem: () => { throw new Error('blocked'); },
  };
  assert.deepEqual(loadQueue(), { items: [], currentIndex: -1 });
  assert.equal(loadRepeat(), 'off');
});
