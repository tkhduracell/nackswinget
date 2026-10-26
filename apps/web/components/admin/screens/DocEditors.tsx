import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CalendarFeed, Category, Page, Post, Settings } from "@/lib/content/types";
import { useAdmin } from "../AuthProvider";
import { MediaPicker } from "../MediaPicker";
import { PreviewPane } from "../PreviewFrame";
import { RichTextEditor } from "../RichTextEditor";
import { SectionsEditor } from "../SectionsEditor";
import { SharePreview } from "../SharePreview";
import { slugify, type SaveState, useDraft } from "../useDraft";
import { imageUrl } from "@/lib/media/urls";
import { Icon } from "../icons";

export function useSiteBasics() {
  const { api } = useAdmin();
  const [feeds, setFeeds] = useState<CalendarFeed[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    api<Settings | null>("/site/settings")
      .then((s) => {
        setFeeds(s?.calendarFeeds ?? []);
        setSettings(s);
      })
      .catch(() => {});
    api<Category[] | null>("/site/categories").then((c) => setCategories(c ?? [])).catch(() => {});
  }, [api]);
  return { feeds, categories, settings };
}

function SaveBadge({ state, hasDraft }: { state: SaveState; hasDraft: boolean }) {
  const text = { idle: hasDraft ? "Opublicerat utkast" : "Publicerad", dirty: "Ändrad…", saving: "Sparar…", saved: hasDraft ? "Utkast sparat" : "Publicerad", error: "Kunde inte spara" }[state];
  const tone = state === "error" ? "error" : state === "dirty" || state === "saving" ? "busy" : hasDraft ? "draft" : "live";
  return (
    <span className={`save-badge ${state} ${tone}`} role="status">
      <span className="save-dot" aria-hidden="true" />
      {text}
    </span>
  );
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
      <summary>
        <Icon name="history" size={16} />
        Tidigare versioner
      </summary>
      {list === null ? (
        <p className="muted">Laddar…</p>
      ) : list.length === 0 ? (
        <p className="muted">Inga tidigare versioner.</p>
      ) : (
        <ul className="versions-list">
          {list.map((v) => (
            <li key={v.versionId}>
              <span>
                {new Date(v.savedAt).toLocaleString("sv-SE")} – <span className="muted">{v.savedBy}</span>
              </span>{" "}
              <button type="button" className="button button-ghost button-sm" onClick={() => window.confirm("Ladda in den här versionen i redigeraren? (Publiceras först när du trycker Publicera.)") && onRestore(v.data)}>
                Återställ
              </button>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

function EditorBar({ title, back, state, hasDraft, error, onPublish, onDiscard, viewHref, extra, blockedReason }: {
  title: string;
  back: string;
  state: SaveState;
  hasDraft: boolean;
  error: string | null;
  onPublish: () => void;
  onDiscard: () => void;
  viewHref?: string;
  extra?: React.ReactNode;
  /** Publishing isn't possible yet: the button is greyed out and this shows on hover. */
  blockedReason?: string;
}) {
  return (
    <div className="editor-bar">
      <div className="editor-bar-main">
        <Link href={back} className="icon-btn back-btn" aria-label="Tillbaka" title="Tillbaka">
          <Icon name="back" />
          <span className="back-label">Tillbaka</span>
        </Link>
        <div className="editor-bar-title">
          <h1>{title}</h1>
          <SaveBadge state={state} hasDraft={hasDraft} />
        </div>
      </div>
      <div className="editor-actions">
        {extra && <div className="editor-extra">{extra}</div>}
        {viewHref && (
          <a href={viewHref} target="_blank" rel="noreferrer" className="button button-ghost">
            <Icon name="external" size={16} />
            <span className="hide-xs">Visa sidan ↗</span>
          </a>
        )}
        {hasDraft && (
          <button type="button" className="button button-danger-ghost" onClick={() => window.confirm("Släng utkastet och gå tillbaka till publicerad version?") && onDiscard()}>
            <Icon name="trash" size={16} />
            <span className="hide-xs">Släng utkast</span>
          </button>
        )}
        <a href="#forhandsvisning" className="button button-ghost preview-jump">
          <Icon name="eye" size={16} />
          <span className="hide-xs">Förhandsvisning</span>
        </a>
        {/* aria-disabled rather than disabled: a disabled button gets no hover, so no hint, and can't be clicked to jump to what's missing. */}
        <span className={blockedReason ? "publish-wrap has-tip" : "publish-wrap"} data-tip={blockedReason}>
          <button
            type="button"
            className={blockedReason ? "button button-blocked" : "button"}
            onClick={onPublish}
            disabled={state === "saving"}
            aria-disabled={blockedReason ? true : undefined}
            aria-describedby={blockedReason ? "publish-blocked" : undefined}
          >
            <Icon name="send" size={16} />
            Publicera
          </button>
          {blockedReason && (
            <span id="publish-blocked" className="sr-only">
              {blockedReason}
            </span>
          )}
        </span>
      </div>
      {error && <p className="admin-error">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function PageEditor({ id }: { id: string }) {
  const { feeds, categories, settings } = useSiteBasics();
  const now = useMemo(() => new Date().toISOString(), []);
  const blank = (): Page => ({ id, path: "", title: "Ny sida", parentId: null, template: "default", sections: [], seo: {}, status: "published", publishedAt: now, updatedAt: now });
  const { doc, update, published, publish, discard, state, error, hasDraft } = useDraft<Page>("pages", id, blank);

  if (!doc) return <p className="admin-loading">{error ?? "Laddar…"}</p>;
  // Only the existing start page has the empty path; new pages get a slug.
  const isHome = published?.path === "";
  const publishPage = () => {
    if (!isHome && !doc.path) return void publish({ ...doc, path: slugify(doc.title) || `sida-${id.slice(-6)}` });
    void publish();
  };

  return (
    <div className="editor">
      <EditorBar
        title={doc.title || "Sida"}
        back="/admin/sidor/"
        state={state}
        hasDraft={hasDraft}
        error={error}
        onPublish={publishPage}
        onDiscard={() => void discard()}
        viewHref={published ? (published.path ? `/${published.path}/` : "/") : undefined}
      />
      <div className="editor-split">
        <div className="editor-form">
          <div className="form-card">
          <label className="field">
            <span>Sidans titel</span>
            <input value={doc.title} onChange={(e) => update({ ...doc, title: e.target.value })} />
          </label>
          {!isHome && (
            <label className="field">
              <span>Rubrik i det röda bandet (valfri)</span>
              <input value={doc.bandTitle ?? ""} placeholder={doc.title} onChange={(e) => update({ ...doc, bandTitle: e.target.value || undefined })} />
            </label>
          )}
          {!isHome && doc.template !== "blank" && (
            <label className="field">
              <span>Utseende</span>
              <select value={doc.template} onChange={(e) => update({ ...doc, template: e.target.value as Page["template"] })}>
                <option value="default">Rött band med rubrik</option>
                <option value="plain">Bara innehållet (inget band)</option>
                <option value="sidebar">Rubrik i texten, senaste nyheterna bredvid</option>
              </select>
            </label>
          )}
          <label className="field">
            <span>Adress</span>
            <div className="url-field">
              <span className="url-prefix">nackswinget.se/</span>
              <input
                value={doc.path}
                disabled={isHome}
                placeholder={slugify(doc.title)}
                onChange={(e) => update({ ...doc, path: e.target.value.toLowerCase().replace(/[^a-z0-9/-]/g, "") })}
                onBlur={() => !doc.path && !isHome && update({ ...doc, path: slugify(doc.title) })}
              />
              <span className="url-suffix">/</span>
            </div>
            {published && published.path !== doc.path && <small className="muted">Den gamla adressen omdirigeras automatiskt.</small>}
          </label>
          <details className="field disclosure">
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
          {settings && <SharePreview settings={settings} item={{ kind: "page", doc }} />}
          </div>
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
  const { categories, settings } = useSiteBasics();
  const now = useMemo(() => new Date().toISOString(), []);
  const blank = (): Post => ({ id, slug: "", title: "", excerpt: "", body: { type: "doc", content: [] }, categories: ["foreningsnyhet"], status: "published", publishedAt: now, updatedAt: now, seo: {} });
  const { doc, update, published, publish, discard, state, error, hasDraft } = useDraft<Post>("posts", id, blank);
  const [push, setPush] = useState(false);
  const [pushResult, setPushResult] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [filling, setFilling] = useState(false);
  const [seoError, setSeoError] = useState<string | null>(null);
  const [nowMs] = useState(() => Date.now());

  if (!doc) return <p className="admin-loading">{error ?? "Laddar…"}</p>;
  const scheduled = new Date(doc.publishedAt).getTime() > nowMs;

  const autofill = async () => {
    if (!doc.title.trim()) return setSeoError("Skriv en rubrik först.");
    setFilling(true);
    setSeoError(null);
    try {
      const seo = await api<{ title: string; description: string }>("/seo-suggest", { method: "POST", json: doc });
      update({ ...doc, seo: { ...doc.seo, title: seo.title, description: seo.description, titleAuto: true } });
    } catch (e) {
      setSeoError((e as Error).message);
    } finally {
      setFilling(false);
    }
  };

  const onPublish = async () => {
    const withSlug = doc.slug ? doc : { ...doc, slug: slugify(doc.title) };
    if (!withSlug.title.trim()) return window.alert("Nyheten behöver en rubrik.");
    if (!withSlug.seo.title?.trim() || !withSlug.seo.description?.trim()) {
      setSeoError("Fyll i titel och beskrivning för Google innan du publicerar, eller tryck Autofyll.");
      document.getElementById("seo")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const saved = await publish(withSlug);
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
        blockedReason={!doc.seo.title?.trim() || !doc.seo.description?.trim() ? "Fyll i titel och beskrivning under Sökmotorer och delning (eller tryck Autofyll) för att publicera" : undefined}
        extra={
          <label className="check">
            <input type="checkbox" checked={push} disabled={scheduled || doc.status === "draft"} onChange={(e) => setPush(e.target.checked)} /> Skicka notis till appen
          </label>
        }
      />
      <div className="editor-split">
        <div className="editor-form">
          <div className="form-card">
          <label className="field">
            <span>Rubrik</span>
            <input value={doc.title} onChange={(e) => update({ ...doc, title: e.target.value })} onBlur={() => !doc.slug && doc.title && update({ ...doc, slug: slugify(doc.title) })} />
          </label>
          <label className="field">
            <span>Adress</span>
            <div className="url-field">
              <span className="url-prefix">nackswinget.se/</span>
              <input value={doc.slug} onChange={(e) => update({ ...doc, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} />
              <span className="url-suffix">/</span>
            </div>
          </label>
          <div className="field-row">
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
            <div className="chips">
              {categories.map((c) => (
                <label key={c.slug} className="check chip">
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
                <span className="image-empty">
                  <Icon name="image" size={22} />
                  <span className="muted">Ingen bild (en delningsbild skapas automatiskt)</span>
                </span>
              )}
              <div className="row">
                <button type="button" className="button button-ghost button-sm" onClick={() => setPicking(true)}>
                  <Icon name="image" size={16} />
                  {doc.image ? "Byt bild" : "Välj bild"}
                </button>
                {doc.image && (
                  <button type="button" className="button button-danger-ghost button-sm" onClick={() => update({ ...doc, image: undefined })}>
                    Ta bort
                  </button>
                )}
              </div>
            </div>
          </div>
          </div>
          <div className="form-card">
          <label className="field">
            <span>Ingress</span>
            <textarea rows={3} maxLength={300} value={doc.excerpt} onChange={(e) => update({ ...doc, excerpt: e.target.value })} placeholder="Kort sammanfattning som visas i listor och i notisen" />
          </label>
          <div className="field">
            <span>Text</span>
            <RichTextEditor value={doc.body} onChange={(body) => update({ ...doc, body })} />
          </div>
          </div>
          <div className="form-card" id="seo">
          <div className="card-head">
            <h2>Sökmotorer och delning</h2>
            <button type="button" className="button button-ghost button-sm" onClick={() => void autofill()} disabled={filling}>
              <Icon name="wand" size={16} />
              {filling ? "Skriver…" : "Autofyll"}
            </button>
          </div>
          <label className="field">
            <span>Titel i Google *</span>
            <input
              required
              maxLength={70}
              value={doc.seo.title ?? ""}
              placeholder={doc.title || "Rubriken"}
              // Typing makes it the editor's title: AI won't rewrite it.
              onChange={(e) => update({ ...doc, seo: { ...doc.seo, title: e.target.value || undefined, titleAuto: undefined } })}
            />
            <small className="muted">
              {(doc.seo.title ?? "").length}/50 tecken{doc.seo.titleAuto ? " · skriven av AI, ändra fritt" : ""}
            </small>
          </label>
          <label className="field">
            <span>Beskrivning (visas i Google och på Facebook) *</span>
            <textarea required rows={3} maxLength={300} value={doc.seo.description ?? ""} placeholder="En eller två meningar om vad nyheten handlar om" onChange={(e) => update({ ...doc, seo: { ...doc.seo, description: e.target.value || undefined } })} />
            <small className="muted">{(doc.seo.description ?? "").length}/155 tecken</small>
          </label>
          {seoError && <p className="admin-error">{seoError}</p>}
          {settings && <SharePreview settings={settings} item={{ kind: "post", doc }} />}
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
