import { and, asc, eq, gte, lt, ne } from "drizzle-orm";
import { getDb } from "../db";
import { articles, dailyBriefs, sources } from "../db/schema";
import { generateDailyBrief, type AiSettings, type GeneratedDailyBrief } from "./ai";
import { ensureDatabase } from "./bootstrap";
import { buildReadingPath, type ReadingPathArticle } from "./reading-path";

export type DailyIssueSection = {
  id: "technology" | "work" | "language-books" | "culture" | "other";
  title: string;
  articles: Array<{ id: string; title: string; source: string }>;
};

const SECTION_META: Array<Pick<DailyIssueSection, "id" | "title">> = [
  { id: "technology", title: "科技与产品" },
  { id: "work", title: "工作与方法" },
  { id: "language-books", title: "语言、阅读与书" },
  { id: "culture", title: "文化与社会" },
  { id: "other", title: "值得一看的其他内容" },
];

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

function sectionFor(article: ReadingPathArticle): DailyIssueSection["id"] {
  const text = `${article.title} ${article.content?.slice(0, 700) ?? ""}`.toLowerCase();
  if (/(ai|artificial intelligence|openai|anthropic|deepseek|大模型|人工智能|chatgpt|模型|apple|iphone|ipad|mac|android|google|microsoft|windows|chip|芯片|手机|硬件)/i.test(text)) return "technology";
  if (/(work|career|business|company|productivity|创业|工作|效率|职场)/i.test(text)) return "work";
  if (/(book|read|author|novel|writing|language|grammar|词|语言|阅读|写作|文学)/i.test(text)) return "language-books";
  if (/(design|art|culture|music|film|电影|设计|文化|艺术|社会)/i.test(text)) return "culture";
  return "other";
}

function makeSections(
  selected: ReadingPathArticle[],
  sourceNames: Map<string, string>,
  translatedTitles: Map<string, string>,
): DailyIssueSection[] {
  const grouped = new Map<DailyIssueSection["id"], DailyIssueSection["articles"]>();
  for (const article of selected) {
    const id = sectionFor(article);
    const entries = grouped.get(id) ?? [];
    entries.push({ id: article.id, title: translatedTitles.get(article.id) ?? article.title, source: article.sourceId ? sourceNames.get(article.sourceId) ?? "RSS" : "Saved page" });
    grouped.set(id, entries);
  }
  return SECTION_META
    .map((section) => ({ ...section, articles: grouped.get(section.id) ?? [] }))
    .filter((section) => section.articles.length > 0);
}

function fallbackBrief(selected: ReadingPathArticle[]): GeneratedDailyBrief {
  return {
    summary: selected.length
      ? "- 本期日报已按你的阅读路径完成整理。模型摘要暂不可用，仍可从下面的栏目开始阅读。"
      : "- 过去 24 小时没有新的候选文章。",
    keyInsights: [],
    recommendations: selected.slice(0, 5).map((article) => ({ text: `- 值得打开：${article.title}`, articleIds: [article.id] })),
    titleTranslations: [],
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
  const sections = makeSections(selected, sourceNames, new Map(generated.titleTranslations.map((item) => [item.articleId, item.titleZh])));

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
