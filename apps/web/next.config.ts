import type { NextConfig } from "next";

// apps/web is a standalone pnpm workspace inside the monorepo. Pin the
// tracing/turbopack root here so `.next/standalone` isn't nested under
// `apps/web/` (the App Hosting adapter expects `.next/standalone/.next`).
const appRoot = process.cwd();

const nextConfig: NextConfig = {
  cacheComponents: true,
  // WordPress URLs end in "/"; keep them identical for links and SEO.
  trailingSlash: true,
  partialPrefetching: true,
  // ~4 KB gzipped: cheaper inline than a render-blocking request on mobile.
  experimental: { inlineCss: true },
  outputFileTracingRoot: appRoot,
  turbopack: { root: appRoot },
  // Old WordPress pagination, and page 1 of an archive is the archive itself.
  // Here rather than in the pages so they're real 308s (pages stream).
  async redirects() {
    return [
      { source: "/nyheter/page/1/", destination: "/nyheter/", permanent: true },
      { source: "/nyheter/sida/1/", destination: "/nyheter/", permanent: true },
      { source: "/nyheter/page/:n(\\d+)/", destination: "/nyheter/sida/:n/", permanent: true },
      { source: "/category/:slug/page/1/", destination: "/category/:slug/", permanent: true },
      { source: "/category/:slug/sida/1/", destination: "/category/:slug/", permanent: true },
      { source: "/category/:slug/page/:n(\\d+)/", destination: "/category/:slug/sida/:n/", permanent: true },
    ];
  },
};

export default nextConfig;
