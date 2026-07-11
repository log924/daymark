import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { articles, sources } from "../../../db/schema";
import { ensureDatabase } from "../../../lib/bootstrap";
import { toRouteErrorMessage } from "../../../lib/route-errors";

export async function GET() {
  try {
    await ensureDatabase();
    const db = getDb();
    const [sourceRows, articleRows] = await Promise.all([
      db.select().from(sources).orderBy(asc(sources.name)),
      db.select({ sourceId: articles.sourceId }).from(articles),
    ]);

    const counts = articleRows.reduce<Record<string, number>>((accumulator, article) => {
      if (article.sourceId) {
        accumulator[article.sourceId] = (accumulator[article.sourceId] ?? 0) + 1;
      }
      return accumulator;
    }, {});

    return Response.json({
      sources: sourceRows.map((source) => ({
        ...source,
        articleCount: counts[source.id] ?? 0,
      })),
    });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureDatabase();
    const payload = (await request.json()) as {
      name?: string;
      url?: string;
      kind?: string;
    };

    const rawUrl = payload.url?.trim() ?? "";
    const kind = payload.kind?.trim() || "rss";

    if (!rawUrl) {
      return Response.json({ error: "url is required" }, { status: 400 });
    }

    let url: string;
    try {
      url = new URL(rawUrl).toString();
    } catch {
      return Response.json({ error: "url must be a valid URL" }, { status: 400 });
    }

    const db = getDb();
    const existing = await db.select().from(sources).where(eq(sources.url, url)).limit(1);
    if (existing[0]) {
      return Response.json({ source: existing[0], created: false });
    }

    const name = payload.name?.trim() || new URL(url).hostname.replace(/^www\./, "");
    const [source] = await db
      .insert(sources)
      .values({
        id: crypto.randomUUID(),
        name,
        url,
        kind,
        createdAt: Date.now(),
      })
      .returning();

    return Response.json({ source, created: true }, { status: 201 });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
