import "server-only";
import { COLLECTIONS, redirectKey } from "@/lib/content/firestore-store";
import type { Snapshot } from "@/lib/content/types";
import { getDb } from "@/lib/firebase/admin";
import { invalidateRouteIndex, rebuildRouteIndex } from "@/lib/content/route-index";

/** Upserts a snapshot into Firestore. Idempotent: documents are keyed by id. */
export async function writeSnapshot(snap: Snapshot): Promise<Record<string, number>> {
  const db = getDb();
  const writes: { ref: FirebaseFirestore.DocumentReference; data: FirebaseFirestore.DocumentData }[] = [];

  for (const { id, ...page } of snap.pages) writes.push({ ref: db.collection(COLLECTIONS.pages).doc(id), data: page });
  for (const { id, ...post } of snap.posts) writes.push({ ref: db.collection(COLLECTIONS.posts).doc(id), data: post });
  for (const r of snap.redirects) writes.push({ ref: db.collection(COLLECTIONS.redirects).doc(redirectKey(r.from)), data: r });
  const site = db.collection(COLLECTIONS.site);
  writes.push({ ref: site.doc("settings"), data: snap.settings });
  writes.push({ ref: site.doc("nav"), data: { items: snap.nav } });
  writes.push({ ref: site.doc("categories"), data: { items: snap.categories } });
  writes.push({ ref: site.doc("banners"), data: { items: snap.banners } });

  // Firestore batches are capped at 500 writes and ~10 MiB.
  for (let i = 0; i < writes.length; i += 200) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + 200)) batch.set(w.ref, w.data);
    await batch.commit();
  }
  const routes = await rebuildRouteIndex();
  invalidateRouteIndex();
  return {
    routes: routes.paths.length,
    pages: snap.pages.length,
    posts: snap.posts.length,
    redirects: snap.redirects.length,
    writes: writes.length,
  };
}
