import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAdmin } from "../AuthProvider";

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
  const { me } = useAdmin();
  const tiles = [
    { href: "/admin/sidor/", title: "Sidor", text: "Redigera alla sidor på webbplatsen" },
    { href: "/admin/nyheter/", title: "Nyheter", text: "Skriv och schemalägg nyheter" },
    { href: "/admin/stjarna/", title: "Stjärnan (PowerPuff)", text: "Puffen på startsidan med utgångsdatum" },
    { href: "/admin/media/", title: "Bilder och filer", text: "Ladda upp bilder, video och PDF" },
    ...(me.role === "admin"
      ? [
          { href: "/admin/meny/", title: "Meny", text: "Huvudmenyns länkar och ordning" },
          { href: "/admin/installningar/", title: "Inställningar", text: "Sidfot, sociala medier, kalendrar" },
          { href: "/admin/omdirigeringar/", title: "Omdirigeringar", text: "Gamla adresser som skickas vidare" },
          { href: "/admin/anvandare/", title: "Användare", text: "Vem som får logga in" },
        ]
      : []),
  ];
  return (
    <div className="admin-page">
      <h1>Hej!</h1>
      <p className="muted">Inloggad som {me.email} ({me.role === "admin" ? "administratör" : "redaktör"})</p>
      <ul className="tiles">
        {tiles.map((t) => (
          <li key={t.href}>
            <Link href={t.href}>
              <strong>{t.title}</strong>
              <span>{t.text}</span>
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
      <div className="row space">
        <h1>Sidor</h1>
        <button type="button" className="button" onClick={() => router.push(`/admin/sidor/${newId("page")}/`)}>
          Ny sida
        </button>
      </div>
      <input className="search" type="search" placeholder="Filtrera…" value={q} onChange={(e) => setQ(e.target.value)} />
      {error && <p className="admin-error">{error}</p>}
      {!rows ? (
        <p>Laddar…</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Titel</th>
              <th>Adress</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/admin/sidor/${r.id}/`}>{r.title}</Link>
                </td>
                <td className="muted">/{r.path ? `${r.path}/` : ""}</td>
                <td>{r.draft ? <span className="badge">Utkast</span> : "Publicerad"}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
      <div className="row space">
        <h1>Nyheter</h1>
        <button type="button" className="button" onClick={() => router.push(`/admin/nyheter/${newId("post")}/`)}>
          Ny nyhet
        </button>
      </div>
      <input className="search" type="search" placeholder="Filtrera…" value={q} onChange={(e) => setQ(e.target.value)} />
      {error && <p className="admin-error">{error}</p>}
      {!rows ? (
        <p>Laddar…</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Rubrik</th>
              <th>Datum</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 200).map((r) => {
              const scheduled = r.publishedAt && new Date(r.publishedAt).getTime() > now;
              return (
                <tr key={r.id}>
                  <td>
                    <Link href={`/admin/nyheter/${r.id}/`}>{r.title}</Link>
                  </td>
                  <td className="muted">{r.publishedAt?.slice(0, 10)}</td>
                  <td>
                    {r.status === "draft" ? <span className="badge">Utkast</span> : scheduled ? <span className="badge">Schemalagd</span> : "Publicerad"}
                    {r.draft && <span className="badge">Ändringar</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
