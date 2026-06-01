/**
 * components/DashboardClient.tsx
 *
 * Client-side dashboard shell.
 * Renders:
 *  - Top nav with logo, user avatar, sign-out button
 *  - RepoSelector (left / top on mobile)
 *  - AgentSelector (right / bottom on mobile)
 *  - "Run Agent" button that saves state to sessionStorage then navigates to /run
 */

"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { LogOut, Play, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { RepoSelector } from "@/components/RepoSelector"
import { AgentSelector } from "@/components/AgentSelector"
import { signOut } from "@/lib/auth-client"
import type { GitHubRepo, AgentType } from "@/types"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DashboardClientProps {
  user: {
    name: string | null
    email: string
    image: string | null
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DashboardClient({ user }: DashboardClientProps) {
  const router = useRouter()

  // State: repo + agent selection
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<AgentType | null>(null)
  const [apiKey, setApiKey] = useState("")
  const [signingOut, setSigningOut] = useState(false)
  const [savedProviders, setSavedProviders] = useState<AgentType[]>([])
  const [providerStorageAvailable, setProviderStorageAvailable] = useState(true)
  const [setupError, setSetupError] = useState<string | null>(null)
  const [savingRun, setSavingRun] = useState(false)
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  )

  // Validation — all three required to enable the CTA
  const hasSavedKey = selectedAgent ? savedProviders.includes(selectedAgent) : false
  const canRun = Boolean(selectedRepo && selectedAgent && (apiKey.trim() || hasSavedKey))
  const runDisabled = mounted ? !canRun || savingRun : false

  /** Load encrypted provider-key availability so returning users can run faster. */
  useEffect(() => {
    async function loadSavedProviders() {
      try {
        const res = await fetch("/api/provider-keys")
        if (!res.ok) {
          setProviderStorageAvailable(false)
          return
        }
        const data = (await res.json()) as {
          providers?: AgentType[]
          configured?: boolean
        }
        setProviderStorageAvailable(data.configured !== false)
        setSavedProviders(data.providers ?? [])
      } catch {
        // Key status is a convenience; the user can still paste a one-time key.
        setProviderStorageAvailable(false)
      }
    }

    loadSavedProviders()
  }, [])

  /** Persist selection to sessionStorage and navigate to /run */
  const handleRunAgent = async () => {
    if (!canRun || !selectedRepo || !selectedAgent) return

    setSavingRun(true)
    setSetupError(null)

    try {
      let oneTimeApiKey = ""

      if (apiKey.trim()) {
        if (!providerStorageAvailable) {
          oneTimeApiKey = apiKey.trim()
        } else {
          const keyRes = await fetch("/api/provider-keys", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: selectedAgent, apiKey }),
          })
          if (!keyRes.ok) {
            const data = (await keyRes.json()) as { error?: string }
            if (keyRes.status !== 503) {
              throw new Error(data.error ?? "Failed to save provider key")
            }

            // Convex is not configured yet; keep the run working with a one-time handoff.
            setProviderStorageAvailable(false)
            oneTimeApiKey = apiKey.trim()
          }
        }
      }

      const projectRes = await fetch("/api/app/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: selectedRepo, agent: selectedAgent }),
      })
      const projectData = (await projectRes.json()) as {
        projectId?: string
        error?: string
      }
      if (!projectRes.ok || !projectData.projectId) {
        throw new Error(projectData.error ?? "Failed to save project")
      }

      sessionStorage.setItem(
        "agentRun",
        JSON.stringify({
          repoFullName: selectedRepo.fullName,
          projectId: projectData.projectId,
          agent: selectedAgent,
          apiKey: oneTimeApiKey,
        })
      )
      router.push("/run")
    } catch (err: unknown) {
      setSetupError(err instanceof Error ? err.message : "Failed to prepare run")
    } finally {
      setSavingRun(false)
    }
  }

  /** Sign out via BetterAuth and redirect to landing */
  const handleSignOut = async () => {
    setSigningOut(true)
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = "/"
        },
      },
    })
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* ------------------------------------------------------------------ */}
      {/* Nav bar                                                             */}
      {/* ------------------------------------------------------------------ */}
      <nav className="border-b border-[#1e1e1e] bg-[#0d0d0d] px-4 sm:px-6 py-3 flex items-center justify-between">
        {/* Logo */}
        <span className="font-mono font-bold text-lg text-white">
          Agents<span className="text-[#00ff87]">Hub</span>
        </span>

        {/* User + sign-out */}
        <div className="flex items-center gap-3">
          {/* Avatar */}
          {user.image ? (
            <Image
              src={user.image}
              alt={user.name ?? user.email}
              width={28}
              height={28}
              className="rounded-full border border-[#2e2e2e]"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-[#1e1e1e] border border-[#2e2e2e] flex items-center justify-center text-xs text-[#6e6e6e]">
              {(user.name ?? user.email)[0].toUpperCase()}
            </div>
          )}

          <span className="hidden sm:block text-xs text-[#6e6e6e] font-mono">
            {user.name ?? user.email}
          </span>

          <Button
            id="sign-out-btn"
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            disabled={signingOut}
            className="text-[#6e6e6e] hover:text-red-400 hover:bg-red-950/20 text-xs font-mono"
          >
            <LogOut className="h-3.5 w-3.5 mr-1" />
            Sign out
          </Button>
        </div>
      </nav>

      {/* ------------------------------------------------------------------ */}
      {/* Main content                                                        */}
      {/* ------------------------------------------------------------------ */}
      <main className="flex-1 px-4 sm:px-6 py-8 max-w-5xl mx-auto w-full">
        {/* Page title */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">
            Configure your agent run
          </h1>
          <p className="text-sm text-[#6e6e6e] mt-1">
            Select a repository and an AI coding agent to get started.
          </p>
        </div>

        {/* Two-column grid on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* ------------------------------------------------------------ */}
          {/* Left: Repo selector                                           */}
          {/* ------------------------------------------------------------ */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded border border-[#2e2e2e] bg-[#1a1a1a] flex items-center justify-center text-[#00ff87] text-xs font-mono font-bold">
                1
              </span>
              <h2 className="text-sm font-semibold text-gray-300">
                Pick a repository
              </h2>
              {selectedRepo && (
                <ChevronRight className="h-3.5 w-3.5 text-[#00ff87] ml-auto" />
              )}
            </div>

            <div className="p-4 rounded-lg border border-[#1e1e1e] bg-[#0f0f0f]">
              <RepoSelector
                onSelect={setSelectedRepo}
                selectedRepo={selectedRepo}
              />
            </div>

            {/* Selected repo summary */}
            {selectedRepo && (
              <p className="text-xs text-[#00ff87] font-mono pl-1 animate-fade-in">
                ✓ {selectedRepo.fullName}
              </p>
            )}
          </section>

          {/* ------------------------------------------------------------ */}
          {/* Right: Agent selector                                         */}
          {/* ------------------------------------------------------------ */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded border border-[#2e2e2e] bg-[#1a1a1a] flex items-center justify-center text-[#00ff87] text-xs font-mono font-bold">
                2
              </span>
              <h2 className="text-sm font-semibold text-gray-300">
                Choose an agent
              </h2>
              {selectedAgent && apiKey && (
                <ChevronRight className="h-3.5 w-3.5 text-[#00ff87] ml-auto" />
              )}
            </div>

            <div className="p-4 rounded-lg border border-[#1e1e1e] bg-[#0f0f0f]">
              <AgentSelector
                selectedAgent={selectedAgent}
                apiKey={apiKey}
                hasSavedKey={hasSavedKey}
                onSelectAgent={(a) => {
                  setSelectedAgent(a)
                  setApiKey("") // reset key when switching agents
                }}
                onApiKeyChange={setApiKey}
              />
            </div>
          </section>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Run CTA                                                          */}
        {/* ---------------------------------------------------------------- */}
        <Separator className="my-8 bg-[#1e1e1e]" />

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Button
            id="run-agent-btn"
            onClick={handleRunAgent}
            disabled={runDisabled}
            size="lg"
            className={`
              font-semibold px-8 transition-all duration-200
              ${canRun
                ? "bg-[#00ff87] hover:bg-[#00e07a] text-black glow-green"
                : "bg-[#1a1a1a] text-[#4e4e4e] cursor-not-allowed border border-[#2e2e2e]"
              }
            `}
          >
            <Play className="mr-2 h-4 w-4" />
            {savingRun ? "Preparing…" : "Run Agent"}
          </Button>

          {!canRun && (
            <p className="text-xs text-[#4e4e4e] font-mono">
              {!selectedRepo
                ? "← Pick a repository first"
                : !selectedAgent
                ? "← Choose an agent"
                : "← Enter your API key or use a saved encrypted key"}
            </p>
          )}
          {setupError && (
            <p className="text-xs text-red-400 font-mono">{setupError}</p>
          )}
        </div>
      </main>
    </div>
  )
}
