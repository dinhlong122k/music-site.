// playlist.js - GET /api/playlist?id=PLAYLIST_ID : tải bài trong playlist YouTube qua Piped/Invidious.
//
// Trang đầu lấy từ instance trả lời nhanh nhất; các trang sau phải gọi tiếp trên ĐÚNG instance đó:
//   - Piped: nextpage token  (/nextpage/playlists/ID?nextpage=...)
//   - Invidious: số trang    (/api/v1/playlists/ID?page=N)
import {
  upstreamTry, upstreamFailed, fetchFrom, mapStreamList, mapInvidiousVideos, json,
} from './_piped.js';

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const MAX_TRACKS = 500; // Giới hạn do người xây chọn.
const MAX_PAGES = 10;   // Chặn vòng lặp phân trang.

async function morePiped(base, id, firstNext, items) {
  let next = firstNext;
  for (let page = 1; next && items.length < MAX_TRACKS && page < MAX_PAGES; page += 1) {
    let more;
    try {
      more = await fetchFrom(base, `/nextpage/playlists/${id}?nextpage=${encodeURIComponent(next)}`);
    } catch {
      break; // Trang kế hỏng: dừng, trả những gì đã có.
    }
    items.push(...mapStreamList(more && more.relatedStreams));
    next = more && typeof more.nextpage === 'string' ? more.nextpage : null;
  }
  return Boolean(next); // còn trang chưa tải => truncated
}

async function moreInvidious(base, id, items) {
  const seen = new Set(items.map((t) => t.videoId));
  for (let page = 2; items.length < MAX_TRACKS && page <= MAX_PAGES; page += 1) {
    let more;
    try {
      more = await fetchFrom(base, `/api/v1/playlists/${id}?page=${page}`);
    } catch {
      return false; // Trang kế hỏng: dừng, trả những gì đã có.
    }
    // Một số instance lặp lại bài của trang trước => lọc trùng; không có bài mới là hết.
    const fresh = mapInvidiousVideos(more && more.videos).filter((t) => !seen.has(t.videoId));
    if (fresh.length === 0) return false;
    fresh.forEach((t) => seen.add(t.videoId));
    items.push(...fresh);
  }
  return true; // dừng vì chạm MAX_TRACKS/MAX_PAGES => có thể còn bài chưa tải
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const rawId = url.searchParams.get('id');

  if (!rawId || !ID_PATTERN.test(rawId)) {
    return json({ error: 'bad_id' }, 400);
  }

  const id = encodeURIComponent(rawId);
  try {
    const { result, provider } = await upstreamTry(
      context.env,
      { piped: `/playlists/${id}`, invidious: `/api/v1/playlists/${id}` },
      {
        piped: (data) => (data && Array.isArray(data.relatedStreams)
          ? {
            items: mapStreamList(data.relatedStreams),
            next: typeof data.nextpage === 'string' ? data.nextpage : null,
          }
          : null),
        invidious: (data) => (data && Array.isArray(data.videos)
          ? { items: mapInvidiousVideos(data.videos) }
          : null),
      },
    );

    const items = result.items;
    const truncated = provider.type === 'piped'
      ? await morePiped(provider.base, id, result.next, items)
      : (items.length > 0 && await moreInvidious(provider.base, id, items));

    return json({ source: provider.base, items: items.slice(0, MAX_TRACKS), truncated });
  } catch (err) {
    return upstreamFailed(err);
  }
}
