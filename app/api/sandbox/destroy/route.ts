/**
 * app/api/sandbox/destroy/route.ts
 *
 * Authenticated endpoint for explicitly destroying an E2B sandbox after a run.
 */

import { type NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { destroySandbox } from "@/lib/sandbox"

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Only signed-in users can destroy sandboxes created by the app session.
  const requestHeaders = await headers()
  const session = await auth.api.getSession({ headers: requestHeaders })

  if (!session?.session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { sandboxId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body.sandboxId?.trim()) {
    return NextResponse.json({ error: "Missing required field: sandboxId" }, { status: 400 })
  }

  try {
    await destroySandbox(body.sandboxId.trim())
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to destroy sandbox"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
