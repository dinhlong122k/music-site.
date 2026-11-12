// stream.js - GET /api/stream?id=VIDEO_ID : lấy luồng âm thanh tốt nhất, trả link đã bọc qua /api/proxy.
//
// Thử cả Piped và Invidious (song song). Lỗi 502 trả kèm `details` từng instance để debug.
import {
  upstreamTry, upstreamFailed, pickBestAudio, pickBestInvidiousAudio, invidiousAudioUrl, json,
} from './_piped.js';

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

const str = (v) => (typeof v === 'string' ? v : '');

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const videoId = url.searchParams.get('id');

  if (!videoId || !ID_PATTERN.test(videoId)) {
    return json({ error: 'bad_id' }, 400);
  }

  const id = encodeURIComponent(videoId);
  try {
    const { result, provider } = await upstreamTry(
      context.env,
      { piped: `/streams/${id}`, invidious: `/api/v1/videos/${id}` },
      {
        piped(data) {
          const best = pickBestAudio(data && data.audioStreams);
          if (!best) return null;
          return { title: str(data.title), uploader: str(data.uploader), src: best.url };
        },
        invidious(data, base) {
          const best = pickBestInvidiousAudio(data && data.adaptiveFormats);
          if (!best) return null;
          return {
            title: str(data.title),
            uploader: str(data.author),
            src: invidiousAudioUrl(base, videoId, best.itag),
          };
        },
      },
    );

    // Bọc URL gốc qua /api/proxy (cùng domain) để trình duyệt chỉ nói chuyện với domain của mình.
    return json({
      source: provider.base,
      title: result.title,
      uploader: result.uploader,
      audioUrl: `/api/proxy?url=${encodeURIComponent(result.src)}`,
    });
  } catch (err) {
    return upstreamFailed(err);
  }
}
