export type ReadingPathArticle = {
  id: string;
  sourceId: string | null;
  title: string;
  canonicalUrl: string;
  content: string | null;
  publishedAt: number | null;
  savedAt: number | null;
  readAt: number | null;
  status: string;
};

export type ReadingPathSource = { id: string; name: string };
export type ReadingPathItem<T extends ReadingPathArticle> = {
  article: T;
  score: number;
  whyNow: string;
};

const DAY = 24 * 60 * 60 * 1000;

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function titleKey(title: string) {
  return title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]/gu, "")
    .slice(0, 180);
}

/**
 * Deal roundups consume attention but rarely add durable reading value. They
 * remain in the full inbox, yet are ineligible for the curated path and the
 * daily issue. Keep this title-led to avoid rejecting a substantive article
 * merely because its page contains an unrelated advertisement.
 */
export function isPromotionalDeal(article: Pick<ReadingPathArticle, "title">) {
  const title = article.title.normalize("NFKC").toLowerCase();
  return /(?:\b(?:deal|deals|sale|coupon|clearance)\b|\b(?:best|lowest|all-time low|historical low) price\b|\b(?:save|discount)\s+\$|\$\d+(?:\.\d+)?\s+off\b|\b\d{1,3}%\s+off\b|\bprime day\b|\bblack friday\b|历史最低价|史低|好价|优惠券|优惠|折扣|促销|特价|直降|满减|价格新低|限时降价)/i.test(title);
}

function topicFor(article: ReadingPathArticle) {
  const text = `${article.title} ${article.content?.slice(0, 700) ?? ""}`.toLowerCase();
  if (/(ai|artificial intelligence|openai|anthropic|deepseek|大模型|人工智能|chatgpt|模型)/i.test(text)) return "ai";
  if (/(apple|iphone|ipad|mac|android|google|microsoft|windows|chip|芯片|手机|硬件)/i.test(text)) return "technology";
  if (/(book|read|author|novel|writing|language|grammar|词|语言|阅读|写作|文学)/i.test(text)) return "language-and-books";
  if (/(design|art|culture|music|film|电影|设计|文化|艺术)/i.test(text)) return "culture";
  if (/(work|career|business|company|productivity|创业|工作|效率|职场)/i.test(text)) return "work";
  return "other";
}

function sourceAffinity(articles: ReadingPathArticle[]) {
  const totalRead = articles.filter((article) => Boolean(article.readAt)).length;
  const globalRate = (totalRead + 2) / (articles.length + 20);
  const bySource = new Map<string, { total: number; read: number }>();

  for (const article of articles) {
    if (!article.sourceId) continue;
    const current = bySource.get(article.sourceId) ?? { total: 0, read: 0 };
    current.total += 1;
    current.read += Number(Boolean(article.readAt));
    bySource.set(article.sourceId, current);
  }

  return new Map([...bySource].map(([id, value]) => {
    // Bayesian smoothing keeps a tiny number of reads from instantly turning
    // a source into a permanent favourite.
    const rate = (value.read + 2) / (value.total + 20);
    return [id, clamp(50 + (rate - globalRate) * 180, 28, 72)];
  }));
}

function baseScore(article: ReadingPathArticle, affinity: number, now: number) {
  const timestamp = article.publishedAt ?? article.savedAt ?? now;
  const ageInDays = Math.max(0, (now - timestamp) / DAY);
  const freshness = 100 * Math.exp(-ageInDays / 5);
  const depth = clamp(42 + Math.min(28, (article.content?.replace(/<[^>]+>/g, "").length ?? 0) / 180));
  const personalRelevance = article.status === "saved" ? 88 : affinity;

  return clamp(
    0.42 * freshness +
    0.26 * personalRelevance +
    0.18 * affinity +
    0.14 * depth,
  );
}

/**
 * A deterministic first-pass editor. It deliberately treats source and topic
 * variety as marginal penalties, not hard quotas: a clearly strong article
 * can still enter after another item from the same source.
 */
export function buildReadingPath<T extends ReadingPathArticle>(
  articles: T[],
  sources: ReadingPathSource[],
  limit = 5,
  now = Date.now(),
): ReadingPathItem<T>[] {
  const names = new Map(sources.map((source) => [source.id, source.name]));
  const affinityBySource = sourceAffinity(articles);
  const candidates = articles
    .filter((article) => article.status !== "passed" && !article.readAt && !isPromotionalDeal(article))
    .map((article) => {
      const affinity = article.sourceId ? affinityBySource.get(article.sourceId) ?? 50 : 50;
      return { article, topic: topicFor(article), base: baseScore(article, affinity, now), affinity };
    })
    .sort((left, right) => right.base - left.base || (right.article.publishedAt ?? 0) - (left.article.publishedAt ?? 0));

  const selected: ReadingPathItem<T>[] = [];
  const sourceSelections = new Map<string, number>();
  const topicSelections = new Map<string, number>();
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();

  while (selected.length < limit && candidates.length) {
    let bestIndex = -1;
    let bestScore = -Infinity;
    let bestDetails: { sourceCount: number; topicCount: number; score: number } | null = null;

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const url = candidate.article.canonicalUrl;
      const normalizedTitle = titleKey(candidate.article.title);
      if (seenUrls.has(url) || seenTitles.has(normalizedTitle)) continue;

      const sourceCount = candidate.article.sourceId ? sourceSelections.get(candidate.article.sourceId) ?? 0 : 0;
      const topicCount = topicSelections.get(candidate.topic) ?? 0;
      // This is intentionally reachable without a hard per-source quota. The
      // richer AI information-value signal will replace part of this initial
      // heuristic in a later phase.
      const exceptional = candidate.base >= 76;
      const sourcePenalty = sourceCount * (exceptional ? 5 : 13);
      const topicPenalty = topicCount * (exceptional ? 4 : 9);
      const score = candidate.base - sourcePenalty - topicPenalty;
      if (score > bestScore) {
        bestIndex = index;
        bestScore = score;
        bestDetails = { sourceCount, topicCount, score };
      }
    }

    if (bestIndex < 0 || !bestDetails) break;
    const [winner] = candidates.splice(bestIndex, 1);
    const sourceName = winner.article.sourceId ? names.get(winner.article.sourceId) : "your saved reading";
    const sourceCount = bestDetails.sourceCount;
    const exceptional = winner.base >= 76;
    const whyNow = winner.article.status === "saved"
      ? "You saved this for later; it still holds a strong place in your reading path."
      : sourceCount > 0 && exceptional
        ? `Its current score keeps this ${sourceName ?? "source"} piece in today’s path despite earlier selections from the same source.`
        : winner.affinity >= 58
          ? `Recent and aligned with a source you return to more often.`
          : `A recent item that adds a different topic or source to today’s reading path.`;

    selected.push({ article: winner.article, score: Math.round(bestDetails.score), whyNow });
    seenUrls.add(winner.article.canonicalUrl);
    seenTitles.add(titleKey(winner.article.title));
    if (winner.article.sourceId) sourceSelections.set(winner.article.sourceId, sourceCount + 1);
    topicSelections.set(winner.topic, (topicSelections.get(winner.topic) ?? 0) + 1);
  }

  return selected;
}
