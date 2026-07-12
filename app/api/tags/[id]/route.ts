import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { bookTags, books, tags } from "../../../../db/schema";
import { ensureDatabase } from "../../../../lib/bootstrap";
import { toRouteErrorMessage } from "../../../../lib/route-errors";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureDatabase(); const { id } = await context.params; const db = getDb();
    const [tag] = await db.select().from(tags).where(eq(tags.id, id)).limit(1);
    if (!tag) return Response.json({ error: "Tag not found" }, { status: 404 });
    const rows = await db.select({ book: books }).from(bookTags).innerJoin(books, eq(bookTags.bookId, books.id)).where(eq(bookTags.tagId, id));
    return Response.json({ tag, books: rows.map((row) => row.book) });
  } catch (error) { return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 }); }
}
