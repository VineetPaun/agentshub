/**
 * app/api/repos/route.ts
 *
 * GET /api/repos
 *
 * Returns the authenticated user's GitHub repositories (up to 50, sorted by
 * most recently updated). Requires a valid BetterAuth session with a GitHub
 * access token.
 *
 * Response: GitHubRepo[]
 */

import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { listRepos } from "@/lib/github"

export async function GET(): Promise<NextResponse> {
  // Retrieve the current session from BetterAuth
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  // Guard: user must be authenticated and have a GitHub token
  if (!session?.session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Fetch the user's connected accounts to get the GitHub access token
  const accounts = await auth.api.listUserAccounts({
    headers: await headers(),
  })

  const githubAccount = accounts?.find((acc: any) => acc.providerId === "github")
  const token = githubAccount?.accessToken

  if (!token) {
    return NextResponse.json(
      { error: "GitHub access token missing from account" },
      { status: 401 }
    )
  }

  try {
    const repos = await listRepos(token)
    return NextResponse.json(repos)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch repos"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
