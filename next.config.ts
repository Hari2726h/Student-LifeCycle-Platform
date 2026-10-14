import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* This app is entirely per-request, auth-scoped data (dashboards, session-
   * gated queries) — Cache Components' prerendering model fights that, so
   * it's switched off rather than sprinkling `"use cache"`/Suspense
   * boundaries through every page. */
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
