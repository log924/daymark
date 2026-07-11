import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { articles } from "../../../../db/schema";
import { ensureDatabase } from "../../../../lib/bootstrap";
import { toRouteErrorMessage } from "../../../../lib/route-errors";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    await ensureDatabase();
    const { id } = await params;
    const payload = (await request.json()) as { read?: boolean };
    if (typeof payload.read !== "boolean") {
      return Response.json({ error: "read must be a boolean" }, { status: 400 });
    }

    const [article] = await getDb().update(articles).set({ readAt: payload.read ? Date.now() : null }).where(eq(articles.id, id)).returning();
    if (!article) {
      return Response.json({ error: "Article not found" }, { status: 404 });
    }
    return Response.json({ article });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
