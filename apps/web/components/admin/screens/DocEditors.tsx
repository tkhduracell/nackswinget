import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CalendarFeed, Category, Page, Post } from "@/lib/content/types";
import { useAdmin } from "../AuthProvider";
import { MediaPicker } from "../MediaPicker";
import { PreviewPane } from "../PreviewFrame";
import { RichTextEditor } from "../RichTextEditor";
import { SectionsEditor } from "../SectionsEditor";
import { slugify, type SaveState, useDraft } from "../useDraft";
import { imageUrl } from "@/lib/media/urls";

export function useSiteBasics() {
  const { api } = useAdmin();
  const [feeds, setFeeds] = useState<CalendarFeed[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  useEffect(() => {
    api<{ calendarFeeds: CalendarFeed[] } | null>("/site/settings").then((s) => setFeeds(s?.calendarFeeds ?? [])).catch(() => {});
    api<Category[] | null>("/site/categories").then((c) => setCategories(c ?? [])).catch(() => {});
  }, [api]);
  return { feeds, categories };
}

function SaveBadge({ state, hasDraft }: { state: SaveState; hasDraft: boolean }) {
  const text = { idle: hasDraft ? "Opublicerat utkast" : "Publicerad", dirty: "Ändrad…", saving: "Sparar…", saved: hasDraft ? "Utkast sparat" : "Publicerad", error: "Kunde inte spara" }[state];
  return <span className={`save-badge ${state}`}>{text}</span>;
}

interface Version {
  versionId: string;
  savedAt: string;
  savedBy: string;
  data: unknown;
}

function Versions({ kind, id, onRestore }: { kind: "pages" | "posts"; id: string; onRestore: (data: unknown) => void }) {
  const { api } = useAdmin();
  const [list, setList] = useState<Version[] | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (open) api<Version[]>(`/docs/${kind}/${id}/versions`).then(setList).catch(() => setList([]));
  }, [api, kind, id, open]);
  return (
    <details className="versions" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>Tidigare versioner</summary>
      {list === null ? (
        <p className="muted">Laddar…</p>
      ) : list.length === 0 ? (
        <p className="muted">Inga tidigare versioner.</p>
      ) : (
        <ul>
          {list.map((v) => (
            <li key={v.versionId}>
              {new Date(v.savedAt).toLocaleString("sv-SE")} – {v.savedBy}{" "}
              <button type="button" className="link-button" onClick={() => window.confirm("Ladda in den här versionen i redigeraren? (Publiceras först när du trycker Publicera.)") && onRestore(v.data)}>
                Återställ
              </button>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

function EditorBar({ title, back, state, hasDraft, error, onPublish, onDiscard, viewHref, extra }: {
  title: string;
  back: string;
  state: SaveState;
  hasDraft: boolean;
  error: string | null;
  onPublish: () => void;
  onDiscard: () => void;
  viewHref?: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="editor-bar">
      <Link href={back} className="link-button">
        ← Tillbaka
      </Link>
      <h1>{title}</h1>
      <SaveBadge state={state} hasDraft={hasDraft} />
      {extra}
      {viewHref && (
        <a href={viewHref} target="_blank" rel="noreferrer" className="link-button">
          Visa sidan ↗
        </a>
      )}
      {hasDraft && (
        <button type="button" className="link-button" onClick={() => window.confirm("Släng utkastet och gå tillbaka till publicerad version?") && onDiscard()}>
          Släng utkast
        </button>
      )}
      <button type="button" className="button" onClick={onPublish} disabled={state === "saving"}>
        Publicera
      </button>
      {error && <p className="admin-error">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function PageEditor({ id }: { id: string }) {
  const { feeds, categories } = useSiteBasics();
  const now = useMemo(() => new Date().toISOString(), []);
  const blank = (): Page => ({ id, path: "", title: "Ny sida", parentId: null, template: "default", sections: [], seo: {}, status: "published", publishedAt: now, updatedAt: now });
  const { doc, update, published, publish, discard, state, error, hasDraft } = useDraft<Page>("pages", id, blank);

  if (!doc) return <p className="admin-loading">{error ?? "Laddar…"}</p>;
  const isHome = published?.path === "" || (!published && doc.path === "");

  return (
    <div className="editor">
      <EditorBar
        title={doc.title || "Sida"}
        back="/admin/sidor/"
        state={state}
        hasDraft={hasDraft}
        error={error}
        onPublish={() => void publish()}
        onDiscard={() => void discard()}
        viewHref={published ? (published.path ? `/${published.path}/` : "/") : undefined}
      />
      <div className="editor-split">
        <div className="editor-form">
          <label className="field">
            <span>Sidans titel</span>
            <input value={doc.title} onChange={(e) => update({ ...doc, title: e.target.value })} />
          </label>
          <label className="field">
            <span>Adress</span>
            <div className="row url-field">
              <span className="muted">nackswinget.se/</span>
              <input
                value={doc.path}
                disabled={isHome && !!published}
                placeholder={slugify(doc.title)}
                onChange={(e) => update({ ...doc, path: e.target.value.toLowerCase().replace(/[^a-z0-9/-]/g, "") })}
                onBlur={() => !doc.path && !isHome && update({ ...doc, path: slugify(doc.title) })}
              />
              <span className="muted">/</span>
            </div>
            {published && published.path !== doc.path && <small className="muted">Den gamla adressen omdirigeras automatiskt.</small>}
          </label>
          <details className="field">
            <summary>Sökmotorer och delning (SEO)</summary>
            <label className="field">
              <span>Titel i Google</span>
              <input value={doc.seo.title ?? ""} placeholder={doc.title} onChange={(e) => update({ ...doc, seo: { ...doc.seo, title: e.target.value || undefined } })} />
            </label>
            <label className="field">
              <span>Beskrivning (visas i Google och på Facebook)</span>
              <textarea rows={3} maxLength={300} value={doc.seo.description ?? ""} placeholder="Lämna tomt för att använda början av sidans text" onChange={(e) => update({ ...doc, seo: { ...doc.seo, description: e.target.value || undefined } })} />
            </label>
          </details>
          <h2 className="editor-subhead">Innehåll</h2>
          <SectionsEditor sections={doc.sections} onChange={(sections) => update({ ...doc, sections })} feeds={feeds} categories={categories} />
          {published && <Versions kind="pages" id={id} onRestore={(data) => update({ ...(data as Page), id })} />}
        </div>
        <PreviewPane message={{ type: "nsw-preview", kind: "page", data: doc }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PostEditor({ id }: { id: string }) {
  const { api } = useAdmin();
  const { categories } = useSiteBasics();
  const now = useMemo(() => new Date().toISOString(), []);
  const blank = (): Post => ({ id, slug: "", title: "", excerpt: "", body: { type: "doc", content: [] }, categories: ["foreningsnyhet"], status: "published", publishedAt: now, updatedAt: now, seo: {} });
  const { doc, update, published, publish, discard, state, error, hasDraft } = useDraft<Post>("posts", id, blank);
  const [push, setPush] = useState(false);
  const [pushResult, setPushResult] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [nowMs] = useState(() => Date.now());

  if (!doc) return <p className="admin-loading">{error ?? "Laddar…"}</p>;
  const scheduled = new Date(doc.publishedAt).getTime() > nowMs;

  const onPublish = async () => {
    const withSlug = doc.slug ? doc : { ...doc, slug: slugify(doc.title) };
    if (!withSlug.title.trim()) return window.alert("Nyheten behöver en rubrik.");
    if (withSlug !== doc) update(withSlug);
    const saved = await publish();
    if (saved && push && !scheduled && withSlug.status !== "draft") {
      try {
        await api("/push", { method: "POST" });
        setPushResult("Notis skickad till appen.");
      } catch (e) {
        setPushResult(`Notisen kunde inte skickas: ${(e as Error).message}`);
      }
    }
  };

  return (
    <div className="editor">
      <EditorBar
        title={doc.title || "Ny nyhet"}
        back="/admin/nyheter/"
        state={state}
        hasDraft={hasDraft}
        error={error ?? pushResult}
        onPublish={() => void onPublish()}
        onDiscard={() => void discard()}
        viewHref={published && !scheduled ? `/${published.slug}/` : undefined}
        extra={
          <label className="check">
            <input type="checkbox" checked={push} disabled={scheduled || doc.status === "draft"} onChange={(e) => setPush(e.target.checked)} /> Skicka notis till appen
          </label>
        }
      />
      <div className="editor-split">
        <div className="editor-form">
          <label className="field">
            <span>Rubrik</span>
            <input value={doc.title} onChange={(e) => update({ ...doc, title: e.target.value })} onBlur={() => !doc.slug && doc.title && update({ ...doc, slug: slugify(doc.title) })} />
          </label>
          <label className="field">
            <span>Adress</span>
            <div className="row url-field">
              <span className="muted">nackswinget.se/</span>
              <input value={doc.slug} onChange={(e) => update({ ...doc, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} />
              <span className="muted">/</span>
            </div>
          </label>
          <div className="row">
            <label className="field">
              <span>Status</span>
              <select value={doc.status === "draft" ? "draft" : "published"} onChange={(e) => update({ ...doc, status: e.target.value as Post["status"] })}>
                <option value="published">Publicerad</option>
                <option value="draft">Utkast (dold)</option>
              </select>
            </label>
            <label className="field">
              <span>Publiceringstid</span>
              <input type="datetime-local" value={toLocalInput(doc.publishedAt)} onChange={(e) => e.target.value && update({ ...doc, publishedAt: new Date(e.target.value).toISOString() })} />
              {scheduled && <small className="muted">Schemalagd: syns automatiskt vid den tiden.</small>}
            </label>
          </div>
          <fieldset className="field">
            <legend>Kategorier</legend>
            <div className="row wrap">
              {categories.map((c) => (
                <label key={c.slug} className="check">
                  <input
                    type="checkbox"
                    checked={doc.categories.includes(c.slug)}
                    onChange={(e) => update({ ...doc, categories: e.target.checked ? [...doc.categories, c.slug] : doc.categories.filter((x) => x !== c.slug) })}
                  />{" "}
                  {c.name}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="field">
            <span>Huvudbild</span>
            <div className="image-field">
              {doc.image?.src ? (
                // eslint-disable-next-line @next/next/no-img-element -- admin preview
                <img src={imageUrl(doc.image.src, doc.image.variants.length ? [Math.min(...doc.image.variants)] : [])} alt="" />
              ) : (
                <span className="muted">Ingen bild (en delningsbild skapas automatiskt)</span>
              )}
              <div className="row">
                <button type="button" className="button button-ghost" onClick={() => setPicking(true)}>
                  {doc.image ? "Byt bild" : "Välj bild"}
                </button>
                {doc.image && (
                  <button type="button" className="link-button" onClick={() => update({ ...doc, image: undefined })}>
                    Ta bort
                  </button>
                )}
              </div>
            </div>
          </div>
          <label className="field">
            <span>Ingress</span>
            <textarea rows={3} maxLength={300} value={doc.excerpt} onChange={(e) => update({ ...doc, excerpt: e.target.value })} placeholder="Kort sammanfattning som visas i listor och i notisen" />
          </label>
          <div className="field">
            <span>Text</span>
            <RichTextEditor value={doc.body} onChange={(body) => update({ ...doc, body })} />
          </div>
          {published && <Versions kind="posts" id={id} onRestore={(data) => update({ ...(data as Post), id })} />}
        </div>
        <PreviewPane message={{ type: "nsw-preview", kind: "post", data: doc }} />
      </div>
      {picking && (
        <MediaPicker
          accept="image"
          onClose={() => setPicking(false)}
          onPick={(m) => {
            setPicking(false);
            if (m.kind === "image") update({ ...doc, image: m.image });
          }}
        />
      )}
    </div>
  );
}
