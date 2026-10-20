
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60",
      "X-Content-Type-Options": "nosniff",
    },
  });

function extractObject(text, key) {
  const patterns = [
    new RegExp(key + "\\s*=\\s*"),
    new RegExp('"' + key + '"\\s*:\\s*'),
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;

    const start = text.indexOf("{", match.index + match[0].length);
    if (start < 0) continue;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i++) {
      const c = text[i];

      if (inString) {
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === '"') inString = false;
        continue;
      }

      if (c === '"') inString = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          break;
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
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
        cf: { cacheTtl: 300 },
      }
    );
  } catch {
    return json({ error: "upstream" }, 502);
  }

  if (!response.ok) {
    return json({ error: "upstream" }, 502);
  }

  const html = await response.text();
  const player = extractObject(html, "ytInitialPlayerResponse");
  const details = player?.videoDetails;

  if (!details || details.videoId !== id) {
    return json({
      error: "unavailable",
      message: "YouTube did not provide readable public video data.",
    }, 502);
  }

  const micro = player?.microformat?.playerMicroformatRenderer;
  const thumbs = details.thumbnail?.thumbnails || [];
  const thumbnail = thumbs.length
    ? thumbs[thumbs.length - 1].url
    : `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

  return json({
    id,
    title: details.title || "Untitled video",
    channelTitle: details.author || "Unknown channel",
    channelId: details.channelId || null,
    publishedAt: micro?.publishDate
      ? new Date(micro.publishDate).toISOString()
      : null,
    thumbnail,
    viewCount: details.viewCount != null
      ? Number(details.viewCount)
      : null,
    likeCount: null,
    commentCount: null,
    fetchedAt: new Date().toISOString(),
  });
    }
  
