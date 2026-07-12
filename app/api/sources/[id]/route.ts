import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { articles, sources } from "../../../../db/schema";
import { ensureDatabase } from "../../../../lib/bootstrap";
import { toRouteErrorMessage } from "../../../../lib/route-errors";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Params) {
  try {
    await ensureDatabase();
    const { id } = await context.params;
    const payload = (await request.json()) as { name?: string; url?: string };
    const name = payload.name?.trim() ?? "";
    const rawUrl = payload.url?.trim() ?? "";
    if (!name || !rawUrl) return Response.json({ error: "name and URL are required" }, { status: 400 });
    let url: string;
    try { url = new URL(rawUrl).toString(); } catch { return Response.json({ error: "URL must be valid" }, { status: 400 }); }
    const db = getDb();
    const [source] = await db.update(sources).set({ name, url }).where(eq(sources.id, id)).returning();
    if (!source) return Response.json({ error: "source not found" }, { status: 404 });
    return Response.json({ source });
  } catch (error) { return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 }); }
}

export async function DELETE(_request: Request, context: Params) {
  try {
    await ensureDatabase();
    const { id } = await context.params;
    const db = getDb();
    await db.update(articles).set({ sourceId: null }).where(eq(articles.sourceId, id));
    const [source] = await db.delete(sources).where(eq(sources.id, id)).returning();
    if (!source) return Response.json({ error: "source not found" }, { status: 404 });
    return Response.json({ source });
  } catch (error) { return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 }); }
}
