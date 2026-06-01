/**
 * convex/projects.ts
 *
 * Project records for selected GitHub repositories.
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

export const upsertFromServer = mutation({
  args: {
    serverSecret: v.string(),
    userId: v.id("users"),
    repoId: v.optional(v.number()),
    repoFullName: v.string(),
    defaultBranch: v.optional(v.string()),
    private: v.optional(v.boolean()),
    language: v.optional(v.string()),
    selectedAgent: v.optional(agentType),
  },
  handler: async (ctx, args) => {
    assertServerSecret(args.serverSecret)
    const now = Date.now()
    const [owner, repo] = args.repoFullName.split("/")
    const existing = await ctx.db
      .query("projects")
      .withIndex("by_user_repo", (q: IndexBuilder) =>
        q.eq("userId", args.userId).eq("repoFullName", args.repoFullName)
      )
      .unique()

    const patch = {
      repoId: args.repoId,
      owner: owner ?? "",
      repo: repo ?? "",
      defaultBranch: args.defaultBranch,
      private: args.private,
      language: args.language,
      selectedAgent: args.selectedAgent,
      updatedAt: now,
    }

    if (existing) {
      await ctx.db.patch(existing._id, patch)
      return existing._id
    }

    return await ctx.db.insert("projects", {
      userId: args.userId,
      repoFullName: args.repoFullName,
      createdAt: now,
      ...patch,
    })
  },
})
