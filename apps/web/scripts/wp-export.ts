// One-time (re-runnable) export of nackswinget.se from the public WordPress
// REST API into content/snapshot.json. Reads public endpoints only: no WP
// credentials, no Google credentials. Upload with scripts/import-snapshot.ts.
//
//   pnpm tsx scripts/wp-export.ts [--out content/snapshot.json]

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseHTML } from "linkedom";
import type { Banner, ImageAttrs, NavItem, Page, Post, Redirect, Section, Settings, Snapshot } from "../lib/content/types";
import { snapshotSchema } from "../lib/content/types";
import { contentToSections } from "../lib/import/divi";
import { docToText, htmlElementToDoc } from "../lib/import/html";
import { isRaster, publicUrl, variantWidthsFor, wpUploadPath } from "../lib/media/urls";

const SITE = "https://nackswinget.se";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const out = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "content/snapshot.json";

// The host's bot protection challenges bursts; keep requests slow.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function get(url: string): Promise<Response> {
  for (let attempt = 0; attempt < 4; attempt++) {
    await sleep(1200);
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json,text/html" } });
    const ct = res.headers.get("content-type") ?? "";
    if (res.ok && !(ct.includes("text/html") && url.includes("/wp-json/"))) return res;
    console.warn(`  retry ${attempt + 1} ${res.status} ${url}`);
    await sleep(5000 * (attempt + 1));
  }
  throw new Error(`failed: ${url}`);
}
async function getAll<T>(endpoint: string): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; ; page++) {
    const sep = endpoint.includes("?") ? "&" : "?";
    const res = await get(`${SITE}/wp-json/wp/v2/${endpoint}${sep}per_page=100&page=${page}`);
    items.push(...((await res.json()) as T[]));
    if (page >= Number(res.headers.get("x-wp-totalpages") ?? 1)) return items;
  }
}

interface WpRendered { rendered: string }
interface WpPage { id: number; slug: string; link: string; parent: number; title: WpRendered; content: WpRendered; date_gmt: string; modified_gmt: string; template: string; status: string }
interface WpPost extends WpPage { excerpt: WpRendered; categories: number[]; tags: number[]; featured_media: number }
interface WpTerm { id: number; slug: string; name: string; count: number }
interface WpMedia { id: number; source_url: string; alt_text: string; media_details?: { width?: number; height?: number } }

const report: string[] = [];

function decode(html: string): string {
  const { document } = parseHTML(`<!doctype html><html><body><div>${html}</div></body></html>`);
  return (document.querySelector("div")?.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** "https://nackswinget.se/wp-content/uploads/2022/11/a-300x200.png" -> "2022/11/a.png" */
function uploadRelative(url: string): string | null {
  const m = url.match(/\/wp-content\/uploads\/(.+?)(?:\?.*)?$/);
  if (!m) return null;
  return decodeURIComponent(m[1]).replace(/-\d+x\d+(\.[a-z0-9]+)$/i, "$1").replace(/-scaled(\.[a-z0-9]+)$/i, "$1");
}

async function main() {
  console.log("Fetching WordPress content...");
  const [pagesRaw, postsRaw, cats, tags, media] = [
    await getAll<WpPage>("pages?_fields=id,slug,link,parent,title,content,date_gmt,modified_gmt,template,status"),
    await getAll<WpPost>("posts?_fields=id,slug,link,parent,title,content,excerpt,date_gmt,modified_gmt,categories,tags,featured_media,status"),
    await getAll<WpTerm>("categories?_fields=id,slug,name,count"),
    await getAll<WpTerm>("tags?_fields=id,slug,name,count"),
    await getAll<WpMedia>("media?_fields=id,source_url,alt_text,media_details"),
  ];
  console.log(`  ${pagesRaw.length} pages, ${postsRaw.length} posts, ${cats.length} categories, ${tags.length} tags, ${media.length} media`);

  const homeHtml = await (await get(`${SITE}/`)).text();

  // --- media ----------------------------------------------------------------
  const mediaByRel = new Map<string, WpMedia>();
  const mediaById = new Map<number, WpMedia>();
  for (const m of media) {
    mediaById.set(m.id, m);
    const rel = uploadRelative(m.source_url);
    if (rel) mediaByRel.set(rel, m);
  }
  const referenced = new Set<string>(mediaByRel.keys());

  function imageFor(src: string, alt: string, width?: number, height?: number): ImageAttrs | null {
    const rel = uploadRelative(src);
    if (!rel) {
      if (/^https?:\/\//.test(src)) report.push(`external image kept as link only: ${src}`);
      return null;
    }
    referenced.add(rel);
    const m = mediaByRel.get(rel);
    const w = m?.media_details?.width ?? width;
    const h = m?.media_details?.height ?? height;
    const storagePath = wpUploadPath(rel);
    return {
      src: storagePath,
      alt: alt || m?.alt_text || "",
      ...(w ? { width: w } : {}),
      ...(h ? { height: h } : {}),
      variants: isRaster(rel) && !/\.gif$/i.test(rel) ? variantWidthsFor(w) : [],
    };
  }

  function rewriteHref(href: string): string {
    const h = href.trim();
    if (!h || h.startsWith("#") || h.startsWith("mailto:") || h.startsWith("tel:")) return h;
    const rel = uploadRelative(h);
    if (rel && /nackswinget\.se|^\/wp-content/.test(h)) {
      referenced.add(rel);
      return publicUrl(wpUploadPath(rel));
    }
    try {
      const u = new URL(h, SITE);
      if (u.hostname === "nackswinget.se" || u.hostname === "www.nackswinget.se") {
        let p = u.pathname;
        if (p === "/hem-2/" || p === "/hem-2") p = "/";
        return p + u.search + u.hash;
      }
      if (/www4\.idrottonline\.se/.test(u.hostname)) report.push(`legacy IdrottOnline link: ${h}`);
      return u.toString();
    } catch {
      report.push(`unparseable href: ${h}`);
      return h;
    }
  }

  // --- categories -----------------------------------------------------------
  const catById = new Map(cats.map((c) => [c.id, c]));
  const categories = cats.filter((c) => c.count > 0 && c.slug !== "uncategorized").map((c) => ({ slug: c.slug, name: decode(c.name) }));

  // --- calendar feeds (from the ICS Calendar shortcodes) ---------------------
  const CAL = "https://storage.googleapis.com/nackswinget-af7ef.appspot.com";
  const calendarFeeds: Settings["calendarFeeds"] = [
    { key: "huvud", name: "Huvudkalender", color: "#F397D7", url: `${CAL}/cal_333077.ics` },
    { key: "kurs", name: "Kurskalender", color: "#F7BA79", url: `${CAL}/cal_333892.ics` },
    { key: "tavlingskalender", name: "Tävlingskalender", color: "#71B2DD", url: `${CAL}/cal_358978.ics` },
    { key: "event", name: "Eventkalender", color: "#FC7184", url: `${CAL}/cal_358979.ics` },
    { key: "fritraning", name: "Friträning", color: "#9DD6B4", url: `${CAL}/cal_337667.ics` },
    { key: "tavlingar", name: "Tävlingar", color: "#C2ADDD", url: `${CAL}/dans.se_competitions_all.ics` },
  ];
  const club = ["huvud", "kurs", "tavlingskalender", "event", "fritraning"];
  const calendarConfig: Record<string, Extract<Section, { type: "calendar" }>> = {
    "hem-2": { type: "calendar", title: "På gång", feeds: club, hiddenByDefault: [], view: "list", pastDays: 0, count: 6, showLegend: false },
    kalender: { type: "calendar", feeds: [...club, "tavlingar"], hiddenByDefault: ["tavlingar"], view: "month", pastDays: 90, showLegend: true },
    "kalender-for-tv": { type: "calendar", feeds: [...club, "tavlingar"], hiddenByDefault: [], view: "week", pastDays: 0, showLegend: true },
    "medlemstraning-2": {
      type: "calendar",
      feeds: [...club, "tavlingar"],
      hiddenByDefault: ["huvud", "kurs", "tavlingskalender", "event", "tavlingar"],
      view: "month",
      pastDays: 90,
      showLegend: true,
    },
    medlemstraningar: { type: "calendar", feeds: ["fritraning"], hiddenByDefault: [], view: "month", pastDays: 90, showLegend: true },
  };

  const banners: Banner[] = [];

  const bandTitles = new Map<string, string>();
  function convertContent(html: string, slug: string, kind: "page" | "post"): Section[] {
    const { document } = parseHTML(`<!doctype html><html><body><div id="root">${html}</div></body></html>`);
    const root = document.getElementById("root")!;
    return contentToSections(root, {
      rewriteHref,
      resolveImage: imageFor,
      flag: (reason) => report.push(`${kind} ${slug}: ${reason}`),
      calendar: (i) => (i === 0 ? (calendarConfig[slug] ?? null) : null),
      postListCategory: (articles) => {
        const sets = articles.map((a) => new Set((a.getAttribute("class") ?? "").split(/\s+/).filter((c) => c.startsWith("category-")).map((c) => c.slice(9))));
        if (sets.length < 2) return undefined;
        const common = [...sets[0]].filter((c) => sets.every((s) => s.has(c)));
        // A list where every post shares a non-default category is a filtered list.
        return common.find((c) => c !== "foreningsnyhet") ?? undefined;
      },
      banner: (text) => {
        if (text) banners.push({ text: text.slice(0, 120), startAt: "2026-10-10T00:00:00.000Z", days: 6 });
      },
      bandTitle: (text) => {
        if (text) bandTitles.set(slug, text);
      },
    });
  }

  // The REST API's rendered content lacks Divi's builder layout, so pages are
  // read from their public HTML instead (the theme renders the full layout).
  async function pageBodyHtml(p: WpPage): Promise<string> {
    const html = p.slug === "hem-2" ? homeHtml : await (await get(p.link)).text();
    const { document } = parseHTML(html);
    const body = document.querySelector(".entry-content") ?? document.querySelector("#et-boc .et-l--post");
    if (!body) {
      report.push(`page ${p.slug}: no .entry-content, using REST content`);
      return p.content.rendered;
    }
    // Sections Divi gives a background colour (inline CSS), e.g. the red title band.
    const css = Array.from(document.querySelectorAll("style"), (s) => s.textContent ?? "").join("\n");
    for (const m of css.matchAll(/\.et_pb_section_(\d+)(?:\.et_pb_section)?\{[^}]*background-color:\s*([^;!}]+)/gi)) {
      body.querySelector(`.et_pb_section_${m[1]}`)?.setAttribute("data-bg", m[2].trim());
    }
    return body.innerHTML;
  }

  // --- pages ----------------------------------------------------------------
  const redirects: Redirect[] = [];
  const pages: Page[] = [];
  for (const p of pagesRaw.filter((x) => x.status === "publish")) {
    const url = new URL(p.link);
    let pathName = url.pathname.replace(/^\/|\/$/g, "");
    if (p.slug === "hem-2") {
      pathName = "";
      redirects.push({ from: "hem-2", to: "/", status: 308 });
    }
    if (p.slug === "boka") {
      const m = p.content.rendered.match(/https:\/\/europe-north1-nackswinget-af7ef\.cloudfunctions\.net\/[^"'\s<]+/);
      redirects.push({ from: "boka", to: m ? m[0] : "https://europe-north1-nackswinget-af7ef.cloudfunctions.net/calendars-api/book", status: 308 });
      continue;
    }
    const title = decode(p.title.rendered);
    const sections: Section[] =
      p.slug === "nyheter" ? [{ type: "postList", count: 12, showMore: true }] : convertContent(await pageBodyHtml(p), p.slug, "page");
    const band = bandTitles.get(p.slug);
    pages.push({
      id: `wp-page-${p.id}`,
      path: pathName,
      title,
      // Only when the band said something other than the title.
      ...(band && band.toLowerCase() !== title.toLowerCase() ? { bandTitle: band } : {}),
      parentId: p.parent ? `wp-page-${p.parent}` : null,
      template: p.slug === "kalender-for-tv" || p.template.includes("blank") ? "blank" : "default",
      sections,
      seo: {},
      status: "published",
      publishedAt: `${p.date_gmt}Z`,
      updatedAt: `${p.modified_gmt}Z`,
      legacyId: p.id,
    });
  }

  // --- posts ----------------------------------------------------------------
  const posts: Post[] = [];
  for (const p of postsRaw.filter((x) => x.status === "publish")) {
    const { document } = parseHTML(`<!doctype html><html><body><div id="root">${p.content.rendered}</div></body></html>`);
    const root = document.getElementById("root")!;
    const body = htmlElementToDoc(root, {
      rewriteHref,
      resolveImage: imageFor,
      flag: (reason) => report.push(`post ${p.slug}: ${reason}`),
    });
    // dans.se widgets inside posts: keep a plain link (widgets are a page section).
    const fm = p.featured_media ? mediaById.get(p.featured_media) : undefined;
    const image = fm ? imageFor(fm.source_url, fm.alt_text) ?? undefined : undefined;
    const excerpt = decode(p.excerpt.rendered).replace(/\s*(\[(…|&hellip;|\.\.\.)\]|…)\s*$/, "").slice(0, 300) || docToText(body).slice(0, 200);
    posts.push({
      id: `wp-post-${p.id}`,
      slug: p.slug,
      title: decode(p.title.rendered),
      excerpt,
      body,
      categories: p.categories.map((id) => catById.get(id)?.slug).filter((s): s is string => !!s && s !== "uncategorized"),
      ...(image ? { image } : {}),
      status: "published",
      publishedAt: `${p.date_gmt}Z`,
      updatedAt: `${p.modified_gmt}Z`,
      seo: {},
      legacyId: p.id,
    });
  }

  // --- redirects: tags -> category or news ------------------------------------
  const catSlugs = new Set(categories.map((c) => c.slug));
  for (const t of tags) {
    const target = catSlugs.has(t.slug) ? `/category/${t.slug}/` : "/nyheter/";
    redirects.push({ from: `tag/${t.slug}`, to: target, status: 308 });
  }

  // --- navigation (from the live header menu) ----------------------------------
  const { document: home } = parseHTML(homeHtml);
  const nav: NavItem[] = Array.from(home.querySelectorAll("#top-menu > li")).map((li) => {
    const a = li.querySelector(":scope > a")!;
    return {
      label: decode(a.innerHTML),
      href: rewriteHref(a.getAttribute("href") ?? "/"),
      children: Array.from(li.querySelectorAll(":scope > ul > li > a")).map((c) => ({
        label: decode(c.innerHTML),
        href: rewriteHref(c.getAttribute("href") ?? "/"),
      })),
    };
  });

  const logoSrc = home.querySelector("#logo")?.getAttribute("src") ?? "";
  const logoRel = uploadRelative(logoSrc);
  if (logoRel) referenced.add(logoRel);
  const settings: Settings = {
    siteName: "Dansklubben Nackswinget",
    tagline: "Danskurser och socialdans med bugg & fox i Stockholm/Nacka",
    siteUrl: SITE,
    social: { facebook: "https://www.facebook.com/nackswinget", instagram: "https://www.instagram.com/nackswinget/" },
    footer: {
      address: "Dansklubben Nackswinget, Nacka",
      email: "",
      links: [
        { label: "Bli medlem", href: "/bli-medlem/" },
        { label: "Kontakt", href: "/kontakt/" },
        { label: "Webshop", href: "https://nackswinget.webshop.pgm.nu" },
        { label: "Integritetspolicy", href: "/privacy-policy/" },
      ],
      badges: [],
    },
    calendarFeeds,
    ...(logoRel ? { logo: wpUploadPath(logoRel) } : {}),
  };

  const snapshot: Snapshot = snapshotSchema.parse({
    generatedAt: new Date().toISOString(),
    pages,
    posts,
    categories,
    nav,
    settings,
    banners,
    redirects,
    media: [...referenced].sort(),
  });

  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(snapshot, null, 1));
  await writeFile(out.replace(/\.json$/, ".report.txt"), [...new Set(report)].join("\n") + "\n");
  console.log(`Wrote ${out}: ${pages.length} pages, ${posts.length} posts, ${snapshot.media.length} media, ${redirects.length} redirects, ${report.length} report lines`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
