/**
 * components/PromptInput.tsx
 *
 * Textarea for the user's natural-language prompt to the AI agent.
 * Supports Ctrl+Enter / Cmd+Enter to submit.
 * Shows a character count and optional warning at 2000 chars.
 */

"use client"

import type { KeyboardEvent } from "react"
import { Textarea } from "@/components/ui/textarea"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PromptInputProps {
  value: string
  onChange: (val: string) => void
  /** Called when the user submits (button click or Ctrl+Enter) */
  onSubmit: () => void
  /** Disable the textarea while the agent is running */
  disabled?: boolean
}

const MAX_CHARS = 2000

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PromptInput({ value, onChange, onSubmit, disabled }: PromptInputProps) {
  const charCount = value.length
  const isNearLimit = charCount > MAX_CHARS * 0.85
  const isOverLimit = charCount > MAX_CHARS

  /** Submit on Ctrl+Enter or Cmd+Enter */
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault()
      if (!disabled && !isOverLimit && value.trim()) {
        onSubmit()
      }
    }
  }

  return (
    <div id="prompt-input-wrapper" className="flex flex-col gap-1.5">
      {/* Label */}
      <label htmlFor="prompt-textarea" className="text-xs text-muted-foreground font-mono">
        Describe what you want the agent to do
      </label>

      {/* Textarea */}
      <Textarea
        id="prompt-textarea"
        placeholder={`e.g. "Add TypeScript strict mode and fix all type errors"\n"Refactor the auth module to use async/await instead of callbacks"`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        rows={5}
        className="resize-none bg-[#1a1a1a] border-[#2e2e2e] text-gray-200 font-mono text-sm placeholder:text-[#3e3e3e] leading-relaxed focus-visible:ring-[#00ff87]/30 focus-visible:border-[#00ff87]/50 disabled:opacity-50"
        aria-describedby="prompt-hint"
        spellCheck={false}
      />

      {/* Footer: hint + char count */}
      <div className="flex justify-between items-center">
        <p
          id="prompt-hint"
          className="text-[10px] text-[#4e4e4e] font-mono"
        >
          Ctrl+Enter to run
        </p>
        <span
          className={`text-[10px] font-mono transition-colors ${
            isOverLimit
              ? "text-red-400"
              : isNearLimit
              ? "text-amber-400"
              : "text-[#4e4e4e]"
          }`}
        >
          {charCount} / {MAX_CHARS}
        </span>
      </div>
    </div>
  )
}
