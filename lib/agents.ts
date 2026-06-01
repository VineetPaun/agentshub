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
  // Escape the repoPath in case it contains spaces.
  const safePath = repoPath.replace(/'/g, "'\\''")
  // Use a consistent color-capable terminal env for headless CLI runs.
  const terminalEnv = "TERM=xterm-256color COLORTERM=truecolor FORCE_COLOR=1"

  switch (agent) {
    case "opencode":
      // OpenCode: `run` subcommand for non-interactive one-shot execution.
      // All tool permissions (file writes, etc.) are auto-approved in run mode.
      // OPENAI_API_KEY is read by OpenCode automatically.
      return `cd '${safePath}' && ${terminalEnv} OPENAI_API_KEY='${apiKey}' opencode run '${escapedPrompt}'`

    case "gemini":
      // Gemini CLI: -p for prompt (implies non-interactive/headless mode)
      // --yolo auto-approves all tool calls — without it, headless mode
      //   defaults to Plan Mode (read-only) and blocks all write operations.
      // --skip-trust is required in sandbox environments where the workspace
      //   hasn't been interactively trusted beforehand.
      // GEMINI_API_KEY is read from the environment
      return `cd '${safePath}' && ${terminalEnv} GEMINI_API_KEY='${apiKey}' gemini --skip-trust --yolo -p '${escapedPrompt}'`

    case "codex":
      // Codex CLI: `exec` subcommand for non-interactive one-shot mode.
      // --sandbox workspace-write allows the agent to edit/create files.
      //   Without it, exec defaults to read-only and blocks all writes.
      return `cd '${safePath}' && ${terminalEnv} OPENAI_API_KEY='${apiKey}' codex exec --sandbox workspace-write '${escapedPrompt}'`

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
