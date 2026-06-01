/**
 * convex/serverAuth.ts
 *
 * Shared guard for mutations that should only be called by trusted Next.js routes.
 */

/**
 * Verifies the server-to-Convex shared secret.
 *
 * @param provided Secret passed by the Next.js server caller.
 */
export function assertServerSecret(provided: string): void {
  const expected = process.env.CONVEX_SERVER_SECRET
  if (!expected || provided !== expected) {
    throw new Error("Unauthorized server mutation")
  }
}
