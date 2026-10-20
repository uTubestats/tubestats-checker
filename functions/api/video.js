
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60",
      "X-Content-Type-Options": "nosniff",
    },
  });

const num = (v) =>
  v == null || v === "" || Number.isNaN(Number(v))
    ? null
    : Number(v);

function extractPlayerResponse(html) {
  const marker = "ytInitialPlayerResponse";
  const start = html.indexOf(marker);
  if (start < 0) return null;

  const equals = html.indexOf("=", start + marker.length);
  const open = html.indexOf("{", equals + 1);
  if (equals < 0 || open < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = open; i < html.length; i++) {
    const c = html[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }

    if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(open, i + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

export async function onRequestGet({ request }) {
  const id = new URL(request.url).searchParams.get("id") || "";

  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) {
    return json({ error: "invalid_id" }, 400);
  }

  let response;

  try {
    response = await fetch(
      `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
      }
    );
  } catch {
    return json({ error: "upstream" }, 502);
  }

  if (!response.ok) {
    return json({ error: "unavailable" }, 502);
  }

  const html = await response.text();
  const player = extractPlayerResponse(html);
  const details = player?.videoDetails;
  const micro = player?.microformat?.playerMicroformatRenderer;

  if (!details || details.videoId !== id) {
    return json({
      error: "unavailable",
      message: "YouTube did not provide readable public video data.",
    }, 502);
  }

  const text = (html.match(/"label"\s*:\s*"[^"]*(?:like|likes)[^"]*"/i) || [])[0];
  let likeCount = null;

  if (text) {
    const match = text.match(/"label"\s*:\s*"([\d,.]+)\s*likes?"/i);
    if (match) likeCount = num(match[1].replace(/,/g, ""));
  }

  return json({
    id,
    title: details.title || "Untitled video",
    channelTitle: details.author || "Unknown channel",
    channelId: details.channelId || null,
    publishedAt: micro?.publishDate || micro?.uploadDate || null,
    thumbnail:
      details.thumbnail?.thumbnails?.slice(-1)[0]?.url || null,
    viewCount: num(details.viewCount),
    likeCount,
    commentCount: null,
    shareCount: null,
    category: micro?.category || null,
    fetchedAt: new Date().toISOString(),
  });
}
