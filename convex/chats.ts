/**
 * convex/chats.ts
 *
 * Chat and message persistence functions.
 */
import { v } from "convex/values"
import { mutation } from "./_generated/server"
import { assertServerSecret } from "./serverAuth"

type IndexBuilder = {
  eq: (field: string, value: unknown) => IndexBuilder
}

const agentType = v.union(
  v.literal("opencode"),
  v.literal("gemini"),
  v.literal("codex")
)

export const getOrCreateFromServer = mutation({
  args: {
    serverSecret: v.string(),
    userId: v.id("users"),
    projectId: v.id("projects"),
    agent: agentType,
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertServerSecret(args.serverSecret)
    const now = Date.now()
    const existing = await ctx.db
      .query("chats")
      .withIndex("by_project_agent", (q: IndexBuilder) =>
        q.eq("projectId", args.projectId).eq("agent", args.agent)
      )
      .first()

    if (existing) {
      await ctx.db.patch(existing._id, { updatedAt: now })
      return existing._id
    }

    return await ctx.db.insert("chats", {
      userId: args.userId,
      projectId: args.projectId,
      agent: args.agent,
      title: args.title,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const addMessageFromServer = mutation({
  args: {
    serverSecret: v.string(),
    chatId: v.id("chats"),
    runId: v.optional(v.id("agentRuns")),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    assertServerSecret(args.serverSecret)
    const now = Date.now()
    return await ctx.db.insert("messages", {
      chatId: args.chatId,
      runId: args.runId,
      role: args.role,
      content: args.content,
      createdAt: now,
    })
  },
})
