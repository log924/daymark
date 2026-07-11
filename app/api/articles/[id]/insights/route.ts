import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { articleInsights, articles } from "../../../../../db/schema";
import { DeepSeekModel, generateArticleInsight } from "../../../../../lib/ai";
import { extractArticle } from "../../../../../lib/article-extraction";
import { ensureDatabase } from "../../../../../lib/bootstrap";
import { toRouteErrorMessage } from "../../../../../lib/route-errors";

type Params = {
  params: Promise<{ id: string }>;
};

const models: DeepSeekModel[] = [
  "deepseek-v4-flash",
  "deepseek-v4-pro",
  "deepseek-chat",
  "deepseek-reasoner",
];

async function findLatestInsight(articleId: string, provider?: string) {
  const db = getDb();
  const query = db
    .select()
    .from(articleInsights)
    .where(
      provider
        ? and(eq(articleInsights.articleId, articleId), eq(articleInsights.provider, provider))
        : eq(articleInsights.articleId, articleId),
    )
    .orderBy(desc(articleInsights.createdAt))
    .limit(1);
  const [insight] = await query;

  return insight ?? null;
}

export async function GET(_request: Request, context: Params) {
  try {
    await ensureDatabase();
    const { id } = await context.params;
    const insight = await findLatestInsight(id);

    return Response.json({ insight });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request, context: Params) {
  try {
    await ensureDatabase();
    const { id } = await context.params;
    const payload = (await request.json().catch(() => ({}))) as {
      apiKey?: string;
      model?: DeepSeekModel;
      force?: boolean;
    };
    const model = models.includes(payload.model as DeepSeekModel)
      ? (payload.model as DeepSeekModel)
      : "deepseek-v4-flash";
    // Version the provider cache key so prior RSS-preview insights are never
    // mistaken for results generated from the extracted original article.
    const provider = `deepseek:${model}:defuddle-v2-outline`;

    if (!payload.apiKey?.trim()) {
      return Response.json({ error: "DeepSeek API key is required" }, { status: 400 });
    }

    const db = getDb();
    const cached = await findLatestInsight(id, provider);

    if (cached && !payload.force) {
      return Response.json({ insight: cached, cached: true });
    }

    const [article] = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
    if (!article) {
      return Response.json({ error: "article not found" }, { status: 404 });
    }

    const extracted = await extractArticle(article.canonicalUrl);
    const generated = await generateArticleInsight(
      {
        title: extracted.title || article.title,
        url: article.canonicalUrl,
        content: extracted.content,
        truncated: extracted.truncated,
      },
      { apiKey: payload.apiKey, model },
    );

    const [insight] = await db
      .insert(articleInsights)
      .values({
        id: crypto.randomUUID(),
        articleId: article.id,
        provider,
        summary: generated.summary,
        translationZh: null,
        score: generated.score,
        createdAt: Date.now(),
      })
      .returning();

    return Response.json({ insight, cached: false }, { status: 201 });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
