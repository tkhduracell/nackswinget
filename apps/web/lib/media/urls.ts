// Media lives in the project's default bucket under "web/". Objects are
// public-read and served straight from storage.googleapis.com (edge-cached),
// so pages never proxy image bytes through the Next server.

export const BUCKET = "nackswinget-af7ef.appspot.com";
export const PUBLIC_BASE = `https://storage.googleapis.com/${BUCKET}`;

/** Widths generated for every raster image. */
export const IMAGE_WIDTHS = [480, 960, 1600] as const;

/** Storage path for a WordPress upload, e.g. "2022/11/a.png" -> "web/uploads/2022/11/a.png". */
export function wpUploadPath(relative: string): string {
  return `web/uploads/${relative.replace(/^\/+/, "")}`;
}

/** Storage path of the WebP variant of `src` at `width`. */
export function variantPath(src: string, width: number): string {
  const base = src.replace(/^web\//, "").replace(/\.[a-z0-9]+$/i, "");
  return `web/variants/${base}/${width}.webp`;
}

export function publicUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${PUBLIC_BASE}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** Variant widths that are useful for an image of `width` px (no upscaling). */
export function variantWidthsFor(width: number | undefined): number[] {
  if (!width) return [...IMAGE_WIDTHS];
  const fit = IMAGE_WIDTHS.filter((w) => w < width);
  return [...new Set([...fit, Math.min(width, IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1])])];
}

export function srcSet(src: string, variants: number[]): string | undefined {
  if (variants.length === 0) return undefined;
  return variants.map((w) => `${publicUrl(variantPath(src, w))} ${w}w`).join(", ");
}

/** Best single URL for an image: the largest variant, else the original. */
export function imageUrl(src: string, variants: number[]): string {
  if (variants.length === 0) return publicUrl(src);
  return publicUrl(variantPath(src, Math.max(...variants)));
}

const RASTER = /\.(png|jpe?g|webp|gif|avif)$/i;
export function isRaster(path: string): boolean {
  return RASTER.test(path);
}

const VIDEO = /\.(mp4|mov|m4v|webm|avi|mkv)$/i;
export function isVideoFile(path: string): boolean {
  return VIDEO.test(path);
}
