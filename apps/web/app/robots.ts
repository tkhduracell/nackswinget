import type { MetadataRoute } from "next";

const SITE = "https://nackswinget.se";

export default function robots(): MetadataRoute.Robots {
  if (process.env.SITE_INDEXABLE !== "true") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/"] },
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
