/**
 * lib/auth.ts
 *
 * BetterAuth configuration for GitHub OAuth.
 *
 * BetterAuth docs: https://www.better-auth.com/
 * We use the GitHub social provider to:
 *  1. Authenticate users
 *  2. Request `repo` scope so we can clone + push to their repos
 *  3. Persist the OAuth access token in the session for server-side Octokit calls
 */

import { betterAuth } from "better-auth"

/** Singleton BetterAuth instance — import `auth` everywhere you need session/handlers */
export const auth = betterAuth({
  // ---------------------------------------------------------------------------
  // Database / session storage
  // Using in-memory storage for simplicity.
  // For production swap to: https://www.better-auth.com/docs/adapters
  // ---------------------------------------------------------------------------

  // Secret used to sign session tokens — must be in env
  secret: process.env.BETTER_AUTH_SECRET,

  // Base URL for callbacks — must be set in production
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",

  // ---------------------------------------------------------------------------
  // GitHub OAuth social provider
  // ---------------------------------------------------------------------------
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
      // Request `repo` scope so the agent can clone + push branches
      scope: ["read:user", "user:email", "repo"],
    },
  },

  // ---------------------------------------------------------------------------
  // Session / account configuration
  // We store the GitHub access token inside the session so API routes can use it
  // ---------------------------------------------------------------------------
  session: {
    // Extend the default session to include the GitHub access token
    additionalFields: {
      githubAccessToken: {
        type: "string",
        required: false,
      },
    },
  },
})
