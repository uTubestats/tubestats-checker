// Cloudflare Pages Function: GET /api/video?id=VIDEO_ID
// The API key lives in the YOUTUBE_API_KEY secret and never reaches the browser.
const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', ...extra },
  });

const num = (v) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

export async function onRequestGet({ request, env }) {
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return json({ error: 'invalid_id' }, 400);
  if (!env.YOUTUBE_API_KEY) return json({ error: 'not_configured' }, 500);

  const api = new URL('https://www.googleapis.com/youtube/v3/videos');
  api.searchParams.set('part', 'snippet,statistics');
  api.searchParams.set('id', id);
  api.searchParams.set('fields', 'items(id,snippet(title,channelId,channelTitle,publishedAt,thumbnails),statistics(viewCount,likeCount,commentCount))');
  api.searchParams.set('key', env.YOUTUBE_API_KEY);

  let res;
  try {
    // Edge-cache upstream responses for 5 minutes to save API quota.
    res = await fetch(api.toString(), { cf: { cacheTtl: 300, cacheEverything: true } });
  } catch {
    return json({ error: 'upstream' }, 502);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const reason = body?.error?.errors?.[0]?.reason || '';
    if (['quotaExceeded', 'rateLimitExceeded', 'dailyLimitExceeded'].includes(reason)) return json({ error: 'quota' }, 429);
    if (['keyInvalid', 'accessNotConfigured', 'ipRefererBlocked', 'forbidden'].includes(reason) || res.status === 400) return json({ error: 'not_configured' }, 500);
    return json({ error: 'upstream' }, 502);
  }

  const data = await res.json().catch(() => null);
  const item = data?.items?.[0];
  if (!item) return json({ error: 'not_found' }, 404);

  const t = item.snippet?.thumbnails || {};
  const thumb = (t.maxres || t.standard || t.high || t.medium || t.default || {}).url || null;
  const s = item.statistics || {};
  return json(
    {
      id: item.id,
      title: item.snippet?.title || 'Untitled video',
      channelTitle: item.snippet?.channelTitle || 'Unknown channel',
      channelId: item.snippet?.channelId || null,
      publishedAt: item.snippet?.publishedAt || null,
      thumbnail: thumb,
      viewCount: num(s.viewCount),
      likeCount: num(s.likeCount),     // null when hidden or not returned
      commentCount: num(s.commentCount), // null when comments are disabled
      fetchedAt: new Date().toISOString(),
    },
    200,
    { 'Cache-Control': 'public, max-age=60' }
  );
}
