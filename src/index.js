// Cloudflare Worker entry.
//
// Vì sao có file này: Cloudflare build chạy `wrangler deploy` (Workers). Trước đây code dùng
// Pages Functions (thư mục `functions/` + handler onRequestGet), nên `wrangler deploy` báo lỗi
// "functions directory ... looks like a Cloudflare Pages project". Ở đây ta gói mọi thứ thành
// MỘT Worker: phục vụ file tĩnh trong ./public qua binding ASSETS, và định tuyến /api/* tới các
// handler cũ. Các handler chỉ dùng context.request và context.env, nên ta gọi lại với shim
// { request, env } — không phải viết lại logic.
import { onRequestGet as search } from './api/search.js';
import { onRequestGet as playlist } from './api/playlist.js';
import { onRequestGet as stream } from './api/stream.js';
import { onRequestGet as proxy } from './api/proxy.js';

const ROUTES = {
  '/api/search': search,
  '/api/playlist': playlist,
  '/api/stream': stream,
  '/api/proxy': proxy,
};

// CSP gửi bằng HTTP header cho MỌI response (không chỉ thẻ meta trong index.html), để không
// trang nào trên domain này — kể cả trang lỗi — tải được tài nguyên ngoài (fonts.googleapis.com,
// youtube.com...). Tường lửa công ty chỉ cần cho phép đúng domain của site.
const PAGE_CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
  + "media-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; "
  + "form-action 'none'; frame-ancestors 'none'";
// /api/* chỉ trả JSON hoặc âm thanh: cấm mọi thứ, và sandbox nếu lỡ bị mở như một trang.
const API_CSP = "default-src 'none'; frame-ancestors 'none'; sandbox";

export function withSecurityHeaders(response, csp) {
  const res = new Response(response.body, response);
  res.headers.set('Content-Security-Policy', csp);
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'no-referrer');
  return res;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const handler = ROUTES[url.pathname];

    if (handler) {
      if (request.method !== 'GET') {
        return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET' } });
      }
      // Pages Functions context: các handler chỉ đọc request và env.
      return withSecurityHeaders(await handler({ request, env }), API_CSP);
    }

    // Không phải /api/* → để static assets xử lý (index.html, css, js).
    return withSecurityHeaders(await env.ASSETS.fetch(request), PAGE_CSP);
  },
};
