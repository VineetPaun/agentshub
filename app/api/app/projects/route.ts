/**
 * app/api/app/projects/route.ts
 *
 * Persists selected project metadata into Convex.
 */

import { NextResponse, type NextRequest } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { isConvexConfigured, upsertProject, upsertUser } from "@/lib/convex-server"
import type { AgentType, GitHubRepo } from "@/types"

/** Uses a local project reference when Convex is unavailable during setup. */
function localProjectResponse(repoFullName: string, message: string): NextResponse {
  return NextResponse.json({
    projectId: `local:${repoFullName}`,
    configured: false,
    message,
  })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestHeaders = await headers()
  const session = await auth.api.getSession({ headers: requestHeaders })

  if (!session?.session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { repo?: GitHubRepo; agent?: AgentType }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body.repo?.fullName || !body.agent) {
    return NextResponse.json(
      { error: "Missing required fields: repo, agent" },
      { status: 400 }
    )
  }

  if (!isConvexConfigured()) {
    return localProjectResponse(
      body.repo.fullName,
      "Convex is not configured yet; using a local project reference."
    )
  }

  try {
    const userId = await upsertUser(session.user)
    const projectId = await upsertProject(userId, {
      ...body.repo,
      selectedAgent: body.agent,
    })

    return NextResponse.json({ projectId })
  } catch (err: unknown) {
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Convex project storage is unavailable; using a local project reference."
    return localProjectResponse(body.repo.fullName, message)
  }
}
