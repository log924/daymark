import { getD1 } from "../db";

let bootstrapped = false;

export async function ensureDatabase() {
  if (bootstrapped) {
    return;
  }

  const d1 = getD1();
  await d1.batch([
    d1.prepare(
      "CREATE TABLE IF NOT EXISTS sources (id text PRIMARY KEY NOT NULL, name text NOT NULL, url text NOT NULL, kind text NOT NULL, created_at integer NOT NULL)",
    ),
    d1.prepare(
      "CREATE TABLE IF NOT EXISTS articles (id text PRIMARY KEY NOT NULL, source_id text, title text NOT NULL, canonical_url text NOT NULL, content text, published_at integer, saved_at integer, read_at integer, status text DEFAULT 'new' NOT NULL, FOREIGN KEY (source_id) REFERENCES sources(id))",
    ),
    d1.prepare(
      "CREATE TABLE IF NOT EXISTS article_insights (id text PRIMARY KEY NOT NULL, article_id text NOT NULL, provider text NOT NULL, summary text, translation_zh text, score integer, created_at integer NOT NULL, FOREIGN KEY (article_id) REFERENCES articles(id))",
    ),
    d1.prepare(
      "CREATE TABLE IF NOT EXISTS daily_briefs (id text PRIMARY KEY NOT NULL, summary text NOT NULL, recommendations text NOT NULL, article_ids text NOT NULL, created_at integer NOT NULL)",
    ),
    d1.prepare(
      "CREATE TABLE IF NOT EXISTS books (id text PRIMARY KEY NOT NULL, title text NOT NULL, author text, canonical_url text, cover_url text, description text, subjects text, isbn text, published_year text, status text DEFAULT 'to_read' NOT NULL, status_changed_at integer, personal_rating integer, interest_score integer, analysis text, ai_tags text, connections text, created_at integer NOT NULL, updated_at integer NOT NULL)",
    ),
    d1.prepare("CREATE TABLE IF NOT EXISTS tags (id text PRIMARY KEY NOT NULL, name text NOT NULL, normalized_name text NOT NULL UNIQUE, created_at integer NOT NULL)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS book_tags (book_id text NOT NULL, tag_id text NOT NULL, created_at integer NOT NULL, PRIMARY KEY (book_id, tag_id), FOREIGN KEY (book_id) REFERENCES books(id), FOREIGN KEY (tag_id) REFERENCES tags(id))"),
    d1.prepare("CREATE INDEX IF NOT EXISTS articles_source_idx ON articles(source_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS articles_published_idx ON articles(published_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS books_status_idx ON books(status)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS book_tags_tag_idx ON book_tags(tag_id)"),
  ]);

  try {
    await d1.prepare("ALTER TABLE articles ADD COLUMN read_at integer").run();
  } catch (error) {
    if (!(error instanceof Error) || !/duplicate column name/i.test(error.message)) {
      throw error;
    }
  }

  try {
    await d1.prepare("ALTER TABLE books ADD COLUMN status_changed_at integer").run();
  } catch (error) {
    if (!(error instanceof Error) || !/duplicate column name/i.test(error.message)) {
      throw error;
    }
  }

  for (const column of ["personal_rating integer", "ai_tags text"]) {
    try {
      await d1.prepare(`ALTER TABLE books ADD COLUMN ${column}`).run();
    } catch (error) {
      if (!(error instanceof Error) || !/duplicate column name/i.test(error.message)) throw error;
    }
  }

  bootstrapped = true;
}
