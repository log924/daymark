import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const sources = sqliteTable("sources", {
  id: text("id").primaryKey(), name: text("name").notNull(), url: text("url").notNull(), kind: text("kind").notNull(), createdAt: integer("created_at").notNull(),
});
export const articles = sqliteTable("articles", {
  id: text("id").primaryKey(), sourceId: text("source_id").references(() => sources.id), title: text("title").notNull(), canonicalUrl: text("canonical_url").notNull(), content: text("content"), publishedAt: integer("published_at"), savedAt: integer("saved_at"), readAt: integer("read_at"), status: text("status").notNull().default("new"),
});
export const articleInsights = sqliteTable("article_insights", {
  id: text("id").primaryKey(), articleId: text("article_id").notNull().references(() => articles.id), provider: text("provider").notNull(), summary: text("summary"), translationZh: text("translation_zh"), score: integer("score"), createdAt: integer("created_at").notNull(),
});
export const dailyBriefs = sqliteTable("daily_briefs", {
  id: text("id").primaryKey(),
  summary: text("summary").notNull(),
  keyInsights: text("key_insights").notNull().default("[]"),
  recommendations: text("recommendations").notNull(),
  articleIds: text("article_ids").notNull(),
  createdAt: integer("created_at").notNull(),
});
export const books = sqliteTable("books", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  author: text("author"),
  canonicalUrl: text("canonical_url"),
  coverUrl: text("cover_url"),
  description: text("description"),
  subjects: text("subjects"),
  isbn: text("isbn"),
  publishedYear: text("published_year"),
  status: text("status").notNull().default("to_read"),
  statusChangedAt: integer("status_changed_at"),
  personalRating: integer("personal_rating"),
  interestScore: integer("interest_score"),
  analysis: text("analysis"),
  aiTags: text("ai_tags"),
  connections: text("connections"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull().unique(),
  createdAt: integer("created_at").notNull(),
});
export const bookTags = sqliteTable("book_tags", {
  bookId: text("book_id").notNull().references(() => books.id),
  tagId: text("tag_id").notNull().references(() => tags.id),
  createdAt: integer("created_at").notNull(),
}, (table) => [primaryKey({ columns: [table.bookId, table.tagId] })]);
