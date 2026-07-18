import { refreshAllSources } from "../../../../lib/feed-refresh";
import { toRouteErrorMessage } from "../../../../lib/route-errors";

/** Manual refresh fills the inbox only. Daily editions are scheduler-owned. */
export async function POST() {
  try {
    return Response.json(await refreshAllSources());
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
