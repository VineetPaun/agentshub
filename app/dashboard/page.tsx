/**
 * app/dashboard/page.tsx
 *
 * Post-login hub. Shown after GitHub OAuth completes.
 *
 * Layout:
 *  - Top nav bar: app logo + sign-out button + user avatar
 *  - Left: RepoSelector
 *  - Right: AgentSelector
 *  - Bottom: "Run Agent" CTA — navigates to /run with state in sessionStorage
 *
 * Access control: redirects to / if there is no authenticated session.
 */

import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { DashboardClient } from "@/components/DashboardClient"

export default async function DashboardPage() {
  // Server-side auth guard — redirect unauthenticated visitors to landing
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    redirect("/")
  }

  return (
    <DashboardClient
      user={{
        name: session.user.name ?? null,
        email: session.user.email,
        image: session.user.image ?? null,
      }}
    />
  )
}
