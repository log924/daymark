import { Defuddle } from "defuddle/node";
import { parseHTML } from "linkedom";

const MAX_HTML_CHARACTERS = 2_000_000;
const MAX_ARTICLE_CHARACTERS = 60_000;

export type ExtractedArticle = {
  content: string;
  title: string | null;
  wordCount: number | null;
  truncated: boolean;
};

export async function extractArticle(url: string): Promise<ExtractedArticle> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("The original article URL is invalid");
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new Error("Only HTTP and HTTPS article URLs can be summarized");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(parsedUrl, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en,zh-CN;q=0.8,zh;q=0.7",
        "user-agent": "Daymark article reader",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Original article request failed with ${response.status}`);
    }

    const html = await response.text();
    if (html.length > MAX_HTML_CHARACTERS) {
      throw new Error("The original article is too large to summarize");
    }

    const { document } = parseHTML(html);
    const result = await Defuddle(document, parsedUrl.toString(), {
      markdown: true,
      removeExactSelectors: true,
      removePartialSelectors: true,
      removeHiddenElements: true,
      removeLowScoring: true,
      removeSmallImages: true,
      removeImages: true,
      includeReplies: false,
    });
    const extracted = result.content?.trim() ?? "";

    if (extracted.length < 200) {
      throw new Error("Daymark could not extract enough article text from the original page");
    }

    return {
      content: extracted.slice(0, MAX_ARTICLE_CHARACTERS),
      title: result.title?.trim() || null,
      wordCount: typeof result.wordCount === "number" ? result.wordCount : null,
      truncated: extracted.length > MAX_ARTICLE_CHARACTERS,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The original article took too long to load");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
