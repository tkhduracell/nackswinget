import type { Page, Post, Settings } from "@/lib/content/types";
import { publicUrl } from "@/lib/media/urls";
import { metaDescription, shareCard } from "@/lib/seo";

/**
 * How the page or post looks when shared on Facebook: the link card built
 * from the same og: tags the site emits (lib/seo.ts shareCard), so what you
 * see here is what Facebook gets after publishing.
 */
export function SharePreview({ settings, item }: { settings: Settings; item: { kind: "page"; doc: Page } | { kind: "post"; doc: Post } }) {
  const card = shareCard(settings, item);
  // Relative /og/ cards render from this site; Storage paths need the bucket URL.
  const image = card.image.startsWith("web/") ? publicUrl(card.image) : card.image;
  const host = new URL(settings.siteUrl).host.toUpperCase();
  return (
    <figure className="share-preview" aria-label="Förhandsvisning av delning på Facebook">
      <figcaption className="share-preview-label">Så ser det ut när någon delar länken på Facebook</figcaption>
      <div className="fb-card">
        {/* eslint-disable-next-line @next/next/no-img-element -- admin preview of an external/og image */}
        <img className="fb-card-image" src={image} alt="" />
        <div className="fb-card-body">
          <span className="fb-card-host">{host}</span>
          <span className="fb-card-title">{card.title}</span>
          <span className="fb-card-desc">{metaDescription(settings, card.description)}</span>
        </div>
      </div>
    </figure>
  );
}
