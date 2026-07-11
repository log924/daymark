import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const sources = sqliteTable("sources", {
  id: text("id").primaryKey(), name: text("name").notNull(), url: text("url").notNull(), kind: text("kind").notNull(), createdAt: integer("created_at").notNull(),
});
export const articles = sqliteTable("articles", {
  id: text("id").primaryKey(), sourceId: text("source_id").references(() => sources.id), title: text("title").notNull(), canonicalUrl: text("canonical_url").notNull(), content: text("content"), publishedAt: integer("published_at"), savedAt: integer("saved_at"), status: text("status").notNull().default("new"),
});
export const articleInsights = sqliteTable("article_insights", {
  id: text("id").primaryKey(), articleId: text("article_id").notNull().references(() => articles.id), provider: text("provider").notNull(), summary: text("summary"), translationZh: text("translation_zh"), score: integer("score"), createdAt: integer("created_at").notNull(),
});
