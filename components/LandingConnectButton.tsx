/**
 * components/LandingConnectButton.tsx
 *
 * Client component for the "Connect GitHub" button on the landing page.
 * Uses the BetterAuth React client to kick off the GitHub OAuth flow.
 */

"use client"

import { useState } from "react"
import { GitBranch, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { signIn } from "@/lib/auth-client"

export function LandingConnectButton() {
  const [loading, setLoading] = useState(false)

  const handleConnect = async () => {
    setLoading(true)
    await signIn.social({
      provider: "github",
      callbackURL: "/dashboard",
      fetchOptions: {
        onSuccess: () => {
          window.location.href = "/dashboard"
        },
      },
    })
  }

  return (
    <Button
      id="connect-github-btn"
      onClick={handleConnect}
      disabled={loading}
      size="lg"
      className="bg-[#00ff87] hover:bg-[#00e07a] text-black font-semibold px-8 py-3 text-base glow-green transition-all duration-200"
    >
      {loading ? (
        <>
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Connecting…
        </>
      ) : (
        <>
          <GitBranch className="mr-2 h-5 w-5" />
          Connect GitHub
        </>
      )}
    </Button>
  )
}
