// search.js - GET /api/search?q=... : tìm bài hát qua Piped/Invidious, trả danh sách đã chuẩn hoá.
import {
  upstreamTry, upstreamFailed, mapStreamList, mapInvidiousVideos, json,
} from './_piped.js';

const MAX_RESULTS = 20;

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const query = url.searchParams.get('q');

  if (!query || !query.trim()) {
    return json({ error: 'missing_query' }, 400);
  }

  const q = encodeURIComponent(query.trim());
  try {
    const { result, provider } = await upstreamTry(
      context.env,
      {
        piped: `/search?q=${q}&filter=music_songs`,
        invidious: `/api/v1/search?q=${q}&type=video`,
      },
      {
        // Sai cấu trúc (không phải mảng) => coi instance đó hỏng. Mảng rỗng vẫn hợp lệ.
        piped: (data) => (data && Array.isArray(data.items) ? mapStreamList(data.items) : null),
        invidious: (data) => (Array.isArray(data) ? mapInvidiousVideos(data) : null),
      },
    );
    return json({ source: provider.base, items: result.slice(0, MAX_RESULTS) });
  } catch (err) {
    return upstreamFailed(err);
  }
}
