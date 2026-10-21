import type { MetadataRoute } from "next";
import { getSite, listAllPosts, listPages } from "@/lib/content/cached";
import { absolute } from "@/lib/seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ settings, categories }, pages, posts] = await Promise.all([getSite(), listPages(), listAllPosts()]);
  return [
    ...pages
      .filter((p) => p.template !== "blank")
      .map((p) => ({
        url: absolute(settings, p.path ? `/${p.path}/` : "/"),
        lastModified: p.updatedAt,
        changeFrequency: "weekly" as const,
        priority: p.path ? 0.7 : 1,
      })),
    ...posts.map((p) => ({ url: absolute(settings, `/${p.slug}/`), lastModified: p.publishedAt, priority: 0.5 })),
    ...categories.map((c) => ({ url: absolute(settings, `/category/${c.slug}/`), changeFrequency: "weekly" as const, priority: 0.3 })),
  ];
}
