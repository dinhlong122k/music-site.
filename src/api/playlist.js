// playlist.js - GET /api/playlist?id=PLAYLIST_ID : tải bài trong playlist YouTube qua Piped.
//
// Phân trang bằng nextpage token: phải gọi tiếp trên ĐÚNG instance đã trả token (pipedFrom).
import { pipedTry, pipedFrom, mapStreamList, json } from './_piped.js';

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const MAX_TRACKS = 500; // Giới hạn do người xây chọn.
const MAX_PAGES = 10;   // Chặn vòng lặp phân trang.

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');

  if (!id || !ID_PATTERN.test(id)) {
    return json({ error: 'bad_id' }, 400);
  }

  try {
    const { data, base } = await pipedTry(context.env, `/playlists/${encodeURIComponent(id)}`);
    let items = mapStreamList(data && data.relatedStreams);
    let next = data && typeof data.nextpage === 'string' ? data.nextpage : null;
    let truncated = false;

    for (let page = 1; next && items.length < MAX_TRACKS && page < MAX_PAGES; page += 1) {
      let more;
      try {
        more = await pipedFrom(base, `/nextpage/playlists/${encodeURIComponent(id)}?nextpage=${encodeURIComponent(next)}`);
      } catch {
        break; // Trang kế hỏng: dừng, trả những gì đã có.
      }
      items = items.concat(mapStreamList(more && more.relatedStreams));
      next = more && typeof more.nextpage === 'string' ? more.nextpage : null;
    }

    if (next && items.length >= MAX_TRACKS) truncated = true;
    if (next && items.length < MAX_TRACKS) truncated = true; // còn trang nhưng đã chạm MAX_PAGES

    return json({ items: items.slice(0, MAX_TRACKS), truncated });
  } catch {
    return json({ error: 'upstream_failed' }, 502);
  }
}
