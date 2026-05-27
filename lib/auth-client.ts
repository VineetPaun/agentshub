/**
 * lib/auth-client.ts
 *
 * BetterAuth browser-side client.
 * Import this in "use client" components that need signIn / signOut / useSession.
 *
 * Reference: https://www.better-auth.com/docs/basic-usage#client
 */

import { createAuthClient } from "better-auth/react"

/**
 * Pre-configured BetterAuth React client.
 *
 * Provides:
 *  - signIn.social({ provider: "github" })  — kick off GitHub OAuth
 *  - signOut()                               — clear session
 *  - useSession()                            — reactive session hook
 */
export const authClient = createAuthClient({
  // The base URL must match BETTER_AUTH_URL in your .env
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
})

// Named re-exports for convenience
export const { signIn, signOut, useSession } = authClient
