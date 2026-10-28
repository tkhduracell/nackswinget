// Link field with autocomplete over the site's pages, news and news categories. Stores a plain
// href, so a typed address (https://…) still works for anything else.

import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import type { Category } from "@/lib/content/types";
import { useAdmin } from "./AuthProvider";
import type { DocRow } from "./docs";
import { Icon } from "./icons";
import { Badge } from "./ui";

export interface LinkTarget {
  href: string;
  title: string;
  kind: "page" | "post" | "category";
  date?: string;
  draft?: boolean;
}

export interface LinkTargets {
  list: LinkTarget[] | null;
  error: string | null;
}

const KIND_LABEL: Record<LinkTarget["kind"], string> = { page: "Sida", post: "Nyhet", category: "Kategori" };
// Ranks equally good title matches: pages, then categories, then news.
const KIND_RANK: Record<LinkTarget["kind"], number> = { page: 0, category: 0.25, post: 0.5 };

const BUILTIN: LinkTarget[] = [
  { href: "/", title: "Startsidan", kind: "page" },
  { href: "/nyheter/", title: "Nyheter (alla)", kind: "page" },
];

type Api = ReturnType<typeof useAdmin>["api"];

async function loadTargets(api: Api): Promise<LinkTarget[]> {
  const [pages, posts, categories] = await Promise.all([api<DocRow[]>("/docs/pages"), api<DocRow[]>("/docs/posts"), api<Category[] | null>("/site/categories")]);
  // A page at the same address replaces the built-in name.
  const byHref = new Map(BUILTIN.map((t) => [t.href, t]));
  for (const p of pages) {
    const href = p.path ? `/${p.path}/` : "/";
    byHref.set(href, { href, title: p.title, kind: "page", draft: p.status === "draft" });
  }
  for (const c of categories ?? []) {
    const href = `/category/${c.slug}/`;
    byHref.set(href, { href, title: c.name, kind: "category" });
  }
  for (const p of posts.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))) {
    const href = `/${p.slug}/`;
    if (p.slug && !byHref.has(href)) byHref.set(href, { href, title: p.title, kind: "post", date: p.publishedAt?.slice(0, 10), draft: p.status === "draft" });
  }
  return [...byHref.values()];
}

// Shared between screens for a minute, so moving around the admin doesn't refetch every list.
const CACHE_MS = 60_000;
const cache = new WeakMap<Api, { at: number; targets: Promise<LinkTarget[]> }>();

function cachedTargets(api: Api) {
  const hit = cache.get(api);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.targets;
  const targets = loadTargets(api);
  cache.set(api, { at: Date.now(), targets });
  targets.catch(() => cache.delete(api));
  return targets;
}

export function useLinkTargets(): LinkTargets {
  const { api } = useAdmin();
  const [state, setState] = useState<LinkTargets>({ list: null, error: null });
  useEffect(() => {
    let live = true;
    cachedTargets(api).then(
      (list) => live && setState({ list, error: null }),
      (e: Error) => live && setState({ list: [], error: e.message }),
    );
    return () => {
      live = false;
    };
  }, [api]);
  return state;
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

const normalizeHref = (href: string) => (href.startsWith("/") && !href.endsWith("/") && !/[?#.]/.test(href) ? `${href}/` : href);

/** The typed text as a link address, or null when it reads as a search. Adds https:// to a bare domain and / to a bare path. */
function toAddress(s: string): string | null {
  const t = s.trim();
  if (/^(\/|https?:\/\/|mailto:|tel:|#)/.test(t)) return t;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t)) return `https://${t}`;
  if (/^[\w-]+\/\S*$/.test(t)) return `/${t}`;
  return null;
}

function search(targets: LinkTarget[], query: string) {
  const q = fold(query.trim());
  if (!q) return targets.filter((t) => t.kind === "page").slice(0, 8);
  const scored: { t: LinkTarget; score: number }[] = [];
  for (const t of targets) {
    const title = fold(t.title);
    const score = title.startsWith(q) ? 0 : title.split(/\s+/).some((w) => w.startsWith(q)) ? 1 : title.includes(q) ? 2 : fold(t.href).includes(q) ? 3 : -1;
    if (score >= 0) scored.push({ t, score: score + KIND_RANK[t.kind] });
  }
  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, 8)
    .map((s) => s.t);
}

type Option = { target: LinkTarget } | { address: string };

export function LinkPicker({
  value,
  onChange,
  targets,
  label = "Länk",
  clearable = false,
}: {
  value: string;
  onChange: (href: string, target?: LinkTarget) => void;
  targets: LinkTargets;
  label?: string;
  /** Show a button that empties the link (for optional links). */
  clearable?: boolean;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  // The text being typed, or null when not editing. Mirrored in a ref so blur sees a pick made in the same event.
  const [query, setQueryState] = useState<string | null>(null);
  const queryRef = useRef<string | null>(null);
  const setQuery = (q: string | null) => {
    queryRef.current = q;
    setQueryState(q);
  };
  const [active, setActive] = useState(0);
  const selected = useMemo(() => targets.list?.find((t) => t.href === normalizeHref(value)), [targets.list, value]);
  const editing = query !== null;

  const options: Option[] = useMemo(() => {
    if (query === null) return [];
    const found: Option[] = search(targets.list ?? [], query).map((target) => ({ target }));
    const address = toAddress(query);
    return address && address !== value && !found.some((o) => "target" in o && o.target.href === normalizeHref(address)) ? [{ address }, ...found] : found;
  }, [targets.list, query, value]);

  const pick = (o: Option) => {
    setQuery(null);
    if ("target" in o) onChange(o.target.href, o.target);
    else onChange(o.address);
  };

  // Leaving the field keeps a typed address; a search term that wasn't picked is dropped.
  const commit = () => {
    const q = queryRef.current;
    if (q === null) return;
    const address = toAddress(q);
    setQuery(null);
    if (address && address !== value) onChange(address);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!editing) setQuery("");
      else if (options.length) setActive((a) => (a + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
    } else if (e.key === "Enter" && editing) {
      e.preventDefault();
      if (options[active]) pick(options[active]);
      else commit();
    } else if (e.key === "Escape" && editing) {
      e.preventDefault();
      setQuery(null);
    }
  };

  const display = selected ? selected.title : value;
  const canClear = clearable && !editing && !!value;
  return (
    <div className={canClear ? "link-picker clearable" : "link-picker"}>
      <input
        ref={inputRef}
        role="combobox"
        aria-label={label}
        aria-expanded={editing && options.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={editing && options[active] ? `${listId}-${active}` : undefined}
        title={value}
        placeholder="Sök sida, nyhet eller kategori, eller skriv en adress"
        value={editing ? query : display}
        onFocus={() => {
          // A page is searched for anew; a typed address stays editable, selected so typing replaces it.
          const initial = selected ? "" : value;
          setQuery(initial);
          setActive(0);
          if (initial) requestAnimationFrame(() => inputRef.current?.select());
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
      {!editing && (
        <span className={selected?.draft ? "link-picker-kind draft" : "link-picker-kind"} aria-hidden="true">
          {selected ? `${KIND_LABEL[selected.kind]}${selected.draft ? " · utkast" : ""}` : value ? (/^https?:/.test(value) ? "Extern" : "Adress") : null}
        </span>
      )}
      {canClear && (
        <button type="button" className="link-picker-clear" onClick={() => onChange("")} aria-label="Ta bort länken">
          <Icon name="close" size={14} />
        </button>
      )}
      {editing && options.length > 0 && (
        <ul id={listId} role="listbox" className="link-picker-list">
          {options.map((o, i) => (
            <li
              key={"target" in o ? o.target.href : "address"}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : undefined}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => {
                pick(o);
                inputRef.current?.blur();
              }}
            >
              {"target" in o ? (
                <>
                  <span className="link-picker-title">
                    {o.target.title || "(utan titel)"}
                    {o.target.draft && <Badge tone="warning">Utkast</Badge>}
                  </span>
                  <span className="link-picker-meta">
                    {KIND_LABEL[o.target.kind]}
                    {o.target.date ? ` · ${o.target.date}` : ""} · {o.target.href}
                  </span>
                </>
              ) : (
                <>
                  <span className="link-picker-title">Använd adressen</span>
                  <span className="link-picker-meta">{o.address}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && options.length === 0 && (targets.error || (targets.list && query)) && (
        <p className="link-picker-list link-picker-empty">
          {targets.error ? `Kunde inte hämta sidor och nyheter (${targets.error}). Du kan fortfarande skriva en adress.` : "Inget matchar. Skriv en adress som börjar med / eller https://"}
        </p>
      )}
    </div>
  );
}
