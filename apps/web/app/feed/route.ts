import { getSite, listPosts } from "@/lib/content/cached";
import { imageUrl } from "@/lib/media/urls";
import { absolute } from "@/lib/seo";

// RSS 2.0, compatible with the old WordPress /feed/:
// - Mailchimp RSS campaigns read it.
// - functions/news-api reads /feed?cat=-5 (WordPress category ids, "-" excludes)
//   and dereferences media:thumbnail, so every item carries one.

const LEGACY_CATEGORY_IDS: Record<string, string> = {
  "5": "tavling",
  "6": "foreningsnyhet",
  "8": "event",
  "9": "medlemstraning",
  "10": "kurs",
  "11": "socialdans",
  "29": "reklam",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function categoryFilter(cat: string | null): (categories: string[]) => boolean {
  if (!cat) return () => true;
  const include = new Set<string>();
  const exclude = new Set<string>();
  for (const part of cat.split(",")) {
    const id = part.trim().replace(/^-/, "");
    const slug = LEGACY_CATEGORY_IDS[id] ?? id;
    (part.trim().startsWith("-") ? exclude : include).add(slug);
  }
  return (cats) => !cats.some((c) => exclude.has(c)) && (include.size === 0 || cats.some((c) => include.has(c)));
}

export async function GET(req: Request) {
  const keep = categoryFilter(new URL(req.url).searchParams.get("cat"));
  const [{ settings, categories }, { posts: recent }] = await Promise.all([getSite(), listPosts(undefined, 40)]);
  const posts = recent.filter((p) => keep(p.categories)).slice(0, 20);
  const catName = new Map(categories.map((c) => [c.slug, c.name]));
  const items = posts
    .map((p) => {
      const url = absolute(settings, `/${p.slug}/`);
      const img = p.image ? imageUrl(p.image.src, p.image.variants) : absolute(settings, `/og/?title=${encodeURIComponent(p.title)}`);
      return `<item>
<title>${esc(p.title)}</title>
<link>${url}</link>
<guid isPermaLink="true">${url}</guid>
<pubDate>${new Date(p.publishedAt).toUTCString()}</pubDate>
${p.categories.map((c) => `<category>${esc(catName.get(c) ?? c)}</category>`).join("")}
<description>${esc(p.excerpt)}</description>
<media:content url="${esc(img)}" medium="image"/>
<media:thumbnail url="${esc(img)}"/>
</item>`;
    })
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
<channel>
<title>${esc(settings.siteName)}</title>
<link>${settings.siteUrl}</link>
<atom:link href="${absolute(settings, "/feed/")}" rel="self" type="application/rss+xml"/>
<description>${esc(settings.tagline)}</description>
<language>sv-SE</language>
${posts[0] ? `<lastBuildDate>${new Date(posts[0].publishedAt).toUTCString()}</lastBuildDate>` : ""}
${items}
</channel>
</rss>`;
  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8", "X-Robots-Tag": "noindex", "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
  });
}
