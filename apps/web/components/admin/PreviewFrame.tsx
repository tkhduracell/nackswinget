import { useEffect, useRef, useState } from "react";
import { Img } from "@/components/Img";
import { RichText } from "@/components/RichText";
import { SectionList, type SectionSlots } from "@/components/sections/SectionBody";
import type { Page, Post } from "@/lib/content/types";
import { formatDate } from "@/lib/format";

export type PreviewMessage = { type: "nsw-preview"; kind: "page"; data: Page } | { type: "nsw-preview"; kind: "post"; data: Post };

const slots: SectionSlots = {
  calendar: (s) => <div className="placeholder">Kalender ({s.view === "month" ? "månad" : s.view === "week" ? "vecka" : "lista"}) – visas med riktiga aktiviteter på den publicerade sidan</div>,
  postList: (s) => <div className="placeholder">Senaste nyheterna ({s.count} st)</div>,
};

/** Runs inside the preview iframe (/admin/forhandsvisning/). */
export function PreviewView() {
  const [msg, setMsg] = useState<PreviewMessage | null>(null);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.type !== "nsw-preview") return;
      setMsg(e.data as PreviewMessage);
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: "nsw-preview-ready" }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (!msg) return <p className="admin-loading">Väntar på innehåll…</p>;
  if (msg.kind === "post") {
    const p = msg.data;
    return (
      <article className="post">
        <header className="page-header">
          <div className="container">
            <h1>{p.title}</h1>
            <p className="post-meta">{formatDate(p.publishedAt)}</p>
          </div>
        </header>
        <div className="container with-sidebar">
          <div className="main-col">
            {p.image?.src && (
              <figure className="post-image">
                <Img image={p.image} priority />
              </figure>
            )}
            <RichText doc={p.body} />
          </div>
        </div>
      </article>
    );
  }
  const page = msg.data;
  const hasHero = page.sections[0]?.type === "hero";
  return (
    <article className="page">
      {!hasHero && (
        <header className="page-header">
          <div className="container">
            <h1>{page.title}</h1>
          </div>
        </header>
      )}
      {hasHero && <SectionList sections={page.sections.slice(0, 1)} slots={slots} />}
      <div className="container page-body">
        <SectionList sections={hasHero ? page.sections.slice(1) : page.sections} slots={slots} prefix={hasHero ? "b" : "s"} />
      </div>
    </article>
  );
}

/** Editor side: an iframe that mirrors `message` (debounced). */
export function PreviewPane({ message }: { message: PreviewMessage }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data?.type === "nsw-preview-ready") setReady(true);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => frame.current?.contentWindow?.postMessage(message, window.location.origin), 150);
    return () => clearTimeout(t);
  }, [message, ready]);

  return (
    <div className="preview-pane">
      <div className="preview-toolbar">
        <span>Förhandsvisning</span>
        <div className="row">
          <button type="button" className={device === "desktop" ? "tb-btn active" : "tb-btn"} onClick={() => setDevice("desktop")}>
            Dator
          </button>
          <button type="button" className={device === "mobile" ? "tb-btn active" : "tb-btn"} onClick={() => setDevice("mobile")}>
            Mobil
          </button>
        </div>
      </div>
      <div className="preview-stage">
        <iframe ref={frame} src="/admin/forhandsvisning/" title="Förhandsvisning" className={device === "mobile" ? "preview-frame mobile" : "preview-frame"} />
      </div>
    </div>
  );
}
