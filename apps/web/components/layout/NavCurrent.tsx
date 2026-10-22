"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Marks the top-level menu item of the current section (red, like the old theme).
 * The header is static HTML shared by every page, so this runs in the browser.
 */
export function NavCurrent() {
  const path = usePathname();
  useEffect(() => {
    const items = Array.from(document.querySelectorAll<HTMLAnchorElement>(".nav-list > li > a, .nav-mobile-list > li > a"));
    const own = (a: HTMLAnchorElement) => new URL(a.href, window.location.href);
    const local = (a: HTMLAnchorElement) => own(a).origin === window.location.origin;
    // The menu that lists the page wins (Antidoping sits under /om-oss/ but in the Tävlingsdans menu);
    // otherwise the section whose address the page is under.
    const listed = items.filter((a) => local(a) && (own(a).pathname === path || Array.from(a.parentElement?.querySelectorAll<HTMLAnchorElement>(".sub-menu a") ?? []).some((s) => local(s) && own(s).pathname === path)));
    const current = listed.length ? listed : items.filter((a) => local(a) && own(a).pathname !== "/" && path.startsWith(own(a).pathname));
    for (const a of items) {
      if (current.includes(a)) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    }
  }, [path]);
  return null;
}
