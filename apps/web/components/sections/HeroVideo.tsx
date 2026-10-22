"use client";

import { useEffect, useRef } from "react";
import type { HeroVideo as HeroVideoAttrs } from "@/lib/content/types";
import { publicUrl } from "@/lib/media/urls";

const url = (p: string) => (/^(https?:)?\/\//.test(p) || p.startsWith("/") ? p : publicUrl(p));

/**
 * Hero background video. The poster shows at once; the video itself is only
 * fetched after the page has loaded, and never for reduced motion or Save-Data.
 */
export function HeroVideo({ video }: { video: HeroVideoAttrs }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (saveData || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const start = () => {
      for (const s of el.querySelectorAll("source")) s.src = s.dataset.src ?? "";
      el.load();
      void el.play().catch(() => {});
    };
    if (document.readyState === "complete") start();
    else {
      window.addEventListener("load", start, { once: true });
      return () => window.removeEventListener("load", start);
    }
  }, [video]);
  return (
    <video
      ref={ref}
      className={video.blurred ? "hero-video" : "hero-video hero-video-blur"}
      muted
      loop
      playsInline
      preload="none"
      aria-hidden="true"
      poster={video.poster ? url(video.poster) : undefined}
    >
      {video.webm && <source data-src={url(video.webm)} type="video/webm" />}
      <source data-src={url(video.src)} type="video/mp4" />
    </video>
  );
}
