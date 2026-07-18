import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { articles } from "../../../db/schema";
import { ensureDatabase } from "../../../lib/bootstrap";
import { normalizeArticleUrl } from "../../../lib/article-candidates";
import { toRouteErrorMessage } from "../../../lib/route-errors";

export async function GET() {
  try {
    await ensureDatabase();
    const db = getDb();
    const rows = await db
      .select()
      .from(articles)
      .orderBy(desc(articles.publishedAt), desc(articles.savedAt))
      .limit(100);

    return Response.json({ articles: rows });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureDatabase();
    const payload = (await request.json()) as {
      title?: string;
      url?: string;
      content?: string;
    };

    const title = payload.title?.trim() ?? "";
    const rawUrl = payload.url?.trim() ?? "";
    const content = payload.content?.trim() || null;

    if (!title || !rawUrl) {
      return Response.json({ error: "title and url are required" }, { status: 400 });
    }

    let canonicalUrl: string;
    try {
      canonicalUrl = normalizeArticleUrl(rawUrl);
    } catch {
      return Response.json({ error: "url must be a valid URL" }, { status: 400 });
    }

    const db = getDb();
    const existing = await db
      .select()
      .from(articles)
      .where(eq(articles.canonicalUrl, canonicalUrl))
      .limit(1);

    if (existing[0]) {
      return Response.json({ article: existing[0], created: false });
    }

    const now = Date.now();
    const [article] = await db
      .insert(articles)
      .values({
        id: crypto.randomUUID(),
        sourceId: null,
        title,
        canonicalUrl,
        content,
        publishedAt: null,
        importedAt: now,
        savedAt: now,
        status: "saved",
      })
      .returning();

    return Response.json({ article, created: true }, { status: 201 });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
