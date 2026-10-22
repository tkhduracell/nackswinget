import { useEffect, useRef, useState } from "react";
import { Img } from "@/components/Img";
import { RichText } from "@/components/RichText";
import { SectionList, type SectionSlots } from "@/components/sections/SectionBody";
import type { Page, Post } from "@/lib/content/types";
import { formatShortDate } from "@/lib/format";
import { Icon } from "./icons";

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
  // Same markup as the public PostView/PageView, inside the public site wrapper.
  if (msg.kind === "post") {
    const p = msg.data;
    return (
      <div className="site">
        <main>
        <article className="post">
          <div className="container post-layout">
            <div className="post-main">
              <h1 className="post-title">{p.title}</h1>
              <p className="post-meta">{formatShortDate(p.publishedAt)}</p>
              {p.image?.src && (
                <figure className="post-image">
                  <Img image={p.image} priority />
                </figure>
              )}
              <RichText doc={p.body} />
            </div>
            <aside className="post-sidebar" aria-hidden="true">
              <h2 className="widget-title">Senaste nyheter</h2>
            </aside>
          </div>
        </article>
        </main>
      </div>
    );
  }
  const page = msg.data;
  const hasHero = page.sections[0]?.type === "hero";
  return (
    <div className="site">
      <main>
      <article className="page">
        {!hasHero && (
          <>
            <header className="page-header">
              <div className="container">
                <h1>{page.title}</h1>
              </div>
            </header>
            <div className="breadcrumbs-bar">
              <nav className="breadcrumbs container" aria-label="Brödsmulor">
                <ol>
                  <li>
                    <span>Hem</span>
                  </li>
                  <li>
                    <span aria-current="page">{page.title}</span>
                  </li>
                </ol>
              </nav>
            </div>
          </>
        )}
        {hasHero && <SectionList sections={page.sections.slice(0, 1)} slots={slots} />}
        <div className="container page-body">
          <SectionList sections={hasHero ? page.sections.slice(1) : page.sections} slots={slots} prefix={hasHero ? "b" : "s"} />
        </div>
      </article>
      </main>
    </div>
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
    <div className="preview-pane" id="forhandsvisning">
      <div className="preview-toolbar">
        <span className="preview-title">
          <span className="live-dot" aria-hidden="true" />
          Förhandsvisning
        </span>
        <div className="segmented" role="group" aria-label="Förhandsvisning">
          <button type="button" className={device === "desktop" ? "seg active" : "seg"} aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}>
            <Icon name="monitor" size={15} />
            Dator
          </button>
          <button type="button" className={device === "mobile" ? "seg active" : "seg"} aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")}>
            <Icon name="phone" size={15} />
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
