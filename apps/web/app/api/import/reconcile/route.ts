import { revalidateTag } from "next/cache";
import sharp from "sharp";
import { TAG } from "@/lib/content/cached";
import { COLLECTIONS } from "@/lib/content/firestore-store";
import type { ImageAttrs } from "@/lib/content/types";
import { getBucket, getDb } from "@/lib/firebase/admin";
import { guard } from "@/lib/import/auth";
import { isRaster } from "@/lib/media/urls";

// After the media copy: make every image's `variants` (and missing
// width/height) match what actually exists in Storage. The WordPress export
// has to guess widths for images it has no dimensions for, and a guessed
// variant that was never generated is a broken srcset candidate (403).

type Dims = { width?: number; height?: number };

function isImageAttrs(x: unknown): x is ImageAttrs {
  return !!x && typeof x === "object" && typeof (x as ImageAttrs).src === "string" && Array.isArray((x as ImageAttrs).variants);
}

/** Calls `fn` on every ImageAttrs-shaped object inside `value` (sections, rich text, post image). */
function eachImage(value: unknown, fn: (img: ImageAttrs) => void) {
  if (Array.isArray(value)) value.forEach((v) => eachImage(v, fn));
  else if (value && typeof value === "object") {
    if (isImageAttrs(value)) fn(value);
    for (const v of Object.values(value)) eachImage(v, fn);
  }
}

export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;

  // One listing of all variants: "web/variants/<base>/<width>.webp".
  const [files] = await getBucket().getFiles({ prefix: "web/variants/" });
  const widths = new Map<string, number[]>();
  for (const f of files) {
    const m = f.name.match(/^web\/variants\/(.+)\/(\d+)\.webp$/);
    if (!m) continue;
    const list = widths.get(m[1]) ?? [];
    list.push(Number(m[2]));
    widths.set(m[1], list);
  }
  const baseOf = (src: string) => src.replace(/^web\//, "").replace(/\.[a-z0-9]+$/i, "");

  const dimsCache = new Map<string, Dims>();
  async function originalDims(src: string): Promise<Dims> {
    if (!dimsCache.has(src)) {
      try {
        const [data] = await getBucket().file(src).download();
        const meta = await sharp(data).rotate().metadata();
        dimsCache.set(src, { width: meta.autoOrient?.width ?? meta.width, height: meta.autoOrient?.height ?? meta.height });
      } catch {
        dimsCache.set(src, {});
      }
    }
    return dimsCache.get(src)!;
  }

  const db = getDb();
  let docsChanged = 0;
  let imagesFixed = 0;
  for (const collection of [COLLECTIONS.pages, COLLECTIONS.posts]) {
    const snap = await db.collection(collection).get();
    for (const doc of snap.docs) {
      const data = doc.data();
      const images: ImageAttrs[] = [];
      eachImage(data, (img) => images.push(img));
      let changed = false;
      for (const img of images) {
        if (!isRaster(img.src)) continue;
        const actual = [...new Set(widths.get(baseOf(img.src)) ?? [])].sort((a, b) => a - b);
        const before = JSON.stringify([img.variants, img.width, img.height]);
        img.variants = actual;
        if (!img.width || !img.height) Object.assign(img, await originalDims(img.src));
        if (JSON.stringify([img.variants, img.width, img.height]) !== before) {
          imagesFixed++;
          changed = true;
        }
      }
      if (changed) {
        await doc.ref.set(data);
        docsChanged++;
      }
    }
  }
  if (docsChanged) {
    revalidateTag(TAG.pages, "max");
    revalidateTag(TAG.posts, "max");
  }
  return Response.json({ ok: true, variantSets: widths.size, docsChanged, imagesFixed });
}

export const maxDuration = 300;
