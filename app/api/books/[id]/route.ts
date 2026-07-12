import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { articles, books } from "../../../../db/schema";
import { ensureDatabase } from "../../../../lib/bootstrap";
import { generateBookAnalysis, type AiSettings } from "../../../../lib/ai";
import { toRouteErrorMessage } from "../../../../lib/route-errors";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureDatabase(); const { id } = await context.params; const payload = (await request.json()) as { status?: string };
    if (!["read", "reading", "to_read"].includes(payload.status ?? "")) return Response.json({ error: "Invalid status" }, { status: 400 });
    const [book] = await getDb().update(books).set({ status: payload.status!, updatedAt: Date.now() }).where(eq(books.id, id)).returning();
    if (!book) return Response.json({ error: "Book not found" }, { status: 404 }); return Response.json({ book });
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
