import { useCallback, useEffect, useState } from "react";
import type { MediaDoc } from "@/lib/admin/media";
import type { ImageAttrs } from "@/lib/content/types";
import { imageUrl, publicUrl } from "@/lib/media/urls";
import { useAdmin } from "./AuthProvider";
import { uploadFile } from "./upload";

export type PickedMedia =
  | { kind: "image"; image: ImageAttrs; name: string }
  | { kind: "video"; renditions: { src720: string; src1080?: string; poster?: string }; name: string }
  | { kind: "file"; url: string; name: string };

export function toPicked(m: MediaDoc): PickedMedia | null {
  if (m.status !== "ready") return null;
  if (m.kind === "image") {
    return { kind: "image", name: m.name, image: { src: m.path, alt: m.alt, variants: m.variants, ...(m.width ? { width: m.width } : {}), ...(m.height ? { height: m.height } : {}) } };
  }
  if (m.kind === "video" && m.renditions) return { kind: "video", name: m.name, renditions: m.renditions };
  return { kind: "file", name: m.name, url: publicUrl(m.path) };
}

export function MediaThumb({ m }: { m: MediaDoc }) {
  if (m.kind === "image" && m.status === "ready") {
    // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail
    return <img src={imageUrl(m.path, m.variants.length ? [Math.min(...m.variants)] : [])} alt={m.alt} loading="lazy" />;
  }
  if (m.kind === "video" && m.renditions?.poster) {
    // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail
    return <img src={publicUrl(m.renditions.poster)} alt="" loading="lazy" />;
  }
  return <span className="media-icon">{m.kind === "video" ? "🎬" : "📄"}</span>;
}

/** Library modal with upload. `accept` filters what can be picked. */
export function MediaPicker({ accept, onPick, onClose }: { accept: "image" | "video" | "file" | "any"; onPick: (m: PickedMedia) => void; onClose: () => void }) {
  const { api } = useAdmin();
  const [items, setItems] = useState<MediaDoc[] | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => api<MediaDoc[]>("/media").then(setItems).catch((e: Error) => setError(e.message)), [api]);
  useEffect(() => {
    void load();
  }, [load]);

  const upload = async (file: File) => {
    setError(null);
    setProgress(0);
    try {
      const doc = await uploadFile(api, file, setProgress);
      await load();
      const picked = toPicked(doc);
      if (picked && (accept === "any" || picked.kind === accept)) onPick(picked);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProgress(null);
    }
  };

  const shown = (items ?? []).filter((m) => accept === "any" || m.kind === accept);
  const acceptAttr = accept === "image" ? "image/*" : accept === "video" ? "video/*" : undefined;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Mediebibliotek" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h2>Mediebibliotek</h2>
          <button type="button" className="link-button" onClick={onClose}>
            Stäng
          </button>
        </div>
        <label className="upload-drop">
          <input type="file" accept={acceptAttr} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          {progress === null ? "Ladda upp ny fil…" : `Laddar upp ${Math.round(progress * 100)} %`}
        </label>
        {error && <p className="admin-error">{error}</p>}
        {items === null ? (
          <p>Laddar…</p>
        ) : shown.length === 0 ? (
          <p className="muted">Inga filer ännu.</p>
        ) : (
          <ul className="media-grid">
            {shown.map((m) => {
              const picked = toPicked(m);
              return (
                <li key={m.id}>
                  <button type="button" disabled={!picked} onClick={() => picked && onPick(picked)} title={m.name}>
                    <MediaThumb m={m} />
                    <span className="media-name">{m.status === "ready" ? m.name : `${m.name} (${m.status === "processing" ? "konverteras…" : m.status})`}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
