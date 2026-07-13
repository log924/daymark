import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { articles, dailyBriefs, sources } from "../../../../db/schema";
import { generateDailyBrief, DeepSeekModel } from "../../../../lib/ai";
import { ensureDatabase } from "../../../../lib/bootstrap";
import { parseFeed } from "../../../../lib/rss";
import { toRouteErrorMessage } from "../../../../lib/route-errors";

const models: DeepSeekModel[] = ["deepseek-v4-flash", "deepseek-v4-pro", "deepseek-chat", "deepseek-reasoner"];

export async function POST(request: Request) {
  try {
    await ensureDatabase();
    const payload = await request.json().catch(() => ({})) as { apiKey?: string; model?: DeepSeekModel };
    const db = getDb();
    const sourceRows = await db.select().from(sources);
    const newArticles: Array<{ id: string; title: string; source: string; content: string | null }> = [];
    const failures: string[] = [];

    await Promise.all(sourceRows.map(async (source) => {
      try {
        const response = await fetch(source.url, { signal: AbortSignal.timeout(12_000), headers: { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml", "user-agent": "Daymark personal reading hub" } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const feed = parseFeed(await response.text(), source.url);
        for (const item of feed.items) {
          const [existing] = await db.select({ id: articles.id }).from(articles).where(eq(articles.canonicalUrl, item.url)).limit(1);
          if (existing) continue;
          const article = { id: crypto.randomUUID(), sourceId: source.id, title: item.title, canonicalUrl: item.url, content: item.content, publishedAt: item.publishedAt, savedAt: null, status: "new" };
          await db.insert(articles).values(article);
          newArticles.push({ id: article.id, title: article.title, source: source.name, content: article.content?.slice(0, 1_500) ?? null });
        }
        if (feed.title && feed.title !== source.name) await db.update(sources).set({ name: feed.title }).where(eq(sources.id, source.id));
      } catch (error) { failures.push(`${source.name}: ${error instanceof Error ? error.message : "refresh failed"}`); }
    }));
    if (!newArticles.length) return Response.json({ created: 0, failures, brief: null });
    // RSS feeds can publish hundreds of items at once. This keeps a manual
    // refresh responsive while still giving DeepSeek a broad enough sample to
    // identify the new themes and the articles worth opening.
    const briefInput = newArticles.slice(0, 80);
    const generated = await generateDailyBrief(briefInput, { apiKey: payload.apiKey, model: models.includes(payload.model as DeepSeekModel) ? payload.model as DeepSeekModel : "deepseek-v4-flash" });
    const articleIds = [...new Set([
      ...generated.keyInsights.flatMap((item) => item.articleIds),
      ...generated.recommendations.flatMap((item) => item.articleIds),
    ])];
    const [brief] = await db.insert(dailyBriefs).values({ id: crypto.randomUUID(), summary: generated.summary, keyInsights: JSON.stringify(generated.keyInsights), recommendations: JSON.stringify(generated.recommendations), articleIds: JSON.stringify(articleIds), createdAt: Date.now() }).returning();
    return Response.json({ created: newArticles.length, failures, brief });
  } catch (error) {
    console.error("Daily brief refresh failed", error);
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
