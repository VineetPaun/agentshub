/**
 * app/layout.tsx
 *
 * Root layout for AgentsHub.
 *
 * - Dark background forced globally (no system-pref toggle — always dark)
 * - JetBrains Mono loaded from Google Fonts for terminal aesthetic
 * - Inter for UI text
 * - SEO metadata set here
 */

import type { Metadata } from "next"
import { Inter, JetBrains_Mono } from "next/font/google"
import { ConvexClientProvider } from "@/components/ConvexClientProvider"
import "./globals.css"

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

/** UI font — clean, modern, highly legible */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
})

/** Monospace font for terminal / code output */
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
})

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "AgentsHub — Run AI Coding Agents on Your GitHub Repos",
  description:
    "Connect GitHub, pick a repo, choose an AI coding agent (OpenCode, Gemini CLI, or Codex CLI), and watch it make changes live — then open a PR in one click.",
  keywords: ["AI coding", "GitHub", "OpenCode", "Gemini CLI", "Codex CLI", "E2B", "agent"],
  openGraph: {
    title: "AgentsHub",
    description: "Run AI coding agents on your GitHub repos",
    type: "website",
  },
}

// ---------------------------------------------------------------------------
// Root layout
// ---------------------------------------------------------------------------

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // `dark` class forces dark mode — shadcn uses `.dark` selector
    <html
      lang="en"
      className={`dark ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#0d0d0d] text-gray-100">
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  )
}
