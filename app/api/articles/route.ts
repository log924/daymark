import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { articles } from "../../../db/schema";
import { ensureDatabase } from "../../../lib/bootstrap";
import { toRouteErrorMessage } from "../../../lib/route-errors";

export async function GET() {
  try {
    await ensureDatabase();
    const db = getDb();
    const rows = await db
      .select()
      .from(articles)
      .orderBy(desc(articles.publishedAt), desc(articles.savedAt))
      .limit(100);

    return Response.json({ articles: rows });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
