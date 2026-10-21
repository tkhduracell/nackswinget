"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthProvider, useAdmin } from "./AuthProvider";
import { PreviewView } from "./PreviewFrame";
import { PageEditor, PostEditor } from "./screens/DocEditors";
import { Dashboard, PageList, PostList } from "./screens/Lists";
import { BannerScreen, MediaScreen, MenuScreen, RedirectsScreen, SettingsScreen, UsersScreen } from "./screens/SiteScreens";

const NAV = [
  { href: "/admin/", label: "Översikt" },
  { href: "/admin/sidor/", label: "Sidor" },
  { href: "/admin/nyheter/", label: "Nyheter" },
  { href: "/admin/stjarna/", label: "Stjärnan" },
  { href: "/admin/media/", label: "Bilder & filer" },
  { href: "/admin/meny/", label: "Meny", admin: true },
  { href: "/admin/installningar/", label: "Inställningar", admin: true },
  { href: "/admin/omdirigeringar/", label: "Omdirigeringar", admin: true },
  { href: "/admin/anvandare/", label: "Användare", admin: true },
];

function Shell({ segs }: { segs: string[] }) {
  const { me, logout } = useAdmin();
  const [section, id] = segs;
  const adminOnly = ["meny", "installningar", "omdirigeringar", "anvandare"];
  let screen: React.ReactNode;
  if (adminOnly.includes(section) && me.role !== "admin") screen = <p className="admin-error">Kräver administratörsbehörighet.</p>;
  else if (section === "sidor") screen = id ? <PageEditor key={id} id={id} /> : <PageList />;
  else if (section === "nyheter") screen = id ? <PostEditor key={id} id={id} /> : <PostList />;
  else if (section === "stjarna") screen = <BannerScreen />;
  else if (section === "media") screen = <MediaScreen />;
  else if (section === "meny") screen = <MenuScreen />;
  else if (section === "installningar") screen = <SettingsScreen />;
  else if (section === "omdirigeringar") screen = <RedirectsScreen />;
  else if (section === "anvandare") screen = <UsersScreen />;
  else screen = <Dashboard />;

  const active = `/admin/${section ? `${section}/` : ""}`;
  return (
    <div className="admin">
      <header className="admin-header">
        <Link href="/admin/" className="admin-brand">
          Nackswinget admin
        </Link>
        <nav aria-label="Administration">
          {NAV.filter((n) => !n.admin || me.role === "admin").map((n) => (
            <Link key={n.href} href={n.href} className={n.href === active ? "active" : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
        <a href="/" className="link-button" target="_blank" rel="noreferrer">
          Webbplatsen ↗
        </a>
        <button type="button" className="link-button" onClick={() => void logout()}>
          Logga ut
        </button>
      </header>
      <main className="admin-main">{screen}</main>
    </div>
  );
}

export function AdminApp() {
  const pathname = usePathname() ?? "/admin/";
  const segs = pathname.replace(/^\/admin\/?/, "").split("/").filter(Boolean);
  // The preview iframe renders whatever the (same-origin) editor posts to it.
  if (segs[0] === "forhandsvisning") return <PreviewView />;
  return (
    <AuthProvider>
      <Shell segs={segs} />
    </AuthProvider>
  );
}
