/**
 * app/run/page.tsx
 *
 * Agent Run page.
 *
 * Layout (desktop): two-column
 *  Left panel  — Prompt input + "Start Agent" button + run metadata
 *  Right panel — StreamOutput (live terminal) → DiffViewer → PRButton
 *
 * State management:
 *  - Reads { repoFullName, agent, apiKey } from sessionStorage on mount
 *    (saved by DashboardClient before navigating here)
 *  - After reading, immediately clears the apiKey from sessionStorage
 *  - Manages SSE event list, isRunning flag, diff string, branch name
 *
 * SSE consumer:
 *  - Fetches POST /api/agent/run with ReadableStream
 *  - Parses `data: <json>\n\n` SSE frames
 *  - Updates events[], diff, branch from event types
 */

"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Play, StopCircle, Terminal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { PromptInput } from "@/components/PromptInput"
import { StreamOutput } from "@/components/StreamOutput"
import { DiffViewer } from "@/components/DiffViewer"
import { PRButton } from "@/components/PRButton"
import { AGENT_LABELS } from "@/lib/agents"
import type { AgentStreamEvent, AgentType } from "@/types"

// ---------------------------------------------------------------------------
// Session storage key
// ---------------------------------------------------------------------------

const SESSION_KEY = "agentRun"

// ---------------------------------------------------------------------------
// Stored run config shape
// ---------------------------------------------------------------------------

interface StoredRunConfig {
  repoFullName: string
  agent: AgentType
  apiKey: string
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RunPage() {
  const router = useRouter()

  // Run configuration (loaded from sessionStorage)
  const [config, setConfig] = useState<StoredRunConfig | null>(null)
  const [configError, setConfigError] = useState(false)

  // Prompt
  const [prompt, setPrompt] = useState("")

  // Streaming state
  const [events, setEvents] = useState<AgentStreamEvent[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [diff, setDiff] = useState("")
  const [branch, setBranch] = useState("")
  const [runError, setRunError] = useState<string | null>(null)

  // Abort controller ref so we can cancel the stream if needed
  const abortRef = useRef<AbortController | null>(null)
  const loadedConfigRef = useRef(false)

  // -------------------------------------------------------------------------
  // Load config from sessionStorage on mount
  // -------------------------------------------------------------------------
  useEffect(() => {
    // React Strict Mode can run effects twice in dev; avoid clearing apiKey twice.
    if (loadedConfigRef.current) return
    loadedConfigRef.current = true

    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) {
      setConfigError(true)
      return
    }

    try {
      const parsed = JSON.parse(raw) as StoredRunConfig
      if (!parsed.repoFullName || !parsed.agent || !parsed.apiKey) {
        setConfigError(true)
        return
      }
      setConfig(parsed)
    } catch {
      setConfigError(true)
      return
    }

    // Clear the apiKey from sessionStorage immediately after the first read.
    try {
      const parsed = JSON.parse(raw) as StoredRunConfig
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ ...parsed, apiKey: "" })
      )
    } catch {
      sessionStorage.removeItem(SESSION_KEY)
    }
  }, [])

  // -------------------------------------------------------------------------
  // Start the agent run
  // -------------------------------------------------------------------------
  const startAgent = useCallback(async () => {
    if (!config || !prompt.trim() || isRunning) return

    if (!config.repoFullName || !config.agent || !config.apiKey) {
      setRunError("Run config is incomplete. Go back to dashboard and start again.")
      return
    }

    // Reset state for a fresh run
    setEvents([])
    setDiff("")
    setBranch("")
    setRunError(null)
    setIsRunning(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoFullName: config.repoFullName,
          prompt: prompt.trim(),
          agent: config.agent,
          apiKey: config.apiKey,
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

            setEvents((prev) => [...prev, event])

            if (event.type === "diff") {
              setDiff(event.text)
            }
            if (event.type === "done") {
              setBranch(event.text)
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
  }, [config, prompt, isRunning])

  /** Cancel the running stream */
  const stopAgent = () => {
    abortRef.current?.abort()
    setIsRunning(false)
    setEvents((prev) => [
      ...prev,
      { type: "status", text: "Run cancelled by user." },
    ])
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
    <div className="flex flex-col min-h-screen">
      {/* ------------------------------------------------------------------ */}
      {/* Nav bar                                                             */}
      {/* ------------------------------------------------------------------ */}
      <nav className="border-b border-[#1e1e1e] bg-[#0d0d0d] px-4 sm:px-6 py-3 flex items-center gap-4">
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
      </nav>

      {/* ------------------------------------------------------------------ */}
      {/* Main: two-column layout                                            */}
      {/* ------------------------------------------------------------------ */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-0 divide-x divide-[#1e1e1e]">
        {/* ---------------------------------------------------------------- */}
        {/* Left panel: prompt + controls                                    */}
        {/* ---------------------------------------------------------------- */}
        <aside className="p-6 flex flex-col gap-5 border-b lg:border-b-0 border-[#1e1e1e]">
          <div>
            <h1 className="text-lg font-bold text-white">Run Agent</h1>
            <p className="text-xs text-[#6e6e6e] mt-1 font-mono">
              {config.repoFullName} · {AGENT_LABELS[config.agent]}
            </p>
          </div>

          {/* Prompt input */}
          <PromptInput
            value={prompt}
            onChange={setPrompt}
            onSubmit={startAgent}
            disabled={isRunning}
          />

          {/* Run / Stop buttons */}
          <div className="flex gap-2">
            {!isRunning ? (
              <Button
                id="start-agent-btn"
                onClick={startAgent}
                disabled={!prompt.trim() || isRunning}
                className="flex-1 bg-[#00ff87] hover:bg-[#00e07a] text-black font-semibold glow-green transition-all"
              >
                <Play className="mr-2 h-4 w-4" />
                Start Agent
              </Button>
            ) : (
              <Button
                id="stop-agent-btn"
                onClick={stopAgent}
                variant="outline"
                className="flex-1 border-red-500/50 text-red-400 hover:bg-red-950/20 font-mono text-sm"
              >
                <StopCircle className="mr-2 h-4 w-4" />
                Stop
              </Button>
            )}
          </div>

          {/* Error display */}
          {runError && (
            <div className="p-3 rounded-md border border-red-500/30 bg-red-950/20 animate-fade-in">
              <p className="text-red-400 text-xs font-mono leading-relaxed">{runError}</p>
            </div>
          )}

          {/* Success branch info */}
          {branch && !isRunning && (
            <div className="p-3 rounded-md border border-[#00ff87]/30 bg-[#00ff87]/5 animate-fade-in">
              <p className="text-[#00ff87] text-xs font-mono">
                ✓ Changes pushed to <span className="font-bold">{branch}</span>
              </p>
            </div>
          )}
        </aside>

        {/* ---------------------------------------------------------------- */}
        {/* Right panel: terminal + diff + PR button                        */}
        {/* ---------------------------------------------------------------- */}
        <section className="p-6 flex flex-col gap-4 overflow-auto">
          {/* Section heading */}
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-[#00ff87]" />
            <h2 className="text-sm font-semibold text-gray-300">Live Output</h2>
          </div>

          {/* Live terminal */}
          <StreamOutput events={events} isRunning={isRunning} />

          {/* Diff viewer — appears after agent finishes with changes */}
          {diff && <DiffViewer diff={diff} />}

          {/* PR button — appears after branch is set */}
          {branch && config && (
            <PRButton
              repoFullName={config.repoFullName}
              branch={branch}
              prompt={prompt}
              agent={config.agent}
            />
          )}
        </section>
      </main>
    </div>
  )
}
