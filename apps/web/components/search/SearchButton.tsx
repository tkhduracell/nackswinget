"use client";

import { useMemo, useRef, useState } from "react";

interface Doc {
  id: string;
  url: string;
  title: string;
  text: string;
  date?: string;
}
interface Hit extends Doc {
  score: number;
}

type Searcher = (q: string) => Hit[];

let searcher: Promise<Searcher> | null = null;
function loadSearcher(): Promise<Searcher> {
  // The index and MiniSearch only download when search is first opened.
  searcher ??= Promise.all([fetch("/search.json").then((r) => r.json() as Promise<Doc[]>), import("minisearch")]).then(
    ([docs, { default: MiniSearch }]) => {
      const ms = new MiniSearch<Doc>({
        fields: ["title", "text"],
        storeFields: ["url", "title", "text", "date"],
        searchOptions: { boost: { title: 3 }, prefix: true, fuzzy: 0.2 },
        processTerm: (t) => t.toLowerCase(),
      });
      ms.addAll(docs);
      return (q: string) => ms.search(q).slice(0, 20) as unknown as Hit[];
    },
  );
  return searcher;
}

function snippet(text: string, q: string): string {
  const i = text.toLowerCase().indexOf(q.toLowerCase().split(/\s+/)[0] ?? "");
  const start = Math.max(0, i - 60);
  return (start > 0 ? "…" : "") + text.slice(start, start + 160) + (text.length > start + 160 ? "…" : "");
}

export function SearchButton() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<Searcher | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const hits = useMemo(() => (search && query.trim() ? search(query.trim()) : []), [search, query]);

  const open = () => {
    dialog.current?.showModal();
    if (status === "idle") {
      setStatus("loading");
      loadSearcher()
        .then((fn) => {
          setSearch(() => fn);
          setStatus("ready");
        })
        .catch(() => setStatus("error"));
    }
  };

  return (
    <>
      <button type="button" className="search-btn" onClick={open} aria-label="Sök på webbplatsen">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
          <path d="M15.5 15.5 21 21" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>
      <dialog ref={dialog} className="search-dialog" onClick={(e) => e.target === dialog.current && dialog.current?.close()}>
        <form method="dialog" className="search-form" onSubmit={(e) => e.preventDefault()}>
          <label className="sr-only" htmlFor="site-search">
            Sök
          </label>
          <input id="site-search" type="search" placeholder="Sök sidor och nyheter…" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} />
          <button type="button" className="search-close" onClick={() => dialog.current?.close()} aria-label="Stäng sökning">
            ×
          </button>
        </form>
        {status === "loading" && <p className="muted">Laddar sökindex…</p>}
        {status === "error" && <p>Sökningen kunde inte laddas.</p>}
        {status === "ready" && query.trim() && hits.length === 0 && <p className="muted">Inga träffar.</p>}
        <ul className="search-hits">
          {hits.map((h) => (
            <li key={h.id}>
              <a href={h.url}>
                <strong>{h.title}</strong>
                <span>{snippet(h.text, query)}</span>
              </a>
            </li>
          ))}
        </ul>
      </dialog>
    </>
  );
}
