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
import type { GitHubRepo, RepoFileContent, RepoTreeNode } from "@/types"

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

/**
 * Returns a sanitized recursive file tree for a repository ref or default branch.
 *
 * @param accessToken  GitHub OAuth access token
 * @param repoFullName "owner/repo"
 * @param ref          Optional branch/SHA to inspect instead of the default branch
 */
export async function getRepoTree(
  accessToken: string,
  repoFullName: string,
  ref?: string
): Promise<RepoTreeNode> {
  const octokit = getOctokit(accessToken)
  const [owner, repo] = repoFullName.split("/")

  if (!owner || !repo) {
    throw new Error("Invalid repository name")
  }

  const { data: repoData } = await octokit.repos.get({ owner, repo })
  const { data: commitData } = await octokit.repos.getCommit({
    owner,
    repo,
    ref: ref || repoData.default_branch,
  })

  const { data: treeData } = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: commitData.commit.tree.sha,
    recursive: "true",
  })

  const root: RepoTreeNode = {
    id: "root",
    name: repoFullName,
    path: "",
    type: "folder",
    children: [],
  }

  const folders = new Map<string, RepoTreeNode>([["", root]])

  for (const entry of treeData.tree) {
    if (!entry.path || entry.type !== "blob") continue

    const parts = entry.path.split("/")
    const fileName = parts.pop()
    if (!fileName) continue

    let currentPath = ""
    let parent = root

    for (const folderName of parts) {
      currentPath = currentPath ? `${currentPath}/${folderName}` : folderName
      let folder = folders.get(currentPath)

      if (!folder) {
        folder = {
          id: currentPath,
          name: folderName,
          path: currentPath,
          type: "folder",
          children: [],
        }
        folders.set(currentPath, folder)
        parent.children?.push(folder)
      }

      parent = folder
    }

    parent.children?.push({
      id: entry.path,
      name: fileName,
      path: entry.path,
      type: "file",
    })
  }

  sortTree(root)
  return root
}

/**
 * Returns UTF-8 text content for a single file in a repository.
 *
 * @param accessToken  GitHub OAuth access token
 * @param repoFullName "owner/repo"
 * @param path         Repository-relative file path
 * @param ref          Optional branch/SHA to inspect instead of the default branch
 */
export async function getRepoFileContent(
  accessToken: string,
  repoFullName: string,
  path: string,
  ref?: string
): Promise<RepoFileContent> {
  const octokit = getOctokit(accessToken)
  const [owner, repo] = repoFullName.split("/")

  if (!owner || !repo) {
    throw new Error("Invalid repository name")
  }

  if (!path || path.startsWith("/") || path.includes("..")) {
    throw new Error("Invalid file path")
  }

  const { data } = await octokit.repos.getContent({ owner, repo, path, ref })
  if (Array.isArray(data) || data.type !== "file") {
    throw new Error("Requested path is not a file")
  }

  const rawContent = "content" in data ? data.content : undefined
  if (rawContent === undefined) {
    throw new Error("File content is unavailable from GitHub")
  }

  const decoded = Buffer.from(rawContent, "base64").toString("utf8")
  const isBinary = decoded.includes("\u0000")

  return {
    path: data.path,
    name: data.name,
    content: isBinary ? "" : decoded,
    encoding: "utf-8",
    size: data.size,
    isBinary,
  }
}

/** Sorts folders before files and then alphabetically for stable rendering. */
function sortTree(node: RepoTreeNode): void {
  if (!node.children) return

  node.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  for (const child of node.children) {
    sortTree(child)
  }
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
