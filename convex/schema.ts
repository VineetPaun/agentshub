/**
 * convex/schema.ts
 *
 * Convex database schema for AgentsHub application data.
 */

import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

const agentType = v.union(
  v.literal("opencode"),
  v.literal("gemini"),
  v.literal("codex")
)

const runStatus = v.union(
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("cancelled")
)

const streamEventType = v.union(
  v.literal("stdout"),
  v.literal("stderr"),
  v.literal("warning"),
  v.literal("status"),
  v.literal("diff"),
  v.literal("run"),
  v.literal("sandbox"),
  v.literal("error"),
  v.literal("done")
)

export default defineSchema({
  users: defineTable({
    authUserId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_auth_user_id", ["authUserId"]),

  projects: defineTable({
    userId: v.id("users"),
    repoId: v.optional(v.number()),
    repoFullName: v.string(),
    owner: v.string(),
    repo: v.string(),
    defaultBranch: v.optional(v.string()),
    private: v.optional(v.boolean()),
    language: v.optional(v.string()),
    selectedAgent: v.optional(agentType),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_repo", ["userId", "repoFullName"]),

  chats: defineTable({
    userId: v.id("users"),
    projectId: v.id("projects"),
    agent: agentType,
    title: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_project_agent", ["projectId", "agent"]),

  messages: defineTable({
    chatId: v.id("chats"),
    runId: v.optional(v.id("agentRuns")),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    content: v.string(),
    createdAt: v.number(),
  })
    .index("by_chat", ["chatId"])
    .index("by_run", ["runId"]),

  agentRuns: defineTable({
    userId: v.id("users"),
    projectId: v.id("projects"),
    chatId: v.id("chats"),
    agent: agentType,
    prompt: v.string(),
    status: runStatus,
    sandboxId: v.optional(v.string()),
    branch: v.optional(v.string()),
    diff: v.optional(v.string()),
    diffSummary: v.optional(v.string()),
    error: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_project", ["projectId"])
    .index("by_chat", ["chatId"]),

  runEvents: defineTable({
    runId: v.id("agentRuns"),
    type: streamEventType,
    text: v.string(),
    sequence: v.number(),
    createdAt: v.number(),
  }).index("by_run", ["runId"]),

  pullRequests: defineTable({
    runId: v.id("agentRuns"),
    projectId: v.id("projects"),
    branch: v.string(),
    url: v.string(),
    state: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_run", ["runId"])
    .index("by_project", ["projectId"]),

  providerSecrets: defineTable({
    userId: v.id("users"),
    provider: agentType,
    encryptedKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_provider", ["userId", "provider"]),
})
