/**
 * app/api/provider-keys/route.ts
 *
 * Saves and lists encrypted provider API keys for the authenticated user.
 */

import { NextResponse, type NextRequest } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { encryptSecret } from "@/lib/crypto"
import {
  getConvexTroubleshootingHint,
  isConvexConfigured,
  listSavedProviderSecrets,
  saveProviderSecret,
  upsertUser,
} from "@/lib/convex-server"
import type { AgentType } from "@/types"

const PROVIDERS: AgentType[] = ["opencode", "gemini", "codex"]

/** Returns a useful message even when a client library throws an empty error. */
function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim()) return err.message
  if (typeof err === "string" && err.trim()) return err
  return fallback
}

/** Appends setup guidance to storage errors without exposing secret values. */
function providerKeyStorageError(err: unknown, fallback: string): string {
  return `${errorMessage(err, fallback)} ${getConvexTroubleshootingHint()}`
}

/** Returns provider names that already have saved encrypted keys. */
export async function GET(): Promise<NextResponse> {
  const requestHeaders = await headers()
  const session = await auth.api.getSession({ headers: requestHeaders })

  if (!session?.session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!isConvexConfigured()) {
    return NextResponse.json({
      providers: [],
      configured: false,
      message: "Convex is not configured yet; saved provider keys are unavailable.",
    })
  }

  try {
    const userId = await upsertUser(session.user)
    const providers = await listSavedProviderSecrets(userId)
    return NextResponse.json({ providers })
  } catch (err: unknown) {
    return NextResponse.json({
      providers: [],
      configured: false,
      message: providerKeyStorageError(
        err,
        "Convex provider-key storage is unavailable; saved keys are disabled for this session."
      ),
    })
  }
}

/** Encrypts and saves a provider API key. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestHeaders = await headers()
  const session = await auth.api.getSession({ headers: requestHeaders })

  if (!session?.session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { provider?: AgentType; apiKey?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body.provider || !PROVIDERS.includes(body.provider) || !body.apiKey?.trim()) {
    return NextResponse.json(
      { error: "Missing required fields: provider, apiKey" },
      { status: 400 }
    )
  }

  if (!isConvexConfigured()) {
    return NextResponse.json(
      { error: "Convex is not configured yet. Set NEXT_PUBLIC_CONVEX_URL and CONVEX_SERVER_SECRET to save encrypted keys." },
      { status: 503 }
    )
  }

  try {
    const userId = await upsertUser(session.user)
    await saveProviderSecret(
      userId,
      body.provider,
      encryptSecret(body.apiKey.trim())
    )
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error: providerKeyStorageError(
          err,
          "Convex provider-key storage is unavailable. This run can continue with a one-time key."
        ),
      },
      { status: 503 }
    )
  }
}
