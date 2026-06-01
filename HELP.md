# HELP.md
# Notes for future agents working on this project

## Surprises & Gotchas

### 0. Workspace rule references `PLAN.md`, but file may be missing
- **Problem**: Workspace rules require phase tracking in `PLAN.md`, but this file can be absent in some branches.
- **Fix**: If missing, proceed with phase tracking in the active planning workflow and record completion/surprises in `HELP.md`.

### 1. E2B CLI — correct invocation (IMPORTANT)
- **Problem**: `npx e2b` fails with "could not determine executable to run". The `e2b` npm package is the SDK, not the CLI — it has no binary.
- **Fix**: Use the full scoped package name: `npx -y @e2b/cli@latest`
- **Also**: The v1 command `template build` requires Docker locally and is deprecated. Use the v2 command instead:
  ```bash
  # ❌ Wrong (old docs, requires Docker)
  npx e2b template build --dockerfile ./Dockerfile.sandbox --name agent-sandbox

  # ✅ Correct (v2 — builds on E2B servers, no Docker needed)
  npx -y @e2b/cli@latest template create agent-sandbox --dockerfile ./Dockerfile.sandbox
  ```

### 2. OpenCode Linux binary is a tarball, not a bare file
- **Problem**: The Dockerfile originally tried to download `opencode-linux-x64` as a bare binary. This 404s because the asset is a tarball.
- **Also**: Downloads are served from `github.com/anomalyco/opencode` (a mirror), not `github.com/sst/opencode`. The sst API returns the version tag but the actual assets are under anomalyco.
- **Asset name**: `opencode-linux-x64.tar.gz` — extracts to a single file named `opencode`
- **Fix in Dockerfile.sandbox**:
  ```dockerfile
  RUN OPENCODE_VERSION=$(curl -fsSL https://api.github.com/repos/sst/opencode/releases/latest \
          | grep '"tag_name"' | cut -d'"' -f4) \
      && curl -fsSL \
          "https://github.com/anomalyco/opencode/releases/download/${OPENCODE_VERSION}/opencode-linux-x64.tar.gz" \
          -o /tmp/opencode.tar.gz \
      && tar -xzf /tmp/opencode.tar.gz -C /tmp \
      && mv /tmp/opencode /usr/local/bin/opencode \
      && chmod +x /usr/local/bin/opencode \
      && rm /tmp/opencode.tar.gz
  ```

### 3. lucide-react v1.x — No `Github` icon
- **Problem**: `lucide-react@1.16.0` does not export a `Github` icon (unlike older v0.x).
- **Symptom**: Build error — "Export Github doesn't exist in target module"
- **Fix**: Use `GitBranch` or `GitFork` instead. To check all available icons:
  ```bash
  node -e "const l = require('lucide-react'); console.log(Object.keys(l).join(', '))"
  ```

### 2. BetterAuth module augmentation conflict
- **Problem**: Trying to extend `better-auth`'s `Session` interface via `declare module "better-auth"` in `types/index.ts` caused a "Duplicate identifier 'Session'" TypeScript error.
- **Fix**: Remove the `declare module` block from `types/index.ts`. BetterAuth's `additionalFields` config in `lib/auth.ts` handles the runtime token storage; cast to `Record<string, unknown>` in API routes to access it.

### 3. BetterAuth session token access — not a standard field
- **Problem**: BetterAuth (unlike NextAuth) does not automatically surface the GitHub OAuth `access_token` in the session without extra configuration.
- **How it's handled**: The `auth.ts` config declares `githubAccessToken` as an `additionalField`. In API routes, read it by casting `session.session as Record<string, unknown>` and accessing `.githubAccessToken`.
- **Production note**: For real persistence, use a BetterAuth database adapter (Prisma / Drizzle / etc.) so sessions survive server restarts.

### 3a. BetterAuth account listing does not include OAuth tokens
- **Problem**: `auth.api.listUserAccounts()` returns linked-account metadata only. It does **not** include `accessToken`, so `/api/repos` can fail with `"GitHub access token missing from account"` even when the GitHub account is linked.
- **Fix**: Use `getGitHubAccessToken()` from `lib/github-token.ts` in server routes that need the GitHub OAuth token, then pass that token to Octokit.
- **TypeScript note**: In `better-auth@1.6.11`, the generated API type can be narrow enough that the token response needs an `unknown` cast before reading `accessToken`.

### 3b. E2B sandbox user cannot write to `/repo`
- **Problem**: Cloning into `/repo` can fail with `fatal: could not create work tree dir '/repo': Permission denied` because the sandbox process runs as an unprivileged user.
- **Fix**: Use a writable path under the sandbox user's home directory, currently `/home/user/repo`.

### 4. E2B template ID required at runtime
- **Problem**: The app will throw `"E2B_TEMPLATE_ID is not set"` if you try to run an agent without creating the Dockerfile-backed E2B template first.
- **Fix**: Follow the README setup guide to run `bun run sandbox:template:create` and set `E2B_TEMPLATE_ID` in `.env.local` to the template name or ID shown in E2B's SDK example, such as `agent-sandbox`.

### 5. BetterAuth warning during `next build`
- **Expected**: During `next build`, `[Error [BetterAuthError]: You are using the default secret]` is printed. This is non-fatal — it's BetterAuth warning you that `BETTER_AUTH_SECRET` isn't set in the build environment. The app works fine at runtime when `.env.local` is present.

### 6. Next.js 16 uses Turbopack by default
- **Note**: `next dev` and `next build` both use Turbopack. If you encounter module resolution issues, try `next dev --no-turbo` to fall back to Webpack temporarily.

### 7. sessionStorage used for apiKey handoff
- **Pattern**: Dashboard → Run page handoff stores `{ repoFullName, agent, apiKey }` in `sessionStorage`.
- **Security**: The `apiKey` is cleared from sessionStorage immediately after being read by the Run page. It is sent server-side in the POST body to `/api/agent/run` and never returned to the client.

### 8. CLI agents — headless invocation requires explicit write permissions (CRITICAL)
- **Problem**: All three CLI agents default to **read-only** when run headless, so they cannot make file changes.
- **Gemini CLI**: `-p` alone defaults to Plan Mode (read-only). Must add `--yolo` to auto-approve write operations, and `--skip-trust` for untrusted sandbox directories.
  ```bash
  # ❌ Wrong — defaults to plan mode, all write tools blocked
  gemini -p 'prompt'
  # ✅ Correct
  gemini --skip-trust --yolo -p 'prompt'
  ```
- **Codex CLI**: `codex exec` defaults to `--sandbox read-only`. Must add `--sandbox workspace-write` to allow file edits.
  ```bash
  # ❌ Wrong — read-only, cannot create/edit files
  codex exec 'prompt'
  # ✅ Correct
  codex exec --sandbox workspace-write 'prompt'
  ```
- **OpenCode**: `opencode run` auto-approves all writes (no extra flag needed). But `--print` does NOT exist — remove it if present.
  ```bash
  # ❌ Wrong — --print is not a valid flag
  opencode run --print 'prompt'
  # ✅ Correct
  opencode run 'prompt'
  ```

### 9. `pnpm dlx` may fail in sandboxed runs
- **Problem**: `pnpm dlx ...` can fail with `EPERM` when trying to write to user cache paths outside workspace.
- **Fix**: Re-run the command with elevated permissions (outside sandbox) when installing shadcn registry components.

### 10. Convex codegen needs a linked deployment
- **Problem**: `bunx convex codegen` fails with `No CONVEX_DEPLOYMENT set` until the project is linked with `bunx convex dev`.
- **Current workaround**: This repo includes minimal local fallback files in `convex/_generated/` so Next.js can type-check before linking.
- **Production fix**: Run `bunx convex dev`, set `NEXT_PUBLIC_CONVEX_URL`, set `CONVEX_SERVER_SECRET` in both `.env.local` and Convex env vars, then allow Convex to regenerate `convex/_generated/`.

### 11. Provider keys are encrypted before Convex storage
- **Pattern**: Browser sends provider keys only to `/api/provider-keys`; Next.js encrypts them with `APP_ENCRYPTION_KEY`, then stores only ciphertext in Convex.
- **Important**: Rotating `APP_ENCRYPTION_KEY` invalidates previously stored provider keys unless a migration/decryption window is implemented.

### 12. Runtime warnings can be expected fallback signals
- **Provider-key warning**: If `/api/provider-keys` says Convex provider-key storage is unavailable, Convex env vars were detected but a Convex mutation/query failed. Check the linked deployment, deployed Convex functions, and that `CONVEX_SERVER_SECRET` matches both `.env.local` and Convex env.
- **Run-history warning**: `/api/agent/run` can continue with a one-time provider key when Convex run/chat persistence fails. The run will work, but history, messages, and PR metadata may not persist.
- **User stream UX**: `/api/agent/run` streams raw stdout/stderr so users can see runtime tool/progress logs. Avoid reintroducing broad CLI-output suppression unless the UI exposes a separate raw log view.
- **Ripgrep warning**: `Dockerfile.sandbox` installs `ripgrep`; if agent output still mentions missing `rg`, the active `E2B_TEMPLATE_ID` likely points to an older template. Recreate the E2B template and update the env var.

### 13. Agent sandboxes are now user-controlled after runs
- **Problem**: Killing the E2B sandbox in `/api/agent/run` immediately after completion broke follow-up prompts because the next request had to clone a fresh workspace.
- **Fix**: `/api/agent/run` emits a `sandbox` SSE event with the E2B sandbox ID and keeps it alive. Continuations reconnect with `Sandbox.connect(sandboxId)`, and `/api/sandbox/destroy` kills the sandbox only when the user chooses a destroy option.
- **UX note**: The run page intentionally offers three post-run choices: create PR and destroy sandbox, create PR and continue conversation, or destroy sandbox without creating a PR.
