import "server-only";
import { getDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "./firestore-store";
import { normalizePath } from "./store";
import type { Redirect } from "./types";

// site/routes: every routable page path / post slug plus all redirects, in
// one document so the proxy can answer "does this path exist?" with a single
// (cached) read. Rebuilt on import and on every publish.

export interface RouteIndex {
  paths: string[];
  redirects: Redirect[];
  updatedAt: string;
}

export async function rebuildRouteIndex(): Promise<RouteIndex> {
  const db = getDb();
  const [pages, posts, redirects] = await Promise.all([
    db.collection(COLLECTIONS.pages).select("path", "status").get(),
    db.collection(COLLECTIONS.posts).select("slug", "status").get(),
    db.collection(COLLECTIONS.redirects).get(),
  ]);
  const paths = new Set<string>();
  // Drafts are included on purpose: a scheduled post's URL shouldn't flap.
  for (const d of pages.docs) paths.add(normalizePath(String(d.get("path") ?? "")));
  for (const d of posts.docs) paths.add(normalizePath(String(d.get("slug") ?? "")));
  const index: RouteIndex = {
    paths: [...paths].sort(),
    redirects: redirects.docs.map((d) => d.data() as Redirect),
    updatedAt: new Date().toISOString(),
  };
  await db.collection(COLLECTIONS.site).doc("routes").set(index);
  return index;
}

let cache: { at: number; value: Promise<RouteIndex | null> } | null = null;
const TTL_MS = 60_000;

/** Cached for 60 s per instance; null when the index can't be read. */
export function getRouteIndex(): Promise<RouteIndex | null> {
  const now = Date.now();
  if (!cache || now - cache.at > TTL_MS) {
    const value = getDb()
      .collection(COLLECTIONS.site)
      .doc("routes")
      .get()
      .then((s) => (s.exists ? (s.data() as RouteIndex) : null))
      .catch((e) => {
        console.error(`route index unavailable: ${(e as Error).message}`);
        return null;
      });
    cache = { at: now, value };
  }
  return cache.value;
}

export function invalidateRouteIndex() {
  cache = null;
}
