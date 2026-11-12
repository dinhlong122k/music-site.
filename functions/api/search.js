// search.js - GET /api/search?q=... : tìm bài hát qua Piped, trả danh sách đã chuẩn hoá.
import { pipedGetJson, mapStreamList, json } from './_piped.js';

const MAX_RESULTS = 20;

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const query = url.searchParams.get('q');

  if (!query || !query.trim()) {
    return json({ error: 'missing_query' }, 400);
  }

  try {
    const path = `/search?q=${encodeURIComponent(query.trim())}&filter=music_songs`;
    const data = await pipedGetJson(context.env, path);
    return json({ items: mapStreamList(data && data.items).slice(0, MAX_RESULTS) });
  } catch {
    return json({ error: 'upstream_failed' }, 502);
  }
}
