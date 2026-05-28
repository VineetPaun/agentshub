/**
 * components/RepoSelector.tsx
 *
 * Searchable list of the user's GitHub repositories.
 * Fetches from /api/repos on mount.
 * Calls `onSelect(repo)` when the user clicks a repo card.
 */

"use client"

import { useState, useEffect, useMemo } from "react"
import { Search, Lock, Unlock, GitBranch, Loader2, AlertCircle } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import type { GitHubRepo } from "@/types"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RepoSelectorProps {
  /** Called when the user clicks a repo */
  onSelect: (repo: GitHubRepo) => void
  /** Currently selected repo (for highlight) */
  selectedRepo: GitHubRepo | null
}

// ---------------------------------------------------------------------------
// Language colour dots (subset of popular languages)
// ---------------------------------------------------------------------------

const LANG_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572A5",
  Rust: "#dea584",
  Go: "#00ADD8",
  Java: "#b07219",
  "C++": "#f34b7d",
  C: "#555555",
  Ruby: "#701516",
  PHP: "#4F5D95",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  Shell: "#89e051",
  HTML: "#e34c26",
  CSS: "#563d7c",
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RepoSelector({ onSelect, selectedRepo }: RepoSelectorProps) {
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")

  /** Fetch repos from the API on mount */
  useEffect(() => {
    const fetchRepos = async () => {
      try {
        const res = await fetch("/api/repos")
        const data = (await res.json()) as GitHubRepo[] | { error?: string }
        if (!res.ok) {
          const message = "error" in data ? data.error : null
          throw new Error(message ?? "Failed to fetch repositories")
        }
        if (!Array.isArray(data)) {
          throw new Error("Repository response was not a list")
        }
        setRepos(data)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load repos")
      } finally {
        setLoading(false)
      }
    }

    fetchRepos()
  }, [])

  /** Filter repos by the search query (matches fullName case-insensitively) */
  const filtered = useMemo(() => {
    if (!query.trim()) return repos
    const lower = query.toLowerCase()
    return repos.filter((r) => r.fullName.toLowerCase().includes(lower))
  }, [repos, query])

  // -------------------------------------------------------------------------
  // States
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading repositories…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-red-400 py-4">
        <AlertCircle className="h-4 w-4" />
        <span className="text-sm">{error}</span>
      </div>
    )
  }

  return (
    <div id="repo-selector" className="flex flex-col gap-3">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          id="repo-search"
          placeholder="Search repositories…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9 bg-[#1a1a1a] border-[#2e2e2e] text-gray-200 placeholder:text-[#4e4e4e] focus-visible:ring-[#00ff87]/30 focus-visible:border-[#00ff87]/50"
        />
      </div>

      {/* Repo list */}
      <div className="max-h-72 overflow-y-auto flex flex-col gap-1 pr-1">
        {filtered.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-4">
            No repositories found.
          </p>
        ) : (
          filtered.map((repo) => {
            const isSelected = selectedRepo?.id === repo.id
            const langColor = repo.language ? (LANG_COLORS[repo.language] ?? "#6e6e6e") : null

            return (
              <button
                key={repo.id}
                id={`repo-${repo.id}`}
                onClick={() => onSelect(repo)}
                className={`
                  w-full text-left px-3 py-2.5 rounded-md border transition-all duration-150
                  flex items-center justify-between gap-2
                  ${isSelected
                    ? "border-[#00ff87]/60 bg-[#00ff87]/8 text-[#00ff87]"
                    : "border-[#1e1e1e] bg-[#111] hover:border-[#2e2e2e] hover:bg-[#161616] text-gray-300"
                  }
                `}
              >
                {/* Left: icon + name */}
                <div className="flex items-center gap-2 min-w-0">
                  {repo.private ? (
                    <Lock className="h-3.5 w-3.5 text-[#4e4e4e] shrink-0" />
                  ) : (
                    <Unlock className="h-3.5 w-3.5 text-[#4e4e4e] shrink-0" />
                  )}
                  <span className="font-mono text-sm truncate">{repo.fullName}</span>
                </div>

                {/* Right: language badge + default branch */}
                <div className="flex items-center gap-2 shrink-0">
                  {langColor && repo.language && (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 border-[#2e2e2e] text-[#8e8e8e] gap-1"
                    >
                      <span
                        className="inline-block w-2 h-2 rounded-full"
                        style={{ backgroundColor: langColor }}
                      />
                      {repo.language}
                    </Badge>
                  )}
                  <span className="flex items-center gap-1 text-[10px] text-[#4e4e4e] font-mono">
                    <GitBranch className="h-3 w-3" />
                    {repo.defaultBranch}
                  </span>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
