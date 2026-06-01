/**
 * app/api/repos/[owner]/[repo]/tree/route.ts
 *
 * GET /api/repos/:owner/:repo/tree
 *
 * Returns a sanitized file tree for the selected GitHub repository.
 */

import { NextResponse, type NextRequest } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getRepoTree } from "@/lib/github"
import { getGitHubAccessToken } from "@/lib/github-token"

interface RouteContext {
  params: Promise<{
    owner: string
    repo: string
  }>
}

export async function GET(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const requestHeaders = await headers()
  const session = await auth.api.getSession({ headers: requestHeaders })

  if (!session?.session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const token = await getGitHubAccessToken(requestHeaders)
  if (!token) {
    return NextResponse.json(
      { error: "GitHub access token missing from account" },
      { status: 401 }
    )
  }

  const { owner, repo } = await context.params
  const repoFullName = `${decodeURIComponent(owner)}/${decodeURIComponent(repo)}`
  const ref = req.nextUrl.searchParams.get("ref") ?? undefined

  try {
    const tree = await getRepoTree(token, repoFullName, ref)
    return NextResponse.json(tree)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch repo tree"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
