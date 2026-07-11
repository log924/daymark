export type ParsedFeedItem = {
  title: string;
  url: string;
  content: string | null;
  publishedAt: number | null;
};

export type ParsedFeed = {
  title: string | null;
  items: ParsedFeedItem[];
};

function decodeEntities(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function stripHtml(value: string) {
  return decodeEntities(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " "));
}

function firstTag(xml: string, names: string[]) {
  for (const name of names) {
    const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
    if (match?.[1]) {
      return decodeEntities(match[1]);
    }
  }
  return null;
}

function firstAtomLink(xml: string) {
  const alternate = xml.match(/<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  const any = xml.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  return decodeEntities(alternate?.[1] ?? any?.[1] ?? "");
}

function parseDate(value: string | null) {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function normalizeUrl(url: string, baseUrl: string) {
  try {
    const parsed = new URL(url, baseUrl);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function parseEntry(entryXml: string, baseUrl: string): ParsedFeedItem | null {
  const title = stripHtml(firstTag(entryXml, ["title"]) ?? "Untitled");
  const rawLink = firstTag(entryXml, ["link"]) ?? firstAtomLink(entryXml);
  const url = normalizeUrl(rawLink, baseUrl);

  if (!url) {
    return null;
  }

  const content =
    firstTag(entryXml, ["content:encoded", "content", "summary", "description"]) ?? null;
  const publishedAt = parseDate(firstTag(entryXml, ["pubDate", "published", "updated", "dc:date"]));

  return {
    title,
    url,
    content: content ? stripHtml(content).slice(0, 4000) : null,
    publishedAt,
  };
}

export function parseFeed(xml: string, baseUrl: string): ParsedFeed {
  const title = stripHtml(firstTag(xml, ["title"]) ?? "") || null;
  const rssItems = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0]);
  const atomItems = [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((match) => match[0]);
  const items = [...rssItems, ...atomItems]
    .map((entry) => parseEntry(entry, baseUrl))
    .filter((item): item is ParsedFeedItem => Boolean(item))
    .slice(0, 50);

  return { title, items };
}
