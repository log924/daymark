import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { dailyBriefs } from "../../../db/schema";
import { ensureDatabase } from "../../../lib/bootstrap";
import { toRouteErrorMessage } from "../../../lib/route-errors";

export async function GET() {
  try {
    await ensureDatabase();
    const [brief] = await getDb().select().from(dailyBriefs).orderBy(desc(dailyBriefs.createdAt)).limit(1);
    return Response.json({ brief: brief ?? null });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
