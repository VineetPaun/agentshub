/**
 * components/StreamOutput.tsx
 *
 * Live-scrolling terminal output component.
 * Renders a stream of AgentStreamEvents with colour-coded lines:
 *  - stdout  → light gray
 *  - stderr  → red
 *  - status  → electric green (dimmed)
 *
 * Auto-scrolls to the latest line as new events arrive.
 * Shows a blinking cursor while the agent is running.
 */

"use client"

import { useEffect, useRef } from "react"
import type { AgentStreamEvent } from "@/types"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface StreamOutputProps {
  /** Ordered list of SSE events received so far */
  events: AgentStreamEvent[]
  /** True while the agent is still running — shows blinking cursor */
  isRunning: boolean
}

// ---------------------------------------------------------------------------
// Colour mapping per event type
// ---------------------------------------------------------------------------

function getLineClass(type: AgentStreamEvent["type"]): string {
  switch (type) {
    case "stderr":
      return "text-red-400"
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

export function StreamOutput({ events, isRunning }: StreamOutputProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  /** Auto-scroll to bottom whenever a new event arrives */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [events])

  return (
    <div
      id="stream-output"
      className="terminal-bg border border-[#1e1e1e] rounded-lg p-4 h-96 overflow-y-auto font-mono text-sm leading-relaxed"
      aria-label="Agent output"
      aria-live="polite"
    >
      {/* Empty state */}
      {events.length === 0 && !isRunning && (
        <p className="text-[#3e3e3e] select-none">
          // Agent output will appear here…
        </p>
      )}

      {/* Event lines */}
      {events
        .filter((e) => e.type !== "diff") // diff is rendered in DiffViewer, not here
        .map((e, i) => (
          <div key={i} className={getLineClass(e.type)}>
            {e.type === "status" && (
              <span className="mr-2 text-[#00ff87]">›</span>
            )}
            {e.text || "\u00A0" /* non-breaking space to preserve empty lines */}
          </div>
        ))}

      {/* Blinking cursor while running */}
      {isRunning && (
        <div className="text-[#00ff87] cursor-blink mt-1 select-none">▌</div>
      )}

      {/* Scroll anchor */}
      <div ref={bottomRef} />
    </div>
  )
}
