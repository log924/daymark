import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { articles, sources } from "../../../../../db/schema";
import { ensureDatabase } from "../../../../../lib/bootstrap";
import { parseFeed } from "../../../../../lib/rss";
import { toRouteErrorMessage } from "../../../../../lib/route-errors";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: Params) {
  try {
    await ensureDatabase();
    const { id } = await context.params;
    const db = getDb();
    const [source] = await db.select().from(sources).where(eq(sources.id, id)).limit(1);

    if (!source) {
      return Response.json({ error: "source not found" }, { status: 404 });
    }

    const response = await fetch(source.url, {
      headers: {
        accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
        "user-agent": "Daymark personal reading hub",
      },
    });

    if (!response.ok) {
      return Response.json(
        { error: `Feed request failed with ${response.status}` },
        { status: 502 },
      );
    }

    const xml = await response.text();
    const feed = parseFeed(xml, source.url);
    let created = 0;
    let skipped = 0;

    for (const item of feed.items) {
      const existing = await db
        .select({ id: articles.id })
        .from(articles)
        .where(eq(articles.canonicalUrl, item.url))
        .limit(1);

      if (existing[0]) {
        skipped += 1;
        continue;
      }

      await db.insert(articles).values({
        id: crypto.randomUUID(),
        sourceId: source.id,
        title: item.title,
        canonicalUrl: item.url,
        content: item.content,
        publishedAt: item.publishedAt,
        savedAt: null,
        status: "new",
      });
      created += 1;
    }

    if (feed.title && feed.title !== source.name) {
      await db.update(sources).set({ name: feed.title }).where(eq(sources.id, source.id));
    }

    return Response.json({ created, skipped, found: feed.items.length, sourceName: feed.title ?? source.name });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
