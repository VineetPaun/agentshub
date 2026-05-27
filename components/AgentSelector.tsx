/**
 * components/AgentSelector.tsx
 *
 * Three-card grid for choosing an AI coding agent.
 * When a card is clicked it expands to show an API key input for that provider.
 */

"use client"

import { useState } from "react"
import { Eye, EyeOff, CheckCircle2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { AGENT_LABELS, AGENT_DESCRIPTIONS, AGENT_KEY_LABELS, AGENT_PROVIDERS } from "@/lib/agents"
import type { AgentType } from "@/types"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AgentSelectorProps {
  /** Currently selected agent */
  selectedAgent: AgentType | null
  /** API key entered for the selected agent */
  apiKey: string
  /** Called when user selects a different agent */
  onSelectAgent: (agent: AgentType) => void
  /** Called when the API key changes */
  onApiKeyChange: (key: string) => void
}

// ---------------------------------------------------------------------------
// Agent metadata for rendering
// ---------------------------------------------------------------------------

const AGENTS: AgentType[] = ["opencode", "gemini", "codex"]

/** Colour accent per agent card */
const AGENT_ACCENTS: Record<AgentType, string> = {
  opencode: "#00ff87",
  gemini: "#4285f4",
  codex: "#10b981",
}

/** Emoji icons per agent */
const AGENT_ICONS: Record<AgentType, string> = {
  opencode: "⚡",
  gemini: "✦",
  codex: "◈",
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgentSelector({
  selectedAgent,
  apiKey,
  onSelectAgent,
  onApiKeyChange,
}: AgentSelectorProps) {
  const [showKey, setShowKey] = useState(false)

  return (
    <div id="agent-selector" className="flex flex-col gap-4">
      {/* Agent cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {AGENTS.map((agent) => {
          const isSelected = selectedAgent === agent
          const accent = AGENT_ACCENTS[agent]

          return (
            <Card
              key={agent}
              id={`agent-card-${agent}`}
              onClick={() => onSelectAgent(agent)}
              className={`
                cursor-pointer border transition-all duration-200 card-hover bg-[#111]
                ${isSelected
                  ? "border-[#00ff87]/60 shadow-[0_0_16px_#00ff8720]"
                  : "border-[#1e1e1e] hover:border-[#2e2e2e]"
                }
              `}
              style={isSelected ? { borderColor: `${accent}80` } : {}}
            >
              <CardHeader className="pb-1 pt-4 px-4">
                <div className="flex items-start justify-between">
                  {/* Icon + title */}
                  <div className="flex items-center gap-2">
                    <span
                      className="text-lg"
                      style={{ color: isSelected ? accent : "#4e4e4e" }}
                    >
                      {AGENT_ICONS[agent]}
                    </span>
                    <CardTitle className="text-sm font-semibold text-gray-200">
                      {AGENT_LABELS[agent]}
                    </CardTitle>
                  </div>

                  {/* Selected check */}
                  {isSelected && (
                    <CheckCircle2
                      className="h-4 w-4 shrink-0"
                      style={{ color: accent }}
                    />
                  )}
                </div>
              </CardHeader>

              <CardContent className="px-4 pb-4">
                <p className="text-xs text-muted-foreground leading-relaxed mb-2">
                  {AGENT_DESCRIPTIONS[agent]}
                </p>
                <Badge
                  variant="outline"
                  className="text-[10px] border-[#2e2e2e] text-[#6e6e6e]"
                >
                  {AGENT_PROVIDERS[agent]}
                </Badge>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* API key input — only shown when an agent is selected */}
      {selectedAgent && (
        <div className="flex flex-col gap-1.5 animate-fade-in">
          <label
            htmlFor="api-key-input"
            className="text-xs text-muted-foreground font-mono"
          >
            {AGENT_KEY_LABELS[selectedAgent]}
          </label>

          <div className="relative">
            <Input
              id="api-key-input"
              type={showKey ? "text" : "password"}
              placeholder="sk-…"
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              className="pr-10 bg-[#1a1a1a] border-[#2e2e2e] text-gray-200 font-mono text-sm placeholder:text-[#3e3e3e] focus-visible:ring-[#00ff87]/30 focus-visible:border-[#00ff87]/50"
              autoComplete="off"
              spellCheck={false}
            />
            {/* Toggle key visibility */}
            <button
              type="button"
              onClick={() => setShowKey((p) => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4e4e4e] hover:text-gray-400 transition-colors"
              aria-label={showKey ? "Hide API key" : "Show API key"}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <p className="text-[10px] text-[#4e4e4e] font-mono">
            Your key is never stored or logged — it's only used during the sandbox run.
          </p>
        </div>
      )}
    </div>
  )
}
