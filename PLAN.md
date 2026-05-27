---

## WHAT WE'RE BUILDING

A Next.js web app where users:
1. Connect their GitHub account via OAuth
2. Pick a repository
3. Choose an AI coding agent (OpenCode, Gemini CLI, or Codex CLI)
4. Enter a natural language prompt
5. The agent runs inside an E2B sandbox (pre-built Docker image with all CLIs installed), makes code changes, streams output back live
6. User sees a diff of changes, then clicks a button to open a GitHub PR

---

## TECH STACK — DO NOT DEVIATE

- **Framework**: Next.js 16 with App Router (`/app` directory)
- **Language**: TypeScript throughout — no `any` types
- **Styling**: Tailwind CSS + shadcn templates (dont create any component by yourself, just use shadcn)
- **Auth**: BetterAuth (for GitHub OAuth)
- **Sandbox**: E2B (`@e2b/code-interpreter`)
- **GitHub API**: Octokit (`@octokit/rest`)
- **Streaming**: Native `ReadableStream` + SSE (Server-Sent Events) — no third-party streaming lib
- **State**: React `useState` / `useReducer` — use Redux when needed
- **Package manager**: `bun`

---

## PROJECT STRUCTURE TO CREATE

```
/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                        # Landing / hero page
│   ├── dashboard/
│   │   └── page.tsx                    # Post-login: repo picker + agent selector
│   ├── run/
│   │   └── page.tsx                    # Agent run page: prompt input + live stream + diff + PR button
│   └── api/
│       ├── auth/
│       │   └── [...BetterAuth]/route.ts  # BetterAuth GitHub OAuth
│       ├── repos/
│       │   └── route.ts                # GET: list user's GitHub repos
│       ├── agent/
│       │   └── run/route.ts            # POST: spin E2B sandbox, run CLI, stream SSE output
│       └── pr/
│           └── create/route.ts         # POST: open GitHub PR from agent branch
├── components/
│   ├── RepoSelector.tsx
│   ├── AgentSelector.tsx
│   ├── PromptInput.tsx
│   ├── StreamOutput.tsx                # Live scrolling terminal output
│   ├── DiffViewer.tsx                  # Shows git diff after agent finishes
│   └── PRButton.tsx
├── lib/
│   ├── auth.ts                         # BetterAuth config
│   ├── github.ts                       # Octokit helpers
│   ├── sandbox.ts                      # E2B sandbox helpers
│   └── agents.ts                       # CLI command builders per agent
├── types/
│   └── index.ts                        # Shared TypeScript types
├── Dockerfile.sandbox                  # Docker image baked with all CLIs
├── .env.local.example
└── README.md
```

---

## PHASE 1 — PROJECT INIT & AUTH

### Step 1.1 — Bootstrap

```bash
npx create-next-app@latest agent-platform --typescript --tailwind --app --no-src-dir
cd agent-platform
npm install next-auth@beta @auth/core
npm install @octokit/rest
npm install @e2b/code-interpreter
npm install @uiw/react-codemirror  # for diff viewer
```

### Step 1.2 — Environment variables

Create `.env.local.example` with these keys (user fills in real values):

```env
# GitHub OAuth App (create at github.com/settings/developers)
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# BetterAuth

# E2B
E2B_API_KEY=                        # from e2b.dev dashboard

# Your E2B template ID (filled in after Phase 4 — Dockerfile build)
E2B_TEMPLATE_ID=
```

### Step 1.3 — BetterAuth config (`lib/auth.ts`)

```typescript
import BetterAuth from "next-auth"
import GitHub from "next-auth/providers/github"

export const { handlers, auth, signIn, signOut } = BetterAuth({
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "read:user user:email repo",  // repo scope needed to clone + push
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // Persist the GitHub access token so we can use it server-side
      if (account?.access_token) {
        token.githubAccessToken = account.access_token
      }
      return token
    },
    async session({ session, token }) {
      session.githubAccessToken = token.githubAccessToken as string
      return session
    },
  },
})
```

Create `app/api/auth/[...BetterAuth]/route.ts`:

```typescript
import { handlers } from "@/lib/auth"
export const { GET, POST } = handlers
```

Extend the BetterAuth types in `types/index.ts`:

```typescript
import "next-auth"

declare module "next-auth" {
  interface Session {
    githubAccessToken: string
  }
}

export type AgentType = "opencode" | "gemini" | "codex"

export interface RunRequest {
  repoFullName: string   // e.g. "username/my-repo"
  prompt: string
  agent: AgentType
  apiKey: string         // user's API key for the chosen agent's model provider
}

export interface AgentStreamEvent {
  type: "stdout" | "stderr" | "status" | "diff" | "error" | "done"
  text: string
}
```

**Checkpoint**: `npm run dev` should start without errors. Visiting `/api/auth/signin` should show GitHub login.

---

## PHASE 2 — GITHUB API LAYER

### `lib/github.ts`

```typescript
import { Octokit } from "@octokit/rest"

export function getOctokit(accessToken: string) {
  return new Octokit({ auth: accessToken })
}

export async function listRepos(accessToken: string) {
  const octokit = getOctokit(accessToken)
  const { data } = await octokit.repos.listForAuthenticatedUser({
    sort: "updated",
    per_page: 50,
    affiliation: "owner,collaborator",
  })
  return data.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    private: r.private,
    language: r.language,
    updatedAt: r.updated_at,
    defaultBranch: r.default_branch,
  }))
}

export async function openPR(
  accessToken: string,
  repoFullName: string,
  branch: string,
  title: string,
  body: string
) {
  const octokit = getOctokit(accessToken)
  const [owner, repo] = repoFullName.split("/")
  
  // Get default branch
  const { data: repoData } = await octokit.repos.get({ owner, repo })
  
  const { data: pr } = await octokit.pulls.create({
    owner,
    repo,
    title,
    body,
    head: branch,
    base: repoData.default_branch,
  })
  return pr.html_url
}
```

### `app/api/repos/route.ts`

```typescript
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { listRepos } from "@/lib/github"

export async function GET() {
  const session = await auth()
  if (!session?.githubAccessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const repos = await listRepos(session.githubAccessToken)
  return NextResponse.json(repos)
}
```

---

## PHASE 3 — AGENT SANDBOX LAYER

### `lib/agents.ts`

This file builds the exact CLI command string per agent. Each agent has a different non-interactive invocation pattern.

```typescript
import { AgentType } from "@/types"

interface CLICommandOptions {
  agent: AgentType
  prompt: string
  apiKey: string
  repoPath: string
}

export function buildCLICommand(opts: CLICommandOptions): string {
  const { agent, prompt, apiKey, repoPath } = opts
  // Escape the prompt to prevent shell injection
  const escapedPrompt = prompt.replace(/'/g, "'\\''")

  switch (agent) {
    case "opencode":
      // OpenCode supports --print for non-interactive mode and --model to select provider
      return `cd ${repoPath} && OPENAI_API_KEY=${apiKey} opencode run --print '${escapedPrompt}'`

    case "gemini":
      // Gemini CLI: --non-interactive mode, -p for prompt, reads GEMINI_API_KEY from env
      return `cd ${repoPath} && GEMINI_API_KEY=${apiKey} gemini --non-interactive -p '${escapedPrompt}'`

    case "codex":
      // Codex CLI: exec subcommand for non-interactive one-shot execution
      return `cd ${repoPath} && OPENAI_API_KEY=${apiKey} codex exec '${escapedPrompt}'`

    default:
      throw new Error(`Unknown agent: ${agent}`)
  }
}

export const AGENT_LABELS: Record<AgentType, string> = {
  opencode: "OpenCode",
  gemini: "Gemini CLI",
  codex: "Codex CLI",
}

export const AGENT_KEY_LABELS: Record<AgentType, string> = {
  opencode: "OpenAI API Key (for OpenCode)",
  gemini: "Google AI Studio API Key",
  codex: "OpenAI API Key",
}
```

### `lib/sandbox.ts`

```typescript
import { Sandbox } from "@e2b/code-interpreter"

export async function createSandbox(): Promise<Sandbox> {
  const templateId = process.env.E2B_TEMPLATE_ID
  if (!templateId) throw new Error("E2B_TEMPLATE_ID not set")
  return await Sandbox.create(templateId)
}

export async function cloneRepo(
  sandbox: Sandbox,
  repoFullName: string,
  githubToken: string,
  targetPath: string = "/repo"
): Promise<void> {
  const cloneUrl = `https://oauth2:${githubToken}@github.com/${repoFullName}.git`
  const result = await sandbox.commands.run(
    `git clone --depth=1 ${cloneUrl} ${targetPath}`
  )
  if (result.exitCode !== 0) {
    throw new Error(`git clone failed: ${result.stderr}`)
  }
}

export async function getDiff(sandbox: Sandbox, repoPath: string = "/repo"): Promise<string> {
  const result = await sandbox.commands.run(`cd ${repoPath} && git diff HEAD`)
  return result.stdout
}

export async function commitAndPush(
  sandbox: Sandbox,
  repoPath: string,
  branchName: string,
  commitMessage: string,
  githubToken: string,
  repoFullName: string
): Promise<void> {
  const commands = [
    `cd ${repoPath} && git config user.email "agent@agentplatform.dev"`,
    `cd ${repoPath} && git config user.name "Agent Platform"`,
    `cd ${repoPath} && git checkout -b ${branchName}`,
    `cd ${repoPath} && git add -A`,
    `cd ${repoPath} && git commit -m "${commitMessage}"`,
    `cd ${repoPath} && git push https://oauth2:${githubToken}@github.com/${repoFullName}.git HEAD`,
  ]
  for (const cmd of commands) {
    const result = await sandbox.commands.run(cmd)
    if (result.exitCode !== 0) {
      throw new Error(`Command failed: ${cmd}\n${result.stderr}`)
    }
  }
}
```

### `app/api/agent/run/route.ts` — The core streaming endpoint

```typescript
import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { createSandbox, cloneRepo, getDiff, commitAndPush } from "@/lib/sandbox"
import { buildCLICommand } from "@/lib/agents"
import { RunRequest, AgentStreamEvent } from "@/types"

export const maxDuration = 300 // 5 min — set in next.config for Vercel

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.githubAccessToken) {
    return new Response("Unauthorized", { status: 401 })
  }

  const body: RunRequest = await req.json()
  const { repoFullName, prompt, agent, apiKey } = body

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: AgentStreamEvent) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
        )
      }

      let sandbox = null

      try {
        send({ type: "status", text: "Booting sandbox..." })
        sandbox = await createSandbox()

        send({ type: "status", text: `Cloning ${repoFullName}...` })
        await cloneRepo(sandbox, repoFullName, session.githubAccessToken, "/repo")

        send({ type: "status", text: `Starting ${agent} agent...` })

        const cliCommand = buildCLICommand({
          agent,
          prompt,
          apiKey,
          repoPath: "/repo",
        })

        await sandbox.commands.run(cliCommand, {
          onStdout: (line: string) => send({ type: "stdout", text: line }),
          onStderr: (line: string) => send({ type: "stderr", text: line }),
          timeoutMs: 240_000, // 4 min max for the agent
        })

        send({ type: "status", text: "Agent finished. Collecting diff..." })
        const diff = await getDiff(sandbox, "/repo")

        if (!diff.trim()) {
          send({ type: "status", text: "No changes were made." })
          send({ type: "done", text: "" })
          return
        }

        send({ type: "diff", text: diff })

        // Commit to a new branch (PR opening happens client-side via button)
        const branchName = `agent/${agent}-${Date.now()}`
        await commitAndPush(
          sandbox,
          "/repo",
          branchName,
          `Agent (${agent}): ${prompt.slice(0, 72)}`,
          session.githubAccessToken,
          repoFullName
        )

        send({ type: "done", text: branchName }) // pass branch name so client can open PR

      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error"
        send({ type: "error", text: message })
      } finally {
        if (sandbox) await sandbox.kill()
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
```

### `app/api/pr/create/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { openPR } from "@/lib/github"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.githubAccessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { repoFullName, branch, prompt, agent } = await req.json()

  const prUrl = await openPR(
    session.githubAccessToken,
    repoFullName,
    branch,
    `[Agent/${agent}] ${prompt.slice(0, 60)}`,
    `This PR was opened automatically by the Agent Platform.\n\n**Agent**: ${agent}\n**Prompt**: ${prompt}`
  )

  return NextResponse.json({ url: prUrl })
}
```

---

## PHASE 4 — DOCKERFILE (Build This Once)

Create `Dockerfile.sandbox` in project root:

```dockerfile
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# System packages
RUN apt-get update && apt-get install -y \
    curl git python3 python3-pip \
    build-essential unzip wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Node 20 + npm
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Codex CLI (OpenAI)
RUN npm install -g @openai/codex

# Gemini CLI (Google)
RUN npm install -g @google/gemini-cli

# OpenCode — download the latest release binary from GitHub
# Check https://github.com/sst/opencode/releases for the latest version
RUN OPENCODE_VERSION=$(curl -s https://api.github.com/repos/sst/opencode/releases/latest \
    | grep '"tag_name"' | cut -d'"' -f4) \
    && curl -Lo /usr/local/bin/opencode \
    "https://github.com/sst/opencode/releases/download/${OPENCODE_VERSION}/opencode-linux-x64" \
    && chmod +x /usr/local/bin/opencode

# Python tools (optional but useful for Python repos)
RUN pip3 install --break-system-packages black pytest

# Git config defaults
RUN git config --global init.defaultBranch main

WORKDIR /home/user
```

**After writing the Dockerfile, push to E2B:**

```bash
# Install E2B CLI
npm install -g @e2b/cli

# Login
npx e2b auth login

# Build and push the template (run from project root)
npx e2b template build --dockerfile ./Dockerfile.sandbox --name agent-sandbox

# E2B will print a template ID like: e2b-template-abc123
# Add it to your .env.local:
# E2B_TEMPLATE_ID=e2b-template-abc123
```

---

## PHASE 5 — FRONTEND PAGES & COMPONENTS

### Design direction

Go for a **dark terminal aesthetic** — think VS Code dark theme meets a SaaS dashboard. Use a monospace font (JetBrains Mono from Google Fonts) for the stream output. Primary accent: a sharp electric green (`#00ff87`). Background: near-black (`#0d0d0d`). Cards with subtle border (`#1e1e1e`). Avoid purple gradients and generic SaaS looks.

### `app/layout.tsx`

Import JetBrains Mono from Google Fonts. Set dark background globally.

### `app/page.tsx` — Landing

- Show app name, one-line description, and a "Connect GitHub" button (calls `signIn("github")`)
- Show the three agent logos/names as pills below the fold
- Keep it tight — this isn't a marketing page

### `app/dashboard/page.tsx` — Post-login hub

- Redirect to `/` if not authenticated
- Fetch repos from `/api/repos` 
- `RepoSelector` component: searchable list of repos (filter by typing)
- `AgentSelector` component: three cards (OpenCode, Gemini CLI, Codex CLI) with a brief one-liner each and an API key input that appears on selection
- "Run Agent" button that navigates to `/run?repo=...&agent=...` with state passed via URL params or session storage

### `app/run/page.tsx` — The main run page

Layout:
- Left panel: prompt textarea + "Start Agent" button
- Right panel: `StreamOutput` (live scrolling terminal), then `DiffViewer` (appears after agent finishes), then `PRButton` (appears after diff)

### `components/StreamOutput.tsx`

```typescript
"use client"
import { useEffect, useRef } from "react"
import { AgentStreamEvent } from "@/types"

interface Props {
  events: AgentStreamEvent[]
  isRunning: boolean
}

export function StreamOutput({ events, isRunning }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [events])

  return (
    <div className="bg-[#0a0a0a] border border-[#1e1e1e] rounded-lg p-4 h-96 overflow-y-auto font-mono text-sm">
      {events.map((e, i) => (
        <div
          key={i}
          className={
            e.type === "stderr"
              ? "text-red-400"
              : e.type === "status"
              ? "text-[#00ff87] opacity-70"
              : "text-gray-300"
          }
        >
          {e.text}
        </div>
      ))}
      {isRunning && (
        <div className="text-[#00ff87] animate-pulse">▌</div>
      )}
      <div ref={bottomRef} />
    </div>
  )
}
```

### `components/DiffViewer.tsx`

Parse the raw git diff string and display it with green/red line highlighting. Use a simple approach: split on `\n`, color lines starting with `+` green, `-` red, `@@` blue/yellow.

```typescript
"use client"

interface Props {
  diff: string
}

export function DiffViewer({ diff }: Props) {
  if (!diff) return null

  const lines = diff.split("\n")

  return (
    <div className="mt-4 bg-[#0a0a0a] border border-[#1e1e1e] rounded-lg p-4 overflow-x-auto font-mono text-xs max-h-80 overflow-y-auto">
      <p className="text-[#00ff87] mb-2 text-sm font-semibold">Changes</p>
      {lines.map((line, i) => (
        <div
          key={i}
          className={
            line.startsWith("+") && !line.startsWith("+++")
              ? "text-green-400 bg-green-950/30"
              : line.startsWith("-") && !line.startsWith("---")
              ? "text-red-400 bg-red-950/30"
              : line.startsWith("@@")
              ? "text-blue-400"
              : line.startsWith("diff ") || line.startsWith("index ")
              ? "text-yellow-600"
              : "text-gray-500"
          }
        >
          {line || "\u00A0"}
        </div>
      ))}
    </div>
  )
}
```

### Client-side SSE consumer in `app/run/page.tsx`

```typescript
const startAgent = async () => {
  setEvents([])
  setIsRunning(true)
  setDiff("")
  setBranch("")

  const res = await fetch("/api/agent/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repoFullName, prompt, agent, apiKey }),
  })

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value)
    const lines = chunk.split("\n").filter((l) => l.startsWith("data: "))

    for (const line of lines) {
      const event: AgentStreamEvent = JSON.parse(line.slice(6))
      setEvents((prev) => [...prev, event])

      if (event.type === "diff") setDiff(event.text)
      if (event.type === "done") {
        setBranch(event.text)
        setIsRunning(false)
      }
      if (event.type === "error") setIsRunning(false)
    }
  }
}
```

### PR Button

After `branch` is set in state, show a button:

```typescript
const openPR = async () => {
  const res = await fetch("/api/pr/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repoFullName, branch, prompt, agent }),
  })
  const { url } = await res.json()
  window.open(url, "_blank")
}
```

---

## PHASE 6 — next.config & DEPLOYMENT NOTES

### `next.config.ts`

```typescript
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
}

export default nextConfig
```

For Vercel deployment, set `maxDuration = 300` in the route file (already done above). Free tier only allows 60s — you'll need Pro for 300s agent runs.

For local dev, there's no timeout. E2B sandbox runs fine locally.

---

## PHASE 7 — README.md

Write a README with:
1. Architecture overview (reference the 3-layer diagram: Frontend → Backend → E2B sandbox)
2. Setup instructions: clone, install deps, fill `.env.local`, build E2B template, `npm run dev`
3. How to rebuild the E2B template when a new CLI version ships
4. Known limitations: Vercel free tier timeout, large repo handling (only depth=1 clone)

---

## BUILD ORDER CHECKLIST

Work through these in order. Do NOT skip ahead.

- [x] Phase 1: Project init + BetterAuth GitHub OAuth working (can sign in/out)
- [x] Phase 2: `/api/repos` returning real repo list for logged-in user
- [x] Phase 3: All lib files written (`github.ts`, `sandbox.ts`, `agents.ts`)
- [x] Phase 3: `/api/agent/run` streaming SSE endpoint written
- [x] Phase 3: `/api/pr/create` endpoint written
- [x] Phase 4: `Dockerfile.sandbox` written (push to E2B manually — see README)
- [x] Phase 4: `E2B_TEMPLATE_ID` added to `.env.local` (template name: `agent-sandbox`)
- [x] Phase 5: All components written
- [x] Phase 5: Dashboard page working end-to-end
- [x] Phase 5: Run page wired up — can start agent and see live stream
- [x] Phase 5: Diff appears after agent finishes
- [x] Phase 5: PR button opens PR on GitHub
- [x] Phase 6: `next.config.ts` updated
- [x] Phase 7: README written

---

## THINGS TO WATCH OUT FOR (tell Cursor explicitly)

1. **Shell injection**: Always escape user-provided `prompt` before interpolating into shell commands. Use the `replace(/'/g, "'\\''")` pattern shown in `agents.ts`.

2. **Token leakage**: Never log or expose `githubAccessToken` or `apiKey` in client-side code or responses. They stay server-side only.

3. **Sandbox timeout**: Wrap the CLI run in a `timeoutMs` param. If the agent hangs, the sandbox must still be killed in the `finally` block.

4. **Empty diff**: If the agent makes no changes, don't commit or push — just tell the user. The code handles this already.

5. **E2B template ID**: This is not an API key — it's safe to commit to your repo. The API key stays in `.env`.

6. **BetterAuth session type**: The `githubAccessToken` extension of the Session type is in `types/index.ts`. If TypeScript complains about session properties, check that file is being picked up.

7. **OpenCode binary name**: Depending on the release, the binary might be called `opencode` or need the version appended. Always verify against the actual GitHub releases page before finalizing the Dockerfile.