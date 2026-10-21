import "server-only";
import sharp from "sharp";
import { getBucket } from "@/lib/firebase/admin";
import { isRaster, variantPath, variantWidthsFor } from "./urls";

const IMMUTABLE = "public, max-age=31536000, immutable";

// One image at a time keeps memory flat on the 1 GiB instance.
sharp.concurrency(1);
sharp.cache(false);

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  mov: "video/quicktime",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export function contentTypeFor(path: string, fallback = "application/octet-stream"): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[ext] ?? fallback;
}

export interface ProcessedMedia {
  path: string;
  contentType: string;
  size: number;
  width?: number;
  height?: number;
  variants: number[];
}

async function save(path: string, data: Buffer, contentType: string): Promise<void> {
  await getBucket().file(path).save(data, {
    resumable: false,
    public: true,
    contentType,
    metadata: { cacheControl: IMMUTABLE },
  });
}

/**
 * Stores `data` at `path` (public-read) and, for raster images, WebP variants
 * at the widths from variantWidthsFor(). Returns what was written.
 */
export async function storeMedia(path: string, data: Buffer, contentType?: string): Promise<ProcessedMedia> {
  const type = contentType ?? contentTypeFor(path);
  if (!isRaster(path) || /\.gif$/i.test(path)) {
    await save(path, data, type);
    return { path, contentType: type, size: data.length, variants: [] };
  }
  // Honour EXIF orientation so phone photos aren't sideways.
  const meta = await sharp(data).rotate().metadata();
  const width = meta.autoOrient?.width ?? meta.width;
  const height = meta.autoOrient?.height ?? meta.height;
  const widths = variantWidthsFor(width);
  for (const w of widths) {
    const webp = await sharp(data, { limitInputPixels: 80_000_000 }).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 76 }).toBuffer();
    await save(variantPath(path, w), webp, "image/webp");
  }
  // Original last: its presence means the variants are complete (import resume check).
  await save(path, data, type);
  return { path, contentType: type, size: data.length, width, height, variants: widths };
}
