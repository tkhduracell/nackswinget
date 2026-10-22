import Link from "next/link";
import type { NavItem } from "@/lib/content/types";
import { publicUrl, variantPath } from "@/lib/media/urls";
import { SearchButton } from "@/components/search/SearchButton";
import { NavCurrent } from "./NavCurrent";

function NavLinks({ items, mobile }: { items: NavItem[]; mobile?: boolean }) {
  return (
    <ul className={mobile ? "nav-mobile-list" : "nav-list"}>
      {items.map((item) => (
        <li key={item.href + item.label} className={item.children.length ? "has-children" : undefined}>
          <a href={item.href}>{item.label}</a>
          {item.children.length > 0 && (
            <ul className="sub-menu">
              {item.children.map((c) => (
                <li key={c.href + c.label}>
                  <a href={c.href}>{c.label}</a>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

/** The 40th anniversary (16/1 2027): a gold shimmer line under the header until the end of January. */
const JUBILEE_UNTIL = Date.parse("2027-02-01T00:00:00+01:00");

/** Pure HTML/CSS navigation: hover/focus dropdowns on desktop, <details> menu on mobile. */
export function Header({ nav, logo, siteName }: { nav: NavItem[]; logo?: string; siteName: string }) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="logo" aria-label={`${siteName} – startsida`} prefetch={false}>
          {logo ? (
            // 480w WebP variant (~5 KB) instead of the 35 KB PNG original.
            // eslint-disable-next-line @next/next/no-img-element -- small static logo
            <img src={publicUrl(/\.(png|jpe?g)$/i.test(logo) ? variantPath(logo, 480) : logo)} alt={siteName} width={210} height={42} decoding="async" />
          ) : (
            <span>{siteName}</span>
          )}
        </Link>
        <nav className="nav-desktop" aria-label="Huvudmeny">
          <NavLinks items={nav} />
        </nav>
        <NavCurrent />
        <SearchButton />
        <details className="nav-mobile">
          <summary aria-label="Meny">
            <span className="burger" aria-hidden="true" />
          </summary>
          <nav aria-label="Huvudmeny (mobil)">
            <NavLinks items={nav} mobile />
          </nav>
        </details>
      </div>
      <div className="gold-line" id="gold-line" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      {/* The header is static HTML; the visitor's clock retires the line after the anniversary. */}
      <script dangerouslySetInnerHTML={{ __html: `Date.now()>=${JUBILEE_UNTIL}&&document.getElementById("gold-line")?.remove()` }} />
    </header>
  );
}
