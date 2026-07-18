/**
 * Produce one stable identity for a published article. Feed URLs frequently
 * carry campaign parameters, while the underlying article is the same.
 */
export function normalizeArticleUrl(rawUrl: string, baseUrl?: string) {
  const url = new URL(rawUrl, baseUrl);
  url.hash = "";

  for (const key of [...url.searchParams.keys()]) {
    const normalizedKey = key.toLowerCase();
    if (
      normalizedKey.startsWith("utm_") ||
      normalizedKey.startsWith("mc_") ||
      ["fbclid", "gclid", "dclid", "msclkid", "ref", "ref_src"].includes(normalizedKey)
    ) {
      url.searchParams.delete(key);
    }
  }

  // Treat a cosmetic trailing slash as the same resource, while preserving
  // the root path where it is semantically required by URL.
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

export type TimedArticleCandidate = {
  publishedAt: number | null;
  title: string;
};

/** Keep daily-brief input deterministic even when source fetches race. */
export function sortNewestCandidates<T extends TimedArticleCandidate>(items: T[]) {
  return [...items].sort((left, right) => {
    const timeDifference = (right.publishedAt ?? 0) - (left.publishedAt ?? 0);
    return timeDifference || left.title.localeCompare(right.title, "zh-Hans-CN");
  });
}
