import { PuffBadge } from "@/components/PuffBadge";
import { type Banner, bannerExpiresAt } from "@/lib/content/types";

/**
 * The "PowerPuff" star on the start page. Rendered into static HTML while
 * active; a tiny inline script hides it the moment it expires, even if the
 * cached page hasn't been regenerated yet.
 */
export function StarBanner({ banner }: { banner: Banner }) {
  const expires = bannerExpiresAt(banner).getTime();
  const starts = new Date(banner.startAt).getTime();
  return (
    <div className={`star-wrap puff-wrap-${banner.style ?? "classic"}`} id="star-banner" hidden>
      <PuffBadge banner={banner} />
      <script
        dangerouslySetInnerHTML={{
          // Shown only between start and expiry, judged by the visitor's clock.
          __html: `(function(){var b=document.getElementById("star-banner"),n=Date.now();if(b){if(n>=${starts}&&n<${expires})b.hidden=false;else b.remove()}})()`,
        }}
      />
    </div>
  );
}
