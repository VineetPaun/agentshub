/**
 * app/api/agent/run/route.ts
 *
 * POST /api/agent/run
 *
 * The core streaming endpoint. Accepts a RunRequest body and returns a
 * Server-Sent Events (SSE) stream of AgentStreamEvent objects.
 *
 * Flow:
 *  1. Authenticate user via BetterAuth session
 *  2. Boot an E2B sandbox from the pre-built template
 *  3. Clone the target repo (depth=1)
 *  4. Build & run the selected CLI agent command, streaming stdout/stderr live
 *  5. Collect `git diff HEAD`
 *  6. If there are changes: commit → push to a new branch → send `done` event
 *  7. Always kill the sandbox in `finally`
 *
 * Security:
 *  - GitHub access token & agent API key are NEVER sent to the client
 *  - Shell injection is mitigated in lib/agents.ts (prompt is single-quoted)
 *  - Token is redacted in error messages (see lib/sandbox.ts)
 */

import { type NextRequest } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { createSandbox, cloneRepo, getDiff, commitAndPush } from "@/lib/sandbox"
import { buildCLICommand } from "@/lib/agents"
import type { RunRequest, AgentStreamEvent } from "@/types"

/**
 * Vercel edge / serverless max duration (seconds).
 * Free tier: 60s. Pro tier: 300s.
 * Override in next.config.ts for your deployment tier.
 */
export const maxDuration = 300

export async function POST(req: NextRequest): Promise<Response> {
  // -------------------------------------------------------------------------
  // 1. Auth guard
  // -------------------------------------------------------------------------
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session?.session || !session.user) {
    return new Response("Unauthorized", { status: 401 })
  }

  const githubToken = (session.session as Record<string, unknown>)
    .githubAccessToken as string | undefined

  if (!githubToken) {
    return new Response("GitHub access token missing — please sign out and sign in again", {
      status: 401,
    })
  }

  // -------------------------------------------------------------------------
  // 2. Parse request body
  // -------------------------------------------------------------------------
  let body: RunRequest
  try {
    body = (await req.json()) as RunRequest
  } catch {
    return new Response("Invalid JSON body", { status: 400 })
  }

  const { repoFullName, prompt, agent, apiKey } = body

  if (!repoFullName || !prompt || !agent || !apiKey) {
    return new Response("Missing required fields: repoFullName, prompt, agent, apiKey", {
      status: 400,
    })
  }

  // -------------------------------------------------------------------------
  // 3. Build SSE ReadableStream
  // -------------------------------------------------------------------------
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      /**
       * Helper to encode and enqueue a single SSE event.
       * Format: `data: <json>\n\n`
       */
      const send = (event: AgentStreamEvent): void => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      let sandbox: Awaited<ReturnType<typeof createSandbox>> | null = null

      try {
        // -------------------------------------------------------------------
        // 4. Boot sandbox
        // -------------------------------------------------------------------
        send({ type: "status", text: "⚡ Booting sandbox..." })
        sandbox = await createSandbox()

        // -------------------------------------------------------------------
        // 5. Clone repo
        // -------------------------------------------------------------------
        send({ type: "status", text: `📦 Cloning ${repoFullName}...` })
        await cloneRepo(sandbox, repoFullName, githubToken, "/repo")

        // -------------------------------------------------------------------
        // 6. Run agent CLI — stream stdout/stderr live
        // -------------------------------------------------------------------
        send({ type: "status", text: `🤖 Starting ${agent} agent...` })

        const cliCommand = buildCLICommand({
          agent,
          prompt,
          apiKey,
          repoPath: "/repo",
        })

        await sandbox.commands.run(cliCommand, {
          onStdout: (line: string) => send({ type: "stdout", text: line }),
          onStderr: (line: string) => send({ type: "stderr", text: line }),
          timeoutMs: 240_000, // 4 min max for the agent — sandbox still killed in finally
        })

        // -------------------------------------------------------------------
        // 7. Collect diff
        // -------------------------------------------------------------------
        send({ type: "status", text: "🔍 Collecting diff..." })
        const diff = await getDiff(sandbox, "/repo")

        if (!diff.trim()) {
          // Agent ran but made no changes — nothing to commit
          send({ type: "status", text: "ℹ️ The agent made no file changes." })
          send({ type: "done", text: "" })
          return
        }

        // Send the full diff to the client for display
        send({ type: "diff", text: diff })

        // -------------------------------------------------------------------
        // 8. Commit & push to a new branch
        // -------------------------------------------------------------------
        const branchName = `agent/${agent}-${Date.now()}`

        send({ type: "status", text: `🚀 Committing and pushing to branch ${branchName}...` })
        await commitAndPush(
          sandbox,
          "/repo",
          branchName,
          `Agent (${agent}): ${prompt.slice(0, 72)}`,
          githubToken,
          repoFullName
        )

        // Pass the branch name to the client so it can open a PR
        send({ type: "done", text: branchName })
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error occurred"
        send({ type: "error", text: message })
      } finally {
        // Always kill the sandbox to avoid runaway billing
        if (sandbox) {
          try {
            await sandbox.kill()
          } catch {
            // Ignore kill errors — sandbox will auto-expire
          }
        }
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Allow the browser to read the stream cross-origin (not needed for same-origin)
      "X-Accel-Buffering": "no",
    },
  })
}
