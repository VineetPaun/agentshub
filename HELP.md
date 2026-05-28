# HELP.md
# Notes for future agents working on this project

## Surprises & Gotchas

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
- **Problem**: The app will throw `"E2B_TEMPLATE_ID is not set"` if you try to run an agent without building the Dockerfile first.
- **Fix**: Follow the README setup guide to `npx e2b template build` and set `E2B_TEMPLATE_ID` in `.env.local`.

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
