import "server-only";
import { getDb } from "@/lib/firebase/admin";
import { type ContentStore, isPublished, normalizePath, toSummary } from "./store";
import {
  type Banner,
  bannerSchema,
  categorySchema,
  navItemSchema,
  pageSchema,
  type PostSummary,
  postSchema,
  redirectSchema,
  settingsSchema,
} from "./types";

// Collections:
//   pages/{id}            Page
//   posts/{id}            Post
//   site/settings         Settings
//   site/nav              { items: NavItem[] }
//   site/categories       { items: Category[] }
//   site/banners          { items: Banner[] }
//   redirects/{key}       Redirect   (key = redirectKey(from))

export const COLLECTIONS = { pages: "pages", posts: "posts", site: "site", redirects: "redirects" } as const;

/** Firestore doc ids can't contain "/"; encode the normalised path. */
export function redirectKey(from: string): string {
  return encodeURIComponent(normalizePath(from)) || "_root";
}

const SUMMARY_FIELDS = ["slug", "title", "excerpt", "categories", "image", "publishedAt", "status"] as const;

export async function createFirestoreStore(): Promise<ContentStore> {
  const db = getDb();

  async function siteDoc<T>(id: string, parse: (d: FirebaseFirestore.DocumentData) => T, fallback: T): Promise<T> {
    const snap = await db.collection(COLLECTIONS.site).doc(id).get();
    return snap.exists ? parse(snap.data()!) : fallback;
  }

  async function allSummaries(): Promise<PostSummary[]> {
    const snap = await db.collection(COLLECTIONS.posts).select(...SUMMARY_FIELDS).get();
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as PostSummary & { status: string })
      .filter((p) => isPublished(p))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
      .map((p) => {
        const rest: PostSummary & { status?: string } = { ...p };
        delete rest.status;
        return rest;
      });
  }

  return {
    async getPageByPath(path) {
      const snap = await db.collection(COLLECTIONS.pages).where("path", "==", normalizePath(path)).limit(1).get();
      if (snap.empty) return null;
      const page = pageSchema.parse({ id: snap.docs[0].id, ...snap.docs[0].data() });
      return isPublished(page) ? page : null;
    },
    async listPages() {
      const snap = await db.collection(COLLECTIONS.pages).get();
      return snap.docs.map((d) => pageSchema.parse({ id: d.id, ...d.data() })).filter((p) => isPublished(p));
    },
    async getPostBySlug(slug) {
      const snap = await db.collection(COLLECTIONS.posts).where("slug", "==", normalizePath(slug)).limit(1).get();
      if (snap.empty) return null;
      const post = postSchema.parse({ id: snap.docs[0].id, ...snap.docs[0].data() });
      return isPublished(post) ? post : null;
    },
    async listPosts({ category, limit, offset = 0 }) {
      const all = (await allSummaries()).filter((p) => !category || p.categories.includes(category));
      return { posts: all.slice(offset, offset + limit), total: all.length };
    },
    listAllPostSummaries: allSummaries,
    async getCategories() {
      return siteDoc("categories", (d) => categorySchema.array().parse(d.items ?? []), []);
    },
    async getNav() {
      return siteDoc("nav", (d) => navItemSchema.array().parse(d.items ?? []), []);
    },
    async getSettings() {
      const snap = await db.collection(COLLECTIONS.site).doc("settings").get();
      if (!snap.exists) throw new Error("site/settings is missing; run the import first");
      return settingsSchema.parse(snap.data());
    },
    async getBanners() {
      return siteDoc<Banner[]>("banners", (d) => bannerSchema.array().parse(d.items ?? []), []);
    },
    async getRedirect(path) {
      const snap = await db.collection(COLLECTIONS.redirects).doc(redirectKey(path)).get();
      return snap.exists ? redirectSchema.parse(snap.data()) : null;
    },
  };
}

// Used by the importer and admin writes so summaries stay derivable.
export { toSummary };
