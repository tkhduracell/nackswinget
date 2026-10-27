import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { archivePageCount, PostArchive } from "@/components/views/PostArchive";
import { getSite } from "@/lib/content/cached";
import { buildMetadata } from "@/lib/seo";

// Every known path is prerendered via generateStaticParams; anything else is a
// redirect or 404, so blocking (instead of a streamed shell) is fine here.
export const instant = false;

export async function generateStaticParams() {
  try {
    const n = await archivePageCount();
    // Cache Components needs at least one param; page 2 404s if it doesn't exist.
    return Array.from({ length: Math.max(1, n - 1) }, (_, i) => ({ n: String(i + 2) }));
  } catch {
    return [{ n: "2" }];
  }
}

export async function generateMetadata({ params }: PageProps<"/nyheter/sida/[n]">): Promise<Metadata> {
  const n = Number((await params).n);
  if (!Number.isInteger(n) || n < 2 || n > (await archivePageCount())) notFound();
  const { settings } = await getSite();
  return buildMetadata({
    settings,
    title: `Nyheter – sida ${n}`,
    description: `Äldre nyheter från ${settings.siteName}, sida ${n}.`,
    path: `/nyheter/sida/${n}/`,
    markdown: false,
  });
}

export default async function NewsPage({ params }: PageProps<"/nyheter/sida/[n]">) {
  const n = Number((await params).n);
  if (!Number.isInteger(n) || n < 2 || n > (await archivePageCount())) notFound();
  return (
    <PostArchive
      title={`Nyheter – sida ${n}`}
      page={n}
      basePath="/nyheter/"
      crumbs={[
        { name: "Nyheter", path: "/nyheter/" },
        { name: `Sida ${n}`, path: `/nyheter/sida/${n}/` },
      ]}
    />
  );
}
