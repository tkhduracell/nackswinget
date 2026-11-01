import { Engine } from "./engine";
import type { PlayerPayload } from "./types";

// The TV: the whole player page's script, without React (a Pi Zero 2 W has
// 512 MB). Bundled to public/storbild/player.js by scripts/build-storbild.mjs
// and loaded by app/(bare)/storbild/[key]/route.ts.
//
// Polls its playlist, keeps playing the last good one when offline, reports a
// heartbeat, and picks up where it was after a reload (piSignage reloads the
// web link when its asset duration runs out).

const POLL_MS = 30_000;
const HEARTBEAT_MS = 60_000;
// v2: saved playlists from the React player (#176–#180) point at frame pages that no longer exist.
const STORE = "storbild-position-v2";

interface Saved {
  key: string;
  id: string;
  t: number;
  payload?: PlayerPayload;
}

function load(key: string): Saved | null {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) ?? "null") as Saved | null;
    return s?.key === key ? s : null;
  } catch {
    return null;
  }
}

function save(s: Saved) {
  try {
    localStorage.setItem(STORE, JSON.stringify(s));
  } catch {
    // Private mode or full storage: resume just won't work.
  }
}

/** Milliseconds until the next 04:00 local time (nightly reload). */
function untilFourAm(now = new Date()): number {
  const t = new Date(now);
  t.setHours(4, 0, 0, 0);
  if (t <= now) t.setDate(t.getDate() + 1);
  return t.getTime() - now.getTime();
}

function start(stage: HTMLElement, key: string) {
  const saved = load(key);
  let payload = saved?.payload;
  let nowPlaying: string | undefined;
  let seeked = false;
  const errors: string[] = [];

  const engine = new Engine(stage, {
    onShow: (block) => {
      nowPlaying = block.id;
      if (!seeked && saved && block.id === saved.id) engine.seek(saved.t);
      seeked = true;
    },
    onError: (block, reason) => {
      errors.push(`${block.id}: ${reason}`);
    },
  });

  const play = (p: PlayerPayload, resumeId?: string) => {
    engine.light = p.screen.light;
    engine.setBlocks(p.blocks, resumeId);
    // The offline cache (public/storbild/sw.js) keeps the media the playlist uses and drops the rest.
    const urls = p.blocks.flatMap((b) => (b.kind === "image" || b.kind === "video" ? [b.src, ...(b.poster ? [b.poster] : [])] : []));
    navigator.serviceWorker?.ready.then((reg) => reg.active?.postMessage({ type: "keep", urls })).catch(() => {});
  };
  engine.light = payload?.screen.light ?? true;
  if (payload) play(payload, saved?.id);

  // Playlist polling with ETag; a 304 or a network error keeps what's playing.
  const url = `/api/bigscreen/${encodeURIComponent(key)}/`;
  let etag: string | null = null;
  let reloadAt: string | undefined;
  let first = true;
  const poll = async () => {
    try {
      const res = await fetch(url, { headers: etag ? { "If-None-Match": etag } : {}, cache: "no-store" });
      if (res.status === 304 || !res.ok) return;
      etag = res.headers.get("etag");
      const next = (await res.json()) as PlayerPayload;
      if (!first && next.screen.reloadAt !== reloadAt) return location.reload();
      // A playlist from before the reload is already playing: resume applies only to the first one.
      const resumeId = first && !payload ? saved?.id : undefined;
      first = false;
      reloadAt = next.screen.reloadAt;
      payload = next;
      play(next, resumeId);
    } catch {
      // Offline: keep playing.
    }
  };
  void poll();
  setInterval(poll, POLL_MS);
  setTimeout(() => location.reload(), untilFourAm());

  // Heartbeat and saved position.
  const beat = () => {
    const body = { nowPlaying, resolution: `${innerWidth}x${innerHeight}@${devicePixelRatio}`, errors: errors.splice(0, 20) };
    fetch(`/api/bigscreen/${encodeURIComponent(key)}/heartbeat/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
  };
  const remember = () => {
    const pos = engine.position();
    if (pos) save({ key, ...pos, payload });
  };
  setInterval(beat, HEARTBEAT_MS);
  setInterval(remember, 5_000);
  setTimeout(beat, 5_000);
  addEventListener("pagehide", remember);

  navigator.serviceWorker?.addEventListener("message", (e) => {
    if (e.data?.type === "cache-error") errors.push(`Får inte plats i offline-cachen: ${e.data.url}`);
  });

  // Offline cache. Not on localhost, where it would keep stale dev builds.
  if ("serviceWorker" in navigator && location.hostname !== "localhost") navigator.serviceWorker.register("/storbild/sw.js", { scope: "/storbild/" }).catch(() => {});
}

const stage = document.getElementById("bs-stage");
const key = stage?.dataset.key;
if (stage && key) start(stage, key);
