/**
 * app/api/repos/[owner]/[repo]/content/route.ts
 *
 * GET /api/repos/:owner/:repo/content?path=<repo-relative-path>
 *
 * Returns authenticated text content for a single file in the selected GitHub
 * repository. The tree endpoint stays lightweight while IDE mode loads files
 * on demand.
 */

import { NextResponse, type NextRequest } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getRepoFileContent } from "@/lib/github"
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

  const filePath = req.nextUrl.searchParams.get("path")
  if (!filePath) {
    return NextResponse.json({ error: "Missing file path" }, { status: 400 })
  }
  const ref = req.nextUrl.searchParams.get("ref") ?? undefined

  const { owner, repo } = await context.params
  const repoFullName = `${decodeURIComponent(owner)}/${decodeURIComponent(repo)}`

  try {
    const file = await getRepoFileContent(token, repoFullName, filePath, ref)
    return NextResponse.json(file)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch file"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
