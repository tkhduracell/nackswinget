import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Sections } from "@/components/sections/Sections";
import { getPage, getSite } from "@/lib/content/cached";

export const metadata: Metadata = { title: "Sida för storbild", robots: { index: false, follow: false } };

// A site page at TV size (the "Sida" block), ?path=om-oss/styrelse.
// No header, footer or links; whatever doesn't fit the screen is cut off.
export default function StorbildPage({ searchParams }: PageProps<"/storbild/sida">) {
  return (
    <main className="bs-content">
      <Suspense>
        <PageScreen searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function PageScreen({ searchParams }: { searchParams: PageProps<"/storbild/sida">["searchParams"] }) {
  const { path } = await searchParams;
  const [page, { settings }] = await Promise.all([getPage(typeof path === "string" ? path : ""), getSite()]);
  if (!page) notFound();
  const env = { feeds: settings.calendarFeeds, siteUrl: settings.siteUrl, siteName: settings.siteName, idPrefix: `bs-${page.id}` };
  return (
    <article className="bs-page">
      <h1>{page.title}</h1>
      <Sections sections={page.sections} env={env} prefix="bs" />
    </article>
  );
}
