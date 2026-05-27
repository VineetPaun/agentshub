/**
 * lib/github.ts
 *
 * Octokit helper functions for all GitHub API interactions.
 *
 * Rules enforced here:
 *  - Access tokens are ONLY used server-side (never returned to client)
 *  - All Octokit instances are created fresh per-request (stateless)
 */

import { Octokit } from "@octokit/rest"
import type { GitHubRepo } from "@/types"

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

/**
 * Creates a new Octokit REST client authenticated with the user's GitHub token.
 *
 * @param accessToken  GitHub OAuth access token from the BetterAuth session
 */
export function getOctokit(accessToken: string): Octokit {
  return new Octokit({ auth: accessToken })
}

// ---------------------------------------------------------------------------
// Repository helpers
// ---------------------------------------------------------------------------

/**
 * Returns the 50 most-recently-updated repos accessible to the authenticated user.
 * Includes owned repos and repos they collaborate on.
 *
 * @param accessToken  GitHub OAuth access token
 */
export async function listRepos(accessToken: string): Promise<GitHubRepo[]> {
  const octokit = getOctokit(accessToken)
  const { data } = await octokit.repos.listForAuthenticatedUser({
    sort: "updated",
    per_page: 50,
    affiliation: "owner,collaborator",
  })

  return data.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    private: r.private,
    language: r.language ?? null,
    updatedAt: r.updated_at ?? null,
    defaultBranch: r.default_branch,
  }))
}

// ---------------------------------------------------------------------------
// Pull request helper
// ---------------------------------------------------------------------------

/**
 * Opens a GitHub Pull Request from `branch` → default branch.
 *
 * @param accessToken    GitHub OAuth access token
 * @param repoFullName   "owner/repo" string
 * @param branch         The feature branch created by the agent
 * @param title          PR title
 * @param body           PR description (markdown)
 * @returns              HTML URL of the newly created PR
 */
export async function openPR(
  accessToken: string,
  repoFullName: string,
  branch: string,
  title: string,
  body: string
): Promise<string> {
  const octokit = getOctokit(accessToken)
  const [owner, repo] = repoFullName.split("/")

  // Fetch repo details so we know the default branch (main / master / etc.)
  const { data: repoData } = await octokit.repos.get({ owner, repo })

  const { data: pr } = await octokit.pulls.create({
    owner,
    repo,
    title,
    body,
    head: branch,
    base: repoData.default_branch,
  })

  return pr.html_url
}
