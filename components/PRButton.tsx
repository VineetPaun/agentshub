/**
 * components/PRButton.tsx
 *
 * Button that opens a GitHub Pull Request for the agent's branch.
 * Only rendered after the agent run completes and a branch name is available.
 *
 * On click it POSTs to /api/pr/create and opens the resulting PR URL in a
 * new tab.
 */

"use client"

import { useState } from "react"
import { GitPullRequest, ExternalLink, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { AgentType } from "@/types"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PRButtonProps {
  /** "owner/repo" */
  repoFullName: string
  /** Branch created by the agent, e.g. "agent/gemini-1234567890" */
  branch: string
  /** The original user prompt (included in PR body) */
  prompt: string
  /** Which agent ran */
  agent: AgentType
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PRButton({ repoFullName, branch, prompt, agent }: PRButtonProps) {
  const [loading, setLoading] = useState(false)
  const [prUrl, setPrUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  /** POST to /api/pr/create and open the resulting URL in a new tab */
  const handleOpenPR = async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/pr/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoFullName, branch, prompt, agent }),
      })

      const data = (await res.json()) as { url?: string; error?: string }

      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Failed to create PR")
      }

      setPrUrl(data.url)
      window.open(data.url, "_blank", "noopener,noreferrer")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create PR")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-2 animate-slide-up">
      {/* Primary action */}
      {!prUrl ? (
        <Button
          id="open-pr-btn"
          onClick={handleOpenPR}
          disabled={loading}
          className="bg-[#00ff87] hover:bg-[#00e07a] text-black font-semibold glow-green transition-all duration-200 w-full sm:w-auto"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating PR…
            </>
          ) : (
            <>
              <GitPullRequest className="mr-2 h-4 w-4" />
              Open Pull Request on GitHub
            </>
          )}
        </Button>
      ) : (
        // PR already created — show a link
        <a
          href={prUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-[#00ff87] hover:underline text-sm font-mono"
          id="pr-link"
        >
          <ExternalLink className="h-4 w-4" />
          {prUrl}
        </a>
      )}

      {/* Branch info */}
      <p className="text-[#4e4e4e] text-xs font-mono">
        Branch: <span className="text-[#6e6e6e]">{branch}</span>
      </p>

      {/* Error message */}
      {error && (
        <p className="text-red-400 text-sm font-mono">{error}</p>
      )}
    </div>
  )
}
