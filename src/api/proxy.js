// proxy.js - GET /api/proxy?url=... : truyền tải luồng âm thanh qua domain của chính mình.
//
// Đây là chỗ vượt tường lửa: trình duyệt tải nhạc từ /api/proxy (cùng domain với trang),
// không phải từ googlevideo.com. Hỗ trợ header Range để tua (seek) mượt mà.
//
// AN TOÀN: chỉ proxy tới host trong danh sách cho phép (googlevideo / pipedproxy / instance Piped/Invidious),
// nếu không đây sẽ thành "proxy mở" cho kẻ xấu mượn domain của bạn.
import { buildProxyHostMatcher, UA } from './_piped.js';

const PASS_THROUGH = ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges'];
const MAX_REDIRECTS = 3;

function isMediaType(type) {
  return type.startsWith('audio/') || type.startsWith('video/')
    || type.startsWith('application/octet-stream');
}

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

  // Tự theo redirect (Invidious /latest_version trả 302 sang /videoplayback) và kiểm host ở
  // MỖI bước, để kẻ xấu không lách allowlist bằng một redirect sang host lạ.
  let upstream;
  let current = parsed;
  try {
    for (let hop = 0; ; hop += 1) {
      upstream = await fetch(current.toString(), { method: 'GET', headers: forward, redirect: 'manual' });
      const location = upstream.headers.get('Location');
      if (upstream.status < 300 || upstream.status >= 400 || !location) break;
      if (hop >= MAX_REDIRECTS) return new Response('Too many redirects', { status: 502 });
      current = new URL(location, current);
      if (current.protocol !== 'https:' || !isAllowed(current.hostname)) {
        return new Response('Redirect host not allowed', { status: 403 });
      }
    }
  } catch (err) {
    return new Response('Upstream fetch error: ' + err.message, { status: 502 });
  }

  // CHỈ chuyển tiếp nội dung âm thanh/video. Upstream lỗi hay trả trang HTML (trang lỗi của
  // instance, trang chặn...) thì KHÔNG đưa nguyên trang đó ra domain của mình: trang HTML
  // hiện trên domain mình sẽ tự tải tài nguyên ngoài (vd fonts.googleapis.com) và chạy script lạ.
  const upstreamType = (upstream.headers.get('Content-Type') || '').toLowerCase();
  if (upstream.status !== 200 && upstream.status !== 206) {
    return new Response(`Upstream HTTP ${upstream.status}`, { status: 502 });
  }
  if (upstreamType && !isMediaType(upstreamType)) {
    return new Response('Upstream returned non-media content', { status: 502 });
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
