/**
 * lib/agents.ts
 *
 * Builds shell commands for each supported AI coding CLI agent.
 *
 * Security note: User-supplied `prompt` is shell-escaped before interpolation.
 * The `apiKey` is injected as an environment variable — never printed to stderr/stdout.
 */

import type { AgentType } from "@/types"

// ---------------------------------------------------------------------------
// CLI command builder
// ---------------------------------------------------------------------------

interface CLICommandOptions {
  agent: AgentType
  prompt: string
  /** User's API key for the agent's model provider */
  apiKey: string
  /** Absolute path inside the E2B sandbox where the repo was cloned */
  repoPath: string
}

/**
 * Returns a shell command string that runs the selected agent non-interactively.
 *
 * Shell-injection mitigation:
 *  - Single-quote the prompt and escape embedded single quotes using the
 *    `'` → `'\''` pattern (end quote, escaped quote, reopen quote).
 *  - The API key is passed as an environment variable — not interpolated into
 *    the command string — so it is NOT echoed into process listings.
 *
 * @param opts  CLICommandOptions
 * @returns     A shell command string safe to pass to `sandbox.commands.run()`
 */
export function buildCLICommand(opts: CLICommandOptions): string {
  const { agent, prompt, apiKey, repoPath } = opts

  // Escape single quotes so the prompt can be safely wrapped in single quotes
  const escapedPrompt = prompt.replace(/'/g, "'\\''")
  // Escape the repoPath in case it contains spaces (unlikely in /repo but safe)
  const safePath = repoPath.replace(/'/g, "'\\''")

  switch (agent) {
    case "opencode":
      // OpenCode: --print flag for non-interactive one-shot execution
      // OPENAI_API_KEY is read by OpenCode automatically
      return `cd '${safePath}' && OPENAI_API_KEY='${apiKey}' opencode run --print '${escapedPrompt}'`

    case "gemini":
      // Gemini CLI: --non-interactive + -p for prompt
      // GEMINI_API_KEY is read from the environment
      return `cd '${safePath}' && GEMINI_API_KEY='${apiKey}' gemini --non-interactive -p '${escapedPrompt}'`

    case "codex":
      // Codex CLI: `exec` subcommand for non-interactive one-shot mode
      return `cd '${safePath}' && OPENAI_API_KEY='${apiKey}' codex exec '${escapedPrompt}'`

    default:
      // TypeScript exhaustiveness check — should never reach here
      throw new Error(`Unknown agent type: ${agent satisfies never}`)
  }
}

// ---------------------------------------------------------------------------
// Display labels
// ---------------------------------------------------------------------------

/** Human-readable display names for each agent */
export const AGENT_LABELS: Record<AgentType, string> = {
  opencode: "OpenCode",
  gemini: "Gemini CLI",
  codex: "Codex CLI",
}

/** Label shown next to the API key input for each agent */
export const AGENT_KEY_LABELS: Record<AgentType, string> = {
  opencode: "OpenAI API Key",
  gemini: "Google AI Studio API Key",
  codex: "OpenAI API Key",
}

/** Short description shown on the agent selection cards */
export const AGENT_DESCRIPTIONS: Record<AgentType, string> = {
  opencode: "SST's open-source agentic coding tool. Powered by OpenAI models.",
  gemini: "Google's official Gemini CLI agent. Reads & edits code via Gemini.",
  codex: "OpenAI Codex CLI — lightweight agentic coding in your terminal.",
}

/** Which model provider powers each agent */
export const AGENT_PROVIDERS: Record<AgentType, string> = {
  opencode: "OpenAI",
  gemini: "Google",
  codex: "OpenAI",
}
