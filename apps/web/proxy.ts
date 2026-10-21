import { type NextRequest, NextResponse } from "next/server";
import { getRouteIndex } from "@/lib/content/route-index";
import { normalizePath } from "@/lib/content/store";

// Pages stream their HTML, so a redirect or notFound() decided inside the
// catch-all route can't change the status code any more. This proxy answers
// those cases up front: real 308s for redirects, real 404s for unknown paths.
// If the route index can't be read it steps aside (fail open).

export async function proxy(req: NextRequest) {
  // Local dev/CI with a snapshot file has no Firestore route index.
  if (process.env.CONTENT_SOURCE === "snapshot") return NextResponse.next();
  const index = await getRouteIndex();
  if (!index) return NextResponse.next();

  const path = normalizePath(req.nextUrl.pathname);
  const redirect = index.redirects.find((r) => normalizePath(r.from) === path);
  if (redirect) {
    const to = /^https?:\/\//.test(redirect.to) ? redirect.to : new URL(redirect.to, req.url);
    return NextResponse.redirect(to, redirect.status);
  }
  if (index.paths.includes(path)) return NextResponse.next();
  return NextResponse.rewrite(new URL("/sidan-finns-inte/", req.url), { status: 404 });
}

export const config = {
  // Only the catch-all page namespace; every other route is handled by its own file.
  matcher: [
    // Prefixes end at a segment boundary so e.g. /feedback/ or /ogonblick/ still get 404/redirect handling.
    "/((?!_next/|api/|admin(?:/|$)|wp-content/|md/|og(?:/|$)|feed(?:/|$)|category/|nyheter/sida/|kalender-for-tv(?:/|$)|sidan-finns-inte(?:/|$)|.*\\.[a-z0-9]{2,5}$).*)",
  ],
};
