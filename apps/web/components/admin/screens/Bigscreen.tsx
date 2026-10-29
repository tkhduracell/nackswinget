import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { PlaylistRow } from "@/lib/bigscreen/admin";
import type { Screen } from "@/lib/bigscreen/types";
import { useAdmin } from "../AuthProvider";
import { Icon } from "../icons";
import { Badge, EmptyState, LoadingRow, PageHead } from "../ui";

const ONLINE_MS = 2 * 60_000;

function ago(iso: string, now: number): string {
  const min = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "nyss";
  if (min < 60) return `${min} min sedan`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h sedan`;
  return new Date(iso).toLocaleDateString("sv-SE");
}

/** /admin/storbild/: the screens (status, playlist, reload) and the playlists. */
export function BigscreenScreen() {
  const { api, me } = useAdmin();
  const router = useRouter();
  const isAdmin = me.role === "admin";
  const [screens, setScreens] = useState<Screen[] | null>(null);
  const [playlists, setPlaylists] = useState<PlaylistRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([api<Screen[]>("/bigscreen/screens"), api<PlaylistRow[]>("/bigscreen/playlists")]);
      setScreens(s);
      setPlaylists(p);
      setNow(Date.now());
    } catch (e) {
      setError((e as Error).message);
    }
  }, [api]);

  // Status comes from the screens' heartbeats; refresh it while the page is open.
  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setError(null);
    try {
      await fn();
      if (done) setNotice(done);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const patch = (s: Screen, body: Partial<Screen>) => run(() => api(`/bigscreen/screens/${s.id}`, { method: "PATCH", json: body }));
  const newPlaylist = () =>
    run(async () => {
      const name = window.prompt("Namn på spellistan", "Ny spellista");
      if (name === null) return;
      const p = await api<{ id: string }>("/bigscreen/playlists", { method: "POST", json: { name } });
      router.push(`/admin/storbild/${p.id}/`);
    });
  const newScreen = () =>
    run(async () => {
      const name = window.prompt("Namn på skärmen", "Klubbrummet");
      if (!name || !playlists?.length) return;
      await api("/bigscreen/screens", { method: "POST", json: { name, playlistId: playlists[0].id, quality: "720", light: true } });
    }, "Skärmen är skapad. Kopiera adressen och lägg in den i piSignage.");
  const copyUrl = (s: Screen) =>
    run(async () => {
      await navigator.clipboard.writeText(`${window.location.origin}/storbild/${s.key}/`);
    }, `Adressen till ${s.name} är kopierad.`);

  return (
    <div className="admin-page">
      <PageHead
        title="Storbild"
        actions={
          <button type="button" className="button" onClick={newPlaylist}>
            <Icon name="plus" size={16} />
            Ny spellista
          </button>
        }
      >
        Det som visas på TV-skärmarna. Ändringar syns på skärmen inom en halv minut efter att du publicerat.
      </PageHead>
      {error && <p className="admin-error">{error}</p>}
      {notice && <p className="admin-notice">{notice}</p>}

      <h2 className="editor-subhead">Spellistor</h2>
      {!playlists ? (
        <LoadingRow />
      ) : playlists.length === 0 ? (
        <EmptyState icon="film">Ingen spellista ännu. Skapa en med knappen ovan.</EmptyState>
      ) : (
        <div className="table-card">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Spellista</th>
                <th className="hide-sm">Block</th>
                <th className="col-status">Status</th>
              </tr>
            </thead>
            <tbody>
              {playlists.map((p) => (
                <tr key={p.id} className="row-link">
                  <td>
                    <Link href={`/admin/storbild/${p.id}/`} className="cell-title">
                      {p.name}
                    </Link>
                  </td>
                  <td className="muted hide-sm">{p.blocks}</td>
                  <td className="col-status">{p.hasDraft ? <Badge tone="warning">Utkast</Badge> : <Badge tone="success">Publicerad</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="editor-subhead">Skärmar</h2>
      {!screens ? (
        <LoadingRow />
      ) : screens.length === 0 ? (
        <EmptyState icon="monitor">{isAdmin ? "Ingen skärm ännu." : "Ingen skärm ännu. En administratör lägger till skärmar."}</EmptyState>
      ) : (
        <ul className="bs-screens">
          {screens.map((s) => {
            const online = !!s.lastSeenAt && now - new Date(s.lastSeenAt).getTime() < ONLINE_MS;
            return (
              <li key={s.id} className="card">
                <div className="card-head">
                  <strong className="bs-screen-name">
                    <Icon name="monitor" size={18} /> {s.name}
                  </strong>
                  {online ? <Badge tone="success">På</Badge> : <Badge tone="neutral">{s.lastSeenAt ? `Senast sedd ${ago(s.lastSeenAt, now)}` : "Har inte startat"}</Badge>}
                </div>
                <div className="field-row">
                  <label className="field">
                    <span>Visar spellistan</span>
                    <select value={s.playlistId} onChange={(e) => patch(s, { playlistId: e.target.value })}>
                      {(playlists ?? []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {isAdmin && (
                    <label className="field">
                      <span>Videokvalitet</span>
                      <select value={s.quality} onChange={(e) => patch(s, { quality: e.target.value as Screen["quality"] })}>
                        <option value="720">720p (Pi Zero)</option>
                        <option value="1080">1080p</option>
                      </select>
                    </label>
                  )}
                </div>
                {isAdmin && (
                  <label className="check">
                    <input type="checkbox" checked={s.light} onChange={(e) => patch(s, { light: e.target.checked })} />
                    Lätt läge (för Pi Zero: en video i taget, videor tonar via svart)
                  </label>
                )}
                {s.resolution && <p className="muted">Skärmen: {s.resolution}</p>}
                {!!s.errors?.length && <p className="admin-error">Senaste fel: {s.errors.join(", ")}</p>}
                <div className="bs-actions">
                  <button type="button" className="button button-ghost button-sm" onClick={() => run(() => api(`/bigscreen/screens/${s.id}`, { method: "POST", json: { action: "reload" } }), `${s.name} laddas om inom en halv minut.`)}>
                    <Icon name="history" size={16} />
                    Ladda om skärmen
                  </button>
                  <a className="button button-ghost button-sm" href={`/storbild/${s.key}/`} target="_blank" rel="noreferrer">
                    <Icon name="eye" size={16} />
                    Visa
                  </a>
                  {isAdmin && (
                    <>
                      <button type="button" className="button button-ghost button-sm" onClick={() => copyUrl(s)}>
                        <Icon name="link" size={16} />
                        Kopiera adress
                      </button>
                      <button
                        type="button"
                        className="button button-danger-ghost button-sm"
                        onClick={() => window.confirm("Ny adress? Den gamla slutar fungera, och piSignage måste få den nya.") && run(() => api(`/bigscreen/screens/${s.id}`, { method: "POST", json: { action: "rotate" } }), "Ny adress skapad. Kopiera den och byt i piSignage.")}
                      >
                        Ny adress
                      </button>
                      <button type="button" className="button button-danger-ghost button-sm" onClick={() => window.confirm(`Ta bort ${s.name}?`) && run(() => api(`/bigscreen/screens/${s.id}`, { method: "DELETE" }))}>
                        <Icon name="trash" size={16} />
                        Ta bort
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {isAdmin && (
        <div className="form-actions">
          <button type="button" className="button button-ghost" onClick={newScreen} disabled={!playlists?.length}>
            <Icon name="plus" size={16} />
            Ny skärm
          </button>
        </div>
      )}
    </div>
  );
}
