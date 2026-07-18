import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { dailyBriefs } from "../../../db/schema";
import { ensureDatabase } from "../../../lib/bootstrap";
import { dailyIssueWindow } from "../../../lib/daily-issue";
import { toRouteErrorMessage } from "../../../lib/route-errors";

export async function GET() {
  try {
    await ensureDatabase();
    const { issueDate } = dailyIssueWindow();
    const [brief] = await getDb().select().from(dailyBriefs).where(eq(dailyBriefs.issueDate, issueDate)).limit(1);
    return Response.json({ brief: brief ?? null });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
