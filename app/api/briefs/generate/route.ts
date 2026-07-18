import { generateDailyIssue } from "../../../../lib/daily-issue";
import type { DeepSeekModel } from "../../../../lib/ai";
import { toRouteErrorMessage } from "../../../../lib/route-errors";

const models: DeepSeekModel[] = ["deepseek-v4-flash", "deepseek-v4-pro", "deepseek-chat", "deepseek-reasoner"];

/** Explicit local-preview/backfill endpoint. It does not refresh RSS feeds. */
export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { apiKey?: string; model?: DeepSeekModel; force?: boolean };
    const generated = await generateDailyIssue({
      apiKey: payload.apiKey,
      model: models.includes(payload.model as DeepSeekModel) ? payload.model as DeepSeekModel : "deepseek-v4-flash",
    }, { force: payload.force });
    return Response.json(generated);
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
