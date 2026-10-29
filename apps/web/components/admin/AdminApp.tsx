"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthProvider, useAdmin } from "./AuthProvider";
import { AdminLogo } from "./brand";
import { Icon, type IconName } from "./icons";
import { PreviewView } from "./PreviewFrame";
import { PageEditor, PostEditor } from "./screens/DocEditors";
import { Dashboard, PageList, PostList } from "./screens/Lists";
import { BigscreenScreen } from "./screens/Bigscreen";
import { TimelineEditor } from "./screens/Timeline";
import { BannerScreen, MediaScreen, MenuScreen, RedirectsScreen, SettingsScreen, UsersScreen } from "./screens/SiteScreens";

const NAV: { href: string; label: string; icon: IconName; admin?: boolean }[] = [
  { href: "/admin/", label: "Översikt", icon: "dashboard" },
  { href: "/admin/nyheter/", label: "Nyheter", icon: "news" },
  { href: "/admin/stjarna/", label: "Stjärnan", icon: "star" },
  { href: "/admin/sidor/", label: "Sidor", icon: "page" },
  { href: "/admin/media/", label: "Bilder & filer", icon: "image" },
  { href: "/admin/storbild/", label: "Storbild", icon: "monitor" },
  { href: "/admin/meny/", label: "Meny", icon: "menu", admin: true },
  { href: "/admin/installningar/", label: "Inställningar", icon: "settings", admin: true },
  { href: "/admin/omdirigeringar/", label: "Omdirigeringar", icon: "redirect", admin: true },
  { href: "/admin/anvandare/", label: "Användare", icon: "users", admin: true },
];

function Shell({ segs }: { segs: string[] }) {
  const { me, logout } = useAdmin();
  const [navOpen, setNavOpen] = useState(false);
  const [section, id] = segs;
  const adminOnly = ["meny", "installningar", "omdirigeringar", "anvandare"];
  let screen: React.ReactNode;
  if (adminOnly.includes(section) && me.role !== "admin") screen = <p className="admin-error">Kräver administratörsbehörighet.</p>;
  else if (section === "sidor") screen = id ? <PageEditor key={id} id={id} /> : <PageList />;
  else if (section === "nyheter") screen = id ? <PostEditor key={id} id={id} /> : <PostList />;
  else if (section === "stjarna") screen = <BannerScreen />;
  else if (section === "media") screen = <MediaScreen />;
  else if (section === "storbild") screen = id ? <TimelineEditor key={id} id={id} /> : <BigscreenScreen />;
  else if (section === "meny") screen = <MenuScreen />;
  else if (section === "installningar") screen = <SettingsScreen />;
  else if (section === "omdirigeringar") screen = <RedirectsScreen />;
  else if (section === "anvandare") screen = <UsersScreen />;
  else screen = <Dashboard />;

  // Escape closes the mobile navigation drawer.
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setNavOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  const active = `/admin/${section ? `${section}/` : ""}`;
  const items = NAV.filter((n) => !n.admin || me.role === "admin");
  const close = () => setNavOpen(false);
  const link = (n: (typeof NAV)[number]) => (
    <Link key={n.href} href={n.href} className={n.href === active ? "nav-item active" : "nav-item"} aria-current={n.href === active ? "page" : undefined} onClick={close}>
      <Icon name={n.icon} />
      <span>{n.label}</span>
    </Link>
  );
  return (
    <div className={navOpen ? "admin nav-open" : "admin"}>
      <header className="admin-topbar">
        <button type="button" className="icon-btn on-dark" onClick={() => setNavOpen(!navOpen)} aria-expanded={navOpen} aria-controls="admin-sidebar" aria-label="Meny">
          <Icon name={navOpen ? "close" : "menu"} size={22} />
        </button>
        <Link href="/admin/" className="admin-brand" aria-label="Nackswinget admin" onClick={close}>
          <AdminLogo />
          <span className="admin-brand-tag">Admin</span>
        </Link>
      </header>
      <aside id="admin-sidebar" className="admin-sidebar">
        <Link href="/admin/" className="admin-brand" aria-label="Nackswinget admin" onClick={close}>
          <AdminLogo />
          <span className="admin-brand-tag">Admin</span>
        </Link>
        <nav aria-label="Administration" className="admin-nav">
          <div className="nav-group">{items.filter((n) => !n.admin).map(link)}</div>
          {me.role === "admin" && <div className="nav-group">{items.filter((n) => n.admin).map(link)}</div>}
        </nav>
        <div className="admin-sidebar-foot">
          <a href="/" className="nav-item" target="_blank" rel="noreferrer">
            <Icon name="external" />
            <span>Webbplatsen ↗</span>
          </a>
          <div className="admin-user">
            <span className="avatar" aria-hidden="true">
              {me.email.slice(0, 1).toUpperCase()}
            </span>
            <span className="admin-user-text">
              <span className="admin-user-email" title={me.email}>
                {me.email}
              </span>
              <span className="admin-user-role">{me.role === "admin" ? "administratör" : "redaktör"}</span>
            </span>
            <button type="button" className="icon-btn on-dark" onClick={() => void logout()} title="Logga ut" aria-label="Logga ut">
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </aside>
      <div className="admin-scrim" onClick={close} aria-hidden="true" />
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
