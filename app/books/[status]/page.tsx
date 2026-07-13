"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Book = {
  id: string;
  title: string;
  author: string | null;
  canonicalUrl: string | null;
  coverUrl: string | null;
  description: string | null;
  status: "read" | "reading" | "to_read";
  createdAt: number;
  statusChangedAt: number | null;
};

const statusDetails = {
  reading: { label: "Reading now", eyebrow: "CURRENTLY READING" },
  to_read: { label: "To be read", eyebrow: "READING LIST" },
  read: { label: "Read", eyebrow: "READING HISTORY" },
} as const;

function bookCoverSrc(coverUrl: string) {
  try {
    const url = new URL(coverUrl);
    return url.hostname === "doubanio.com" || url.hostname.endsWith(".doubanio.com")
      ? `/api/books/cover?url=${encodeURIComponent(coverUrl)}`
      : coverUrl;
  } catch {
    return coverUrl;
  }
}

function displayAuthor(author: string | null) {
  const cleaned = author?.replace(/^[\s:：]+/, "").replace(/\[[^\]]*\]/g, "").replace(/【[^】]*】/g, "").replace(/\s+/g, " ").trim();
  return cleaned || "Author unknown";
}

export default function BookStatusPage() {
  const params = useParams<{ status: string }>();
  const status = params.status as keyof typeof statusDetails;
  const details = statusDetails[status];
  const [books, setBooks] = useState<Book[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!details) return;
    fetch("/api/books")
      .then(async (response) => {
        const payload = await response.json() as { books?: Book[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Unable to load books");
        setBooks(payload.books ?? []);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load books"))
      .finally(() => setLoading(false));
  }, [details]);

  const matchingBooks = useMemo(() => books.filter((book) => book.status === status), [books, status]);

  if (!details) {
    return <main className="book-status-page"><p>That book shelf does not exist. <Link href="/">Return home</Link>.</p></main>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Daymark home"><span>✦</span> daymark</Link>
        <nav aria-label="Main navigation">
          <Link className="nav-item" href="/"><span>◒</span>Brief</Link>
          <Link className="nav-item" href="/"><span>◷</span>Latest</Link>
          <Link className="nav-item" href="/"><span>◉</span>Sources</Link>
          <Link className="nav-item" href="/"><span>♡</span>Saved</Link>
          <Link className="nav-item" href="/"><span>✓</span>Read</Link>
          <Link className="nav-item active" href="/"><span>▤</span>Books</Link>
          <Link className="nav-item" href="/"><span>⚙</span>Settings</Link>
        </nav>
        <div className="sidebar-spacer" />
        <div className="profile"><div className="avatar">Y</div><div><strong>Your reading desk</strong><small>Personal library</small></div></div>
      </aside>

      <section className="content" id="top">
        <header className="topbar"><div className="crumb"><span className="sun">☀</span><span>{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</span><em>•</em><span>Your reading shelf</span></div></header>
        <main className="book-status-page">
          <Link className="back-to-shelf" href="/">← Back to your reading shelf</Link>
          <header className="book-status-heading">
            <p className="eyebrow">{details.eyebrow}</p>
            <h1>{details.label}</h1>
            <p>{loading ? "Loading your books…" : `${matchingBooks.length} ${matchingBooks.length === 1 ? "book" : "books"} on this shelf`}</p>
          </header>

          {error && <p className="book-status-message">{error}</p>}
          {!loading && !error && <section className="book-status-list" aria-label={`${details.label} books`}>
            {matchingBooks.map((book) => <article className="book-status-card" key={book.id}>
              {book.coverUrl ? <img src={bookCoverSrc(book.coverUrl)} alt="" /> : <div className="book-status-spine" aria-hidden="true">{book.title.slice(0, 1)}</div>}
              <div>
                <p className="eyebrow">{displayAuthor(book.author)}</p>
                <h2><Link href={`/?book=${encodeURIComponent(book.id)}`}>{book.title}</Link></h2>
                {book.description && <p className="book-status-description">{book.description}</p>}
              </div>
            </article>)}
            {!matchingBooks.length && <p className="empty-books">Nothing here yet.</p>}
          </section>}
        </main>
      </section>
    </div>
  );
}
