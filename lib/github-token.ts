/**
 * lib/github-token.ts
 *
 * Server-only helper for retrieving the user's GitHub OAuth access token from
 * BetterAuth. BetterAuth account/session responses do not expose raw OAuth
 * tokens, so API routes must use the dedicated token endpoint.
 */

import type { ReadonlyHeaders } from "next/dist/server/web/spec-extension/adapters/headers"
import { auth } from "@/lib/auth"

interface GitHubTokenResponse {
  accessToken?: string
}

/**
 * Returns the current user's GitHub OAuth access token, if BetterAuth has one.
 *
 * @param requestHeaders Headers from the current Next.js route request.
 */
export async function getGitHubAccessToken(
  requestHeaders: ReadonlyHeaders
): Promise<string | null> {
  const tokenResponse = (await auth.api.getAccessToken({
    headers: requestHeaders,
    body: { providerId: "github" },
  })) as unknown as GitHubTokenResponse

  return tokenResponse.accessToken ?? null
}
