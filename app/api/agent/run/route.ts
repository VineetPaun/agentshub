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
 *  2. Boot or reconnect an E2B sandbox from the pre-built template
 *  3. Clone the target repo once per sandbox (depth=1)
 *  4. Build & run the selected CLI agent command, streaming stdout/stderr live
 *  5. Collect `git diff HEAD`
 *  6. If there are changes: commit → push to a new branch → send `done` event
 *  7. Keep the sandbox alive until the client explicitly destroys it
 *
 * Security:
 *  - GitHub access token & agent API key are NEVER sent to the client
 *  - Shell injection is mitigated in lib/agents.ts (prompt is single-quoted)
 *  - Token is redacted in error messages (see lib/sandbox.ts)
 */

import { type NextRequest } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getGitHubAccessToken } from "@/lib/github-token"
import { createSandbox, connectSandbox, ensureRepoCloned, getDiff, commitAndPush } from "@/lib/sandbox"
import { buildCLICommand } from "@/lib/agents"
import { decryptSecret } from "@/lib/crypto"
import {
  addMessage,
  appendRunEvents,
  completeRun,
  createRun,
  getConvexTroubleshootingHint,
  getOrCreateChat,
  getProviderSecret,
  isConvexConfigured,
  upsertProject,
  upsertUser,
} from "@/lib/convex-server"
import type { RunRequest, AgentStreamEvent, RunContinuationContext } from "@/types"

/**
 * Vercel edge / serverless max duration (seconds).
 * Free tier: 60s. Pro tier: 300s.
 * Override in next.config.ts for your deployment tier.
 */
export const maxDuration = 300

const SANDBOX_REPO_PATH = "/home/user/repo"
const CLI_QUIET_HEARTBEAT_MS = 15_000

/** Converts unknown thrown values into non-empty messages safe for UI display. */
function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim()) return err.message
  if (typeof err === "string" && err.trim()) return err
  return fallback
}

/** Explains why Convex persistence failed while keeping the run fallback intact. */
function getRunHistoryWarning(err: unknown): string {
  const message = getErrorMessage(err, "Failed to initialize run history")
  return `Run history is unavailable, continuing without persistence: ${message}. ${getConvexTroubleshootingHint()}`
}

/** Builds a short diff summary for run history screens. */
function summarizeDiff(diff: string): string {
  const lines = diff.split("\n")
  const additions = lines.filter((line) => line.startsWith("+") && !line.startsWith("+++")).length
  const deletions = lines.filter((line) => line.startsWith("-") && !line.startsWith("---")).length
  return `${additions} additions, ${deletions} deletions`
}

/** Prepends prior run context so follow-up prompts work in one-shot CLI agents. */
function buildPromptWithContinuation(
  prompt: string,
  continuation?: RunContinuationContext
): string {
  if (!continuation) return prompt

  const contextLines = [
    "You are continuing an earlier AgentsHub run in the same repository.",
    `Previous user prompt: ${continuation.previousPrompt}`,
    continuation.previousBranch ? `Previous branch: ${continuation.previousBranch}` : "",
    continuation.sandboxId ? `Continuing in sandbox: ${continuation.sandboxId}` : "",
    continuation.previousDiffSummary ? `Previous changes: ${continuation.previousDiffSummary}` : "",
    continuation.recentOutput ? `Recent agent output:\n${continuation.recentOutput}` : "",
  ].filter(Boolean)

  return `${contextLines.join("\n")}\n\nFollow-up user request:\n${prompt}`
}

export async function POST(req: NextRequest): Promise<Response> {
  // -------------------------------------------------------------------------
  // 1. Auth guard
  // -------------------------------------------------------------------------
  const requestHeaders = await headers()
  const session = await auth.api.getSession({ headers: requestHeaders })

  if (!session?.session || !session.user) {
    return new Response("Unauthorized", { status: 401 })
  }

  const githubToken = await getGitHubAccessToken(requestHeaders)

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

  const { repoFullName, projectId: bodyProjectId, prompt, agent, apiKey, continuation } = body

  if (!repoFullName || !prompt || !agent) {
    const missingFields = [
      !repoFullName ? "repoFullName" : null,
      !prompt ? "prompt" : null,
      !agent ? "agent" : null,
    ].filter((field): field is string => field !== null)

    return new Response(`Missing required fields: ${missingFields.join(", ")}`, {
      status: 400,
    })
  }

  let resolvedApiKey = apiKey?.trim()
  const agentPrompt = buildPromptWithContinuation(prompt, continuation)
  let userId: string
  let projectId: string
  let chatId: string
  let runId: string
  let shouldPersistRun = false
  let convexInitWarning: string | null = null

  if (isConvexConfigured()) {
    try {
      userId = await upsertUser(session.user)
      projectId = bodyProjectId?.startsWith("local:")
        ? await upsertProject(userId, { repoFullName })
        : bodyProjectId ?? await upsertProject(userId, { repoFullName })
      chatId = await getOrCreateChat(userId, projectId, agent, repoFullName)

      if (!resolvedApiKey) {
        const savedSecret = await getProviderSecret(userId, agent)
        if (savedSecret?.encryptedKey) {
          resolvedApiKey = decryptSecret(savedSecret.encryptedKey)
        }
      }

      if (!resolvedApiKey) {
        return new Response("Provider API key missing. Save an encrypted key from the dashboard.", {
          status: 400,
        })
      }

      runId = await createRun({ userId, projectId, chatId, agent, prompt })
      await addMessage(chatId, "user", prompt, runId)
      if (continuation) {
        await addMessage(
          chatId,
          "system",
          `Continuing from run ${continuation.previousRunId ?? "unknown"}${continuation.previousBranch ? ` on branch ${continuation.previousBranch}` : ""}.`,
          runId
        )
      }
      shouldPersistRun = true
    } catch (err: unknown) {
      const message = getErrorMessage(err, "Failed to initialize run history")

      if (!resolvedApiKey) {
        return new Response(message, { status: 500 })
      }

      // A one-time API key is enough to run the agent even if history storage is down.
      userId = "local"
      projectId = bodyProjectId ?? `local:${repoFullName}`
      chatId = "local"
      runId = `local:${Date.now()}`
      shouldPersistRun = false
      convexInitWarning = getRunHistoryWarning(err)
    }
  } else {
    if (!resolvedApiKey) {
      return new Response("Convex is not configured, so a one-time provider API key is required.", {
        status: 400,
      })
    }

    userId = "local"
    projectId = bodyProjectId ?? `local:${repoFullName}`
    chatId = "local"
    runId = `local:${Date.now()}`
  }

  const agentApiKey = resolvedApiKey

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
        pendingEvents.push({ ...event, sequence: ++eventSequence })
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      let sandbox: Awaited<ReturnType<typeof createSandbox>> | null = null
      let pendingEvents: Array<AgentStreamEvent & { sequence: number }> = []
      let eventSequence = 0
      try {
        send({ type: "run", text: runId })

        // Only show persistence fallback during continuations, where missing
        // previous context materially changes the run UX.
        if (convexInitWarning && continuation) {
          send({ type: "warning", text: convexInitWarning })
        }

        // -------------------------------------------------------------------
        // 4. Boot or reconnect sandbox
        // -------------------------------------------------------------------
        if (continuation?.sandboxId) {
          send({ type: "status", text: `Reconnecting sandbox ${continuation.sandboxId}...` })
          sandbox = await connectSandbox(continuation.sandboxId)
        } else {
          send({ type: "status", text: "Booting sandbox..." })
          sandbox = await createSandbox()
        }
        send({ type: "sandbox", text: sandbox.sandboxId })

        // -------------------------------------------------------------------
        // 5. Clone repo once per sandbox
        // -------------------------------------------------------------------
        send({ type: "status", text: `Preparing ${repoFullName}...` })
        const repoState = await ensureRepoCloned(
          sandbox,
          repoFullName,
          githubToken,
          SANDBOX_REPO_PATH
        )
        if (repoState === "reused") {
          send({ type: "status", text: "Reusing existing sandbox workspace." })
        }

        // -------------------------------------------------------------------
        // 6. Run agent CLI — stream stdout/stderr live
        // -------------------------------------------------------------------
        send({ type: "status", text: `🤖 Starting ${agent} agent...` })

        const cliCommand = buildCLICommand({
          agent,
          prompt: agentPrompt,
          apiKey: agentApiKey,
          repoPath: SANDBOX_REPO_PATH,
        })

        let lastCliOutputAt = Date.now()
        const heartbeat = setInterval(() => {
          const quietForMs = Date.now() - lastCliOutputAt
          if (quietForMs < CLI_QUIET_HEARTBEAT_MS) return

          send({
            type: "status",
            text: `${agent} is still working inside the sandbox...`,
          })
          lastCliOutputAt = Date.now()
        }, CLI_QUIET_HEARTBEAT_MS)

        try {
          await sandbox.commands.run(cliCommand, {
            onStdout: (line: string) => {
              lastCliOutputAt = Date.now()
              send({ type: "stdout", text: line })
            },
            onStderr: (line: string) => {
              lastCliOutputAt = Date.now()
              send({
                type: "stderr",
                text: line,
              })
            },
            timeoutMs: 0, // Disable E2B command deadline for long agent runs.
          })
        } finally {
          clearInterval(heartbeat)
        }

        // -------------------------------------------------------------------
        // 7. Collect diff
        // -------------------------------------------------------------------
        send({ type: "status", text: "🔍 Collecting diff..." })
        const diff = await getDiff(sandbox, SANDBOX_REPO_PATH)

        if (!diff.trim()) {
          // Agent ran but made no changes — nothing to commit
          send({ type: "status", text: "ℹ️ The agent made no file changes." })
          send({ type: "done", text: "" })
          if (shouldPersistRun) {
            await completeRun({
              runId,
              status: "completed",
              sandboxId: sandbox.sandboxId,
              diff: "",
              diffSummary: "0 additions, 0 deletions",
            })
          }
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
          SANDBOX_REPO_PATH,
          branchName,
          `Agent (${agent}): ${prompt.slice(0, 72)}`,
          githubToken,
          repoFullName
        )

        // Pass the branch name to the client so it can open a PR
        send({ type: "done", text: branchName })
        if (shouldPersistRun) {
          await completeRun({
            runId,
            status: "completed",
            branch: branchName,
            sandboxId: sandbox.sandboxId,
            diff,
            diffSummary: summarizeDiff(diff),
          })
        }
      } catch (err: unknown) {
        const message = getErrorMessage(err, "Unknown error occurred")
        send({ type: "error", text: message })
        if (shouldPersistRun) {
          await completeRun({ runId, status: "failed", sandboxId: sandbox?.sandboxId, error: message })
        }
      } finally {
        if (shouldPersistRun) {
          try {
            await appendRunEvents(runId, pendingEvents)
          } catch {
            // Persistence failures should not prevent sandbox cleanup.
          }
        }
        pendingEvents = []
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
