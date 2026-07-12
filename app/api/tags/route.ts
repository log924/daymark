import { asc, count, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { bookTags, tags } from "../../../db/schema";
import { ensureDatabase } from "../../../lib/bootstrap";
import { toRouteErrorMessage } from "../../../lib/route-errors";

export async function GET() {
  try {
    await ensureDatabase();
    const rows = await getDb().select({ id: tags.id, name: tags.name, bookCount: count(bookTags.bookId) }).from(tags).leftJoin(bookTags, eq(bookTags.tagId, tags.id)).groupBy(tags.id).orderBy(desc(count(bookTags.bookId)), asc(tags.name));
    return Response.json({ tags: rows });
  } catch (error) { return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 }); }
}
