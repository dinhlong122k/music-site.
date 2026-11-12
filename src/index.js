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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const handler = ROUTES[url.pathname];

    if (handler) {
      if (request.method !== 'GET') {
        return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET' } });
      }
      // Pages Functions context: các handler chỉ đọc request và env.
      return handler({ request, env });
    }

    // Không phải /api/* → để static assets xử lý (index.html, css, js).
    return env.ASSETS.fetch(request);
  },
};
