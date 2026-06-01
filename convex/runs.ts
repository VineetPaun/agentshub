/**
 * convex/runs.ts
 *
 * Agent run, stream event, and pull request persistence functions.
 */
import { v } from "convex/values"
import { mutation } from "./_generated/server"
import { assertServerSecret } from "./serverAuth"

const agentType = v.union(
  v.literal("opencode"),
  v.literal("gemini"),
  v.literal("codex")
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

export const createFromServer = mutation({
  args: {
    serverSecret: v.string(),
    userId: v.id("users"),
    projectId: v.id("projects"),
    chatId: v.id("chats"),
    agent: agentType,
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    assertServerSecret(args.serverSecret)
    const now = Date.now()
    return await ctx.db.insert("agentRuns", {
      userId: args.userId,
      projectId: args.projectId,
      chatId: args.chatId,
      agent: args.agent,
      prompt: args.prompt,
      status: "running",
      startedAt: now,
      updatedAt: now,
    })
  },
})

export const appendEventsFromServer = mutation({
  args: {
    serverSecret: v.string(),
    runId: v.id("agentRuns"),
    events: v.array(
      v.object({
        type: streamEventType,
        text: v.string(),
        sequence: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    assertServerSecret(args.serverSecret)
    const now = Date.now()
    for (const event of args.events) {
      await ctx.db.insert("runEvents", {
        runId: args.runId,
        type: event.type,
        text: event.text,
        sequence: event.sequence,
        createdAt: now,
      })
    }
  },
})

export const completeFromServer = mutation({
  args: {
    serverSecret: v.string(),
    runId: v.id("agentRuns"),
    status: v.union(
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    branch: v.optional(v.string()),
    sandboxId: v.optional(v.string()),
    diff: v.optional(v.string()),
    diffSummary: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertServerSecret(args.serverSecret)
    const now = Date.now()
    await ctx.db.patch(args.runId, {
      status: args.status,
      branch: args.branch,
      sandboxId: args.sandboxId,
      diff: args.diff,
      diffSummary: args.diffSummary,
      error: args.error,
      completedAt: now,
      updatedAt: now,
    })
  },
})

export const createPullRequestFromServer = mutation({
  args: {
    serverSecret: v.string(),
    runId: v.id("agentRuns"),
    projectId: v.id("projects"),
    branch: v.string(),
    url: v.string(),
    state: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertServerSecret(args.serverSecret)
    const now = Date.now()
    return await ctx.db.insert("pullRequests", {
      runId: args.runId,
      projectId: args.projectId,
      branch: args.branch,
      url: args.url,
      state: args.state,
      createdAt: now,
      updatedAt: now,
    })
  },
})
