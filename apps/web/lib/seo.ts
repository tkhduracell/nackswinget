import type { Metadata } from "next";
import { docToText } from "@/lib/import/html";
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
  return `/og?title=${encodeURIComponent(title)}`;
}

export function buildMetadata(opts: {
  settings: Settings;
  title: string;
  description?: string;
  path: string;
  image?: string;
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
}): Metadata {
  const { settings } = opts;
  const description = truncate((opts.description || settings.tagline).replace(/\s+/g, " ").trim(), 160);
  const url = absolute(settings, opts.path);
  const image = opts.image ? absolute(settings, opts.image.startsWith("web/") ? publicUrl(opts.image) : opts.image) : undefined;
  return {
    title: opts.title,
    description,
    alternates: {
      canonical: url,
      types: { "text/markdown": absolute(settings, `/md${opts.path === "/" ? "/index" : opts.path.replace(/\/$/, "")}.md`) },
    },
    openGraph: {
      type: opts.type ?? "website",
      url,
      title: opts.title,
      description,
      siteName: settings.siteName,
      locale: "sv_SE",
      ...(image ? { images: [{ url: image, width: 1200, height: 630, alt: opts.title }] } : {}),
      ...(opts.publishedTime ? { publishedTime: opts.publishedTime } : {}),
      ...(opts.modifiedTime ? { modifiedTime: opts.modifiedTime } : {}),
    },
    twitter: { card: "summary_large_image", title: opts.title, description, ...(image ? { images: [image] } : {}) },
  };
}

export function organizationJsonLd(settings: Settings) {
  return {
    "@context": "https://schema.org",
    "@type": "SportsClub",
    name: settings.siteName,
    url: settings.siteUrl,
    description: settings.tagline,
    sport: "Dans",
    ...(settings.logo ? { logo: publicUrl(settings.logo) } : {}),
    address: { "@type": "PostalAddress", addressLocality: "Nacka", addressCountry: "SE" },
    sameAs: [settings.social.facebook, settings.social.instagram].filter(Boolean),
  };
}

export function articleJsonLd(settings: Settings, post: PostSummary & { updatedAt?: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: post.title,
    datePublished: post.publishedAt,
    ...(post.updatedAt ? { dateModified: post.updatedAt } : {}),
    url: absolute(settings, `/${post.slug}/`),
    ...(post.image ? { image: [imageUrl(post.image.src, post.image.variants)] } : {}),
    author: { "@type": "Organization", name: settings.siteName, url: settings.siteUrl },
    publisher: {
      "@type": "Organization",
      name: settings.siteName,
      ...(settings.logo ? { logo: { "@type": "ImageObject", url: publicUrl(settings.logo) } } : {}),
    },
    description: post.excerpt,
  };
}

export function breadcrumbJsonLd(settings: Settings, crumbs: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: absolute(settings, c.path) })),
  };
}
