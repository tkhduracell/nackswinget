import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getStore } from "./store";
import { type Settings, settingsSchema } from "./types";

const BUILDING = process.env.NEXT_PHASE === "phase-production-build";

/**
 * During `next build` the content store may be empty (first deploy) or
 * unreachable; render with fallbacks instead of failing the build. The import
 * endpoint revalidates every tag afterwards, so nothing stale sticks.
 */
async function buildSafe<T>(what: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  if (!BUILDING) return fn();
  try {
    return await fn();
  } catch (e) {
    console.warn(`[build] ${what} unavailable, using fallback: ${(e as Error).message}`);
    return fallback;
  }
}

const FALLBACK_SETTINGS: Settings = settingsSchema.parse({
  siteName: "Dansklubben Nackswinget",
  tagline: "Danskurser och socialdans med bugg & fox i Stockholm/Nacka",
  siteUrl: "https://nackswinget.se",
  footer: {},
  calendarFeeds: [],
});

// Every content read goes through 'use cache' + a tag, so publishing calls
// revalidateTag(tag) and the CDN-cached HTML refreshes. Tags:
export const TAG = {
  pages: "pages",
  posts: "posts",
  site: "site", // settings, nav, categories, banners
  redirects: "redirects",
} as const;
export const CONTENT_TAGS = Object.values(TAG);

export async function getPage(path: string) {
  "use cache";
  cacheTag(TAG.pages);
  cacheLife("days");
  return buildSafe("getPageByPath", async () => (await getStore()).getPageByPath(path), null);
}

export async function listPages() {
  "use cache";
  cacheTag(TAG.pages);
  cacheLife("days");
  return buildSafe("listPages", async () => (await getStore()).listPages(), []);
}

export async function getPost(slug: string) {
  "use cache";
  cacheTag(TAG.posts);
  cacheLife("days");
  return buildSafe("getPostBySlug", async () => (await getStore()).getPostBySlug(slug), null);
}

export async function listPosts(category: string | undefined, limit: number, offset = 0) {
  "use cache";
  cacheTag(TAG.posts);
  cacheLife("days");
  return buildSafe("listPosts", async () => (await getStore()).listPosts({ category, limit, offset }), { posts: [], total: 0 });
}

export async function listAllPosts() {
  "use cache";
  cacheTag(TAG.posts);
  cacheLife("days");
  return buildSafe("listAllPostSummaries", async () => (await getStore()).listAllPostSummaries(), []);
}

export async function listPublishedPosts() {
  "use cache";
  cacheTag(TAG.posts);
  cacheLife("days");
  return buildSafe("listPublishedPosts", async () => (await getStore()).listPublishedPosts(), []);
}

export async function getSite() {
  "use cache";
  cacheTag(TAG.site);
  cacheLife("days");
  const store = await getStore();
  const [settings, nav, categories, banners] = await Promise.all([
    buildSafe("settings", () => store.getSettings(), FALLBACK_SETTINGS),
    buildSafe("nav", () => store.getNav(), []),
    buildSafe("categories", () => store.getCategories(), []),
    buildSafe("banners", () => store.getBanners(), []),
  ]);
  return { settings, nav, categories, banners };
}

export async function getRedirect(path: string) {
  "use cache";
  cacheTag(TAG.redirects);
  cacheLife("days");
  return buildSafe("getRedirect", async () => (await getStore()).getRedirect(path), null);
}

/** Banners that haven't expired yet (time is frozen per cache entry; refreshed hourly). */
export async function getLiveBanners() {
  "use cache";
  cacheTag(TAG.site);
  cacheLife("hours");
  const now = Date.now();
  const { banners } = await getSite();
  // Earliest start first: the active banner (if any) precedes scheduled ones.
  return banners
    .filter((b) => new Date(b.startAt).getTime() + b.days * 86_400_000 > now)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}
