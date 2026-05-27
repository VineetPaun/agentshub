# AgentsHub

> Run AI coding agents on your GitHub repos — live-stream output, review the diff, open a PR in one click.

---

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│  Browser (Next.js App Router)                                  │
│                                                                │
│  /               Landing + GitHub OAuth CTA                    │
│  /dashboard      Repo picker + Agent selector                  │
│  /run            Prompt input + Live SSE terminal + PR button  │
└────────────────────────┬───────────────────────────────────────┘
                         │ HTTPS / SSE
┌────────────────────────▼───────────────────────────────────────┐
│  Next.js API Routes (Edge-compatible)                          │
│                                                                │
│  /api/auth/[...betterauth]   GitHub OAuth (BetterAuth)         │
│  /api/repos                  GET  → Octokit listRepos          │
│  /api/agent/run              POST → SSE stream (core)          │
│  /api/pr/create              POST → Octokit pulls.create       │
└────────────────────────┬───────────────────────────────────────┘
                         │ E2B SDK
┌────────────────────────▼───────────────────────────────────────┐
│  E2B Sandbox (Docker — Dockerfile.sandbox)                     │
│                                                                │
│  • git clone --depth=1 (authenticated via OAuth token URL)     │
│  • Run: opencode / gemini / codex  (streaming stdout/stderr)   │
│  • git diff HEAD  →  sent to client                            │
│  • git commit + git push  →  new branch on GitHub             │
└────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Auth | BetterAuth (GitHub OAuth) |
| GitHub API | Octokit `@octokit/rest` |
| Sandbox | E2B `@e2b/code-interpreter` |
| Streaming | Native `ReadableStream` + SSE |
| Package manager | Bun |

---

## Setup

### 1. Clone & install

```bash
git clone https://github.com/your-username/agentshub.git
cd agentshub
bun install
```

### 2. Environment variables

```bash
cp .env.local.example .env.local
```

Fill in `.env.local`:

| Key | Where to get it |
|---|---|
| `GITHUB_CLIENT_ID` | [github.com/settings/developers](https://github.com/settings/developers) → New OAuth App |
| `GITHUB_CLIENT_SECRET` | Same OAuth App settings page |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `E2B_API_KEY` | [e2b.dev/dashboard](https://e2b.dev/dashboard) |
| `E2B_TEMPLATE_ID` | After step 3 below |

**GitHub OAuth App settings:**
- Homepage URL: `http://localhost:3000`
- Authorization callback URL: `http://localhost:3000/api/auth/callback/github`

### 3. Build the E2B sandbox template

The agents (OpenCode, Gemini CLI, Codex CLI) run inside a Docker container managed by E2B.
Build and push the image once:

```bash
# Install E2B CLI
npm install -g @e2b/cli

# Log in
npx e2b auth login

# Build the template (from project root, takes ~3-5 min)
npx e2b template build --dockerfile ./Dockerfile.sandbox --name agent-sandbox

# E2B prints something like:
#   ✓ Template built: e2b-template-abc123
# Add to .env.local:
#   E2B_TEMPLATE_ID=e2b-template-abc123
```

### 4. Run locally

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## How to rebuild the E2B template

When a new CLI version ships, rebuild the template:

```bash
# Pull latest changes to Dockerfile.sandbox, then:
npx e2b template build --dockerfile ./Dockerfile.sandbox --name agent-sandbox

# Update E2B_TEMPLATE_ID in .env.local with the new template ID
```

The template ID is **not** a secret — it's safe to commit once set.

---

## Known Limitations

| Limitation | Detail |
|---|---|
| **Vercel timeout** | Free tier serverless functions time out at 60s. Agent runs can take 2-4 min. You need Vercel **Pro** (300s) or host elsewhere. |
| **Large repos** | We clone with `--depth=1` to minimise clone time. Agents that need full git history may behave differently. |
| **No session persistence** | BetterAuth uses in-memory storage by default. Swap to a database adapter for production. |
| **Single concurrent run** | Each run spins up a dedicated E2B sandbox. There's no queue — users can run multiple tabs simultaneously (each bills independently). |
| **OpenCode binary name** | Verify the binary name against [github.com/sst/opencode/releases](https://github.com/sst/opencode/releases) before rebuilding the Dockerfile. |

---

## Project Structure

```
├── app/
│   ├── layout.tsx                    Root layout (dark theme, fonts, metadata)
│   ├── page.tsx                      Landing page
│   ├── globals.css                   Design system tokens
│   ├── dashboard/page.tsx            Post-login hub
│   ├── run/page.tsx                  Agent run page
│   └── api/
│       ├── auth/[...betterauth]/     BetterAuth GitHub OAuth handlers
│       ├── repos/route.ts            GET: list repos
│       ├── agent/run/route.ts        POST: SSE streaming agent run
│       └── pr/create/route.ts        POST: open GitHub PR
├── components/
│   ├── LandingConnectButton.tsx      GitHub OAuth CTA
│   ├── DashboardClient.tsx           Dashboard client shell
│   ├── RepoSelector.tsx              Searchable repo list
│   ├── AgentSelector.tsx             Three-card agent picker + API key input
│   ├── PromptInput.tsx               Prompt textarea with char count
│   ├── StreamOutput.tsx              Live-scrolling terminal output
│   ├── DiffViewer.tsx                Syntax-highlighted git diff
│   └── PRButton.tsx                  GitHub PR creation button
├── lib/
│   ├── auth.ts                       BetterAuth server config
│   ├── auth-client.ts                BetterAuth React client
│   ├── github.ts                     Octokit helpers
│   ├── sandbox.ts                    E2B helpers
│   └── agents.ts                     CLI command builders
├── types/index.ts                    Shared TypeScript types
├── Dockerfile.sandbox                E2B sandbox image
└── .env.local.example                Environment variable template
```
