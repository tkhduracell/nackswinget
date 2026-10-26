import type { Metadata } from "next";
import { docToText } from "@/lib/import/html";
import type { CalendarEvent } from "@/lib/calendar/ics";
import type { Page, PostSummary, Section, Settings } from "@/lib/content/types";
import { imageUrl, publicUrl } from "@/lib/media/urls";
import { truncate } from "@/lib/format";

export function absolute(settings: Settings, path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${settings.siteUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

/** First meaningful text of a section list (for descriptions). */
export function sectionsText(sections: Section[]): string {
  const parts: string[] = [];
  const walk = (list: Section[]) => {
    for (const s of list) {
      if (s.type === "richText") parts.push(docToText(s.doc));
      else if (s.type === "hero") parts.push([s.title, s.subtitle].filter(Boolean).join(". "));
      else if (s.type === "columns") s.columns.forEach((c) => walk(c.sections));
    }
  };
  walk(sections);
  return parts.join("\n\n").trim();
}

export function pageUrl(page: Page): string {
  return page.path ? `/${page.path}/` : "/";
}

export function ogImageFor(title: string, image?: { src: string; variants: number[] }): string {
  if (image) return imageUrl(image.src, image.variants);
  return `/og/?title=${encodeURIComponent(title)}`;
}

export function buildMetadata(opts: {
  settings: Settings;
  title: string;
  description?: string;
  path: string;
  image?: string;
  /** False for routes without a /md/ twin (archives). */
  markdown?: boolean;
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
}): Metadata {
  const { settings } = opts;
  const description = truncate((opts.description || settings.tagline).replace(/\s+/g, " ").trim(), 160);
  const url = absolute(settings, opts.path);
  const raw = opts.image ?? ogImageFor(opts.title);
  const image = absolute(settings, raw.startsWith("web/") ? publicUrl(raw) : raw);
  // The generated card is the only image whose size we know.
  const size = image.includes("/og/?") ? { width: 1200, height: 630 } : {};
  return {
    title: opts.title,
    description,
    alternates: {
      canonical: url,
      // Replaces the root layout's alternates (shallow merge), so the feed is repeated here.
      types: {
        "application/rss+xml": absolute(settings, "/feed/"),
        ...(opts.markdown === false ? {} : { "text/markdown": absolute(settings, `/md${opts.path === "/" ? "/index" : opts.path.replace(/\/$/, "")}.md`) }),
      },
    },
    openGraph: {
      type: opts.type ?? "website",
      url,
      title: opts.title,
      description,
      siteName: settings.siteName,
      locale: "sv_SE",
      images: [{ url: image, ...size, alt: opts.title }],
      ...(opts.publishedTime ? { publishedTime: opts.publishedTime } : {}),
      ...(opts.modifiedTime ? { modifiedTime: opts.modifiedTime } : {}),
    },
    twitter: { card: "summary_large_image", title: opts.title, description, images: [image] },
  };
}

/** Serializes JSON-LD for a <script> tag; `<` is escaped so data can't close the tag. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

/** Where the club trains and holds its events. */
export const VENUE = {
  name: "Ceylon",
  streetAddress: "Fredrik Jahns gränd 16",
  postalCode: "131 36",
  addressLocality: "Nacka",
  addressRegion: "Stockholms län",
  addressCountry: "SE",
};

type SiteRef = Pick<Settings, "siteUrl" | "siteName">;

const base = (site: SiteRef) => site.siteUrl.replace(/\/$/, "");
export const orgId = (site: SiteRef) => `${base(site)}/#organization`;
const venueId = (site: SiteRef) => `${base(site)}/#venue`;

function postalAddress() {
  const { streetAddress, postalCode, addressLocality, addressRegion, addressCountry } = VENUE;
  return { "@type": "PostalAddress", streetAddress, postalCode, addressLocality, addressRegion, addressCountry };
}

function venuePlace(site: SiteRef) {
  return { "@type": "Place", "@id": venueId(site), name: VENUE.name, address: postalAddress() };
}

/** Club, venue and website, emitted once per page by the site layout. */
export function siteJsonLd(settings: Settings) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SportsClub",
        "@id": orgId(settings),
        name: settings.siteName,
        alternateName: "Nackswinget",
        url: `${base(settings)}/`,
        description: settings.tagline,
        ...(settings.logo ? { logo: publicUrl(settings.logo), image: publicUrl(settings.logo) } : {}),
        address: postalAddress(),
        location: { "@id": venueId(settings) },
        ...(settings.footer.email ? { email: settings.footer.email } : {}),
        ...(settings.orgNumber ? { taxID: settings.orgNumber } : {}),
        sameAs: [settings.social.facebook, settings.social.instagram].filter(Boolean),
      },
      venuePlace(settings),
      {
        "@type": "WebSite",
        "@id": `${base(settings)}/#website`,
        url: `${base(settings)}/`,
        name: settings.siteName,
        alternateName: "Nackswinget",
        inLanguage: "sv-SE",
        publisher: { "@id": orgId(settings) },
      },
    ],
  };
}

export function articleJsonLd(settings: Settings, post: PostSummary) {
  const url = absolute(settings, `/${post.slug}/`);
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: post.title,
    datePublished: post.publishedAt,
    ...(post.updatedAt && post.updatedAt !== post.publishedAt ? { dateModified: post.updatedAt } : {}),
    url,
    mainEntityOfPage: url,
    inLanguage: "sv-SE",
    // Google requires an image for article rich results; fall back to the generated card.
    image: [post.image ? imageUrl(post.image.src, post.image.variants) : absolute(settings, ogImageFor(post.title))],
    author: { "@type": "Organization", "@id": orgId(settings), name: settings.siteName, url: settings.siteUrl },
    publisher: { "@type": "Organization", "@id": orgId(settings), name: settings.siteName },
    ...(post.excerpt ? { description: post.excerpt } : {}),
  };
}

const offsetFormat = new Intl.DateTimeFormat("en", { timeZone: "Europe/Stockholm", timeZoneName: "longOffset" });

/** Stockholm's UTC offset in minutes at an instant. */
function offsetMinutesAt(ms: number): number {
  const name = offsetFormat.formatToParts(new Date(ms)).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = /([+-])(\d\d):(\d\d)/.exec(name);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

/** UTC offset ("+01:00"/"+02:00") of a Stockholm wall time "YYYY-MM-DDTHH:mm". */
export function stockholmOffset(wall: string): string {
  const asUtc = Date.parse(`${wall.slice(0, 16)}:00Z`);
  // Guess with the offset at the UTC reading, then settle on the offset at the real instant.
  const guess = offsetMinutesAt(asUtc);
  const mins = offsetMinutesAt(asUtc - guess * 60_000);
  const abs = Math.abs(mins);
  return `${mins < 0 ? "-" : "+"}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

const eventDate = (wall: string, allDay: boolean) => (allDay ? wall : `${wall}:00${stockholmOffset(wall)}`);

/**
 * Feeds holding public, club-organised events. Course slots, member training
 * and other clubs' competitions are not events Google should list for us.
 */
export const PUBLIC_EVENT_FEEDS = new Set(["event"]);

export function eventsJsonLd(site: SiteRef, events: CalendarEvent[]) {
  return events
    .filter((e) => PUBLIC_EVENT_FEEDS.has(e.feed))
    .map((e) => {
      const atVenue = !e.location || /ceylon|fredrik jahns/i.test(e.location);
      return {
        "@context": "https://schema.org",
        "@type": "Event",
        name: e.title,
        startDate: eventDate(e.start, e.allDay),
        ...(e.end ? { endDate: eventDate(e.end, e.allDay) } : {}),
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        eventStatus: "https://schema.org/EventScheduled",
        location: atVenue ? venuePlace(site) : { "@type": "Place", name: e.location, address: e.location },
        organizer: { "@type": "SportsClub", "@id": orgId(site), name: site.siteName, url: site.siteUrl },
        ...(e.description ? { description: truncate(e.description.replace(/\s+/g, " ").trim(), 300) } : {}),
        url: e.url || `${base(site)}/kalender/`,
      };
    });
}

export function breadcrumbJsonLd(settings: Settings, crumbs: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: absolute(settings, c.path) })),
  };
}
