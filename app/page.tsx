/**
 * app/page.tsx
 *
 * Landing page — the first thing users see.
 *
 * Sections:
 *  1. Minimal hero: app name, tagline, "Connect GitHub" CTA
 *  2. How it works: 3-step flow
 *  3. Agent pills: OpenCode / Gemini CLI / Codex CLI
 *
 * Design: dark terminal aesthetic, electric green accent (#00ff87),
 * JetBrains Mono for code-like elements.
 */

import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { LandingConnectButton } from "@/components/LandingConnectButton"
import { GitBranch, Zap, GitPullRequest, Terminal } from "lucide-react"

// ---------------------------------------------------------------------------
// Agent pill data
// ---------------------------------------------------------------------------

const AGENTS = [
  { name: "OpenCode", desc: "by SST", icon: "⚡", color: "#00ff87" },
  { name: "Gemini CLI", desc: "by Google", icon: "✦", color: "#4285f4" },
  { name: "Codex CLI", desc: "by OpenAI", icon: "◈", color: "#10b981" },
]

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

const STEPS = [
  {
    icon: <GitBranch className="h-5 w-5" />,
    title: "Connect GitHub",
    desc: "OAuth in one click — we request `repo` scope to clone and push.",
  },
  {
    icon: <Terminal className="h-5 w-5" />,
    title: "Pick repo & agent",
    desc: "Select any repo you have access to and choose your AI coding CLI.",
  },
  {
    icon: <Zap className="h-5 w-5" />,
    title: "Run & review",
    desc: "The agent edits code in an isolated E2B sandbox. Watch it live.",
  },
  {
    icon: <GitPullRequest className="h-5 w-5" />,
    title: "Open PR",
    desc: "Approve the diff, then open a GitHub PR with one click.",
  },
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function LandingPage() {
  // If already authenticated, skip the landing and go straight to dashboard
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) {
    redirect("/dashboard")
  }

  return (
    <main className="flex flex-col flex-1 items-center justify-center px-4 py-16 sm:py-24">
      {/* ------------------------------------------------------------------ */}
      {/* Hero                                                                */}
      {/* ------------------------------------------------------------------ */}
      <section className="flex flex-col items-center text-center gap-6 max-w-2xl animate-fade-in">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 border border-[#1e1e1e] rounded-full px-3 py-1 text-xs text-[#6e6e6e] font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00ff87] inline-block animate-pulse" />
          Powered by E2B sandboxes
        </div>

        {/* Heading */}
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-white leading-tight">
          Agents{" "}
          <span
            className="text-transparent bg-clip-text"
            style={{
              backgroundImage: "linear-gradient(135deg, #00ff87 0%, #00c4ff 100%)",
            }}
          >
            Hub
          </span>
        </h1>

        {/* Sub-heading */}
        <p className="text-lg text-[#8e8e8e] max-w-lg leading-relaxed">
          Run AI coding agents on your GitHub repos — live-stream the output,
          review the diff, open a PR. All in your browser.
        </p>

        {/* CTA */}
        <LandingConnectButton />
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* How it works                                                        */}
      {/* ------------------------------------------------------------------ */}
      <section className="mt-20 w-full max-w-3xl">
        <p className="text-center text-xs text-[#4e4e4e] font-mono uppercase tracking-widest mb-8">
          How it works
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {STEPS.map((step, i) => (
            <div
              key={i}
              className="flex flex-col gap-3 p-4 rounded-lg border border-[#1e1e1e] bg-[#111] card-hover"
            >
              <div className="w-8 h-8 rounded-md bg-[#1a1a1a] border border-[#2e2e2e] flex items-center justify-center text-[#00ff87]">
                {step.icon}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-200">{step.title}</p>
                <p className="text-xs text-[#6e6e6e] mt-1 leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Agent pills                                                         */}
      {/* ------------------------------------------------------------------ */}
      <section className="mt-12 flex flex-wrap justify-center gap-3">
        {AGENTS.map((agent) => (
          <div
            key={agent.name}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#1e1e1e] bg-[#111] text-sm"
          >
            <span style={{ color: agent.color }}>{agent.icon}</span>
            <span className="text-gray-300 font-medium">{agent.name}</span>
            <span className="text-[#4e4e4e] text-xs">{agent.desc}</span>
          </div>
        ))}
      </section>
    </main>
  )
}
