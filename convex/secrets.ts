/**
 * convex/secrets.ts
 *
 * Encrypted provider API key storage. Plaintext never enters Convex.
 */
import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { assertServerSecret } from "./serverAuth"

type IndexBuilder = {
  eq: (field: string, value: unknown) => IndexBuilder
}

interface ProviderSecretRow {
  provider: "opencode" | "gemini" | "codex"
  updatedAt: number
}

const agentType = v.union(
  v.literal("opencode"),
  v.literal("gemini"),
  v.literal("codex")
)

export const saveProviderSecretFromServer = mutation({
  args: {
    serverSecret: v.string(),
    userId: v.id("users"),
    provider: agentType,
    encryptedKey: v.string(),
  },
  handler: async (ctx, args) => {
    assertServerSecret(args.serverSecret)
    const now = Date.now()
    const existing = await ctx.db
      .query("providerSecrets")
      .withIndex("by_user_provider", (q: IndexBuilder) =>
        q.eq("userId", args.userId).eq("provider", args.provider)
      )
      .unique()

    if (existing) {
      await ctx.db.patch(existing._id, {
        encryptedKey: args.encryptedKey,
        updatedAt: now,
      })
      return existing._id
    }

    return await ctx.db.insert("providerSecrets", {
      userId: args.userId,
      provider: args.provider,
      encryptedKey: args.encryptedKey,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const getProviderSecretFromServer = query({
  args: {
    serverSecret: v.string(),
    userId: v.id("users"),
    provider: agentType,
  },
  handler: async (ctx, args) => {
    assertServerSecret(args.serverSecret)
    return await ctx.db
      .query("providerSecrets")
      .withIndex("by_user_provider", (q: IndexBuilder) =>
        q.eq("userId", args.userId).eq("provider", args.provider)
      )
      .unique()
  },
})

export const listProviderSecretsFromServer = query({
  args: {
    serverSecret: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    assertServerSecret(args.serverSecret)
    const rows = await ctx.db
      .query("providerSecrets")
      .withIndex("by_user", (q: IndexBuilder) => q.eq("userId", args.userId))
      .collect()

    return rows.map((row: ProviderSecretRow) => ({
      provider: row.provider,
      updatedAt: row.updatedAt,
    }))
  },
})
