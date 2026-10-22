"use client";

import { useEffect, useRef, useState } from "react";

const LIB = "https://dans.se/files/1076/js/lib.js";

type CwWindow = Window & { cwApi?: { linksToReplace: Element[]; replaceLinks(): Promise<void> }; cwInitContent?: () => void };

function loadScript(src: string): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  if (existing) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(src));
    document.body.appendChild(s);
  });
}

let replacing: Promise<void> | null = null;

/**
 * lib.js swaps every a.cwLoadContent for its content, but only from its own
 * window "load" handler, which has already fired when it's loaded lazily.
 * So run the swap here; one pass covers every widget on the page.
 */
function replaceLinks(): Promise<void> {
  replacing ??= loadScript(LIB)
    .then(async () => {
      const w = window as CwWindow;
      if (!w.cwApi || document.readyState !== "complete") return; // lib.js' own load handler does it
      w.cwApi.linksToReplace = [];
      await w.cwApi.replaceLinks();
      w.cwInitContent?.();
    })
    .finally(() => {
      replacing = null;
    });
  return replacing;
}

/**
 * dans.se booking widget. The third-party scripts only load once the widget
 * scrolls into view; until then (or if dans.se is down) it's a plain link.
 */
export function DansSeWidget({ href, label }: { href: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"idle" | "loading" | "failed">("idle");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        setState("loading");
        replaceLinks().catch(() => setState("failed"));
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="dansse" data-state={state}>
      <a className="cwLoadContent button" href={href} target="_blank" rel="noopener noreferrer">
        {label}
      </a>
    </div>
  );
}
