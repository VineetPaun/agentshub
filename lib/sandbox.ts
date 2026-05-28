/**
 * lib/sandbox.ts
 *
 * E2B sandbox lifecycle helpers.
 *
 * All functions operate on an E2B `Sandbox` instance.
 * The sandbox is created once per agent run and killed in the `finally` block
 * of the streaming route — even if an error occurs.
 *
 * Reference: https://e2b.dev/docs
 */

import { CommandExitError, Sandbox } from "@e2b/code-interpreter"

/**
 * Wraps a string for safe single-quoted shell usage.
 *
 * @param value Raw string that will be passed as one shell argument.
 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

/**
 * Redacts a secret from command output before sending it to the browser.
 *
 * @param value Potentially sensitive stdout/stderr/error text.
 * @param secret Secret value that must not be exposed to the client.
 */
function redactSecret(value: string | undefined, secret: string): string {
  if (!secret) return value ?? ""
  return (value ?? "").replaceAll(secret, "[REDACTED]")
}

/**
 * Runs a sandbox command and converts E2B command failures into useful errors.
 *
 * @param sandbox Active E2B sandbox.
 * @param command Shell command to run inside the sandbox.
 * @param secret Optional secret to redact from command output.
 */
async function runSandboxCommand(
  sandbox: Sandbox,
  command: string,
  secret?: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    return await sandbox.commands.run(command)
  } catch (err: unknown) {
    if (err instanceof CommandExitError) {
      const stderr = redactSecret(err.stderr, secret ?? "")
      const stdout = redactSecret(err.stdout, secret ?? "")
      const details = stderr || stdout || err.message
      throw new Error(`Sandbox command failed (exit ${err.exitCode}): ${details}`)
    }

    throw err
  }
}

// ---------------------------------------------------------------------------
// Sandbox lifecycle
// ---------------------------------------------------------------------------

/**
 * Creates a new E2B sandbox from the pre-built agent template.
 *
 * The template ID is set via E2B_TEMPLATE_ID in .env.local after running:
 *   npx e2b template build --dockerfile ./Dockerfile.sandbox --name agent-sandbox
 *
 * @throws  If E2B_TEMPLATE_ID is not set or sandbox creation fails
 */
export async function createSandbox(): Promise<Sandbox> {
  const templateId = process.env.E2B_TEMPLATE_ID
  if (!templateId) {
    throw new Error(
      "E2B_TEMPLATE_ID is not set. Build the Dockerfile.sandbox template and add the ID to .env.local"
    )
  }

  return await Sandbox.create(templateId, {
    // Pass the E2B API key explicitly (also auto-read from E2B_API_KEY env)
    apiKey: process.env.E2B_API_KEY,
  })
}

// ---------------------------------------------------------------------------
// Git operations inside the sandbox
// ---------------------------------------------------------------------------

/**
 * Clones a GitHub repository into the sandbox at `targetPath`.
 * Uses an OAuth2 token URL so no SSH key is needed.
 *
 * @param sandbox       Active E2B sandbox
 * @param repoFullName  "owner/repo"
 * @param githubToken   GitHub OAuth access token (server-side only)
 * @param targetPath    Path inside sandbox (default: /home/user/repo)
 */
export async function cloneRepo(
  sandbox: Sandbox,
  repoFullName: string,
  githubToken: string,
  targetPath: string = "/home/user/repo"
): Promise<void> {
  // GitHub accepts OAuth tokens as the HTTPS username `x-access-token`.
  const encodedToken = encodeURIComponent(githubToken)
  const cloneUrl = `https://x-access-token:${encodedToken}@github.com/${repoFullName}.git`

  const result = await runSandboxCommand(
    sandbox,
    `git clone --depth=1 ${shellQuote(cloneUrl)} ${shellQuote(targetPath)}`,
    encodedToken
  )

  if (result.exitCode !== 0) {
    throw new Error(`git clone failed (exit ${result.exitCode}): ${result.stderr}`)
  }
}

/**
 * Returns the full `git diff HEAD` output from the repo after the agent runs.
 * An empty string means no changes were made.
 *
 * @param sandbox   Active E2B sandbox
 * @param repoPath  Repo path inside sandbox (default: /home/user/repo)
 */
export async function getDiff(
  sandbox: Sandbox,
  repoPath: string = "/home/user/repo"
): Promise<string> {
  const result = await runSandboxCommand(
    sandbox,
    `cd ${shellQuote(repoPath)} && git diff HEAD`
  )
  return result.stdout
}

/**
 * Commits all staged/unstaged changes and pushes to a new branch on GitHub.
 *
 * @param sandbox       Active E2B sandbox
 * @param repoPath      Repo path inside sandbox
 * @param branchName    New branch name (e.g. "agent/gemini-1234567890")
 * @param commitMessage Commit message (prompt truncated to 72 chars)
 * @param githubToken   GitHub OAuth access token (server-side only)
 * @param repoFullName  "owner/repo" for push URL
 */
export async function commitAndPush(
  sandbox: Sandbox,
  repoPath: string,
  branchName: string,
  commitMessage: string,
  githubToken: string,
  repoFullName: string
): Promise<void> {
  // Each command is run sequentially; we fail fast on any non-zero exit
  const commands = [
    // Set a neutral committer identity for the agent
    `cd ${shellQuote(repoPath)} && git config user.email "agent@agentshub.dev"`,
    `cd ${shellQuote(repoPath)} && git config user.name "AgentsHub Bot"`,
    // Create and switch to the new branch
    `cd ${shellQuote(repoPath)} && git checkout -b ${shellQuote(branchName)}`,
    // Stage everything (new, modified, deleted)
    `cd ${shellQuote(repoPath)} && git add -A`,
    // Commit with the agent prompt as the message
    `cd ${shellQuote(repoPath)} && git commit -m ${shellQuote(commitMessage)}`,
    // Push to GitHub using the authenticated HTTPS URL
    `cd ${shellQuote(repoPath)} && git push ${shellQuote(
      `https://x-access-token:${encodeURIComponent(githubToken)}@github.com/${repoFullName}.git`
    )} HEAD`,
  ]

  for (const cmd of commands) {
    const result = await runSandboxCommand(sandbox, cmd, githubToken)
    if (result.exitCode !== 0) {
      // Redact token from error message before surfacing to client
      const safeStderr = result.stderr.replace(githubToken, "[REDACTED]")
      throw new Error(`Sandbox command failed (exit ${result.exitCode}): ${safeStderr}`)
    }
  }
}
