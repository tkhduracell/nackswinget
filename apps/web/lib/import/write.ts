import "server-only";
import { createHash } from "node:crypto";
import { COLLECTIONS, redirectKey } from "@/lib/content/firestore-store";
import type { Section, Snapshot } from "@/lib/content/types";
import { getBucket, getDb } from "@/lib/firebase/admin";
import { invalidateRouteIndex, rebuildRouteIndex } from "@/lib/content/route-index";

/**
 * Link-box icons come out of WordPress as base64 data URIs. Inline they bloat
 * every page's HTML (twice, with the RSC payload) and barely compress, so
 * they're stored as files (content-addressed) and referenced by path.
 */
async function extractIcons(sections: Section[], seen: Map<string, string>): Promise<Section[]> {
  const out: Section[] = [];
  for (const s of sections) {
    if (s.type === "columns") {
      out.push({ ...s, columns: await Promise.all(s.columns.map(async (c) => ({ ...c, sections: await extractIcons(c.sections, seen) }))) });
    } else if (s.type === "linkBoxes") {
      const items = [];
      for (const item of s.items) {
        const m = item.icon?.match(/^data:(image\/(png|svg\+xml|jpeg|webp|gif));base64,(.+)$/);
        if (!m) {
          items.push(item);
          continue;
        }
        let path = seen.get(item.icon!);
        if (!path) {
          const data = Buffer.from(m[3], "base64");
          const ext = m[2] === "svg+xml" ? "svg" : m[2] === "jpeg" ? "jpg" : m[2];
          path = `web/icons/${createHash("sha1").update(data).digest("hex").slice(0, 16)}.${ext}`;
          await getBucket().file(path).save(data, { resumable: false, public: true, contentType: m[1], metadata: { cacheControl: "public, max-age=31536000, immutable" } });
          seen.set(item.icon!, path);
        }
        items.push({ ...item, icon: path });
      }
      out.push({ ...s, items });
    } else {
      out.push(s);
    }
  }
  return out;
}

/** Upserts a snapshot into Firestore. Idempotent: documents are keyed by id. */
export async function writeSnapshot(snap: Snapshot): Promise<Record<string, number>> {
  const db = getDb();
  const icons = new Map<string, string>();
  snap = { ...snap, pages: await Promise.all(snap.pages.map(async (p) => ({ ...p, sections: await extractIcons(p.sections, icons) }))) };
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
