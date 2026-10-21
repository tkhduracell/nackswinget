import type { Settings } from "@/lib/content/types";
import { publicUrl } from "@/lib/media/urls";

export function Footer({ settings }: { settings: Settings }) {
  const { footer, social } = settings;
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div>
          <p className="footer-name">{settings.siteName}</p>
          {footer.address && <p>{footer.address}</p>}
          {footer.email && (
            <p>
              <a href={`mailto:${footer.email}`}>{footer.email}</a>
            </p>
          )}
        </div>
        {footer.links.length > 0 && (
          <ul className="footer-links">
            {footer.links.map((l) => (
              <li key={l.href}>
                <a href={l.href}>{l.label}</a>
              </li>
            ))}
          </ul>
        )}
        <ul className="footer-links">
          {social.facebook && (
            <li>
              <a href={social.facebook} rel="noopener noreferrer" target="_blank">
                Facebook
              </a>
            </li>
          )}
          {social.instagram && (
            <li>
              <a href={social.instagram} rel="noopener noreferrer" target="_blank">
                Instagram
              </a>
            </li>
          )}
        </ul>
        {footer.badges.length > 0 && (
          <div className="footer-badges">
            {footer.badges.map((b) => (
              <a key={b.href} href={b.href} rel="noopener noreferrer" target="_blank">
                {/* eslint-disable-next-line @next/next/no-img-element -- small badge */}
                <img src={publicUrl(b.image)} alt={b.alt} loading="lazy" height={60} />
              </a>
            ))}
          </div>
        )}
      </div>
    </footer>
  );
}
