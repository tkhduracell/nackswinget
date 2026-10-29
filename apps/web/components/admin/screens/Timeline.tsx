import Link from "next/link";
import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Player } from "@/components/bigscreen/Player";
import type { MediaDoc } from "@/lib/admin/media";
import { blockSeconds, isActive } from "@/lib/bigscreen/resolve";
import { type Block, DEFAULT_DURATION_SEC, type PlayerBlock, type Playlist } from "@/lib/bigscreen/types";
import type { CalendarFeed, Settings } from "@/lib/content/types";
import { imageUrl, publicUrl } from "@/lib/media/urls";
import { useAdmin } from "../AuthProvider";
import type { DocRow } from "../docs";
import { Icon, type IconName } from "../icons";
import { MediaPicker, MediaThumb } from "../MediaPicker";
import { Badge, LoadingRow } from "../ui";

// The Storbild timeline (/admin/storbild/{id}/): blocks in a row, as wide as
// they are long. Drag to reorder, drag the right edge to change the length,
// drag pictures and videos in from the strip below. Edits autosave as a
// draft; "Publicera" sends them to the screens.

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";
/** Pixels the pointer must move before a press becomes a drag (less is a click). */
const DRAG_THRESHOLD = 5;

/** What is being dragged, and where the ghost under the pointer is. */
interface Drag {
  source: { media: string } | { block: string };
  label: string;
  thumb: string | null;
  x: number;
  y: number;
}

const TYPE_LABEL: Record<Block["type"], string> = {
  image: "Bild",
  video: "Video",
  calendar: "Kalender",
  latestPosts: "Senaste nyheterna",
  page: "Sida",
  post: "Nyhet",
  text: "Text",
};
const TYPE_ICON: Record<Block["type"], IconName> = { image: "image", video: "film", calendar: "history", latestPosts: "news", page: "page", post: "news", text: "file" };

/** Quick picks for an image's background; the colour input allows any other. */
const BACKGROUNDS = [
  { value: "#000000", label: "Svart" },
  { value: "#ffffff", label: "Vit" },
  { value: "#e0053d", label: "Nackswinget-röd" },
  { value: "#18181b", label: "Mörkgrå" },
  { value: "#f5f5f5", label: "Ljusgrå" },
];

const newId = () => `b-${crypto.randomUUID().slice(0, 8)}`;

interface Library {
  media: Map<string, MediaDoc>;
  pages: DocRow[];
  posts: DocRow[];
  feeds: CalendarFeed[];
}

function blockName(b: Block, lib: Library): string {
  switch (b.type) {
    case "image":
    case "video":
      return lib.media.get(b.mediaId)?.name ?? "Saknad fil";
    case "latestPosts":
      return `Senaste ${b.count} nyheterna`;
    case "page":
      return b.title ?? lib.pages.find((p) => p.path === b.path)?.title ?? `/${b.path}/`;
    case "post":
      return lib.posts.find((p) => p.id === b.postId)?.title ?? "Nyhet";
    case "text":
      return b.title || "Text";
    case "calendar":
      return b.feeds.length ? `Kalender (${b.feeds.length})` : "Kalender, veckan";
  }
}

function thumbOf(b: Block, lib: Library): string | null {
  if (b.type !== "image" && b.type !== "video") return null;
  const m = lib.media.get(b.mediaId);
  return m ? thumbOfMedia(m) : null;
}

function thumbOfMedia(m: MediaDoc): string | null {
  if (m.kind === "image") return imageUrl(m.path, m.variants.length ? [Math.min(...m.variants)] : []);
  return m.renditions?.poster ? publicUrl(m.renditions.poster) : null;
}

/** Problems an editor should see on the block itself. */
function warningOf(b: Block, lib: Library): string | null {
  if (b.type === "image" || b.type === "video") {
    const m = lib.media.get(b.mediaId);
    if (!m || m.deletedAt) return "Filen är borttagen";
    if (m.status === "processing") return "Videon konverteras, visas när den är klar";
    if (m.status !== "ready") return "Filen kunde inte laddas upp";
  }
  if (b.type === "post" && !lib.posts.some((p) => p.id === b.postId)) return "Nyheten finns inte längre";
  return null;
}

/** The draft as the player plays it: the server's resolved blocks in draft order, with the draft's text and settings. */
function liveBlocks(blocks: Block[], resolved: PlayerBlock[]): PlayerBlock[] {
  return blocks.flatMap((b): PlayerBlock[] => {
    if (!isActive(b)) return [];
    const duration = b.durationSec ?? DEFAULT_DURATION_SEC;
    if (b.type === "text") return [{ id: b.id, kind: "text", src: "", title: b.title, body: b.body, background: b.background, caption: b.caption, durationSec: duration }];
    return resolved
      .filter((p) => p.id === b.id || p.id.startsWith(`${b.id}:`))
      .map((p) => ({ ...p, caption: b.caption, durationSec: p.kind === "video" ? b.durationSec : duration, ...(b.type === "image" ? { fit: b.fit, background: b.background } : {}) }));
  });
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m ? `${m} min ${s} s` : `${s} s`;
}

export function TimelineEditor({ id }: { id: string }) {
  const { api } = useAdmin();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [name, setName] = useState("");
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [lib, setLib] = useState<Library>({ media: new Map(), pages: [], posts: [], feeds: [] });
  const [selected, setSelected] = useState<string | null>(null);
  const [state, setState] = useState<SaveState>("idle");
  const [hasDraft, setHasDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<"image" | "video" | null>(null);
  const [zoom, setZoom] = useState(8); // px per second
  const [preview, setPreview] = useState<PlayerBlock[]>([]);
  const [replay, setReplay] = useState(0);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const editsRef = useRef(0);
  const screenRef = useRef<HTMLDivElement>(null);

  // TV pages render at 1920×1080 in the preview and are scaled to its width.
  useEffect(() => {
    const el = screenRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => el.style.setProperty("--tl-scale", String(el.clientWidth / 1920)));
    ro.observe(el);
    return () => ro.disconnect();
  });

  // Load the playlist and what the pickers need.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, media, pages, posts, settings] = await Promise.all([
          api<Playlist>(`/bigscreen/playlists/${id}`),
          api<MediaDoc[]>("/media"),
          api<DocRow[]>("/docs/pages"),
          api<DocRow[]>("/docs/posts"),
          api<Settings>("/site/settings").catch(() => null),
        ]);
        if (cancelled) return;
        setPlaylist(p);
        setName(p.name);
        setBlocks(p.draft ?? p.blocks);
        setHasDraft(!!p.draft);
        setLib({
          media: new Map(media.map((m) => [m.id, m])),
          pages: pages.filter((x) => x.status !== "draft").sort((a, b) => a.title.localeCompare(b.title, "sv")),
          posts: posts.filter((x) => x.status !== "draft").sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "")),
          feeds: settings?.calendarFeeds ?? [],
        });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, id]);

  const edit = useCallback((next: Block[] | ((prev: Block[]) => Block[])) => {
    setBlocks(next);
    editsRef.current++;
    setState("dirty");
  }, []);
  const patchBlock = (bid: string, patch: Partial<Block>) => edit((prev) => prev.map((b) => (b.id === bid ? ({ ...b, ...patch } as Block) : b)));

  // Autosave the draft two seconds after the last change.
  useEffect(() => {
    if (state !== "dirty") return;
    const edits = editsRef.current;
    const t = setTimeout(async () => {
      setState("saving");
      try {
        await api(`/bigscreen/playlists/${id}`, { method: "PUT", json: { blocks, name } });
        setHasDraft(true);
        setError(null);
        setState(editsRef.current === edits ? "saved" : "dirty");
      } catch (e) {
        setError((e as Error).message);
        setState("error");
      }
    }, 2000);
    return () => clearTimeout(t);
  }, [state, blocks, name, api, id]);

  // Preview: the server resolves the draft exactly as a screen would.
  useEffect(() => {
    if (!playlist) return;
    const t = setTimeout(() => {
      api<PlayerBlock[]>("/bigscreen/preview", { method: "POST", json: { blocks } })
        .then(setPreview)
        .catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [api, blocks, playlist]);

  // Videos uploaded before the timeline existed have no stored length: read it once.
  useEffect(() => {
    const missing = [...new Set(blocks.flatMap((b) => (b.type === "video" ? [b.mediaId] : [])))]
      .map((mid) => lib.media.get(mid))
      .filter((m): m is MediaDoc => !!m && m.status === "ready" && !m.durationSec && !!m.renditions);
    for (const m of missing) {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.muted = true;
      v.src = publicUrl(m.renditions!.src720);
      v.onloadedmetadata = () => {
        const durationSec = Math.round(v.duration * 10) / 10;
        v.removeAttribute("src");
        if (!Number.isFinite(durationSec)) return;
        setLib((l) => ({ ...l, media: new Map(l.media).set(m.id, { ...m, durationSec }) }));
        api(`/media/${m.id}`, { method: "PATCH", json: { durationSec } }).catch(() => {});
      };
    }
  }, [blocks, lib.media, api]);

  const publish = async () => {
    setState("saving");
    try {
      const p = await api<Playlist>(`/bigscreen/playlists/${id}`, { method: "POST", json: { blocks, name } });
      setPlaylist(p);
      setHasDraft(false);
      setError(null);
      setState("saved");
    } catch (e) {
      setError((e as Error).message);
      setState("error");
    }
  };
  const discard = async () => {
    if (!window.confirm("Släng ändringarna och gå tillbaka till det som visas på skärmarna nu?")) return;
    const p = await api<Playlist>(`/bigscreen/playlists/${id}?draft`, { method: "DELETE" });
    setPlaylist(p);
    setBlocks(p.blocks);
    setHasDraft(false);
    setState("idle");
  };

  /** Selects a block; the preview then loops just that block. */
  const focus = (bid: string) => setSelected(bid);

  // Insert after the selected block, or last.
  const insertAt = (index: number | null, block: Block) => {
    edit((prev) => {
      const at = index ?? (selected ? prev.findIndex((b) => b.id === selected) + 1 : prev.length);
      return [...prev.slice(0, at), block, ...prev.slice(at)];
    });
    focus(block.id);
  };
  const fromMedia = (m: MediaDoc): Block | null =>
    m.status === "ready" && m.kind === "image" ? { id: newId(), type: "image", mediaId: m.id, fit: "cover", durationSec: DEFAULT_DURATION_SEC } : m.kind === "video" ? { id: newId(), type: "video", mediaId: m.id } : null;
  const addContent = (type: "latestPosts" | "calendar" | "page" | "post" | "text") => {
    const block: Block | null =
      type === "latestPosts"
        ? { id: newId(), type, count: 3, durationSec: 8 }
        : type === "calendar"
          ? { id: newId(), type, view: "week", feeds: [], durationSec: 15 }
          : type === "page"
            ? lib.pages[0] && { id: newId(), type, path: lib.pages[0].path ?? "", durationSec: 15 }
            : type === "post"
              ? lib.posts[0] && { id: newId(), type, postId: lib.posts[0].id, durationSec: 10 }
              : { id: newId(), type, title: "Välkommen!", durationSec: 8 };
    if (block) insertAt(null, block);
  };
  const remove = (bid: string) => {
    edit((prev) => prev.filter((b) => b.id !== bid));
    setSelected(null);
  };
  const move = (bid: string, delta: number) =>
    edit((prev) => {
      const i = prev.findIndex((b) => b.id === bid);
      const j = Math.max(0, Math.min(prev.length - 1, i + delta));
      if (i === j) return prev;
      const next = [...prev];
      next.splice(j, 0, next.splice(i, 1)[0]);
      return next;
    });

  // Delete / arrow keys on the selected block (not while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selected || (e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        remove(selected);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        if (e.altKey) move(selected, e.key === "ArrowLeft" ? -1 : 1);
        else {
          const i = blocks.findIndex((b) => b.id === selected);
          const next = blocks[i + (e.key === "ArrowLeft" ? -1 : 1)];
          if (next) focus(next.id);
        }
      } else if (e.key === "Escape") {
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // --- drag and drop on the track ---
  const track = useRef<HTMLDivElement>(null);
  const trackBox = useRef<HTMLDivElement>(null);
  const indexAt = (clientX: number): number => {
    const clips = [...(track.current?.querySelectorAll<HTMLElement>(".tl-clip") ?? [])];
    const i = clips.findIndex((c) => {
      const r = c.getBoundingClientRect();
      return clientX < r.left + r.width / 2;
    });
    return i === -1 ? clips.length : i;
  };
  const overTrack = (x: number, y: number) => {
    const r = trackBox.current?.getBoundingClientRect();
    return !!r && x >= r.left && x <= r.right && y >= r.top - 24 && y <= r.bottom + 24;
  };
  const drop = (source: Drag["source"], at: number) => {
    if ("media" in source) {
      const m = lib.media.get(source.media);
      const block = m && fromMedia(m);
      if (block) insertAt(at, block);
      return;
    }
    edit((prev) => {
      const from = prev.findIndex((b) => b.id === source.block);
      if (from === -1) return prev;
      const next = [...prev];
      const [b] = next.splice(from, 1);
      next.splice(at > from ? at - 1 : at, 0, b);
      return next;
    });
  };

  /**
   * Pointer-based drag (mouse, pen and touch): a press that moves more than a
   * few pixels drags a ghost; dropping over the timeline inserts or moves.
   * A press that doesn't move is a click (`onClick`).
   */
  const startDrag = (e: ReactPointerEvent, source: Drag["source"], label: string, thumb: string | null, onClick: () => void) => {
    if (e.button !== 0) return;
    e.preventDefault(); // no native image drag or text selection
    const x0 = e.clientX;
    const y0 = e.clientY;
    let dragging = false;
    const onMove = (ev: PointerEvent) => {
      if (!dragging && Math.hypot(ev.clientX - x0, ev.clientY - y0) < DRAG_THRESHOLD) return;
      dragging = true;
      setDrag({ source, label, thumb, x: ev.clientX, y: ev.clientY });
      setDropAt(overTrack(ev.clientX, ev.clientY) ? indexAt(ev.clientX) : null);
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setDrag(null);
      setDropAt(null);
      if (!dragging) return onClick();
      if (ev.type === "pointerup" && overTrack(ev.clientX, ev.clientY)) drop(source, indexAt(ev.clientX));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  // Drag a clip's right edge to change its length (1 s steps).
  const startResize = (e: ReactPointerEvent, b: Block) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const clip = b.type === "video" ? lib.media.get(b.mediaId)?.durationSec : undefined;
    const start = blockSeconds(b, clip);
    const onMove = (ev: PointerEvent) => {
      let secs = Math.max(1, Math.round(start + (ev.clientX - startX) / zoom));
      if (clip) secs = Math.min(secs, Math.floor(clip));
      if (b.type === "latestPosts") secs = Math.max(1, Math.round(secs / b.count));
      patchBlock(b.id, { durationSec: secs });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const seconds = useMemo(() => blocks.map((b) => blockSeconds(b, b.type === "video" ? lib.media.get(b.mediaId)?.durationSec : undefined)), [blocks, lib.media]);
  const total = seconds.reduce((a, b) => a + b, 0);
  const sel = blocks.find((b) => b.id === selected) ?? null;
  // The server resolves media and posts (debounced); text and settings come from the draft
  // right away, so the preview follows typing without waiting for it.
  const live = useMemo(() => liveBlocks(blocks, preview), [blocks, preview]);
  const shown = useMemo(() => (selected ? live.filter((p) => p.id === selected || p.id.startsWith(`${selected}:`)) : live), [live, selected]);
  const strip = useMemo(() => [...lib.media.values()].filter((m) => !m.deletedAt && (m.kind === "image" || m.kind === "video")), [lib.media]);

  if (error && !playlist) return <p className="admin-error">{error}</p>;
  if (!playlist) return <LoadingRow />;

  return (
    <div className="admin-page tl-editor">
      <div className="editor-bar">
        <div className="editor-bar-main">
          <Link href="/admin/storbild/" className="icon-btn back-btn" aria-label="Tillbaka" title="Tillbaka">
            <Icon name="back" />
            <span className="back-label">Tillbaka</span>
          </Link>
          <div className="editor-bar-title">
            <input
              className="tl-name"
              value={name}
              aria-label="Spellistans namn"
              onChange={(e) => {
                setName(e.target.value);
                setState("dirty");
              }}
            />
            <SaveBadge state={state} hasDraft={hasDraft} />
          </div>
        </div>
        <div className="editor-actions">
          {hasDraft && (
            <button type="button" className="button button-danger-ghost" onClick={discard}>
              <Icon name="trash" size={16} />
              <span className="hide-xs">Släng ändringar</span>
            </button>
          )}
          <button type="button" className="button" onClick={publish} disabled={state === "saving"}>
            <Icon name="send" size={16} />
            Publicera
          </button>
        </div>
      </div>
      {error && <p className="admin-error">{error}</p>}

      <div className="tl-top">
        <div className="tl-preview">
          <div className="tl-screen" ref={screenRef}>
            {/* Remounted on selection so the chosen block starts from the beginning right away. */}
            <Player key={`${selected ?? "all"}-${replay}`} blocks={shown} />
          </div>
          <div className="tl-preview-bar">
            <span className="muted">
              {sel
                ? shown.length
                  ? `Förhandsvisning av block ${blocks.indexOf(sel) + 1}: ${blockName(sel, lib)}`
                  : "Blocket visas inte just nu (pausat, utanför datumen eller filen saknas)"
                : `Förhandsvisning · hela slingan ${fmtTime(total)}`}
            </span>
            <span className="tl-preview-actions">
              <button type="button" className="button button-ghost button-sm" onClick={() => setReplay((n) => n + 1)}>
                <Icon name="history" size={16} />
                Spela om
              </button>
              {sel && (
                <button type="button" className="button button-ghost button-sm" onClick={() => setSelected(null)}>
                  <Icon name="eye" size={16} />
                  Visa hela slingan
                </button>
              )}
            </span>
          </div>
        </div>
        <aside className="tl-inspector card" aria-label="Valt block">
          {sel ? (
            <Inspector key={sel.id} block={sel} lib={lib} index={blocks.indexOf(sel)} count={blocks.length} onPatch={(p) => patchBlock(sel.id, p)} onMove={(d) => move(sel.id, d)} />
          ) : (
            <div className="tl-help">
              <h2>Så fungerar det</h2>
              <ul>
                <li>Blocken visas i tur och ordning, från vänster, och börjar om när de är slut.</li>
                <li>Dra ett block för att flytta det. Dra i högra kanten för att ändra hur länge det visas.</li>
                <li>Dra in bilder och videor från raden under tidslinjen (eller klicka på dem), eller lägg till med knapparna.</li>
                <li>Klicka på ett block för att ändra det och se bara det i förhandsvisningen. Esc eller Visa hela slingan visar allt igen.</li>
                <li>Ändringar sparas av sig själva. Skärmarna visar dem först när du trycker på Publicera.</li>
              </ul>
            </div>
          )}
        </aside>
      </div>

      <div className={drag ? "tl tl-dropping" : "tl"} ref={trackBox}>
        <Ruler total={total} zoom={zoom} />
        <div className="tl-track" ref={track} role="list" aria-label="Tidslinje">
          {blocks.length === 0 && <p className="tl-empty">Tom spellista. Dra in en bild eller video, eller använd knapparna ovan.</p>}
          {blocks.map((b, i) => {
            const warn = warningOf(b, lib);
            const thumb = thumbOf(b, lib);
            const inactive = b.disabled || !!warn;
            return (
              <div key={b.id} className="tl-slot" role="listitem">
                {dropAt === i && <span className="tl-drop" aria-hidden="true" />}
                <div
                  className={[
                    "tl-clip",
                    `tl-${b.type}`,
                    b.id === selected ? "selected" : "",
                    inactive ? "inactive" : "",
                    b.validFrom || b.validTo ? "dated" : "",
                    drag && "block" in drag.source && drag.source.block === b.id ? "dragging" : "",
                  ].join(" ")}
                  style={{ width: Math.max(56, seconds[i] * zoom) }}
                  tabIndex={0}
                  title={warn ?? blockName(b, lib)}
                  onPointerDown={(e) => startDrag(e, { block: b.id }, blockName(b, lib), thumb, () => focus(b.id))}
                  onKeyDown={(e) => e.key === "Enter" && focus(b.id)}
                  aria-pressed={b.id === selected}
                >
                  {thumb && <span className="tl-thumb" style={{ backgroundImage: `url("${thumb}")` }} aria-hidden="true" />}
                  <span className="tl-label">
                    <Icon name={TYPE_ICON[b.type]} size={14} />
                    <span className="tl-name-text">{blockName(b, lib)}</span>
                  </span>
                  <span className="tl-dur">
                    {b.type === "latestPosts" ? `${b.count} × ${b.durationSec ?? DEFAULT_DURATION_SEC} s` : fmtTime(seconds[i])}
                    {warn && " ⚠"}
                  </span>
                  {b.type === "latestPosts" && (
                    <span className="tl-segments" aria-hidden="true">
                      {Array.from({ length: b.count - 1 }, (_, k) => (
                        <span key={k} style={{ left: `${((k + 1) / b.count) * 100}%` }} />
                      ))}
                    </span>
                  )}
                  {/* Shown on hover (and keyboard focus); pointerdown stops here so a click isn't a drag. */}
                  <span className="tl-clip-actions" onPointerDown={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="tl-clip-btn"
                      onClick={() => patchBlock(b.id, { disabled: b.disabled ? undefined : true })}
                      title={b.disabled ? "Slå på (visas på skärmen)" : "Stäng av tillfälligt (visas inte)"}
                      aria-label={b.disabled ? "Slå på blocket" : "Stäng av blocket"}
                    >
                      <Icon name={b.disabled ? "eyeOff" : "eye"} size={14} />
                    </button>
                    <button type="button" className="tl-clip-btn danger" onClick={() => remove(b.id)} title="Ta bort från tidslinjen" aria-label="Ta bort blocket">
                      <Icon name="trash" size={14} />
                    </button>
                  </span>
                  <span className="tl-handle" onPointerDown={(e) => startResize(e, b)} aria-hidden="true" title="Dra för att ändra längden" />
                </div>
              </div>
            );
          })}
          {dropAt === blocks.length && blocks.length > 0 && <span className="tl-drop" aria-hidden="true" />}
        </div>
      </div>

      <div className="tl-add">
        <span className="tl-add-label">Lägg till:</span>
        <button type="button" className="button button-ghost button-sm" onClick={() => setPicker("image")}>
          <Icon name="image" size={16} /> Bild
        </button>
        <button type="button" className="button button-ghost button-sm" onClick={() => setPicker("video")}>
          <Icon name="film" size={16} /> Video
        </button>
        <button type="button" className="button button-ghost button-sm" onClick={() => addContent("latestPosts")}>
          <Icon name="news" size={16} /> Senaste nyheterna
        </button>
        <button type="button" className="button button-ghost button-sm" onClick={() => addContent("calendar")}>
          <Icon name="history" size={16} /> Kalender
        </button>
        <button type="button" className="button button-ghost button-sm" onClick={() => addContent("post")} disabled={!lib.posts.length}>
          <Icon name="news" size={16} /> En nyhet
        </button>
        <button type="button" className="button button-ghost button-sm" onClick={() => addContent("page")} disabled={!lib.pages.length}>
          <Icon name="page" size={16} /> Sida
        </button>
        <button type="button" className="button button-ghost button-sm" onClick={() => addContent("text")}>
          <Icon name="file" size={16} /> Text
        </button>
        <label className="tl-zoom">
          <span>Zoom</span>
          <input type="range" min={3} max={30} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
        </label>
      </div>

      <div className="tl-strip" aria-label="Bilder och videor att dra in">
        {strip.length === 0 ? (
          <p className="muted">Inga bilder eller videor uppladdade ännu. Använd Bild eller Video ovan.</p>
        ) : (
          strip.map((m) => (
            <button
              key={m.id}
              type="button"
              className="tl-strip-item"
              disabled={m.status !== "ready"}
              title={m.status === "ready" ? `${m.name} – dra till tidslinjen eller klicka för att lägga till` : `${m.name} (konverteras…)`}
              onPointerDown={(e) =>
                startDrag(e, { media: m.id }, m.name, thumbOfMedia(m), () => {
                  const block = fromMedia(m);
                  // eslint-disable-next-line react-hooks/refs -- runs on click, not during render
                  if (block) insertAt(null, block);
                })
              }
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                const block = fromMedia(m);
                if (block) insertAt(null, block);
              }}
            >
              <MediaThumb m={m} />
              <span>{m.name}</span>
            </button>
          ))
        )}
      </div>

      {drag && (
        <div className="tl-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          {drag.thumb && <span className="tl-ghost-thumb" style={{ backgroundImage: `url("${drag.thumb}")` }} />}
          <span>{drag.label}</span>
        </div>
      )}

      {picker && (
        <MediaPicker
          accept={picker}
          onClose={() => setPicker(null)}
          onPick={(_picked, doc) => {
            setLib((l) => ({ ...l, media: new Map(l.media).set(doc.id, doc) }));
            const block = fromMedia(doc);
            if (block) insertAt(null, block);
            setPicker(null);
          }}
        />
      )}
    </div>
  );
}

function SaveBadge({ state, hasDraft }: { state: SaveState; hasDraft: boolean }) {
  if (state === "saving") return <Badge tone="info">Sparar…</Badge>;
  if (state === "dirty") return <Badge tone="neutral">Osparat</Badge>;
  if (state === "error") return <Badge tone="danger">Kunde inte spara</Badge>;
  return hasDraft ? <Badge tone="warning">Utkast, inte publicerat</Badge> : <Badge tone="success">Visas på skärmarna</Badge>;
}

function Ruler({ total, zoom }: { total: number; zoom: number }) {
  const step = zoom >= 12 ? 5 : zoom >= 6 ? 10 : 30;
  const marks = Array.from({ length: Math.floor(total / step) + 1 }, (_, i) => i * step);
  return (
    <div className="tl-ruler" style={{ width: Math.max(total * zoom, 200) }} aria-hidden="true">
      {marks.map((s) => (
        <span key={s} style={{ left: s * zoom }}>
          {s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`}
        </span>
      ))}
    </div>
  );
}

function Inspector({
  block: b,
  lib,
  index,
  count,
  onPatch,
  onMove,
}: {
  block: Block;
  lib: Library;
  index: number;
  count: number;
  onPatch: (p: Partial<Block>) => void;
  onMove: (delta: number) => void;
}) {
  const clip = b.type === "video" ? lib.media.get(b.mediaId)?.durationSec : undefined;
  const warn = warningOf(b, lib);
  const num = (v: string) => (v === "" ? undefined : Math.max(1, Math.min(3600, Math.round(Number(v)))));
  return (
    <div className="tl-inspect">
      <div className="card-head">
        <strong>
          {index + 1}. {TYPE_LABEL[b.type]}
        </strong>
        <span className="tl-inspect-move">
          <button type="button" className="icon-btn" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Flytta vänster" title="Flytta vänster">
            <Icon name="back" size={16} />
          </button>
          <button type="button" className="icon-btn" onClick={() => onMove(1)} disabled={index === count - 1} aria-label="Flytta höger" title="Flytta höger">
            <Icon name="right" size={16} />
          </button>
        </span>
      </div>
      {warn && <p className="admin-error">{warn}</p>}
      <p className="muted tl-inspect-name">{blockName(b, lib)}</p>

      {b.type === "video" ? (
        <>
          <label className="bs-check">
            <input type="checkbox" checked={!b.durationSec} onChange={(e) => onPatch({ durationSec: e.target.checked ? undefined : Math.min(15, Math.floor(clip ?? 15)) })} />
            Spela hela videon{clip ? ` (${fmtTime(clip)})` : ""}
          </label>
          {!!b.durationSec && (
            <label className="field">
              <span>Visa de första (sekunder)</span>
              <input type="number" min={1} max={clip ? Math.floor(clip) : 3600} value={b.durationSec} onChange={(e) => onPatch({ durationSec: num(e.target.value) })} />
            </label>
          )}
        </>
      ) : b.type === "latestPosts" ? (
        <div className="field-row">
          <label className="field">
            <span>Antal nyheter</span>
            <input type="number" min={1} max={10} value={b.count} onChange={(e) => onPatch({ count: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })} />
          </label>
          <label className="field">
            <span>Sekunder per nyhet</span>
            <input type="number" min={1} max={120} value={b.durationSec ?? DEFAULT_DURATION_SEC} onChange={(e) => onPatch({ durationSec: num(e.target.value) })} />
          </label>
        </div>
      ) : (
        <label className="field">
          <span>Visas i (sekunder)</span>
          <input type="number" min={1} max={3600} value={b.durationSec ?? DEFAULT_DURATION_SEC} onChange={(e) => onPatch({ durationSec: num(e.target.value) })} />
        </label>
      )}

      {b.type === "image" && (
        <fieldset className="field">
          <legend>Bilden</legend>
          <label className="bs-check">
            <input type="radio" checked={b.fit === "cover"} onChange={() => onPatch({ fit: "cover" })} /> Fyll hela skärmen (kanterna kan beskäras)
          </label>
          <label className="bs-check">
            <input type="radio" checked={b.fit === "contain"} onChange={() => onPatch({ fit: "contain" })} /> Visa hela bilden (med bakgrund runt)
          </label>
        </fieldset>
      )}
      {b.type === "image" && (
        <fieldset className="field">
          <legend>Bakgrund (syns runt och genom genomskinliga bilder)</legend>
          <div className="tl-swatches">
            {BACKGROUNDS.map((c) => (
              <button
                key={c.value}
                type="button"
                className={(b.background ?? "#000000").toLowerCase() === c.value ? "tl-bg selected" : "tl-bg"}
                style={{ background: c.value }}
                onClick={() => onPatch({ background: c.value === "#000000" ? undefined : c.value })}
                aria-label={c.label}
                title={c.label}
              />
            ))}
            <label className="tl-bg-custom" title="Egen färg">
              <input type="color" value={b.background ?? "#000000"} onChange={(e) => onPatch({ background: e.target.value })} aria-label="Egen färg" />
            </label>
          </div>
        </fieldset>
      )}
      {b.type === "calendar" && (
        <fieldset className="field">
          <legend>Kalendrar (inga valda = alla)</legend>
          {lib.feeds.map((f) => (
            <label key={f.key} className="bs-check">
              <input
                type="checkbox"
                checked={b.feeds.includes(f.key)}
                onChange={(e) => onPatch({ feeds: e.target.checked ? [...b.feeds, f.key] : b.feeds.filter((k) => k !== f.key) })}
              />
              <span className="tl-swatch" style={{ background: f.color }} /> {f.name}
            </label>
          ))}
        </fieldset>
      )}
      {b.type === "page" && (
        <label className="field">
          <span>Sida</span>
          <select value={b.path} onChange={(e) => onPatch({ path: e.target.value, title: lib.pages.find((p) => p.path === e.target.value)?.title })}>
            {lib.pages.map((p) => (
              <option key={p.id} value={p.path ?? ""}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {b.type === "post" && (
        <label className="field">
          <span>Nyhet</span>
          <select value={b.postId} onChange={(e) => onPatch({ postId: e.target.value })}>
            {lib.posts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {b.type === "text" && (
        <>
          <label className="field">
            <span>Rubrik</span>
            <input value={b.title} maxLength={120} onChange={(e) => onPatch({ title: e.target.value })} />
          </label>
          <label className="field">
            <span>Text (valfri)</span>
            <textarea rows={3} maxLength={600} value={b.body ?? ""} onChange={(e) => onPatch({ body: e.target.value || undefined })} />
          </label>
          <label className="field">
            <span>Bakgrundsfärg</span>
            <input type="color" value={b.background ?? "#e0053d"} onChange={(e) => onPatch({ background: e.target.value })} />
          </label>
        </>
      )}

      {(b.type === "image" || b.type === "video") && (
        <label className="field">
          <span>Text över bilden (valfri)</span>
          <input value={b.caption ?? ""} maxLength={200} onChange={(e) => onPatch({ caption: e.target.value || undefined })} />
        </label>
      )}
      <div className="field-row">
        <label className="field">
          <span>Visa från (valfritt)</span>
          <input type="date" value={b.validFrom ?? ""} onChange={(e) => onPatch({ validFrom: e.target.value || undefined })} />
        </label>
        <label className="field">
          <span>Visa till och med</span>
          <input type="date" value={b.validTo ?? ""} onChange={(e) => onPatch({ validTo: e.target.value || undefined })} />
        </label>
      </div>
      {b.disabled && <p className="muted">Blocket är avstängt och visas inte. Slå på det med ögat på blocket i tidslinjen.</p>}
    </div>
  );
}
