/**
 * convex/users.ts
 *
 * User persistence functions keyed by BetterAuth user IDs.
 */
import { v } from "convex/values"
import { mutation } from "./_generated/server"
import { assertServerSecret } from "./serverAuth"

type IndexBuilder = {
  eq: (field: string, value: unknown) => IndexBuilder
}

export const upsertFromServer = mutation({
  args: {
    serverSecret: v.string(),
    authUserId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertServerSecret(args.serverSecret)
    const now = Date.now()
    const existing = await ctx.db
      .query("users")
      .withIndex("by_auth_user_id", (q: IndexBuilder) => q.eq("authUserId", args.authUserId))
      .unique()

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: args.email,
        name: args.name,
        image: args.image,
        updatedAt: now,
      })
      return existing._id
    }

    return await ctx.db.insert("users", {
      authUserId: args.authUserId,
      email: args.email,
      name: args.name,
      image: args.image,
      createdAt: now,
      updatedAt: now,
    })
  },
})
