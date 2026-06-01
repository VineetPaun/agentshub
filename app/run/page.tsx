/**
 * app/run/page.tsx
 *
 * Agent Run page.
 *
 * Layout (desktop):
 *  - Top bar: navigation + Agent/IDE mode toggle
 *  - Agent Mode: prompt/chat, review, PR actions, and live CLI output
 *  - IDE Mode: full-width repository file tree only
 *
 * State management:
 *  - Reads { repoFullName, projectId, agent } from sessionStorage on mount
 *    (saved by DashboardClient before navigating here)
 *  - Manages SSE event list, isRunning flag, diff string, branch name
 *
 * SSE consumer:
 *  - Fetches POST /api/agent/run with ReadableStream
 *  - Parses `data: <json>\n\n` SSE frames
 *  - Updates events[], diff, branch from event types
 */

"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Bot,
  Columns2,
  GitBranch,
  GitPullRequest,
  Loader2,
  MessageSquare,
  Play,
  StopCircle,
  Terminal,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { PromptInput } from "@/components/PromptInput"
import { StreamOutput } from "@/components/StreamOutput"
import { DiffViewer } from "@/components/DiffViewer"
import { RunFileTree } from "@/components/RunFileTree"
import { AGENT_LABELS } from "@/lib/agents"
import type { AgentStreamEvent, AgentType, RunContinuationContext } from "@/types"

// ---------------------------------------------------------------------------
// Session storage key
// ---------------------------------------------------------------------------

const SESSION_KEY = "agentRun"

// ---------------------------------------------------------------------------
// Stored run config shape
// ---------------------------------------------------------------------------

interface StoredRunConfig {
  repoFullName: string
  projectId: string
  agent: AgentType
  apiKey?: string
}

type WorkspaceMode = "agent" | "ide"

interface InitialConfigState {
  config: StoredRunConfig | null
  hasError: boolean
}

interface CompletedRunContext extends RunContinuationContext {
  prompt: string
  diff: string
}

type PostRunAction = "pr-destroy" | "pr-continue" | "destroy"

/** Builds a compact summary for UI labels and follow-up context. */
function summarizeDiff(diff: string): string {
  const lines = diff.split("\n")
  const additions = lines.filter((line) => line.startsWith("+") && !line.startsWith("+++")).length
  const deletions = lines.filter((line) => line.startsWith("-") && !line.startsWith("---")).length
  return `${additions} additions, ${deletions} deletions`
}

/** Keeps continuation context useful without sending the entire terminal log back. */
function summarizeRecentOutput(events: AgentStreamEvent[]): string {
  return events
    .filter((event) => event.type === "stdout" || event.type === "stderr" || event.type === "warning")
    .slice(-12)
    .map((event) => `[${event.type}] ${event.text}`)
    .join("\n")
    .slice(0, 4000)
}

/**
 * Reads run config from sessionStorage once at mount and clears the stored key.
 */
function readInitialConfig(): InitialConfigState {
  if (typeof window === "undefined") {
    return { config: null, hasError: false }
  }

  const raw = window.sessionStorage.getItem(SESSION_KEY)
  if (!raw) {
    return { config: null, hasError: true }
  }

  try {
    const parsed = JSON.parse(raw) as StoredRunConfig
    if (!parsed.repoFullName || !parsed.projectId || !parsed.agent) {
      return { config: null, hasError: true }
    }

    if (parsed.apiKey) {
      // Keep one-time keys only in component memory after the dashboard handoff.
      window.sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ ...parsed, apiKey: "" })
      )
    }

    return { config: parsed, hasError: false }
  } catch {
    window.sessionStorage.removeItem(SESSION_KEY)
    return { config: null, hasError: true }
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RunPage() {
  const router = useRouter()

  // Run configuration (loaded from sessionStorage)
  const [{ config, hasError: configError }, setInitialConfig] =
    useState<InitialConfigState>({ config: null, hasError: false })

  // Prompt
  const [prompt, setPrompt] = useState("")

  // Streaming state
  const [events, setEvents] = useState<AgentStreamEvent[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [diff, setDiff] = useState("")
  const [branch, setBranch] = useState("")
  const [sandboxId, setSandboxId] = useState("")
  const [runId, setRunId] = useState("")
  const [runError, setRunError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [createdPrUrl, setCreatedPrUrl] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<PostRunAction | null>(null)
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("agent")
  const [completedRun, setCompletedRun] = useState<CompletedRunContext | null>(null)
  const [continuationContext, setContinuationContext] =
    useState<RunContinuationContext | null>(null)

  // Abort controller ref so we can cancel the stream if needed
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let isMounted = true

    // Defer browser storage access until after hydration so SSR and client match.
    queueMicrotask(() => {
      if (isMounted) {
        setInitialConfig(readInitialConfig())
      }
    })

    return () => {
      isMounted = false
    }
  }, [])

  // -------------------------------------------------------------------------
  // Start the agent run
  // -------------------------------------------------------------------------
  const startAgent = useCallback(async () => {
    if (!config || !prompt.trim() || isRunning) return

    if (!config.repoFullName || !config.projectId || !config.agent) {
      setRunError("Run config is incomplete. Go back to dashboard and start again.")
      return
    }

    const submittedPrompt = prompt.trim()
    const submittedContinuation = continuationContext
    const receivedEvents: AgentStreamEvent[] = []
    let currentDiff = ""
    let currentRunId = ""
    let currentSandboxId = continuationContext?.sandboxId ?? ""

    // Reset state for a fresh run
    setEvents([])
    setDiff("")
    setBranch("")
    setSandboxId("")
    setRunId("")
    setRunError(null)
    setActionError(null)
    setCreatedPrUrl(null)
    setCompletedRun(null)
    setContinuationContext(null)
    setIsRunning(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoFullName: config.repoFullName,
          projectId: config.projectId,
          prompt: submittedPrompt,
          agent: config.agent,
          apiKey: config.apiKey,
          continuation: submittedContinuation ?? undefined,
        }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        const text = await res.text()
        throw new Error(text || `HTTP ${res.status}`)
      }

      // Read the SSE stream chunk by chunk
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // SSE frames are separated by `\n\n`
        const frames = buffer.split("\n\n")
        // The last element might be an incomplete frame — keep it in the buffer
        buffer = frames.pop() ?? ""

        for (const frame of frames) {
          // Each frame line starting with `data:` is a JSON event
          const dataLine = frame
            .split("\n")
            .find((l) => l.startsWith("data: "))

          if (!dataLine) continue

          try {
            const event = JSON.parse(dataLine.slice(6)) as AgentStreamEvent

            receivedEvents.push(event)
            setEvents((prev) => [...prev, event])

            if (event.type === "diff") {
              currentDiff = event.text
              setDiff(event.text)
            }
            if (event.type === "run") {
              currentRunId = event.text
              setRunId(event.text)
            }
            if (event.type === "sandbox") {
              currentSandboxId = event.text
              setSandboxId(event.text)
            }
            if (event.type === "done") {
              setBranch(event.text)
              setCompletedRun({
                sandboxId: currentSandboxId,
                prompt: submittedPrompt,
                previousPrompt: submittedPrompt,
                previousRunId: currentRunId,
                previousBranch: event.text,
                previousDiffSummary: summarizeDiff(currentDiff),
                recentOutput: summarizeRecentOutput(receivedEvents),
                diff: currentDiff,
              })
              setIsRunning(false)
            }
            if (event.type === "error") {
              setRunError(event.text)
              setIsRunning(false)
            }
          } catch {
            // Malformed JSON frame — skip
          }
        }
      }
    } catch (err: unknown) {
      if ((err as { name?: string }).name === "AbortError") return // user cancelled
      setRunError(err instanceof Error ? err.message : "Unexpected error")
      setIsRunning(false)
    }
  }, [config, continuationContext, prompt, isRunning])

  /** Cancel the running stream */
  const stopAgent = () => {
    abortRef.current?.abort()
    setIsRunning(false)
    setEvents((prev) => [
      ...prev,
      { type: "status", text: "Run cancelled by user." },
    ])
  }

  /** Arms the bottom composer so the next prompt continues from the completed run. */
  const continueConversation = () => {
    if (!completedRun) return

    setContinuationContext({
      sandboxId: completedRun.sandboxId,
      previousPrompt: completedRun.previousPrompt,
      previousRunId: completedRun.previousRunId,
      previousBranch: completedRun.previousBranch,
      previousDiffSummary: completedRun.previousDiffSummary,
      recentOutput: completedRun.recentOutput,
    })
    setPrompt("")
    window.setTimeout(() => {
      document.getElementById("prompt-textarea")?.focus()
    }, 0)
  }

  /** Opens a PR for the pushed branch and returns the GitHub URL. */
  const createPullRequest = async (): Promise<string> => {
    if (createdPrUrl) return createdPrUrl

    if (!config || !completedRun || !branch) {
      throw new Error("No pushed agent branch is available for PR creation.")
    }

    const res = await fetch("/api/pr/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repoFullName: config.repoFullName,
        projectId: config.projectId,
        runId,
        branch,
        prompt: completedRun.prompt,
        agent: config.agent,
      }),
    })

    const data = (await res.json()) as { url?: string; error?: string }
    if (!res.ok || !data.url) {
      throw new Error(data.error ?? "Failed to create PR")
    }

    window.open(data.url, "_blank", "noopener,noreferrer")
    setCreatedPrUrl(data.url)
    return data.url
  }

  /** Destroys the active E2B sandbox and clears continuation state. */
  const destroyActiveSandbox = async (): Promise<void> => {
    const id = completedRun?.sandboxId ?? sandboxId
    if (!id) throw new Error("No active sandbox ID is available to destroy.")

    const res = await fetch("/api/sandbox/destroy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sandboxId: id }),
    })

    const data = (await res.json()) as { ok?: boolean; error?: string }
    if (!res.ok || !data.ok) {
      throw new Error(data.error ?? "Failed to destroy sandbox")
    }

    setSandboxId("")
    setContinuationContext(null)
    setEvents((prev) => [...prev, { type: "status", text: `Sandbox ${id} destroyed.` }])
  }

  /** Runs the selected post-run lifecycle option. */
  const handlePostRunAction = async (action: PostRunAction) => {
    if (pendingAction) return

    setPendingAction(action)
    setActionError(null)

    try {
      if (action === "pr-destroy") {
        await createPullRequest()
        await destroyActiveSandbox()
        setCompletedRun(null)
        return
      }

      if (action === "pr-continue") {
        await createPullRequest()
        continueConversation()
        return
      }

      await destroyActiveSandbox()
      setCompletedRun(null)
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Action failed")
    } finally {
      setPendingAction(null)
    }
  }

  // -------------------------------------------------------------------------
  // Error: no config found
  // -------------------------------------------------------------------------
  if (configError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-center px-4">
        <p className="text-red-400 font-mono text-sm">
          No run configuration found. Please go back to the dashboard and select a repo + agent.
        </p>
        <Button
          variant="ghost"
          onClick={() => router.push("/dashboard")}
          className="text-[#00ff87] hover:text-[#00e07a] font-mono text-sm"
        >
          ← Back to Dashboard
        </Button>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Loading while reading config
  // -------------------------------------------------------------------------
  if (!config) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <span className="text-[#4e4e4e] font-mono text-sm animate-pulse">
          Loading…
        </span>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Main layout
  // -------------------------------------------------------------------------
  return (
    <div data-scroll-region="page" className="flex h-screen flex-col overflow-y-auto">
      {/* ------------------------------------------------------------------ */}
      {/* Nav bar                                                             */}
      {/* ------------------------------------------------------------------ */}
      <nav className="shrink-0 border-b border-[#1e1e1e] bg-[#0d0d0d] px-4 sm:px-6 py-3 flex items-center gap-4">
        <Button
          id="back-to-dashboard-btn"
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard")}
          disabled={isRunning}
          className="text-[#6e6e6e] hover:text-gray-300 font-mono text-xs"
        >
          <ArrowLeft className="h-3.5 w-3.5 mr-1" />
          Dashboard
        </Button>

        <Separator orientation="vertical" className="h-4 bg-[#2e2e2e]" />

        {/* Run metadata pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-[#6e6e6e] border border-[#2e2e2e] rounded px-2 py-0.5">
            {config.repoFullName}
          </span>
          <span className="text-xs font-mono text-[#00ff87] border border-[#00ff87]/30 rounded px-2 py-0.5">
            {AGENT_LABELS[config.agent]}
          </span>
        </div>

        {/* Agent/IDE toggle like cursor-style working modes */}
        <div className="ml-auto inline-flex rounded-md border border-[#2e2e2e] overflow-hidden">
          <button
            type="button"
            onClick={() => setWorkspaceMode("agent")}
            className={`px-3 py-1.5 text-xs font-mono inline-flex items-center gap-1.5 transition-colors ${
              workspaceMode === "agent"
                ? "bg-[#00ff87] text-black"
                : "bg-[#111] text-[#7e7e7e] hover:text-gray-300"
            }`}
          >
            <Bot className="h-3.5 w-3.5" />
            Agent Mode
          </button>
          <button
            type="button"
            onClick={() => setWorkspaceMode("ide")}
            className={`px-3 py-1.5 text-xs font-mono inline-flex items-center gap-1.5 transition-colors ${
              workspaceMode === "ide"
                ? "bg-[#00ff87] text-black"
                : "bg-[#111] text-[#7e7e7e] hover:text-gray-300"
            }`}
          >
            <Columns2 className="h-3.5 w-3.5" />
            IDE Mode
          </button>
        </div>
      </nav>

      {/* ------------------------------------------------------------------ */}
      {/* Workspace modes                                                     */}
      {/* ------------------------------------------------------------------ */}
      {workspaceMode === "ide" ? (
        <main className="h-[calc(100vh-57px)] shrink-0 overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(0,255,135,0.08),transparent_30%),#0b0b0b] p-4 sm:p-6">
          {/* IDE mode follows the completed agent branch once one exists. */}
          <RunFileTree repoFullName={config.repoFullName} refName={branch || undefined} />
        </main>
      ) : (
        <main className="flex h-[calc(100vh-57px)] min-h-0 flex-col bg-[#0b0b0b]">
          {/* Agent output stays first, matching familiar CLI/chat interfaces. */}
          <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-lg font-bold text-white">Run Agent</h1>
                <p className="mt-1 text-xs font-mono text-[#6e6e6e]">
                  {config.repoFullName} · {AGENT_LABELS[config.agent]}
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#1e1e1e] bg-[#101010] px-3 py-1.5 text-xs font-mono text-[#6e6e6e]">
                <Terminal className="h-3.5 w-3.5 text-[#00ff87]" />
                CLI Output
              </div>
            </div>

            <StreamOutput
              events={events}
              isRunning={isRunning}
              className="h-auto min-h-[260px] flex-1"
            />

            {runError && (
              <div className="shrink-0 rounded-md border border-red-500/30 bg-red-950/20 p-3 animate-fade-in">
                <p className="text-xs font-mono leading-relaxed text-red-400">{runError}</p>
              </div>
            )}

            {completedRun && !isRunning && (
              <div className="shrink-0 rounded-lg border border-[#1e1e1e] bg-[#0f0f0f] p-4 animate-slide-up">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-300">Changes</h2>
                    <p className="mt-1 text-xs font-mono text-[#6e6e6e]">
                      {diff
                        ? "Agent changes are ready for your next step."
                        : "Agent finished without file changes; you can continue the conversation."}
                    </p>
                  </div>
                  {branch && (
                    <span className="inline-flex items-center gap-1.5 rounded border border-[#00ff87]/30 px-2 py-1 text-xs font-mono text-[#00ff87]">
                      <GitBranch className="h-3.5 w-3.5" />
                      {branch}
                    </span>
                  )}
                </div>

                {diff ? (
                  <DiffViewer diff={diff} />
                ) : (
                  <div className="rounded-lg border border-[#1e1e1e] bg-[#0b0b0b] p-4">
                    <p className="text-xs font-mono text-[#4e4e4e]">
                      No file changes were produced in this run.
                    </p>
                  </div>
                )}

                <div className="mt-4 border-t border-[#1e1e1e] pt-4">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Button
                      type="button"
                      onClick={() => handlePostRunAction("pr-destroy")}
                      disabled={!branch || pendingAction !== null}
                      className="h-auto min-h-11 justify-start bg-[#00ff87] px-3 py-2 text-left font-mono text-sm font-semibold text-black hover:bg-[#00e07a]"
                    >
                      {pendingAction === "pr-destroy" ? (
                        <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" />
                      ) : (
                        <GitPullRequest className="mr-2 h-4 w-4 shrink-0" />
                      )}
                      PR and destroy sandbox
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handlePostRunAction("pr-continue")}
                      disabled={!branch || pendingAction !== null}
                      className="h-auto min-h-11 justify-start border-[#2e2e2e] bg-[#111] px-3 py-2 text-left font-mono text-sm text-gray-300 hover:bg-[#1a1a1a] hover:text-white"
                    >
                      {pendingAction === "pr-continue" ? (
                        <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" />
                      ) : (
                        <MessageSquare className="mr-2 h-4 w-4 shrink-0" />
                      )}
                      PR and continue
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handlePostRunAction("destroy")}
                      disabled={!completedRun.sandboxId || pendingAction !== null}
                      className="h-auto min-h-11 justify-start border-red-500/40 bg-[#111] px-3 py-2 text-left font-mono text-sm text-red-300 hover:bg-red-950/20 hover:text-red-200"
                    >
                      {pendingAction === "destroy" ? (
                        <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" />
                      ) : (
                        <Trash2 className="mr-2 h-4 w-4 shrink-0" />
                      )}
                      Destroy sandbox only
                    </Button>
                  </div>
                  {!branch && (
                    <p className="mt-2 text-xs font-mono text-[#6e6e6e]">
                      PR actions are unavailable because this run produced no pushed branch.
                    </p>
                  )}
                  {completedRun.sandboxId && (
                    <p className="mt-2 text-xs font-mono text-[#4e4e4e]">
                      Sandbox: <span className="text-[#6e6e6e]">{completedRun.sandboxId}</span>
                    </p>
                  )}
                  {createdPrUrl && (
                    <a
                      href={createdPrUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex text-xs font-mono text-[#00ff87] hover:underline"
                    >
                      {createdPrUrl}
                    </a>
                  )}
                  {actionError && (
                    <p className="mt-2 text-xs font-mono text-red-400">{actionError}</p>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Bottom composer keeps chat input in the expected location. */}
          <footer className="shrink-0 border-t border-[#1e1e1e] bg-[#0d0d0d] p-4 sm:p-5">
            {continuationContext && (
              <div className="mb-3 rounded-md border border-[#00ff87]/30 bg-[#00ff87]/5 px-3 py-2">
                <p className="text-xs font-mono text-[#00ff87]">
                  Continuing from {continuationContext.previousBranch || "the previous run"}. Add your follow-up request below.
                </p>
              </div>
            )}

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px] lg:items-end">
              <PromptInput
                value={prompt}
                onChange={setPrompt}
                onSubmit={startAgent}
                disabled={isRunning}
              />

              {!isRunning ? (
                <Button
                  id="start-agent-btn"
                  onClick={startAgent}
                  disabled={!prompt.trim() || isRunning}
                  className="h-11 bg-[#00ff87] font-semibold text-black transition-all hover:bg-[#00e07a] glow-green"
                >
                  <Play className="mr-2 h-4 w-4" />
                  {continuationContext ? "Continue Agent" : "Start Agent"}
                </Button>
              ) : (
                <Button
                  id="stop-agent-btn"
                  onClick={stopAgent}
                  variant="outline"
                  className="h-11 border-red-500/50 font-mono text-sm text-red-400 hover:bg-red-950/20"
                >
                  <StopCircle className="mr-2 h-4 w-4" />
                  Stop
                </Button>
              )}
            </div>
          </footer>
        </main>
      )}
    </div>
  )
}
