/**
 * next.config.ts
 *
 * Next.js 16 configuration for AgentsHub.
 *
 * Key settings:
 *  - serverActions.bodySizeLimit: "2mb"  — prompts can be long
 *  - images.remotePatterns              — allow GitHub avatar images
 */

import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  experimental: {
    // Increase the server action body limit for large prompts
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },

  // Allow Next.js Image component to load GitHub avatar URLs
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
        port: "",
        pathname: "/**",
      },
    ],
  },
}

export default nextConfig
