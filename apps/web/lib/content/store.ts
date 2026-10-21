import "server-only";
import type { Banner, Category, NavItem, Page, Post, PostSummary, Redirect, Settings } from "./types";

export interface ContentStore {
  getPageByPath(path: string): Promise<Page | null>;
  listPages(): Promise<Page[]>;
  getPostBySlug(slug: string): Promise<Post | null>;
  /** Published posts, newest first. */
  listPosts(opts: { category?: string; limit: number; offset?: number }): Promise<{ posts: PostSummary[]; total: number }>;
  listAllPostSummaries(): Promise<PostSummary[]>;
  /** All published posts with bodies (search index). One read, not one per post. */
  listPublishedPosts(): Promise<Post[]>;
  getCategories(): Promise<Category[]>;
  getNav(): Promise<NavItem[]>;
  getSettings(): Promise<Settings>;
  getBanners(): Promise<Banner[]>;
  getRedirect(path: string): Promise<Redirect | null>;
}

export function toSummary(p: Post): PostSummary {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    categories: p.categories,
    image: p.image,
    publishedAt: p.publishedAt,
  };
}

export function isPublished(p: { status: string; publishedAt: string }, now = new Date()): boolean {
  if (p.status === "draft") return false;
  return new Date(p.publishedAt).getTime() <= now.getTime();
}

/** Normalise a URL path to the stored form: no leading/trailing slash, decoded. */
export function normalizePath(path: string): string {
  let p = path;
  try {
    p = decodeURIComponent(p);
  } catch {
    // keep as-is
  }
  return p.replace(/^\/+|\/+$/g, "").toLowerCase();
}

let store: Promise<ContentStore> | undefined;

/**
 * CONTENT_SOURCE=snapshot reads content/snapshot.json (local dev, tests).
 * Anything else reads Firestore through the Admin SDK (App Hosting).
 */
export function getStore(): Promise<ContentStore> {
  store ??=
    process.env.CONTENT_SOURCE === "snapshot"
      ? import("./snapshot-store").then((m) => m.createSnapshotStore())
      : import("./firestore-store").then((m) => m.createFirestoreStore());
  return store;
}
