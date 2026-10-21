import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { type ContentStore, isPublished, normalizePath, toSummary } from "./store";
import { type Snapshot, snapshotSchema } from "./types";

export function storeFromSnapshot(snap: Snapshot): ContentStore {
  const pages = new Map(snap.pages.map((p) => [normalizePath(p.path), p]));
  const posts = new Map(snap.posts.map((p) => [p.slug, p]));
  const redirects = new Map(snap.redirects.map((r) => [normalizePath(r.from), r]));
  const published = () =>
    snap.posts
      .filter((p) => isPublished(p))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  return {
    async getPageByPath(p) {
      const page = pages.get(normalizePath(p));
      return page && isPublished(page) ? page : null;
    },
    async listPages() {
      return snap.pages.filter((p) => isPublished(p));
    },
    async getPostBySlug(slug) {
      const post = posts.get(normalizePath(slug));
      return post && isPublished(post) ? post : null;
    },
    async listPosts({ category, limit, offset = 0 }) {
      const all = published().filter((p) => !category || p.categories.includes(category));
      return { posts: all.slice(offset, offset + limit).map(toSummary), total: all.length };
    },
    async listAllPostSummaries() {
      return published().map(toSummary);
    },
    async getCategories() {
      return snap.categories;
    },
    async getNav() {
      return snap.nav;
    },
    async getSettings() {
      return snap.settings;
    },
    async getBanners() {
      return snap.banners;
    },
    async getRedirect(p) {
      return redirects.get(normalizePath(p)) ?? null;
    },
  };
}

export async function createSnapshotStore(): Promise<ContentStore> {
  const file = process.env.CONTENT_SNAPSHOT ?? path.join(/* turbopackIgnore: true */ process.cwd(), "content", "snapshot.json");
  const snap = snapshotSchema.parse(JSON.parse(await readFile(file, "utf8")));
  return storeFromSnapshot(snap);
}
