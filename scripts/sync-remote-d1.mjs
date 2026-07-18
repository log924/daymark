import { access, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const args = new Set(process.argv.slice(2));
if (!args.has("--replace")) {
  throw new Error("This replaces the local debug database. Run: npm run db:sync-remote -- --replace");
}

const projectRoot = resolve(import.meta.dirname, "..");
const wrangler = resolve(projectRoot, "node_modules/.bin/wrangler");
const remoteDatabase = process.env.GOREADER_REMOTE_D1_NAME || "daymark-db";
const localState = resolve(projectRoot, ".wrangler/goreader-local");
const localConfig = resolve(projectRoot, "wrangler.local.jsonc");
const backupDirectory = `${localState}.backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const scratch = await mkdtemp(join(tmpdir(), "goreader-d1-sync-"));
const exportFile = join(scratch, "remote.sql");

function run(commandArgs) {
  execFileSync(wrangler, commandArgs, { cwd: projectRoot, stdio: "inherit" });
}

try {
  // Cloudflare export is read-only. There is deliberately no remote execute or
  // import step anywhere in this script.
  run(["d1", "export", remoteDatabase, "--remote", "--output", exportFile, "--skip-confirmation"]);

  try {
    await access(localState);
    await rename(localState, backupDirectory);
    console.log(`Backed up the previous local database to ${backupDirectory}`);
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
  }

  await mkdir(localState, { recursive: true });
  run(["d1", "execute", "DB", "--local", "--persist-to", localState, "--config", localConfig, "--file", exportFile]);
  console.log(`Synced ${remoteDatabase} into the local GoReader database.`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
