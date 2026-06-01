"use client"

/**
 * components/ConvexClientProvider.tsx
 *
 * Provides Convex React context when NEXT_PUBLIC_CONVEX_URL is configured.
 */

import { ConvexProvider, ConvexReactClient } from "convex/react"
import { useMemo, type ReactNode } from "react"

interface ConvexClientProviderProps {
  children: ReactNode
}

export function ConvexClientProvider({ children }: ConvexClientProviderProps) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
  const client = useMemo(
    () => convexUrl ? new ConvexReactClient(convexUrl) : null,
    [convexUrl]
  )

  if (!client) {
    return <>{children}</>
  }

  return <ConvexProvider client={client}>{children}</ConvexProvider>
}
