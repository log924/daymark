# vinext-starter

A clean full-stack starter running on
[vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and
Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

## Local development

`npm run dev` runs against a separate, persistent local D1 database under
`.wrangler/goreader-local`. It never reads or writes the Cloudflare D1 database
used in production.

The local database creates its own tables automatically on the first request.
To start with a fresh reading desk, stop the dev server and remove only the
`.wrangler/goreader-local` directory.

To populate the local desk with the current production data, run:

```bash
npm run db:sync-remote -- --replace
```

This command is one-way: it only reads Cloudflare D1, exports it, then replaces
the local debug database. The previous local state is moved to a timestamped
backup beside it, and the command has no path that writes to the remote database.

For DeepSeek summaries and daily briefs, copy `.dev.vars.example` to
`.dev.vars`, then set your own `DEEPSEEK_API_KEY`. The local file is ignored by
Git and is loaded only for local development. Production continues to use the
Cloudflare Worker secret with the same name.

## Daily editions

Manual **Refresh feeds** only imports new RSS entries into the reading inbox.
It never changes the current daily edition.

The production Worker has a `scheduled` handler ready for a Cloudflare Cron
trigger. Configure `0 22 * * *` (UTC) to refresh feeds and publish the 06:00
Asia/Shanghai edition. Each edition covers articles imported during the
preceding 24 hours (from 06:00 to 06:00 Beijing time). GoReader keeps only the
current issue and replaces it at the next scheduled run.

For local visual testing, open Brief and choose **Preview today**. This
explicitly rebuilds only the current issue; it does not fetch feeds. With no
local DeepSeek key, the edition still renders from the deterministic reading
path and uses an AI-summary fallback.

## Cloudflare Workers deployment

The committed `wrangler.jsonc` targets the production `daymark-db` D1 binding
and includes the 06:00 Asia/Shanghai daily-edition Cron trigger. After
authenticating Wrangler with the intended Cloudflare account, deploy with:

```bash
npm run deploy:cloudflare
```

Set `DEEPSEEK_API_KEY` as a Worker secret in Cloudflare before the first
scheduled edition. Do not commit it in any configuration file.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the starter and verify its rendered loading skeleton
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
