/**
 * app/api/auth/[...betterauth]/route.ts
 *
 * BetterAuth catch-all route handler.
 * All OAuth callback traffic (GitHub redirect, token exchange, session cookies, etc.)
 * flows through this single route via BetterAuth's built-in handler.
 *
 * Reference: https://www.better-auth.com/docs/installation#mount-handler
 */

import { auth } from "@/lib/auth"
import { toNextJsHandler } from "better-auth/next-js"

/** Export GET and POST so Next.js App Router routes both verbs to BetterAuth */
export const { GET, POST } = toNextJsHandler(auth)
