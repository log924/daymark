import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { articles, sources } from "../db/schema";
import { ensureDatabase } from "./bootstrap";
import { parseFeed } from "./rss";

export type FeedRefreshResult = {
  created: number;
  skipped: number;
  failures: string[];
};

/**
 * Fetch every source and persist only newly seen entries. This intentionally
 * does not create an AI brief: importing the inbox and publishing an edition
 * are separate operations.
 */
export async function refreshAllSources(): Promise<FeedRefreshResult> {
  await ensureDatabase();
  const db = getDb();
  const sourceRows = await db.select().from(sources);
  const seenCanonicalUrls = new Set<string>();
  const outcomes = await Promise.all(sourceRows.map(async (source) => {
    try {
      const response = await fetch(source.url, {
        signal: AbortSignal.timeout(12_000),
        headers: {
          accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
          "user-agent": "Daymark personal reading hub",
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const feed = parseFeed(await response.text(), source.url);
      const importedAt = Date.now();
      let created = 0;
      let skipped = 0;
      for (const item of feed.items) {
        if (seenCanonicalUrls.has(item.url)) {
          skipped += 1;
          continue;
        }
        seenCanonicalUrls.add(item.url);
        const [existing] = await db.select({ id: articles.id }).from(articles).where(eq(articles.canonicalUrl, item.url)).limit(1);
        if (existing) {
          if (item.content) await db.update(articles).set({ content: item.content }).where(eq(articles.id, existing.id));
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
          importedAt,
          savedAt: null,
          status: "new",
        });
        created += 1;
      }
      if (feed.title && feed.title !== source.name) await db.update(sources).set({ name: feed.title }).where(eq(sources.id, source.id));
      return { created, skipped, failure: null };
    } catch (error) {
      return { created: 0, skipped: 0, failure: `${source.name}: ${error instanceof Error ? error.message : "refresh failed"}` };
    }
  }));

  return outcomes.reduce<FeedRefreshResult>((result, outcome) => ({
    created: result.created + outcome.created,
    skipped: result.skipped + outcome.skipped,
    failures: outcome.failure ? [...result.failures, outcome.failure] : result.failures,
  }), { created: 0, skipped: 0, failures: [] });
}
