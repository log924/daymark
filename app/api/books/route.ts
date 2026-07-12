import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { books } from "../../../db/schema";
import { ensureDatabase } from "../../../lib/bootstrap";
import { toRouteErrorMessage } from "../../../lib/route-errors";

function meta(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"))
    ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "i"));
  return match?.[1]?.replace(/&amp;/g, "&").trim() ?? null;
}

function cleanText(value: string | undefined) {
  return value?.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim() || null;
}

function normalizeAuthor(value: string | undefined) {
  const cleaned = cleanText(value)?.replace(/^[\s:：]+/, "").replace(/\[[^\]]*\]/g, "").replace(/【[^】]*】/g, "").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  const parts = cleaned.split(/\s*[\/／;；]\s*/).filter(Boolean);
  const latinPart = parts.find((part) => /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(part));
  if (!latinPart) return parts[0] ?? null;
  const parenthesized = latinPart.match(/[（(]([^）)]*[A-Za-zÀ-ÖØ-öø-ÿ][^）)]*)[）)]/);
  if (parenthesized) return parenthesized[1].trim();
  const latinName = latinPart.match(/[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ .,'’\-]*/)?.[0]?.trim();
  return latinName || latinPart.trim();
}

function descriptionText(value: string | undefined) {
  return value?.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() || null;
}

function doubanHeaders() {
  return {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    referer: "https://book.douban.com/",
  };
}

function isDoubanUrl(url: URL) {
  return url.hostname === "book.douban.com" && /^\/subject\/\d+\/?$/.test(url.pathname);
}

function doubanDetails(html: string) {
  const info = html.match(/<div id=["']info["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "";
  const label = (name: string) => cleanText(info.match(new RegExp(`${name}[^<]*<\\/span>\\s*([^<]*(?:<a[^>]*>[^<]*<\\/a>[^<]*)*)`, "i"))?.[1]);
  const title = cleanText(html.match(/<span[^>]+property=["']v:itemreviewed["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]);
  const coverUrl = html.match(/<a[^>]+class=["'][^"']*\bnbg\b[^"']*["'][^>]+href=["']([^"']+)["']/i)?.[1] ?? null;
  const reportStart = html.search(/<div\b[^>]*\bid=["']link-report["'][^>]*>/i);
  const report = reportStart >= 0 ? html.slice(reportStart) : "";
  const intros = Array.from(report.matchAll(/<div\b[^>]*\bclass=["'][^"']*\bintro\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi));
  const description = descriptionText((intros[1] ?? intros[0])?.[1]);
  const subjects = Array.from(html.matchAll(/<a[^>]+class=["'][^"']*\btag\b[^"']*["'][^>]*>([^<]+)<\/a>/gi)).map((match) => cleanText(match[1])).filter(Boolean).slice(0, 12).join(", ") || null;
  return { title, author: normalizeAuthor(label("作者") ?? label("译者") ?? undefined), description, coverUrl, subjects, isbn: label("ISBN"), publishedYear: label("出版年") };
}

async function lookup(url: string) {
  const parsed = new URL(url);
  const response = await fetch(url, { headers: isDoubanUrl(parsed) ? doubanHeaders() : { "user-agent": "Mozilla/5.0 (compatible; Daymark/1.0)" } });
  if (!response.ok) throw new Error(`Could not read the book page (${response.status})`);
  const html = await response.text();
  if (isDoubanUrl(parsed)) return doubanDetails(html);
  const title = meta(html, "og:title") ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? null;
  const description = meta(html, "og:description") ?? meta(html, "description");
  const author = meta(html, "books:author") ?? null;
  return { title, description, author, coverUrl: meta(html, "og:image"), subjects: null, isbn: null, publishedYear: null };
}

export async function GET() {
  try {
    await ensureDatabase();
    const rows = await getDb().select().from(books).orderBy(desc(sql`coalesce(${books.statusChangedAt}, ${books.createdAt})`), desc(books.createdAt));
    return Response.json({ books: rows });
  } catch (error) { return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    await ensureDatabase();
    const payload = (await request.json()) as { title?: string; url?: string; status?: string };
    let title = payload.title?.trim() ?? "";
    const rawUrl = payload.url?.trim() ?? "";
    let canonicalUrl: string | null = null;
    let details: Awaited<ReturnType<typeof lookup>> | null = null;
    if (rawUrl) {
      try { const parsed = new URL(rawUrl); parsed.hash = ""; canonicalUrl = parsed.toString(); } catch { return Response.json({ error: "link must be a valid URL" }, { status: 400 }); }
      try { details = await lookup(canonicalUrl); } catch (error) { if (!title) throw error; }
    }
    title ||= details?.title ?? "";
    if (!title) return Response.json({ error: "Enter a book title or a Goodreads/Douban link" }, { status: 400 });
    const db = getDb();
    if (canonicalUrl) {
      const existing = await db.select().from(books).where(eq(books.canonicalUrl, canonicalUrl)).limit(1);
      if (existing[0]) return Response.json({ book: existing[0], created: false });
    }
    const now = Date.now();
    const [book] = await db.insert(books).values({ id: crypto.randomUUID(), title, canonicalUrl, author: details?.author, description: details?.description, coverUrl: details?.coverUrl, subjects: details?.subjects, isbn: details?.isbn, publishedYear: details?.publishedYear, status: ["read", "reading", "to_read"].includes(payload.status ?? "") ? payload.status! : "to_read", statusChangedAt: now, createdAt: now, updatedAt: now }).returning();
    return Response.json({ book, created: true }, { status: 201 });
  } catch (error) { return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 }); }
}
