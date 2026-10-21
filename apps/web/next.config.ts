import type { NextConfig } from "next";

// apps/web is a standalone pnpm workspace inside the monorepo. Pin the
// tracing/turbopack root here so `.next/standalone` isn't nested under
// `apps/web/` (the App Hosting adapter expects `.next/standalone/.next`).
const appRoot = process.cwd();

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  outputFileTracingRoot: appRoot,
  turbopack: { root: appRoot },
};

export default nextConfig;
