/**
 * components/DiffViewer.tsx
 *
 * Renders a `git diff HEAD` string with syntax-highlighted lines:
 *  + lines  → green (additions)
 *  - lines  → red  (deletions)
 *  @@ lines → blue (hunk headers)
 *  diff/index lines → amber (file headers)
 *  unchanged → muted gray
 *
 * Only appears after the agent finishes and diff is non-empty.
 */

"use client"

import type { FC } from "react"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DiffViewerProps {
  /** Raw git diff string — empty string means "not yet available" */
  diff: string
}

// ---------------------------------------------------------------------------
// Line colour helper
// ---------------------------------------------------------------------------

function getDiffLineClass(line: string): string {
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return "text-green-400 bg-green-950/30"
  }
  if (line.startsWith("-") && !line.startsWith("---")) {
    return "text-red-400 bg-red-950/30"
  }
  if (line.startsWith("@@")) {
    return "text-blue-400 bg-blue-950/20"
  }
  if (line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("+++") || line.startsWith("---")) {
    return "text-amber-500/80"
  }
  return "text-gray-500"
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const DiffViewer: FC<DiffViewerProps> = ({ diff }) => {
  // Don't render if there's nothing to show yet
  if (!diff) return null

  const lines = diff.split("\n")

  return (
    <div
      id="diff-viewer"
      className="mt-4 animate-slide-up"
      aria-label="Code diff"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[#00ff87] font-semibold text-sm font-mono">
          ∆ Changes
        </span>
        <span className="text-[#3e3e3e] text-xs font-mono">
          ({lines.filter((l) => l.startsWith("+") && !l.startsWith("+++")).length} additions,{" "}
          {lines.filter((l) => l.startsWith("-") && !l.startsWith("---")).length} deletions)
        </span>
      </div>

      {/* Diff body */}
      <div className="terminal-bg border border-[#1e1e1e] rounded-lg p-4 overflow-x-auto font-mono text-xs max-h-80 overflow-y-auto">
        {lines.map((line, i) => (
          <div
            key={i}
            className={`whitespace-pre leading-5 px-1 ${getDiffLineClass(line)}`}
          >
            {line || "\u00A0"}
          </div>
        ))}
      </div>
    </div>
  )
}
