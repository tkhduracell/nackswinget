"use client";

import { useEffect, useRef, useState } from "react";
import type { Engine } from "@/lib/bigscreen/engine";
import type { PlayerBlock, PlayerPayload } from "@/lib/bigscreen/types";
import { Player } from "./Player";

const POLL_MS = 30_000;
const HEARTBEAT_MS = 60_000;
const STORE = "storbild-position";

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

/**
 * The TV: polls its playlist, keeps playing the last good one when offline,
 * reports a heartbeat, and picks up where it was after a reload (piSignage
 * reloads the web link when its asset duration runs out).
 */
export function ScreenPlayer({ screenKey }: { screenKey: string }) {
  // Rendering doesn't depend on it, so server (null) and client may differ.
  const [saved] = useState(() => (typeof window === "undefined" ? null : load(screenKey)));
  const [blocks, setBlocks] = useState<PlayerBlock[]>(() => saved?.payload?.blocks ?? []);
  const [light, setLight] = useState(() => saved?.payload?.screen.light ?? true);
  const engine = useRef<Engine | null>(null);
  const nowPlaying = useRef<string | undefined>(undefined);
  const errors = useRef<string[]>([]);
  const payload = useRef<PlayerPayload | undefined>(saved?.payload);
  const seeked = useRef(false);

  // Playlist polling with ETag; a 304 or a network error keeps what's playing.
  useEffect(() => {
    const url = `/api/bigscreen/${encodeURIComponent(screenKey)}/`;
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
        first = false;
        reloadAt = next.screen.reloadAt;
        payload.current = next;
        setLight(next.screen.light);
        setBlocks(next.blocks);
      } catch {
        // Offline: keep playing.
      }
    };
    void poll();
    const id = setInterval(poll, POLL_MS);
    const nightly = setTimeout(() => location.reload(), untilFourAm());
    return () => {
      clearInterval(id);
      clearTimeout(nightly);
    };
  }, [screenKey]);

  // Offline cache (public/storbild/sw.js). Not in dev, where it would cache HMR chunks.
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/storbild/sw.js", { scope: "/storbild/" }).catch(() => {});
  }, []);
  // Tell it which media the playlist uses: it caches those and drops the rest.
  useEffect(() => {
    const urls = blocks.flatMap((b) => (b.kind === "image" || b.kind === "video" ? [b.src, ...(b.poster ? [b.poster] : [])] : []));
    navigator.serviceWorker?.ready.then((reg) => reg.active?.postMessage({ type: "keep", urls })).catch(() => {});
  }, [blocks]);

  // Heartbeat and saved position.
  useEffect(() => {
    const beat = () => {
      const body = { nowPlaying: nowPlaying.current, resolution: `${innerWidth}x${innerHeight}@${devicePixelRatio}`, errors: errors.current.splice(0, 20) };
      fetch(`/api/bigscreen/${encodeURIComponent(screenKey)}/heartbeat/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
    };
    const remember = () => {
      const pos = engine.current?.position();
      if (pos) save({ key: screenKey, ...pos, payload: payload.current });
    };
    const b = setInterval(beat, HEARTBEAT_MS);
    const r = setInterval(remember, 5_000);
    const first = setTimeout(beat, 5_000);
    addEventListener("pagehide", remember);
    return () => {
      clearInterval(b);
      clearInterval(r);
      clearTimeout(first);
      removeEventListener("pagehide", remember);
    };
  }, [screenKey]);

  return (
    <Player
      blocks={blocks}
      light={light}
      resumeId={saved?.id}
      events={{
        ready: (e) => (engine.current = e),
        onShow: (block) => {
          nowPlaying.current = block.id;
          if (!seeked.current && saved && block.id === saved.id) engine.current?.seek(saved.t);
          seeked.current = true;
        },
        onError: (block, reason) => {
          errors.current.push(`${block.id}: ${reason}`);
        },
      }}
    />
  );
}
