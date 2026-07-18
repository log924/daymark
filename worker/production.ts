/**
 * Production-only wrapper. `vinext build` emits the application Worker to
 * dist/server/index.js; this file adds Cloudflare Cron handling around it.
 * Keep the development entry in worker/index.ts so Vite can provide its RSC
 * virtual modules during `npm run dev`.
 */
import app from "../dist/server/index.js";
import { generateDailyIssue } from "../lib/daily-issue";
import { refreshAllSources } from "../lib/feed-refresh";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  DEEPSEEK_API_KEY?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface ScheduledController {
  cron: string;
  scheduledTime: number;
}

const productionWorker = {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },

  async scheduled(_controller: ScheduledController, _env: Env, ctx: ExecutionContext) {
    ctx.waitUntil((async () => {
      await refreshAllSources();
      await generateDailyIssue({ model: "deepseek-v4-flash" });
    })());
  },
};

export default productionWorker;
