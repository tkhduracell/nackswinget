import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { archivePageCount, PostArchive } from "@/components/views/PostArchive";
import { getSite } from "@/lib/content/cached";
import { buildMetadata } from "@/lib/seo";

// /category/<slug>/ and /category/<slug>/sida/<n>/ (also old WP /page/<n>/).
type Params = { slug: string; rest?: string[] };

function pageNumber(rest: string[] | undefined): number | null {
  if (!rest || rest.length === 0) return 1;
  if (rest.length === 2 && (rest[0] === "sida" || rest[0] === "page")) {
    const n = Number(rest[1]);
    return Number.isInteger(n) && n >= 1 ? n : null;
  }
  return null;
}

// Every known path is prerendered via generateStaticParams; anything else is a
// redirect or 404, so blocking (instead of a streamed shell) is fine here.
export const instant = false;

export async function generateStaticParams(): Promise<Params[]> {
  try {
    const { categories } = await getSite();
    const out: Params[] = [];
    for (const c of categories) {
      out.push({ slug: c.slug, rest: [] });
      const n = await archivePageCount(c.slug);
      for (let i = 2; i <= n; i++) out.push({ slug: c.slug, rest: ["sida", String(i)] });
    }
    return out.length ? out : [{ slug: "foreningsnyhet", rest: [] }];
  } catch {
    return [{ slug: "foreningsnyhet", rest: [] }];
  }
}

async function load(params: Params) {
  const { categories } = await getSite();
  const category = categories.find((c) => c.slug === decodeURIComponent(params.slug));
  const page = pageNumber(params.rest);
  if (!category || !page) return null;
  if (page > (await archivePageCount(category.slug))) return null;
  return { category, page };
}

export async function generateMetadata({ params }: PageProps<"/category/[slug]/[[...rest]]">): Promise<Metadata> {
  const found = await load(await params);
  if (!found) return {};
  const { settings } = await getSite();
  const suffix = found.page > 1 ? ` – sida ${found.page}` : "";
  return buildMetadata({
    settings,
    title: `${found.category.name}${suffix}`,
    description: `Nyheter i kategorin ${found.category.name} från ${settings.siteName}.`,
    path: `/category/${found.category.slug}/${found.page > 1 ? `sida/${found.page}/` : ""}`,
  });
}

export default async function CategoryPage({ params }: PageProps<"/category/[slug]/[[...rest]]">) {
  const found = await load(await params);
  if (!found) notFound();
  return <PostArchive title={found.category.name} category={found.category.slug} page={found.page} basePath={`/category/${found.category.slug}/`} />;
}
