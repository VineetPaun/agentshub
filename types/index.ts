/**
 * types/index.ts
 *
 * Central type definitions for AgentsHub.
 * All shared interfaces and enums live here to avoid circular imports.
 */

// ---------------------------------------------------------------------------
// Agent types
// ---------------------------------------------------------------------------

/** The three supported AI coding CLI agents */
export type AgentType = "opencode" | "gemini" | "codex"

// ---------------------------------------------------------------------------
// API request/response shapes
// ---------------------------------------------------------------------------

/** Body sent from the client to POST /api/agent/run */
export interface RunRequest {
  /** e.g. "username/my-repo" */
  repoFullName: string
  /** Natural-language prompt for the agent */
  prompt: string
  /** Which CLI agent to use */
  agent: AgentType
  /** User's API key for the agent's model provider (never logged / persisted) */
  apiKey: string
}

// ---------------------------------------------------------------------------
// Streaming event shapes (SSE)
// ---------------------------------------------------------------------------

/** Every Server-Sent Event emitted from /api/agent/run */
export interface AgentStreamEvent {
  /**
   * Event type:
   *  - stdout / stderr : raw CLI output
   *  - status          : human-readable progress message
   *  - diff            : full git diff text after agent finishes
   *  - done            : agent finished; `text` contains the new branch name
   *  - error           : fatal error message
   */
  type: "stdout" | "stderr" | "status" | "diff" | "error" | "done"
  text: string
}

// ---------------------------------------------------------------------------
// GitHub repo shape (returned by /api/repos)
// ---------------------------------------------------------------------------

export interface GitHubRepo {
  id: number
  fullName: string
  private: boolean
  language: string | null
  updatedAt: string | null
  defaultBranch: string
}
