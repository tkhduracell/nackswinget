import type { MetadataRoute } from "next";
import { getSite, listAllPosts, listPages } from "@/lib/content/cached";
import { absolute } from "@/lib/seo";

// Google ignores priority/changefreq; lastmod is what it uses, so keep it accurate.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ settings, categories }, pages, posts] = await Promise.all([getSite(), listPages(), listAllPosts()]);
  const used = new Set(posts.flatMap((p) => p.categories));
  return [
    ...pages
      .filter((p) => p.template !== "blank")
      .map((p) => ({ url: absolute(settings, p.path ? `/${p.path}/` : "/"), lastModified: p.updatedAt })),
    ...posts.map((p) => ({ url: absolute(settings, `/${p.slug}/`), lastModified: p.updatedAt || p.publishedAt })),
    // Empty categories 404, so only list the ones with posts.
    ...categories.filter((c) => used.has(c.slug)).map((c) => ({ url: absolute(settings, `/category/${c.slug}/`) })),
  ];
}
