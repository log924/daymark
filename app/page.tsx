"use client";

import { Dispatch, FormEvent, SetStateAction, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type Source = {
  id: string;
  name: string;
  url: string;
  kind: string;
  createdAt: number;
  articleCount: number;
};

type Article = {
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

type Insight = {
  id: string;
  articleId: string;
  provider: string;
  summary: string | null;
  translationZh: string | null;
  score: number | null;
  createdAt: number;
};

type DailyBrief = {
  id: string;
  summary: string;
  keyInsights: Array<{ kind: "concept" | "trend" | "fact"; title: string; detail: string; articleIds: string[] }> | string;
  recommendations: Array<{ text: string; articleIds: string[] }> | string;
  articleIds: string;
  createdAt: number;
};
type Book = {
  id: string; title: string; author: string | null; canonicalUrl: string | null; coverUrl: string | null;
  description: string | null; subjects: string | null; isbn: string | null; publishedYear: string | null;
  status: "read" | "reading" | "to_read"; personalRating: number | null; interestScore: number | null; analysis: string | null; aiTags: string | null; connections: string | null;
  createdAt: number; updatedAt: number; statusChangedAt: number | null;
};

function bookCoverSrc(coverUrl: string) {
  try {
    const url = new URL(coverUrl);
    return url.hostname === "doubanio.com" || url.hostname.endsWith(".doubanio.com")
      ? `/api/books/cover?url=${encodeURIComponent(coverUrl)}`
      : coverUrl;
  } catch { return coverUrl; }
}

function displayAuthor(author: string | null) {
  const cleaned = author?.replace(/^[\s:：]+/, "").replace(/\[[^\]]*\]/g, "").replace(/【[^】]*】/g, "").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  const parts = cleaned.split(/\s*[\/／;；]\s*/).filter(Boolean);
  const latinPart = parts.find((part) => /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(part));
  if (!latinPart) return parts[0] ?? null;
  const parenthesized = latinPart.match(/[（(]([^）)]*[A-Za-zÀ-ÖØ-öø-ÿ][^）)]*)[）)]/);
  return parenthesized?.[1].trim() ?? latinPart.match(/[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ .,'’\-]*/)?.[0]?.trim() ?? latinPart.trim();
}

type BookConnection = { type: "book" | "article"; id: string; reason: string };
function bookConnections(book: Book): BookConnection[] {
  try { return book.connections ? JSON.parse(book.connections) as BookConnection[] : []; } catch { return []; }
}
function bookTags(book: Book) {
  try { return book.aiTags ? JSON.parse(book.aiTags) as string[] : []; } catch { return []; }
}
function statusChangeInputValue(timestamp: number | null) {
  if (!timestamp) return "";
  const local = new Date(timestamp - new Date(timestamp).getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
function statusChangeLabel(timestamp: number | null) {
  return timestamp ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(timestamp) : "Not recorded";
}

const colors = ["coral", "blue", "gold"] as const;
const sourceColors = ["#ff795e", "#4b7cff", "#e6a83b", "#6ea78a", "#8f77df"];
const deepSeekModels = [
  { value: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
  { value: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
  { value: "deepseek-chat", label: "DeepSeek Chat (legacy)" },
  { value: "deepseek-reasoner", label: "DeepSeek Reasoner (legacy)" },
] as const;

function relativeTime(timestamp: number | null) {
  if (!timestamp) {
    return "Saved link";
  }

  const diff = Date.now() - timestamp;
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  }
  const days = Math.round(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

function articleSnippet(article: Article) {
  if (article.content) {
    const text = article.content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return text.length > 230 ? `${text.slice(0, 230)}...` : text;
  }

  return "No extracted body yet. Open the original article, or use the later Chrome extension capture flow to save full text.";
}

function formatOutlineInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((piece, index) => {
    if (piece.startsWith("**") && piece.endsWith("**")) {
      return <strong key={index}>{piece.slice(2, -2)}</strong>;
    }
    if (piece.startsWith("`") && piece.endsWith("`")) {
      return <code key={index}>{piece.slice(1, -1)}</code>;
    }
    return piece;
  });
}

function OutlineSummary({ markdown }: { markdown: string | null }) {
  return (
    <div className="outline-summary">
      {(markdown ?? "").split("\n").map((line, index) => {
        const heading = line.match(/^(#{1,3})\s+(.+)$/);
        if (heading) {
          const Tag = heading[1].length <= 2 ? "h2" : heading[1].length === 3 ? "h3" : "h4";
          return <Tag key={index}>{formatOutlineInline(heading[2])}</Tag>;
        }

        const bullet = line.match(/^(\s*)[-*+]\s+(.+)$/);
        if (bullet) {
          const depth = Math.min(Math.floor(bullet[1].replace(/\t/g, "  ").length / 2), 3);
          return <p key={index} className={`outline-bullet outline-depth-${depth}`}>{formatOutlineInline(bullet[2])}</p>;
        }

        return line.trim() ? <p key={index} className="outline-paragraph">{formatOutlineInline(line)}</p> : null;
      })}
    </div>
  );
}

export default function Home() {
  const searchParams = useSearchParams();
  const [active, setActive] = useState("Brief");
  const [articles, setArticles] = useState<Article[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [insights, setInsights] = useState<Record<string, Insight | null>>({});
  const [dailyBrief, setDailyBrief] = useState<DailyBrief | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [processingInsight, setProcessingInsight] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showCapture, setShowCapture] = useState(false);
  const [editingSource, setEditingSource] = useState<Source | null>(null);
  const [sourceToRemove, setSourceToRemove] = useState<Source | null>(null);
  const [selectedLatestSourceId, setSelectedLatestSourceId] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [dismissedBookId, setDismissedBookId] = useState<string | null>(null);
  const [feedUrl, setFeedUrl] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [bookTitle, setBookTitle] = useState("");
  const [bookUrl, setBookUrl] = useState("");
  const [bookStatus, setBookStatus] = useState<Book["status"]>("to_read");
  const [message, setMessage] = useState("Loading your reading desk...");
  const [busy, setBusy] = useState(false);
  const [deepSeekApiKey, setDeepSeekApiKey] = useState("");
  const [deepSeekModel, setDeepSeekModel] = useState("deepseek-v4-flash");
  const requestedBookId = searchParams.get("book");

  const sourceById = useMemo(
    () => new Map(sources.map((source) => [source.id, source])),
    [sources],
  );
  const activeArticles = articles.filter((article) => article.status !== "passed");
  const briefArticles = activeArticles.slice(0, showAll ? 6 : 3);
  const savedArticles = activeArticles.filter((article) => article.status === "saved" || saved.includes(article.id));
  const readArticles = activeArticles.filter((article) => article.readAt).sort((a, b) => (b.readAt ?? 0) - (a.readAt ?? 0));
  const passedArticles = articles.filter((article) => article.status === "passed");
  // The API returns books newest first. Keep the dashboard shelf intentionally small
  // while preserving the full collection on each status page.
  const latestBooks = books.slice(0, 20);
  const selectedLatestSource = sources.find((source) => source.id === selectedLatestSourceId) ?? sources[0] ?? null;
  const latestUnreadArticles = selectedLatestSource
    ? activeArticles.filter((article) => article.sourceId === selectedLatestSource.id && !article.readAt).sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
    : [];
  const visibleArticles =
    active === "Saved" ? savedArticles : active === "Read" ? readArticles : active === "Passed" ? passedArticles : active === "Latest" ? selectedLatestSourceId ? latestUnreadArticles : activeArticles.filter((article) => !article.readAt) : active === "Sources" ? activeArticles : briefArticles;
  const selectedSource = selectedArticle?.sourceId ? sourceById.get(selectedArticle.sourceId) : null;
  const selectedInsight = selectedArticle ? insights[selectedArticle.id] : null;
  const todayCount = Math.min(6, articles.length);
  const unreadCount = activeArticles.filter((article) => !article.readAt).length;
  const readingMinutes = Math.max(1, Math.round(articles.slice(0, 6).length * 4));
  const briefRecommendations = useMemo(() => {
    if (!dailyBrief) return [];
    if (Array.isArray(dailyBrief.recommendations)) return dailyBrief.recommendations;
    try { return JSON.parse(dailyBrief.recommendations) as Array<{ text: string; articleIds: string[] }>; } catch { return []; }
  }, [dailyBrief]);
  const briefKeyInsights = useMemo(() => {
    if (!dailyBrief?.keyInsights) return [];
    if (Array.isArray(dailyBrief.keyInsights)) return dailyBrief.keyInsights;
    try { return JSON.parse(dailyBrief.keyInsights) as Array<{ kind: "concept" | "trend" | "fact"; title: string; detail: string; articleIds: string[] }>; } catch { return []; }
  }, [dailyBrief]);

  async function loadData(nextMessage = "") {
    const [articleResponse, sourceResponse, briefResponse, bookResponse] = await Promise.all([
      fetch("/api/articles"),
      fetch("/api/sources"),
      fetch("/api/brief"),
      fetch("/api/books"),
    ]);

    const articlePayload = await articleResponse.json() as { articles?: Article[]; error?: string };
    const sourcePayload = await sourceResponse.json() as { sources?: Source[]; error?: string };
    const briefPayload = await briefResponse.json() as { brief?: DailyBrief | null };
    const bookPayload = await bookResponse.json() as { books?: Book[]; error?: string };

    if (!articleResponse.ok || !sourceResponse.ok) {
      throw new Error(articlePayload.error ?? sourcePayload.error ?? "Unable to load reading data");
    }

    setArticles(articlePayload.articles ?? []);
    setSources(sourcePayload.sources ?? []);
    setDailyBrief(briefPayload.brief ?? null);
    setBooks(bookPayload.books ?? []);
    setMessage(nextMessage || "Ready");
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadData().catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load"));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!requestedBookId || requestedBookId === dismissedBookId) return;
    const requestedBook = books.find((book) => book.id === requestedBookId);
    if (!requestedBook) return;
    const timer = window.setTimeout(() => setSelectedBook(requestedBook), 0);
    return () => window.clearTimeout(timer);
  }, [books, dismissedBookId, requestedBookId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDeepSeekApiKey(localStorage.getItem("daymark.deepseek.apiKey") ?? "");
      setDeepSeekModel(localStorage.getItem("daymark.deepseek.model") ?? "deepseek-v4-flash");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (deepSeekApiKey) {
      localStorage.setItem("daymark.deepseek.apiKey", deepSeekApiKey);
    }
  }, [deepSeekApiKey]);

  useEffect(() => {
    localStorage.setItem("daymark.deepseek.model", deepSeekModel);
  }, [deepSeekModel]);

  useEffect(() => {
    if (!selectedArticle || selectedArticle.id in insights) {
      return;
    }

    fetch(`/api/articles/${selectedArticle.id}/insights`)
      .then((response) => response.json())
      .then((payload: { insight?: Insight | null }) => {
        setInsights((current) => ({ ...current, [selectedArticle.id]: payload.insight ?? null }));
      })
      .catch(() => {
        setInsights((current) => ({ ...current, [selectedArticle.id]: null }));
      });
  }, [insights, selectedArticle]);

  const toggle = (item: string, setter: Dispatch<SetStateAction<string[]>>) =>
    setter((current) => (current.includes(item) ? current.filter((id) => id !== item) : [...current, item]));

  async function addFeed(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!feedUrl.trim()) {
      return;
    }

    setBusy(true);
    setMessage("Adding RSS source...");
    try {
      const createResponse = await fetch("/api/sources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: feedUrl, kind: "rss" }),
      });
      const createPayload = await createResponse.json() as { source?: Source; error?: string };
      if (!createResponse.ok || !createPayload.source) {
        throw new Error(createPayload.error ?? "Unable to add source");
      }

      const refreshResponse = await fetch(`/api/sources/${createPayload.source.id}/refresh`, { method: "POST" });
      const refreshPayload = await refreshResponse.json() as { created?: number; sourceName?: string; error?: string };
      if (!refreshResponse.ok) {
        throw new Error(refreshPayload.error ?? "Source added, but refresh failed");
      }

      setFeedUrl("");
      setShowCapture(false);
      await loadData(`Added ${refreshPayload.sourceName ?? createPayload.source.name}; imported ${refreshPayload.created ?? 0} new articles.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to add source");
    } finally {
      setBusy(false);
    }
  }

  function openSourceEditor(source: Source) {
    setEditingSource(source);
    setSourceName(source.name);
    setSourceUrl(source.url);
  }

  async function saveSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingSource || !sourceName.trim() || !sourceUrl.trim()) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/sources/${editingSource.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: sourceName, url: sourceUrl }),
      });
      const payload = await response.json() as { source?: Source; error?: string };
      if (!response.ok || !payload.source) throw new Error(payload.error ?? "Unable to update source");
      setEditingSource(null);
      await loadData(`Updated ${payload.source.name}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update source");
    } finally { setBusy(false); }
  }

  async function removeSource() {
    if (!sourceToRemove) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/sources/${sourceToRemove.id}`, { method: "DELETE" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to remove source");
      const removedName = sourceToRemove.name;
      setSourceToRemove(null);
      await loadData(`Removed ${removedName}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to remove source");
    } finally { setBusy(false); }
  }

  async function saveLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!linkUrl.trim() || !linkTitle.trim()) {
      return;
    }

    setBusy(true);
    setMessage("Saving page link...");
    try {
      const response = await fetch("/api/articles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: linkTitle, url: linkUrl }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to save link");
      }
      setLinkUrl("");
      setLinkTitle("");
      await loadData("Saved page link.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save link");
    } finally {
      setBusy(false);
    }
  }

  async function addBook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!bookTitle.trim() && !bookUrl.trim()) return;
    setBusy(true); setMessage("Adding book to your shelf...");
    try {
      const response = await fetch("/api/books", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: bookTitle, url: bookUrl, status: bookStatus }) });
      const payload = await response.json() as { book?: Book; created?: boolean; error?: string };
      if (!response.ok || !payload.book) throw new Error(payload.error ?? "Unable to add book");
      setBookTitle(""); setBookUrl(""); setShowCapture(false);
      await loadData(payload.created ? `Added ${payload.book.title} to your shelf.` : "That book is already on your shelf.");
      if (payload.created && deepSeekApiKey.trim()) {
        const shouldRunFitness = payload.book.status === "to_read" || payload.book.status === "reading";
        await analyzeBook(payload.book, {
          includeFitness: shouldRunFitness,
          progressMessage: shouldRunFitness ? "Analyzing your new book against your reading history..." : "Generating tags for your new book...",
          successMessage: shouldRunFitness ? `Added ${payload.book.title} and saved its fit analysis.` : `Added ${payload.book.title} and generated its tags.`,
        });
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to add book"); } finally { setBusy(false); }
  }

  async function updateBookStatus(book: Book, status: Book["status"]) {
    const previous = books; setBooks((current) => current.map((item) => item.id === book.id ? { ...item, status } : item));
    try {
      const response = await fetch(`/api/books/${book.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
      const payload = await response.json() as { book?: Book; error?: string };
      if (!response.ok || !payload.book) throw new Error(payload.error ?? "Unable to update book");
      setBooks((current) => current.map((item) => item.id === book.id ? payload.book! : item));
      setSelectedBook((current) => current?.id === book.id ? payload.book! : current);
    } catch (error) { setBooks(previous); setMessage(error instanceof Error ? error.message : "Unable to update book"); }
  }

  async function updateBookRating(book: Book, personalRating: number | null) {
    try {
      const response = await fetch(`/api/books/${book.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ personalRating }) });
      const payload = await response.json() as { book?: Book; error?: string };
      if (!response.ok || !payload.book) throw new Error(payload.error ?? "Unable to update rating");
      setBooks((current) => current.map((item) => item.id === book.id ? payload.book! : item));
      setSelectedBook((current) => current?.id === book.id ? payload.book! : current);
      setMessage("Your book rating was saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to update rating"); }
  }

  async function removeBookTag(book: Book, tagToRemove: string) {
    const nextTags = bookTags(book).filter((tag) => tag !== tagToRemove);
    try {
      const response = await fetch(`/api/books/${book.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ aiTags: nextTags }) });
      const payload = await response.json() as { book?: Book; error?: string };
      if (!response.ok || !payload.book) throw new Error(payload.error ?? "Unable to update tags");
      setBooks((current) => current.map((item) => item.id === book.id ? payload.book! : item));
      setSelectedBook((current) => current?.id === book.id ? payload.book! : current);
      setMessage(`Removed tag “${tagToRemove}”.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to update tags"); }
  }

  async function updateStatusChangeDate(book: Book, value: string) {
    const statusChangedAt = new Date(value).getTime();
    if (!Number.isFinite(statusChangedAt)) return;
    try {
      const response = await fetch(`/api/books/${book.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ statusChangedAt }) });
      const payload = await response.json() as { book?: Book; error?: string };
      if (!response.ok || !payload.book) throw new Error(payload.error ?? "Unable to update status date");
      setBooks((current) => current.map((item) => item.id === book.id ? payload.book! : item));
      setSelectedBook((current) => current?.id === book.id ? payload.book! : current);
      setMessage("Status change date was updated.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to update status date"); }
  }

  async function refreshBookMetadata(book: Book) {
    setBusy(true); setMessage("Refreshing book details from Douban...");
    try {
      const response = await fetch(`/api/books/${book.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ refreshMetadata: true }) });
      const payload = await response.json() as { book?: Book; error?: string };
      if (!response.ok || !payload.book) throw new Error(payload.error ?? "Unable to refresh metadata");
      setBooks((current) => current.map((item) => item.id === book.id ? payload.book! : item));
      setSelectedBook((current) => current?.id === book.id ? payload.book! : current);
      setMessage("Book details refreshed from Douban.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to refresh metadata"); } finally { setBusy(false); }
  }

  async function analyzeBook(book: Book, options?: { includeFitness?: boolean; progressMessage?: string; successMessage?: string }) {
    setBusy(true); setMessage(options?.progressMessage ?? "Comparing this book with your reading history...");
    try {
      const response = await fetch(`/api/books/${book.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ apiKey: deepSeekApiKey, model: deepSeekModel, includeFitness: options?.includeFitness ?? true }) });
      const payload = await response.json() as { book?: Book; error?: string };
      if (!response.ok || !payload.book) throw new Error(payload.error ?? "Unable to analyze book");
      setBooks((current) => current.map((item) => item.id === book.id ? payload.book! : item)); setSelectedBook((current) => current?.id === book.id ? payload.book! : current); setMessage(options?.successMessage ?? "Book fit analysis saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to analyze book"); } finally { setBusy(false); }
  }

  async function refreshAllFeeds() {
    setBusy(true);
    setMessage("Refreshing every RSS feed and preparing your Chinese brief…");
    try {
      const response = await fetch("/api/brief/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: deepSeekApiKey, model: deepSeekModel }),
      });
      const payload = await response.json() as { created?: number; failures?: string[]; brief?: DailyBrief | null; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to refresh RSS feeds");
      await loadData(payload.created ? `Imported ${payload.created} new articles and updated your brief.` : "All RSS feeds are up to date; no new brief was needed.");
      if (payload.failures?.length) setMessage(`Updated with ${payload.created ?? 0} new articles. ${payload.failures.length} feed(s) could not be reached.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to refresh RSS feeds");
    } finally { setBusy(false); }
  }

  async function processInsight(article: Article) {
    setSelectedArticle(article);
    setProcessingInsight(article.id);
    setMessage("Capturing the original article, then preparing its Chinese outline...");
    try {
      const response = await fetch(`/api/articles/${article.id}/insights`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: deepSeekApiKey, model: deepSeekModel }),
      });
      const payload = await response.json() as { insight?: Insight; error?: string };
      if (!response.ok || !payload.insight) {
        throw new Error(payload.error ?? "Unable to process article");
      }
      setInsights((current) => ({ ...current, [article.id]: payload.insight ?? null }));
      setMessage("Chinese outline saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to process article");
    } finally {
      setProcessingInsight(null);
    }
  }

  async function setReadState(article: Article, read: boolean) {
    const previous = article;
    const updated = { ...article, readAt: read ? -1 : null };
    setArticles((current) => current.map((item) => item.id === article.id ? updated : item));
    setSelectedArticle((current) => current?.id === article.id ? updated : current);

    try {
      const response = await fetch(`/api/articles/${article.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ read }),
      });
      const payload = await response.json() as { article?: Article; error?: string };
      if (!response.ok || !payload.article) throw new Error(payload.error ?? "Unable to update article state");
      setArticles((current) => current.map((item) => item.id === article.id ? payload.article! : item));
      setSelectedArticle((current) => current?.id === article.id ? payload.article! : current);
    } catch (error) {
      setArticles((current) => current.map((item) => item.id === article.id ? previous : item));
      setSelectedArticle((current) => current?.id === article.id ? previous : current);
      setMessage(error instanceof Error ? error.message : "Unable to update article state");
    }
  }

  async function setPassedState(article: Article, passed: boolean) {
    const previous = article;
    const updated = passed ? { ...article, status: "passed" } : { ...article, status: "new", readAt: null };
    setArticles((current) => current.map((item) => item.id === article.id ? updated : item));
    setSelectedArticle((current) => current?.id === article.id ? updated : current);

    try {
      const response = await fetch(`/api/articles/${article.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passed }),
      });
      const payload = await response.json() as { article?: Article; error?: string };
      if (!response.ok || !payload.article) throw new Error(payload.error ?? "Unable to update article state");
      setArticles((current) => current.map((item) => item.id === article.id ? payload.article! : item));
      setSelectedArticle((current) => current?.id === article.id ? payload.article! : current);
      setMessage(passed ? "Article passed for now. You can restore it from Passed." : "Article restored to your unread queue.");
    } catch (error) {
      setArticles((current) => current.map((item) => item.id === article.id ? previous : item));
      setSelectedArticle((current) => current?.id === article.id ? previous : current);
      setMessage(error instanceof Error ? error.message : "Unable to update article state");
    }
  }

  async function passRemainingSourceArticles() {
    if (!selectedLatestSource || !latestUnreadArticles.length) return;
    const remaining = latestUnreadArticles;
    const ids = new Set(remaining.map((article) => article.id));
    setBusy(true);
    setArticles((current) => current.map((article) => ids.has(article.id) ? { ...article, status: "passed" } : article));

    try {
      const results = await Promise.allSettled(remaining.map(async (article) => {
        const response = await fetch(`/api/articles/${article.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ passed: true }),
        });
        const payload = await response.json() as { article?: Article; error?: string };
        if (!response.ok || !payload.article) throw new Error(payload.error ?? "Unable to pass article");
        return payload.article;
      }));
      const updatedById = new Map(results.filter((result): result is PromiseFulfilledResult<Article> => result.status === "fulfilled").map((result) => [result.value.id, result.value]));
      const previousById = new Map(remaining.map((article) => [article.id, article]));
      setArticles((current) => current.map((article) => updatedById.get(article.id) ?? previousById.get(article.id) ?? article));
      const failures = results.length - updatedById.size;
      setMessage(failures ? `Passed ${updatedById.size} article${updatedById.size === 1 ? "" : "s"}; ${failures} could not be passed.` : `Passed ${remaining.length} remaining article${remaining.length === 1 ? "" : "s"} from ${selectedLatestSource.name}.`);
    } catch (error) {
      const previousById = new Map(remaining.map((article) => [article.id, article]));
      setArticles((current) => current.map((article) => previousById.get(article.id) ?? article));
      setMessage(error instanceof Error ? error.message : "Unable to pass the remaining articles");
    } finally {
      setBusy(false);
    }
  }

  function openArticle(article: Article) {
    setSelectedArticle(article);
    if (!article.readAt) void setReadState(article, true);
  }

  function openBook(book: Book) { setSelectedBook(book); }

  function closeSelectedBook() {
    if (requestedBookId) setDismissedBookId(requestedBookId);
    if (requestedBookId) {
      const url = new URL(window.location.href);
      url.searchParams.delete("book");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
    setSelectedBook(null);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#top" aria-label="Daymark home"><span>✦</span> daymark</a>
        <nav aria-label="Main navigation">
          {["Brief", "Latest", "Sources", "Saved", "Read", "Passed", "Books", "Settings"].map((name) => (
            <div key={name} className="nav-group"><button className={active === name ? "nav-item active" : "nav-item"} onClick={() => { setActive(name); if (name === "Latest") setSelectedLatestSourceId(null); }}>
              <span>{name === "Brief" ? "◒" : name === "Latest" ? "◷" : name === "Sources" ? "◉" : name === "Saved" ? "♡" : name === "Read" ? "✓" : name === "Passed" ? "⊘" : name === "Books" ? "▤" : "⚙"}</span>{name}
              {name === "Latest" && <b>{unreadCount}</b>}
            </button>{name === "Sources" && sources.length > 0 && <div className="source-nav-list">{sources.map((source, index) => { const unread = activeArticles.filter((article) => article.sourceId === source.id && !article.readAt).length; return <button key={source.id} className={active === "Latest" && selectedLatestSource?.id === source.id ? "source-nav-item active" : "source-nav-item"} onClick={() => { setActive("Latest"); setSelectedLatestSourceId(source.id); setShowAll(false); }}><span className="source-logo" style={{ background: sourceColors[index % sourceColors.length] }}>{source.name.charAt(0).toUpperCase()}</span><span>{source.name}</span><b>{unread}</b></button>; })}</div>}</div>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="profile"><div className="avatar">Y</div><div><strong>You</strong><small>Personal workspace</small></div><span>⌄</span></div>
      </aside>

      <section className="content" id="top">
        <header className="topbar">
          <div className="crumb"><span className="sun">☀</span><span>{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</span><em>•</em><span>{message}</span></div>
          <div className="top-actions"><button className="refresh-button" onClick={() => void refreshAllFeeds()} disabled={busy}>{busy ? "Refreshing…" : "↻ Refresh feeds"}</button><button className="add-button" onClick={() => setShowCapture(true)}>+ Add {active === "Books" ? "book" : "source"}</button></div>
        </header>

        <div className="brief-head">
          <div><p className="eyebrow">YOUR DAILY SELECTION</p><h1>Worth your<br/><i>attention.</i></h1></div>
          <div className="brief-note"><span className="line"/><p>{dailyBrief ? <>Your latest brief highlights <strong>{briefRecommendations.length} things worth knowing.</strong></> : <>Refresh all feeds to generate a <strong>Simplified Chinese daily brief.</strong></>}</p></div>
        </div>

        <div className="stats"><div><strong>{String(todayCount).padStart(2, "0")}</strong><span>Selected today</span></div><div><strong>{articles.length}</strong><span>Total articles</span></div><div><strong>{readingMinutes}m</strong><span>Estimated reading</span></div></div>

        {active === "Settings" && (
          <section className="settings-panel">
            <div>
              <p className="eyebrow">AI PROCESSING</p>
              <h2>DeepSeek</h2>
              <p>Enter a key here to use it only on this browser, or configure the Worker’s <code>DEEPSEEK_API_KEY</code> secret once to use it securely from every device. The Worker secret is never sent back to a browser.</p>
            </div>
            <div className="ai-settings">
              <label>
                <span>Browser API key (optional)</span>
                <input type="password" value={deepSeekApiKey} onChange={(event) => setDeepSeekApiKey(event.target.value)} placeholder="sk-..." />
              </label>
              <label>
                <span>Model</span>
                <select value={deepSeekModel} onChange={(event) => setDeepSeekModel(event.target.value)}>
                  {deepSeekModels.map((model) => (
                    <option key={model.value} value={model.value}>{model.label}</option>
                  ))}
                </select>
              </label>
              <div className="setting-row"><span>Provider</span><strong>DeepSeek API</strong></div>
              <div className="setting-row"><span>Cache</span><strong>D1 article_insights</strong></div>
            </div>
          </section>
        )}

        {active === "Books" && <section className="books-panel">
          <div className="section-heading"><div><p className="eyebrow">PERSONAL LIBRARY</p><h2>Your reading shelf</h2></div><button className="text-button" onClick={() => setShowCapture(true)}>Add a book <span>→</span></button></div>
          <p className="books-intro">Your 20 most recently added or updated books are shown here. Choose a status title to browse that entire shelf.</p>
          <div className="book-columns">{(["reading", "to_read", "read"] as const).map((status) => {
            const statusLabel = status === "reading" ? "Reading now" : status === "to_read" ? "To be read" : "Read";
            const statusBooks = latestBooks.filter((book) => book.status === status);
            return <section className="book-column" key={status}><div className="book-column-head"><Link href={`/books/${status}`} aria-label={`View all ${statusLabel.toLowerCase()} books`}>{statusLabel}</Link><b>{books.filter((book) => book.status === status).length}</b></div><div className="book-column-list">{statusBooks.map((book) => <article className="book-card" key={book.id} role="button" tabIndex={0} onClick={() => openBook(book)} onKeyDown={(event) => event.key === "Enter" && openBook(book)}>{book.coverUrl ? <img src={bookCoverSrc(book.coverUrl)} alt="" /> : <div className="book-spine">{book.title.slice(0, 1)}</div>}<div className="book-card-main"><p className="eyebrow">{displayAuthor(book.author) ?? "AUTHOR UNKNOWN"}</p><h3>{book.title}</h3>{book.description && <p className="book-description">{book.description}</p>}{book.interestScore !== null && <div className="fit-score"><strong>{book.interestScore}</strong><span>interest fit</span></div>}<button className="analyze-button" disabled={busy} onClick={(event) => { event.stopPropagation(); void analyzeBook(book); }}>{book.analysis ? "Refresh fit analysis" : "Analyze fit"}</button></div></article>)}{!statusBooks.length && <div className="empty-books">Nothing from the latest 20 here yet.</div>}</div></section>;
          })}</div>
        </section>}

        {active === "Brief" && dailyBrief && <section className="daily-brief"><div className="section-heading"><div><p className="eyebrow">DEEPSEEK DAILY BRIEF · {new Date(dailyBrief.createdAt).toLocaleString()}</p><h2>What you need to know</h2></div><button className="text-button" onClick={() => void refreshAllFeeds()} disabled={busy}>Refresh all feeds <span>↻</span></button></div><OutlineSummary markdown={dailyBrief.summary} />{briefKeyInsights.length > 0 && <div className="brief-key-insights"><p className="eyebrow">KEY CONCEPTS, TRENDS &amp; FACTS</p>{briefKeyInsights.map((insight, index) => <article className="brief-key-insight" key={`${insight.kind}-${insight.title}-${index}`}><span className={`brief-insight-kind brief-insight-kind-${insight.kind}`}>{insight.kind}</span><div><h3>{insight.title}</h3><p>{insight.detail}</p>{insight.articleIds.length > 0 && <div className="brief-insight-sources">{insight.articleIds.map((id) => { const article = articles.find((item) => item.id === id); return article ? <a key={id} href={`#article-${id}`} onClick={(event) => { event.preventDefault(); openArticle(article); }}>Source: {article.title} <span>→</span></a> : null; })}</div>}</div></article>)}</div>}<div className="brief-recommendations"><p className="eyebrow">RECOMMENDED READING</p>{briefRecommendations.map((recommendation, index) => <div className="brief-recommendation" key={index}><p>{recommendation.text}</p><div>{recommendation.articleIds.map((id) => { const article = articles.find((item) => item.id === id); return article ? <a key={id} href={`#article-${id}`} onClick={(event) => { event.preventDefault(); openArticle(article); }}>Read: {article.title} <span>→</span></a> : null; })}</div></div>)}</div></section>}

        {active !== "Settings" && active !== "Brief" && active !== "Books" && <section className="section-heading"><div><p className="eyebrow">{active === "Saved" ? "SAVED" : active === "Read" ? "READING HISTORY" : active === "Passed" ? "REVIEW PASSED" : active === "Latest" ? "LATEST UNREAD" : "BY SOURCE"}</p><h2>{active === "Saved" ? "For later" : active === "Read" ? "Already read" : active === "Passed" ? "Passed for now" : active === "Latest" ? selectedLatestSource ? selectedLatestSource.name : "All unread articles" : "All incoming pieces"}</h2></div>{active === "Latest" && selectedLatestSource && latestUnreadArticles.length > 0 ? <button className="text-button pass-all-button" onClick={() => void passRemainingSourceArticles()} disabled={busy}>Pass all remaining <span>⊘</span></button> : <button className="text-button" onClick={() => setShowAll(!showAll)}>{showAll ? "Show less" : "See first 6"} <span>→</span></button>}</section>}

        {active !== "Settings" && active !== "Brief" && active !== "Books" && <section className="story-grid">
          {visibleArticles.map((article, index) => {
            const source = article.sourceId ? sourceById.get(article.sourceId) : null;
            return (
            <article className={`story-card ${colors[index % colors.length]}${article.readAt ? " is-read" : " is-unread"}${article.status === "passed" ? " is-passed" : ""}`} key={article.id} role="button" tabIndex={0} onClick={() => openArticle(article)} onKeyDown={(event) => event.key === "Enter" && openArticle(article)}>
              <div className="story-meta"><span className="source-dot"/><span>{source?.name ?? "Saved page"}</span><em>·</em><span>{relativeTime(article.publishedAt ?? article.savedAt)}</span>{!article.readAt && article.status !== "passed" && <span className="unread-badge">Unread</span>}<button onClick={(event) => { event.stopPropagation(); toggle(article.id, setSaved); }} aria-label="Save article">{saved.includes(article.id) || article.status === "saved" ? "♥" : "♡"}</button></div>
              <span className="tag">{source?.kind ?? "Manual"}</span><h3>{article.title}</h3><p>{articleSnippet(article)}</p>
              <div className="story-foot"><span>✦ {article.status === "passed" ? "Passed for now" : article.readAt ? "Read" : article.status === "saved" ? "Saved manually" : "Fresh from your RSS list"}</span><div className="story-actions"><button onClick={(event) => { event.stopPropagation(); processInsight(article); }} disabled={processingInsight === article.id}>{insights[article.id]?.summary ? "Summary ready" : processingInsight === article.id ? "Summarizing…" : "Summarize"}</button>{article.status === "passed" ? <button className="restore" onClick={(event) => { event.stopPropagation(); void setPassedState(article, false); }}>Restore to queue</button> : <><button onClick={(event) => { event.stopPropagation(); void setReadState(article, !article.readAt); }}>{article.readAt ? "Mark unread" : "Mark read"}</button><button className="pass" onClick={(event) => { event.stopPropagation(); void setPassedState(article, true); }} aria-label={`Pass ${article.title}`}>Pass</button></>}<button className="read" onClick={(event) => { event.stopPropagation(); openArticle(article); }}>Open <span>→</span></button></div></div>
            </article>
          )})}
        </section>}

        {active === "Brief" && !dailyBrief && <div className="empty-state">Click <strong>Refresh feeds</strong> to fetch every RSS source and create your first Simplified Chinese daily brief.</div>}
        {active !== "Settings" && active !== "Brief" && active !== "Books" && !visibleArticles.length && <div className="empty-state">{active === "Read" ? "Articles you finish will appear here." : active === "Passed" ? "Nothing has been passed yet. Passed articles stay here until you restore them to the queue." : "Use Add source to connect an RSS feed, or save a page link, and Daymark will start filling this desk."}</div>}

        {active === "Sources" && <section className="sources-panel"><div className="section-heading"><div><p className="eyebrow">FOLLOWING</p><h2>From your sources</h2></div><button className="text-button" onClick={() => setShowCapture(true)}>Add RSS <span>→</span></button></div><div className="source-list">{sources.map((source, index) => <div key={source.id} className="source-row"><span className="source-logo" style={{background: sourceColors[index % sourceColors.length]}}>{source.name.charAt(0).toUpperCase()}</span><div className="source-details"><strong>{source.name}</strong><small>{source.url}</small></div><span>{source.articleCount} articles</span><div className="source-controls"><button onClick={() => openSourceEditor(source)}>Edit</button><button className="remove-source" onClick={() => setSourceToRemove(source)}>Remove</button></div></div>)}</div></section>}
      </section>

      {showCapture && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Add source">
          <div className="capture-modal">
            <div className="modal-head"><div><p className="eyebrow">ADD SOURCE</p><h2>Bring something into Daymark</h2></div><button onClick={() => setShowCapture(false)} aria-label="Close">×</button></div>
            {active !== "Books" && <form onSubmit={addFeed}>
              <label>
                <span>RSS feed</span>
                <input value={feedUrl} onChange={(event) => setFeedUrl(event.target.value)} placeholder="https://example.com/feed.xml" autoFocus />
              </label>
              <p className="feed-help">We’ll read the RSS feed and use its title as the source name.</p>
              <button disabled={busy || !feedUrl.trim()}>Add + refresh</button>
            </form>}
            {active !== "Books" && <form onSubmit={saveLink}>
              <label>
                <span>Page title</span>
                <input value={linkTitle} onChange={(event) => setLinkTitle(event.target.value)} placeholder="Article title" />
              </label>
              <label>
                <span>Page URL</span>
                <input value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://..." />
              </label>
              <button disabled={busy || !linkTitle.trim() || !linkUrl.trim()}>Save link</button>
            </form>}
            {active === "Books" && <form className="book-add-form" onSubmit={addBook}><label><span>Book title</span><input value={bookTitle} onChange={(event) => setBookTitle(event.target.value)} placeholder="Title (optional if you paste a link)" autoFocus /></label><label><span>Goodreads or Douban link</span><input value={bookUrl} onChange={(event) => setBookUrl(event.target.value)} placeholder="https://..." /></label><label><span>Shelf</span><select value={bookStatus} onChange={(event) => setBookStatus(event.target.value as Book["status"])}><option value="to_read">To be read</option><option value="reading">Reading now</option><option value="read">Read</option></select></label><button disabled={busy || (!bookTitle.trim() && !bookUrl.trim())}>Add to shelf</button></form>}
          </div>
        </div>
      )}

      {editingSource && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Edit source"><div className="capture-modal source-editor"><div className="modal-head"><div><p className="eyebrow">EDIT SOURCE</p><h2>{editingSource.name}</h2></div><button onClick={() => setEditingSource(null)} aria-label="Close">×</button></div><form onSubmit={saveSource}><label><span>Source name</span><input autoFocus value={sourceName} onChange={(event) => setSourceName(event.target.value)} required /></label><label><span>RSS feed</span><input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} required /></label><button disabled={busy}>Save changes</button></form></div></div>}

      {sourceToRemove && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Remove source"><div className="capture-modal confirm-modal"><p className="eyebrow">REMOVE SOURCE</p><h2>Remove {sourceToRemove.name}?</h2><p>Its imported articles will remain in your reading list.</p><div className="dialog-actions"><button className="secondary-button" onClick={() => setSourceToRemove(null)} disabled={busy}>Keep source</button><button className="danger-button" onClick={() => void removeSource()} disabled={busy}>Remove source</button></div></div></div>}

      {selectedArticle && (
        <div className="modal-backdrop reader-backdrop" role="dialog" aria-modal="true" aria-label="Article reader" onClick={() => setSelectedArticle(null)}>
          <article className="reader-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><p className="eyebrow">{selectedSource?.name ?? "SAVED PAGE"} · {relativeTime(selectedArticle.publishedAt ?? selectedArticle.savedAt)}</p><h2>{selectedArticle.title}</h2></div><button onClick={() => setSelectedArticle(null)} aria-label="Close">×</button></div>
            <div className="reader-body">{selectedArticle.content ? <div dangerouslySetInnerHTML={{ __html: selectedArticle.content }} /> : <p>Daymark does not have the full article text yet. RSS feeds often include only a preview; the upcoming page capture flow will save full page content for local reading and DeepSeek processing.</p>}</div>
            {selectedInsight && (
              <section className="insight-panel">
                <div>
                  <p className="eyebrow">中文大纲</p>
                  <OutlineSummary markdown={selectedInsight.summary} />
                </div>
                <small>{selectedInsight.provider} · score {selectedInsight.score ?? "n/a"}</small>
              </section>
            )}
            <div className="reader-actions"><button onClick={() => processInsight(selectedArticle)} disabled={processingInsight === selectedArticle.id}>{selectedInsight?.summary ? "Summary ready" : processingInsight === selectedArticle.id ? "Summarizing…" : "Summarize"}</button><button className="secondary-button" onClick={() => void setReadState(selectedArticle, !selectedArticle.readAt)}>{selectedArticle.readAt ? "Mark unread" : "Mark read"}</button><button className="secondary-button" onClick={() => void setPassedState(selectedArticle, selectedArticle.status !== "passed")}>{selectedArticle.status === "passed" ? "Restore to queue" : "Pass for now"}</button><a href={selectedArticle.canonicalUrl} target="_blank" rel="noreferrer">Open original source ↗</a></div>
          </article>
        </div>
      )}

      {selectedBook && (
        <div className="modal-backdrop reader-backdrop" role="dialog" aria-modal="true" aria-label="Book details" onClick={closeSelectedBook}>
          <article className="reader-modal book-reader-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><p className="eyebrow">YOUR LIBRARY · {selectedBook.status === "reading" ? "READING NOW" : selectedBook.status === "to_read" ? "TO BE READ" : "READ"}</p><h2>{selectedBook.title}</h2>{displayAuthor(selectedBook.author) && <p className="book-reader-author">by {displayAuthor(selectedBook.author)}</p>}</div><button onClick={closeSelectedBook} aria-label="Close">×</button></div>
            <section className="book-reader-hero">{selectedBook.coverUrl ? <img src={bookCoverSrc(selectedBook.coverUrl)} alt={`Cover of ${selectedBook.title}`} /> : <div className="book-reader-spine">{selectedBook.title.slice(0, 1)}</div>}<div className="book-facts"><div className="book-status-control"><span>Reading status</span><select aria-label={`Reading status for ${selectedBook.title}`} value={selectedBook.status} onChange={(event) => void updateBookStatus(selectedBook, event.target.value as Book["status"])}><option value="reading">Reading now</option><option value="to_read">To be read</option><option value="read">Read</option></select></div><div className="book-status-control"><span>Your rating</span><select aria-label={`Your rating for ${selectedBook.title}`} value={selectedBook.personalRating ?? ""} onChange={(event) => void updateBookRating(selectedBook, event.target.value ? Number(event.target.value) : null)}><option value="">Not rated</option>{[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{"★".repeat(rating)} {rating}/5</option>)}</select></div><div className="book-status-control"><span>Last status change</span><small>{statusChangeLabel(selectedBook.statusChangedAt)}</small><input type="datetime-local" aria-label={`Last status change for ${selectedBook.title}`} value={statusChangeInputValue(selectedBook.statusChangedAt)} onChange={(event) => void updateStatusChangeDate(selectedBook, event.target.value)} /></div>{selectedBook.interestScore !== null && <div className="book-fit-large"><strong>{selectedBook.interestScore}</strong><span>interest fit</span></div>}<dl>{selectedBook.publishedYear && <><dt>Published</dt><dd>{selectedBook.publishedYear}</dd></>}{selectedBook.isbn && <><dt>ISBN</dt><dd>{selectedBook.isbn}</dd></>}{bookTags(selectedBook).length > 0 && <><dt>Tags</dt><dd className="book-metadata-tags">{bookTags(selectedBook).map((tag) => <button type="button" className="book-tag-button" key={tag} onClick={() => void removeBookTag(selectedBook, tag)} disabled={busy} aria-label={`Remove tag ${tag}`}>{tag}<span aria-hidden="true">×</span></button>)}</dd></>}{selectedBook.subjects && <><dt>Source tags</dt><dd>{selectedBook.subjects}</dd></>}</dl></div></section>
            <section className="book-detail-section"><div className="detail-heading"><div><p className="eyebrow">ABOUT THE BOOK</p></div>{selectedBook.canonicalUrl?.includes("book.douban.com") && <button className="analyze-button" disabled={busy} onClick={() => void refreshBookMetadata(selectedBook)}>Refresh from Douban</button>}</div><div className="reader-body">{selectedBook.description ? selectedBook.description.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>) : <p>No description was available when this book was added. Use “Refresh from Douban” to import its latest book details.</p>}</div></section>
            <section className="book-detail-section book-fit-detail"><div className="detail-heading"><div><p className="eyebrow">PERSONAL FIT</p><h3>Why it may matter to you</h3></div><button className="analyze-button" disabled={busy} onClick={() => void analyzeBook(selectedBook)}>{selectedBook.analysis ? "Refresh analysis" : "Analyze fit"}</button></div>{selectedBook.analysis ? <OutlineSummary markdown={selectedBook.analysis} /> : <p className="detail-empty">Run an analysis to compare this book with the books and articles already in your reading history.</p>}</section>
            {bookConnections(selectedBook).length > 0 && <section className="book-detail-section"><p className="eyebrow">CONNECTED READING</p><div className="book-connection-cards">{bookConnections(selectedBook).map((connection) => { const linkedBook = connection.type === "book" ? books.find((book) => book.id === connection.id) : null; const linkedArticle = connection.type === "article" ? articles.find((article) => article.id === connection.id) : null; const item = linkedBook ?? linkedArticle; if (!item) return null; return <button key={`${connection.type}-${connection.id}`} onClick={() => connection.type === "book" ? openBook(linkedBook!) : openArticle(linkedArticle!)}><span>{connection.type === "book" ? "BOOK" : "ARTICLE"}</span><strong>{item.title}</strong><small>{connection.reason}</small></button>; })}</div></section>}
            <div className="reader-actions">{selectedBook.canonicalUrl && <a href={selectedBook.canonicalUrl} target="_blank" rel="noreferrer">Open original source ↗</a>}<button className="secondary-button" onClick={closeSelectedBook}>Back to shelf</button></div>
          </article>
        </div>
      )}
    </main>
  );
}
