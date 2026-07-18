import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

// This identifier is only for Miniflare's local D1 simulation. It must never
// be the production D1 database ID, so local development cannot accidentally
// target remote reading data.
const LOCAL_D1_DATABASE_ID = "00000000-0000-0000-0000-000000000001";
const PRODUCTION_D1_DATABASE_ID = "eb1b83fe-e7a6-4f4c-b185-9efa6d5900d5";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

function bindingConfig(isProductionBuild: boolean) {
  return {
    main: "./worker/index.ts",
    compatibility_flags: ["nodejs_compat"],
    d1_databases: d1
      ? [
          {
            binding: d1,
            database_name: isProductionBuild ? "daymark-db" : "goreader-local",
            database_id: isProductionBuild ? PRODUCTION_D1_DATABASE_ID : LOCAL_D1_DATABASE_ID,
          },
        ]
      : [],
    r2_buckets: r2
      ? [
          {
            binding: r2,
            bucket_name: "site-creator-r2",
          },
        ]
      : [],
  };
}

export default defineConfig(async ({ command }) => {
  const isProductionBuild = command === "build";
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: bindingConfig(isProductionBuild),
        // Keep Miniflare state inside this repository and never proxy bindings
        // to Cloudflare while `npm run dev` is running.
        persistState: { path: ".wrangler/goreader-local" },
        remoteBindings: false,
      }),
    ],
  };
});
