// proxy.js - GET /api/proxy?url=... : truyền tải luồng âm thanh qua domain của chính mình.
//
// Đây là chỗ vượt tường lửa: trình duyệt tải nhạc từ /api/proxy (cùng domain với trang),
// không phải từ googlevideo.com. Hỗ trợ header Range để tua (seek) mượt mà.
//
// AN TOÀN: chỉ proxy tới host trong danh sách cho phép (googlevideo / pipedproxy / instance Piped),
// nếu không đây sẽ thành "proxy mở" cho kẻ xấu mượn domain của bạn.
import { buildProxyHostMatcher, UA } from './_piped.js';

const PASS_THROUGH = ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges'];

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const target = url.searchParams.get('url');
  if (!target) return new Response('Missing target URL', { status: 400 });

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return new Response('Invalid target URL', { status: 400 });
  }
  if (parsed.protocol !== 'https:') return new Response('Only https is allowed', { status: 400 });

  const isAllowed = buildProxyHostMatcher(context.env);
  if (!isAllowed(parsed.hostname)) return new Response('Host not allowed', { status: 403 });

  // Chuyển tiếp Range để trình phát HTML5 tua được và không tràn bộ nhớ worker.
  const forward = new Headers();
  const range = context.request.headers.get('Range');
  if (range) forward.set('Range', range);
  forward.set('User-Agent', UA);

  let upstream;
  try {
    upstream = await fetch(parsed.toString(), { method: 'GET', headers: forward });
  } catch (err) {
    return new Response('Upstream fetch error: ' + err.message, { status: 502 });
  }

  const headers = new Headers();
  for (const key of PASS_THROUGH) {
    if (upstream.headers.has(key)) headers.set(key, upstream.headers.get(key));
  }
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'audio/mp4');
  headers.set('Cache-Control', 'no-store');

  // Truyền thẳng body (streaming, không buffer cả bài). status 200 hoặc 206 Partial Content.
  return new Response(upstream.body, { status: upstream.status, headers });
}
