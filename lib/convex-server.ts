/**
 * lib/convex-server.ts
 *
 * Server-side Convex helpers used by Next.js API routes.
 */

import { ConvexHttpClient } from "convex/browser"
import { api } from "@/convex/_generated/api"
import type { AgentStreamEvent, AgentType, GitHubRepo } from "@/types"

interface SessionUser {
  id: string
  email: string
  name?: string | null
  image?: string | null
}

interface ProjectInput {
  repoFullName: string
  repoId?: number
  defaultBranch?: string
  private?: boolean
  language?: string | null
  selectedAgent?: AgentType
}

interface RunInput {
  userId: string
  projectId: string
  chatId: string
  agent: AgentType
  prompt: string
}

interface CompleteRunInput {
  runId: string
  status: "completed" | "failed" | "cancelled"
  branch?: string
  sandboxId?: string
  diff?: string
  diffSummary?: string
  error?: string
}

interface ProviderSecretRow {
  encryptedKey: string
}

let client: ConvexHttpClient | null = null

/** Provides a non-secret summary of missing Convex server configuration. */
export function getConvexConfigurationIssue(): string | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL
  const secret = process.env.CONVEX_SERVER_SECRET

  if (!url || url.includes("your-deployment")) {
    return "NEXT_PUBLIC_CONVEX_URL is missing or still set to the placeholder value."
  }

  if (!secret || secret.includes("generate_with_")) {
    return "CONVEX_SERVER_SECRET is missing or still set to the placeholder value."
  }

  return null
}

/** Returns true when Convex env vars look usable for server calls. */
export function isConvexConfigured(): boolean {
  return getConvexConfigurationIssue() === null
}

/** Adds actionable setup guidance without leaking any configured secrets. */
export function getConvexTroubleshootingHint(): string {
  const configIssue = getConvexConfigurationIssue()
  if (configIssue) return configIssue

  return "Convex env vars are present, but the Convex request failed. Check that the deployment is linked, Convex functions are deployed, and CONVEX_SERVER_SECRET matches the value set in Convex env."
}

/** Returns a lazily-created Convex HTTP client. */
function getClient(): ConvexHttpClient {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!isConvexConfigured() || !url) {
    throw new Error("Convex is not configured. Set NEXT_PUBLIC_CONVEX_URL and CONVEX_SERVER_SECRET.")
  }

  client ??= new ConvexHttpClient(url)
  return client
}

/** Returns the server-to-Convex shared secret. */
function getServerSecret(): string {
  const secret = process.env.CONVEX_SERVER_SECRET
  if (!isConvexConfigured() || !secret) {
    throw new Error("Convex is not configured. Set NEXT_PUBLIC_CONVEX_URL and CONVEX_SERVER_SECRET.")
  }
  return secret
}

/** Upserts the authenticated user into Convex. */
export async function upsertUser(user: SessionUser): Promise<string> {
  return await getClient().mutation(api.users.upsertFromServer, {
    serverSecret: getServerSecret(),
    authUserId: user.id,
    email: user.email,
    name: user.name ?? undefined,
    image: user.image ?? undefined,
  }) as string
}

/** Upserts a selected GitHub repository into Convex. */
export async function upsertProject(
  userId: string,
  project: ProjectInput | GitHubRepo
): Promise<string> {
  const repoFullName = "fullName" in project ? project.fullName : project.repoFullName
  const repoId = "id" in project ? project.id : project.repoId
  const selectedAgent = "selectedAgent" in project ? project.selectedAgent : undefined

  return await getClient().mutation(api.projects.upsertFromServer, {
    serverSecret: getServerSecret(),
    userId,
    repoId,
    repoFullName,
    defaultBranch: project.defaultBranch,
    private: project.private,
    language: project.language ?? undefined,
    selectedAgent,
  }) as string
}

/** Gets or creates a chat for a project-agent pair. */
export async function getOrCreateChat(
  userId: string,
  projectId: string,
  agent: AgentType,
  title?: string
): Promise<string> {
  return await getClient().mutation(api.chats.getOrCreateFromServer, {
    serverSecret: getServerSecret(),
    userId,
    projectId,
    agent,
    title,
  }) as string
}

/** Adds a chat message. */
export async function addMessage(
  chatId: string,
  role: "user" | "assistant" | "system",
  content: string,
  runId?: string
): Promise<void> {
  await getClient().mutation(api.chats.addMessageFromServer, {
    serverSecret: getServerSecret(),
    chatId,
    runId,
    role,
    content,
  })
}

/** Creates an agent run row. */
export async function createRun(input: RunInput): Promise<string> {
  return await getClient().mutation(api.runs.createFromServer, {
    serverSecret: getServerSecret(),
    ...input,
  }) as string
}

/** Persists streamed run events in a batch. */
export async function appendRunEvents(
  runId: string,
  events: Array<AgentStreamEvent & { sequence: number }>
): Promise<void> {
  if (events.length === 0) return
  await getClient().mutation(api.runs.appendEventsFromServer, {
    serverSecret: getServerSecret(),
    runId,
    events,
  })
}

/** Marks a run complete, failed, or cancelled. */
export async function completeRun(input: CompleteRunInput): Promise<void> {
  await getClient().mutation(api.runs.completeFromServer, {
    serverSecret: getServerSecret(),
    ...input,
  })
}

/** Saves an encrypted provider API key. */
export async function saveProviderSecret(
  userId: string,
  provider: AgentType,
  encryptedKey: string
): Promise<void> {
  await getClient().mutation(api.secrets.saveProviderSecretFromServer, {
    serverSecret: getServerSecret(),
    userId,
    provider,
    encryptedKey,
  })
}

/** Returns the encrypted provider key row for a user/provider. */
export async function getProviderSecret(
  userId: string,
  provider: AgentType
): Promise<ProviderSecretRow | null> {
  return await getClient().query(api.secrets.getProviderSecretFromServer, {
    serverSecret: getServerSecret(),
    userId,
    provider,
  }) as ProviderSecretRow | null
}

/** Returns which providers have encrypted keys saved. */
export async function listSavedProviderSecrets(userId: string): Promise<AgentType[]> {
  const rows = await getClient().query(api.secrets.listProviderSecretsFromServer, {
    serverSecret: getServerSecret(),
    userId,
  }) as Array<{ provider: AgentType }>

  return rows.map((row) => row.provider)
}

/** Stores PR metadata after manual creation. */
export async function createPullRequestRecord(input: {
  runId: string
  projectId: string
  branch: string
  url: string
  state?: string
}): Promise<void> {
  await getClient().mutation(api.runs.createPullRequestFromServer, {
    serverSecret: getServerSecret(),
    ...input,
  })
}
