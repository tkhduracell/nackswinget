import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaDoc } from "@/lib/admin/media";
import type { ImageAttrs } from "@/lib/content/types";
import { imageUrl, publicUrl } from "@/lib/media/urls";
import { useAdmin } from "./AuthProvider";
import { Icon } from "./icons";
import { uploadFile } from "./upload";
import { Badge, EmptyState, LoadingRow } from "./ui";

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
  return (
    <span className={`media-icon ${m.kind}`}>
      <Icon name={m.kind === "video" ? "film" : "file"} size={30} />
    </span>
  );
}

/**
 * Where a file that can't be used yet stands: uploading, waiting in the
 * converter's queue, converting (with an estimated percent and bar), or failed.
 * A ready video shows how its 4K rendition stands, if it has one.
 */
export function MediaStatus({ m }: { m: MediaDoc }) {
  if (m.status === "ready") {
    if (m.renditions?.src2160) return <span className="media-status"><Badge tone="info">4K</Badge></span>;
    if (m.uhdError) return <span className="media-status" title={m.uhdError}><Badge tone="danger">4K misslyckades</Badge></span>;
    return m.uhdJobName ? <span className="media-status"><Badge tone="warning">4K konverteras…</Badge></span> : null;
  }
  // The transcoder's message is long and in English: on hover, not in the badge.
  if (m.status === "error")
    return (
      <span className="media-status" title={m.error}>
        <Badge tone="danger">Misslyckades</Badge>
      </span>
    );
  const pct = m.status === "processing" && typeof m.progress === "number" ? m.progress : null;
  const label = m.status === "uploading" ? "Laddas upp…" : m.queued ? "I kö…" : pct === null ? "Konverteras…" : `Konverteras ${pct} %`;
  return (
    <span className="media-status" title={pct === null ? undefined : "Uppskattat: konverteraren anger inte hur långt den kommit"}>
      <Badge tone={m.status === "uploading" ? "info" : "warning"}>
        <span className="spinner sm" aria-hidden="true" />
        {label}
      </Badge>
      {pct !== null && (
        <span className="media-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Konvertering">
          <span style={{ width: `${pct}%` }} />
        </span>
      )}
    </span>
  );
}

/**
 * Asks every 10 s (and right away) how videos that are converting are doing.
 * `apply` gets the files whose status or progress changed.
 */
export function usePollConverting(media: MediaDoc[], apply: (changed: MediaDoc[]) => void) {
  const { api } = useAdmin();
  const latest = useRef(apply);
  useEffect(() => {
    latest.current = apply;
  });
  const converting = media.filter((m) => m.status === "processing" && !m.deletedAt);
  const ids = converting.map((m) => m.id).join(",");
  const known = useRef(new Map<string, MediaDoc>());
  useEffect(() => {
    known.current = new Map(converting.map((m) => [m.id, m]));
  });
  useEffect(() => {
    if (!ids) return;
    const poll = async () => {
      const list = ids.split(",");
      const updated = await Promise.all(list.map((id) => api<MediaDoc>(`/media/${id}`).catch(() => null)));
      const changed = updated.filter((u): u is MediaDoc => {
        const was = u && known.current.get(u.id);
        return !!u && (u.status !== was?.status || u.progress !== was?.progress || u.queued !== was?.queued);
      });
      if (changed.length) latest.current(changed);
    };
    void poll();
    const t = setInterval(poll, 10_000);
    return () => clearInterval(t);
  }, [ids, api]);
}

/** Library modal with upload. `accept` filters what can be picked. */
export function MediaPicker({ accept, onPick, onClose }: { accept: "image" | "video" | "file" | "any"; onPick: (m: PickedMedia, doc: MediaDoc) => void; onClose: (uploaded: boolean) => void }) {
  const { api } = useAdmin();
  const [items, setItems] = useState<MediaDoc[] | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => api<MediaDoc[]>("/media").then(setItems).catch((e: Error) => setError(e.message)), [api]);
  usePollConverting(items ?? [], (changed) => setItems((list) => list && list.map((m) => changed.find((u) => u.id === m.id) ?? m)));
  useEffect(() => {
    void load();
  }, [load]);

  // Closed without picking: the caller refreshes its own list only if something was uploaded.
  const uploaded = useRef(false);
  const upload = async (file: File) => {
    setError(null);
    setProgress(0);
    try {
      const doc = await uploadFile(api, file, setProgress);
      uploaded.current = true;
      await load();
      const picked = toPicked(doc);
      if (picked && (accept === "any" || picked.kind === accept)) onPick(picked, doc);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProgress(null);
    }
  };

  const shown = (items ?? []).filter((m) => accept === "any" || m.kind === accept);
  const acceptAttr = accept === "image" ? "image/*" : accept === "video" ? "video/*" : undefined;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Mediebibliotek" onClick={(e) => e.target === e.currentTarget && onClose(uploaded.current)}>
      <div className="modal">
        <div className="modal-head">
          <h2>Mediebibliotek</h2>
          <button type="button" className="button button-ghost button-sm" onClick={() => onClose(uploaded.current)}>
            <Icon name="close" size={16} />
            Stäng
          </button>
        </div>
        <div className="modal-body">
        <label className="upload-drop">
          <input type="file" accept={acceptAttr} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <Icon name="upload" size={20} />
          <span>{progress === null ? "Ladda upp ny fil…" : `Laddar upp ${Math.round(progress * 100)} %`}</span>
          {progress !== null && (
            <span className="progress" aria-hidden="true">
              <span style={{ width: `${Math.round(progress * 100)}%` }} />
            </span>
          )}
        </label>
        {error && <p className="admin-error">{error}</p>}
        {items === null ? (
          <LoadingRow />
        ) : shown.length === 0 ? (
          <EmptyState icon="image">Inga filer ännu.</EmptyState>
        ) : (
          <ul className="media-grid">
            {shown.map((m) => {
              const picked = toPicked(m);
              return (
                <li key={m.id}>
                  <button type="button" disabled={!picked} onClick={() => picked && onPick(picked, m)} title={m.name}>
                    <MediaThumb m={m} />
                    <span className="media-name">{m.name}</span>
                    <MediaStatus m={m} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        </div>
      </div>
    </div>
  );
}
