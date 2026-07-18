import { desc, isNotNull } from "drizzle-orm";
import { getDb } from "../../../db";
import { dailyBriefs } from "../../../db/schema";
import { ensureDatabase } from "../../../lib/bootstrap";
import { toRouteErrorMessage } from "../../../lib/route-errors";

export async function GET() {
  try {
    await ensureDatabase();
    const briefs = await getDb().select().from(dailyBriefs).where(isNotNull(dailyBriefs.issueDate)).orderBy(desc(dailyBriefs.issueDate)).limit(90);
    return Response.json({ briefs });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
