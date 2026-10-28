// Link field with autocomplete over the site's pages, news and news categories. Stores a plain
// href, so a typed address (https://…) still works for anything else.

import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import type { Category } from "@/lib/content/types";
import { useAdmin } from "./AuthProvider";
import { Icon } from "./icons";
import { Badge } from "./ui";

export interface LinkTarget {
  href: string;
  title: string;
  kind: "page" | "post" | "category";
  date?: string;
  draft?: boolean;
}

const KIND_LABEL: Record<LinkTarget["kind"], string> = { page: "Sida", post: "Nyhet", category: "Kategori" };
// Ranks equally good title matches: pages, then categories, then news.
const KIND_RANK: Record<LinkTarget["kind"], number> = { page: 0, category: 0.25, post: 0.5 };

interface DocRow {
  id: string;
  title: string;
  path?: string;
  slug?: string;
  status?: string;
  publishedAt?: string;
}

const BUILTIN: LinkTarget[] = [
  { href: "/", title: "Startsidan", kind: "page" },
  { href: "/nyheter/", title: "Nyheter (alla)", kind: "page" },
];

export function useLinkTargets() {
  const { api } = useAdmin();
  const [targets, setTargets] = useState<LinkTarget[] | null>(null);
  useEffect(() => {
    Promise.all([api<DocRow[]>("/docs/pages"), api<DocRow[]>("/docs/posts"), api<Category[] | null>("/site/categories")])
      .then(([pages, posts, categories]) => {
        // A page at the same address replaces the built-in name.
        const byHref = new Map(BUILTIN.map((t) => [t.href, t]));
        for (const p of pages) byHref.set(p.path ? `/${p.path}/` : "/", { href: p.path ? `/${p.path}/` : "/", title: p.title, kind: "page", draft: p.status === "draft" });
        for (const c of categories ?? []) byHref.set(`/category/${c.slug}/`, { href: `/category/${c.slug}/`, title: c.name, kind: "category" });
        for (const p of posts.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))) {
          const href = `/${p.slug}/`;
          if (p.slug && !byHref.has(href)) byHref.set(href, { href, title: p.title, kind: "post", date: p.publishedAt?.slice(0, 10), draft: p.status === "draft" });
        }
        setTargets([...byHref.values()]);
      })
      .catch(() => setTargets([]));
  }, [api]);
  return targets;
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

const normalizeHref = (href: string) => (href.startsWith("/") && !href.endsWith("/") && !/[?#.]/.test(href) ? `${href}/` : href);

const isAddress = (s: string) => /^(\/|https?:\/\/|mailto:|tel:|#)/.test(s.trim());

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
  targets: LinkTarget[] | null;
  label?: string;
  /** Show a button that empties the link (for optional links). */
  clearable?: boolean;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const selected = useMemo(() => targets?.find((t) => t.href === normalizeHref(value)), [targets, value]);
  const editing = query !== null;

  const options: Option[] = useMemo(() => {
    if (!editing) return [];
    const found: Option[] = search(targets ?? [], query).map((target) => ({ target }));
    return isAddress(query) && !found.some((o) => "target" in o && o.target.href === normalizeHref(query.trim())) ? [{ address: query.trim() }, ...found] : found;
  }, [editing, targets, query]);

  const pick = (o: Option | undefined) => {
    if (o) {
      if ("target" in o) onChange(o.target.href, o.target);
      else onChange(o.address);
    }
    setQuery(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!editing) setQuery("");
      else if (options.length) setActive((a) => (a + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
    } else if (e.key === "Enter" && editing) {
      e.preventDefault();
      pick(options[active]);
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
        onFocus={(e) => {
          setQuery("");
          setActive(0);
          e.target.select();
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onBlur={() => pick(editing && isAddress(query) ? { address: query.trim() } : undefined)}
        onKeyDown={onKeyDown}
      />
      {!editing && (
        <span className="link-picker-kind" aria-hidden="true">
          {selected ? KIND_LABEL[selected.kind] : value ? (/^https?:/.test(value) ? "Extern" : "Adress") : null}
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
      {editing && options.length === 0 && targets && query && <p className="link-picker-list link-picker-empty">Inget matchar. Skriv en adress som börjar med / eller https://</p>}
    </div>
  );
}
