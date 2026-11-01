import type { MediaDoc } from "@/lib/admin/media";

type Api = <T = unknown>(path: string, init?: RequestInit & { json?: unknown }) => Promise<T>;

/**
 * Uploads a file: asks the server for a resumable Cloud Storage session,
 * PUTs the bytes straight to Storage (any size, progress events), then asks
 * the server to process it (image variants / video transcoding).
 */
/** A video's size as shown, which decides if it gets a 4K rendition. Unknown when the browser can't read the file. */
function videoSize(file: File): Promise<{ width?: number; height?: number }> {
  if (!file.type.startsWith("video/") && !/\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(file.name)) return Promise.resolve({});
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    const done = (size: { width?: number; height?: number }) => {
      clearTimeout(timer);
      v.removeAttribute("src");
      URL.revokeObjectURL(url);
      resolve(size);
    };
    const timer = setTimeout(() => done({}), 5_000);
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => done(v.videoHeight ? { width: v.videoWidth, height: v.videoHeight } : {});
    v.onerror = () => done({});
    v.src = url;
  });
}

export async function uploadFile(api: Api, file: File, onProgress: (fraction: number) => void): Promise<MediaDoc> {
  const { media, uploadUrl } = await api<{ media: MediaDoc; uploadUrl: string }>("/media", {
    method: "POST",
    json: { name: file.name, contentType: file.type || "application/octet-stream", size: file.size, ...(await videoSize(file)) },
  });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Uppladdningen misslyckades (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Uppladdningen avbröts"));
    xhr.send(file);
  });
  onProgress(1);
  return api<MediaDoc>(`/media/${media.id}`, { method: "POST" });
}
