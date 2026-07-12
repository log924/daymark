import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { articles, books } from "../../../../db/schema";
import { ensureDatabase } from "../../../../lib/bootstrap";
import { generateBookAnalysis, type AiSettings } from "../../../../lib/ai";
import { toRouteErrorMessage } from "../../../../lib/route-errors";

function cleanText(value: string | undefined) { return value?.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim() || null; }
function doubanHeaders() { return { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36", accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", referer: "https://book.douban.com/" }; }
function doubanDetails(html: string) {
  const info = html.match(/<div id=["']info["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "";
  const label = (name: string) => cleanText(info.match(new RegExp(`${name}[^<]*<\\/span>\\s*([^<]*(?:<a[^>]*>[^<]*<\\/a>[^<]*)*)`, "i"))?.[1]);
  const reportStart = html.search(/<div\b[^>]*\bid=["']link-report["'][^>]*>/i);
  const intros = Array.from((reportStart >= 0 ? html.slice(reportStart) : "").matchAll(/<div\b[^>]*\bclass=["'][^"']*\bintro\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi));
  return {
    title: cleanText(html.match(/<span[^>]+property=["']v:itemreviewed["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]),
    author: label("作者") ?? label("译者"), description: cleanText((intros[1] ?? intros[0])?.[1]),
    coverUrl: html.match(/<a[^>]+class=["'][^"']*\bnbg\b[^"']*["'][^>]+href=["']([^"']+)["']/i)?.[1] ?? null,
    subjects: Array.from(html.matchAll(/<a[^>]+class=["'][^"']*\btag\b[^"']*["'][^>]*>([^<]+)<\/a>/gi)).map((match) => cleanText(match[1])).filter(Boolean).slice(0, 12).join(", ") || null,
    isbn: label("ISBN"), publishedYear: label("出版年"),
  };
}

async function refreshBookMetadata(book: typeof books.$inferSelect) {
  if (!book.canonicalUrl) throw new Error("This book has no source link to refresh");
  const url = new URL(book.canonicalUrl);
  const response = await fetch(url, { headers: url.hostname === "book.douban.com" ? doubanHeaders() : { "user-agent": "Mozilla/5.0 (compatible; Daymark/1.0)" } });
  if (!response.ok) throw new Error(`Could not read the book page (${response.status})`);
  const html = await response.text();
  if (url.hostname !== "book.douban.com") throw new Error("Metadata refresh is currently available for Douban links");
  return doubanDetails(html);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureDatabase(); const { id } = await context.params; const payload = (await request.json()) as { status?: string; refreshMetadata?: boolean };
    const db = getDb(); const [existing] = await db.select().from(books).where(eq(books.id, id)).limit(1);
    if (!existing) return Response.json({ error: "Book not found" }, { status: 404 });
    if (payload.refreshMetadata) {
      const metadata = await refreshBookMetadata(existing);
      const [book] = await db.update(books).set({ ...metadata, title: metadata.title || existing.title, updatedAt: Date.now() }).where(eq(books.id, id)).returning();
      return Response.json({ book });
    }
    if (!["read", "reading", "to_read"].includes(payload.status ?? "")) return Response.json({ error: "Invalid status" }, { status: 400 });
    const [book] = await db.update(books).set({ status: payload.status!, updatedAt: Date.now() }).where(eq(books.id, id)).returning();
    return Response.json({ book });
  } catch (error) { return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 }); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureDatabase(); const { id } = await context.params; const settings = (await request.json()) as AiSettings;
    const db = getDb(); const [book] = await db.select().from(books).where(eq(books.id, id)).limit(1);
    if (!book) return Response.json({ error: "Book not found" }, { status: 404 });
    const [historyBooks, historyArticles] = await Promise.all([db.select().from(books).limit(80), db.select().from(articles).limit(100)]);
    const result = await generateBookAnalysis(book, { books: historyBooks.filter((item) => item.id !== id).map((item) => ({ id: item.id, title: item.title, author: item.author, status: item.status, description: item.description })), articles: historyArticles.map((item) => ({ id: item.id, title: item.title, status: item.status, description: item.content?.replace(/<[^>]*>/g, " ").slice(0, 700) ?? null })) }, settings);
    const [updated] = await db.update(books).set({ interestScore: result.interestScore, analysis: result.analysis, connections: JSON.stringify(result.connections), updatedAt: Date.now() }).where(eq(books.id, id)).returning();
    return Response.json({ book: updated });
  } catch (error) { return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 }); }
}
