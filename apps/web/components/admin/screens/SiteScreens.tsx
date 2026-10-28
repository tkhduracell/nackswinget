import { useCallback, useEffect, useState } from "react";
import type { MediaDoc } from "@/lib/admin/media";
import { PuffBadge } from "@/components/PuffBadge";
import { type Banner, bannerExpiresAt, type CalendarFeed, type NavItem, PUFF_STYLES, type PuffStyle, type Redirect, type Settings } from "@/lib/content/types";
import { publicUrl } from "@/lib/media/urls";
import { useAdmin } from "../AuthProvider";
import { MediaThumb } from "../MediaPicker";
import { Icon } from "../icons";
import { uploadFile } from "../upload";
import { Badge, EmptyState, LoadingRow, PageHead } from "../ui";

function useSiteDoc<T>(name: string) {
  const { api } = useAdmin();
  const [value, setValue] = useState<T | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => {
    api<T | null>(`/site/${name}`).then((v) => setValue(v)).catch((e: Error) => setStatus(e.message));
  }, [api, name]);
  const save = async (v: T) => {
    setStatus("Sparar…");
    try {
      setValue(await api<T>(`/site/${name}`, { method: "PUT", json: v }));
      setStatus("Sparat och publicerat.");
    } catch (e) {
      setStatus((e as Error).message);
    }
  };
  return { value, setValue, save, status };
}

function Status({ text }: { text: string | null }) {
  return text ? <p className={/Sparat|klart/i.test(text) ? "admin-ok" : "admin-status"}>{text}</p> : null;
}

// ---------------------------------------------------------------------------
// Star banner ("Joy's PowerPuff")

function toDateInput(iso: string) {
  return iso.slice(0, 10);
}

const PUFF_STYLE_LABELS: Record<PuffStyle, string> = {
  classic: "Klassisk stjärna",
  starburst: "Röd stjärnsmäll",
  ring: "Snurrande textring",
  ticket: "Biljett",
  seal: "Guldsigill (40 år)",
  tape: "Tejp med rullande text",
};

export function BannerScreen() {
  const { value, setValue, save, status } = useSiteDoc<Banner[]>("banners");
  const list = value ?? [];
  const [now] = useState(() => Date.now());
  const set = (i: number, b: Banner) => setValue(list.map((x, j) => (j === i ? b : x)));
  return (
    <div className="admin-page narrow">
      <PageHead title="Stjärnan på startsidan">Puffen visas från startdatum i det antal dagar du anger och försvinner sedan av sig själv. Lägg gärna in nästa puff i förväg.</PageHead>
      {value !== null && list.length === 0 && <EmptyState icon="star">Ingen puff ännu.</EmptyState>}
      {list.map((b, i) => {
        const expires = bannerExpiresAt(b);
        const start = new Date(b.startAt).getTime();
        const state = now < start ? `Visas från ${toDateInput(b.startAt)}` : now < expires.getTime() ? `Visas nu – ${Math.ceil((expires.getTime() - now) / 86_400_000)} dagar kvar` : "Har gått ut";
        const tone = now < start ? "info" : now < expires.getTime() ? "success" : "neutral";
        return (
          <div key={i} className="card">
            <div className="card-head">
              <Badge tone={tone}>{state}</Badge>
              <button type="button" className="button button-danger-ghost button-sm" onClick={() => setValue(list.filter((_, j) => j !== i))}>
                <Icon name="trash" size={16} />
                Ta bort
              </button>
            </div>
            <div className={`star-preview star-preview-${b.style ?? "classic"}`} aria-label="Förhandsvisning">
              <div className={`star-wrap puff-wrap-${b.style ?? "classic"}`}>
                <PuffBadge banner={{ ...b, text: b.text || "…", href: undefined }} id={`puff-${i}`} />
              </div>
            </div>
            <fieldset className="field puff-styles">
              <legend>Utseende</legend>
              {PUFF_STYLES.map((style) => (
                <label key={style} className="puff-style-option">
                  <input type="radio" name={`puff-style-${i}`} checked={(b.style ?? "classic") === style} onChange={() => set(i, { ...b, style: style === "classic" ? undefined : style })} />
                  {PUFF_STYLE_LABELS[style]}
                </label>
              ))}
            </fieldset>
            <label className="field">
              <span>Text ({b.text.length}/120)</span>
              <textarea rows={2} maxLength={120} value={b.text} onChange={(e) => set(i, { ...b, text: e.target.value })} />
            </label>
            <label className="field">
              <span>Länk (valfri)</span>
              <input value={b.href ?? ""} placeholder="/nackswingets-40-ars-jubileum/" onChange={(e) => set(i, { ...b, href: e.target.value || undefined })} />
            </label>
            <div className="field-row">
              <label className="field">
                <span>Startdatum</span>
                <input type="date" value={toDateInput(b.startAt)} onChange={(e) => e.target.value && set(i, { ...b, startAt: new Date(`${e.target.value}T00:00:00`).toISOString() })} />
              </label>
              <label className="field">
                <span>Antal dagar</span>
                <input type="number" min={0} max={365} value={b.days} onChange={(e) => set(i, { ...b, days: Math.max(0, Math.min(365, Number(e.target.value) || 0)) })} />
              </label>
            </div>
            <p className="muted card-foot">Slutar visas: {expires.toLocaleDateString("sv-SE")}</p>
          </div>
        );
      })}
      <div className="form-actions">
        <button type="button" className="button button-ghost" onClick={() => setValue([...list, { text: "", startAt: new Date(new Date().toDateString()).toISOString(), days: 7 }])}>
          <Icon name="plus" size={16} />
          Ny puff
        </button>
        <button type="button" className="button" onClick={() => save(list.filter((b) => b.text.trim()))}>
          Spara
        </button>
      </div>
      <Status text={status} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Menu

export function MenuScreen() {
  const { value, setValue, save, status } = useSiteDoc<NavItem[]>("nav");
  const items = value ?? [];
  const move = <T,>(arr: T[], i: number, d: number) => {
    const next = [...arr];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    return next;
  };
  const set = (i: number, item: NavItem) => setValue(items.map((x, j) => (j === i ? item : x)));
  return (
    <div className="admin-page narrow">
      <PageHead title="Meny">Två nivåer: huvudmenyn och en undermeny under varje punkt.</PageHead>
      {items.map((item, i) => (
        <div key={i} className="card menu-card">
          <div className="row menu-row">
            <input value={item.label} onChange={(e) => set(i, { ...item, label: e.target.value })} aria-label="Text" />
            <input value={item.href} onChange={(e) => set(i, { ...item, href: e.target.value })} aria-label="Länk" />
            <div className="list-actions">
              <button type="button" disabled={i === 0} onClick={() => setValue(move(items, i, -1))} aria-label="Flytta upp">
                <Icon name="up" size={16} />
              </button>
              <button type="button" disabled={i === items.length - 1} onClick={() => setValue(move(items, i, 1))} aria-label="Flytta ner">
                <Icon name="down" size={16} />
              </button>
              <button type="button" onClick={() => setValue(items.filter((_, j) => j !== i))} aria-label="Ta bort">
                <Icon name="close" size={16} />
              </button>
            </div>
          </div>
          <div className="submenu">
            {item.children.map((c, k) => (
              <div key={k} className="row menu-row">
                <span className="submenu-mark" aria-hidden="true" />
                <input value={c.label} onChange={(e) => set(i, { ...item, children: item.children.map((x, m) => (m === k ? { ...x, label: e.target.value } : x)) })} aria-label="Text" />
                <input value={c.href} onChange={(e) => set(i, { ...item, children: item.children.map((x, m) => (m === k ? { ...x, href: e.target.value } : x)) })} aria-label="Länk" />
                <div className="list-actions">
                  <button type="button" disabled={k === 0} onClick={() => set(i, { ...item, children: move(item.children, k, -1) })} aria-label="Flytta upp">
                <Icon name="up" size={16} />
              </button>
                  <button type="button" disabled={k === item.children.length - 1} onClick={() => set(i, { ...item, children: move(item.children, k, 1) })} aria-label="Flytta ner">
                <Icon name="down" size={16} />
              </button>
                  <button type="button" onClick={() => set(i, { ...item, children: item.children.filter((_, m) => m !== k) })} aria-label="Ta bort">
                <Icon name="close" size={16} />
              </button>
                </div>
              </div>
            ))}
            <button type="button" className="button button-ghost button-sm add-row" onClick={() => set(i, { ...item, children: [...item.children, { label: "Ny länk", href: "/" }] })}>
              <Icon name="plus" size={16} />
              Undermeny
            </button>
          </div>
        </div>
      ))}
      <div className="form-actions">
        <button type="button" className="button button-ghost" onClick={() => setValue([...items, { label: "Ny punkt", href: "/", children: [] }])}>
          <Icon name="plus" size={16} />
          Ny menypunkt
        </button>
        <button type="button" className="button" onClick={() => save(items)}>
          Spara
        </button>
      </div>
      <Status text={status} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings

export function SettingsScreen() {
  const { value, setValue, save, status } = useSiteDoc<Settings>("settings");
  if (!value) return status ? <p className="admin-error">{status}</p> : <LoadingRow />;
  const s = value;
  const setFeed = (i: number, f: CalendarFeed) => setValue({ ...s, calendarFeeds: s.calendarFeeds.map((x, j) => (j === i ? f : x)) });
  return (
    <div className="admin-page narrow">
      <PageHead title="Inställningar" />
      <div className="card">
        <h2>Allmänt</h2>
        <label className="field">
          <span>Föreningens namn</span>
          <input value={s.siteName} onChange={(e) => setValue({ ...s, siteName: e.target.value })} />
        </label>
        <label className="field">
          <span>Kort beskrivning (används i Google)</span>
          <input value={s.tagline} onChange={(e) => setValue({ ...s, tagline: e.target.value })} />
        </label>
      </div>
      <div className="card">
        <h2>Sidfot och sociala medier</h2>
        <label className="field">
          <span>Adress</span>
          <input value={s.footer.address} onChange={(e) => setValue({ ...s, footer: { ...s.footer, address: e.target.value } })} />
        </label>
        <label className="field">
          <span>E-post</span>
          <input value={s.footer.email} onChange={(e) => setValue({ ...s, footer: { ...s.footer, email: e.target.value } })} />
        </label>
        <label className="field">
          <span>Facebook</span>
          <input value={s.social.facebook ?? ""} onChange={(e) => setValue({ ...s, social: { ...s.social, facebook: e.target.value || undefined } })} />
        </label>
        <label className="field">
          <span>Instagram</span>
          <input value={s.social.instagram ?? ""} onChange={(e) => setValue({ ...s, social: { ...s.social, instagram: e.target.value || undefined } })} />
        </label>
        <fieldset className="field">
          <legend>Snabblänkar i sidfoten</legend>
          {s.footer.links.map((l, i) => (
            <div key={i} className="row menu-row">
              <input value={l.label} onChange={(e) => setValue({ ...s, footer: { ...s.footer, links: s.footer.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) } })} aria-label="Text" />
              <input value={l.href} onChange={(e) => setValue({ ...s, footer: { ...s.footer, links: s.footer.links.map((x, j) => (j === i ? { ...x, href: e.target.value } : x)) } })} aria-label="Länk" />
              <button type="button" className="button button-danger-ghost button-sm" onClick={() => setValue({ ...s, footer: { ...s.footer, links: s.footer.links.filter((_, j) => j !== i) } })}>
                <Icon name="trash" size={16} />
                <span className="hide-xs">Ta bort</span>
              </button>
            </div>
          ))}
          <button type="button" className="button button-ghost button-sm add-row" onClick={() => setValue({ ...s, footer: { ...s.footer, links: [...s.footer.links, { label: "Ny länk", href: "/" }] } })}>
            <Icon name="plus" size={16} />
            Länk
          </button>
        </fieldset>
      </div>
      <div className="card">
        <h2>Kalendrar</h2>
        <p className="muted">Kalenderflöden (ICS) som visas i kalendersektionerna. Uppdateras var 5:e minut.</p>
        {s.calendarFeeds.map((f, i) => (
          <div key={f.key} className="row feed-row">
            <input type="color" value={f.color} onChange={(e) => setFeed(i, { ...f, color: e.target.value })} aria-label="Färg" />
            <input value={f.name} onChange={(e) => setFeed(i, { ...f, name: e.target.value })} aria-label="Namn" />
            <input value={f.url} onChange={(e) => setFeed(i, { ...f, url: e.target.value })} aria-label="Adress" className="grow" />
          </div>
        ))}
      </div>
      <div className="form-actions">
        <button type="button" className="button" onClick={() => save(s)}>
          Spara
        </button>
      </div>
      <Status text={status} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Redirects

export function RedirectsScreen() {
  const { api } = useAdmin();
  const [list, setList] = useState<Redirect[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => {
    api<Redirect[]>("/redirects").then(setList).catch((e: Error) => setStatus(e.message));
  }, [api]);
  if (!list) return status ? <p className="admin-error">{status}</p> : <LoadingRow />;
  const set = (i: number, r: Redirect) => setList(list.map((x, j) => (j === i ? r : x)));
  return (
    <div className="admin-page narrow">
      <PageHead title="Omdirigeringar">Gamla adresser som skickas vidare. Skapas automatiskt när en sida eller nyhet byter adress.</PageHead>
      {list.length === 0 ? (
        <EmptyState icon="redirect">Inga omdirigeringar ännu.</EmptyState>
      ) : (
      <div className="table-card">
      <table className="admin-table edit-table">
        <thead>
          <tr>
            <th>Från (nackswinget.se/…)</th>
            <th>Till</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {list.map((r, i) => (
            <tr key={i}>
              <td>
                <input value={r.from} onChange={(e) => set(i, { ...r, from: e.target.value })} aria-label="Från" />
              </td>
              <td>
                <input value={r.to} onChange={(e) => set(i, { ...r, to: e.target.value })} aria-label="Till" />
              </td>
              <td className="col-actions">
                <button type="button" className="icon-btn danger" onClick={() => setList(list.filter((_, j) => j !== i))} aria-label="Ta bort" title="Ta bort">
                  <Icon name="trash" size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      )}
      <div className="form-actions">
        <button type="button" className="button button-ghost" onClick={() => setList([...list, { from: "", to: "/", status: 308 }])}>
          <Icon name="plus" size={16} />
          Ny omdirigering
        </button>
        <button
          type="button"
          className="button"
          onClick={async () => {
            setStatus("Sparar…");
            try {
              setList(await api<Redirect[]>("/redirects", { method: "PUT", json: list.filter((r) => r.from.trim()) }));
              setStatus("Sparat och publicerat.");
            } catch (e) {
              setStatus((e as Error).message);
            }
          }}
        >
          Spara
        </button>
      </div>
      <Status text={status} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Users

interface UserRow {
  email: string;
  name?: string;
  role: "admin" | "editor";
  active?: boolean;
}

interface AuditRow {
  at: string;
  who: string;
  action: string;
  email: string;
  role: string;
}

const ROLE_LABEL: Record<string, string> = { admin: "administratör", editor: "redaktör" };

function auditText(a: AuditRow) {
  const role = ROLE_LABEL[a.role] ?? a.role;
  if (a.action === "create") return <>lade till <b>{a.email}</b> som {role}</>;
  if (a.action === "delete") return <>tog bort <b>{a.email}</b></>;
  return <>satte <b>{a.email}</b> till {role}</>;
}

function UserAudit({ rows }: { rows: AuditRow[] | null }) {
  if (!rows || rows.length === 0) return null;
  return (
    <section className="card user-audit">
      <h2>Ändringslogg</h2>
      <ul>
        {rows.map((a, i) => (
          <li key={`${a.at}-${i}`}>
            <time dateTime={a.at} className="muted">
              {new Date(a.at).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}
            </time>
            <span>
              {a.who} {auditText(a)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function UsersScreen() {
  const { api, me } = useAdmin();
  const [list, setList] = useState<UserRow[] | null>(null);
  const [draft, setDraft] = useState<UserRow>({ email: "", name: "", role: "editor" });
  const [status, setStatus] = useState<string | null>(null);
  const [auditRows, setAuditRows] = useState<AuditRow[] | null>(null);
  const load = useCallback(
    () =>
      Promise.all([api<UserRow[]>("/users").then(setList), api<AuditRow[]>("/users/audit").then(setAuditRows)]).catch((e: Error) =>
        setStatus(e.message),
      ),
    [api],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const put = async (u: UserRow) => {
    try {
      await api("/users", { method: "PUT", json: u });
      setStatus("Sparat.");
      await load();
    } catch (e) {
      setStatus((e as Error).message);
    }
  };
  return (
    <div className="admin-page narrow">
      <PageHead title="Användare">De här e-postadresserna kan logga in med en inloggningslänk. Redaktörer redigerar sidor, nyheter, bilder och stjärnan; administratörer även meny, inställningar och användare.</PageHead>
      {!list && !status && <LoadingRow />}
      {list && list.length === 0 && <EmptyState icon="users">Inga användare ännu.</EmptyState>}
      {list && list.length > 0 && (
        <div className="table-card">
        <table className="admin-table users-table">
          <thead>
            <tr>
              <th>E-post</th>
              <th className="hide-sm">Namn</th>
              <th>Roll</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.email}>
                <td>
                  <span className="user-cell">
                    <span className="avatar" aria-hidden="true">
                      {u.email.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="user-cell-text">
                      <span className="cell-title">{u.email}</span>
                      {u.name && <span className="cell-sub show-sm">{u.name}</span>}
                    </span>
                  </span>
                </td>
                <td className="hide-sm">{u.name}</td>
                <td>
                  <select value={u.role} onChange={(e) => put({ ...u, role: e.target.value as UserRow["role"] })} disabled={u.email === me.email}>
                    <option value="editor">Redaktör</option>
                    <option value="admin">Administratör</option>
                  </select>
                </td>
                <td className="col-actions">
                  {u.email !== me.email && (
                    <button
                      type="button"
                      className="icon-btn danger"
                      aria-label="Ta bort"
                      title="Ta bort"
                      onClick={async () => {
                        if (!window.confirm(`Ta bort ${u.email}?`)) return;
                        await api(`/users?email=${encodeURIComponent(u.email)}`, { method: "DELETE" });
                        await load();
                      }}
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      <form
        className="card add-user"
        onSubmit={(e) => {
          e.preventDefault();
          void put(draft).then(() => setDraft({ email: "", name: "", role: "editor" }));
        }}
      >
        <input type="email" required placeholder="E-post" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
        <input placeholder="Namn" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as UserRow["role"] })}>
          <option value="editor">Redaktör</option>
          <option value="admin">Administratör</option>
        </select>
        <button className="button">
          <Icon name="plus" size={16} />
          Lägg till
        </button>
      </form>
      <Status text={status} />
      <UserAudit rows={auditRows} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Media library

export function MediaScreen() {
  const { api } = useAdmin();
  const [items, setItems] = useState<MediaDoc[] | null>(null);
  const [uploads, setUploads] = useState<{ name: string; progress: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const load = useCallback(() => api<MediaDoc[]>("/media").then(setItems).catch((e: Error) => setError(e.message)), [api]);
  useEffect(() => {
    void load();
  }, [load]);

  // Poll videos that are still being converted.
  useEffect(() => {
    const processing = (items ?? []).filter((m) => m.status === "processing");
    if (processing.length === 0) return;
    const t = setInterval(async () => {
      const updated = await Promise.all(processing.map((m) => api<MediaDoc>(`/media/${m.id}`).catch(() => m)));
      if (updated.some((u, i) => u.status !== processing[i].status)) void load();
    }, 10_000);
    return () => clearInterval(t);
  }, [items, api, load]);

  const onFiles = async (files: FileList | File[]) => {
    setError(null);
    for (const file of Array.from(files)) {
      setUploads((u) => [...u, { name: file.name, progress: 0 }]);
      try {
        await uploadFile(api, file, (p) => setUploads((u) => u.map((x) => (x.name === file.name ? { ...x, progress: p } : x))));
      } catch (e) {
        setError(`${file.name}: ${(e as Error).message}`);
      }
      setUploads((u) => u.filter((x) => x.name !== file.name));
    }
    await load();
  };

  return (
    <div className="admin-page">
      <PageHead title="Bilder och filer">{items && `${items.length} filer`}</PageHead>
      <label
        className={dragging ? "upload-drop big dragging" : "upload-drop big"}
        onDragOver={(e) => {
          e.preventDefault();
          if (!dragging) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void onFiles(e.dataTransfer.files);
        }}
      >
        <input type="file" multiple onChange={(e) => e.target.files && onFiles(e.target.files)} />
        <span className="upload-icon">
          <Icon name="upload" size={24} />
        </span>
        <span>Släpp filer här eller klicka för att välja. Bilder skalas om automatiskt; videor konverteras för webben (kan ta några minuter).</span>
      </label>
      {uploads.length > 0 && (
        <ul className="upload-list">
          {uploads.map((u) => (
            <li key={u.name}>
              <span className="upload-name">
                {u.name}: {Math.round(u.progress * 100)} %
              </span>
              <span className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(u.progress * 100)} aria-label={u.name}>
                <span style={{ width: `${Math.round(u.progress * 100)}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="admin-error">{error}</p>}
      {!items ? (
        <LoadingRow />
      ) : items.length === 0 ? (
        <EmptyState icon="image">Inga filer ännu.</EmptyState>
      ) : (
        <ul className="media-grid big">
          {items.map((m) => (
            <li key={m.id}>
              <div className="media-thumb">
                <MediaThumb m={m} />
                {m.kind !== "image" && <span className="media-kind">{m.kind === "video" ? "Video" : m.name.split(".").pop()?.toUpperCase()}</span>}
              </div>
              <div className="media-info">
                <span className="media-name" title={m.name}>
                  {m.name}
                </span>
                {m.status === "ready" ? (
                  <span className="muted">{`${(m.size / 1024 / 1024).toFixed(1)} MB`}</span>
                ) : m.status === "processing" ? (
                  <Badge tone="warning">
                    <span className="spinner sm" aria-hidden="true" />
                    Konverteras…
                  </Badge>
                ) : m.status === "error" ? (
                  <Badge tone="danger">{`Fel: ${m.error ?? ""}`}</Badge>
                ) : (
                  <Badge tone="info">Laddas upp…</Badge>
                )}
                {m.kind === "image" && (
                  <input
                    defaultValue={m.alt}
                    placeholder="Alternativtext"
                    onBlur={(e) => e.target.value !== m.alt && api(`/media/${m.id}`, { method: "PATCH", json: { alt: e.target.value } })}
                    aria-label={`Alternativtext för ${m.name}`}
                  />
                )}
              </div>
              <div className="media-actions">
                {m.status === "ready" && (
                  <button type="button" className="button button-ghost button-sm" onClick={() => navigator.clipboard?.writeText(publicUrl(m.kind === "video" && m.renditions ? m.renditions.src720 : m.path))}>
                    <Icon name="link" size={15} />
                    Kopiera länk
                  </button>
                )}
                <button
                  type="button"
                  className="button button-danger-ghost button-sm"
                  onClick={async () => {
                    if (!window.confirm(`Ta bort ${m.name}? (Kan återställas inom 30 dagar.)`)) return;
                    await api(`/media/${m.id}`, { method: "DELETE" });
                    await load();
                  }}
                >
                  <Icon name="trash" size={15} />
                  Ta bort
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
