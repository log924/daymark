"use client";

import { Dispatch, FormEvent, SetStateAction, useEffect, useMemo, useState } from "react";

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
  recommendations: Array<{ text: string; articleIds: string[] }> | string;
  articleIds: string;
  createdAt: number;
};

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
    return article.content.length > 230 ? `${article.content.slice(0, 230)}...` : article.content;
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
  const [active, setActive] = useState("Brief");
  const [articles, setArticles] = useState<Article[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [insights, setInsights] = useState<Record<string, Insight | null>>({});
  const [dailyBrief, setDailyBrief] = useState<DailyBrief | null>(null);
  const [processingInsight, setProcessingInsight] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showCapture, setShowCapture] = useState(false);
  const [editingSource, setEditingSource] = useState<Source | null>(null);
  const [sourceToRemove, setSourceToRemove] = useState<Source | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [feedUrl, setFeedUrl] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [message, setMessage] = useState("Loading your reading desk...");
  const [busy, setBusy] = useState(false);
  const [deepSeekApiKey, setDeepSeekApiKey] = useState("");
  const [deepSeekModel, setDeepSeekModel] = useState("deepseek-v4-flash");

  const sourceById = useMemo(
    () => new Map(sources.map((source) => [source.id, source])),
    [sources],
  );
  const briefArticles = articles.slice(0, showAll ? 6 : 3);
  const savedArticles = articles.filter((article) => article.status === "saved" || saved.includes(article.id));
  const visibleArticles =
    active === "Saved" ? savedArticles : active === "Latest" ? articles : active === "Sources" ? articles : briefArticles;
  const selectedSource = selectedArticle?.sourceId ? sourceById.get(selectedArticle.sourceId) : null;
  const selectedInsight = selectedArticle ? insights[selectedArticle.id] : null;
  const todayCount = Math.min(6, articles.length);
  const unreadCount = articles.filter((article) => !article.readAt).length;
  const readingMinutes = Math.max(1, Math.round(articles.slice(0, 6).length * 4));
  const briefRecommendations = useMemo(() => {
    if (!dailyBrief) return [];
    if (Array.isArray(dailyBrief.recommendations)) return dailyBrief.recommendations;
    try { return JSON.parse(dailyBrief.recommendations) as Array<{ text: string; articleIds: string[] }>; } catch { return []; }
  }, [dailyBrief]);

  async function loadData(nextMessage = "") {
    const [articleResponse, sourceResponse, briefResponse] = await Promise.all([
      fetch("/api/articles"),
      fetch("/api/sources"),
      fetch("/api/brief"),
    ]);

    const articlePayload = await articleResponse.json() as { articles?: Article[]; error?: string };
    const sourcePayload = await sourceResponse.json() as { sources?: Source[]; error?: string };
    const briefPayload = await briefResponse.json() as { brief?: DailyBrief | null };

    if (!articleResponse.ok || !sourceResponse.ok) {
      throw new Error(articlePayload.error ?? sourcePayload.error ?? "Unable to load reading data");
    }

    setArticles(articlePayload.articles ?? []);
    setSources(sourcePayload.sources ?? []);
    setDailyBrief(briefPayload.brief ?? null);
    setMessage(nextMessage || "Ready");
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadData().catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load"));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

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

  async function refreshAllFeeds() {
    if (!deepSeekApiKey.trim()) {
      setActive("Settings");
      setMessage("Add your DeepSeek API key in Settings before refreshing your daily brief.");
      return;
    }
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
    if (!deepSeekApiKey.trim()) {
      setActive("Settings");
      setMessage("Add your DeepSeek API key in Settings first.");
      return;
    }

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

  function openArticle(article: Article) {
    setSelectedArticle(article);
    if (!article.readAt) void setReadState(article, true);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#top" aria-label="Daymark home"><span>✦</span> daymark</a>
        <nav aria-label="Main navigation">
          {["Brief", "Latest", "Sources", "Saved", "Settings"].map((name) => (
            <button key={name} className={active === name ? "nav-item active" : "nav-item"} onClick={() => setActive(name)}>
              <span>{name === "Brief" ? "◒" : name === "Latest" ? "◷" : name === "Sources" ? "◉" : name === "Saved" ? "♡" : "⚙"}</span>{name}
              {name === "Latest" && <b>{unreadCount}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="profile"><div className="avatar">Y</div><div><strong>You</strong><small>Personal workspace</small></div><span>⌄</span></div>
      </aside>

      <section className="content" id="top">
        <header className="topbar">
          <div className="crumb"><span className="sun">☀</span><span>{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</span><em>•</em><span>{message}</span></div>
          <div className="top-actions"><button className="refresh-button" onClick={() => void refreshAllFeeds()} disabled={busy}>{busy ? "Refreshing…" : "↻ Refresh feeds"}</button><button className="add-button" onClick={() => setShowCapture(true)}>+ Add source</button></div>
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
              <p>Your API key is remembered only in this browser for localhost use. Daymark sends it to the local server only when it captures an original article and generates its Chinese outline summary.</p>
            </div>
            <div className="ai-settings">
              <label>
                <span>API key</span>
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

        {active === "Brief" && dailyBrief && <section className="daily-brief"><div className="section-heading"><div><p className="eyebrow">DEEPSEEK DAILY BRIEF · {new Date(dailyBrief.createdAt).toLocaleString()}</p><h2>What you need to know</h2></div><button className="text-button" onClick={() => void refreshAllFeeds()} disabled={busy}>Refresh all feeds <span>↻</span></button></div><OutlineSummary markdown={dailyBrief.summary} /><div className="brief-recommendations"><p className="eyebrow">RECOMMENDED READING</p>{briefRecommendations.map((recommendation, index) => <div className="brief-recommendation" key={index}><p>{recommendation.text}</p><div>{recommendation.articleIds.map((id) => { const article = articles.find((item) => item.id === id); return article ? <a key={id} href={`#article-${id}`} onClick={(event) => { event.preventDefault(); openArticle(article); }}>Read: {article.title} <span>→</span></a> : null; })}</div></div>)}</div></section>}

        {active !== "Settings" && active !== "Brief" && <section className="section-heading"><div><p className="eyebrow">{active === "Saved" ? "SAVED" : active === "Latest" ? "LATEST" : "BY SOURCE"}</p><h2>{active === "Saved" ? "For later" : active === "Latest" ? "Newest articles" : "All incoming pieces"}</h2></div><button className="text-button" onClick={() => setShowAll(!showAll)}>{showAll ? "Show less" : "See first 6"} <span>→</span></button></section>}

        {active !== "Settings" && active !== "Brief" && <section className="story-grid">
          {visibleArticles.map((article, index) => {
            const source = article.sourceId ? sourceById.get(article.sourceId) : null;
            return (
            <article className={`story-card ${colors[index % colors.length]}${article.readAt ? " is-read" : " is-unread"}`} key={article.id} role="button" tabIndex={0} onClick={() => openArticle(article)} onKeyDown={(event) => event.key === "Enter" && openArticle(article)}>
              <div className="story-meta"><span className="source-dot"/><span>{source?.name ?? "Saved page"}</span><em>·</em><span>{relativeTime(article.publishedAt ?? article.savedAt)}</span>{!article.readAt && <span className="unread-badge">Unread</span>}<button onClick={(event) => { event.stopPropagation(); toggle(article.id, setSaved); }} aria-label="Save article">{saved.includes(article.id) || article.status === "saved" ? "♥" : "♡"}</button></div>
              <span className="tag">{source?.kind ?? "Manual"}</span><h3>{article.title}</h3><p>{articleSnippet(article)}</p>
              <div className="story-foot"><span>✦ {article.readAt ? "Read" : article.status === "saved" ? "Saved manually" : "Fresh from your RSS list"}</span><div className="story-actions"><button onClick={(event) => { event.stopPropagation(); processInsight(article); }} disabled={processingInsight === article.id}>{insights[article.id]?.summary ? "Summary ready" : processingInsight === article.id ? "Summarizing…" : "Summarize"}</button><button onClick={(event) => { event.stopPropagation(); void setReadState(article, !article.readAt); }}>{article.readAt ? "Mark unread" : "Mark read"}</button><button className="read" onClick={(event) => { event.stopPropagation(); openArticle(article); }}>Open <span>→</span></button></div></div>
            </article>
          )})}
        </section>}

        {active === "Brief" && !dailyBrief && <div className="empty-state">Click <strong>Refresh feeds</strong> to fetch every RSS source and create your first Simplified Chinese daily brief.</div>}
        {active !== "Settings" && active !== "Brief" && !visibleArticles.length && <div className="empty-state">Use Add source to connect an RSS feed, or save a page link, and Daymark will start filling this desk.</div>}

        {active === "Sources" && <section className="sources-panel"><div className="section-heading"><div><p className="eyebrow">FOLLOWING</p><h2>From your sources</h2></div><button className="text-button" onClick={() => setShowCapture(true)}>Add RSS <span>→</span></button></div><div className="source-list">{sources.map((source, index) => <div key={source.id} className="source-row"><span className="source-logo" style={{background: sourceColors[index % sourceColors.length]}}>{source.name.charAt(0).toUpperCase()}</span><div className="source-details"><strong>{source.name}</strong><small>{source.url}</small></div><span>{source.articleCount} articles</span><div className="source-controls"><button onClick={() => openSourceEditor(source)}>Edit</button><button className="remove-source" onClick={() => setSourceToRemove(source)}>Remove</button></div></div>)}</div></section>}
      </section>

      {showCapture && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Add source">
          <div className="capture-modal">
            <div className="modal-head"><div><p className="eyebrow">ADD SOURCE</p><h2>Bring something into Daymark</h2></div><button onClick={() => setShowCapture(false)} aria-label="Close">×</button></div>
            <form onSubmit={addFeed}>
              <label>
                <span>RSS feed</span>
                <input value={feedUrl} onChange={(event) => setFeedUrl(event.target.value)} placeholder="https://example.com/feed.xml" autoFocus />
              </label>
              <p className="feed-help">We’ll read the RSS feed and use its title as the source name.</p>
              <button disabled={busy || !feedUrl.trim()}>Add + refresh</button>
            </form>
            <form onSubmit={saveLink}>
              <label>
                <span>Page title</span>
                <input value={linkTitle} onChange={(event) => setLinkTitle(event.target.value)} placeholder="Article title" />
              </label>
              <label>
                <span>Page URL</span>
                <input value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://..." />
              </label>
              <button disabled={busy || !linkTitle.trim() || !linkUrl.trim()}>Save link</button>
            </form>
          </div>
        </div>
      )}

      {editingSource && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Edit source"><div className="capture-modal source-editor"><div className="modal-head"><div><p className="eyebrow">EDIT SOURCE</p><h2>{editingSource.name}</h2></div><button onClick={() => setEditingSource(null)} aria-label="Close">×</button></div><form onSubmit={saveSource}><label><span>Source name</span><input autoFocus value={sourceName} onChange={(event) => setSourceName(event.target.value)} required /></label><label><span>RSS feed</span><input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} required /></label><button disabled={busy}>Save changes</button></form></div></div>}

      {sourceToRemove && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Remove source"><div className="capture-modal confirm-modal"><p className="eyebrow">REMOVE SOURCE</p><h2>Remove {sourceToRemove.name}?</h2><p>Its imported articles will remain in your reading list.</p><div className="dialog-actions"><button className="secondary-button" onClick={() => setSourceToRemove(null)} disabled={busy}>Keep source</button><button className="danger-button" onClick={() => void removeSource()} disabled={busy}>Remove source</button></div></div></div>}

      {selectedArticle && (
        <div className="modal-backdrop reader-backdrop" role="dialog" aria-modal="true" aria-label="Article reader" onClick={() => setSelectedArticle(null)}>
          <article className="reader-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><p className="eyebrow">{selectedSource?.name ?? "SAVED PAGE"} · {relativeTime(selectedArticle.publishedAt ?? selectedArticle.savedAt)}</p><h2>{selectedArticle.title}</h2></div><button onClick={() => setSelectedArticle(null)} aria-label="Close">×</button></div>
            <div className="reader-body">
              <p>{selectedArticle.content || "Daymark does not have the full article text yet. RSS feeds often include only a preview; the upcoming page capture flow will save full page content for local reading and DeepSeek processing."}</p>
            </div>
            {selectedInsight && (
              <section className="insight-panel">
                <div>
                  <p className="eyebrow">中文大纲</p>
                  <OutlineSummary markdown={selectedInsight.summary} />
                </div>
                <small>{selectedInsight.provider} · score {selectedInsight.score ?? "n/a"}</small>
              </section>
            )}
            <div className="reader-actions"><button onClick={() => processInsight(selectedArticle)} disabled={processingInsight === selectedArticle.id}>{selectedInsight?.summary ? "Summary ready" : processingInsight === selectedArticle.id ? "Summarizing…" : "Summarize"}</button><button className="secondary-button" onClick={() => void setReadState(selectedArticle, !selectedArticle.readAt)}>{selectedArticle.readAt ? "Mark unread" : "Mark read"}</button><a href={selectedArticle.canonicalUrl} target="_blank" rel="noreferrer">Open original source ↗</a></div>
          </article>
        </div>
      )}
    </main>
  );
}
