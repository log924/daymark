function isDoubanCover(url: URL) {
  return url.protocol === "https:" && (url.hostname === "doubanio.com" || url.hostname.endsWith(".doubanio.com"));
}

export async function GET(request: Request) {
  const rawUrl = new URL(request.url).searchParams.get("url");
  if (!rawUrl) return Response.json({ error: "Missing cover URL" }, { status: 400 });
  let url: URL;
  try { url = new URL(rawUrl); } catch { return Response.json({ error: "Invalid cover URL" }, { status: 400 }); }
  if (!isDoubanCover(url)) return Response.json({ error: "Unsupported cover host" }, { status: 400 });
  try {
    const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36", accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8", referer: "https://book.douban.com/" } });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.startsWith("image/")) return Response.json({ error: "Douban cover is unavailable" }, { status: 502 });
    return new Response(response.body, { headers: { "content-type": contentType, "cache-control": "public, max-age=86400, s-maxage=604800" } });
  } catch { return Response.json({ error: "Unable to retrieve Douban cover" }, { status: 502 }); }
}
