/**
 * app/api/pr/create/route.ts
 *
 * POST /api/pr/create
 *
 * Opens a GitHub Pull Request from the agent's branch → the repo's default branch.
 * Called by the client after the agent run completes and the user clicks "Open PR".
 *
 * Body: { repoFullName, branch, prompt, agent }
 * Response: { url: string }  — the HTML URL of the created PR
 */

import { type NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { openPR } from "@/lib/github"
import { getGitHubAccessToken } from "@/lib/github-token"
import { createPullRequestRecord } from "@/lib/convex-server"
import type { AgentType } from "@/types"

export async function POST(req: NextRequest): Promise<NextResponse> {
  // -------------------------------------------------------------------------
  // Auth guard
  // -------------------------------------------------------------------------
  const requestHeaders = await headers()
  const session = await auth.api.getSession({ headers: requestHeaders })

  if (!session?.session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const githubToken = await getGitHubAccessToken(requestHeaders)

  if (!githubToken) {
    return NextResponse.json(
      { error: "GitHub access token missing — please sign out and sign in again" },
      { status: 401 }
    )
  }

  // -------------------------------------------------------------------------
  // Parse body
  // -------------------------------------------------------------------------
  let body: {
    repoFullName: string
    projectId?: string
    runId?: string
    branch: string
    prompt: string
    agent: AgentType
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { repoFullName, projectId, runId, branch, prompt, agent } = body

  if (!repoFullName || !branch || !prompt || !agent) {
    return NextResponse.json(
      { error: "Missing required fields: repoFullName, branch, prompt, agent" },
      { status: 400 }
    )
  }

  // -------------------------------------------------------------------------
  // Create the PR
  // -------------------------------------------------------------------------
  try {
    const prUrl = await openPR(
      githubToken,
      repoFullName,
      branch,
      // PR title: "[Agent/gemini] Fix the login bug" — truncated to 60 chars
      `[Agent/${agent}] ${prompt.slice(0, 60)}`,
      // PR body: markdown description
      [
        `This PR was opened automatically by **AgentsHub**.`,
        ``,
        `**Agent**: \`${agent}\``,
        `**Repository**: \`${repoFullName}\``,
        `**Prompt**:`,
        `> ${prompt}`,
      ].join("\n")
    )

    if (projectId && runId) {
      try {
        await createPullRequestRecord({
          runId,
          projectId,
          branch,
          url: prUrl,
          state: "open",
        })
      } catch {
        // The PR already exists on GitHub; do not hide its URL due to metadata persistence.
      }
    }

    return NextResponse.json({ url: prUrl })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create PR"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
