// stream.js - GET /api/stream?id=VIDEO_ID : lấy luồng âm thanh tốt nhất, trả link đã bọc qua /api/proxy.
import { pipedGetJson, pickBestAudio, json } from './_piped.js';

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const videoId = url.searchParams.get('id');

  if (!videoId || !ID_PATTERN.test(videoId)) {
    return json({ error: 'bad_id' }, 400);
  }

  try {
    const data = await pipedGetJson(context.env, `/streams/${encodeURIComponent(videoId)}`);
    const best = pickBestAudio(data && data.audioStreams);
    if (!best) return json({ error: 'no_audio' }, 502);

    // Bọc URL gốc qua /api/proxy (cùng domain) để trình duyệt chỉ nói chuyện với *.pages.dev.
    const audioUrl = `/api/proxy?url=${encodeURIComponent(best.url)}`;
    return json({
      title: typeof data.title === 'string' ? data.title : '',
      uploader: typeof data.uploader === 'string' ? data.uploader : '',
      audioUrl,
    });
  } catch {
    return json({ error: 'upstream_failed' }, 502);
  }
}
