import "server-only";
import { randomUUID } from "node:crypto";
import { GoogleAuth } from "google-auth-library";
import { getBucket, getDb, PROJECT_ID } from "@/lib/firebase/admin";
import { contentTypeFor, storeMedia } from "@/lib/media/process";
import { BUCKET, isRaster, isVideoFile } from "@/lib/media/urls";
import { type AdminUser, HttpError } from "./auth";
import { audit } from "./content";
import { transcodeConfig, transcodeProgress, uhdTranscodeConfig, wantsUhd } from "./transcode";

// Admin uploads: media/{id} documents + objects under web/media/{id}/.
// Images get WebP variants, videos are transcoded (Transcoder API) to H.264
// MP4 at 720p/1080p plus a poster (and 4K once a 4K screen plays one), PDFs and other files are stored as-is.

export type MediaKind = "image" | "video" | "file";

export interface MediaDoc {
  id: string;
  kind: MediaKind;
  name: string;
  path: string;
  contentType: string;
  size: number;
  alt: string;
  width?: number;
  height?: number;
  variants: number[];
  status: "uploading" | "processing" | "ready" | "error";
  error?: string;
  jobName?: string;
  /** Video without an audio track (transcoded video-only). */
  silent?: boolean;
  /** Clip length, read by the browser from the video (Storbild timeline). */
  durationSec?: number;
  renditions?: { src720: string; src1080?: string; src2160?: string; poster?: string };
  /** The separate 4K job (refreshUhd), and why it failed. */
  uhdJobName?: string;
  uhdError?: string;
  /** Not stored: estimated percent while a video converts (lib/admin/transcode.ts). */
  progress?: number;
  /** Not stored: the transcoder job is waiting in its queue. */
  queued?: boolean;
  createdAt: string;
  createdBy: string;
  deletedAt?: string;
}

const COLLECTION = "media";
const TRANSCODER_LOCATION = "europe-west4";
const IMAGE_MAX_BYTES = 20 * 1024 * 1024;

function kindOf(contentType: string, name: string): MediaKind {
  if (contentType.startsWith("video/") || isVideoFile(name)) return "video";
  if (contentType.startsWith("image/") && isRaster(name)) return "image";
  return "file";
}

function safeName(name: string): string {
  const base = name.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  return base.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-120) || "fil";
}

export async function createUpload(input: { name: string; contentType: string; size: number; width?: number; height?: number }, user: AdminUser, origin: string) {
  const contentType = input.contentType || contentTypeFor(input.name);
  const kind = kindOf(contentType, input.name);
  // No cap for videos (Q8); images are resized anyway.
  if (kind === "image" && input.size > IMAGE_MAX_BYTES) throw new HttpError(413, "Bilden är större än 20 MB");
  const id = randomUUID();
  const path = `web/media/${id}/${safeName(input.name)}`;
  const doc: MediaDoc = {
    id,
    kind,
    name: input.name,
    path,
    contentType,
    size: input.size,
    alt: "",
    variants: [],
    // A video's size comes from the browser (components/admin/upload.ts); an image's from the stored file.
    ...(kind === "video" && input.width && input.height ? { width: input.width, height: input.height } : {}),
    status: "uploading",
    createdAt: new Date().toISOString(),
    createdBy: user.email,
  };
  await getDb().collection(COLLECTION).doc(id).set(doc);
  // Resumable session: the browser uploads straight to Cloud Storage. The
  // session is bound to the caller's origin, which GCS then allows via CORS.
  const [uploadUrl] = await getBucket().file(path).createResumableUpload({ origin, metadata: { contentType, cacheControl: "public, max-age=31536000, immutable" } });
  return { media: doc, uploadUrl };
}

async function transcoderFetch(path: string, init?: RequestInit) {
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const token = await auth.getAccessToken();
  const res = await fetch(`https://transcoder.googleapis.com/v1/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message ?? `transcoder ${res.status}`);
  return body;
}

async function startJob(doc: MediaDoc, config: object): Promise<string> {
  const job = await transcoderFetch(`projects/${PROJECT_ID}/locations/${TRANSCODER_LOCATION}/jobs`, {
    method: "POST",
    body: JSON.stringify({ inputUri: `gs://${BUCKET}/${doc.path}`, outputUri: `gs://${BUCKET}/web/media/${doc.id}/out/`, config }),
  });
  return job.name as string;
}

/** `withAudio` is false for inputs that have no audio track (screen recordings, muted clips). */
const startTranscode = (doc: MediaDoc, withAudio: boolean) => startJob(doc, transcodeConfig(withAudio));

export async function finalizeUpload(id: string, user: AdminUser): Promise<MediaDoc> {
  const ref = getDb().collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, "Filen finns inte");
  const doc = snap.data() as MediaDoc;
  const file = getBucket().file(doc.path);
  const [exists] = await file.exists();
  if (!exists) throw new HttpError(409, "Uppladdningen är inte klar");
  const [meta] = await file.getMetadata();
  const size = Number(meta.size ?? doc.size);

  if (doc.kind === "image") {
    // The declared size can't be trusted; check the stored object before loading it.
    if (size > IMAGE_MAX_BYTES) {
      await file.delete({ ignoreNotFound: true });
      await ref.update({ status: "error", error: "Bilden är större än 20 MB" });
      throw new HttpError(413, "Bilden är större än 20 MB");
    }
    const [data] = await file.download();
    const stored = await storeMedia(doc.path, data, doc.contentType);
    const update = { status: "ready" as const, size, width: stored.width, height: stored.height, variants: stored.variants };
    await ref.update(update);
    await audit(user, "upload", `media/${id}`, doc.name);
    return { ...doc, ...update };
  }
  if (doc.kind === "video") {
    // The original stays private; only the renditions are public.
    const update = { status: "processing" as const, size, jobName: await startTranscode(doc, true) };
    await ref.update(update);
    await audit(user, "upload", `media/${id}`, doc.name);
    return { ...doc, ...update };
  }
  await file.makePublic();
  const update = { status: "ready" as const, size };
  await ref.update(update);
  await audit(user, "upload", `media/${id}`, doc.name);
  return { ...doc, ...update };
}

/** Polls the transcoding job; when done, publishes the renditions. */
export async function refreshMedia(id: string): Promise<MediaDoc> {
  const ref = getDb().collection(COLLECTION).doc(id);
  const doc = (await ref.get()).data() as MediaDoc | undefined;
  if (!doc) throw new HttpError(404, "Filen finns inte");
  if (doc.kind !== "video" || doc.status !== "processing" || !doc.jobName) return doc;
  const job = await transcoderFetch(doc.jobName);
  if (job.state === "FAILED") {
    // The job can't make audio optional; a silent input gets a video-only retry.
    if (!doc.silent && /audio track/i.test(job.error?.message ?? "")) {
      const update = { silent: true, jobName: await startTranscode(doc, false) };
      await ref.update(update);
      return { ...doc, ...update };
    }
    const update = { status: "error" as const, error: job.error?.message ?? "Konverteringen misslyckades" };
    await ref.update(update);
    return { ...doc, ...update };
  }
  if (job.state !== "SUCCEEDED") return { ...doc, progress: transcodeProgress(job, doc) ?? undefined, queued: job.state === "PENDING" };
  const out = `web/media/${id}/out`;
  const [files] = await getBucket().getFiles({ prefix: `${out}/` });
  await Promise.all(files.map((f) => f.makePublic()));
  const poster = files.find((f) => /poster.*\.jpe?g$/i.test(f.name))?.name;
  const renditions = { src720: `${out}/720.mp4`, src1080: `${out}/1080.mp4`, ...(poster ? { poster } : {}) };
  const update = { status: "ready" as const, renditions };
  await ref.update(update);
  return { ...doc, ...update };
}

/** For videos a 4K screen plays: starts the 4K job, or publishes its result. Until then the screen plays 1080p. */
export async function refreshUhd(doc: MediaDoc): Promise<MediaDoc> {
  if (!wantsUhd(doc)) return doc;
  const ref = getDb().collection(COLLECTION).doc(doc.id);
  if (!doc.uhdJobName) {
    const update = { uhdJobName: await startJob(doc, uhdTranscodeConfig(doc, !doc.silent)) };
    await ref.update(update);
    return { ...doc, ...update };
  }
  const job = await transcoderFetch(doc.uhdJobName);
  if (job.state === "FAILED") {
    const update = { uhdError: job.error?.message ?? "Konverteringen misslyckades" };
    await ref.update(update);
    return { ...doc, ...update };
  }
  if (job.state !== "SUCCEEDED") return doc;
  const src2160 = `web/media/${doc.id}/out/2160.mp4`;
  await getBucket().file(src2160).makePublic();
  const update = { renditions: { ...doc.renditions!, src2160 } };
  await ref.update(update);
  return { ...doc, ...update };
}

export async function listMedia(): Promise<MediaDoc[]> {
  const snap = await getDb().collection(COLLECTION).orderBy("createdAt", "desc").limit(300).get();
  return snap.docs.map((d) => d.data() as MediaDoc).filter((m) => !m.deletedAt);
}

export async function updateMedia(id: string, patch: { alt?: string; durationSec?: number }, user: AdminUser) {
  const ref = getDb().collection(COLLECTION).doc(id);
  await ref.update({
    ...(patch.alt !== undefined ? { alt: patch.alt.slice(0, 300) } : {}),
    ...(patch.durationSec !== undefined ? { durationSec: Math.round(patch.durationSec * 10) / 10 } : {}),
  });
  await audit(user, "update", `media/${id}`);
  return (await ref.get()).data() as MediaDoc;
}

/** Soft delete (Q22): hidden from the library, files kept for 30 days. */
export async function trashMedia(id: string, user: AdminUser) {
  await getDb().collection(COLLECTION).doc(id).update({ deletedAt: new Date().toISOString() });
  await audit(user, "delete", `media/${id}`);
}
