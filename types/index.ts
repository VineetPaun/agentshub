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
  /** Convex project ID associated with this selected repository */
  projectId?: string
  /** Optional one-time API key; normally resolved from encrypted Convex storage */
  apiKey?: string
  /** Optional context from a previous run when the user continues the chat */
  continuation?: RunContinuationContext
}

/** Prior run context used to make follow-up prompts understandable to CLI agents. */
export interface RunContinuationContext {
  /** E2B sandbox ID to reconnect to for filesystem/process continuity */
  sandboxId?: string
  previousRunId?: string
  previousPrompt: string
  previousBranch?: string
  previousDiffSummary?: string
  recentOutput?: string
}

// ---------------------------------------------------------------------------
// Streaming event shapes (SSE)
// ---------------------------------------------------------------------------

/** Every Server-Sent Event emitted from /api/agent/run */
export interface AgentStreamEvent {
  /**
   * Event type:
   *  - stdout / stderr : raw CLI output
   *  - warning         : non-fatal warning text detected from stderr
   *  - status          : human-readable progress message
   *  - diff            : full git diff text after agent finishes
   *  - run             : run created; `text` contains the Convex run ID
   *  - sandbox         : sandbox ready; `text` contains the E2B sandbox ID
   *  - done            : agent finished; `text` contains the new branch name
   *  - error           : fatal error message
   */
  type: "stdout" | "stderr" | "warning" | "status" | "diff" | "run" | "sandbox" | "error" | "done"
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

/** Sanitized file tree node returned from the authenticated repo tree API */
export interface RepoTreeNode {
  id: string
  name: string
  path: string
  type: "folder" | "file"
  children?: RepoTreeNode[]
}

/** Text content returned from the authenticated repo file-content API */
export interface RepoFileContent {
  path: string
  name: string
  content: string
  encoding: "utf-8"
  size: number
  isBinary: boolean
}
