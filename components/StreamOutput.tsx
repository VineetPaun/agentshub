/**
 * components/StreamOutput.tsx
 *
 * Live-scrolling terminal output component.
 * Renders a stream of AgentStreamEvents with colour-coded lines:
 *  - stdout  → light gray
 *  - stderr  → red
 *  - warning → amber
 *  - status  → electric green (dimmed)
 *
 * Auto-scrolls to the latest line as new events arrive.
 * Shows a blinking cursor while the agent is running.
 */

"use client"

import { useEffect, useRef, useState } from "react"
import {
  LOADING_WORD_DELAY_MS,
  LOADING_WORDS,
  getRandomLoadingWordIndex,
} from "@/lib/loading-words"
import { cn } from "@/lib/utils"
import type { AgentStreamEvent } from "@/types"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface StreamOutputProps {
  /** Ordered list of SSE events received so far */
  events: AgentStreamEvent[]
  /** True while the agent is still running — shows blinking cursor */
  isRunning: boolean
  /** Optional layout override for pages that need a taller terminal. */
  className?: string
}

// ---------------------------------------------------------------------------
// Colour mapping per event type
// ---------------------------------------------------------------------------

function getLineClass(type: AgentStreamEvent["type"]): string {
  switch (type) {
    case "stderr":
      return "text-red-400"
    case "warning":
      return "text-amber-400"
    case "status":
      return "text-[#00ff87] opacity-75 text-xs uppercase tracking-wider"
    case "error":
      return "text-red-500 font-semibold"
    default:
      // stdout, diff lines rendered here are plain text
      return "text-gray-300"
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StreamOutput({ events, isRunning, className }: StreamOutputProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const [loadingWordIndex, setLoadingWordIndex] = useState(0)
  const [quietEventCount, setQuietEventCount] = useState(-1)
  const isQuiet = isRunning && quietEventCount === events.length

  /** Auto-scroll to bottom whenever a new event arrives */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [events])

  /** Mark the stream quiet only after the latest event count has been stable. */
  useEffect(() => {
    if (!isRunning) return

    const timeout = window.setTimeout(() => {
      setQuietEventCount(events.length)
    }, 1800)

    return () => window.clearTimeout(timeout)
  }, [events.length, isRunning])

  /** Rotate playful working words randomly while the stream has been quiet briefly. */
  useEffect(() => {
    if (!isRunning) return

    const interval = window.setInterval(() => {
      setLoadingWordIndex((current) => getRandomLoadingWordIndex(current))
    }, LOADING_WORD_DELAY_MS)

    return () => window.clearInterval(interval)
  }, [isRunning])

  return (
    <div
      id="stream-output"
      className={cn(
        "terminal-bg border border-[#1e1e1e] rounded-lg p-4 h-96 overflow-y-auto font-mono text-sm leading-relaxed",
        className
      )}
      aria-label="Agent output"
      aria-live="polite"
    >
      {/* Empty state */}
      {events.length === 0 && !isRunning && (
        <p className="text-[#3e3e3e] select-none">
          {"// Agent output will appear here…"}
        </p>
      )}

      {/* Event lines */}
      {events
        .filter((e) => e.type !== "diff" && e.type !== "run" && e.type !== "sandbox") // rendered outside terminal
        .map((e, i) => (
          <div key={i} className={getLineClass(e.type)}>
            {e.type === "status" && (
              <span className="mr-2 text-[#00ff87]">›</span>
            )}
            {e.text || "\u00A0" /* non-breaking space to preserve empty lines */}
          </div>
        ))}

      {/* Quiet-period working indicator */}
      {isRunning && isQuiet && (
        <div className="mt-1 text-[#00ff87] opacity-80">
          <span className="mr-2">›</span>
          {LOADING_WORDS[loadingWordIndex]}…
        </div>
      )}

      {/* Blinking cursor while running */}
      {isRunning && (
        <div className="text-[#00ff87] cursor-blink mt-1 select-none">▌</div>
      )}

      {/* Scroll anchor */}
      <div ref={bottomRef} />
    </div>
  )
}
