import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { articles, books, bookTags, tags } from "../../../../db/schema";
import { ensureDatabase } from "../../../../lib/bootstrap";
import { generateBookAnalysis, type AiSettings } from "../../../../lib/ai";
import { toRouteErrorMessage } from "../../../../lib/route-errors";

function cleanText(value: string | undefined) { return value?.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim() || null; }
function normalizeAuthor(value: string | undefined) { const cleaned = cleanText(value)?.replace(/^[\s:：]+/, "").replace(/\[[^\]]*\]/g, "").replace(/【[^】]*】/g, "").replace(/\s+/g, " ").trim(); if (!cleaned) return null; const parts = cleaned.split(/\s*[\/／;；]\s*/).filter(Boolean); const latinPart = parts.find((part) => /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(part)); if (!latinPart) return parts[0] ?? null; const parenthesized = latinPart.match(/[（(]([^）)]*[A-Za-zÀ-ÖØ-öø-ÿ][^）)]*)[）)]/); if (parenthesized) return parenthesized[1].trim(); return latinPart.match(/[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ .,'’\-]*/)?.[0]?.trim() || latinPart.trim(); }
function descriptionText(value: string | undefined) { return value?.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() || null; }
function doubanHeaders() { return { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36", accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", referer: "https://book.douban.com/" }; }
function doubanDetails(html: string) {
  const info = html.match(/<div id=["']info["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "";
  const label = (name: string) => cleanText(info.match(new RegExp(`${name}[^<]*<\\/span>\\s*([^<]*(?:<a[^>]*>[^<]*<\\/a>[^<]*)*)`, "i"))?.[1]);
  const reportStart = html.search(/<div\b[^>]*\bid=["']link-report["'][^>]*>/i);
  const intros = Array.from((reportStart >= 0 ? html.slice(reportStart) : "").matchAll(/<div\b[^>]*\bclass=["'][^"']*\bintro\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi));
  return {
    title: cleanText(html.match(/<span[^>]+property=["']v:itemreviewed["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]),
    author: normalizeAuthor(label("作者") ?? label("译者") ?? undefined), description: descriptionText((intros[1] ?? intros[0])?.[1]),
    coverUrl: html.match(/<a[^>]+class=["'][^"']*\bnbg\b[^"']*["'][^>]+href=["']([^"']+)["']/i)?.[1] ?? null,
    subjects: Array.from(html.matchAll(/<a[^>]+class=["'][^"']*\btag\b[^"']*["'][^>]*>([^<]+)<\/a>/gi)).map((match) => cleanText(match[1])).filter(Boolean).slice(0, 12).join(", ") || null,
    isbn: label("ISBN"), publishedYear: label("出版年"),
  };
}
function normalizeTag(name: string) { return name.trim().toLocaleLowerCase().replace(/\s+/g, " ").replace(/[，、。；：]/g, ""); }
function savedTags(value: string | null) { try { return value ? JSON.parse(value) as string[] : []; } catch { return []; } }

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
    await ensureDatabase(); const { id } = await context.params; const payload = (await request.json()) as { status?: string; statusChangedAt?: number; personalRating?: number | null; refreshMetadata?: boolean };
    const db = getDb(); const [existing] = await db.select().from(books).where(eq(books.id, id)).limit(1);
    if (!existing) return Response.json({ error: "Book not found" }, { status: 404 });
    if (payload.refreshMetadata) {
      const metadata = await refreshBookMetadata(existing);
      const [book] = await db.update(books).set({ ...metadata, title: metadata.title || existing.title, updatedAt: Date.now() }).where(eq(books.id, id)).returning();
      return Response.json({ book });
    }
    if ("personalRating" in payload) {
      if (payload.personalRating !== null && (!Number.isInteger(payload.personalRating) || payload.personalRating < 1 || payload.personalRating > 5)) return Response.json({ error: "Rating must be from 1 to 5" }, { status: 400 });
      const [book] = await db.update(books).set({ personalRating: payload.personalRating, updatedAt: Date.now() }).where(eq(books.id, id)).returning();
      return Response.json({ book });
    }
    if ("statusChangedAt" in payload) {
      if (!Number.isFinite(payload.statusChangedAt) || (payload.statusChangedAt ?? 0) <= 0) return Response.json({ error: "Invalid status change date" }, { status: 400 });
      const [book] = await db.update(books).set({ statusChangedAt: Math.round(payload.statusChangedAt!), updatedAt: Date.now() }).where(eq(books.id, id)).returning();
      return Response.json({ book });
    }
    if (!["read", "reading", "to_read"].includes(payload.status ?? "")) return Response.json({ error: "Invalid status" }, { status: 400 });
    const now = Date.now();
    const [book] = await db.update(books).set({ status: payload.status!, statusChangedAt: now, updatedAt: now }).where(eq(books.id, id)).returning();
    return Response.json({ book });
  } catch (error) { return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 }); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureDatabase(); const { id } = await context.params; const payload = (await request.json()) as AiSettings & { includeFitness?: boolean }; const { includeFitness = true, ...settings } = payload;
    const db = getDb(); const [book] = await db.select().from(books).where(eq(books.id, id)).limit(1);
    if (!book) return Response.json({ error: "Book not found" }, { status: 404 });
    const [historyBooks, historyArticles] = await Promise.all([db.select().from(books).limit(80), db.select().from(articles).limit(100)]);
    let existingTags = await db.select().from(tags).limit(300);
    for (const historyBook of historyBooks) {
      for (const savedTag of savedTags(historyBook.aiTags)) {
        const normalizedName = normalizeTag(savedTag);
        if (!normalizedName) continue;
        let tag = existingTags.find((item) => item.normalizedName === normalizedName);
        if (!tag) {
          const [created] = await db.insert(tags).values({ id: crypto.randomUUID(), name: savedTag.trim(), normalizedName, createdAt: Date.now() }).returning();
          tag = created; existingTags = [...existingTags, created];
        }
        await db.insert(bookTags).values({ bookId: historyBook.id, tagId: tag.id, createdAt: Date.now() }).onConflictDoNothing();
      }
    }
    const result = await generateBookAnalysis(book, { books: historyBooks.filter((item) => item.id !== id).map((item) => ({ id: item.id, title: item.title, author: item.author, status: item.status, description: item.description, personalRating: item.personalRating, tags: item.aiTags ?? item.subjects })), articles: historyArticles.map((item) => ({ id: item.id, title: item.title, status: item.status, description: item.content?.replace(/<[^>]*>/g, " ").slice(0, 700) ?? null })), tagLibrary: existingTags.map((tag) => tag.name) }, settings);
    const resolved = [] as Array<{ id: string; name: string; normalizedName: string }>;
    for (const requestedTag of result.tags) {
      const normalizedName = normalizeTag(requestedTag);
      if (!normalizedName || resolved.some((tag) => tag.normalizedName === normalizedName)) continue;
      let tag = existingTags.find((item) => item.normalizedName === normalizedName);
      if (!tag) {
        const [created] = await db.insert(tags).values({ id: crypto.randomUUID(), name: requestedTag.trim(), normalizedName, createdAt: Date.now() }).returning();
        tag = created;
      }
      resolved.push(tag);
    }
    await db.delete(bookTags).where(eq(bookTags.bookId, id));
    for (const tag of resolved) await db.insert(bookTags).values({ bookId: id, tagId: tag.id, createdAt: Date.now() });
    const [updated] = await db.update(books).set({
      aiTags: JSON.stringify(resolved.map((tag) => tag.name)),
      interestScore: includeFitness ? result.interestScore : book.interestScore,
      analysis: includeFitness ? result.analysis : book.analysis,
      connections: includeFitness ? JSON.stringify(result.connections) : book.connections,
      updatedAt: Date.now(),
    }).where(eq(books.id, id)).returning();
    return Response.json({ book: updated });
  } catch (error) { return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 }); }
}
