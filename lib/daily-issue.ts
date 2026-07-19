import { and, asc, eq, gte, lt, ne } from "drizzle-orm";
import { getDb } from "../db";
import { articles, dailyBriefs, sources } from "../db/schema";
import { generateDailyBrief, type AiSettings, type DailyBriefSection as GeneratedSection, type GeneratedDailyBrief } from "./ai";
import { ensureDatabase } from "./bootstrap";
import { buildReadingPath, type ReadingPathArticle } from "./reading-path";

export type DailyIssueSection = {
  id: string;
  title: string;
  articles: Array<{ id: string; title: string; source: string }>;
};

function beijingIssueDate(timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(timestamp);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

/** The edition closes at 06:00 Beijing time, covering the preceding 24 hours. */
export function dailyIssueWindow(now = Date.now()) {
  const beijingOffset = 8 * 60 * 60 * 1000;
  const editorialHour = 6 * 60 * 60 * 1000;
  const issueEnd = Math.floor((now + beijingOffset - editorialHour) / 86_400_000) * 86_400_000 - beijingOffset + editorialHour;
  return { start: issueEnd - 86_400_000, end: issueEnd, issueDate: beijingIssueDate(issueEnd) };
}

/** A content-based repair when the editorial model is unavailable or incomplete. */
function fallbackTopicFor(article: ReadingPathArticle) {
  const text = `${article.title} ${article.content?.slice(0, 700) ?? ""}`.toLowerCase();
  if (/(book|read|author|novel|writing|language|grammar|词汇|语言学|阅读|写作|文学)/i.test(text)) return { id: "language-reading", title: "语言、阅读与写作" };
  if (/(gym|fitness|tennis|climb|health|sauna|milk|健身|网球|攀岩|体脂|健康|营养)/i.test(text)) return { id: "lifestyle-health", title: "生活方式与健康" };
  if (/(car|vehicle|bike|nas|iphone|ipad|android|pixel|camera|手机|相机|自行车|汽车|悬架|存储)/i.test(text)) return { id: "products-mobility", title: "产品、汽车与出行" };
  if (/(ai|artificial intelligence|openai|anthropic|deepseek|大模型|人工智能|chatgpt|模型|chip|芯片|gpu|英伟达|英特尔)/i.test(text)) return { id: "ai-industry", title: "AI、芯片与科技产业" };
  if (/(ipo|stock|market|consumer sentiment|finance|bank|经济|市场|上市|融资|消费者信心|公司)/i.test(text)) return { id: "business-markets", title: "商业、经济与资本市场" };
  if (/(game|zelda|film|movie|art|culture|music|游戏|塞尔达|电影|艺术|文化)/i.test(text)) return { id: "culture-games", title: "文化、游戏与媒体" };
  if (/(work|career|productivity|创业|工作|效率|职场)/i.test(text)) return { id: "work-methods", title: "工作与方法" };
  return { id: "public-affairs", title: "社会、政策与公共议题" };
}

function makeSections(
  selected: ReadingPathArticle[],
  sourceNames: Map<string, string>,
  translatedTitles: Map<string, string>,
  generatedSections: GeneratedSection[],
): DailyIssueSection[] {
  const articleById = new Map(selected.map((article) => [article.id, article]));
  const entryFor = (article: ReadingPathArticle) => ({ id: article.id, title: translatedTitles.get(article.id) ?? article.title, source: article.sourceId ? sourceNames.get(article.sourceId) ?? "RSS" : "Saved page" });
  const seen = new Set<string>();
  const aiSections = generatedSections.map((section) => ({
    ...section,
    articles: section.articleIds.flatMap((id) => {
      const article = articleById.get(id);
      if (!article || seen.has(id)) return [];
      seen.add(id);
      return [entryFor(article)];
    }),
  })).filter((section) => section.articles.length > 0);
  const repairs = new Map<string, DailyIssueSection>();
  for (const article of selected.filter((item) => !seen.has(item.id))) {
    const topic = fallbackTopicFor(article);
    const section = repairs.get(topic.id) ?? { ...topic, articles: [] };
    section.articles.push(entryFor(article));
    repairs.set(topic.id, section);
  }
  return [...aiSections, ...repairs.values()];
}

function fallbackBrief(selected: ReadingPathArticle[]): GeneratedDailyBrief {
  return {
    summary: selected.length
      ? "- 本期日报已按你的阅读路径完成整理。模型摘要暂不可用，仍可从下面的栏目开始阅读。"
      : "- 过去 24 小时没有新的候选文章。",
    keyInsights: [],
    recommendations: selected.slice(0, 5).map((article) => ({ text: `- 值得打开：${article.title}`, articleIds: [article.id] })),
    titleTranslations: [],
    sections: [],
  };
}

export async function generateDailyIssue(settings: AiSettings, options?: { now?: number }) {
  await ensureDatabase();
  const db = getDb();
  const now = options?.now ?? Date.now();
  const window = dailyIssueWindow(now);
  const [existing] = await db.select().from(dailyBriefs).where(eq(dailyBriefs.issueDate, window.issueDate)).limit(1);
  if (existing) return { brief: existing, created: false, aiFallback: false, window };

  const [articleRows, sourceRows] = await Promise.all([
    db.select().from(articles).where(and(gte(articles.importedAt, window.start), lt(articles.importedAt, window.end))).orderBy(asc(articles.importedAt)),
    db.select().from(sources),
  ]);
  const selected = buildReadingPath(articleRows, sourceRows, 18, window.end).map((item) => item.article);
  const sourceNames = new Map(sourceRows.map((source) => [source.id, source.name]));

  let generated = fallbackBrief(selected);
  let aiFallback = true;
  if (selected.length) {
    try {
      generated = await generateDailyBrief(
        selected.map((article) => ({ id: article.id, title: article.title, source: article.sourceId ? sourceNames.get(article.sourceId) ?? "RSS" : "Saved page", content: article.content?.slice(0, 1_500) ?? null })),
        settings,
      );
      aiFallback = false;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown network error";
      // Local Miniflare can be denied DNS/network access even when the same
      // Worker works in Cloudflare. The deterministic edition is intentional
      // in that case, so keep the dev log useful without dumping a long stack.
      console.warn(`Daily issue AI summary unavailable (${reason}); saved the deterministic edition instead.`);
    }
  }
  const sections = makeSections(selected, sourceNames, new Map(generated.titleTranslations.map((item) => [item.articleId, item.titleZh])), generated.sections);

  const values = {
    summary: generated.summary,
    keyInsights: JSON.stringify(generated.keyInsights),
    recommendations: JSON.stringify(generated.recommendations),
    articleIds: JSON.stringify(selected.map((article) => article.id)),
    issueDate: window.issueDate,
    sections: JSON.stringify(sections),
    createdAt: now,
  };
  const [brief] = await db.insert(dailyBriefs).values({ id: crypto.randomUUID(), ...values }).returning();
  // The product intentionally keeps one current issue rather than an archive.
  await db.delete(dailyBriefs).where(ne(dailyBriefs.id, brief.id));
  return { brief, created: !existing, aiFallback, window };
}
