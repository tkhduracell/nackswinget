import "server-only";
import { revalidateTag } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";
import { TAG } from "@/lib/content/cached";
import { COLLECTIONS, redirectKey } from "@/lib/content/firestore-store";
import { invalidateRouteIndex, rebuildRouteIndex } from "@/lib/content/route-index";
import { normalizePath } from "@/lib/content/store";
import {
  bannerSchema,
  categorySchema,
  navItemSchema,
  type Page,
  pageSchema,
  type Post,
  postSchema,
  redirectSchema,
  settingsSchema,
} from "@/lib/content/types";
import { getDb } from "@/lib/firebase/admin";
import { type AdminUser, HttpError } from "./auth";

export type Kind = "pages" | "posts";

export function kindOf(value: string): Kind {
  if (value === "pages" || value === "posts") return value;
  throw new HttpError(404, "Okänd typ");
}
const KEEP_VERSIONS = 20;

export async function audit(user: AdminUser, action: string, ref: string, summary = "") {
  await getDb().collection("audit").add({ who: user.email, action, ref, summary, at: FieldValue.serverTimestamp() });
}

// ---------------------------------------------------------------------------
// Pages & posts
// ---------------------------------------------------------------------------

export async function listDocs(kind: Kind) {
  const fields = kind === "pages" ? ["path", "title", "status", "updatedAt", "template"] : ["slug", "title", "status", "publishedAt", "updatedAt", "categories"];
  const snap = await getDb().collection(kind).select(...fields).get();
  const drafts = await getDb().collection("drafts").where("kind", "==", kind).select("id", "updatedAt", "updatedBy").get();
  const draftById = new Map(drafts.docs.map((d) => [d.get("id") as string, { updatedAt: d.get("updatedAt"), updatedBy: d.get("updatedBy") }]));
  return snap.docs.map((d) => ({ id: d.id, ...d.data(), draft: draftById.get(d.id) ?? null }));
}

export async function getDoc(kind: Kind, id: string) {
  const db = getDb();
  const [main, draft] = await Promise.all([db.collection(kind).doc(id).get(), db.collection("drafts").doc(`${kind}-${id}`).get()]);
  return {
    published: main.exists ? { id, ...main.data() } : null,
    draft: draft.exists ? draft.get("data") : null,
    draftMeta: draft.exists ? { updatedAt: draft.get("updatedAt"), updatedBy: draft.get("updatedBy") } : null,
  };
}

export async function saveDraft(kind: Kind, id: string, data: unknown, user: AdminUser) {
  // Validate shape loosely on draft save (editors may have half-finished content).
  const schema = kind === "pages" ? pageSchema : postSchema;
  const parsed = schema.safeParse({ ...(data as object), id });
  if (!parsed.success) throw new HttpError(400, `Ogiltigt innehåll: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`);
  await getDb()
    .collection("drafts")
    .doc(`${kind}-${id}`)
    .set({ kind, id, data: parsed.data, updatedAt: new Date().toISOString(), updatedBy: user.email });
}

export async function discardDraft(kind: Kind, id: string) {
  await getDb().collection("drafts").doc(`${kind}-${id}`).delete();
}

async function assertUnique(kind: Kind, id: string, doc: Page | Post) {
  const db = getDb();
  const value = kind === "pages" ? normalizePath((doc as Page).path) : normalizePath((doc as Post).slug);
  // Pages and posts share the URL namespace (/<slug>/).
  const [pages, posts] = await Promise.all([
    db.collection("pages").where("path", "==", value).get(),
    kind === "posts" || !value.includes("/") ? db.collection("posts").where("slug", "==", value).get() : null,
  ]);
  const clash = [...pages.docs, ...(posts?.docs ?? [])].find((d) => d.id !== id);
  if (clash) throw new HttpError(409, `Adressen /${value}/ används redan av "${clash.get("title")}"`);
}

export async function publish(kind: Kind, id: string, data: unknown, user: AdminUser) {
  const now = new Date().toISOString();
  const schema = kind === "pages" ? pageSchema : postSchema;
  const parsed = schema.safeParse({ ...(data as object), id, updatedAt: now });
  if (!parsed.success) throw new HttpError(400, `Ogiltigt innehåll: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`);
  const doc = parsed.data as Page | Post;
  if (kind === "pages") (doc as Page).path = normalizePath((doc as Page).path);
  else (doc as Post).slug = normalizePath((doc as Post).slug);
  await assertUnique(kind, id, doc);

  const db = getDb();
  const ref = db.collection(kind).doc(id);
  const { id: _id, ...body } = doc;
  void _id;
  const previous = await ref.get();
  const batch = db.batch();
  if (previous.exists) {
    batch.set(ref.collection("versions").doc(), { data: previous.data(), savedAt: now, savedBy: user.email });
  }
  // editedInAdmin: a later WordPress re-import must not overwrite this doc.
  batch.set(ref, { ...body, editedInAdmin: true });
  batch.delete(db.collection("drafts").doc(`${kind}-${id}`));
  await batch.commit();

  // Old URL keeps working when a page/post is moved.
  const oldPath = previous.exists ? normalizePath(String(previous.get(kind === "pages" ? "path" : "slug") ?? "")) : null;
  const newPath = kind === "pages" ? (doc as Page).path : (doc as Post).slug;
  if (oldPath !== null && oldPath !== newPath) {
    await db.collection(COLLECTIONS.redirects).doc(redirectKey(oldPath)).set({ from: oldPath, to: `/${newPath ? `${newPath}/` : ""}`, status: 308 });
  }

  await trimVersions(ref);
  await rebuildRouteIndex();
  invalidateRouteIndex();
  revalidateTag(kind === "pages" ? TAG.pages : TAG.posts, "max");
  if (oldPath !== newPath) revalidateTag(TAG.redirects, "max");
  await audit(user, previous.exists ? "publish" : "create", `${kind}/${id}`, doc.title);
  return doc;
}

async function trimVersions(ref: FirebaseFirestore.DocumentReference) {
  const old = await ref.collection("versions").orderBy("savedAt", "desc").offset(KEEP_VERSIONS).get();
  if (old.empty) return;
  const batch = getDb().batch();
  for (const d of old.docs) batch.delete(d.ref);
  await batch.commit();
}

export async function listVersions(kind: Kind, id: string) {
  const snap = await getDb().collection(kind).doc(id).collection("versions").orderBy("savedAt", "desc").limit(KEEP_VERSIONS).get();
  return snap.docs.map((d) => ({ versionId: d.id, savedAt: d.get("savedAt"), savedBy: d.get("savedBy"), data: d.get("data") }));
}

/** Soft delete: the document moves to trash/ for 30 days (and its URL 404s). */
export async function trashDoc(kind: Kind, id: string, user: AdminUser) {
  const db = getDb();
  const ref = db.collection(kind).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, "Finns inte");
  await db.collection("trash").doc(`${kind}-${id}`).set({ kind, id, data: snap.data(), deletedAt: new Date().toISOString(), deletedBy: user.email });
  await ref.delete();
  await db.collection("drafts").doc(`${kind}-${id}`).delete();
  await rebuildRouteIndex();
  invalidateRouteIndex();
  revalidateTag(kind === "pages" ? TAG.pages : TAG.posts, "max");
  await audit(user, "delete", `${kind}/${id}`, String(snap.get("title") ?? ""));
}

// ---------------------------------------------------------------------------
// Site documents (settings, nav, categories, banners) and redirects
// ---------------------------------------------------------------------------

const SITE_DOCS = {
  settings: { schema: settingsSchema, wrap: false },
  nav: { schema: navItemSchema.array(), wrap: true },
  categories: { schema: categorySchema.array(), wrap: true },
  banners: { schema: bannerSchema.array().max(10), wrap: true },
} as const;
export type SiteDoc = keyof typeof SITE_DOCS;
export const SITE_DOC_KEYS = Object.keys(SITE_DOCS) as SiteDoc[];
/** Banners are editable by editors; the rest needs admin. */
export const EDITOR_SITE_DOCS: SiteDoc[] = ["banners"];

export async function getSiteDoc(name: SiteDoc) {
  const snap = await getDb().collection(COLLECTIONS.site).doc(name).get();
  if (!snap.exists) return null;
  return SITE_DOCS[name].wrap ? snap.get("items") : snap.data();
}

export async function putSiteDoc(name: SiteDoc, data: unknown, user: AdminUser) {
  const cfg = SITE_DOCS[name];
  const parsed = cfg.schema.safeParse(data);
  if (!parsed.success) throw new HttpError(400, `Ogiltigt: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`);
  const ref = getDb().collection(COLLECTIONS.site).doc(name);
  const previous = await ref.get();
  if (previous.exists) await ref.collection("versions").add({ data: previous.data(), savedAt: new Date().toISOString(), savedBy: user.email });
  await ref.set(cfg.wrap ? { items: parsed.data } : (parsed.data as object));
  revalidateTag(TAG.site, "max");
  await audit(user, "update", `site/${name}`);
  return parsed.data;
}

export async function listRedirects() {
  const snap = await getDb().collection(COLLECTIONS.redirects).get();
  return snap.docs.map((d) => d.data()).sort((a, b) => String(a.from).localeCompare(String(b.from)));
}

export async function putRedirects(list: unknown, user: AdminUser) {
  const parsed = redirectSchema.array().safeParse(list);
  if (!parsed.success) throw new HttpError(400, "Ogiltig omdirigering");
  const db = getDb();
  const existing = await db.collection(COLLECTIONS.redirects).get();
  const keep = new Set(parsed.data.map((r) => redirectKey(r.from)));
  const batch = db.batch();
  for (const d of existing.docs) if (!keep.has(d.id)) batch.delete(d.ref);
  for (const r of parsed.data) batch.set(db.collection(COLLECTIONS.redirects).doc(redirectKey(r.from)), { ...r, from: normalizePath(r.from) });
  await batch.commit();
  await rebuildRouteIndex();
  invalidateRouteIndex();
  revalidateTag(TAG.redirects, "max");
  await audit(user, "update", "redirects", `${parsed.data.length} st`);
}
