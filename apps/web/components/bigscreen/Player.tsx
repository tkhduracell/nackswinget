"use client";

import { useEffect, useRef } from "react";
import { AdminLogo } from "@/components/admin/brand";
import { Engine, type EngineEvents } from "@/lib/bigscreen/engine";
import type { PlayerBlock } from "@/lib/bigscreen/types";

/** Plays `blocks` in a loop, full size of its parent: the editor's preview (the TV runs lib/bigscreen/tv.ts, no React). */
export function Player({ blocks, light = false, resumeId, events }: { blocks: PlayerBlock[]; light?: boolean; resumeId?: string; events?: EngineEvents & { ready?(engine: Engine): void } }) {
  const root = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const latest = useRef(events);
  useEffect(() => {
    latest.current = events;
  });

  useEffect(() => {
    const e = new Engine(root.current!, {
      onShow: (b, i) => latest.current?.onShow?.(b, i),
      onError: (b, r) => latest.current?.onError?.(b, r),
    });
    engine.current = e;
    latest.current?.ready?.(e);
    return () => {
      e.destroy();
      engine.current = null;
    };
  }, []);

  useEffect(() => {
    if (engine.current) engine.current.light = light;
  }, [light]);

  useEffect(() => {
    engine.current?.setBlocks(blocks, resumeId);
    // resumeId only matters for the first playlist.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks]);

  return (
    <div className="bs-stage" ref={root}>
      {/* The TV's own stylesheet, so the preview looks the same. React hoists it into <head>. */}
      {/* eslint-disable-next-line @next/next/no-css-tags -- a static file shared with the TV page, which has no Next CSS pipeline */}
      <link rel="stylesheet" href="/storbild/tv.css" precedence="storbild" />
      {/* Hidden by CSS while any layer exists, so between two videos in light mode the screen is black, not the logo. */}
      <div className="bs-idle" aria-hidden="true">
        <AdminLogo className="bs-logo" />
      </div>
    </div>
  );
}
