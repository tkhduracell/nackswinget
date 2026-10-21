import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { PageView } from "@/components/views/PageView";
import { PostView } from "@/components/views/PostView";
import { getPage, getPost, getRedirect, getSite, listAllPosts, listPages } from "@/lib/content/cached";
import { buildMetadata, ogImageFor, pageUrl, sectionsText } from "@/lib/seo";
import { docToText } from "@/lib/import/html";

type Params = { slug?: string[] };

function pathOf(params: Params): string {
  return (params.slug ?? []).map((s) => decodeURIComponent(s)).join("/").toLowerCase();
}

// Every known path is prerendered via generateStaticParams; anything else is a
// redirect or 404, so blocking (instead of a streamed shell) is fine here.
export const instant = false;

export async function generateStaticParams(): Promise<Params[]> {
  try {
    const [pages, posts] = await Promise.all([listPages(), listAllPosts()]);
    console.log(`generateStaticParams: ${pages.length} pages, ${posts.length} posts`);
    if (pages.length === 0) return [{ slug: [] }];
    return [
      ...pages.map((p) => ({ slug: p.path ? p.path.split("/") : [] })),
      ...posts.map((p) => ({ slug: [p.slug] })),
    ];
  } catch (e) {
    // No content store reachable at build time: render everything on first request.
    console.warn(`generateStaticParams: ${(e as Error).message}`);
    return [{ slug: [] }];
  }
}

async function resolve(path: string) {
  const page = await getPage(path);
  if (page) return { kind: "page" as const, page };
  if (!path.includes("/")) {
    const post = await getPost(path);
    if (post) return { kind: "post" as const, post };
  }
  return null;
}

export async function generateMetadata({ params }: PageProps<"/[[...slug]]">): Promise<Metadata> {
  const path = pathOf(await params);
  const [{ settings }, found] = await Promise.all([getSite(), resolve(path)]);
  if (!found) return {};
  if (found.kind === "page") {
    const p = found.page;
    const title = p.seo.title || (p.path ? p.title : settings.siteName);
    return {
      ...buildMetadata({
        settings,
        title,
        description: p.seo.description || sectionsText(p.sections),
        path: pageUrl(p),
        image: p.seo.image || ogImageFor(title),
      }),
      ...(p.path ? {} : { title: { absolute: `${settings.siteName} – ${settings.tagline}` } }),
    };
  }
  const post = found.post;
  return buildMetadata({
    settings,
    title: post.seo.title || post.title,
    description: post.seo.description || post.excerpt || docToText(post.body),
    path: `/${post.slug}/`,
    image: post.seo.image || ogImageFor(post.title, post.image),
    type: "article",
    publishedTime: post.publishedAt,
    modifiedTime: post.updatedAt,
  });
}

export default async function CatchAll({ params }: PageProps<"/[[...slug]]">) {
  const path = pathOf(await params);
  const found = await resolve(path);
  if (!found) {
    const redirect = await getRedirect(path);
    if (redirect) permanentRedirect(redirect.to);
    notFound();
  }
  if (found.kind === "page") return <PageView page={found.page} />;
  return <PostView post={found.post} />;
}
