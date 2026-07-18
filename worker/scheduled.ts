/** Dedicated Cloudflare Cron Worker for the 06:00 Asia/Shanghai daily issue. */
import { generateDailyIssue } from "../lib/daily-issue";
import { refreshAllSources } from "../lib/feed-refresh";

interface ScheduledController {
  cron: string;
  scheduledTime: number;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

const scheduler = {
  async scheduled(_controller: ScheduledController, _env: unknown, ctx: ExecutionContext) {
    ctx.waitUntil((async () => {
      await refreshAllSources();
      await generateDailyIssue({ model: "deepseek-v4-flash" });
    })());
  },
};

export default scheduler;
