import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { archivePageCount, PostArchive } from "@/components/views/PostArchive";
import { getSite, listPosts } from "@/lib/content/cached";
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
      if (!(await hasPosts(c.slug))) continue;
      out.push({ slug: c.slug, rest: [] });
      const n = await archivePageCount(c.slug);
      for (let i = 2; i <= n; i++) out.push({ slug: c.slug, rest: ["sida", String(i)] });
    }
    return out.length ? out : [{ slug: "foreningsnyhet", rest: [] }];
  } catch {
    return [{ slug: "foreningsnyhet", rest: [] }];
  }
}

const hasPosts = async (category: string) => (await listPosts(category, 1)).total > 0;

async function load(params: Params) {
  const { categories } = await getSite();
  const category = categories.find((c) => c.slug === decodeURIComponent(params.slug));
  const page = pageNumber(params.rest);
  // An empty category is a page with nothing on it: 404 rather than a thin page.
  if (!category || !page || !(await hasPosts(category.slug))) return null;
  if (page > (await archivePageCount(category.slug))) return null;
  return { category, page };
}

export async function generateMetadata({ params }: PageProps<"/category/[slug]/[[...rest]]">): Promise<Metadata> {
  const p = await params;
  // Old WordPress pagination (/page/N/) moved to /sida/N/.
  if (p.rest?.[0] === "page" && pageNumber(p.rest)) permanentRedirect(`/category/${p.slug}/sida/${p.rest[1]}/`);
  const found = await load(p);
  // Thrown here, before the page streams, so the response really is a 404.
  if (!found) notFound();
  const { settings } = await getSite();
  const suffix = found.page > 1 ? ` – sida ${found.page}` : "";
  return buildMetadata({
    settings,
    // Prefixed so it doesn't clash with a page of the same name (/socialdans/ vs /category/socialdans/).
    title: `Kategori: ${found.category.name}${suffix}`,
    description: `Nyheter i kategorin ${found.category.name} från ${settings.siteName}.${found.page > 1 ? ` Sida ${found.page}.` : ""}`,
    path: `/category/${found.category.slug}/${found.page > 1 ? `sida/${found.page}/` : ""}`,
    markdown: false,
  });
}

export default async function CategoryPage({ params }: PageProps<"/category/[slug]/[[...rest]]">) {
  const found = await load(await params);
  if (!found) notFound();
  const { category, page } = found;
  const base = `/category/${category.slug}/`;
  const crumbs = [{ name: "Nyheter", path: "/nyheter/" }, { name: category.name, path: base }, ...(page > 1 ? [{ name: `Sida ${page}`, path: `${base}sida/${page}/` }] : [])];
  return <PostArchive title={`${category.name}${page > 1 ? ` – sida ${page}` : ""}`} category={category.slug} page={page} basePath={base} crumbs={crumbs} />;
}
