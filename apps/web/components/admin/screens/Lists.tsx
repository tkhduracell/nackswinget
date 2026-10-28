import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAdmin } from "../AuthProvider";
import { Icon, type IconName } from "../icons";
import { Badge, EmptyState, LoadingRow, PageHead, SearchInput } from "../ui";

interface Row {
  id: string;
  title: string;
  path?: string;
  slug?: string;
  status?: string;
  publishedAt?: string;
  updatedAt?: string;
  draft: { updatedAt: string; updatedBy: string } | null;
}

function useRows(kind: "pages" | "posts") {
  const { api } = useAdmin();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Row[]>(`/docs/${kind}`).then(setRows).catch((e: Error) => setError(e.message));
  }, [api, kind]);
  return { rows, error };
}

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function Dashboard() {
  const { me, logout } = useAdmin();
  const tiles: { href: string; title: string; text: string; icon: IconName }[] = [
    { href: "/admin/nyheter/", title: "Nyheter", text: "Skriv och schemalägg nyheter", icon: "news" },
    { href: "/admin/stjarna/", title: "Stjärnan (PowerPuff)", text: "Puffen på startsidan med utgångsdatum", icon: "star" },
    { href: "/admin/sidor/", title: "Sidor", text: "Redigera alla sidor på webbplatsen", icon: "page" },
    { href: "/admin/media/", title: "Bilder och filer", text: "Ladda upp bilder, video och PDF", icon: "image" },
    ...(me.role === "admin"
      ? ([
          { href: "/admin/meny/", title: "Meny", text: "Huvudmenyns länkar och ordning", icon: "menu" },
          { href: "/admin/installningar/", title: "Inställningar", text: "Sidfot, sociala medier, kalendrar", icon: "settings" },
          { href: "/admin/omdirigeringar/", title: "Omdirigeringar", text: "Gamla adresser som skickas vidare", icon: "redirect" },
          { href: "/admin/anvandare/", title: "Användare", text: "Vem som får logga in", icon: "users" },
        ] as const)
      : []),
  ];
  return (
    <div className="admin-page">
      <div className="dash-hero">
        <div>
          <h1>Hej!</h1>
          <p className="page-head-desc">
            Inloggad som <strong>{me.email}</strong> <Badge tone={me.role === "admin" ? "accent" : "neutral"}>{me.role === "admin" ? "administratör" : "redaktör"}</Badge>
          </p>
        </div>
        <button type="button" className="button button-ghost" onClick={() => void logout()}>
          <Icon name="logout" size={16} />
          Logga ut
        </button>
      </div>
      <ul className="tiles">
        {tiles.map((t) => (
          <li key={t.href}>
            <Link href={t.href}>
              <span className="tile-icon">
                <Icon name={t.icon} size={20} />
              </span>
              <span className="tile-text">
                <strong>{t.title}</strong>
                <span>{t.text}</span>
              </span>
              <Icon name="right" size={18} className="icon tile-arrow" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PageList() {
  const { rows, error } = useRows("pages");
  const router = useRouter();
  const [q, setQ] = useState("");
  const sorted = useMemo(() => (rows ?? []).filter((r) => `${r.title} ${r.path}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => (a.path ?? "").localeCompare(b.path ?? "")), [rows, q]);
  return (
    <div className="admin-page">
      <PageHead
        title="Sidor"
        actions={
          <button type="button" className="button" onClick={() => router.push(`/admin/sidor/${newId("page")}/`)}>
            <Icon name="plus" size={16} />
            Ny sida
          </button>
        }
      />
      <div className="list-toolbar">
        <SearchInput value={q} onChange={setQ} />
        {rows && <span className="list-count">{sorted.length}</span>}
      </div>
      {error && <p className="admin-error">{error}</p>}
      {!rows ? (
        <LoadingRow />
      ) : sorted.length === 0 ? (
        <EmptyState icon="page">{q ? "Inget matchar filtret." : "Inga sidor ännu."}</EmptyState>
      ) : (
        <div className="table-card">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Titel</th>
                <th className="hide-sm">Adress</th>
                <th className="col-status">Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} className="row-link">
                  <td>
                    <Link href={`/admin/sidor/${r.id}/`} className="cell-title">
                      {r.title}
                    </Link>
                    <span className="cell-sub show-sm">/{r.path ? `${r.path}/` : ""}</span>
                  </td>
                  <td className="muted mono hide-sm">/{r.path ? `${r.path}/` : ""}</td>
                  <td className="col-status">{r.draft ? <Badge tone="warning">Utkast</Badge> : <Badge tone="success">Publicerad</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function PostList() {
  const { rows, error } = useRows("posts");
  const router = useRouter();
  const [q, setQ] = useState("");
  const [now] = useState(() => Date.now());
  const sorted = useMemo(
    () => (rows ?? []).filter((r) => r.title.toLowerCase().includes(q.toLowerCase())).sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "")),
    [rows, q],
  );
  return (
    <div className="admin-page">
      <PageHead
        title="Nyheter"
        actions={
          <button type="button" className="button" onClick={() => router.push(`/admin/nyheter/${newId("post")}/`)}>
            <Icon name="plus" size={16} />
            Ny nyhet
          </button>
        }
      />
      <div className="list-toolbar">
        <SearchInput value={q} onChange={setQ} />
        {rows && <span className="list-count">{sorted.length}</span>}
      </div>
      {error && <p className="admin-error">{error}</p>}
      {!rows ? (
        <LoadingRow />
      ) : sorted.length === 0 ? (
        <EmptyState icon="news">{q ? "Inget matchar filtret." : "Inga nyheter ännu."}</EmptyState>
      ) : (
        <div className="table-card">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Rubrik</th>
                <th className="hide-sm">Datum</th>
                <th className="col-status">Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 200).map((r) => {
                const scheduled = r.publishedAt && new Date(r.publishedAt).getTime() > now;
                return (
                  <tr key={r.id} className="row-link">
                    <td>
                      <Link href={`/admin/nyheter/${r.id}/`} className="cell-title">
                        {r.title}
                      </Link>
                      <span className="cell-sub show-sm">{r.publishedAt?.slice(0, 10)}</span>
                    </td>
                    <td className="muted nowrap hide-sm">{r.publishedAt?.slice(0, 10)}</td>
                    <td className="col-status">
                      <span className="badges">
                        {r.status === "draft" ? <Badge tone="warning">Utkast</Badge> : scheduled ? <Badge tone="info">Schemalagd</Badge> : <Badge tone="success">Publicerad</Badge>}
                        {r.draft && <Badge tone="accent">Ändringar</Badge>}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
